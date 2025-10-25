from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from typing import List, Optional

app = FastAPI(title="FinScope Python Service")
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
    # Simple z-score on portfolio and isolation forest anomalies
    try:
        vals = payload.portfolio.values if payload.portfolio else [100 + i*0.2 for i in range(50)]
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
async def forecast(symbol: str = "PORT", horizon: int = 14):
    # Simple linear regression forecast as baseline
    n = 60
    x = np.arange(n).reshape(-1, 1)
    y = (100 + 0.2 * np.arange(n) + np.sin(np.arange(n)/5)*2 + np.random.normal(0, 0.5, n)).reshape(-1, 1)
    lr = LinearRegression().fit(x, y)
    future_idx = np.arange(n, n+horizon).reshape(-1, 1)
    yhat = lr.predict(future_idx).flatten().tolist()
    labels = [f"D{i+1}" for i in range(horizon)]
    return {"symbol": symbol, "labels": labels, "forecast": yhat}

class SimInput(BaseModel):
    shift_pct: float = 10.0
    from_sector: str = "tech"
    to_sector: str = "energy"

@app.post("/simulate")
async def simulate(sim: SimInput):
    # Mocked simulation effect
    impact = round(sim.shift_pct * 0.1, 2)
    return {
        "message": f"Shifted {sim.shift_pct}% from {sim.from_sector} to {sim.to_sector}.",
        "expected_risk_change_pct": -impact,
        "expected_return_change_pct": impact
    }
