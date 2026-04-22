# syntax=docker/dockerfile:1.7

# =============================================================================
# Stage 1 — builder
# Installs Python deps into a relocatable venv at /opt/venv. Build toolchain
# lives only in this stage and is discarded; none of it lands in the runtime
# image.
# =============================================================================
FROM python:3.11-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build

# Copy requirements first so the deps layer is cacheable independent of source.
COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt


# =============================================================================
# Stage 2 — runtime
# Minimal slim image, non-root user, exec-form CMD for clean signal handling.
# No apt packages installed here — everything the app needs is in the venv
# copied across from the builder stage.
# =============================================================================
FROM python:3.11-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# Dedicated unprivileged user. Never run production Python as root.
RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app --home /home/app \
       --create-home --shell /bin/false app

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv

# Copy source AFTER deps so app edits don't invalidate the deps layer.
COPY --chown=app:app . .

USER app

EXPOSE 8000

# Healthcheck uses stdlib urllib so we avoid adding curl/wget to the image.
# `/docs` is always served by FastAPI when docs are enabled and is a cheap
# 200 without touching the DB or auth. Swap to a dedicated /healthz if you
# ever disable docs.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/docs', timeout=5).status == 200 else 1)"

# 1 worker is correct for a 2GB / 1-vCPU droplet + I/O-bound FastAPI app.
# Bump via `docker compose run` or override the CMD if you add CPUs later.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
