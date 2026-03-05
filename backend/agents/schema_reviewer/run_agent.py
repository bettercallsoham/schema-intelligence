"""
Schema Reviewer Agent – CrewAI agent that analyzes schema diff, fetches impact score,
and posts a contextual review comment on a GitHub pull request.
Uses Gemini as the LLM. Run from CI after base and head schemas are ingested.
"""
import os
import sys
import argparse
from pathlib import Path

# Load .env from this directory or backend root
from dotenv import load_dotenv
_env_dir = Path(__file__).resolve().parent
# Try multiple paths; dotenv can fail on some Windows setups
loaded = load_dotenv(_env_dir / ".env")
if not loaded:
    load_dotenv(_env_dir.parent.parent.parent / ".env")
# Fallback: read .env manually so API_TOKEN is always available on Windows
_env_file = _env_dir / ".env"
if _env_file.exists():
    lines = _env_file.read_text(encoding="utf-8", errors="replace").splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            # If value is empty, use next non-empty line (some editors put long values on next line)
            if not v and i + 1 < len(lines) and lines[i + 1].strip() and not lines[i + 1].strip().startswith("#"):
                v = lines[i + 1].strip().strip('"').strip("'")
                i += 1
            if v and k not in os.environ:
                os.environ[k] = v
        i += 1

from crewai import Agent, Task, Crew, LLM
from tools import get_schema_comparison, get_impact_score, post_pr_comment


def run(
    snapshot_id_base: str,
    snapshot_id_head: str,
    pr_owner: str,
    pr_repo: str,
    pr_number: str,
) -> str:
    """Run the schema reviewer crew and return the final output (review text)."""
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    if not gemini_key:
        return "Error: GEMINI_API_KEY is not set. Set it in .env or environment."

    llm = LLM(
        model=f"gemini/{gemini_model}" if "/" not in gemini_model else gemini_model,
        api_key=gemini_key,
        temperature=0.2,
    )

    reviewer = Agent(
        role="Schema Review Specialist",
        goal="Analyze database schema changes and post a clear, actionable review on pull requests.",
        backstory="You are an expert in database schema design and PostgreSQL. You review schema diffs and impact scores to help teams avoid regressions and follow best practices.",
        llm=llm,
        tools=[get_schema_comparison, get_impact_score, post_pr_comment],
        verbose=True,
    )

    task = Task(
        description="""You are reviewing a pull request that changes the database schema.

**Inputs you have:**
- snapshot_id_base: {snapshot_id_base} (schema before changes)
- snapshot_id_head: {snapshot_id_head} (schema after changes)
- PR: {pr_owner}/{pr_repo} #{pr_number}

**Steps:**
1. Use the Get Schema Comparison tool with snapshot_id_base and snapshot_id_head to get the schema diff (added/removed/modified tables, columns, indexes, foreign keys).
2. Use the Get Impact Score tool with snapshot_id_head to get the health score and top issues for the new schema.
3. Write a short, professional PR review comment in Markdown that includes:
   - A one-line summary of the schema change (e.g. "Adds 2 tables, modifies 1 column in X").
   - The current health score and whether it improved or worsened.
   - Top 3–5 actionable items (from impact issues or from the diff), with clear recommendations.
   - Any breaking or risky changes (e.g. dropped columns, type changes) if present.
4. Use the Post PR Comment tool to post that review on the pull request (owner={pr_owner}, repo={pr_repo}, pull_number={pr_number}, body=your markdown review).

Return the exact markdown body you posted as your final answer.""",
        expected_output="The markdown review comment that was posted on the PR.",
        agent=reviewer,
    )

    crew = Crew(agents=[reviewer], tasks=[task])
    inputs = {
        "snapshot_id_base": snapshot_id_base,
        "snapshot_id_head": snapshot_id_head,
        "pr_owner": pr_owner,
        "pr_repo": pr_repo,
        "pr_number": pr_number,
    }
    result = crew.kickoff(inputs=inputs)
    return str(result.raw) if hasattr(result, "raw") else str(result)


def main():
    parser = argparse.ArgumentParser(
        description="Run Schema Reviewer Agent: analyze schema diff, fetch impact score, post PR comment."
    )
    parser.add_argument("--snapshot-id-base", required=True, help="UUID of base branch snapshot")
    parser.add_argument("--snapshot-id-head", required=True, help="UUID of head/PR branch snapshot")
    parser.add_argument("--pr-owner", required=True, help="GitHub repo owner (e.g. myorg)")
    parser.add_argument("--pr-repo", required=True, help="GitHub repo name (e.g. my-repo)")
    parser.add_argument("--pr-number", required=True, help="Pull request number (e.g. 42)")
    args = parser.parse_args()

    out = run(
        snapshot_id_base=args.snapshot_id_base,
        snapshot_id_head=args.snapshot_id_head,
        pr_owner=args.pr_owner,
        pr_repo=args.pr_repo,
        pr_number=args.pr_number,
    )
    print(out)
    return 0 if "Error:" not in out else 1


if __name__ == "__main__":
    sys.exit(main())
