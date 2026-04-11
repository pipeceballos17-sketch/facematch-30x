# Facematch 30X — Setup Guide

## What it does

1. **Add participants** — search LinkedIn by name to get their profile photo automatically, or upload a photo manually
2. **Upload event photos** — drag & drop a ZIP of photos from the event
3. **Automatic face matching** — DeepFace AI detects every face in every photo and matches it to participants
4. **Download results** — per-person downloadable ZIP or all at once

---

## Requirements

- Python 3.10 or 3.11
- Node.js 18+
- ~2GB disk space (DeepFace downloads AI models on first run)

---

## Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy env file (optional: add Proxycurl key for better LinkedIn support)
copy .env.example .env

# Start the API server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or just double-click `backend/start.bat` after activating the venv.

---

## Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Or double-click `frontend/start.bat`.

Open **http://localhost:5173** in your browser.

---

## Usage Flow

### Step 1 — Add Participants (before the event or the day of)
1. Click **"Add Participant"**
2. Enter their name (+ company to narrow down LinkedIn search)
3. Click **"Search LinkedIn"** → select the right profile
4. The system fetches their profile picture automatically

**If LinkedIn doesn't work** (private profile, blocked request):
- Click **"Upload"** on the participant card and upload a photo manually
- A headshot from their ID badge, the invite form, or a quick Google search works great

### Step 2 — Upload Event Photos
1. Go to **"Upload Photos"** tab
2. ZIP up all photos from the event
3. Drag & drop the ZIP
4. Processing runs in the background (progress shown in real time)

### Step 3 — Download Results
- Go to **"Results"** tab
- Download per-person ZIPs or **"Download All"** for a single ZIP organized by participant

---

## LinkedIn Notes

LinkedIn heavily restricts automated access. The app tries two approaches:

| Method | Works when |
|--------|-----------|
| **Proxycurl API** | Always (paid, ~$0.01/profile) — add key to `.env` |
| **Direct scrape** | Profile is set to "Public" on LinkedIn |

For best results on day-of events, use the **manual photo upload** — just grab their profile pic from the event registration form or a quick search.

---

## Face Matching Settings

Edit `backend/app/face_engine.py` to tune:

```python
MODEL_NAME = "ArcFace"      # Most accurate. Alternatives: VGG-Face (faster), Facenet512
DETECTOR_BACKEND = "opencv" # Fastest. Use "retinaface" or "mtcnn" for better accuracy
THRESHOLD = 0.40            # Lower = stricter (fewer false positives, may miss some)
```

For group shots with many people, try lowering `THRESHOLD` to `0.35`.
For a more permissive match (fewer misses), try `0.50`.

---

## Folder Structure

```
Facematch 30X/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI routes
│   │   ├── face_engine.py   # DeepFace pipeline
│   │   ├── linkedin.py      # LinkedIn search + photo extraction
│   │   └── models.py        # Pydantic schemas
│   ├── storage/
│   │   ├── participants/    # Reference photos + embeddings (persistent)
│   │   ├── events/          # Extracted event photos
│   │   └── results/         # Matched photos + result ZIPs
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.jsx
        ├── api.js
        └── components/
```
