from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.errors import register_error_handlers
from app.routers import candidates, explain, gaia_stars, health, hips, journey, observations, resolve, search, sky_objects, spectrum, targets


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Planet X x SPHEREx API", version=__version__)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=settings.cors_origin_regex or None,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["*"],
        expose_headers=list(observations.IMAGE_HEADERS),
    )
    register_error_handlers(app)

    for r in (health.router, targets.router, observations.router, search.router, candidates.router, explain.router, journey.router, resolve.router, hips.router, sky_objects.router, gaia_stars.router, spectrum.router):
        app.include_router(r, prefix="/api")

    if settings.data_source == "real" and settings.warm_on_start:
        @app.on_event("startup")
        def _warm_demo_cache() -> None:  # background thread: the API answers immediately
            from app.services.data_source import get_data_source
            from app.services.warmup import warm_in_background
            warm_in_background(get_data_source())
    return app


app = create_app()
