"""Sky-map tiles for the Explorer's map picker.

The AllWISE infrared HiPS is hosted by NASA/IPAC IRSA, but IRSA sends no CORS headers, so a
browser page can't load it directly. This route relays that one survey (nothing else) and
caches tiles on disk. Only HiPS file names are accepted, so it is not an open proxy.
"""
import re

import requests
from fastapi import APIRouter
from fastapi.responses import Response

from app.config import get_settings
from app.errors import NotFound, UpstreamError

router = APIRouter(tags=["sky map"])

SURVEYS = {"allwise": "https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/RGB-W4-W2-W1"}
ALLOWED = re.compile(r"^(properties|Moc\.fits|Norder\d{1,2}/Allsky\.(jpg|png)|Norder\d{1,2}/Dir\d+/Npix\d+\.(jpg|png))$")
TYPES = {"jpg": "image/jpeg", "png": "image/png", "fits": "application/fits"}


@router.get("/hips/{survey}/{path:path}", include_in_schema=False)
def hips_tile(survey: str, path: str) -> Response:
    base = SURVEYS.get(survey)
    if base is None or not ALLOWED.match(path):
        raise NotFound(f"Unknown sky-map file '{survey}/{path}'")
    media = TYPES.get(path.rsplit(".", 1)[-1], "text/plain; charset=utf-8")
    cache = get_settings().cache_dir / "hips" / survey / path
    if cache.exists():
        data = cache.read_bytes()
    else:
        try:
            resp = requests.get(f"{base}/{path}", timeout=(10, 30))
        except requests.RequestException as e:
            raise UpstreamError(f"Sky-map server unreachable: {type(e).__name__}") from e
        if resp.status_code == 404:
            raise NotFound(f"Sky-map file not found: {path}")  # normal for tiles outside coverage
        if resp.status_code != 200:
            raise UpstreamError(f"Sky-map server returned HTTP {resp.status_code}")
        data = resp.content
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(data)
    return Response(content=data, media_type=media, headers={"Cache-Control": "public, max-age=86400"})
