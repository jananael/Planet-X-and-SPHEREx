"""Build the facts behind the "Explain it simply" player.

The player re-uses the REAL frames the user already loaded; this module only adds:
- which known demo object (if any) is in the field,
- where that object is PREDICTED to be in each frame (Gaia / literature proper motion, JPL Horizons,
  or the synthetic truth in mock mode), as a position on the north-up image,
- simple numbers: time between frames, how far it moved, which way.
Nothing here is a detection or a measurement: the notes say so, and the UI shows them.
"""
from __future__ import annotations

import math

from app.errors import BadRequest
from app.schemas import Observation, Target
from app.schemas.explain import ExplainFrame, ExplainObject, ExplainResponse
from app.services.data_source import DataSource, angular_separation_deg

PIXEL_ARCSEC = 6.15
SOLAR_SYSTEM = {"asteroid", "comet"}
MAX_FRAMES = 12


def _image_fraction(ra: float, dec: float, center_ra: float, center_dec: float, size_arcsec: float) -> tuple[float, float]:
    """Sky position -> (x, y) fraction of a north-up / east-left image centred on (center_ra, center_dec)."""
    dra = (ra - center_ra + 180.0) % 360.0 - 180.0
    east = dra * math.cos(math.radians(center_dec)) * 3600
    north = (dec - center_dec) * 3600
    return 0.5 - east / size_arcsec, 0.5 - north / size_arcsec


def _direction(east: float, north: float) -> str | None:
    if math.hypot(east, north) == 0:
        return None
    names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]
    angle = math.degrees(math.atan2(east, north)) % 360  # position angle, east of north
    return names[int((angle + 22.5) // 45) % 8]


def _pick_target(targets: list[Target], ra: float, dec: float, size_arcsec: float) -> Target | None:
    reach = size_arcsec / 3600  # generous: the object only has to be near the field, positions are checked later
    near = [(angular_separation_deg(ra, dec, t.ra, t.dec), t) for t in targets]
    near = [item for item in near if item[0] <= reach]
    return min(near, key=lambda item: item[0])[1] if near else None


def explain(ds: DataSource, ra: float, dec: float, size_arcsec: float, observation_ids: list[str]) -> ExplainResponse:
    if not observation_ids:
        raise BadRequest("Pass the observation ids shown in the viewer (ids=...)")
    if len(observation_ids) > MAX_FRAMES:
        raise BadRequest(f"At most {MAX_FRAMES} frames can be explained at once")
    observations: list[Observation] = sorted((ds.get_observation(i) for i in observation_ids), key=lambda o: o.obs_time)
    target = _pick_target(ds.list_targets(), ra, dec, size_arcsec)
    span = max(8, round(size_arcsec / PIXEL_ARCSEC)) * PIXEL_ARCSEC  # what the PNG actually covers
    notes = ["Synthetic demo images (mock mode): nothing here is real data." if ds.name == "mock" else
             "Real SPHEREx images from NASA/IPAC IRSA.",
             "The circle shows where the object is PREDICTED to be, not a detection."]

    frames: list[ExplainFrame] = []
    positions: list[tuple[float, float] | None] = []
    source = None
    for obs in observations:
        frame = ExplainFrame(observation_id=obs.id, obs_time=obs.obs_time, band=obs.band, release=obs.release)
        pos = ds.predicted_position(target, obs) if target else None
        if pos is not None:
            p_ra, p_dec, source = pos
            x, y = _image_fraction(p_ra, p_dec, ra, dec, span)
            frame.x, frame.y = round(x, 4), round(y, 4)
            frame.inside = 0 <= x <= 1 and 0 <= y <= 1
            positions.append((p_ra, p_dec))
        else:
            positions.append(None)
        frames.append(frame)

    elapsed = ((observations[-1].obs_time - observations[0].obs_time).total_seconds() / 3600
               if len(observations) > 1 else None)
    known = [p for p in positions if p is not None]
    displacement = direction = None
    if target is not None and len(known) >= 2:
        (ra1, dec1), (ra2, dec2) = known[0], known[-1]
        east = ((ra2 - ra1 + 180) % 360 - 180) * math.cos(math.radians((dec1 + dec2) / 2)) * 3600
        north = (dec2 - dec1) * 3600
        displacement, direction = math.hypot(east, north), _direction(east, north)

    if target is None or not known:
        kind = "no_known_object"
        target_out = None
        notes.append("No known demo object is predicted in this field: the explanation stays general.")
    else:
        if target.type == "variable":
            kind = "brightness"
        elif displacement is not None and displacement >= (PIXEL_ARCSEC if target.type in SOLAR_SYSTEM else 3 * PIXEL_ARCSEC):
            kind = "moves"  # stars only count as "moves" when the shift is obvious (>= 3 px); otherwise "creeps"
        else:
            kind = "creeps"
        target_out = ExplainObject(id=target.id, name=target.name, type=target.type, description=target.description,
                                   validation_status=target.validation_status, position_source=source or "unknown")
        if any(f.x is None for f in frames):
            notes.append("No prediction for some frames (outside the object's verified time window): no circle there.")
        if source and source.startswith("JPL Horizons"):
            notes.append("Positions from JPL Horizons are geocentric; SPHEREx orbits Earth, so they can be off by a few arcsec.")

    return ExplainResponse(
        kind=kind, object=target_out, frames=frames, image_size_arcsec=round(span, 2), pixel_scale_arcsec=PIXEL_ARCSEC,
        elapsed_hours=round(elapsed, 3) if elapsed is not None else None,
        displacement_arcsec=round(displacement, 2) if displacement is not None else None,
        displacement_pixels=round(displacement / PIXEL_ARCSEC, 2) if displacement is not None else None,
        direction=direction, notes=notes, is_mock=ds.name == "mock",
    )
