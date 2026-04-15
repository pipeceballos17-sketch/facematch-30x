import os
from pathlib import Path

# Storage root — override with STORAGE_PATH env var on Railway/Render
_storage_env = os.getenv("STORAGE_PATH")
STORAGE_BASE = Path(_storage_env) if _storage_env else Path(__file__).parent.parent / "storage"

# Admin password — if unset, admin panel is open (dev mode)
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
