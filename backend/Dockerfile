# SKYTRACE backend (FastAPI). Build from backend/:
#   docker build -t skytrace-api .
#   docker run -p 8000:8000 -e DATA_SOURCE=real -e CORS_ORIGINS=https://your-site -v skytrace-cache:/app/.cache skytrace-api
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts

# Real-mode cache (searches, cutouts, spectral-WCS calibration). Mount a volume here so it survives restarts.
VOLUME /app/.cache
ENV DATA_SOURCE=mock PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
