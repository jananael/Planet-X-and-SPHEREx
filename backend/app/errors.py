"""Uniform error shape: {"error": {"code": str, "message": str}}. Codes: app.schemas.ErrorCode."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas import ErrorCode


class ApiError(Exception):
    status_code = 500
    code = ErrorCode.INTERNAL_ERROR

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class BadRequest(ApiError):
    status_code, code = 400, ErrorCode.BAD_REQUEST


class NotFound(ApiError):
    status_code, code = 404, ErrorCode.NOT_FOUND


class NoCoverage(ApiError):
    status_code, code = 404, ErrorCode.NO_COVERAGE


class UpstreamError(ApiError):
    status_code, code = 502, ErrorCode.UPSTREAM_ERROR


class NotImplementedYet(ApiError):
    status_code, code = 501, ErrorCode.NOT_IMPLEMENTED


def error_body(code: ErrorCode, message: str) -> dict:
    return {"error": {"code": code.value, "message": message}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(error_body(exc.code, exc.message), status_code=exc.status_code)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        code = ErrorCode.NOT_FOUND if exc.status_code == 404 else (
            ErrorCode.BAD_REQUEST if 400 <= exc.status_code < 500 else ErrorCode.INTERNAL_ERROR)
        return JSONResponse(error_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        parts = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
        return JSONResponse(error_body(ErrorCode.BAD_REQUEST, "; ".join(parts)), status_code=400)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        return JSONResponse(error_body(ErrorCode.INTERNAL_ERROR, "Unexpected server error"), status_code=500)
