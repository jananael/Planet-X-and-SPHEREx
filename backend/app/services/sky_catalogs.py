"""Small, provenance-preserving cone searches for the coordinate sky view."""
from __future__ import annotations

import csv
import io
import math
from datetime import datetime, timezone
from typing import Any

import requests

GAIA_TAP = "https://gea.esac.esa.int/tap-server/tap/sync"
SKYBOT_CONE = "https://ssp.imcce.fr/webservices/skybot/api/conesearch.php"


def _float(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def propagate_gaia_position(ra_deg: float, dec_deg: float, pmra_mas_yr: float | None,
                            pmdec_mas_yr: float | None, epoch: datetime) -> tuple[float, float]:
    """Linear tangent-plane propagation from Gaia DR3's J2016.0 reference epoch.

    Gaia pmra is mu_alpha*cos(delta). This first-order propagation deliberately does not
    invent parallax or radial velocity; very high proper-motion sources need a full 6D solution.
    """
    if pmra_mas_yr is None or pmdec_mas_yr is None:
        return ra_deg, dec_deg
    reference_epoch = datetime(2016, 1, 1, 12, tzinfo=timezone.utc)
    years = (epoch.astimezone(timezone.utc) - reference_epoch).total_seconds() / (365.25 * 86400)
    pmra = pmra_mas_yr
    pmdec = pmdec_mas_yr
    dec = max(-90.0, min(90.0, dec_deg + pmdec * years / 3_600_000.0))
    cos_dec = math.cos(math.radians(dec_deg))
    ra_shift = 0.0 if abs(cos_dec) < 1e-8 else pmra * years / (3_600_000.0 * cos_dec)
    return (ra_deg + ra_shift) % 360.0, dec


def gaia_cone(ra: float, dec: float, radius_deg: float, epoch: datetime, limit: int = 300) -> list[dict[str, Any]]:
    query = (
        "SELECT TOP {limit} source_id,ra,dec,ra_error,dec_error,phot_g_mean_mag,pmra,pmdec,parallax "
        "FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS',ra,dec),"
        "CIRCLE('ICRS',{ra},{dec},{radius})) AND astrometric_params_solved > 3 "
        "AND phot_g_mean_mag IS NOT NULL "
        "ORDER BY phot_g_mean_mag ASC"
    ).format(limit=limit, ra=ra, dec=dec, radius=radius_deg)
    response = requests.get(GAIA_TAP, params={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": query}, timeout=(5, 20))
    response.raise_for_status()
    stars = []
    for row in csv.DictReader(io.StringIO(response.text)):
        source_id = row.get("source_id")
        source_ra, source_dec = _float(row.get("ra")), _float(row.get("dec"))
        if not source_id or source_ra is None or source_dec is None:
            continue
        pmra, pmdec = _float(row.get("pmra")), _float(row.get("pmdec"))
        moved_ra, moved_dec = propagate_gaia_position(source_ra, source_dec, pmra, pmdec, epoch)
        stars.append({
            "source_id": str(source_id), "ra_deg": moved_ra, "dec_deg": moved_dec,
            "catalog_ra_deg": source_ra, "catalog_dec_deg": source_dec,
            "g_mag": _float(row.get("phot_g_mean_mag")), "ra_error_mas": _float(row.get("ra_error")),
            "dec_error_mas": _float(row.get("dec_error")), "pmra_mas_yr": pmra,
            "pmdec_mas_yr": pmdec, "parallax_mas": _float(row.get("parallax")),
            "catalog_epoch": "J2016.0", "position_epoch": epoch.isoformat() if pmra is not None and pmdec is not None else "J2016.0",
            "position_method": "linear proper-motion propagation; no radial velocity" if pmra is not None and pmdec is not None else "catalog epoch position; proper motion unavailable",
        })
    return stars


def _sexagesimal_degrees(value: Any, *, ra: bool) -> float | None:
    direct = _float(value)
    if direct is not None:
        return direct
    if not isinstance(value, str):
        return None
    parts = value.strip().replace(":", " ").split()
    if len(parts) != 3:
        return None
    try:
        sign = -1 if parts[0].startswith("-") else 1
        first = abs(float(parts[0]))
        degrees = sign * (first + float(parts[1]) / 60 + float(parts[2]) / 3600)
        return degrees * 15 if ra else degrees
    except ValueError:
        return None


def parse_skybot_payload(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or payload.get("flag", 1) not in (1, "1", True):
        return []
    rows = payload.get("result", payload.get("data", []))
    if isinstance(rows, dict):
        rows = rows.get("data", rows.get("results", []))
    if isinstance(rows, str):
        rows = [line for line in rows.splitlines() if line.strip() and "|" in line]
    objects = []
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict):
            get = lambda *keys: next((row[k] for k in keys if k in row), None)
            name, ra_raw, dec_raw = get("name", "Name", "object_name"), get("ra", "RA", "alpha"), get("dec", "DEC", "delta")
            kind, mag, error = get("class", "type", "Class"), get("mag", "V", "magnitude"), get("posunc", "error", "position_error")
        elif isinstance(row, str):
            fields = [field.strip() for field in row.split("|")]
            if len(fields) < 7 or fields[0].lower().startswith("number"):
                continue
            name, ra_raw, dec_raw, kind, mag, error = fields[1:7]
        else:
            continue
        ra_deg, dec_deg = _sexagesimal_degrees(ra_raw, ra=True), _sexagesimal_degrees(dec_raw, ra=False)
        if ra_deg is None or dec_deg is None:
            continue
        objects.append({"name": str(name or "Unnumbered object"), "ra_deg": ra_deg % 360,
                        "dec_deg": dec_deg, "object_type": str(kind or "Solar-system object"),
                        "visual_magnitude": _float(mag), "position_error_arcsec": _float(error)})
    return objects


def skybot_cone(ra: float, dec: float, radius_deg: float, epoch: datetime) -> list[dict[str, Any]]:
    response = requests.get(SKYBOT_CONE, params={
        "RA": ra, "DEC": dec, "SR": radius_deg, "TIME": epoch.astimezone(timezone.utc).isoformat(),
        "VERB": 3, "RESPONSEFORMAT": "json", "observer": "500", "filter": 120, "MAXREC": 200,
    }, timeout=(5, 25))
    response.raise_for_status()
    return parse_skybot_payload(response.json())


def query_sky_objects(ra: float, dec: float, radius_deg: float, epoch: datetime) -> dict[str, Any]:
    result: dict[str, Any] = {"center": {"ra_deg": ra, "dec_deg": dec}, "radius_deg": radius_deg,
                              "epoch_utc": epoch.astimezone(timezone.utc).isoformat(), "stars": [], "solar_system_objects": [],
                              "providers": {}}
    for key, query in (("gaia_dr3", gaia_cone), ("skybot", skybot_cone)):
        try:
            values = query(ra, dec, radius_deg, epoch)
            target = "stars" if key == "gaia_dr3" else "solar_system_objects"
            result[target] = values
            result["providers"][key] = {"status": "available", "count": len(values)}
        except (requests.RequestException, ValueError, KeyError) as exc:
            result["providers"][key] = {"status": "unavailable", "reason": type(exc).__name__}
    return result
