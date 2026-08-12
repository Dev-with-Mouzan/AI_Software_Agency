<div align="center">

<img src="assets/banner.svg" alt="DevPilot AI banner" />

**DevPilot AI — a multi-agent software studio where specialized AI employees plan, build, review and ship real projects — on your command, under human supervision.**

<br />

[![Python](https://img.shields.io/badge/python-3.11%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white)](https://www.sqlalchemy.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Prometheus](https://img.shields.io/badge/Prometheus-metrics-E6522C?style=flat-square&logo=prometheus&logoColor=white)](https://prometheus.io/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)

</div>

---

## Table of contents

- [✨ Features](#-features)
- [🤖 The crew](#-the-crew)
- [🔁 The pipeline](#-the-pipeline)
- [🧱 Tech stack](#-tech-stack)
- [🚀 Getting started](#-getting-started)
- [⚙️ Configuration](#️-configuration)
- [📁 Project structure](#-project-structure)
- [🧪 Development & testing](#-development--testing)
- [🌍 Deployment](#-deployment)
- [📚 API reference](#-api-reference)
- [📄 License](#-license)

---

## ✨ Features

| | Feature | Description |
|---:|---|---|
| <img src="assets/icons/workflows.svg" width="18" alt="" /> | **Orchestrated workflows** | Dispatch any set of agents in any order. The orchestrator sequences runs, streams live activity, recovers stale runs after restarts, and creates git checkpoints for safe rollback. |
| <img src="assets/icons/activity.svg" width="18" alt="" /> | **Live activity streaming** | Watch every agent work in real time — reasoning, tool calls, successes and failures — in the dashboard and via the API. |
| <img src="assets/icons/memory.svg" width="18" alt="" /> | **Persistent team memory** | Every decision, lesson, task and project milestone is pushed to short-term memory and consolidated into long-term memory — the team gets smarter with every run. |
| <img src="assets/icons/knowledge.svg" width="18" alt="" /> | **Knowledge search** | A vector knowledge base lets agents search what was learned across projects before acting. |
| <img src="assets/icons/permissions.svg" width="18" alt="" /> | **Permission boundaries** | Every agent writes only inside its own workspace (`docs/`, `backend/`, `frontend/`, `deployment/`) — protected files like `.env` are off-limits. |
| <img src="assets/icons/deploy.svg" width="18" alt="" /> | **One-command deployments** | Provider-based deploys to AWS and Vercel with readiness checks, one-click approval gates, custom domains and live logs — plus templates for seven platforms. |
| <img src="assets/icons/observability.svg" width="18" alt="" /> | **Observability & audit** | Prometheus metrics, structured logging, full audit trail, notifications and a rate-limited, header-security-hardened API. |
| <img src="assets/icons/checkpoints.svg" width="18" alt="" /> | **Git checkpoints** | Every stage is committed automatically so any workflow run can be rolled back safely. |

---

## 🤖 The crew

| | Agent | Responsibility | Writes to |
|---:|---|---|---|
| <img src="assets/icons/planner.svg" width="18" alt="" /> | **Planner** | Researches the idea on the web, picks a justified tech stack and writes a complete implementation plan. | `docs/` |
| <img src="assets/icons/backend.svg" width="18" alt="" /> | **Backend Engineer** | Implements APIs, data models, auth, background jobs and integrations — true to the plan's tech stack. | `backend/` |
| <img src="assets/icons/frontend.svg" width="18" alt="" /> | **Frontend Engineer** | Designs a distinctive visual identity and builds a polished, responsive, accessible UI. | `frontend/` |
| <img src="assets/icons/devops.svg" width="18" alt="" /> | **DevOps Engineer** | Generates platform config, Dockerfiles, CI/CD and a step-by-step deployment plan. | `deployment/` |
| <img src="assets/icons/reviewer.svg" width="18" alt="" /> | **Code Reviewer** | Audits the whole codebase for security flaws, bugs and risks; writes a severity-ranked report. Never modifies code. | `docs/` |

Each agent runs a shared, hardened loop: recall memory → search knowledge → consult the model → call tools → record lessons — with per-agent LLM routing, failure-resilient retries and a hard round budget.

---

## 🔁 The pipeline

<div align="center">

| <img src="assets/icons/plan.svg" width="22" alt="" /><br/>**1 · Plan** | <img src="assets/icons/build.svg" width="22" alt="" /><br/>**2 · Build** | <img src="assets/icons/review.svg" width="22" alt="" /><br/>**3 · Review** | <img src="assets/icons/ship.svg" width="22" alt="" /><br/>**4 · Ship** |
|---|---|---|---|
| Tell the Planner what to build. It researches, designs the architecture and breaks the work into tasks. | Backend and Frontend engineers implement the plan while the DevOps engineer prepares infrastructure. | The Reviewer audits every line. Failures loop back to the team (up to `MAX_REVIEW_RETRIES`) before anything ships. | You approve the deployment at the gate — then it goes live on the platform of your choice. |

</div>

---

## 🧱 Tech stack

### Backend — `agency/`

| Technology | Purpose |
|---|---|
| <img src="assets/icons/python.svg" width="16" alt="" /> Python 3.11+ / FastAPI | REST API, WebSocket-free streaming, OpenAPI docs at `/api/docs` |
| <img src="assets/icons/sqlalchemy.svg" width="16" alt="" /> SQLAlchemy 2 + Alembic | Async ORM and migrations (SQLite out of the box, PostgreSQL supported) |
| <img src="assets/icons/pydantic.svg" width="16" alt="" /> Pydantic 2 + pydantic-settings | Type-safe schemas and env-driven configuration |
| <img src="assets/icons/prometheus.svg" width="16" alt="" /> Prometheus + structlog | `/metrics` endpoint, structured logging, audit trail |
| <img src="assets/icons/llm.svg" width="16" alt="" /> LLM provider adapters | OpenAI, Anthropic, Gemini, DeepSeek, Qwen (DashScope), Ollama — with per-agent routing via `AGENT_MODELS` |

### Frontend — `frontend/`

| Technology | Purpose |
|---|---|
| <img src="assets/icons/next.svg" width="16" alt="" /> Next.js 15 (App Router) + React 19 | Dashboard, server-side API proxy, motion-rich marketing pages |
| <img src="assets/icons/typescript.svg" width="16" alt="" /> TypeScript 5.7 | End-to-end typed API client |
| <img src="assets/icons/tailwind.svg" width="16" alt="" /> Tailwind CSS 4 | Utility-first design system, dark/light themes |
| <img src="assets/icons/motion.svg" width="16" alt="" /> Motion (Framer Motion) | Scroll scenes, 3D tilt cards, count-ups, micro-interactions |
| <img src="assets/icons/react.svg" width="16" alt="" /> TanStack Query + Lucide | Server-state cache, hooks, icon library |

---

## 🚀 Getting started

### Prerequisites

- Python **3.11+** and [uv](https://docs.astral.sh/uv/)
- Node.js **18+** and npm
- An API key for at least one LLM provider (OpenAI, Anthropic, Gemini, DeepSeek, Qwen, or a local Ollama)

### 1 · Install

```bash
# Backend
cd agency
uv sync --extra llm --extra dev

# Frontend
cd ../frontend
npm install
```

### 2 · Configure

Copy the environment template and add your provider keys:

```bash
cp .env.example .env        # backend (create from config in agency/agency/config.py)
cp frontend/.env.example frontend/.env
```

```dotenv
# Backend .env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
# or: OPENAI_API_KEY=..., ANTHROPIC_API_KEY=..., GEMINI_API_KEY=..., QWEN_API_KEY=...
```

### 3 · Run

```bash
python run-dev.py
# API  → http://localhost:8000   (docs at /api/docs)
# Web  → http://localhost:3000
```

Or run them separately with the [Makefile](#-development--testing):

```bash
make db-init      # create tables + seed agents
make dev-api      # FastAPI on :8000
make dev-web      # Next.js on :3000
```

> The API refuses to start without `API_TOKEN` when `ENVIRONMENT=production`.

---

## ⚙️ Configuration

All backend settings are loaded from environment variables / `.env` via pydantic-settings. Key options:

| Variable | Default | Description |
|---|---|---|
| `API_TOKEN` | — | Shared bearer token (required in production) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./agency_dev.db` | Async DB URL (PostgreSQL via asyncpg supported) |
| `WORKING_AREA` | `./working-area` | Where the agents build projects |
| `LLM_PROVIDER` | `null` | `openai` · `anthropic` · `gemini` · `ollama` · `deepseek` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | — | Provider credentials |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | — / `deepseek-v4-flash` | DeepSeek routing |
| `QWEN_API_KEY` / `QWEN_MODEL` | — / `qwen3.7-flash` | Qwen (DashScope) routing |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `http://localhost:11434/v1` / `llama3.2:1b` | Local models |
| `AGENT_MODELS` | `{}` | Per-agent `{provider, model}` JSON routing override |
| `EMBEDDING_PROVIDER` | `local` | `openai` · `huggingface` · `local` |
| `MAX_TOOL_ROUNDS` | `60` | Agent loop budget |
| `MAX_REVIEW_RETRIES` | `3` | Review loop budget before `REVIEW_FAILED` |
| `ENABLE_GIT_CHECKPOINTS` | `true` | Auto-commit each workflow stage |
| `API_CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed dashboard origins |

Frontend: set `AGENCY_API_URL` (backend base URL) and `API_TOKEN` in `frontend/.env` — the `/api/proxy` route forwards and authenticates requests.

---

## 📁 Project structure

```text
.
├── agency/                        # Python backend (FastAPI)
│   ├── agents/                    # The crew: agent loop, profiles, registry
│   ├── api/                       # REST routes: projects, agents, workflows,
│   │                              #   deployment, chat, memory, settings, audit…
│   ├── workflows/                 # Orchestrator, engine, git checkpoints, state
│   ├── deployments/               # Provider adapters (AWS, Vercel)
│   ├── tools/                     # filesystem, shell, web search/fetch, memory
│   ├── memory/                    # Short-term + long-term memory manager
│   ├── knowledge/                 # Vector search index
│   ├── permissions/               # Per-agent workspace policy + audit
│   ├── observability/             # Prometheus metrics, activity events
│   ├── services/                  # Business logic: projects, tasks, plans…
│   ├── db/                        # SQLAlchemy models, sessions, Alembic
│   ├── alembic/                   # Database migrations
│   └── tests/                     # pytest suite (API, agents, workflows…)
├── frontend/                      # Next.js dashboard
│   ├── app/                       # Pages: overview, projects, agents, chat,
│   │                              #   workflows, activity, settings
│   ├── components/                # UI kit, motion, deployment widgets
│   └── lib/                       # API client, types, hooks
├── deployment/                    # Docker Compose + platform templates
│   └── templates/                 # aws · docker · fly-io · netlify · railway
│                                  #   · render · vercel
├── working-area/                  # Projects generated by the crew live here
├── Makefile                       # Dev workflow shortcuts
├── run-dev.py                     # One-command full-stack launcher
└── LICENSE                        # MIT
```

---

## 🧪 Development & testing

| Command | What it does |
|---|---|
| `make setup` | Install backend + frontend dependencies |
| `make dev-api` / `make dev-web` | Run API (:8000) / dashboard (:3000) |
| `make db-init` / `make db-migrate` | Create tables & seed / apply migrations |
| `make seed` | Seed a demo project |
| `make test` | Backend tests (`pytest`) |
| `make lint` | `ruff check` + `ruff format --check` |
| `make typecheck` | `mypy` on the backend |
| `make build-web` | Production frontend build |
| `make up` / `make down` / `make logs` | Docker Compose lifecycle |

---

## 🌍 Deployment

The DevOps Engineer generates deploy-ready files for your target platform, and the dashboard ships them through provider integrations:

| Platform | Support |
|---|---|
| <img src="assets/icons/aws.svg" width="16" alt="" /> **AWS** | Full provider integration: ECR/ECS via CodeBuild template, env checks, custom domains |
| <img src="assets/icons/vercel.svg" width="16" alt="" /> **Vercel** | Provider integration with domain verification |
| <img src="assets/icons/docker.svg" width="16" alt="" /> **Docker / Railway / Render / Fly.io / Netlify** | Battle-tested templates in `deployment/templates/` |

Deploys run through an approval gate: readiness checks → you approve → deploy → live logs — and every deployment is tracked per project in the dashboard.

---

## 📚 API reference

Interactive Swagger docs are served by the running API:

```
http://localhost:8000/api/docs
http://localhost:8000/api/redoc
http://localhost:8000/api/openapi.json
```

Key resources: `projects` · `workspace` · `tasks` · `agents` · `workflows` · `deployment` · `chat` · `memory` · `settings` · `audit` · `notifications`.

---

## 📄 License

Released under the [MIT License](LICENSE). Copyright © 2026 DevPilot AI.
