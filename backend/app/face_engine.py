"""
Face matching engine powered by AWS Rekognition.

Pipeline:
1. Admin uploads event photos → indexed into a Rekognition Collection (one per event).
2. Participant uploads a selfie → SearchFacesByImage against that collection.
3. Returns matching photo filenames instantly (~200ms).

No local ML models, no compiled C++ libraries, no OOM crashes.
"""

import re
import json
import zipfile
import shutil
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

from app.config import STORAGE_BASE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION

PARTICIPANTS_DIR = STORAGE_BASE / "participants"
EVENTS_DIR      = STORAGE_BASE / "events"
RESULTS_DIR     = STORAGE_BASE / "results"

for _d in [PARTICIPANTS_DIR, EVENTS_DIR, RESULTS_DIR]:
    _d.mkdir(parents=True, exist_ok=True)

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
MODEL_NAME  = "AWS Rekognition"
THRESHOLD   = 70   # % confidence — 70 is solid, 80 is strict


# ── AWS client (lazy) ──────────────────────────────────────────────

def _rek():
    import boto3
    return boto3.client(
        "rekognition",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
    )


# ── Helpers ────────────────────────────────────────────────────────

def _is_image(path: Path) -> bool:
    return path.suffix.lower() in SUPPORTED_EXTENSIONS


def _normalize_image(image_path: str):
    """Fix EXIF rotation + ensure RGB so Rekognition reads correctly.

    Skips the costly re-encode when the file is already a clean RGB JPEG with
    no EXIF rotation — saves ~5-10s of CPU per HD photo when there's nothing
    to fix (the common case).
    """
    try:
        from PIL import Image, ImageOps
        img = Image.open(image_path)
        original_size = img.size
        original_mode = img.mode
        original_format = (img.format or "").upper()

        rotated = ImageOps.exif_transpose(img)
        needs_rotate = rotated.size != original_size
        needs_convert = original_mode != "RGB"
        needs_format = original_format not in ("JPEG", "JPG")

        if not (needs_rotate or needs_convert or needs_format):
            return  # nothing to fix — skip the expensive save

        if needs_convert:
            rotated = rotated.convert("RGB")
        rotated.save(image_path, "JPEG", quality=95)
    except Exception as e:
        logger.warning(f"Could not normalize {image_path}: {e}")


THUMB_MAX_SIZE = 720  # px on the long edge — keeps grid sharp on retina

def thumb_path_for(photo_path: Path) -> Path:
    """Companion thumbnail file path for a given photo."""
    return photo_path.with_suffix(photo_path.suffix + ".thumb.jpg")


def make_thumbnail(photo_path: Path) -> Optional[Path]:
    """Generate a small JPEG thumbnail next to the original. Idempotent."""
    if not photo_path.exists():
        return None
    dest = thumb_path_for(photo_path)
    if dest.exists() and dest.stat().st_mtime >= photo_path.stat().st_mtime:
        return dest
    try:
        from PIL import Image, ImageOps
        img = Image.open(photo_path)
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((THUMB_MAX_SIZE, THUMB_MAX_SIZE))
        img.save(dest, "JPEG", quality=78, optimize=True, progressive=True)
        return dest
    except Exception as e:
        logger.warning(f"Could not generate thumbnail for {photo_path}: {e}")
        return None


def make_thumbnails_for_event(event_id: str):
    """Generate thumbnails for every photo in an event. Safe to re-run."""
    event_dir = EVENTS_DIR / event_id
    if not event_dir.exists():
        return
    for p in event_dir.iterdir():
        if p.is_file() and _is_image(p) and not p.name.endswith(".thumb.jpg"):
            make_thumbnail(p)


def _collection_id(event_id: str) -> str:
    """Rekognition collection IDs: alphanumeric + _ - , max 255 chars."""
    return f"fm-{event_id}"


def _safe_ext_id(filename: str) -> str:
    """ExternalImageId: alphanumeric + _ - . only, max 255 chars."""
    safe = re.sub(r"[^a-zA-Z0-9_\-.]", "_", filename)
    return safe[:255]


# ── Participant helpers (unchanged) ───────────────────────────────

def get_participant_dir(participant_id: str) -> Path:
    d = PARTICIPANTS_DIR / participant_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_participant_meta_path(participant_id: str) -> Path:
    return PARTICIPANTS_DIR / participant_id / "meta.json"


def save_participant_meta(participant_id: str, meta: dict):
    path = get_participant_meta_path(participant_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(meta, f, indent=2)


def load_participant_meta(participant_id: str) -> Optional[dict]:
    path = get_participant_meta_path(participant_id)
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def list_participants() -> List[dict]:
    participants = []
    for p in PARTICIPANTS_DIR.iterdir():
        if p.is_dir():
            meta = load_participant_meta(p.name)
            if meta:
                participants.append(meta)
    return participants


def delete_participant(participant_id: str) -> bool:
    d = PARTICIPANTS_DIR / participant_id
    if d.exists():
        shutil.rmtree(d)
        return True
    return False


def get_reference_photo_path(participant_id: str) -> Optional[Path]:
    d = PARTICIPANTS_DIR / participant_id
    if not d.exists():
        return None
    for ext in SUPPORTED_EXTENSIONS:
        p = d / f"reference{ext}"
        if p.exists():
            return p
    return None


def invalidate_embedding(participant_id: str):
    """No-op — embeddings are stored in AWS, nothing to invalidate locally."""
    pass


# ── ZIP extraction ─────────────────────────────────────────────────

def extract_zip(zip_path: str, event_id: str) -> Tuple[Path, List[Path]]:
    event_dir = EVENTS_DIR / event_id
    event_dir.mkdir(parents=True, exist_ok=True)

    image_paths = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            if "__MACOSX" in name or name.startswith(".") or name.endswith("/"):
                continue
            p = Path(name)
            if _is_image(p):
                dest = event_dir / p.name
                with zf.open(name) as src, open(dest, "wb") as dst:
                    dst.write(src.read())
                image_paths.append(dest)

    return event_dir, image_paths


# ── Core: index event photos into Rekognition ─────────────────────

def preprocess_event_faces(
    event_id: str,
    image_paths: List[Path],
    status_callback=None,
) -> dict:
    """
    Index all event photos into a Rekognition Collection.
    Each face gets stored with ExternalImageId = sanitized filename.
    """
    client = _rek()
    cid = _collection_id(event_id)

    # Create collection (ignore if it already exists)
    try:
        client.create_collection(CollectionId=cid)
        logger.info(f"Created Rekognition collection {cid}")
    except client.exceptions.ResourceAlreadyExistsException:
        logger.info(f"Collection {cid} already exists, reusing")

    indexed_faces = 0
    filename_map: Dict[str, str] = {}   # safe_ext_id → original filename

    for i, img_path in enumerate(image_paths):
        if status_callback:
            status_callback(i + 1, len(image_paths), img_path.name)

        _normalize_image(str(img_path))
        safe_id = _safe_ext_id(img_path.name)
        filename_map[safe_id] = img_path.name

        try:
            with open(img_path, "rb") as f:
                image_bytes = f.read()

            response = client.index_faces(
                CollectionId=cid,
                Image={"Bytes": image_bytes},
                ExternalImageId=safe_id,
                MaxFaces=10,
                QualityFilter="AUTO",
                DetectionAttributes=[],
            )
            count = len(response.get("FaceRecords", []))
            indexed_faces += count
            logger.info(f"Indexed {count} face(s) from {img_path.name}")
        except Exception as e:
            logger.warning(f"Could not index {img_path.name}: {e}")

        # Generate the thumbnail used by the participant portal grid.
        make_thumbnail(img_path)

    result_dir = RESULTS_DIR / event_id
    result_dir.mkdir(parents=True, exist_ok=True)

    with open(result_dir / "face_index.json", "w") as f:
        json.dump({
            "event_id": event_id,
            "collection_id": cid,
            "photo_count": len(image_paths),
            "indexed_faces": indexed_faces,
            "filename_map": filename_map,
        }, f)

    return {
        "total_photos": len(image_paths),
        "indexed_faces": indexed_faces,
    }


# ── Core: match selfie against event collection ────────────────────

def match_selfie_to_event(
    event_id: str,
    selfie_path: str,
    threshold: Optional[float] = None,
) -> List[str]:
    """
    Search a selfie against the event's Rekognition collection.
    Returns list of matching photo filenames (deduplicated).
    """
    index_path = RESULTS_DIR / event_id / "face_index.json"
    if not index_path.exists():
        logger.warning(f"No face index for event {event_id}")
        return []

    with open(index_path) as f:
        data = json.load(f)

    cid = data.get("collection_id", _collection_id(event_id))
    filename_map: Dict[str, str] = data.get("filename_map", {})
    match_threshold = int(threshold) if threshold is not None else THRESHOLD

    _normalize_image(selfie_path)

    try:
        with open(selfie_path, "rb") as f:
            image_bytes = f.read()

        client = _rek()
        response = client.search_faces_by_image(
            CollectionId=cid,
            Image={"Bytes": image_bytes},
            MaxFaces=200,
            FaceMatchThreshold=match_threshold,
        )

        matched = set()
        for match in response.get("FaceMatches", []):
            safe_id = match["Face"]["ExternalImageId"]
            filename = filename_map.get(safe_id, safe_id)
            matched.add(filename)
            logger.info(f"Match: {filename} ({match['Similarity']:.1f}%)")

        return list(matched)

    except client.exceptions.InvalidParameterException:
        # No face detected in selfie
        logger.warning(f"No face detected in selfie {selfie_path}")
        return []
    except client.exceptions.ResourceNotFoundException:
        logger.warning(f"Rekognition collection {cid} not found")
        return []
    except Exception as e:
        logger.error(f"Rekognition search error: {e}")
        return []


# ── Add photos to existing event index ────────────────────────────

def add_photos_to_index(event_id: str, new_paths: List[Path]):
    index_path = RESULTS_DIR / event_id / "face_index.json"
    if not index_path.exists():
        return

    with open(index_path) as f:
        data = json.load(f)

    cid = data.get("collection_id", _collection_id(event_id))
    filename_map: Dict[str, str] = data.get("filename_map", {})
    client = _rek()
    new_indexed = 0

    for img_path in new_paths:
        _normalize_image(str(img_path))
        safe_id = _safe_ext_id(img_path.name)
        filename_map[safe_id] = img_path.name
        try:
            with open(img_path, "rb") as f:
                image_bytes = f.read()
            response = client.index_faces(
                CollectionId=cid,
                Image={"Bytes": image_bytes},
                ExternalImageId=safe_id,
                MaxFaces=10,
                QualityFilter="AUTO",
                DetectionAttributes=[],
            )
            new_indexed += len(response.get("FaceRecords", []))
        except Exception as e:
            logger.warning(f"Could not index {img_path.name}: {e}")
        make_thumbnail(img_path)

    data["filename_map"] = filename_map
    data["photo_count"] = data.get("photo_count", 0) + len(new_paths)
    data["indexed_faces"] = data.get("indexed_faces", 0) + new_indexed

    with open(index_path, "w") as f:
        json.dump(data, f)

    result_path = RESULTS_DIR / event_id / "result.json"
    if result_path.exists():
        with open(result_path) as f:
            result = json.load(f)
        result["total_photos"] = data["photo_count"]
        result["indexed_faces"] = data["indexed_faces"]
        with open(result_path, "w") as f:
            json.dump(result, f, indent=2)


# ── Delete Rekognition collection when event is deleted ────────────

def delete_event_collection(event_id: str):
    """Clean up the Rekognition collection to avoid orphaned data."""
    try:
        _rek().delete_collection(CollectionId=_collection_id(event_id))
        logger.info(f"Deleted Rekognition collection for event {event_id}")
    except Exception as e:
        logger.warning(f"Could not delete collection for {event_id}: {e}")


# ── ZIP downloads (unchanged) ──────────────────────────────────────

def create_result_zip(event_id: str, participant_id: str) -> Optional[Path]:
    participants = list_participants()
    meta = next((p for p in participants if p["id"] == participant_id), None)
    if not meta:
        return None
    safe_name = meta["name"].replace(" ", "_").replace("/", "_")
    participant_result_dir = RESULTS_DIR / event_id / f"{safe_name}_{participant_id[:8]}"
    if not participant_result_dir.exists():
        return None
    photos = [p for p in participant_result_dir.glob("*") if _is_image(p)]
    if not photos:
        return None
    zip_path = RESULTS_DIR / event_id / f"{safe_name}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for photo in photos:
            zf.write(photo, photo.name)
    return zip_path


def create_full_result_zip(event_id: str) -> Optional[Path]:
    result_dir = RESULTS_DIR / event_id
    if not result_dir.exists():
        return None
    zip_path = RESULTS_DIR / event_id / "all_results.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for folder in result_dir.iterdir():
            if folder.is_dir():
                for photo in folder.iterdir():
                    if _is_image(photo):
                        zf.write(photo, f"{folder.name}/{photo.name}")
    return zip_path


# ═══════════════════════════════════════════════════════════════════
# COHORT-LEVEL FACE OPERATIONS  (the new model — single pool/collection)
# ═══════════════════════════════════════════════════════════════════

from app import cohorts as co  # late import to avoid circular dep at top


def ensure_cohort_collection(cohort_id: str) -> str:
    """Idempotent: create the cohort's Rekognition collection if missing."""
    cid = co.collection_id(cohort_id)
    client = _rek()
    try:
        client.create_collection(CollectionId=cid)
        logger.info(f"Created Rekognition collection {cid}")
    except client.exceptions.ResourceAlreadyExistsException:
        pass
    return cid


REKOGNITION_MAX_BYTES = 5 * 1024 * 1024   # AWS hard limit on Image={"Bytes":...}
REKOGNITION_TARGET_BYTES = 4 * 1024 * 1024  # leave headroom


def _bytes_for_rekognition(photo_path: Path) -> bytes:
    """Return image bytes that fit Rekognition's 5MB cap.

    HD photos from a photographer routinely exceed 5MB → Rekognition returns
    413. We downscale in memory (original on disk stays untouched) until the
    encoded JPEG fits comfortably.
    """
    raw = photo_path.read_bytes()
    if len(raw) <= REKOGNITION_TARGET_BYTES:
        return raw

    from io import BytesIO
    from PIL import Image, ImageOps
    img = Image.open(photo_path)
    img = ImageOps.exif_transpose(img)
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Step down dimensions until the encoded JPEG fits the budget.
    max_edge = 2400
    for _ in range(5):
        scaled = img.copy()
        scaled.thumbnail((max_edge, max_edge))
        buf = BytesIO()
        scaled.save(buf, "JPEG", quality=88, optimize=True)
        data = buf.getvalue()
        if len(data) <= REKOGNITION_TARGET_BYTES:
            return data
        max_edge = int(max_edge * 0.75)
    return data  # last attempt — ~700px, will almost certainly fit


def index_photo_into_cohort(
    cohort_id: str, photo_path: Path
) -> Tuple[str, str, int, Optional[str]]:
    """Index one photo. Returns (safe_id, original_name, face_count, error_msg).

    Does NOT touch face_index.json — the caller is responsible for the single
    serialized write (see upload_cohort_photos in main.py). This avoids the
    race where parallel workers corrupt the JSON file.
    """
    cid = ensure_cohort_collection(cohort_id)
    _normalize_image(str(photo_path))
    safe_id = _safe_ext_id(photo_path.name)
    err: Optional[str] = None
    face_count = 0
    try:
        image_bytes = _bytes_for_rekognition(photo_path)
        response = _rek().index_faces(
            CollectionId=cid,
            Image={"Bytes": image_bytes},
            ExternalImageId=safe_id,
            MaxFaces=10,
            QualityFilter="AUTO",
            DetectionAttributes=[],
        )
        face_count = len(response.get("FaceRecords", []))
    except Exception as e:
        err = str(e)
        logger.warning(f"Could not index {photo_path.name}: {e}")

    # Always generate the thumbnail companion, even if Rekognition skipped this
    # one — we still want the photo visible in the grid.
    try:
        make_thumbnail(photo_path)
    except Exception as e:
        logger.warning(f"Thumbnail failed for {photo_path.name}: {e}")

    return safe_id, photo_path.name, face_count, err


def remove_photo_from_cohort(cohort_id: str, filename: str):
    """Delete a photo from cohort pool + Rekognition + face_index."""
    pdir = co.photos_dir(cohort_id)
    photo_path = pdir / Path(filename).name
    if not photo_path.exists():
        return False

    safe_id = _safe_ext_id(photo_path.name)
    cid = co.collection_id(cohort_id)
    # Remove face(s) for this image from Rekognition
    try:
        client = _rek()
        # List faces with this ExternalImageId, then delete by FaceId
        face_ids = []
        paginator = client.get_paginator("list_faces")
        for page in paginator.paginate(CollectionId=cid):
            for face in page.get("Faces", []):
                if face.get("ExternalImageId") == safe_id:
                    face_ids.append(face["FaceId"])
        if face_ids:
            client.delete_faces(CollectionId=cid, FaceIds=face_ids)
    except Exception as e:
        logger.warning(f"Could not remove faces for {filename}: {e}")

    # Remove file + thumb
    try:
        photo_path.unlink()
    except OSError:
        pass
    thumb = thumb_path_for(photo_path)
    if thumb.exists():
        try:
            thumb.unlink()
        except OSError:
            pass

    # Update face_index.json
    idx = co.load_face_index(cohort_id)
    fmap = idx.get("filename_map", {})
    if safe_id in fmap:
        del fmap[safe_id]
    idx["filename_map"] = fmap
    co.save_face_index(cohort_id, idx)
    return True


def match_selfie_to_cohort(
    cohort_id: str,
    selfie_path: str,
    threshold: Optional[float] = None,
) -> List[str]:
    """SearchFacesByImage against the cohort's collection."""
    idx = co.load_face_index(cohort_id)
    cid = idx.get("collection_id", co.collection_id(cohort_id))
    filename_map: Dict[str, str] = idx.get("filename_map", {})
    match_threshold = int(threshold) if threshold is not None else THRESHOLD

    _normalize_image(selfie_path)

    try:
        with open(selfie_path, "rb") as f:
            image_bytes = f.read()
        client = _rek()
        response = client.search_faces_by_image(
            CollectionId=cid,
            Image={"Bytes": image_bytes},
            MaxFaces=200,
            FaceMatchThreshold=match_threshold,
        )
        matched = set()
        for match in response.get("FaceMatches", []):
            safe_id = match["Face"]["ExternalImageId"]
            filename = filename_map.get(safe_id, safe_id)
            matched.add(filename)
        return list(matched)
    except Exception as e:
        logger.warning(f"Cohort selfie match error: {e}")
        return []


def delete_cohort_collection(cohort_id: str):
    try:
        _rek().delete_collection(CollectionId=co.collection_id(cohort_id))
        logger.info(f"Deleted Rekognition collection for cohort {cohort_id}")
    except Exception as e:
        logger.warning(f"Could not delete cohort collection {cohort_id}: {e}")


def wipe_all_rekognition_collections():
    """Destructive: delete every Rekognition collection in the account.
    Used by the /admin/wipe endpoint when starting from a clean slate."""
    try:
        client = _rek()
        paginator = client.get_paginator("list_collections")
        for page in paginator.paginate():
            for cid in page.get("CollectionIds", []):
                try:
                    client.delete_collection(CollectionId=cid)
                    logger.info(f"Wiped collection {cid}")
                except Exception as e:
                    logger.warning(f"Could not delete {cid}: {e}")
    except Exception as e:
        logger.warning(f"wipe_all_rekognition_collections failed: {e}")
