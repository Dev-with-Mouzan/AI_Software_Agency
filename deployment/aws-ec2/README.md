# Deploy: Backend on AWS EC2, Frontend on Vercel + Custom Domain

This deploys the AI Agency as two pieces:

| Piece     | Target                            | Hosts                                  |
| --------- | --------------------------------- | -------------------------------------- |
| Backend   | Single AWS EC2 VM                 | FastAPI + PostgreSQL (Docker Compose)  |
| Frontend  | Vercel                            | Next.js on your custom domain          |

The Vercel frontend talks to the EC2 backend through the server-side proxy in
`frontend/app/api/proxy/[...path]/route.ts`, so the browser never talks to EC2
directly and **no CORS is required**. The proxy forwards a shared `API_TOKEN`
as a Bearer header, so the backend stays locked to the frontend.

---

## 1. Backend — AWS EC2

### 1.1 Create the VM

1. Launch an EC2 instance: Amazon Linux 2023 (or Ubuntu 24.04), at least
   **2 vCPU / 4 GiB RAM** (t3.medium or larger) and **30+ GiB** of storage —
   the working area grows with every agent run.
2. Security group inbound rules:
   - `22` (SSH) from your IP only
   - `8000` from `0.0.0.0/0` (or ideally only Cloudflare/Vercel egress ranges)
3. Attach a key pair; SSH in.

### 1.2 Install Docker

```bash
# Amazon Linux 2023
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user   # log out and back in after this
```

### 1.3 Get the code + config

```bash
git clone <your-repo-url> /home/ec2-user/agencie
cd /home/ec2-user/agencie/deployment/aws-ec2
cp .env.example .env
nano .env    # set POSTGRES_PASSWORD, API_TOKEN, LLM keys
```

### 1.4 Start it

```bash
docker compose up -d --build
docker compose ps          # wait until both services are healthy
curl http://localhost:8000/api/health
```

Migrations run automatically on container start (`alembic upgrade head`).

### 1.5 Point a domain at the API (recommended)

Exposing the API with a real hostname + HTTPS is strongly recommended so the
API token is not sent in cleartext over the internet.

- **Route 53 / Cloudflare**: create an `A` record (e.g. `api.yourdomain.com`)
  pointing at the instance's public IP.
- **HTTPS (no extra infra)**: add a Caddy or nginx container to the compose
  file, or put an ALB in front. Minimal example with Caddy:

  ```yaml
  caddy:
    image: caddy:2-alpine
    depends_on: [api]
    environment:
      DOMAIN: api.yourdomain.com
    volumes:
      - caddy-data:/data
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
    ports: ["80:80", "443:443"]
  ```

  ```bash
  # Caddyfile
  {$DOMAIN} {
      reverse_proxy api:8000
  }
  ```

Then use `https://api.yourdomain.com/api` as `AGENCY_API_URL` below.

---

## 2. Frontend — Vercel + Custom Domain

1. Push the `frontend/` directory to a Git provider (or import it into Vercel
   as a new project; set the framework to **Next.js**).
2. In the project → **Settings → Environment Variables**, add **Production**:

   | Key              | Value                                              |
   | ---------------- | -------------------------------------------------- |
   | `AGENCY_API_URL` | `https://api.yourdomain.com/api` (or `http://<ec2-public-dns>/api`) |
   | `API_TOKEN`      | the same secret you put in the EC2 `.env`          |

3. Deploy. The dashboard is then served from `https://<project>.vercel.app`.
4. **Custom domain**: in **Settings → Domains**, add your domain and follow
   Vercel's DNS instructions (CNAME/A record + verification).

> Note: if `AGENCY_API_URL` is a plain `http://` EC2 DNS name, the frontend
> proxy still works — the fetch happens server-side from Vercel — but a
> domain + HTTPS is the production-grade setup.

---

## 3. Post-deploy checklist

- [ ] `curl <api-url>/api/health` returns `{"status":"ok",...}`
- [ ] Dashboard loads; a sample agent run completes end to end
- [ ] **Files tab**: browse the working area, preview a file, download a single
      file, and download the whole project `.zip`
- [ ] `API_TOKEN` on Vercel matches the EC2 `.env`
- [ ] EC2 has a reboot policy + Docker `restart: unless-stopped` so services
      come back after an instance reboot
- [ ] Back up the `working-area` and `pgdata` volumes (e.g. an EBS snapshot)
