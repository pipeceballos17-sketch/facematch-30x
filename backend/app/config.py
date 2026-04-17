import os
from pathlib import Path

# Storage root — override with STORAGE_PATH env var on Railway
_storage_env = os.getenv("STORAGE_PATH")
STORAGE_BASE = Path(_storage_env) if _storage_env else Path(__file__).parent.parent / "storage"

# Admin password — if unset, admin panel is open (dev mode)
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

# AWS Rekognition credentials
AWS_ACCESS_KEY_ID     = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION            = os.getenv("AWS_REGION", "us-east-1")
