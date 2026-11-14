from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.errors import register_error_handlers
from app.routers import candidates, explain, health, hips, observations, search, targets


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Planet X x SPHEREx API", version=__version__)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["*"],
        expose_headers=list(observations.IMAGE_HEADERS),
    )
    register_error_handlers(app)

    for r in (health.router, targets.router, observations.router, search.router, candidates.router, explain.router, hips.router):
        app.include_router(r, prefix="/api")
    return app


app = create_app()
