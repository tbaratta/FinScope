# FinScope: AI Financial Mission Control

FinScope is a hackathon-ready, multi-agent financial intelligence dashboard powered by Google ADK (Gemini 2.5 Flash). It fetches live data, analyzes correlations to a mock personal portfolio, detects anomalies, and explains insights conversationally.

## Tech Stack
- Frontend: React + Vite + TailwindCSS + Chart.js
- Backend: Node.js (Express) + Python (FastAPI microservice)
- Database: MongoDB Atlas (optional)
- AI/Agents: Google ADK (Gemini 2.5 Flash) configs
- APIs: Yahoo Finance, AlphaVantage, NewsAPI, FRED (live data; requires API keys)
- Auth: Supabase
- Reports: PDF via Node (pdfkit)

## Directory Structure
```
finscope/
  frontend/
  backend/
    node/
    python/
  agents/
  docs/
  .env.example
  docker-compose.yml
  setup.sh
  setup.ps1
```

## Local Development
1) Clone your repo (this repo is `FinScope`):

```bash
# Windows PowerShell
# Ensure you have Node 18+, Python 3.10+, and Docker Desktop (optional)
```

2) Configure env vars:
```bash
# Copy template
cp finscope/.env.example finscope/.env
# On Windows PowerShell
# Copy-Item finscope/.env.example finscope/.env
```
Fill in:
- MONGO_URI (optional for MVP)
- VITE_SUPABASE_URL, VITE_SUPABASE_KEY (required for login)
- ADK_API_KEY (for ADK if you wire runtime)
- API keys for News/Yahoo/FRED/AlphaVantage as needed

3) Install and run automatically with Docker (recommended):
```bash
cd finscope
docker-compose up --build
```
- Frontend: http://localhost:5173
- Node API: http://localhost:4000
- Python API: http://localhost:8000

4) Or run manually (dev mode):
```bash
# Windows PowerShell
cd finscope; ./setup.ps1
# Start Python API
cd backend/python; . ./.venv/Scripts/Activate.ps1; uvicorn main:app --reload --port 8000
# Start Node API (new terminal)
cd finscope/backend/node; npm start
# Start Frontend (new terminal)
cd finscope/frontend; npm run dev
```

## API Endpoints
- Node
  - GET /api/data/summary → live data cards and chart (AlphaVantage + FRED)
  - POST /api/analyze → proxies to Python /analyze
  - GET /api/forecast → proxies to Python /forecast
  - POST /api/report → generates PDF (download)
  - POST /api/analyze/chat → Gemini-powered chat (requires ADK_API_KEY)
- Python
  - POST /analyze → z-score + IsolationForest anomalies
  - GET /forecast → linear regression baseline forecast
  - POST /simulate → what-if impact stub

## Agents (ADK Configs)
Configs under `agents/` reference sub-agents and tools. Wire them with Google ADK runner/SDK as needed at runtime. Mission Control delegates to DataAgent, AnalyzerAgent, ForecasterAgent, InvestAgent, TeacherAgent, NotifierAgent, SandboxAgent.

## Notes
- No demo mode: Services fail fast on missing keys.
- Required keys in `.env`: FRED_API_KEY, ALPHAVANTAGE_API_KEY, ADK_API_KEY, plus VITE_SUPABASE_URL/KEY (frontend).
- Supabase OAuth provider is set to GitHub by default. Enable in your Supabase project.
- PDF is generated server-side for consistency.

## Deployment
- Frontend: Vercel (build from `finscope/frontend`)
- Node API + Python API: Render, Railway, Fly.io, or similar
- Database: MongoDB Atlas

## License
MIT
