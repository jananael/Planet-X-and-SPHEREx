# Planet X × SPHEREx — NASA Space Apps Hackathon

Monorepo for our NASA Space Apps Challenge entry (challenge: **Planet X and SPHEREx**).
The idea: a public **infrared "blink comparator"**. Pick a point or a demo target, list every
SPHEREx image covering it, and flip between epochs to see what moved or changed
(asteroids, comets, nearby stars, variables). Every frame shows its source file, time and wavelength.

## Structure

```
.
├── backend/              # FastAPI (Python 3.11+): wraps IRSA (SIA2 + cutouts) for the frontend
│   ├── app/
│   │   ├── routers/      # health, targets, observations, search
│   │   ├── schemas/      # Pydantic models = the API contract
│   │   ├── services/     # data_source.py (Mock/Real), image_service.py (pixels -> PNG), mock_sky.py
│   │   └── mock_data/    # targets.v0.json, observations.v0.json
│   ├── scripts/          # generate_mock.py
│   └── tests/
├── frontend/             # Next.js app (Sadeel), empty for now
└── docs/                 # API contract, open questions for the science team
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
| `DATA_SOURCE` | `mock` | `mock` = JSON + synthetic images; `real` = live SPHEREx data from IRSA |
| `MOCK_DIR` | `backend/app/mock_data` | Mock JSON files (the curated target list is used in both modes) |
| `CACHE_DIR` | `backend/.cache` | Real mode: remembered search results + cutout FITS |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed origins |

Routers only call the `DataSource` interface, so switching to real data is one env var.

### Real mode

```bash
DATA_SOURCE=real uvicorn app.main:app --port 8000
```

Live SPHEREx data from IRSA (QR2 + QR3): search via SIA2, cutouts reprojected north-up, cached in
`backend/.cache/`. The first image per observation takes 5–30 s; cached ones are instant. Details and
differences from mock: [`docs/api-contract.md`](docs/api-contract.md#real-data-mode-data_sourcereal).

Tests: `pytest` runs offline (IRSA is faked). `RUN_NETWORK_TESTS=1 pytest -k network` hits the real archive.

> **Windows:** put the venv on a short path (e.g. `C:\venvs\planetx`). astropy fails to load its DLLs
> from very long paths ("The filename or extension is too long").

### Mock mode
`/image` renders **synthetic** cutouts: fixed background stars per field, plus the target at its
position for that epoch, plus noise. Blinking already works end-to-end: Vesta moves, Mira dims, and
WISE 0855 barely moves (which is the real resolution limit). Regenerate the JSON with
`python scripts/generate_mock.py`.

## Frontend

`frontend/` is reserved for the Next.js app (dev server on `localhost:3000`, already allowed by
CORS). Build against [`docs/api-contract.md`](docs/api-contract.md). It includes a "blink recipe"
with the exact calls and headers to use.

## Docs

- [`docs/api-contract.md`](docs/api-contract.md) — endpoints, response shapes, error format
- [`docs/questions-for-yazan.md`](docs/questions-for-yazan.md) — open questions about the data

## Data credit
SPHEREx data: NASA/JPL-Caltech, served by NASA/IPAC Infrared Science Archive (IRSA).
Everything in `mock_data/` and every image in mock mode is synthetic. We make no discovery claims.
