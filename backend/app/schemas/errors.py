from enum import Enum

from pydantic import BaseModel


class ErrorCode(str, Enum):
    NOT_FOUND = "NOT_FOUND"            # 404 unknown observation / route
    BAD_REQUEST = "BAD_REQUEST"        # 400 invalid or missing params
    NO_COVERAGE = "NO_COVERAGE"        # 404 requested ra/dec is outside the observation's footprint
    UPSTREAM_ERROR = "UPSTREAM_ERROR"  # 502 IRSA / archive failed or timed out
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"  # 501 data source doesn't support this yet
    INTERNAL_ERROR = "INTERNAL_ERROR"  # 500 anything unexpected


class ErrorBody(BaseModel):
    code: ErrorCode
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
