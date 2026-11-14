# SKYTRACE

SKYTRACE makes astronomical data explorable and understandable. The app combines a real SPHEREx archive Explorer with an educational Visualization workspace. Candidate analyses and motion tracks remain provisional; SKYTRACE does not claim a Planet X discovery or validated moving objects.

## Run the Visualization experience

Requires Node.js 22 or later.

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:3000/visualization>. The 3D scene, sky map, spectrum, pixel field, band comparison and timeline use local illustrative demo data. The interface labels it **“Illustrative Demo Data — Not Live NASA Data.”** Demo coordinates, values, spectrum, pixel field and time labels are not astronomical measurements.

The root page is the supplied animated SKYTRACE homepage. The Explorer and observations routes use the FastAPI backend described below.

## Run the real SPHEREx Explorer

Requires Python 3.12+, Node.js 22+, and network access to NASA/IPAC IRSA.

Terminal 1 — backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DATA_SOURCE=real uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2 — frontend:

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:3000/explore>. Confirm `/api/health` reports `"data_source":"real"`. Do not use the synthetic `npm run mock:api` preview for a real-data demonstration.

## Current workflow

1. Search the SPHEREx archive by coordinates and supported constraints.
2. Inspect observations, timestamps, bands and provenance.
3. Compare selected images or run the separately scoped regional candidate analysis.
4. Read the Visualization experience's explanations alongside its visibly labeled demo data.

The Visualization page does not yet read live NASA data. Future provider integration is documented in [the NASA API integration matrix](docs/product/nasa-api-integration-matrix.md); it is discovery documentation, not an implemented multi-provider API layer.

## Architecture

- `frontend/`: Next.js homepage, Explorer, observations and Visualization experience.
- `backend/`: FastAPI search, IRSA/SPHEREx retrieval, FITS/WCS processing and candidate APIs.
- `docs/api-contract.md`: current backend API contract.
- `docs/source-detection.md`: detection behavior and limitations.
- `docs/workspace-navigation.md`: current route, state and data boundaries.
- `docs/science/`: retained Y2 scientific reports and reproducibility material.

## Scientific limits

- Source detection and motion outputs are provisional. The Y2 work is not scientifically complete.
- Gaia DR3 positional coincidences are diagnostic only; calibration-star independence is not established.
- Positional and motion uncertainty, completeness and false-positive performance remain incomplete where the existing reports say so.
- Illustrative Visualization fixtures are not survey data, validation evidence or discoveries.

## Checks

```bash
# Frontend, from frontend/
npm test
npm run typecheck
npm run build

# Backend, from backend/ after installing requirements-dev.txt
pytest -q
```
