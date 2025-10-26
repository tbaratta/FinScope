<div align="center">

# FinScope — your daily financial news, simplified

Stay informed without the noise. FinScope gathers market data and headlines, analyzes what matters, and delivers a clear daily report you can actually read — with a “Beginner Mode” that explains complex topics in plain English.

• Live demo: https://app.finscope.us  • Video: <link>  • Devpost: <link>

</div>

## Inspiration
In today’s fast-paced world, staying on top of financial news can feel overwhelming. Between scattered sources, paywalls, and jargon-heavy reports, most people don’t have the time or tools to make sense of what’s happening in the markets each day. We wanted to change that by creating something simple, clear, and convenient — a way for anyone to get daily financial news and insights in one place without the clutter or confusion.

Finance shouldn’t feel like a foreign language. With FinScope, users can easily understand what’s moving the markets, get personalized reports based on their interests, and even enable Beginner Mode to “translate” complex topics into plain English. Whether you’re a beginner exploring finance for the first time or a seasoned pro tracking market trends, FinScope makes it effortless to stay informed and keep learning one daily report at a time.

## What it does
- Gathers and summarizes financial news from trusted global sources every morning (NewsAPI with a Reuters RSS fallback — no paywall required).
- Lets you enter stock tickers (and favorites) for personalized coverage and charts.
- Highlights market movers, macro signals (10Y, CPI YoY, unemployment), and sentiment.
- Uses AI agents to extract key insights, trends, and headline impacts per ticker.
- Beginner Mode rewrites the daily brief in simple, friendly language.
- Share any report via QR link (time-limited) so friends can read it quickly on mobile.
- Quick vs Full runs: a fast preview for mornings and a deeper full report when you have time.

The result: market noise becomes a clear, digestible briefing for smarter financial decisions.

## How we built it
**Frontend**: React 18 + Vite + Tailwind. Axios utilities with in-memory GET cache and request coalescing. Supabase Auth (magic links). Runtime API override for cache-busting (`?api=/api`).

**Backend**: Hybrid Node.js (Express) + Python (FastAPI).
- Node: routes for agents/report, data summary, share links, settings, Plaid; explicit CORS; health/readiness.
- Python: market (`/market`), analysis (`/analyze`), forecast (`/forecast`), bank summary (`/bank/summary`).

**AI & data**:
- Multi-agent pipeline: DataAgent → Analyzer → Macro/News → Optional Forecasts → InvestAgent → Teacher.
- Sources: Yahoo Finance (series), FRED (macro), NewsAPI/Reuters (headlines), simple news→ticker impact map, optional Plaid sandbox.
- LLM: Gemini (via `ADK_API_KEY` or `GOOGLE_API_KEY`) for explanations; safe fallback to a rules-based “beginner” summary when keys aren’t set.

**Infra**: Docker Compose (frontend, node, python, redis). Zero-cost deploy using a Cloudflare Named Tunnel with single-domain, path-based routing: `/` → frontend, `/api` → Node, `/py` → Python. This removes cross-origin CORS entirely.

**Caching/perf**:
- Redis-backed shared cache (fallback to in-memory) for Node + Python.
- Python `fastapi-cache2` for `/market` (120s), `/forecast` (600s), `/bank/summary` (60s).
- Node caches macro/news (300s), market series (120s), and forecasts (600s).
- Frontend Axios GET cache (default 30s; summary 60s).

## Architecture (at a glance)
```
Browser (React/Vite) ── same-origin ──> Cloudflare Tunnel (app.yourdomain)
		 │                                        │
		 ├─ /api ────────────────────────────────> Node (Express)
		 │                                        └─ talks to Python, FRED, News, Redis
		 └─ /py  ────────────────────────────────> Python (FastAPI)
```

## Run it locally (Windows/PowerShell)
Prereqs: Docker Desktop.

1) Copy `.env` (fill keys). Recommended for richer data: `FRED_API_KEY`, `ALPHAVANTAGE_API_KEY`, optional `NEWS_API_KEY`, `ADK_API_KEY` or `GOOGLE_API_KEY`.

2) Start the stack:
```powershell
docker compose up -d --build
```

3) Open http://localhost:5173
```powershell
Invoke-WebRequest http://localhost:4000/api/health
Invoke-WebRequest http://localhost:8000/health
```

Tip: You can override the API base at runtime if a cached bundle ever appears:
`http://localhost:5173/?api=http://localhost:4000` (sticks for the tab via sessionStorage).

## Free deployment (no servers): Cloudflare Tunnel (single domain)
Use a named tunnel with path routing (no CORS, stable URLs):

1) Authenticate and create the tunnel
```powershell
cloudflared tunnel login
cloudflared tunnel create finscope
cloudflared tunnel list  # copy the Tunnel ID
```

2) `C:\Users\<you>\.cloudflared\config.yml`
```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL_ID>.json

ingress:
	- hostname: app.yourdomain.com
		path: /api/*
		service: http://localhost:4000
		originRequest: { httpHostHeader: localhost }

	- hostname: app.yourdomain.com
		path: /py/*
		service: http://localhost:8000
		originRequest: { httpHostHeader: localhost }

	- hostname: app.yourdomain.com
		service: http://localhost:5173
		originRequest: { httpHostHeader: localhost }

	- service: http_status:404
```

3) Route DNS and run the tunnel
```powershell
cloudflared tunnel route dns finscope app.yourdomain.com
cloudflared tunnel --config C:\Users\<you>\.cloudflared\config.yml run
```

4) Set env and rebuild once
```
FRONTEND_ORIGIN=https://app.yourdomain.com
VITE_API_BASE_URL=/api
VITE_PY_API_BASE_URL=/py
```
```powershell
docker compose up -d --build node-api frontend
```

5) Supabase Auth
- Site URL: `https://app.yourdomain.com`
- Additional Redirect URLs: include the domain above (magic links).

Now open `https://app.yourdomain.com` and click “Generate Today’s Report”.

## Environment variables (high‑value)
- `FRONTEND_ORIGIN` — your public origin (used for CORS + share links)
- `VITE_API_BASE_URL`, `VITE_PY_API_BASE_URL` — set to `/api` and `/py` for single-domain routing
- `FRED_API_KEY`, `ALPHAVANTAGE_API_KEY` — richer summary cards
- `ADK_API_KEY` or `GOOGLE_API_KEY` — Gemini teacher explanations
- `NEWS_API_KEY` — higher-quality headlines (falls back to Reuters RSS)
- `PLAID_CLIENT_ID`, `PLAID_SECRET` — optional Plaid sandbox
- `REDIS_URL` — `redis://redis:6379/0` (compose default)

## Challenges we ran into
- CORS over quick tunnels: Cloudflare’s edge answered preflights; fixed via explicit OPTIONS handling and ultimately removed CORS by going single-domain.
- Vite host checks: solved with `allowedHosts` and `httpHostHeader: localhost` in the tunnel.
- Supabase redirects: magic links initially pointed to localhost; fixed Auth “Site URL” + redirect origins.
- Stale bundles: browsers/edge cached old JS with old API URLs; added a runtime `?api=` override and recommended Cloudflare Development Mode during deploy.

## Accomplishments we’re proud of
- End‑to‑end agent pipeline with market, macro, news, forecasts, and a friendly teacher.
- Beginner Mode that “translates” finance into plain English.
- QR sharing with TTL — send a daily report to your phone in seconds.
- Zero‑cost, stable deployment using a single Cloudflare Tunnel domain (no CORS, no servers).

## What we learned
- Don’t fight CORS if you can avoid it — same‑origin routing is simpler and faster.
- Cache the right layers: browser, Node, Python, and shared Redis each provide a big UX boost.
- Clear UX wins: Quick vs Full, favorites, gentle hints when keys are missing.

## What’s next for FinScope
- Notifications and inbox delivery (email/Telegram/Discord) for the daily brief.
- Portfolio import + deeper personal finance insights.
- Multilingual summaries and voice briefings.
- More robust LLM guardrails and explain‑like‑I’m‑5 glossary.
- PWA for offline reading.

## Screenshots / Demo
- Dashboard (daily brief) — <screenshot>
- Beginner Mode explanation — <screenshot>
- Share via QR — <screenshot>

## License
MIT
