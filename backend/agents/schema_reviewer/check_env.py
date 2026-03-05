from pathlib import Path
import os
_env_file = Path(__file__).resolve().parent / ".env"
if _env_file.exists():
    for line in _env_file.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if v:
                os.environ[k] = v
print("API_TOKEN length:", len(os.environ.get("API_TOKEN", "")))
print("BACKEND_URL:", (os.environ.get("BACKEND_URL", ""))[:40])
