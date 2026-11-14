"""Object name -> sky coordinates, for the Sky Navigator's "Find" box.

The browser cannot reach CDS (cds.unistra.fr) from every network, and Aladin's own lookup goes there.
We query the Sesame name resolver on its CfA mirror instead (SIMBAD / NED / VizieR behind it), and keep
a few well-known objects locally so the quick buttons answer instantly even offline.
"""
from __future__ import annotations

import re
from functools import lru_cache

import requests
from fastapi import APIRouter, Query

from app.errors import BadRequest, NotFound, UpstreamError

router = APIRouter(tags=["resolve"])

SESAME = "https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/-oxp/SNV"
# J2000 (ICRS) positions from SIMBAD.
KNOWN = {
    "m31": ("M31 · Andromeda Galaxy", 10.684708, 41.268750),
    "andromeda": ("M31 · Andromeda Galaxy", 10.684708, 41.268750),
    "m42": ("M42 · Orion Nebula", 83.822083, -5.391111),
    "orion nebula": ("M42 · Orion Nebula", 83.822083, -5.391111),
    "m45": ("M45 · Pleiades", 56.750000, 24.116667),
    "pleiades": ("M45 · Pleiades", 56.750000, 24.116667),
}


@lru_cache(maxsize=512)
def _sesame(name: str) -> tuple[str, float, float] | None:
    try:
        r = requests.get(f"{SESAME}?{requests.utils.quote(name)}", timeout=15)
        r.raise_for_status()
    except requests.RequestException as e:
        raise UpstreamError(f"Name resolver unavailable: {e.__class__.__name__}") from e
    ra, dec = re.search(r"<jradeg>([-\d.]+)</jradeg>", r.text), re.search(r"<jdedeg>([-\d.]+)</jdedeg>", r.text)
    if not (ra and dec):
        return None
    oname = re.search(r"<oname>([^<]+)</oname>", r.text)
    return (oname.group(1).strip() if oname else name), float(ra.group(1)), float(dec.group(1))


@router.get("/resolve")
def resolve(name: str = Query(..., min_length=1, max_length=120)) -> dict:
    key = " ".join(name.lower().split())
    if not re.search(r"[a-z]", key):
        raise BadRequest("Enter an object name such as M31; use the RA/Dec fields for coordinates.")
    if key in KNOWN:
        label, ra, dec = KNOWN[key]
        return {"name": label, "ra": ra, "dec": dec, "source": "built-in (SIMBAD J2000)"}
    hit = _sesame(key)
    if hit is None:
        raise NotFound(f"No object called “{name.strip()}” was found.")
    label, ra, dec = hit
    return {"name": label, "ra": ra, "dec": dec, "source": "Sesame (CDS) via CfA mirror"}
