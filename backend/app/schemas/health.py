from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    data_source: str
    version: str
