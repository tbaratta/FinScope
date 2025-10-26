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