from fastapi import FastAPI, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from typing import List, Optional
import yfinance as yf

from agents.orchestrator import generate_report

# Create FastAPI app instance first
app = FastAPI(title="FinScope Python Service")

@app.post("/report")
async def report(payload: dict = Body(...)):
    """Run all agents and return a unified financial insight report."""
    portfolio = payload.get("portfolio", {"SPY": [440, 445, 450, 455, 460]})
    report_text = generate_report(portfolio)
    return {"report": report_text}
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SeriesInput(BaseModel):
    labels: List[str]
    values: List[float]

class AnalyzeInput(BaseModel):
    portfolio: Optional[SeriesInput] = None
    benchmark: Optional[SeriesInput] = None

@app.get("/health")
async def health():
    return {"ok": True}

@app.post("/analyze")
async def analyze(payload: AnalyzeInput = Body(...)):
    # Z-score on portfolio and isolation forest anomalies using real data fallback
    try:
        if payload.portfolio and payload.portfolio.values:
            vals = payload.portfolio.values
        else:
            # Fallback to SPY close values (1mo, 1d) for a real series
            hist = yf.Ticker("SPY").history(period="1mo", interval="1d", auto_adjust=False)
            if hist is None or hist.empty:
                return {"error": "No market data available for analysis"}
            vals = hist['Close'].astype(float).tolist()
        ser = np.array(vals)
        z = (ser - ser.mean()) / (ser.std() + 1e-9)
        iso = IsolationForest(contamination=0.05, random_state=42)
        iso.fit(ser.reshape(-1, 1))
        scores = -iso.score_samples(ser.reshape(-1, 1))
        anomalies = (scores > np.percentile(scores, 95)).tolist()

        insights = []
        if np.mean(z[-5:]) > 0.5:
            insights.append("Portfolio trending upward lately vs baseline.")
        if any(anomalies[-5:]):
            insights.append("Recent anomaly detected; review recent exposures.")

        return {
            "z_score_last": float(z[-1]),
            "anomaly_flags": anomalies,
            "insights": insights or ["No significant anomalies detected."]
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/forecast")
async def forecast(symbol: str = "SPY", horizon: int = 14):
    """Forecast using simple linear regression over recent market closes via yfinance."""
    # Pull recent history
    hist = yf.Ticker(symbol).history(period="3mo", interval="1d", auto_adjust=False)
    if hist is None or hist.empty:
        return {"error": f"No market data for {symbol}"}
    y = hist['Close'].astype(float).values
    n = len(y)
    if n < 20:
        return {"error": "Insufficient data for forecast"}
    x = np.arange(n).reshape(-1, 1)
    y2d = y.reshape(-1, 1)
    lr = LinearRegression().fit(x, y2d)
    future_idx = np.arange(n, n + horizon).reshape(-1, 1)
    yhat = lr.predict(future_idx).flatten().tolist()
    labels = [str(idx) for idx in range(1, horizon + 1)]
    return {"symbol": symbol, "labels": labels, "forecast": yhat}

class SimInput(BaseModel):
    shift_pct: float = 10.0
    from_sector: str = "tech"
    to_sector: str = "energy"

@app.post("/simulate")
async def simulate(sim: SimInput):
    """Estimate impact of shifting allocation between sectors using recent returns/volatility of sector ETFs."""
    sector_etf = {
        "tech": "XLK",
        "energy": "XLE",
        "healthcare": "XLV",
        "financials": "XLF",
        "industrials": "XLI",
        "materials": "XLB",
        "utilities": "XLU",
        "real_estate": "XLRE",
        "consumer_discretionary": "XLY",
        "consumer_staples": "XLP",
        "communication": "XLC",
    }
    src = sector_etf.get(sim.from_sector.lower())
    dst = sector_etf.get(sim.to_sector.lower())
    if not src or not dst:
        return {"error": "Unknown sector. Use keys like tech, energy, healthcare, financials, ..."}
    try:
        h_from = yf.Ticker(src).history(period="3mo", interval="1d", auto_adjust=False)
        h_to = yf.Ticker(dst).history(period="3mo", interval="1d", auto_adjust=False)
        if h_from.empty or h_to.empty:
            return {"error": "No data for sector ETFs"}
        r_from = h_from['Close'].pct_change().dropna()
        r_to = h_to['Close'].pct_change().dropna()
        mean_from = float(r_from.mean())
        mean_to = float(r_to.mean())
        vol_from = float(r_from.std())
        vol_to = float(r_to.std())
        # Approximate portfolio-level delta from shifting 'shift_pct' percentage points
        w = sim.shift_pct / 100.0
        expected_return_change_pct = round((mean_to - mean_from) * w * 100.0, 2)
        expected_risk_change_pct = round((vol_to - vol_from) * w * 100.0, 2)
        return {
            "message": f"Shifted {sim.shift_pct}% from {sim.from_sector} ({src}) to {sim.to_sector} ({dst}).",
            "expected_risk_change_pct": expected_risk_change_pct,
            "expected_return_change_pct": expected_return_change_pct,
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/market")
async def market(
    symbol: str = Query(..., description="Ticker symbol, e.g., SPY"),
    period: str = Query("1mo", description="yfinance period, e.g., 1mo, 3mo, 6mo, 1y"),
    interval: str = Query("1d", description="yfinance interval, e.g., 1d, 1h")
):
    """Fetch market time-series via yfinance. Returns labels (dates) and values (close)."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period, interval=interval, auto_adjust=False)
        if hist is None or hist.empty:
            return {"error": "No data returned from yfinance"}
        # Ensure index is string dates
        labels = [str(x.date()) if hasattr(x, 'date') else str(x) for x in hist.index]
        values = hist['Close'].astype(float).tolist()
        last = float(values[-1]) if values else None
        return {"symbol": symbol, "labels": labels, "values": values, "last": last}
    except Exception as e:
        return {"error": str(e)}
    
    
