"""Startup warm-up: one failing target is logged and skipped, the others are still prefetched."""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.errors import UpstreamError
from app.services.warmup import warm


def test_warm_skips_failures_and_keeps_going():
    t = lambda tid: SimpleNamespace(id=tid, name=tid, ra=1.0, dec=2.0, search_start=None, search_end=None,
                                    preferred_band="D1", recommended_size_arcsec=300)
    o = lambda oid, mjd: SimpleNamespace(id=oid, band="D1", mjd=mjd, obs_time=datetime(2026, 1, 1, tzinfo=timezone.utc))
    fetched = []

    class Src:
        def list_targets(self): return [t("broken"), t("ok")]
        def search(self, ra, dec, radius):
            if not fetched and not hasattr(self, "seen"):
                self.seen = True
                raise RuntimeError("IRSA down")
            return [o("a", 1.0), o("b", 200.0)]
        def get_cutout(self, oid, ra, dec, size):
            if oid == "b": raise UpstreamError("503")
            fetched.append(oid)

    lines = []
    warm(Src(), journeys=False, say=lines.append)
    assert any("broken: skipped" in line for line in lines)
    assert fetched == ["a"] and any("b: UPSTREAM_ERROR" in line for line in lines)
