### Schema Intelligence – Project Setup Guide

This document explains how to set up the **Schema Intelligence** project locally and how to **extract a PostgreSQL schema** for analysis.

---

### 1. Prerequisites

- **Node.js**: v18 or later  
- **npm**: comes with Node  
- **PostgreSQL**: running instance (for:
  - the app’s own database, and
  - any target database you want to analyze)
- **Git**

Clone the repo and go to the project root:

```bash
git clone git@github.com:euron-code-labs/postgresql-schema-intelligence-app.git
cd postgresql-schema-intelligence-app   # e.g. D:\Euron\schema-Intelligence
```

---

### 2. Backend Setup (`backend/`)

#### 2.1 Install dependencies

```bash
cd backend
npm install
```

#### 2.2 Configure environment

Create `.env` from the example:

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- **App database (Prisma uses this)**  
  - `DATABASE_URL=postgresql://user:password@localhost:5432/schema_intelligence`
- **Auth**
  - `JWT_SECRET=<long-random-secret>`
- **CORS (optional for local)**
  - `CORS_ORIGIN=http://localhost:3000`
- **AI keys (optional but recommended)**
  - `GEMINI_API_KEY=<your_gemini_key>`  
  - `OPENAI_API_KEY=<your_openai_key>` (fallback)

> The `DB_*` variables in `.env` are used only by the **schema extraction script** (section 4).

#### 2.3 Initialize the app database

Run Prisma migrations:

```bash
cd backend
npx prisma migrate deploy        # or: npx prisma migrate dev (for local dev)
```

#### 2.4 Build and run backend

```bash
cd backend
npm run build    # compiles TypeScript
npm run start    # production-style start
```

For development with hot reload:

```bash
npm run dev
```

Backend base URL (default): `http://localhost:3001`

---

### 3. Frontend Setup (`frontend/`)

#### 3.1 Install dependencies

```bash
cd ../frontend
npm install
```

#### 3.2 Configure environment

Create `.env.local`:

```bash
echo NEXT_PUBLIC_API_URL=http://localhost:3001/api > .env.local
```

This tells the Next.js app where to reach the backend API.

#### 3.3 Run frontend

Development:

```bash
cd frontend
npm run dev
```

Open: `http://localhost:3000`

Production build:

```bash
npm run build
npm run start
```

---

### 4. Extracting a PostgreSQL Schema (`backend/scripts/extract-schema.js`)

Use this when you want Schema Intelligence to analyze a **real PostgreSQL database**.

#### 4.1 Configure target DB connection

In `backend/.env`, set the **target database** details:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_target_database
DB_USER=postgres
DB_PASSWORD=your_password

# Optional output override (defaults to ./scripts/schema.json if unset)
OUTPUT_FILE=./scripts/schema.json
```

> This is **separate** from `DATABASE_URL`.  
> `DATABASE_URL` is for the app’s own DB; `DB_*` is the DB you want to scan.

#### 4.2 Run the extraction script

From the `backend` folder:

```bash
cd backend
node scripts/extract-schema.js
```

The script will:

- Connect to `DB_HOST:DB_PORT` / `DB_NAME` with `DB_USER` and `DB_PASSWORD`.
- Read tables, columns, indexes, and foreign keys (including types, sizes, precisions).
- Write a JSON schema file to `OUTPUT_FILE` (e.g. `backend/scripts/schema.json`).

You can open the generated JSON (for reference) or use it directly in the UI.

---

### 5. Ingesting the Extracted Schema into the App

Once backend and frontend are running:

1. Go to `http://localhost:3000`.
2. Log in (or register) and open the **Databases / Ingest** page.
3. Provide:
   - **Database name** (e.g. `volunteer_db`),
   - **Database type**: select `postgresql`,
   - Upload or paste the contents of the generated schema file (e.g. `backend/scripts/schema.json`).
4. Submit the form.

The app will:

- Create a **snapshot** of that schema,
- Run **health scoring**, issue detection, and **Schema Advisor** analysis,
- Enable **comparison**, **rollback SQL**, and **AI-powered** recommendations for that database.

You can then explore:

- `Dashboard` → overall health & issues,  
- `Schemas` → table/column/index/FK details,  
- `Issues` / `SQL Generator` → AI-generated fixes,  
- `Compare` → snapshot diffs + rollback SQL,  
- `Schema Advisor` → normal forms, pitfalls, and PostgreSQL best practices.

