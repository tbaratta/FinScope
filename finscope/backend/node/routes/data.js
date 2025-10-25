import { Router } from 'express'
import axios from 'axios'

const router = Router()

// Simple in-memory cache
let cache = { summary: null, ts: 0 }
const ttlMs = 60_000

async function fetchAlphaDaily(symbol, apiKey) {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${apiKey}`
  const { data } = await axios.get(url, { timeout: 15000 })
  const series = data['Time Series (Daily)']
  if (!series) throw new Error('AlphaVantage daily series missing')
  const entries = Object.entries(series).sort((a,b) => a[0] > b[0] ? 1 : -1)
  const labels = entries.slice(-30).map(([d]) => d)
  const values = entries.slice(-30).map(([, v]) => Number(v['5. adjusted close']))
  return { labels, values, last: values[values.length-1] }
}

async function fetchFredSeries(seriesId, apiKey) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json`
  const { data } = await axios.get(url, { timeout: 15000 })
  const obs = (data.observations || []).filter(o => o.value !== '.')
  if (!obs.length) throw new Error('FRED observations missing')
  const last = Number(obs[obs.length-1].value)
  return { last, obs }
}

router.get('/summary', async (_req, res) => {
  try {
    const now = Date.now()
    if (cache.summary && (now - cache.ts < ttlMs)) return res.json(cache.summary)

    const { ALPHAVANTAGE_API_KEY, FRED_API_KEY } = process.env
    if (!ALPHAVANTAGE_API_KEY || !FRED_API_KEY) {
      return res.status(500).json({ error: 'Missing API keys: set ALPHAVANTAGE_API_KEY and FRED_API_KEY in .env' })
    }

    // S&P proxy: SPY
    const spy = await fetchAlphaDaily('SPY', ALPHAVANTAGE_API_KEY)
    // BTC proxy: use BTC-USD via AlphaVantage digital currency daily (simpler: use SPY trend for the chart but provide real cards)
    // 10Y yield
    const dgs10 = await fetchFredSeries('DGS10', FRED_API_KEY)
    // CPI YoY: compute from CPIAUCSL
    const cpi = await fetchFredSeries('CPIAUCSL', FRED_API_KEY)
    const obs = cpi.obs
    const last = Number(obs[obs.length-1].value)
    const prev = Number(obs[Math.max(0, obs.length-13)].value)
    const cpiYoY = prev > 0 ? ((last - prev) / prev) * 100 : null

    const labels = spy.labels
    const series = spy.values

    const summary = {
      cards: [
        { label: 'S&P 500 (SPY)', value: spy.last.toLocaleString(undefined, { maximumFractionDigits: 2 }), delta: null },
        { label: '10Y Yield', value: `${dgs10.last.toFixed(2)}%`, delta: null },
        { label: 'CPI YoY', value: cpiYoY !== null ? `${cpiYoY.toFixed(2)}%` : 'N/A', delta: null }
      ],
      chart: { labels, series }
    }

    cache = { summary, ts: now }
    res.json(summary)
  } catch (err) {
    res.status(500).json({ error: 'Failed to load summary', detail: err?.message })
  }
})

// Sample portfolio endpoint (mock)
router.get('/portfolio', async (_req, res) => {
  try {
    res.json({
      owner: 'demo@user',
      positions: [
        { symbol: 'AAPL', weight: 0.25 },
        { symbol: 'MSFT', weight: 0.25 },
        { symbol: 'VOO', weight: 0.30 },
        { symbol: 'XLE', weight: 0.10 },
        { symbol: 'BTC-USD', weight: 0.10 }
      ]
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load portfolio' })
  }
})

export default router
