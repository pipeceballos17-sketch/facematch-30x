"""
Face matching engine powered by face_recognition (dlib).

Pipeline:
1. For each participant, we store a reference photo.
2. When an event ZIP is uploaded, we extract all photos.
3. For each event photo:
   a. Detect all faces in the photo.
   b. For each face, compare against all participant reference embeddings.
   c. If distance < threshold → match found.
4. Group matched photos by participant.
5. Copy matched photos into per-participant result folders.
"""

import zipfile
import shutil
import json
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import numpy as np

logger = logging.getLogger(__name__)

# face_recognition uses dlib under the hood — ~5 MB model, no TensorFlow, CPU-friendly
import face_recognition

DISTANCE_METRIC = "euclidean"
THRESHOLD = 0.55  # face_recognition default tolerance is 0.6; 0.55 is slightly stricter
MODEL_NAME = "face_recognition_dlib"  # for display/health endpoint

from app.config import STORAGE_BASE

PARTICIPANTS_DIR = STORAGE_BASE / "participants"
EVENTS_DIR = STORAGE_BASE / "events"
RESULTS_DIR = STORAGE_BASE / "results"

# Ensure directories exist
for d in [PARTICIPANTS_DIR, EVENTS_DIR, RESULTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def _is_image(path: Path) -> bool:
    return path.suffix.lower() in SUPPORTED_EXTENSIONS


def _normalize_image(image_path: str):
    """Fix EXIF rotation and convert to RGB JPEG so OpenCV reads it correctly."""
    try:
        from PIL import Image, ImageOps
        img = Image.open(image_path)
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(image_path, "JPEG", quality=95)
    except Exception as e:
        logger.warning(f"Could not normalize image {image_path}: {e}")


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


def compute_embedding(image_path: str) -> Optional[np.ndarray]:
    """Compute face embedding for a reference photo. Returns None if no face found."""
    _normalize_image(image_path)
    try:
        image = face_recognition.load_image_file(image_path)
        encodings = face_recognition.face_encodings(image)
        if encodings:
            return np.array(encodings[0])
        logger.warning(f"No face detected in {image_path}")
    except Exception as e:
        logger.warning(f"Could not compute embedding for {image_path}: {e}")
    return None


def euclidean_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


# Keep cosine_distance for API compatibility
def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    return euclidean_distance(a, b)


def extract_faces_with_embeddings(image_path: str) -> List[np.ndarray]:
    """
    Extract all faces from an image and return their embeddings.
    Returns empty list if no faces found.
    """
    _normalize_image(image_path)
    try:
        image = face_recognition.load_image_file(image_path)
        encodings = face_recognition.face_encodings(image)
        return [np.array(enc) for enc in encodings]
    except Exception as e:
        logger.warning(f"No faces or error in {image_path}: {e}")
        return []


def load_participant_embeddings() -> Dict[str, Tuple[np.ndarray, dict]]:
    """
    Load precomputed embeddings for all participants who have a reference photo.
    Returns dict: participant_id -> (embedding, meta)
    """
    embeddings = {}
    for participant in list_participants():
        pid = participant["id"]
        ref_path = get_reference_photo_path(pid)
        if ref_path is None:
            continue

        embedding_path = PARTICIPANTS_DIR / pid / "embedding.npy"
        if embedding_path.exists():
            embedding = np.load(str(embedding_path))
        else:
            logger.info(f"Computing embedding for participant {participant['name']}...")
            embedding = compute_embedding(str(ref_path))
            if embedding is None:
                logger.warning(f"No face detected in reference photo for {participant['name']}")
                continue
            np.save(str(embedding_path), embedding)

        embeddings[pid] = (embedding, participant)

    return embeddings


def invalidate_embedding(participant_id: str):
    """Delete cached embedding so it gets recomputed on next run."""
    embedding_path = PARTICIPANTS_DIR / participant_id / "embedding.npy"
    if embedding_path.exists():
        embedding_path.unlink()


def extract_zip(zip_path: str, event_id: str) -> Tuple[Path, List[Path]]:
    """Extract ZIP to event folder. Returns (event_dir, list of image paths)."""
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


def run_face_matching(
    event_id: str,
    image_paths: List[Path],
    status_callback=None,
) -> dict:
    """
    Core matching pipeline.

    Returns:
    {
      "matches": { participant_id: [photo_filename, ...] },
      "unmatched": [photo_filename, ...],
      "total_faces": int,
    }
    """
    participant_embeddings = load_participant_embeddings()

    if not participant_embeddings:
        return {"matches": {}, "unmatched": [p.name for p in image_paths], "total_faces": 0}

    result_dir = RESULTS_DIR / event_id
    result_dir.mkdir(parents=True, exist_ok=True)

    for pid, (_, meta) in participant_embeddings.items():
        safe_name = meta["name"].replace(" ", "_").replace("/", "_")
        (result_dir / f"{safe_name}_{pid[:8]}").mkdir(exist_ok=True)

    matches: Dict[str, List[str]] = {pid: [] for pid in participant_embeddings}
    unmatched: List[str] = []
    total_faces = 0

    for i, img_path in enumerate(image_paths):
        if status_callback:
            status_callback(i, len(image_paths), img_path.name)

        face_embeddings = extract_faces_with_embeddings(str(img_path))
        total_faces += len(face_embeddings)

        matched_participants = set()

        for face_emb in face_embeddings:
            best_pid = None
            best_dist = float("inf")

            for pid, (ref_emb, _) in participant_embeddings.items():
                dist = euclidean_distance(face_emb, ref_emb)
                if dist < best_dist:
                    best_dist = dist
                    best_pid = pid

            if best_pid and best_dist < THRESHOLD:
                matched_participants.add(best_pid)

        if matched_participants:
            for pid in matched_participants:
                meta = participant_embeddings[pid][1]
                safe_name = meta["name"].replace(" ", "_").replace("/", "_")
                dest_dir = result_dir / f"{safe_name}_{pid[:8]}"
                shutil.copy2(img_path, dest_dir / img_path.name)
                matches[pid].append(img_path.name)
        else:
            unmatched.append(img_path.name)

    return {
        "matches": {pid: photos for pid, photos in matches.items() if photos},
        "unmatched": unmatched,
        "total_faces": total_faces,
    }


def preprocess_event_faces(
    event_id: str,
    image_paths: List[Path],
    status_callback=None,
) -> dict:
    """
    Extract face embeddings from all event photos and store as face_index.json.
    Called when admin uploads a ZIP — participants later query against this index.
    """
    index: Dict[str, List] = {}
    for i, img_path in enumerate(image_paths):
        if status_callback:
            status_callback(i + 1, len(image_paths), img_path.name)
        embeddings = extract_faces_with_embeddings(str(img_path))
        if embeddings:
            index[img_path.name] = [emb.tolist() for emb in embeddings]

    result_dir = RESULTS_DIR / event_id
    result_dir.mkdir(parents=True, exist_ok=True)

    with open(result_dir / "face_index.json", "w") as f:
        json.dump({
            "event_id": event_id,
            "photo_count": len(image_paths),
            "index": index,
        }, f)

    return {
        "total_photos": len(image_paths),
        "indexed_faces": sum(len(v) for v in index.values()),
    }


def match_selfie_to_event(event_id: str, selfie_path: str, threshold: Optional[float] = None) -> List[str]:
    """
    Compare a selfie against the event face index.
    Returns list of matching photo filenames.
    threshold overrides the global THRESHOLD when provided.
    """
    index_path = RESULTS_DIR / event_id / "face_index.json"
    if not index_path.exists():
        return []

    with open(index_path) as f:
        data = json.load(f)

    selfie_embeddings = extract_faces_with_embeddings(selfie_path)
    if not selfie_embeddings:
        return []

    selfie_emb = selfie_embeddings[0]
    match_threshold = threshold if threshold is not None else THRESHOLD
    matched: List[str] = []

    for filename, emb_lists in data["index"].items():
        for emb_list in emb_lists:
            if euclidean_distance(selfie_emb, np.array(emb_list)) < match_threshold:
                matched.append(filename)
                break

    return matched


def add_photos_to_index(event_id: str, new_paths: List[Path]):
    """Add new photos to an existing face index (called after participant uploads photos)."""
    index_path = RESULTS_DIR / event_id / "face_index.json"
    if not index_path.exists():
        return

    with open(index_path) as f:
        data = json.load(f)

    index = data.get("index", {})
    for img_path in new_paths:
        embeddings = extract_faces_with_embeddings(str(img_path))
        if embeddings:
            index[img_path.name] = [emb.tolist() for emb in embeddings]

    data["index"] = index
    data["photo_count"] = data.get("photo_count", len(index)) + len(new_paths)

    with open(index_path, "w") as f:
        json.dump(data, f)

    result_path = RESULTS_DIR / event_id / "result.json"
    if result_path.exists():
        with open(result_path) as f:
            result = json.load(f)
        result["total_photos"] = data["photo_count"]
        result["indexed_faces"] = sum(len(v) for v in index.values())
        with open(result_path, "w") as f:
            json.dump(result, f, indent=2)


def create_result_zip(event_id: str, participant_id: str) -> Optional[Path]:
    """Create a downloadable ZIP for a single participant's matched photos."""
    participants = list_participants()
    meta = next((p for p in participants if p["id"] == participant_id), None)
    if not meta:
        return None

    safe_name = meta["name"].replace(" ", "_").replace("/", "_")
    participant_result_dir = RESULTS_DIR / event_id / f"{safe_name}_{participant_id[:8]}"

    if not participant_result_dir.exists():
        return None

    photos = list(participant_result_dir.glob("*"))
    if not photos:
        return None

    zip_path = RESULTS_DIR / event_id / f"{safe_name}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for photo in photos:
            if _is_image(photo):
                zf.write(photo, photo.name)

    return zip_path


def create_full_result_zip(event_id: str) -> Optional[Path]:
    """Create a ZIP with all participants' folders."""
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
