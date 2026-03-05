"""
Tool to post a comment on a GitHub pull request.
Uses GITHUB_TOKEN from environment.
"""
import os
import json
import requests
from crewai.tools import tool


@tool("Post PR Comment")
def post_pr_comment(owner: str, repo: str, pull_number: str, body: str) -> str:
    """
    Posts a comment on a GitHub pull request. Use this to publish the schema review.
    Arguments: owner (e.g. myorg), repo (e.g. my-repo), pull_number (e.g. 42), body (markdown text of the comment).
    """
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        return json.dumps({"error": "GITHUB_TOKEN is not set"})
    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{pull_number}/comments"
    try:
        r = requests.post(
            url,
            json={"body": body},
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=30,
        )
        r.raise_for_status()
        return json.dumps({"success": True, "url": r.json().get("html_url", "")})
    except requests.RequestException as e:
        return json.dumps({"error": str(e)})
