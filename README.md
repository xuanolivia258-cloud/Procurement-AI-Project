# CARI Procurement Project Tracking

Team-ready procurement tracking system built with React, FastAPI, and SQLite.

## Current mode

Authentication is intentionally disabled for local evaluation. Every request runs as `local-test-user` with administrator privileges. The backend exposes an authentication dependency so a future external identity API can replace the local actor without changing procurement services.

The old root-level `index.html`, `script.js`, `styles.css`, `server.js`, and `package.json` are retained only as prototype reference. The supported application lives in `frontend/` and `backend/`.

## Start with Docker

Install Docker Desktop, then run from this directory:

```powershell
docker compose up --build
```

Open <http://localhost:8080>. API documentation is available at <http://localhost:8000/docs>.

The SQLite file is stored in the Docker volume `test_procurement_data` (the exact prefix follows the Compose project name). Rebuilding containers does not remove it.

Stop the application:

```powershell
docker compose down
```

To deliberately remove all local application data:

```powershell
docker compose down -v
```

## Run without Docker

Backend (Python 3.12 recommended):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Frontend (Node.js 22 recommended), in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server proxies `/api` to `http://localhost:8000` by default.

## Exchange rate service

The Budget section requests live rates from the backend, which calls the Huawei iData Finance batch exchange-rate service. Configure `EXCHANGE_RATE_TENANT_ID` with the calling application's 32-character enterprise tenant ID before requesting a non-USD rate. The default endpoint is the documented service-sink (medium-security) HTTPS access point; use `EXCHANGE_RATE_API_URL` to select the E-zone endpoint when required. `EXCHANGE_RATE_RATE_TYPE` defaults to `SPOT`.

## Database changes and tests

Create and apply a migration from `backend/`:

```powershell
alembic revision --autogenerate -m "describe change"
alembic upgrade head
pytest
```

Build-check the frontend:

```powershell
cd frontend
npm run build
```

## Backup and restore

For a non-Docker backend, create a consistent online backup:

```powershell
cd backend
python scripts/backup.py
```

For Docker, run the backup inside the backend container and copy the result out, or mount a backup directory. To restore, stop the backend, preserve the current database, replace `procurement.db` with a verified backup, and start the service again.

## Backend logs

Backend logs are persisted in the Docker data volume under `/app/data/logs`:

- `backend-access.log`: request path, status, actor, request ID, and duration.
- `backend-operations.log`: project operations, exchange-rate calls, exports, and service startup.
- `backend-errors.log`: validation/HTTP failures and full stack traces for unexpected server errors.

Each log rotates at 5 MB and keeps five history files. View recent entries with:

```powershell
docker compose exec backend sh -c "tail -n 50 /app/data/logs/backend-errors.log"
docker compose exec backend sh -c "tail -n 50 /app/data/logs/backend-operations.log"
docker compose exec backend sh -c "tail -n 50 /app/data/logs/backend-access.log"
```

## SQLite operating boundary

SQLite runs with WAL, foreign keys, and a 15-second busy timeout. This deployment uses one backend instance and is intended for a 10–50-person, read-heavy internal team. If the system later needs multiple backend replicas, high-frequency writes, or high availability, migrate the SQLAlchemy models to PostgreSQL.
