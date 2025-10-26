import { Router } from 'express'
import axios from 'axios'
import { withCache } from '../lib/kvCache.js'

const router = Router()

// Cache TTLs (seconds)
const TTL_SUMMARY = 60
const TTL_FRED = 300
const TTL_ALPHA = 300
const TTL_YF = 120

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

async function fetchYfViaPython(pyUrl, symbol, period='1mo', interval='1d') {
  const { data } = await axios.get(`${pyUrl}/market`, { params: { symbol, period, interval }, timeout: 15000 })
  if (data?.error) throw new Error(data.error)
  return data
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
    // Gather dependencies with caching
    const { FRED_API_KEY, ALPHAVANTAGE_API_KEY } = process.env
    if (!FRED_API_KEY || !ALPHAVANTAGE_API_KEY) {
      return res.status(500).json({ error: 'Missing API keys: set FRED_API_KEY and ALPHAVANTAGE_API_KEY in .env' })
    }

    const spy = await withCache({
      key: `alpha:SPY:daily`,
      ttlSec: TTL_ALPHA,
      task: () => fetchAlphaDaily('SPY', ALPHAVANTAGE_API_KEY)
    })
    const pyUrl = process.env.PYTHON_SERVICE_URL || 'http://py-api:8000'
    const btc = await withCache({
      key: `yf:BTC-USD:1mo:1d`,
      ttlSec: TTL_YF,
      task: () => fetchYfViaPython(pyUrl, 'BTC-USD', '1mo', '1d')
    })
    const dgs10 = await withCache({
      key: `fred:DGS10`,
      ttlSec: TTL_FRED,
      task: () => fetchFredSeries('DGS10', FRED_API_KEY)
    })
    const cpi = await withCache({
      key: `fred:CPIAUCSL`,
      ttlSec: TTL_FRED,
      task: () => fetchFredSeries('CPIAUCSL', FRED_API_KEY)
    })
    const obs = cpi.obs
    const last = Number(obs[obs.length-1].value)
    const prev = Number(obs[Math.max(0, obs.length-13)].value)
    const cpiYoY = prev > 0 ? ((last - prev) / prev) * 100 : null

    const labels = spy.labels
    const series = spy.values

    const summary = {
      cards: [
        { label: 'S&P 500 (SPY)', value: spy.last.toLocaleString(undefined, { maximumFractionDigits: 2 }), delta: null },
        { label: 'BTC/USD', value: btc?.last != null ? btc.last.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A', delta: null },
        { label: '10Y Yield', value: `${dgs10.last.toFixed(2)}%`, delta: null },
        { label: 'CPI YoY', value: cpiYoY !== null ? `${cpiYoY.toFixed(2)}%` : 'N/A', delta: null }
      ],
      chart: { labels, series }
    }

    // Client caching hints
    res.set('Cache-Control', `public, max-age=${TTL_SUMMARY}, stale-while-revalidate=60`)
    res.json(summary)
  } catch (err) {
    res.status(500).json({ error: 'Failed to load summary', detail: err?.message })
  }
})

// Supabase auth helper: validate bearer token and return user
async function getSupabaseUser(req) {
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const base = process.env.SUPABASE_URL
  if (!base) return null
  try {
    const apikey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY
    const headers = { Authorization: `Bearer ${token}` }
    if (apikey) headers['apikey'] = apikey
    headers['Content-Type'] = 'application/json'
    headers['X-Client-Info'] = 'finscope-server'
    const { data } = await axios.get(`${base}/auth/v1/user`, { headers, timeout: 10000 })
    return data || null
  } catch (_) {
    return null
  }
}

// Real portfolio endpoints backed by MongoDB, per authenticated user
router.get('/portfolio', async (req, res) => {
  try {
    const user = await getSupabaseUser(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const db = req.app.locals.db
    if (!db) return res.status(500).json({ error: 'Database not configured (set MONGO_URI)' })
    const doc = await db.collection('portfolios').findOne({ user_id: user.id })
    return res.json({
      owner: user.email,
      positions: doc?.positions || []
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load portfolio', detail: err?.message })
  }
})

router.put('/portfolio', async (req, res) => {
  try {
    const user = await getSupabaseUser(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const db = req.app.locals.db
    if (!db) return res.status(500).json({ error: 'Database not configured (set MONGO_URI)' })
    const positions = Array.isArray(req.body?.positions) ? req.body.positions : []
    // Validation: enforce limits and sum of weights ~ 1.0
    if (positions.length > 50) return res.status(400).json({ error: 'Too many positions (max 50).' })
    const clean = positions
      .filter(p => p && typeof p.symbol === 'string' && isFinite(p.weight))
      .map(p => ({ symbol: String(p.symbol).toUpperCase().trim(), weight: Number(p.weight) }))
      .filter(p => p.symbol && p.weight > 0 && p.weight <= 1)
    const total = clean.reduce((acc, p) => acc + p.weight, 0)
    if (!(total > 0.95 && total < 1.05)) {
      return res.status(400).json({ error: 'Weights must sum to approximately 1.0 (±5%).', total })
    }
    await db.collection('portfolios').updateOne(
      { user_id: user.id },
      { $set: { user_id: user.id, email: user.email, positions: clean, updated_at: new Date() } },
      { upsert: true }
    )
    const doc = await db.collection('portfolios').findOne({ user_id: user.id })
    return res.json({ owner: doc.email, positions: doc.positions })
  } catch (err) {
    res.status(500).json({ error: 'Failed to save portfolio', detail: err?.message })
  }
})

export default router
