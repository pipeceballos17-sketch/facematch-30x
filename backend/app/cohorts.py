"""
Cohort storage — lightweight JSON file per cohort.
Stored at: storage/cohorts/{cohort_id}/meta.json
"""
import json
import shutil
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


def _meta_path(cohort_id: str) -> Path:
    return COHORTS_DIR / cohort_id / "meta.json"


def create_cohort(name: str, program: Optional[str], description: Optional[str]) -> dict:
    import uuid
    cohort_id = str(uuid.uuid4())
    # Pick a deterministic color from the palette
    color_idx = sum(ord(c) for c in cohort_id) % len(COVER_COLORS)
    meta = {
        "id": cohort_id,
        "name": name,
        "program": program,
        "description": description,
        "cover_color": COVER_COLORS[color_idx],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "event_ids": [],
    }
    (COHORTS_DIR / cohort_id).mkdir(parents=True, exist_ok=True)
    with open(_meta_path(cohort_id), "w") as f:
        json.dump(meta, f, indent=2)
    return meta


def get_cohort(cohort_id: str) -> Optional[dict]:
    p = _meta_path(cohort_id)
    if not p.exists():
        return None
    with open(p) as f:
        return json.load(f)


def list_cohorts() -> List[dict]:
    cohorts = []
    for d in sorted(COHORTS_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if d.is_dir() and _meta_path(d.name).exists():
            cohorts.append(get_cohort(d.name))
    return cohorts


def add_event_to_cohort(cohort_id: str, event_id: str):
    meta = get_cohort(cohort_id)
    if not meta:
        return
    if event_id not in meta.get("event_ids", []):
        meta.setdefault("event_ids", []).append(event_id)
    with open(_meta_path(cohort_id), "w") as f:
        json.dump(meta, f, indent=2)


def delete_cohort(cohort_id: str) -> bool:
    d = COHORTS_DIR / cohort_id
    if not d.exists():
        return False
    shutil.rmtree(d)
    return True


def remove_event_from_cohort(cohort_id: str, event_id: str):
    meta = get_cohort(cohort_id)
    if not meta:
        return
    meta["event_ids"] = [e for e in meta.get("event_ids", []) if e != event_id]
    with open(_meta_path(cohort_id), "w") as f:
        json.dump(meta, f, indent=2)
