"""Ingest schema_base.json and schema_head.json, print snapshot IDs for testing."""
import json
import os
import sys
from pathlib import Path

import requests

# Same .env loading as run_agent.py
_env_dir = Path(__file__).resolve().parent
_env_file = _env_dir / ".env"
if _env_file.exists():
    for line in _env_file.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if v:
                os.environ[k] = v

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3001").rstrip("/")
API_TOKEN = os.environ.get("API_TOKEN", "").strip()
SCRIPTS = _env_dir.parent.parent / "scripts"

def main():
    if not API_TOKEN:
        print("API_TOKEN not set in .env", file=sys.stderr)
        sys.exit(1)
    base_path = SCRIPTS / "schema_base.json"
    head_path = SCRIPTS / "schema_head.json"
    if not base_path.exists() or not head_path.exists():
        print("schema_base.json or schema_head.json not found in backend/scripts", file=sys.stderr)
        sys.exit(1)
    headers = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}

    with open(base_path, "r", encoding="utf-8") as f:
        base_body = json.load(f)
    r = requests.post(f"{BACKEND_URL}/api/v1/schema/ingest", json=base_body, headers=headers, timeout=60)
    r.raise_for_status()
    base_id = r.json()["data"]["snapshotId"]
    print(f"BASE_ID={base_id}")

    with open(head_path, "r", encoding="utf-8") as f:
        head_body = json.load(f)
    r = requests.post(f"{BACKEND_URL}/api/v1/schema/ingest", json=head_body, headers=headers, timeout=60)
    r.raise_for_status()
    head_id = r.json()["data"]["snapshotId"]
    print(f"HEAD_ID={head_id}")

if __name__ == "__main__":
    main()
