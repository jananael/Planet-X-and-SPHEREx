# Planet X × SPHEREx — NASA Space Apps Hackathon

Monorepo for our NASA Space Apps Challenge entry (challenge: **Planet X and SPHEREx**).
The idea: browse candidate cold / high-proper-motion objects (brown dwarfs, Planet-X-like
targets) and compare their observations across surveys (WISE / NEOWISE / SPHEREx).

## Structure

```
.
├── backend/    # FastAPI service (Python 3.11+)
├── frontend/   # Next.js app (owned by the frontend teammate — empty for now)
├── docs/       # API contract, open questions
└── mock/       # Versioned mock data (*.v0.json) used by the backend's MockSource
```

## Quick start (backend)

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

- API: <http://localhost:8000/api/health>
- Interactive docs (Swagger): <http://localhost:8000/docs>
- Tests: `pytest` (from `backend/`)

### Configuration (env vars, see `backend/.env.example`)

| Var | Default | Meaning |
|---|---|---|
| `DATA_SOURCE` | `mock` | `mock` reads `mock/*.v0.json`; `real` uses `RealSource` (not implemented yet) |
| `MOCK_DIR` | `<repo>/mock` | Folder holding the mock JSON files |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed origins |

## Frontend

`frontend/` is reserved for the Next.js app (dev server on `localhost:3000`, which the
backend already allows via CORS). Build against [`docs/api-contract.md`](docs/api-contract.md)
and the files in [`mock/`](mock/) — they describe exactly what the backend returns.

## Docs

- [`docs/api-contract.md`](docs/api-contract.md) — endpoints, response shapes, error format
- [`docs/questions-for-yazan.md`](docs/questions-for-yazan.md) — open questions about the data
