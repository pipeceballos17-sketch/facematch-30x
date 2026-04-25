import os
import re
import uuid
import csv
import io
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

csv_import_jobs: dict = {}

TEMP_DIR = STORAGE_BASE / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# ── Auth middleware ────────────────────────────────────────────────
# Routes accessible without a key (participant portal + health check)
_PUBLIC_RE = re.compile(
    r"^(/api/health$"
    r"|/api/portal/"
    r"|/api/cohorts/[^/]+/portal-info$"
    r"|/api/cohorts/[^/]+/match-selfie$"
    r"|/api/cohorts/[^/]+/download-selection$"
    r"|/api/cohorts/[^/]+/photo/[^/]+$"
    r"|/docs|/openapi\.json|/redoc)"
)

@app.middleware("http")
async def admin_auth(request: Request, call_next):
    # Let CORS preflight requests through so CORSMiddleware can handle them
    if request.method == "OPTIONS":
        return await call_next(request)
    if not ADMIN_PASSWORD or _PUBLIC_RE.match(request.url.path):
        return await call_next(request)
    if request.headers.get("x-admin-key") != ADMIN_PASSWORD:
        return JSONResponse(
            {"detail": "No autorizado"},
            status_code=401,
            headers={"Access-Control-Allow-Origin": "*"},
        )
    return await call_next(request)


# ═══════════════════════════════════════════════════════════════════
# COHORTS
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/cohorts", response_model=List[Cohort])
async def list_cohorts():
    raw = co.list_cohorts()
    result = []
    for c in raw:
        s = co.stats(c["id"])
        result.append(Cohort(
            id=c["id"],
            name=c["name"],
            program=c.get("program"),
            description=c.get("description"),
            cover_color=c.get("cover_color"),
            created_at=c["created_at"],
            total_photos=s["total_photos"],
            indexed_faces=s["indexed_faces"],
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
    if not co.get_cohort(cohort_id):
        raise HTTPException(status_code=404, detail="Cohort not found")
    fe.delete_cohort_collection(cohort_id)
    co.delete_cohort(cohort_id)
    return {"ok": True}


# ── Cohort photo pool ─────────────────────────────────────────────

@app.get("/api/cohorts/{cohort_id}/photos")
async def list_cohort_photos(cohort_id: str):
    if not co.get_cohort(cohort_id):
        raise HTTPException(status_code=404, detail="Cohort not found")
    return {"photos": co.list_photo_filenames(cohort_id)}


# Per-cohort lock so concurrent /photos requests can't race the JSON write.
import asyncio as _asyncio
COHORT_LOCKS: dict = {}

def _cohort_lock(cohort_id: str) -> _asyncio.Lock:
    lock = COHORT_LOCKS.get(cohort_id)
    if lock is None:
        lock = _asyncio.Lock()
        COHORT_LOCKS[cohort_id] = lock
    return lock


@app.post("/api/cohorts/{cohort_id}/photos")
async def upload_cohort_photos(
    cohort_id: str,
    files: List[UploadFile] = File(...),
):
    """Append a batch of photos to a cohort's pool. Indexes each in parallel,
    then merges all results into face_index.json under a per-cohort lock so
    parallel requests can't corrupt the file."""
    import asyncio
    if not co.get_cohort(cohort_id):
        raise HTTPException(status_code=404, detail="Cohort not found")
    pdir = co.photos_dir(cohort_id)

    # Persist uploads to disk, streaming chunked writes to keep RAM low.
    saved: List[Path] = []
    for upload in files:
        ext = (Path(upload.filename or "").suffix or ".jpg").lower()
        if ext not in fe.SUPPORTED_EXTENSIONS:
            continue
        dest = pdir / f"{uuid.uuid4().hex}{ext}"
        async with aiofiles.open(dest, "wb") as f:
            while True:
                chunk = await upload.read(1024 * 1024)  # 1 MiB
                if not chunk:
                    break
                await f.write(chunk)
        saved.append(dest)

    # Index in parallel. Each call returns (safe_id, name, faces, err) and
    # does NOT touch face_index.json (that's done once below, under the lock).
    sem = asyncio.Semaphore(8)
    async def _index(p: Path):
        async with sem:
            return await run_in_threadpool(fe.index_photo_into_cohort, cohort_id, p)
    raw_results = await asyncio.gather(
        *[_index(p) for p in saved], return_exceptions=True
    )

    # Normalise into per-photo records.
    records = []
    first_error = None
    for p, r in zip(saved, raw_results):
        if isinstance(r, BaseException):
            records.append({"file": p.name, "faces": 0, "error": str(r)})
            if first_error is None:
                first_error = str(r)
        else:
            safe_id, original_name, faces, err = r
            records.append({
                "safe_id": safe_id, "name": original_name,
                "faces": faces, "error": err,
            })
            if err and first_error is None:
                first_error = err

    # Single serialised JSON write per request, per cohort.
    new_faces = sum(rec.get("faces", 0) for rec in records)
    async with _cohort_lock(cohort_id):
        idx = co.load_face_index(cohort_id)
        fmap = idx.setdefault("filename_map", {})
        for rec in records:
            if rec.get("safe_id"):
                fmap[rec["safe_id"]] = rec["name"]
        idx["indexed_faces"] = idx.get("indexed_faces", 0) + new_faces
        co.save_face_index(cohort_id, idx)

    failed = [rec["name"] if rec.get("name") else rec["file"]
              for rec in records if rec.get("error")]
    return {
        "saved": len(saved),
        "indexed_faces": new_faces,
        "failed": failed,
        "first_error": first_error,
    }


@app.post("/api/cohorts/{cohort_id}/reindex")
async def reindex_cohort(cohort_id: str):
    """Re-run Rekognition on every photo currently in the cohort pool.

    Used when photos are on disk but didn't get indexed (e.g. previous
    deploy hit the 5MB Rekognition limit). Wipes the existing collection
    so we start clean, then indexes every original on disk."""
    import asyncio
    if not co.get_cohort(cohort_id):
        raise HTTPException(status_code=404, detail="Cohort not found")

    # Drop and recreate the collection so stale ExternalImageIds don't linger.
    await run_in_threadpool(fe.delete_cohort_collection, cohort_id)
    pdir = co.photos_dir(cohort_id)
    paths = [p for p in pdir.iterdir()
             if p.is_file() and not p.name.endswith(".thumb.jpg")
             and fe._is_image(p)]

    sem = asyncio.Semaphore(8)
    async def _index(p):
        async with sem:
            return await run_in_threadpool(fe.index_photo_into_cohort, cohort_id, p)
    raw = await asyncio.gather(*[_index(p) for p in paths], return_exceptions=True)

    new_faces = 0
    fmap: dict = {}
    first_error = None
    failed = []
    for p, r in zip(paths, raw):
        if isinstance(r, BaseException):
            failed.append(p.name)
            if first_error is None: first_error = str(r)
        else:
            safe_id, name, faces, err = r
            fmap[safe_id] = name
            new_faces += faces
            if err:
                failed.append(name)
                if first_error is None: first_error = err

    async with _cohort_lock(cohort_id):
        idx = co.load_face_index(cohort_id)
        idx["filename_map"] = fmap
        idx["indexed_faces"] = new_faces
        co.save_face_index(cohort_id, idx)

    return {
        "reindexed": len(paths),
        "indexed_faces": new_faces,
        "failed": failed,
        "first_error": first_error,
    }


@app.delete("/api/cohorts/{cohort_id}/photo/{filename}")
async def delete_cohort_photo(cohort_id: str, filename: str):
    if not co.get_cohort(cohort_id):
        raise HTTPException(status_code=404, detail="Cohort not found")
    ok = await run_in_threadpool(fe.remove_photo_from_cohort, cohort_id, filename)
    if not ok:
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    return {"ok": True}


@app.get("/api/cohorts/{cohort_id}/photo/{filename}")
async def get_cohort_photo(
    cohort_id: str,
    filename: str,
    download: Optional[int] = 0,
    thumb: Optional[int] = 0,
):
    """Public: serve a cohort photo. ?thumb=1 = small JPEG, ?download=1 = attachment."""
    if not co.get_cohort(cohort_id):
        raise HTTPException(status_code=404, detail="Cohort no encontrado")
    safe = Path(filename).name
    photo_path = co.photos_dir(cohort_id) / safe
    if not photo_path.exists():
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    if thumb and not download:
        tp = fe.thumb_path_for(photo_path)
        if not tp.exists():
            generated = await run_in_threadpool(fe.make_thumbnail, photo_path)
            if generated and generated.exists():
                tp = generated
        if tp.exists():
            return FileResponse(
                str(tp),
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=31536000, immutable"},
            )
    if download:
        return FileResponse(
            str(photo_path),
            filename=safe,
            headers={"Content-Disposition": f'attachment; filename="{safe}"'},
        )
    return FileResponse(str(photo_path))


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
# PORTAL (public — cohort-pool only)
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/portal/cohorts")
async def list_portal_cohorts():
    """Public: list all cohorts that have at least one indexed photo."""
    raw = co.list_cohorts()
    result = []
    for c in raw:
        s = co.stats(c["id"])
        if s["total_photos"] == 0:
            continue
        result.append({
            "cohort_id": c["id"],
            "cohort_name": c["name"],
            "program": c.get("program"),
            "cover_color": c.get("cover_color"),
            "total_photos": s["total_photos"],
        })
    return result


@app.get("/api/cohorts/{cohort_id}/portal-info")
async def get_cohort_portal_info(cohort_id: str):
    c = co.get_cohort(cohort_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cohort no encontrado")
    s = co.stats(cohort_id)
    return {
        "cohort_id": cohort_id,
        "cohort_name": c["name"],
        "program": c.get("program"),
        "total_photos": s["total_photos"],
    }


@app.post("/api/cohorts/{cohort_id}/match-selfie")
async def match_selfie_in_cohort(
    cohort_id: str,
    file: UploadFile = File(...),
    threshold: Optional[float] = Form(None),
):
    """Public: search a selfie against the cohort's single Rekognition collection."""
    c = co.get_cohort(cohort_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cohort no encontrado")
    if threshold is not None:
        threshold = max(0.30, min(0.80, threshold))

    selfie_id = uuid.uuid4().hex
    ext = Path(file.filename or "").suffix.lower() or ".jpg"
    if ext not in fe.SUPPORTED_EXTENSIONS:
        ext = ".jpg"
    selfie_path = TEMP_DIR / f"selfie_{selfie_id}{ext}"
    async with aiofiles.open(selfie_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            await f.write(chunk)

    try:
        matched = await run_in_threadpool(
            fe.match_selfie_to_cohort, cohort_id, str(selfie_path), threshold
        )
    except Exception:
        logger.exception(f"Cohort selfie match failed for {cohort_id}")
        matched = []
    finally:
        selfie_path.unlink(missing_ok=True)

    return {"matched_photos": matched, "count": len(matched)}


@app.post("/api/cohorts/{cohort_id}/download-selection")
async def download_cohort_selection(cohort_id: str, payload: dict):
    """Public: stream a ZIP with the user-selected photos from the cohort pool."""
    import zipfile
    from io import BytesIO
    c = co.get_cohort(cohort_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cohort no encontrado")

    raw_selections = payload.get("selections") or []
    # Accept either ["filename", ...] or [{"filename": "..."}] for compatibility.
    filenames = []
    for sel in raw_selections:
        if isinstance(sel, str):
            filenames.append(Path(sel).name)
        elif isinstance(sel, dict) and sel.get("filename"):
            filenames.append(Path(sel["filename"]).name)

    if not filenames:
        # No selection provided → ZIP everything in the pool.
        filenames = co.list_photo_filenames(cohort_id)

    pdir = co.photos_dir(cohort_id)
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in filenames:
            src = pdir / fname
            if src.exists():
                zf.write(src, fname)
    buf.seek(0)
    safe_name = (c.get("name") or "fotos").replace(" ", "_")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_30X.zip"'},
    )


# ═══════════════════════════════════════════════════════════════════
# ADMIN
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/admin/wipe")
async def admin_wipe(confirm: str = Form(...)):
    """Destructive: clears all cohorts on disk + every Rekognition collection.
    Requires `confirm=YES_WIPE` to prevent accidents."""
    import shutil
    if confirm != "YES_WIPE":
        raise HTTPException(status_code=400, detail="Set confirm=YES_WIPE to proceed.")
    # Remove all on-disk data EXCEPT temp (which is just scratch space)
    for sub in ("cohorts", "events", "results", "participants"):
        d = STORAGE_BASE / sub
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
    (STORAGE_BASE / "cohorts").mkdir(parents=True, exist_ok=True)
    # Wipe Rekognition collections
    await run_in_threadpool(fe.wipe_all_rekognition_collections)
    return {"ok": True}


# ── Legacy event endpoints — return 410 so old clients fail fast and obviously
@app.post("/api/events/upload")
async def _deprecated_event_upload():
    raise HTTPException(status_code=410, detail="Eventos eliminados — usa POST /api/cohorts/{id}/photos")




@app.get("/api/health")
async def health():
    return {"status": "ok", "model": fe.MODEL_NAME, "auth_required": bool(ADMIN_PASSWORD)}


@app.get("/api/admin/storage-stats")
async def storage_stats():
    """Diagnostic: per-directory size on the Volume + total disk usage."""
    import shutil

    def folder_bytes(p: Path) -> int:
        if not p.exists():
            return 0
        total = 0
        for root, _, files in os.walk(p):
            for name in files:
                try:
                    total += (Path(root) / name).stat().st_size
                except OSError:
                    pass
        return total

    def fmt(n: int) -> str:
        for unit in ("B", "KB", "MB", "GB", "TB"):
            if n < 1024:
                return f"{n:.1f} {unit}"
            n /= 1024
        return f"{n:.1f} PB"

    base = STORAGE_BASE
    folders = {
        "events":       base / "events",
        "results":      base / "results",
        "participants": base / "participants",
        "temp":         base / "temp",
        "cohorts":      base / "cohorts",
    }
    breakdown = {}
    for name, path in folders.items():
        size = folder_bytes(path)
        breakdown[name] = {
            "bytes": size,
            "human": fmt(size),
            "exists": path.exists(),
            "path": str(path),
        }

    # Disk usage of the mount that holds STORAGE_BASE
    disk = shutil.disk_usage(str(base))
    return {
        "storage_base": str(base),
        "disk": {
            "total": fmt(disk.total),
            "used":  fmt(disk.used),
            "free":  fmt(disk.free),
            "pct_used": round(disk.used / disk.total * 100, 1) if disk.total else 0,
        },
        "by_folder": breakdown,
        "thumbnails_total": fmt(sum(
            (Path(r) / f).stat().st_size
            for r, _, files in os.walk(base / "events")
            for f in files if f.endswith(".thumb.jpg")
        )) if (base / "events").exists() else "0 B",
    }
