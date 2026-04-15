import os
import re
import uuid
import csv
import io
import json
import logging
from pathlib import Path
from typing import List, Optional

from fastapi.concurrency import run_in_threadpool
from fastapi import Request
from fastapi.responses import JSONResponse

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from app.config import STORAGE_BASE, ADMIN_PASSWORD

import aiofiles
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from app.models import (
    Participant,
    LinkedInSearchResult,
    ProcessingStatus,
    Cohort,
)
from app import linkedin as li
from app import face_engine as fe
from app import cohorts as co

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Facematch 30X", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

processing_jobs: dict = {}
csv_import_jobs: dict = {}

TEMP_DIR = STORAGE_BASE / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# ── Auth middleware ────────────────────────────────────────────────
# Routes accessible without a key (participant portal + health check)
_PUBLIC_RE = re.compile(
    r"^(/api/health$"
    r"|/api/portal/"
    r"|/api/cohorts/[^/]+/portal-info$"
    r"|/api/events/[^/]+/match-selfie$"
    r"|/api/events/[^/]+/add-photos$"
    r"|/api/events/[^/]+/info$"
    r"|/api/events/[^/]+/photo/[^/]+$"
    r"|/docs|/openapi\.json|/redoc)"
)

@app.middleware("http")
async def admin_auth(request: Request, call_next):
    if not ADMIN_PASSWORD or _PUBLIC_RE.match(request.url.path):
        return await call_next(request)
    if request.headers.get("x-admin-key") != ADMIN_PASSWORD:
        return JSONResponse({"detail": "No autorizado"}, status_code=401)
    return await call_next(request)


# ═══════════════════════════════════════════════════════════════════
# COHORTS
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/cohorts", response_model=List[Cohort])
async def list_cohorts():
    raw = co.list_cohorts()
    result = []
    for c in raw:
        # Compute live stats from associated events
        event_ids = c.get("event_ids", [])
        total_matched_photos = 0
        total_matched_participants = 0
        for eid in event_ids:
            rp = fe.RESULTS_DIR / eid / "result.json"
            if rp.exists():
                with open(rp) as f:
                    d = json.load(f)
                total_matched_photos += d.get("total_photos", 0)
                total_matched_participants += d.get("indexed_faces", 0)
        result.append(Cohort(
            id=c["id"],
            name=c["name"],
            program=c.get("program"),
            description=c.get("description"),
            cover_color=c.get("cover_color"),
            created_at=c["created_at"],
            event_count=len(event_ids),
            matched_photos=total_matched_photos,
            matched_participants=total_matched_participants,
        ))
    return result


@app.post("/api/cohorts", response_model=Cohort)
async def create_cohort(
    name: str = Form(...),
    program: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
):
    meta = co.create_cohort(name, program, description)
    return Cohort(
        id=meta["id"],
        name=meta["name"],
        program=meta.get("program"),
        description=meta.get("description"),
        cover_color=meta.get("cover_color"),
        created_at=meta["created_at"],
    )


@app.get("/api/cohorts/{cohort_id}", response_model=Cohort)
async def get_cohort(cohort_id: str):
    c = co.get_cohort(cohort_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cohort not found")
    return Cohort(**{k: c[k] for k in Cohort.model_fields if k in c})


@app.delete("/api/cohorts/{cohort_id}")
async def delete_cohort(cohort_id: str):
    ok = co.delete_cohort(cohort_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Cohort not found")
    return {"ok": True}


@app.get("/api/cohorts/{cohort_id}/events")
async def get_cohort_events(cohort_id: str):
    """Return all events (with results) belonging to a cohort."""
    c = co.get_cohort(cohort_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cohort not found")
    events = []
    for eid in c.get("event_ids", []):
        rp = fe.RESULTS_DIR / eid / "result.json"
        if rp.exists():
            with open(rp) as f:
                d = json.load(f)
            status_obj = processing_jobs.get(eid)
            events.append({
                "event_id": eid,
                "event_name": d.get("event_name", eid),
                "status": status_obj.status if status_obj else "done",
                "total_photos": d.get("total_photos", 0),
                "indexed_faces": d.get("indexed_faces", 0),
                "created_at": d.get("created_at", ""),
            })
        else:
            status_obj = processing_jobs.get(eid)
            if status_obj:
                events.append({
                    "event_id": eid,
                    "event_name": status_obj.event_name or eid,
                    "status": status_obj.status,
                    "total_photos": status_obj.total_photos,
                    "indexed_faces": 0,
                    "created_at": "",
                })
    return events


# ═══════════════════════════════════════════════════════════════════
# PARTICIPANTS
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/participants", response_model=List[Participant])
async def get_participants():
    raw = fe.list_participants()
    result = []
    for p in raw:
        ref = fe.get_reference_photo_path(p["id"])
        result.append(Participant(
            id=p["id"],
            name=p["name"],
            phone=p.get("phone"),
            company=p.get("company"),
            linkedin_url=p.get("linkedin_url"),
            photo_path=str(ref) if ref else None,
            has_reference_photo=ref is not None,
        ))
    return result


@app.post("/api/participants", response_model=Participant)
async def create_participant(
    name: str = Form(...),
    phone: Optional[str] = Form(None),
    company: Optional[str] = Form(None),
    linkedin_url: Optional[str] = Form(None),
):
    participant_id = str(uuid.uuid4())
    meta = {
        "id": participant_id,
        "name": name,
        "phone": phone,
        "company": company,
        "linkedin_url": linkedin_url,
    }
    fe.save_participant_meta(participant_id, meta)
    return Participant(id=participant_id, name=name, phone=phone, company=company,
                       linkedin_url=linkedin_url, has_reference_photo=False)


@app.delete("/api/participants/{participant_id}")
async def delete_participant(participant_id: str):
    ok = fe.delete_participant(participant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Participant not found")
    return {"ok": True}


@app.post("/api/participants/{participant_id}/photo")
async def upload_reference_photo(participant_id: str, file: UploadFile = File(...)):
    meta = fe.load_participant_meta(participant_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Participant not found")
    ext = Path(file.filename).suffix.lower() or ".jpg"
    dest = fe.get_participant_dir(participant_id) / f"reference{ext}"
    async with aiofiles.open(dest, "wb") as f:
        content = await file.read()
        await f.write(content)
    fe.invalidate_embedding(participant_id)
    return {"ok": True, "photo_url": f"/api/participants/{participant_id}/photo"}


@app.get("/api/participants/{participant_id}/photo")
async def get_reference_photo(participant_id: str):
    ref = fe.get_reference_photo_path(participant_id)
    if not ref:
        raise HTTPException(status_code=404, detail="No reference photo")
    return FileResponse(str(ref))


# ═══════════════════════════════════════════════════════════════════
# LINKEDIN
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/linkedin/search", response_model=List[LinkedInSearchResult])
async def search_linkedin(name: str, company: Optional[str] = None):
    return await li.search_linkedin_google(name, company)


@app.post("/api/participants/{participant_id}/linkedin-photo")
async def fetch_linkedin_photo(participant_id: str, linkedin_url: str = Form(...)):
    meta = fe.load_participant_meta(participant_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Participant not found")
    pic_url = await li.get_profile_pic_url(linkedin_url)
    if not pic_url:
        raise HTTPException(status_code=422, detail=(
            "Could not extract profile picture. Profile may be private. "
            "Please upload a photo manually instead."
        ))
    dest = fe.get_participant_dir(participant_id) / "reference.jpg"
    ok = await li.download_image(pic_url, str(dest))
    if not ok:
        raise HTTPException(status_code=422, detail="Could not download the profile picture.")
    meta["linkedin_url"] = linkedin_url
    fe.save_participant_meta(participant_id, meta)
    fe.invalidate_embedding(participant_id)
    return {"ok": True, "photo_url": f"/api/participants/{participant_id}/photo"}


# ═══════════════════════════════════════════════════════════════════
# CSV IMPORT  (name + phone + company + linkedin_url)
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/participants/csv-template")
async def download_csv_template():
    content = (
        "nombre,telefono,empresa,linkedin_url\n"
        "María García,+52 55 1234 5678,30X,\n"
        "John Smith,+1 415 555 0100,Acme,https://linkedin.com/in/johnsmith\n"
    )
    return StreamingResponse(
        io.StringIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=participants_template.csv"},
    )


@app.post("/api/participants/import-csv")
async def import_participants_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    content = await file.read()
    text = content.decode("utf-8-sig")
    # Auto-detect delimiter (Excel en español usa punto y coma)
    try:
        dialect = csv.Sniffer().sniff(text[:2048], delimiters=",;\t|")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","
    reader = csv.DictReader(io.StringIO(text), dialect=csv.excel, delimiter=delimiter)

    rows = []
    for row in reader:
        name = (row.get("Nombre") or row.get("nombre") or row.get("name") or row.get("Name") or "").strip()
        if not name:
            continue
        rows.append({
            "name": name,
            "phone": (row.get("Teléfono") or row.get("Telefono") or row.get("teléfono") or row.get("telefono") or row.get("phone") or row.get("Phone") or "").strip() or None,
            "company": (row.get("Empresa") or row.get("empresa") or row.get("company") or row.get("Company") or "").strip() or None,
            "linkedin_url": (row.get("linkedin_url") or row.get("LinkedIn") or row.get("linkedin") or "").strip() or None,
        })

    if not rows:
        raise HTTPException(status_code=400, detail="El CSV no tiene filas válidas. Asegúrate de que tenga una columna 'nombre' o 'name'.")

    import_id = str(uuid.uuid4())
    participant_ids = []
    for row in rows:
        pid = str(uuid.uuid4())
        meta = {"id": pid, "name": row["name"], "phone": row["phone"],
                "company": row["company"], "linkedin_url": row["linkedin_url"]}
        fe.save_participant_meta(pid, meta)
        participant_ids.append(pid)

    csv_import_jobs[import_id] = [
        {
            "participant_id": participant_ids[i],
            "name": rows[i]["name"],
            "phone": rows[i].get("phone"),
            "company": rows[i].get("company"),
            "linkedin_url": rows[i].get("linkedin_url"),
            "status": "pending",
            "message": "",
        }
        for i in range(len(rows))
    ]

    background_tasks.add_task(_process_csv_import, import_id, rows, participant_ids)
    return {"import_id": import_id, "total": len(rows)}


def _process_csv_import(import_id: str, rows: list, participant_ids: list):
    import asyncio

    async def _run():
        sem = asyncio.Semaphore(3)

        async def process_one(i, row, pid):
            async with sem:
                job = csv_import_jobs[import_id][i]
                linkedin_url = row.get("linkedin_url")

                if not linkedin_url:
                    job["status"] = "searching"
                    job["message"] = "Searching LinkedIn..."
                    try:
                        results = await li.search_linkedin_google(row["name"], row.get("company"))
                        if results:
                            linkedin_url = results[0].linkedin_url
                            meta = fe.load_participant_meta(pid)
                            if meta:
                                meta["linkedin_url"] = linkedin_url
                                fe.save_participant_meta(pid, meta)
                        else:
                            job["status"] = "needs_photo"
                            job["message"] = "Not found on LinkedIn — upload photo manually"
                            return
                    except Exception:
                        job["status"] = "needs_photo"
                        job["message"] = "LinkedIn search failed — upload photo manually"
                        return

                job["status"] = "downloading"
                job["message"] = "Fetching profile photo..."
                try:
                    pic_url = await li.get_profile_pic_url(linkedin_url)
                    if not pic_url:
                        job["status"] = "needs_photo"
                        job["message"] = "Profile photo not accessible — upload manually"
                        return
                    dest = fe.get_participant_dir(pid) / "reference.jpg"
                    ok = await li.download_image(pic_url, str(dest))
                    if ok:
                        fe.invalidate_embedding(pid)
                        job["status"] = "done"
                        job["message"] = "Photo fetched from LinkedIn"
                    else:
                        job["status"] = "needs_photo"
                        job["message"] = "Could not download photo — upload manually"
                except Exception as e:
                    job["status"] = "needs_photo"
                    job["message"] = f"Error — upload photo manually"

        await asyncio.gather(*[process_one(i, rows[i], participant_ids[i]) for i in range(len(rows))])

    asyncio.run(_run())


@app.get("/api/participants/import-csv/{import_id}")
async def get_csv_import_status(import_id: str):
    if import_id not in csv_import_jobs:
        raise HTTPException(status_code=404, detail="Import job not found")
    rows = csv_import_jobs[import_id]
    done_count = sum(1 for r in rows if r["status"] in ("done", "needs_photo", "failed"))
    return {
        "import_id": import_id,
        "total": len(rows),
        "completed": done_count,
        "finished": done_count == len(rows),
        "rows": rows,
    }


# ═══════════════════════════════════════════════════════════════════
# EVENTS & FACE MATCHING
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/events/upload")
async def upload_event_photos(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    event_name: Optional[str] = Form(None),
    cohort_id: Optional[str] = Form(None),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    if cohort_id:
        c = co.get_cohort(cohort_id)
        if not c:
            raise HTTPException(status_code=404, detail="Cohort not found")

    event_id = str(uuid.uuid4())
    is_zip = len(files) == 1 and files[0].filename.lower().endswith(".zip")

    if is_zip:
        zip_path = TEMP_DIR / f"{event_id}.zip"
        async with aiofiles.open(zip_path, "wb") as f:
            content = await files[0].read()
            await f.write(content)
        upload_label = files[0].filename

        resolved_name = event_name or files[0].filename.replace(".zip", "")
        processing_jobs[event_id] = ProcessingStatus(
            event_id=event_id, event_name=resolved_name, status="pending",
            total_photos=0, processed_photos=0,
            message=f"Uploaded: {upload_label}",
        )
        if cohort_id:
            co.add_event_to_cohort(cohort_id, event_id)
        background_tasks.add_task(
            process_event, event_id, str(zip_path), resolved_name, cohort_id,
        )
    else:
        # Individual image files — save directly to event dir
        event_dir = fe.EVENTS_DIR / event_id
        event_dir.mkdir(parents=True, exist_ok=True)
        image_paths = []
        for upload in files:
            ext = Path(upload.filename).suffix.lower()
            if ext not in fe.SUPPORTED_EXTENSIONS:
                continue
            dest = event_dir / f"{uuid.uuid4()}{ext}"
            async with aiofiles.open(dest, "wb") as f:
                content = await upload.read()
                await f.write(content)
            image_paths.append(dest)

        if not image_paths:
            raise HTTPException(status_code=400, detail="No valid image files found.")

        upload_label = f"{len(image_paths)} foto(s)"
        resolved_name = event_name or "Evento"
        processing_jobs[event_id] = ProcessingStatus(
            event_id=event_id, event_name=resolved_name, status="pending",
            total_photos=len(image_paths), processed_photos=0,
            message=f"Uploaded: {upload_label}",
        )
        if cohort_id:
            co.add_event_to_cohort(cohort_id, event_id)
        background_tasks.add_task(
            process_event_images, event_id, image_paths,
            resolved_name,
            cohort_id,
        )

    return {"event_id": event_id, "status": "pending"}


def process_event(event_id: str, zip_path: str, event_name: str, cohort_id: Optional[str]):
    from datetime import datetime, timezone
    try:
        processing_jobs[event_id].status = "processing"
        processing_jobs[event_id].message = "Extracting photos..."

        event_dir, image_paths = fe.extract_zip(zip_path, event_id)
        total = len(image_paths)
        processing_jobs[event_id].total_photos = total
        processing_jobs[event_id].message = f"Processing {total} photos..."

        if total == 0:
            processing_jobs[event_id].status = "error"
            processing_jobs[event_id].message = "No images found in ZIP."
            return

        def status_cb(i, total, filename):
            processing_jobs[event_id].processed_photos = i
            processing_jobs[event_id].message = f"({i}/{total}) {filename}"

        result = fe.preprocess_event_faces(event_id, image_paths, status_callback=status_cb)

        result_meta = {
            "event_id": event_id,
            "event_name": event_name,
            "cohort_id": cohort_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "total_photos": result["total_photos"],
            "indexed_faces": result["indexed_faces"],
        }
        result_path = fe.RESULTS_DIR / event_id / "result.json"
        with open(result_path, "w") as f:
            json.dump(result_meta, f, indent=2)

        processing_jobs[event_id].status = "done"
        processing_jobs[event_id].processed_photos = total
        processing_jobs[event_id].message = (
            f"Listo. {result['total_photos']} fotos indexadas, "
            f"{result['indexed_faces']} caras detectadas."
        )
        Path(zip_path).unlink(missing_ok=True)

    except Exception as e:
        logger.exception(f"Error processing event {event_id}")
        processing_jobs[event_id].status = "error"
        processing_jobs[event_id].message = str(e)


def process_event_images(event_id: str, image_paths: list, event_name: str, cohort_id: Optional[str]):
    from datetime import datetime, timezone
    try:
        processing_jobs[event_id].status = "processing"
        total = len(image_paths)
        processing_jobs[event_id].total_photos = total
        processing_jobs[event_id].message = f"Processing {total} photos..."

        def status_cb(i, total, filename):
            processing_jobs[event_id].processed_photos = i
            processing_jobs[event_id].message = f"({i}/{total}) {filename}"

        result = fe.preprocess_event_faces(event_id, image_paths, status_callback=status_cb)

        result_meta = {
            "event_id": event_id,
            "event_name": event_name,
            "cohort_id": cohort_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "total_photos": result["total_photos"],
            "indexed_faces": result["indexed_faces"],
        }
        result_path = fe.RESULTS_DIR / event_id / "result.json"
        with open(result_path, "w") as f:
            json.dump(result_meta, f, indent=2)

        processing_jobs[event_id].status = "done"
        processing_jobs[event_id].processed_photos = total
        processing_jobs[event_id].message = (
            f"Listo. {result['total_photos']} fotos indexadas, "
            f"{result['indexed_faces']} caras detectadas."
        )
    except Exception as e:
        logger.exception(f"Error processing event images {event_id}")
        processing_jobs[event_id].status = "error"
        processing_jobs[event_id].message = str(e)


@app.get("/api/events/{event_id}/status", response_model=ProcessingStatus)
async def get_event_status(event_id: str):
    if event_id not in processing_jobs:
        raise HTTPException(status_code=404, detail="Event not found")
    return processing_jobs[event_id]


@app.get("/api/events/{event_id}/results")
async def get_event_results(event_id: str):
    result_path = fe.RESULTS_DIR / event_id / "result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Results not ready yet")
    with open(result_path) as f:
        data = json.load(f)
    return {
        "event_id": event_id,
        "event_name": data.get("event_name", event_id),
        "cohort_id": data.get("cohort_id"),
        "total_photos": data.get("total_photos", 0),
        "indexed_faces": data.get("indexed_faces", 0),
        "created_at": data.get("created_at", ""),
    }


@app.get("/api/events/{event_id}/download/{participant_id}")
async def download_participant_photos(event_id: str, participant_id: str):
    zip_path = fe.create_result_zip(event_id, participant_id)
    if not zip_path:
        raise HTTPException(status_code=404, detail="No matched photos found")
    participants = {p["id"]: p for p in fe.list_participants()}
    name = participants.get(participant_id, {}).get("name", participant_id)
    return FileResponse(path=str(zip_path), filename=f"{name.replace(' ','_')}_photos.zip",
                        media_type="application/zip")


@app.get("/api/events/{event_id}/download-all")
async def download_all_results(event_id: str):
    zip_path = fe.create_full_result_zip(event_id)
    if not zip_path:
        raise HTTPException(status_code=404, detail="No results found")
    return FileResponse(path=str(zip_path), filename="facematch_results.zip",
                        media_type="application/zip")


@app.get("/api/events/{event_id}/manifest")
async def download_manifest(event_id: str):
    """Export a CSV with all participants and their reference photo status."""
    result_path = fe.RESULTS_DIR / event_id / "result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Results not ready yet")

    with open(result_path) as f:
        data = json.load(f)

    participants = fe.list_participants()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "phone", "company", "has_reference_photo"])
    for p in participants:
        writer.writerow([
            p.get("name", ""),
            p.get("phone", ""),
            p.get("company", ""),
            "si" if fe.get_reference_photo_path(p["id"]) else "no",
        ])
    output.seek(0)

    event_name = data.get("event_name", event_id).replace(" ", "_")
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={event_name}_participantes.csv"},
    )


@app.delete("/api/events/{event_id}")
async def delete_event(event_id: str):
    import shutil
    result_path = fe.RESULTS_DIR / event_id / "result.json"
    cohort_id = None
    if result_path.exists():
        with open(result_path) as f:
            data = json.load(f)
        cohort_id = data.get("cohort_id")

    if cohort_id:
        co.remove_event_from_cohort(cohort_id, event_id)

    results_dir = fe.RESULTS_DIR / event_id
    if results_dir.exists():
        shutil.rmtree(results_dir)

    events_dir = fe.RESULTS_DIR.parent / "events" / event_id
    if events_dir.exists():
        shutil.rmtree(events_dir)

    processing_jobs.pop(event_id, None)
    return {"ok": True}


@app.get("/api/events")
async def list_events():
    events = []
    if fe.RESULTS_DIR.exists():
        for d in sorted(fe.RESULTS_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if d.is_dir():
                rp = d / "result.json"
                if rp.exists():
                    with open(rp) as f:
                        data = json.load(f)
                    status = processing_jobs.get(d.name)
                    events.append({
                        "event_id": d.name,
                        "event_name": data.get("event_name", d.name),
                        "cohort_id": data.get("cohort_id"),
                        "status": status.status if status else "done",
                        "total_photos": data.get("total_photos", 0),
                        "indexed_faces": data.get("indexed_faces", 0),
                        "created_at": data.get("created_at", ""),
                    })
    return events


# ═══════════════════════════════════════════════════════════════════
# PORTAL (public — no auth required)
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/portal/cohorts")
async def list_portal_cohorts():
    """Public: list all cohorts that have at least one processed event."""
    raw = co.list_cohorts()
    result = []
    for c in raw:
        event_ids = c.get("event_ids", [])
        total_photos = 0
        for eid in event_ids:
            rp = fe.RESULTS_DIR / eid / "result.json"
            if rp.exists():
                with open(rp) as f:
                    d = json.load(f)
                total_photos += d.get("total_photos", 0)
        result.append({
            "cohort_id": c["id"],
            "cohort_name": c["name"],
            "program": c.get("program"),
            "cover_color": c.get("cover_color"),
            "total_photos": total_photos,
            "event_count": len([e for e in event_ids if (fe.RESULTS_DIR / e / "result.json").exists()]),
        })
    return result


@app.get("/api/cohorts/{cohort_id}/portal-info")
async def get_cohort_portal_info(cohort_id: str):
    """Public endpoint: cohort info + event list for the participant portal."""
    c = co.get_cohort(cohort_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cohort no encontrado")
    events = []
    for eid in c.get("event_ids", []):
        rp = fe.RESULTS_DIR / eid / "result.json"
        if rp.exists():
            with open(rp) as f:
                d = json.load(f)
            events.append({
                "event_id": eid,
                "event_name": d.get("event_name", eid),
                "total_photos": d.get("total_photos", 0),
            })
    return {
        "cohort_id": cohort_id,
        "cohort_name": c["name"],
        "program": c.get("program"),
        "events": events,
    }


@app.get("/api/events/{event_id}/photos")
async def list_event_photos(event_id: str):
    """List all photo filenames for an event."""
    event_dir = fe.EVENTS_DIR / event_id
    if not event_dir.exists():
        return {"photos": []}
    photos = sorted([p.name for p in event_dir.iterdir() if fe._is_image(p)])
    return {"photos": photos}


@app.delete("/api/events/{event_id}/photo/{filename}")
async def delete_event_photo(event_id: str, filename: str):
    """Delete a single photo from an event and remove it from the face index."""
    safe_name = Path(filename).name
    photo_path = fe.EVENTS_DIR / event_id / safe_name
    if not photo_path.exists():
        raise HTTPException(status_code=404, detail="Foto no encontrada")

    photo_path.unlink()

    # Remove from face_index.json
    index_path = fe.RESULTS_DIR / event_id / "face_index.json"
    if index_path.exists():
        with open(index_path) as f:
            data = json.load(f)
        data["index"].pop(safe_name, None)
        data["photo_count"] = max(0, data.get("photo_count", 1) - 1)
        with open(index_path, "w") as f:
            json.dump(data, f)

    # Update result.json stats
    result_path = fe.RESULTS_DIR / event_id / "result.json"
    if result_path.exists():
        with open(result_path) as f:
            result = json.load(f)
        result["total_photos"] = max(0, result.get("total_photos", 1) - 1)
        result["indexed_faces"] = sum(len(v) for v in data["index"].values()) if index_path.exists() else 0
        with open(result_path, "w") as f:
            json.dump(result, f, indent=2)

    return {"ok": True}


@app.get("/api/events/{event_id}/info")
async def get_event_info(event_id: str):
    """Public endpoint: returns basic event info for the participant portal."""
    result_path = fe.RESULTS_DIR / event_id / "result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Evento no encontrado o aún procesando")
    with open(result_path) as f:
        data = json.load(f)
    return {
        "event_id": event_id,
        "event_name": data.get("event_name", event_id),
        "total_photos": data.get("total_photos", 0),
        "indexed_faces": data.get("indexed_faces", 0),
    }


@app.post("/api/events/{event_id}/match-selfie")
async def match_selfie(
    event_id: str,
    file: UploadFile = File(...),
    threshold: Optional[float] = Form(None),
):
    """Public endpoint: participant uploads a selfie, gets back matched photo filenames."""
    result_path = fe.RESULTS_DIR / event_id / "result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Evento no encontrado o aún procesando")

    # Clamp threshold to a safe range to avoid abuse
    if threshold is not None:
        threshold = max(0.30, min(0.80, threshold))

    selfie_id = str(uuid.uuid4())
    ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    if ext not in fe.SUPPORTED_EXTENSIONS:
        ext = ".jpg"
    selfie_path = TEMP_DIR / f"selfie_{selfie_id}{ext}"
    async with aiofiles.open(selfie_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    try:
        matched = await run_in_threadpool(
            fe.match_selfie_to_event, event_id, str(selfie_path), threshold
        )
    except Exception as e:
        logger.exception(f"Error matching selfie for event {event_id}")
        matched = []
    finally:
        selfie_path.unlink(missing_ok=True)

    return {"matched_photos": matched, "count": len(matched)}


@app.get("/api/events/{event_id}/photo/{filename}")
async def get_event_photo(event_id: str, filename: str):
    """Public endpoint: serve an individual event photo by filename."""
    safe_filename = Path(filename).name  # prevent path traversal
    photo_path = fe.EVENTS_DIR / event_id / safe_filename
    if not photo_path.exists():
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    return FileResponse(str(photo_path))


@app.post("/api/events/{event_id}/add-photos")
async def add_photos_to_event(
    event_id: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
):
    """Public endpoint: participant adds their own photos to the event pool."""
    result_path = fe.RESULTS_DIR / event_id / "result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    event_dir = fe.EVENTS_DIR / event_id
    event_dir.mkdir(parents=True, exist_ok=True)

    saved_paths = []
    for upload in files:
        ext = Path(upload.filename).suffix.lower() or ".jpg"
        if ext not in fe.SUPPORTED_EXTENSIONS:
            continue
        dest = event_dir / f"{uuid.uuid4()}{ext}"
        async with aiofiles.open(dest, "wb") as f:
            content = await upload.read()
            await f.write(content)
        saved_paths.append(dest)

    if saved_paths:
        background_tasks.add_task(fe.add_photos_to_index, event_id, saved_paths)

    return {"added": len(saved_paths)}


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": fe.MODEL_NAME, "auth_required": bool(ADMIN_PASSWORD)}
