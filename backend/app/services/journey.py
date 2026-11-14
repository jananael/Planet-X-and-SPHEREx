"""Data for the object's "journey" video: everything comes from JPL Horizons and the SPHEREx inventory.

- Solar System view: heliocentric ecliptic positions (AU) of the object and of Earth, Mars, Jupiter,
  sampled over the SPHEREx coverage window, plus one full orbit (or a long open path for 3I/ATLAS).
- Sky view: the object's geocentric RA/Dec track over the same window.
- SPHEREx moments: the exposures in docs/inventory/<target>.csv (Horizons position inside the real
  image footprint, Taqwa/Yazan reviewed), grouped into visits.
Results are cached on disk (.cache/journey/<target>.json): Horizons is called once per target.
"""
from __future__ import annotations

import csv
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from app.errors import NotFound, UpstreamError

log = logging.getLogger(__name__)

REPO = Path(__file__).resolve().parents[3]
INVENTORY = REPO / "docs" / "inventory"
WINDOW = ("2025-05-01", "2026-10-01")  # SPHEREx DR1 + QR3 coverage
CACHE_VERSION = 2
YEARS = ("2020-01-01", "2030-12-31")  # the "Simple explanation" sky: ten years of the object's path

# Horizons ids and how much of the orbit to draw for each supported object.
OBJECTS = {
    "vesta": {"name": "(4) Vesta", "type": "asteroid", "horizons": {"id": "4", "id_type": "smallbody"},
              "ephem": {}, "orbit": ("2024-03-01", "2027-11-01", "10d"),
              "fact": "Main-belt asteroid, about 525 km across, orbits the Sun every 3.6 years."},
    "3i-atlas": {"name": "3I/ATLAS (C/2025 N1)", "type": "comet", "horizons": {"id": "3I", "id_type": "designation"},
                 "ephem": {"closest_apparition": True, "no_fragments": True}, "orbit": ("2025-01-01", "2027-01-01", "5d"),
                 "years": ("2025-06-01", "2026-06-30"),  # only seen for about a year: no ten-year path to show
                 "fact": "Only the third object known to come from outside the Solar System: it passes once and leaves."},
}
PLANETS = {"Earth": ("399", ("2025-05-01", "2026-05-01", "5d")),
           "Mars": ("499", ("2025-05-01", "2027-03-20", "10d")),
           "Jupiter": ("599", ("2015-01-01", "2026-11-01", "60d"))}


def _vectors(hid: dict, span: tuple[str, str, str], ephem: dict | None = None) -> list[list]:
    from astroquery.jplhorizons import Horizons
    start, stop, step = span
    tab = Horizons(location="@sun", epochs={"start": start, "stop": stop, "step": step}, **hid).vectors(
        refplane="ecliptic", **(ephem or {}))
    return [[str(r["datetime_str"])[5:16], round(float(r["x"]), 4), round(float(r["y"]), 4)] for r in tab]


def _sky(hid: dict, ephem: dict, span: tuple[str, str] = WINDOW, step: str = "3d") -> list[list]:
    from astroquery.jplhorizons import Horizons
    tab = Horizons(location="500", epochs={"start": span[0], "stop": span[1], "step": step}, **hid).ephemerides(**ephem)
    return [[str(r["datetime_str"])[:11], round(float(r["RA"]), 4), round(float(r["DEC"]), 4)] for r in tab]


def _dates(rows: list[list]) -> list[list]:
    """Horizons 'YYYY-Mon-DD HH:MM' -> ISO date for the frontend."""
    out = []
    for row in rows:
        try:
            t = datetime.strptime(row[0].strip()[:11], "%Y-%b-%d")
        except ValueError:
            t = datetime.strptime(row[0].strip()[:11], "%Y-%m-%d")
        out.append([t.strftime("%Y-%m-%d"), *row[1:]])
    return out


def _observations(target_id: str) -> tuple[list[dict], list[dict]]:
    path = INVENTORY / f"{target_id}.csv"
    if not path.exists():
        return [], []
    seen: dict[str, dict] = {}
    with path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            seen.setdefault(row["obs_id"], {"utc": row["utc_mid"], "visit": int(row["visit"]), "release": row["release"],
                                            "ra": float(row["ra"]), "dec": float(row["dec"])})
    exposures = sorted(seen.values(), key=lambda e: e["utc"])
    visits: dict[int, dict] = {}
    for e in exposures:
        v = visits.setdefault(e["visit"], {"visit": e["visit"], "from": e["utc"][:10], "to": e["utc"][:10], "exposures": 0,
                                           "releases": set()})
        v["to"] = e["utc"][:10]; v["exposures"] += 1; v["releases"].add(e["release"])
    return exposures, [{**v, "releases": sorted(v["releases"])} for v in visits.values()]


def journey(target_id: str, cache_dir: Path, real_view: dict | None = None) -> dict:
    if target_id not in OBJECTS:
        raise NotFound(f"No journey for '{target_id}'. Available: {', '.join(OBJECTS)}")
    cache = cache_dir / f"{target_id}.json"
    if cache.exists():
        data = json.loads(cache.read_text(encoding="utf-8"))
        if data.get("cache_version") == CACHE_VERSION:
            data["highlight"] = real_view
            return data
    obj = OBJECTS[target_id]
    try:
        bodies = [{"name": obj["name"], "kind": "object",
                   "orbit": _dates(_vectors(obj["horizons"], obj["orbit"], obj["ephem"])),
                   "track": _dates(_vectors(obj["horizons"], (*WINDOW, "2d"), obj["ephem"]))}]
        for name, (hid, span) in PLANETS.items():
            bodies.append({"name": name, "kind": "planet", "orbit": _dates(_vectors({"id": hid}, span)),
                           "track": _dates(_vectors({"id": hid}, (*WINDOW, "4d")))})
        sky = _dates(_sky(obj["horizons"], obj["ephem"]))
        years_span = obj.get("years", YEARS)
        sky_years = _dates(_sky(obj["horizons"], obj["ephem"], years_span, "7d"))
    except Exception as exc:  # Horizons unreachable: say so, never draw an invented path
        log.warning("Horizons failed for journey %s: %s", target_id, exc)
        raise UpstreamError(f"JPL Horizons is unavailable, the journey cannot be built right now ({type(exc).__name__})") from exc
    exposures, visits = _observations(target_id)
    data = {
        "cache_version": CACHE_VERSION, "target": {"id": target_id, "name": obj["name"], "type": obj["type"], "fact": obj["fact"]},
        "window": {"start": WINDOW[0], "end": WINDOW[1]}, "bodies": bodies, "sky_track": sky,
        "sky_years": sky_years, "years": {"start": years_span[0], "end": years_span[1]},
        "spherex_exposures": exposures, "spherex_visits": visits,
        "sources": ["Positions: JPL Horizons (heliocentric ecliptic vectors; geocentric RA/Dec)",
                    "SPHEREx moments: SKYTRACE observation inventory (Horizons position inside each image footprint)",
                    "Images: NASA SPHEREx via NASA/IPAC IRSA"],
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data), encoding="utf-8")
    data["highlight"] = real_view
    return data
