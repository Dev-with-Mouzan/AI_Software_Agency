# Deployment Guide — Daily Ledger (Todo List)

This app is a **static frontend** (plain HTML/CSS/JS, no build step, no backend, no
database). Deploying it means *serving the `frontend/` folder over HTTPS* — nothing
else. There are **no secrets or environment variables** for any platform.

---

## Option A — GitHub Pages (recommended, free)

Zero-config static hosting from your GitHub repo.

### Step-by-step

1. Push the project to a GitHub repository (branch `main`).
2. Copy the CI/CD workflow into place (GitHub Actions only reads the repo root):

   ```bash
   mkdir -p .github/workflows
   cp deployment/.github/workflows/deploy.yml .github/workflows/deploy.yml
   git add .github/workflows/deploy.yml && git commit -m "ci: deploy to pages" && git push
   ```

3. In the GitHub repo: **Settings → Pages → Source: GitHub Actions** (keep the
   default). This tells Pages to accept the deploy produced by the workflow.
4. Push any change to `main` (or run the **deploy** workflow manually via
   **Actions → deploy → Run workflow**).
5. Open the workflow run: the **deploy** job prints the live URL
   (`https://<user>.github.io/<repo>/`).

### Values to set

| Setting | Value |
|---|---|
| Pages source | GitHub Actions |
| Secrets | none — the workflow uses the built-in `GITHUB_TOKEN` |

---

## Option B — Docker image (Railway / Render / Fly.io / any container host)

The `deployment/Dockerfile` builds an nginx image that serves the static files on
**port 8080**.

### Build and test locally

```bash
docker build -f deployment/Dockerfile -t daily-ledger .
docker run -p 8080:8080 daily-ledger
# open http://localhost:8080
```

### Deploy

**Railway**
1. New Project → **Deploy from Dockerfile** → point at this repo.
2. Build config: set the Dockerfile path to `deployment/Dockerfile` (or copy it to
   the repo root as `Dockerfile` if the UI only looks at the root).
3. No variables needed. Railway maps its `PORT` to the container; the image listens
   on 8080 already.
4. Railway assigns a public URL automatically.

**Render**
1. New → **Web Service** → connect the repo.
2. Runtime: **Docker** — set *Dockerfile path* to `deployment/Dockerfile` (or copy
   it to the repo root).
3. No env vars required. Public URL is auto-generated.

**Fly.io**
```bash
fly launch --dockerfile deployment/Dockerfile --no-deploy
fly deploy
# the image listens on 8080; Fly's default internal_port can stay 8080
```

### Values to set

| Platform | Setting | Value |
|---|---|---|
| Railway / Render | Env vars | none (optional `PORT=8080`) |
| Railway / Render | Dockerfile path | `deployment/Dockerfile` |
| Fly.io | `internal_port` | `8080` |

---

## What is in `deployment/`

| File | Purpose |
|---|---|
| `Dockerfile` | nginx-alpine image serving `frontend/` on port 8080 |
| `nginx.conf` | static file serving, gzip, cache headers, SPA fallback |
| `.dockerignore` | keeps the build context to just `frontend/` |
| `.env.example` | environment template (documents that no vars are needed) |
| `.github/workflows/deploy.yml` | CI/CD: `node --check` + GitHub Pages deploy (copy to repo root) |
| `DEPLOYMENT.md` | this guide |

> Note: this guide lives in `deployment/` because the workspace permission allows
> writes only there. If your process expects it at `docs/DEPLOYMENT.md`, copy it:
> `cp deployment/DEPLOYMENT.md docs/DEPLOYMENT.md`.

## Local sanity check (what CI runs)

```bash
node --check frontend/js/app.js   # must exit 0
```

The app needs no build step — whatever is in `frontend/` is what gets served.
