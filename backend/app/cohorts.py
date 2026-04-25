"""
Cohort = the only first-class container.

Each cohort owns its photo pool and one Rekognition collection.
Layout on disk:
    storage/cohorts/{cohort_id}/meta.json
    storage/cohorts/{cohort_id}/photos/
    storage/cohorts/{cohort_id}/face_index.json   (collection_id, filename_map, totals)
"""
import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from app.config import STORAGE_BASE

COHORTS_DIR = STORAGE_BASE / "cohorts"
COHORTS_DIR.mkdir(parents=True, exist_ok=True)

# 30X brand palette rotated through for cover backgrounds
COVER_COLORS = [
    "#ebff6f",  # pastel lime (brand primary)
    "#942143",  # wine
    "#172452",  # navy
    "#258053",  # forest
    "#babe60",  # olive-lime
    "#cfc6b3",  # warm taupe
    "#1c1c1c",  # ink
    "#868073",  # warm muted
]


def cohort_dir(cohort_id: str) -> Path:
    return COHORTS_DIR / cohort_id


def meta_path(cohort_id: str) -> Path:
    return cohort_dir(cohort_id) / "meta.json"


def photos_dir(cohort_id: str) -> Path:
    p = cohort_dir(cohort_id) / "photos"
    p.mkdir(parents=True, exist_ok=True)
    return p


def face_index_path(cohort_id: str) -> Path:
    return cohort_dir(cohort_id) / "face_index.json"


def collection_id(cohort_id: str) -> str:
    """Rekognition collection id — alphanumeric + _ - , <=255 chars."""
    return f"fm-cohort-{cohort_id}"


def create_cohort(name: str, program: Optional[str], description: Optional[str]) -> dict:
    cid = str(uuid.uuid4())
    color_idx = sum(ord(c) for c in cid) % len(COVER_COLORS)
    meta = {
        "id": cid,
        "name": name,
        "program": program,
        "description": description,
        "cover_color": COVER_COLORS[color_idx],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    cohort_dir(cid).mkdir(parents=True, exist_ok=True)
    photos_dir(cid)
    with open(meta_path(cid), "w") as f:
        json.dump(meta, f, indent=2)
    return meta


def get_cohort(cohort_id: str) -> Optional[dict]:
    p = meta_path(cohort_id)
    if not p.exists():
        return None
    with open(p) as f:
        return json.load(f)


def list_cohorts() -> List[dict]:
    out = []
    if not COHORTS_DIR.exists():
        return out
    for d in sorted(COHORTS_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if d.is_dir() and meta_path(d.name).exists():
            out.append(get_cohort(d.name))
    return out


def delete_cohort(cohort_id: str) -> bool:
    d = cohort_dir(cohort_id)
    if not d.exists():
        return False
    shutil.rmtree(d)
    return True


# ── Face index helpers ────────────────────────────────────────────

def load_face_index(cohort_id: str) -> dict:
    p = face_index_path(cohort_id)
    if not p.exists():
        return {
            "cohort_id": cohort_id,
            "collection_id": collection_id(cohort_id),
            "filename_map": {},
            "indexed_faces": 0,
        }
    with open(p) as f:
        return json.load(f)


def save_face_index(cohort_id: str, data: dict):
    with open(face_index_path(cohort_id), "w") as f:
        json.dump(data, f)


def list_photo_filenames(cohort_id: str) -> List[str]:
    """Originals only — excludes .thumb.jpg companions."""
    pdir = photos_dir(cohort_id)
    return sorted([
        p.name for p in pdir.iterdir()
        if p.is_file() and not p.name.endswith(".thumb.jpg")
    ])


def stats(cohort_id: str) -> dict:
    pdir = photos_dir(cohort_id)
    total = sum(
        1 for p in pdir.iterdir()
        if p.is_file() and not p.name.endswith(".thumb.jpg")
    )
    idx = load_face_index(cohort_id)
    return {
        "total_photos": total,
        "indexed_faces": idx.get("indexed_faces", 0),
    }
