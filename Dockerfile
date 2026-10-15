# Gear Fault Detection + XAI — container
# Runs the FastAPI + React dashboard by default; can also run the training pipeline.
FROM python:3.10-slim

# system libs TensorFlow / matplotlib / scipy need at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TF_CPP_MIN_LOG_LEVEL=2 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# install deps first (better layer caching)
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# then the project
COPY . .

# API + built React UI
EXPOSE 8000

# default: launch the dashboard (reachable from host)
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
