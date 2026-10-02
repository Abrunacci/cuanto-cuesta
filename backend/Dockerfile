# Production image for the backend, published to ghcr.io/abrunacci/cuanto-cuesta-backend by
# .github/workflows/deploy.yml. Local development runs with uv instead (README).
#
# Two stages: the first resolves and installs with uv, the second carries only the virtualenv,
# the config, the migrations and alembic.ini. No uv, no dev dependencies, no tests
# (.dockerignore keeps them out of the context).
#
# The same image runs two commands:
#   serve    (default) uvicorn, as the app's role in DATABASE_URL
#   migrate  alembic upgrade head, which infra runs in a one-off container before each deploy
#            switches, as the owner in MIGRATION_DATABASE_URL

# 3.13: what pyproject.toml requires and CI runs.
FROM python:3.13-slim AS build

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /bin/

WORKDIR /app

# Dependency layer: only invalidated when pyproject.toml or uv.lock change.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

# --no-editable: the package is copied into the virtualenv, so the runtime stage needs no src/.
COPY README.md ./
COPY src ./src
RUN uv sync --locked --no-dev --no-editable


FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# A fixed uid, so a volume or a policy on the host can name it.
RUN useradd --system --uid 10001 --no-create-home --home-dir /nonexistent app

WORKDIR /app

COPY --from=build /app/.venv ./.venv
# config/rates.yaml is read at startup (CONFIG_DIR defaults to ./config).
COPY config ./config
COPY alembic.ini ./
COPY migrations ./migrations

USER app

EXPOSE 8000

# No curl in a slim image; the interpreter is already here.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"]

# One process, no --reload. --factory: create_app() reads the settings when the server starts.
CMD ["uvicorn", "cuanto_cuesta.api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
