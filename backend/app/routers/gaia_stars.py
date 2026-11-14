"""Real stars around a sky position, with distances, for the Learning lab's 3D view.

Gaia DR3 (ESA) queried through NASA/IPAC IRSA's TAP service (table gaia_dr3_source). Only stars with a
well-measured parallax (parallax_over_error > 5) are returned, so each one has a real distance.
Results are cached on disk: the same cone is queried once.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
from typing import Annotated

import requests
from fastapi import APIRouter, Query

from app.config import get_settings
from app.errors import UpstreamError

router = APIRouter(tags=["gaia"])
IRSA_TAP = "https://irsa.ipac.caltech.edu/TAP/sync"
LY_PER_PC = 3.26156


def _query(ra: float, dec: float, radius: float, limit: int) -> list[dict]:
    adql = (f"SELECT TOP {limit} source_id,ra,dec,parallax,parallax_error,phot_g_mean_mag,bp_rp FROM gaia_dr3_source "
            f"WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{ra:.6f},{dec:.6f},{radius:.4f}))=1 "
            f"AND parallax_over_error>5 ORDER BY phot_g_mean_mag")
    try:
        r = requests.post(IRSA_TAP, data={"QUERY": adql, "FORMAT": "csv", "LANG": "ADQL", "REQUEST": "doQuery"}, timeout=90)
        r.raise_for_status()
    except requests.RequestException as e:
        raise UpstreamError(f"Gaia query via IRSA failed: {e.__class__.__name__}") from e
    stars = []
    for row in csv.DictReader(io.StringIO(r.text)):
        try:
            plx = float(row["parallax"])
            if plx <= 0:
                continue
            stars.append({
                "source_id": row["source_id"], "ra": float(row["ra"]), "dec": float(row["dec"]),
                "parallax_mas": plx, "parallax_error_mas": float(row["parallax_error"]),
                "distance_ly": round(1000.0 / plx * LY_PER_PC, 1),
                "g_mag": float(row["phot_g_mean_mag"]) if row["phot_g_mean_mag"] else None,
                "bp_rp": float(row["bp_rp"]) if row.get("bp_rp") else None,
            })
        except (KeyError, ValueError):
            continue
    return stars


@router.get("/gaia-stars")
def gaia_stars(
    ra: Annotated[float, Query(ge=0, lt=360)],
    dec: Annotated[float, Query(ge=-90, le=90)],
    radius: Annotated[float, Query(gt=0, le=1)] = 0.25,
    limit: Annotated[int, Query(ge=1, le=500)] = 150,
) -> dict:
    key = hashlib.sha1(f"{ra:.5f},{dec:.5f},{radius:.4f},{limit}".encode()).hexdigest()[:20]
    path = get_settings().cache_dir / "gaia" / f"{key}.json"
    if path.exists():
        stars = json.loads(path.read_text(encoding="utf-8"))
    else:
        stars = _query(ra, dec, radius, limit)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(stars), encoding="utf-8")
    return {"center": {"ra": ra, "dec": dec}, "radius_deg": radius, "count": len(stars), "stars": stars,
            "source": "Gaia DR3 (ESA) via NASA/IPAC IRSA TAP · parallax_over_error > 5 · distance = 1/parallax"}
