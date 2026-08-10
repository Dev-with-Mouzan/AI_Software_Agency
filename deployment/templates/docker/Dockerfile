# Multi-stage Dockerfile template for a FastAPI backend + Next.js frontend.
# The DevOps agent adapts this to the actual project layout.

FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim AS backend
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock backend/ 2>/dev/null || true
RUN pip install --no-cache-dir uvicorn fastapi
COPY backend/ ./backend/
COPY --from=frontend /app/frontend/.next ./frontend/.next 2>/dev/null || true

EXPOSE 8000
CMD ["uvicorn", "agency.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
