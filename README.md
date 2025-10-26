# FinScope

## Performance & Caching

FinScope now includes multi-layer caching to speed up repeat requests and reduce third‑party API calls:

- Redis-backed shared cache for backend services (Node + Python). Falls back to in‑memory if Redis is unavailable.
- Node API:
	- Caches market history, macro (FRED) series, news headlines, and forecasts with sensible TTLs.
	- Adds Cache-Control headers on summary responses for browser caching.
- Python API (FastAPI):
	- Uses fastapi-cache2 to cache /market (120s), /forecast (600s), and /bank/summary (60s).
- Frontend:
	- Axios GET interceptor provides a lightweight in‑memory cache and request coalescing (defaults to 30s; 60s for summary).

### Runtime defaults

- REDIS_URL is wired in docker-compose for both services: `redis://redis:6379/0`.
- TTLs can be tuned in code:
	- Node `routes/data.js`: summary 60s; FRED 300s; AlphaVantage 300s; yfinance proxy 120s.
	- Node `routes/agents.js`: per-symbol market history 120s; macro/news 300s; forecasts 600s.
	- Python `main.py` @cache expirations as above.

### Local development

Start all services (includes Redis):

```powershell
cd .\finscope
docker-compose up --build -d
```

Verify health:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:4000/api/health
Invoke-WebRequest -UseBasicParsing http://localhost:4000/api/health/ready
```

Notes:
- For best results, set FRED_API_KEY and ALPHAVANTAGE_API_KEY in `.env`. The summary card depends on these.
- In multi-instance deployments, keep Redis enabled so caches are shared across instances.

## Deploying

You can deploy FinScope with Docker Compose on any VM or server. The stack includes:

- node-api (port 4000)
- py-api (port 8000)
- frontend (port 5173)
- redis (port 6379)

### 1) Prepare environment

1. Copy `.env.example` to `.env` and fill values:
	 - Required: `FRED_API_KEY`, `ALPHAVANTAGE_API_KEY`
	 - Optional: `ADK_API_KEY` or `GOOGLE_API_KEY` (LLM for ELI5), `NEWS_API_KEY`, `PLAID_CLIENT_ID/SECRET`, `MONGO_URI`
	 - For production domain, set:
		 - `FRONTEND_ORIGIN=https://your.domain`
		 - `VITE_API_BASE_URL=https://your.domain/api`
		 - `VITE_PY_API_BASE_URL=https://your.domain/py`

2. Ensure Docker and Docker Compose are installed on the host.

### 2) Run the stack

```powershell
cd .\finscope
docker-compose up -d --build
```

- Frontend: http://localhost:5173
- Node API: http://localhost:4000
- Python API: http://localhost:8000

### 3) Put it behind a domain (HTTPS)

Option A — Nginx (simple): use `deploy/nginx.conf` as a starting point. It:

- Serves the frontend at `/`
- Proxies `/api` to Node (:4000)
- Proxies `/py` to Python (:8000)

Steps (Ubuntu):

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/finscope
sudo ln -s /etc/nginx/sites-available/finscope /etc/nginx/sites-enabled/finscope
# Edit server_name to your domain, then:
sudo nginx -t && sudo systemctl reload nginx
# Add TLS (e.g., certbot)
```

Option B — Caddy (auto TLS): use `deploy/Caddyfile` and install caddy:

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo tee /usr/share/keyrings/caddy-stable-archive-keyring.gpg > /dev/null
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install caddy -y
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Make sure you rebuilt the frontend with the correct build-time env to match your proxy paths:

```powershell
# In finscope folder
$env:VITE_API_BASE_URL = "https://your.domain/api"; $env:VITE_PY_API_BASE_URL = "https://your.domain/py"; $env:FRONTEND_ORIGIN = "https://your.domain"; docker-compose up -d --build frontend
```

### Quick share without a server

For a quick demo from your laptop, you can expose the frontend with a secure tunnel (e.g., Cloudflare Tunnel) and keep APIs on the default ports:

```powershell
# Example: Cloudflare Tunnel (after logging in via cloudflared)
cloudflared tunnel --url http://localhost:5173
```

Then set `FRONTEND_ORIGIN` in `.env` to the issued https URL and rebuild the frontend.

### Health checks

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:4000/api/health
Invoke-WebRequest -UseBasicParsing http://localhost:4000/api/health/ready
```

If `/api/data/summary` errors with missing keys, add `FRED_API_KEY` and `ALPHAVANTAGE_API_KEY` to `.env` and recreate containers.

## Quick vs Full reports

- Quick mode: Skips forecasts and the AI teacher step. Generates a fast preview with market data, macro, headlines, technicals, and a simple beginner summary. Useful for a quick morning glance or on small machines.
- Full mode: Includes 14‑day forecasts and the AI teacher explanation (uses Gemini if `ADK_API_KEY` or `GOOGLE_API_KEY` is set). More detailed, takes a bit longer.

You can toggle this in the ticker bar via the “Quick mode” checkbox. In production, set the appropriate keys in `.env` to unlock all features:

- FRED_API_KEY, ALPHAVANTAGE_API_KEY — Summary cards (10Y yield, CPI YoY, SPY daily).
- ADK_API_KEY or GOOGLE_API_KEY — AI teacher explanation (beginner/normal).
- NEWS_API_KEY — Higher‑quality business headlines (falls back to Reuters RSS if omitted).