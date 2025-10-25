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
from db import init_db, insert_timeseries, query_timeseries, upsert_transaction, get_conn
from datetime import datetime, timezone

# Create FastAPI app instance first
app = FastAPI(title="FinScope Python Service")

@app.on_event("startup")
async def _startup():
    init_db()

@app.post("/report")
async def report(payload: dict = Body(...)):
    """Run all agents and return a unified financial insight report.

    Accepts any of the following shapes:
    - { "symbols": ["AAPL", "MSFT"] }
    - { "positions": [{"symbol": "AAPL", "weight": 0.2}, ...] }
    - { "portfolio": { "AAPL": [prices...], ... } }
    """
    symbols = None
    # Prefer explicit symbols list
    if isinstance(payload.get("symbols"), list):
        symbols = [s for s in payload.get("symbols") if isinstance(s, str)]
    # Or extract from positions list
    elif isinstance(payload.get("positions"), list):
        symbols = [str(p.get("symbol")) for p in payload.get("positions") if isinstance(p, dict) and p.get("symbol")]
    # Or pass through portfolio dict
    portfolio = payload.get("portfolio") if isinstance(payload.get("portfolio"), dict) else None
    # If no inputs provided, default to SPY
    if not symbols and not portfolio:
        symbols = ["SPY"]

    user_input = symbols if symbols else portfolio
    report_obj = generate_report(user_input)
    return {"report": report_obj}
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

# --- InvestAgent-lite: simple rebalance suggestion based on volatility and macro ---
class InvestInput(BaseModel):
    positions: List[dict]
    macro: Optional[dict] = None

@app.post("/invest")
async def invest(payload: InvestInput):
    try:
        # compute class exposures (very simplified mapping)
        positions = payload.positions or []
        weights = {str(p.get('symbol')).upper(): float(p.get('weight')) for p in positions if p.get('symbol') and p.get('weight')}
        # fetch recent vol for select ETFs as proxies
        proxies = {}
        for sym in ['BND', 'IEF', 'SHY', 'SPY', 'QQQ', 'BTC-USD']:
            hist = yf.Ticker(sym).history(period='3mo', interval='1d', auto_adjust=False)
            if hist is None or hist.empty:
                continue
            r = hist['Close'].pct_change().dropna()
            proxies[sym] = {
                'mean': float(r.mean()),
                'vol': float(r.std())
            }
        macro = payload.macro or {}
        vix = float(macro.get('vix_last')) if macro.get('vix_last') is not None else None
        cpi = float(macro.get('cpi_yoy_pct')) if macro.get('cpi_yoy_pct') is not None else None

        # heuristic: if crypto present and its vol >> bonds vol, suggest small rebalance to bonds
        signal = None
        rationale = []
        confidence = 0.5
        crypto_weight = sum(w for s, w in weights.items() if 'BTC' in s or 'ETH' in s or s in ['MARA','RIOT'])
        bond_vol = proxies.get('BND', {}).get('vol') or proxies.get('IEF', {}).get('vol') or 0.005
        btc_vol = proxies.get('BTC-USD', {}).get('vol')
        if crypto_weight and btc_vol and bond_vol and btc_vol > bond_vol * 2.0:
            signal = f"rebalance_{min(5, int(round(crypto_weight*100)))}pct_from_crypto_to_bonds"
            rationale.append('Crypto volatility materially exceeds bonds over the last 3 months.')
            confidence = 0.6
        if vix and vix > 25:
            rationale.append('VIX is elevated; adding defensive exposure can reduce downside risk.')
            confidence = max(confidence, 0.65)
        if cpi and cpi < 3.0:
            rationale.append('Cooling CPI favors duration slightly in the near term.')
        if not signal:
            signal = 'hold_review_next_week'
            rationale.append('No strong imbalance detected; maintain allocations and review weekly.')
            confidence = 0.5
        return {
            'portfolio': [{'ticker': s, 'weight': w} for s, w in weights.items()],
            'risk_exposure': { 'crypto': crypto_weight },
            'signal': signal,
            'rationale': ' '.join(rationale),
            'confidence': confidence
        }
    except Exception as e:
        return { 'error': str(e) }

# --- Timeseries storage endpoints ---
class TSRow(BaseModel):
    source: str
    metric: str
    timestamp: str
    value: float
    ingest_ts: Optional[str] = None
    meta: Optional[dict] = None

@app.post("/timeseries/ingest")
async def ts_ingest(rows: List[TSRow]):
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = []
    for r in rows:
        payload.append({
            "source": r.source,
            "metric": r.metric,
            "timestamp": r.timestamp,
            "value": r.value,
            "ingest_ts": r.ingest_ts or now_iso,
            "meta": r.meta or {},
        })
    insert_timeseries(payload)
    return {"ingested": len(payload)}

@app.get("/timeseries/query")
async def ts_query(metric: str, start: Optional[str] = None, end: Optional[str] = None):
    rows = query_timeseries(metric, start, end)
    labels = [r["timestamp"] for r in rows]
    values = [r["value"] for r in rows]
    return {"metric": metric, "labels": labels, "values": values}

# --- Transactions storage (for Plaid) ---
@app.post("/bank/transactions")
async def bank_transactions(payload: dict = Body(...)):
    txns = payload.get("transactions")
    if not isinstance(txns, list):
        return {"error": "transactions must be a list"}
    for t in txns:
        try:
            upsert_transaction(t)
        except Exception:
            continue
    return {"stored": len(txns)}

# --- Bank summary aggregates (last N days)
@app.get("/bank/summary")
async def bank_summary(days: int = 30):
    try:
        # derive date cutoff
        from datetime import date, timedelta
        cutoff = (date.today() - timedelta(days=max(1, days))).isoformat()
        by_category = {}
        by_merchant = {}
        total = 0.0
        with get_conn() as c:
            # Only consider positive amounts (spend)
            cur = c.execute("SELECT date, name, amount, category FROM transactions WHERE date>=? AND amount>0", (cutoff,))
            for d, name, amount, category in cur.fetchall():
                amt = float(amount or 0)
                total += amt
                cat = None
                if category:
                    # category is a comma-separated string; use the first element as top-level
                    cat = str(category).split(',')[0].strip()
                cat = cat or 'Uncategorized'
                by_category.setdefault(cat, {'count': 0, 'total': 0.0})
                by_category[cat]['count'] += 1
                by_category[cat]['total'] += amt
                nm = name or 'Unknown'
                by_merchant.setdefault(nm, {'count': 0, 'total': 0.0})
                by_merchant[nm]['count'] += 1
                by_merchant[nm]['total'] += amt
        # format top lists
        top_categories = sorted([
            {'category': k, 'count': v['count'], 'total': round(v['total'], 2)} for k, v in by_category.items()
        ], key=lambda x: x['total'], reverse=True)[:8]
        top_merchants = sorted([
            {'merchant': k, 'count': v['count'], 'total': round(v['total'], 2)} for k, v in by_merchant.items()
        ], key=lambda x: x['total'], reverse=True)[:8]
        # recurring = merchants with >=3 transactions within the window
        recurring = [m for m in top_merchants if m['count'] >= 3]
        return {
            'window_days': days,
            'total_spend': round(total, 2),
            'top_categories': top_categories,
            'top_merchants': top_merchants,
            'recurring_merchants': recurring,
        }
    except Exception as e:
        return { 'error': str(e) }
    
    
