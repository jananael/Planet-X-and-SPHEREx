from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    data_source: Literal["mock", "real"] = "mock"
    mock_dir: Path = APP_DIR / "mock_data"
    cache_dir: Path = APP_DIR.parent / ".cache"  # RealSource: search records + cutout FITS
    # Next dev server binds 127.0.0.1 (see frontend/package.json); browsers may use either name.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Optional regex for extra allowed origins, e.g. Vercel preview URLs: ^https://skytrace.*\.vercel\.app$
    cors_origin_regex: str | None = None
    # Real mode on a host that sleeps and loses its disk: refill the demo cache in the background at startup.
    warm_on_start: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
