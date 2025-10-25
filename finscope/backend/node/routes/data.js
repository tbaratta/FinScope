import { Router } from 'express'
import axios from 'axios'

const router = Router()

// Simple in-memory cache
let cache = { summary: null, ts: 0 }
const ttlMs = 60_000

router.get('/summary', async (_req, res) => {
  try {
    const now = Date.now()
    if (cache.summary && (now - cache.ts < ttlMs)) return res.json(cache.summary)

    // Mocked data (replace with real API calls to Yahoo, FRED, etc.)
    const labels = Array.from({ length: 30 }, (_, i) => `D${i+1}`)
    const base = 100
    const series = labels.map((_, i) => base + Math.sin(i/5)*2 + i*0.2 + (Math.random()-0.5))

    const summary = {
      cards: [
        { label: 'S&P 500', value: '4,780', delta: 0.6 },
        { label: 'BTC/USD', value: '$66,420', delta: -1.2 },
        { label: '10Y Yield', value: '4.34%', delta: 0.1 },
        { label: 'CPI YoY', value: '3.2%', delta: -0.1 }
      ],
      chart: { labels, series }
    }

    cache = { summary, ts: now }
    res.json(summary)
  } catch (err) {
    res.status(500).json({ error: 'Failed to load summary' })
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
