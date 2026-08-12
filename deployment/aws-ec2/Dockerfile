# Multi-stage Dockerfile for the AI Agency backend on a single EC2 VM.
# Build context must be the repository root (where `agency/`, `frontend/` and
# `deployment/` live). See README.md in this folder for the full walkthrough.

FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Python package: pyproject.toml + sources + alembic (ini + script dir + scripts).
COPY agency/pyproject.toml ./agency/
COPY agency/agency/ ./agency/agency/
COPY agency/scripts/ ./agency/scripts/

# The repo README.md is UTF-16, which breaks setuptools' `readme` handling.
# setuptools also rejects `readme` paths outside the project root, so stage a
# minimal UTF-8 README inside the package and rewrite the reference. This is
# isolated to the build; the local uv/dev workflow is untouched.
RUN printf '# AI Agency\n' > ./agency/README.md \
    && sed -i 's|^readme = .*|readme = "README.md"|' ./agency/pyproject.toml

# Install the package with the LLM adapters extra (OpenAI/Anthropic/Gemini/
# LangChain-backed DeepSeek + Qwen). Prometheus metrics are a core dependency.
RUN pip install --no-cache-dir "./agency[llm]"

# alembic resolves `script_location` relative to the working directory, and the
# app ships a `logging/` package that shadows the stdlib module whenever the
# package dir is the CWD. Pin the alembic script dir to an absolute path and
# run everything via console scripts from the repo root (/app/agency).
RUN sed -i 's|^script_location = .*|script_location = /app/agency/agency/alembic|' ./agency/agency/alembic.ini

# Persistent state the agents produce. Bind to a host volume via compose.
RUN mkdir -p /app/working-area

WORKDIR /app/agency

EXPOSE 8000

# Migrations run with the sync driver (psycopg), then the API serves with asyncpg.
CMD ["sh", "-c", "alembic upgrade head && uvicorn agency.api.main:app --host 0.0.0.0 --port 8000"]
