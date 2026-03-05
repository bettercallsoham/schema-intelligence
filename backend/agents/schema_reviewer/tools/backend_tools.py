"""
Tools that call the Schema Intelligence backend API (schema compare and impact score).
Uses BACKEND_URL and API_TOKEN from environment.
"""
import os
import json
import requests
from crewai.tools import tool


def _backend_headers():
    token = os.environ.get("API_TOKEN", "").strip()
    return {
        "Content-Type": "application/json",
        **({"Authorization": f"Bearer {token}"} if token else {}),
    }


@tool("Get Schema Comparison")
def get_schema_comparison(snapshot_id_base: str, snapshot_id_head: str) -> str:
    """
    Fetches the schema diff between two snapshots (base and head) from the Schema Intelligence backend.
    Use this to see what tables/columns/indexes/foreign keys were added, removed, or modified.
    Arguments: snapshot_id_base (UUID of base snapshot), snapshot_id_head (UUID of head snapshot).
    """
    base_url = os.environ.get("BACKEND_URL", "http://localhost:3001").rstrip("/")
    url = f"{base_url}/api/v1/schema/compare"
    try:
        r = requests.post(
            url,
            json={"snapshotId1": snapshot_id_base, "snapshotId2": snapshot_id_head},
            headers=_backend_headers(),
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        if data.get("status") != "success":
            return json.dumps({"error": data.get("message", "Unknown error")})
        return json.dumps(data.get("data", {}), indent=2)
    except requests.RequestException as e:
        return json.dumps({"error": str(e)})


@tool("Get Impact Score")
def get_impact_score(snapshot_id: str) -> str:
    """
    Fetches the impact/health score and top issues for a schema snapshot from the Schema Intelligence backend.
    Returns health score (0-100), total issues, severity counts, and ranked issues.
    Argument: snapshot_id (UUID of the snapshot, typically the head snapshot).
    """
    base_url = os.environ.get("BACKEND_URL", "http://localhost:3001").rstrip("/")
    headers = _backend_headers()
    try:
        score_r = requests.get(
            f"{base_url}/api/v1/impact/score/{snapshot_id}",
            headers=headers,
            timeout=30,
        )
        score_r.raise_for_status()
        score_data = score_r.json()
        if score_data.get("status") != "success":
            return json.dumps({"error": score_data.get("message", "Unknown error")})

        rank_r = requests.get(
            f"{base_url}/api/v1/impact/rank/{snapshot_id}",
            params={"limit": 10},
            headers=headers,
            timeout=30,
        )
        rank_data = rank_r.json() if rank_r.ok else {}
        result = {
            "score": score_data.get("data", {}),
            "ranked_issues": rank_data.get("data", []) if rank_data.get("status") == "success" else [],
        }
        return json.dumps(result, indent=2)
    except requests.RequestException as e:
        return json.dumps({"error": str(e)})
