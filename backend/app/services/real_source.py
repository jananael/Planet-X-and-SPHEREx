"""RealSource: live SPHEREx data from IRSA (SIA2 search + cutouts).

Ids come from /api/search. Each search remembers its records (memory + disk), so
/observations/{id} and /image work for any id a search has returned, also after a restart.
Cutout FITS files are cached on disk (IRSA cutouts take 8-30 s).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np

from app.errors import BadRequest, NoCoverage, NotFound, UpstreamError
from app.schemas import Footprint, Observation, Target
from app.schemas.candidate import Candidate
from app.services import irsa
from app.services.data_source import Cutout, DataSource, angular_separation_deg


REAL_EPOCH = 2026.0  # middle of the SPHEREx DR1 + QR3 coverage (mid-2025 to late 2026)
SOLAR_SYSTEM = {"asteroid", "comet"}
SEARCH_TTL_S = 24 * 3600


def propagate(target: Target, epoch: float) -> Target:
    """Move a target from its position_epoch to `epoch` using its CATALOGUE proper motion."""
    pm, start = target.catalog_motion, target.position_epoch
    if pm is None or start is None:
        return target
    years = epoch - start
    dec = target.dec + pm.pm_dec_mas_yr / 1000 * years / 3600
    ra = (target.ra + pm.pm_ra_cosdec_mas_yr / 1000 * years / 3600 / math.cos(math.radians(target.dec))) % 360
    return target.model_copy(update={"ra": round(ra, 6), "dec": round(dec, 6), "position_epoch": epoch})


# The engine analyses one 1800" cutout per frame, centred on the query. Detections can only come from
# inside it, so a larger radius would silently return partial results: refuse it instead.
CANDIDATE_CUTOUT_ARCSEC = 1800.0
MAX_CANDIDATE_RADIUS_DEG = CANDIDATE_CUTOUT_ARCSEC / 2 / 3600  # 0.25 deg

_SAFE_ID = re.compile(r"[A-Za-z0-9_.+-]{1,200}")


class RealSource(DataSource):
    name = "real"

    def __init__(self, targets_file: Path, cache_dir: Path, collections: tuple[str, ...] = irsa.COLLECTIONS):
        # The demo target list is curated by the team, same file in mock and real mode.
        raw = json.loads(targets_file.read_text(encoding="utf-8"))["targets"]
        self._targets = [Target.model_validate(t) for t in raw]
        self._collections = collections
        self._obs_dir = cache_dir / "obs"
        self._cutout_dir = cache_dir / "cutouts"
        self._search_dir = cache_dir / "search"
        self._cal_dir = cache_dir / "cal"  # spectral-WCS calibration files (scripts/download_spectral_wcs.py)
        # Engine results live on disk (one JSON per candidate), not in memory: they survive a restart and
        # every worker sees the same results. Candidate ids are deterministic (observation ids + position).
        self._candidate_dir = cache_dir / "candidates"
        self._candidate_dir.mkdir(parents=True, exist_ok=True)
        self._search_dir.mkdir(parents=True, exist_ok=True)
        self._obs_dir.mkdir(parents=True, exist_ok=True)
        self._cutout_dir.mkdir(parents=True, exist_ok=True)
        self._records: dict[str, tuple[irsa.SiaRecord, float, float]] = {}

    # ---------- records ----------

    def _remember(self, rec: irsa.SiaRecord, query_ra: float, query_dec: float) -> None:
        self._records[rec.id] = (rec, query_ra, query_dec)
        path = self._obs_dir / f"{rec.id}.json"
        if not path.exists():
            path.write_text(json.dumps({"record": asdict(rec), "query": [query_ra, query_dec]}), encoding="utf-8")

    def _lookup(self, observation_id: str) -> tuple[irsa.SiaRecord, float, float]:
        if observation_id in self._records:
            return self._records[observation_id]
        path = self._obs_dir / f"{observation_id}.json"
        if path.parent != self._obs_dir or not path.exists():  # also blocks path tricks in the id
            raise NotFound(f"Unknown observation id '{observation_id}'. Ids come from /api/search.")
        saved = json.loads(path.read_text(encoding="utf-8"))
        entry = (irsa.SiaRecord(**saved["record"]), *saved["query"])
        self._records[observation_id] = entry
        return entry

    @staticmethod
    def _to_observation(rec: irsa.SiaRecord, wl: dict | None = None) -> Observation:
        """wl: wavelength info at the target pixel (only known once the image header is read)."""
        wavelength = wl["wavelength_um"] if wl else None
        bandwidth = wl["bandwidth_um"] if wl else None
        return Observation(
            id=rec.id,
            target_id=None,
            obs_time=rec.obs_time,
            mjd=round(rec.mjd_mid, 6),
            wavelength_um=round(wavelength, 4) if wavelength is not None else None,
            bandwidth_um=round(bandwidth, 4) if bandwidth is not None else None,
            wavelength_source=wl["source"] if wl else None,
            wavelength_pixel=wl["pixel"] if wl else None,
            wavelength_range_um=(round(rec.em_min_um, 4), round(rec.em_max_um, 4)),
            band=rec.band,
            release=rec.release,
            processing_version=rec.processing_version,
            archive_id=rec.publisher_did or None,
            source_file=rec.source_file,
            image_url=f"/api/observations/{rec.id}/image",
            footprint=Footprint(ra=rec.s_ra, dec=rec.s_dec, radius_deg=round(rec.s_fov / math.sqrt(2), 4),
                                polygon=[(round(a, 6), round(d, 6)) for a, d in irsa.parse_polygon(rec.s_region)] or None),
        )

    # ---------- DataSource ----------

    def list_targets(self) -> list[Target]:
        """Demo targets usable with live data.

        - Asteroids/comets: only those with a verified `real_view` (ephemeris + SPHEREx coverage
          check), placed there with the time window and band to use. Others are left out.
        - Stars/brown dwarfs are moved by proper motion to REAL_EPOCH. Catalogue (J2000 / WISE-epoch)
          positions are off by minutes of arc for fast movers (Barnard's Star: ~4.5' by 2026).
        """
        out = []
        for t in self._targets:
            if t.type in SOLAR_SYSTEM:
                # Moving objects only where a verified real view says when/where SPHEREx imaged them.
                if t.real_view is None:
                    continue
                v = t.real_view
                out.append(t.model_copy(update={"ra": v.ra, "dec": v.dec, "search_start": v.start,
                                                "search_end": v.end, "preferred_band": v.band}))
            else:
                out.append(propagate(t, REAL_EPOCH))
        return out

    def get_observation(self, observation_id: str) -> Observation:
        return self._to_observation(self._lookup(observation_id)[0])

    def _search_cache_path(self, ra: float, dec: float, radius: float) -> Path:
        key = f"{'+'.join(self._collections)}_{ra:.5f}_{dec:.5f}_{radius:.5f}"
        return self._search_dir / f"{hashlib.sha1(key.encode()).hexdigest()[:20]}.json"

    def search(self, ra: float, dec: float, radius: float) -> list[Observation]:
        # Search results are cached on disk for SEARCH_TTL_S: an IRSA search takes 5-15 s and the
        # archive changes rarely. Only complete answers (every collection succeeded) are cached.
        cache = self._search_cache_path(ra, dec, radius)
        records: list[irsa.SiaRecord] = []
        if cache.exists() and time.time() - cache.stat().st_mtime < SEARCH_TTL_S:
            records = [irsa.SiaRecord(**r) for r in json.loads(cache.read_text(encoding="utf-8"))["records"]]
        else:
            failures = []
            for coll in self._collections:
                try:
                    records += irsa.sia_search(ra, dec, radius, coll)
                except UpstreamError as e:
                    failures.append(e)
            if failures and not records:
                raise failures[0]
            if not failures:
                cache.write_text(json.dumps({"query": [ra, dec, radius], "records": [asdict(r) for r in records]}), encoding="utf-8")
        for rec in records:
            self._remember(rec, ra, dec)
        return sorted((self._to_observation(r) for r in records), key=lambda o: o.obs_time)

    def get_cutout(self, observation_id: str, ra: float | None, dec: float | None, size_arcsec: float) -> Cutout:
        rec, query_ra, query_dec = self._lookup(observation_id)
        if ra is None or dec is None:
            ra, dec = query_ra, query_dec  # default: the point the user searched for
        poly = irsa.parse_polygon(rec.s_region)
        outside = (not irsa.point_in_polygon(poly, ra, dec)) if poly else             angular_separation_deg(ra, dec, rec.s_ra, rec.s_dec) > rec.s_fov / math.sqrt(2)
        if outside:  # real footprint when known, circle otherwise
            raise NoCoverage(f"Observation '{observation_id}' does not cover ra={ra}, dec={dec}")

        request_size = size_arcsec * irsa.ROTATION_MARGIN
        # The processing version is part of the key: a reprocessed file (e.g. QR2 -> DR1) is a new cutout.
        version = rec.processing_version or "unknown"
        cache = self._cutout_dir / f"{rec.id}_{version}_{ra:.5f}_{dec:.5f}_{request_size:.0f}.fits"
        if cache.exists():
            raw = cache.read_bytes()
        else:
            raw = irsa.fetch_cutout(rec.access_url, ra, dec, request_size)
            cache.write_bytes(raw)

        with irsa.open_fits(raw) as hdul:
            img = hdul["IMAGE"].data.astype(float)
            if "ZODI" in hdul:
                img = img - hdul["ZODI"].data.astype(float)  # zodiacal light dominates the IR background
            # Display only: cosmic-ray hits and detector defects would look like changes in a blink.
            img, repaired, repaired_planes = irsa.repair_flagged(hdul, img)
            wl = irsa.wavelength_at(hdul, ra, dec, cal_dir=self._cal_dir)
            data, inside = irsa.reproject_north_up(hdul, img, ra, dec, size_arcsec)
            # Cosmic-ray (TRANSIENT) pixels are left untouched; count those inside the displayed grid.
            transient = irsa.flag_mask(hdul, irsa.WARN_FLAGS)
            transient_pixels = 0
            if transient is not None and transient.any():
                tmask, _ = irsa.reproject_north_up(hdul, transient.astype(float), ra, dec, size_arcsec)
                transient_pixels = int(np.count_nonzero(np.nan_to_num(tmask) >= 0.5))

        c = data.shape[0] // 2
        if not inside[c, c]:
            raise NoCoverage(f"Observation '{observation_id}' does not cover ra={ra}, dec={dec}")
        # NaN inside the image = masked pixels, typically saturated cores of bright stars.
        # Show them as the brightest value (white) rather than black holes.
        masked = np.isnan(data) & inside
        if masked.any() and np.isfinite(data).any():
            data[masked] = np.nanmax(data)
        obs = self._to_observation(rec, wl)
        return Cutout(data=data, ra=ra, dec=dec, pixel_scale_arcsec=irsa.PIXEL_ARCSEC, observation=obs,
                      repaired_pixels=repaired, repaired_flags=repaired_planes,
                      transient_pixels=transient_pixels)

    def candidates(self, ra: float, dec: float, radius: float, *, band: str | None = None,
                   pipeline: str | None = None) -> list[Candidate]:
        """Run the science engine on up to three compatible real FITS epochs.

        The search radius selects archive observations. For predictable archive requests this
        first implementation uses the existing 1800-arcsec cutout ceiling around the query.
        """
        from app.services.engine import EngineFrame, EngineRequest, pipeline_of
        from app.services.source_detection import SourceDetectionEngine

        if radius > MAX_CANDIDATE_RADIUS_DEG:
            raise BadRequest(f"radius {radius} deg is larger than the analysed area: candidates come from one "
                             f"{CANDIDATE_CUTOUT_ARCSEC:.0f}\" cutout per frame, so use radius <= {MAX_CANDIDATE_RADIUS_DEG} deg")
        observations = self.search(ra, dec, radius)
        if not observations:
            return []
        groups: dict[tuple[str, str], dict[str, irsa.SiaRecord]] = {}
        unsupported = []
        for observation in observations:
            record, _, _ = self._lookup(observation.id)
            pipeline_id = pipeline_of(record.processing_version)
            if pipeline_id is None:
                unsupported.append(record.id)
                continue
            if band is not None and record.band != band:
                continue
            if pipeline is not None and pipeline_id != pipeline:
                continue
            # SIA can expose the same exposure through overlapping releases; do not count it twice.
            groups.setdefault((record.band, pipeline_id), {})[record.id] = record
        if not groups:
            detail = f"; pipeline metadata is missing or unsupported for {', '.join(unsupported[:3])}" if unsupported else ""
            raise BadRequest("No SPHEREx observations with a supported processing pipeline match this request" + detail)
        if len(groups) > 1:
            available = ", ".join(f"{b}/{p}" for b, p in sorted(groups))
            needs = "band and pipeline" if band is None and pipeline is None else (
                "band" if band is None else "pipeline" if pipeline is None else "a narrower search")
            raise BadRequest(f"Multiple compatible SPHEREx data groups are available ({available}); specify {needs}")
        records = list(next(iter(groups.values())).values())
        records = sorted(records, key=lambda record: record.mjd_mid)
        if len(records) > 3:
            indexes = sorted({0, (len(records) - 1) // 2, len(records) - 1})
            records = [records[index] for index in indexes]

        cutout_arcsec = CANDIDATE_CUTOUT_ARCSEC
        request_size = cutout_arcsec * irsa.ROTATION_MARGIN
        frames = []
        for record in records:
            cache = self._cutout_dir / (
                f"{record.id}_{record.processing_version or 'unknown'}_{ra:.5f}_{dec:.5f}_{request_size:.0f}.fits"
            )
            if not cache.exists():
                cache.write_bytes(irsa.fetch_cutout(record.access_url, ra, dec, request_size))
            try:
                with irsa.open_fits(cache.read_bytes()) as hdul:
                    wavelength = irsa.wavelength_at(hdul, ra, dec, cal_dir=self._cal_dir)
            except Exception as exc:
                raise UpstreamError(f"Could not read SPHEREx FITS for observation {record.id}: {type(exc).__name__}") from exc
            frames.append(EngineFrame(
                observation_id=record.id,
                fits_path=cache,
                obs_time=record.obs_time,
                band=record.band,
                release=record.release,
                processing_version=record.processing_version,
                wavelength_um=wavelength["wavelength_um"] if wavelength else None,
                bandwidth_um=wavelength["bandwidth_um"] if wavelength else None,
                source_file=record.source_file,
                archive_id=record.publisher_did or None,
            ))

        # Known-object predictions are prepared HERE (contract: the engine never calls Horizons/Gaia).
        from app.services.known_objects import known_objects_for
        known, known_notes = known_objects_for(self._targets, frames, ra, dec, radius, self._cutout_dir.parent / "horizons")
        try:
            request = EngineRequest(ra_deg=ra, dec_deg=dec, radius_deg=radius, frames=frames, known_objects=known)
        except ValueError as exc:
            raise BadRequest(f"Selected SPHEREx frames cannot be compared: {exc}") from exc
        try:
            result = SourceDetectionEngine().detect(request)
        except BadRequest:
            raise
        except Exception as exc:
            raise UpstreamError(f"Source detection failed on cached SPHEREx FITS: {type(exc).__name__}") from exc
        for candidate in result:
            candidate.evidence["selected_band"] = records[0].band
            candidate.evidence["selected_pipeline"] = pipeline_of(records[0].processing_version)
            candidate.evidence["input_frame_count"] = len(records)
            candidate.evidence["known_objects_checked"] = sorted({k.name for k in known})
            if known_notes:
                candidate.evidence["known_objects_unavailable"] = known_notes
            candidate.evidence["frame_sampling"] = "first, middle, last" if len(records) == 3 else "all available frames (up to 3)"
        for candidate in result:
            path = self._candidate_path(candidate.candidate_id)
            if path is None:
                continue
            tmp = path.with_suffix(f".{os.getpid()}.tmp")  # atomic write: another worker never reads half a file
            tmp.write_text(candidate.model_dump_json(), encoding="utf-8")
            os.replace(tmp, path)
        return result

    def _candidate_path(self, candidate_id: str) -> Path | None:
        """Disk location of a stored candidate; None for ids that are not safe file names."""
        if not _SAFE_ID.fullmatch(candidate_id):
            return None
        return self._candidate_dir / f"{candidate_id}.json"

    def get_candidate(self, candidate_id: str) -> Candidate:
        path = self._candidate_path(candidate_id)
        candidate = Candidate.model_validate_json(path.read_text(encoding="utf-8")) if path and path.exists() else None
        if candidate is None:
            raise NotFound(f"No candidate with id '{candidate_id}'. Run /api/candidates first.")
        return candidate
