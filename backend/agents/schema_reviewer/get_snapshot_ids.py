"""Fetch first two snapshot IDs from the backend for local testing. Uses .env for BACKEND_URL and API_TOKEN."""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import requests

p = Path(__file__).resolve().parent
load_dotenv(p / ".env")
load_dotenv(p.parent.parent.parent / ".env")
# Fallback: current working directory (e.g. when run from agent folder)
load_dotenv(Path.cwd() / ".env")
base = os.environ.get("BACKEND_URL", "http://localhost:3001").rstrip("/")
token = os.environ.get("API_TOKEN", "").strip()
if not token:
    print("API_TOKEN not set in .env", file=sys.stderr)
    sys.exit(1)
r = requests.get(
    f"{base}/api/v1/schema",
    params={"page": 1, "pageSize": 10},
    headers={"Authorization": f"Bearer {token}"},
    timeout=10,
)
if r.status_code != 200:
    print(f"Backend returned {r.status_code}: {r.text}", file=sys.stderr)
    sys.exit(1)
data = r.json()
snapshots = data.get("data") or []
ids = [s.get("id") for s in snapshots if s.get("id")]
if len(ids) < 2:
    print(f"Need at least 2 snapshots; found {len(ids)}. Ingest a schema twice (e.g. from Compare page) and try again.", file=sys.stderr)
    sys.exit(1)
print(ids[0], ids[1])
