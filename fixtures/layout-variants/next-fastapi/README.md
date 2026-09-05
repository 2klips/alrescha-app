# next-fastapi

`frontend/` (Next.js), `backend/` (FastAPI) and `db/` (SQL) — the three-tier
shape a repository outside this monorepo's conventions actually has.

The API lives in `backend/app/api/routes.py` and its settings in
`backend/app/core/config.py`; the front end reads them through
`frontend/lib/api.ts`.
