# Schema Reviewer Agent (CrewAI + Gemini)

This folder contains an **AI Reviewer Agent** that runs in CI, analyzes your database schema changes, and posts a short review comment on the pull request. It uses **CrewAI** (Python) with **Gemini** as the LLM, and follows **Option A: ingest both base and head schemas in CI**.

---

## What It Does (Plain Language)

1. **Gets the schema diff**  
   The agent calls your Schema Intelligence backend to compare the “before” (base) and “after” (head) schema snapshots. It sees what tables, columns, indexes, and foreign keys were added, removed, or changed.

2. **Gets the impact score**  
   It asks the backend for the health score and top issues for the new (head) schema. That tells it how healthy the schema is and what the main problems or recommendations are.

3. **Writes a review and posts it on the PR**  
   Using Gemini, the agent turns that diff and impact into a short, readable review in Markdown (summary, score, top 3–5 actionable items, and any breaking or risky changes). Then it posts that as a comment on the GitHub pull request.

So: **schema diff + impact score → one review comment on the PR**, automatically.

---

## Step-by-Step: How It All Fits Together

### Step 1: Where the agent lives

- Everything for this agent is under **`backend/agents/schema_reviewer/`**.
- The agent is written in **Python** (CrewAI). The rest of your app can stay in Node/TypeScript; this part is separate and only needs Python in CI (or on your machine when you run it locally).

### Step 2: What the agent needs to run

The agent needs four things from the environment (see `.env.example`):

1. **GEMINI_API_KEY**  
   So the agent can use Google’s Gemini model to write the review.  
   Use **GEMINI_MODEL** (e.g. `gemini-2.5-flash`) if you want a different model.

2. **BACKEND_URL**  
   The base URL of your Schema Intelligence API (e.g. `http://localhost:3001` or your deployed URL).  
   The agent will call:
   - `POST /api/v1/schema/compare` (with two snapshot IDs)
   - `GET /api/v1/impact/score/:snapshotId`
   - `GET /api/v1/impact/rank/:snapshotId`

3. **API_TOKEN**  
   A valid auth token (e.g. JWT) for that backend. Your schema and impact routes use `authenticate`, so the agent must send this token in the `Authorization` header.

4. **GITHUB_TOKEN**  
   So the agent can post a comment on the PR. In GitHub Actions you get this automatically as `github.token`; locally you can use a personal access token with `repo` scope.

**Important:** Do not commit real API keys. Use a `.env` file (and add it to `.gitignore`) or CI secrets. `.env.example` only shows placeholder values.

#### How to get API_TOKEN (JWT) for local runs

The backend returns a JWT when you log in. You can get it in either of these ways:

**Method 1 – From the browser (after logging in)**

1. Start the backend (`npm run dev` in `backend/`) and frontend (`npm run dev` in `frontend/`).
2. Open **http://localhost:3000** (or your frontend URL), go to **Login**, and sign in with your email and password. (If you don’t have an account, use **Register** first.)
3. After a successful login, open **Developer Tools** (F12 or right‑click → Inspect).
4. Go to the **Application** tab (Chrome/Edge) or **Storage** tab (Firefox).
5. Under **Local Storage**, select `http://localhost:3000`.
6. Find the key **`auth_token`** and copy its **value** (the long string). That is your `API_TOKEN`; put it in `backend/agents/schema_reviewer/.env` as `API_TOKEN=<paste>`.

**Method 2 – From the API with curl**

1. Ensure the backend is running (e.g. `npm run dev` in `backend/`).
2. Run (replace with your email and password):

   ```bash
   curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"your@email.com\",\"password\":\"yourpassword\"}"
   ```

3. The response looks like: `{"status":"success","data":{"user":{...},"token":"eyJhbGc..."}}`. Copy the value of **`data.token`** (the JWT string). Put it in `backend/agents/schema_reviewer/.env` as `API_TOKEN=<paste>`.

### Step 3: Option A – Ingest base and head in CI

The design you chose is **Option A**: in CI you create two schema snapshots (base and head), then run the agent with their IDs.

- **Base** = schema of the branch you’re merging *into* (e.g. `main`).
- **Head** = schema of the PR branch (the one with the new changes).

Rough flow:

1. In CI, for the **base** branch: get a schema (e.g. run `extract-schema.js` against a DB that has the base migrations applied), send that JSON to `POST /api/v1/schema/ingest`, and save the returned **snapshot ID** (e.g. `SNAPSHOT_ID_BASE`).
2. For the **head** branch: same thing (extract schema, ingest, get **snapshot ID** for head).
3. Run the agent with:
   - `--snapshot-id-base` = base snapshot ID  
   - `--snapshot-id-head` = head snapshot ID  
   - `--pr-owner`, `--pr-repo`, `--pr-number` = the PR where the comment should go.

The agent then:

- Calls the backend to **compare** those two snapshots (schema diff).
- Calls the backend to get **impact score** and ranked issues for the head snapshot.
- Uses **Gemini** to turn that into a review and **posts it** on the PR via the GitHub API.

So “ingest both in CI” means: your pipeline is responsible for creating those two snapshots and passing their IDs into the agent; the agent does not connect to your database.

### Step 4: The three “tools” the agent uses

The agent has three tools (functions it can call):

1. **Get Schema Comparison**  
   Inputs: `snapshot_id_base`, `snapshot_id_head`.  
   Calls your backend: `POST /api/v1/schema/compare`.  
   Returns the diff (added/removed/modified tables, columns, indexes, FKs).

2. **Get Impact Score**  
   Input: `snapshot_id` (the head snapshot).  
   Calls your backend: `GET /api/v1/impact/score/:id` and `GET /api/v1/impact/rank/:id`.  
   Returns health score, issue counts, and top issues.

3. **Post PR Comment**  
   Inputs: `owner`, `repo`, `pull_number`, `body` (Markdown).  
   Calls GitHub: `POST /repos/:owner/:repo/issues/:pull_number/comments`.  
   Posts the review as a normal PR comment.

The agent (Gemini) decides when to call each tool and what to put in the final comment.

### Step 5: GitHub Action (what runs in CI)

There is a workflow file: **`.github/workflows/schema-review.yml`**.

- It runs on **pull requests** to `main` or `master`.
- It expects these **secrets** in the repo: `BACKEND_URL`, `API_TOKEN`, `GEMINI_API_KEY`.  
  `GITHUB_TOKEN` is provided by Actions.
- It:
  1. Checks out the repo.
  2. Prepares **schema_base.json** and **schema_head.json** (from base ref and current ref; see workflow comments for customizing this).
  3. **Ingests** both via your backend (`POST /api/v1/schema/ingest`) and reads the two snapshot IDs from the responses.
  4. Installs Python and the agent’s `requirements.txt`.
  5. Runs **`run_agent.py`** with those snapshot IDs and the PR’s owner, repo, and number.

So in one pipeline you: **ingest base → ingest head → run agent → agent posts the review on the PR**.

### Step 6: Running the agent locally (optional)

From `backend/agents/schema_reviewer/`:

```bash
# Copy env and set real values (do not commit .env)
cp .env.example .env
# Edit .env: GEMINI_API_KEY, BACKEND_URL, API_TOKEN, GITHUB_TOKEN

pip install -r requirements.txt
python run_agent.py \
  --snapshot-id-base <base-uuid> \
  --snapshot-id-head <head-uuid> \
  --pr-owner myorg \
  --pr-repo my-repo \
  --pr-number 42
```

You must have already ingested base and head somewhere (e.g. via the API or the app) so you have the two snapshot UUIDs.

---

## Summary Table

| Piece | What it is |
|-------|------------|
| **Agent** | One CrewAI agent (“Schema Review Specialist”) that uses three tools and Gemini to write and post the review. |
| **LLM** | Gemini (`GEMINI_MODEL`, e.g. `gemini-2.5-flash`), configured via `GEMINI_API_KEY`. |
| **Schema diff** | From your backend: `POST /api/v1/schema/compare` with base and head snapshot IDs. |
| **Impact score** | From your backend: `GET /api/v1/impact/score/:snapshotId` and `GET /api/v1/impact/rank/:snapshotId`. |
| **PR comment** | GitHub API: post the Markdown review as a comment on the PR. |
| **Option A** | CI ingests both base and head schemas, gets two snapshot IDs, then runs the agent with those IDs; the agent never talks to your DB. |
| **Secrets** | `GEMINI_API_KEY`, `BACKEND_URL`, `API_TOKEN`; in Actions, `GITHUB_TOKEN` is automatic. |

---

## Files in This Folder

- **`run_agent.py`** – Entrypoint: builds the CrewAI agent and task, runs the crew with the given snapshot IDs and PR info, uses Gemini.
- **`tools/backend_tools.py`** – Tools that call your backend (schema compare, impact score).
- **`tools/github_tools.py`** – Tool that posts the comment on the PR.
- **`requirements.txt`** – Python deps: `crewai[google-genai]`, `requests`, `python-dotenv`.
- **`.env.example`** – Example env vars (no real keys); copy to `.env` and fill in.
- **`README.md`** – This file.

The workflow that ties Option A to the agent is in the repo root: **`.github/workflows/schema-review.yml`**.
