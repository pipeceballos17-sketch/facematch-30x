from pydantic import BaseModel
from typing import Optional, List


class ParticipantCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    company: Optional[str] = None


class Participant(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    photo_path: Optional[str] = None
    has_reference_photo: bool = False


class LinkedInSearchResult(BaseModel):
    name: str
    headline: Optional[str] = None
    linkedin_url: str
    profile_pic_url: Optional[str] = None


class Cohort(BaseModel):
    id: str
    name: str
    program: Optional[str] = None        # e.g. "Inmersivo Ejecutivo"
    description: Optional[str] = None
    cover_color: Optional[str] = None    # hex fallback when no cover image
    created_at: str
    event_count: int = 0
    matched_photos: int = 0
    matched_participants: int = 0


class CohortCreate(BaseModel):
    name: str
    program: Optional[str] = None
    description: Optional[str] = None


class MatchResult(BaseModel):
    participant_id: str
    participant_name: str
    participant_phone: Optional[str] = None
    photo_filenames: List[str]
    match_count: int


class ProcessingStatus(BaseModel):
    event_id: str
    event_name: Optional[str] = None
    status: str  # "pending" | "processing" | "done" | "error"
    total_photos: int
    processed_photos: int
    message: Optional[str] = None


class ProcessingResult(BaseModel):
    event_id: str
    event_name: str
    cohort_id: Optional[str] = None
    matches: List[MatchResult]
    unmatched_photos: List[str]
    total_faces_detected: int
