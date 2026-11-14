"""Warm the real-data cache for the demo, so images appear instantly in front of the judges.

    python scripts/prefetch_demo.py                  (from backend/, short-path venv)
    python scripts/prefetch_demo.py --sizes 240 300 --all-bands

For every live demo target (what /api/targets returns with DATA_SOURCE=real) it runs the search
(cached) and downloads the same frames the Explorer selects by default: the detector band seen in
the most visits, one exposure per visit (all exposures if there is only one visit). Cutouts are
cached under CACHE_DIR, exactly where the API looks for them.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.services.warmup import warm  # noqa: E402
from app.services.real_source import RealSource  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sizes", type=int, nargs="+", default=None,
                    help="cutout sizes in arcsec (default: each target's recommended size + 300 for stories)")
    ap.add_argument("--all-bands", action="store_true", help="also prefetch one frame per visit for every band")
    a = ap.parse_args()
    s = get_settings()
    src = RealSource(s.mock_dir / "targets.v0.json", s.cache_dir)
    warm(src, sizes=a.sizes, all_bands=a.all_bands, say=lambda line: print(line, flush=True))


if __name__ == "__main__":
    main()
