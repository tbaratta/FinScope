import { Router } from 'express'
import crypto from 'crypto'
import { getLastReport } from '../controllers/cache.js'
import { set as cacheSet, get as cacheGet } from '../lib/kvCache.js'

const router = Router()

// Create a public share token for the latest report and store it with a TTL
router.post('/', async (req, res) => {
  try {
    const { report } = getLastReport()
    const provided = req.body?.report
    const rep = provided || report
    if (!rep) return res.status(400).json({ error: 'No report available to share' })
    const token = crypto.randomBytes(8).toString('hex')
    const ttlSec = Math.max(300, Math.min(86400, Number(process.env.SHARE_TTL_SECONDS || 3600))) // default 1h
    await cacheSet(`share:${token}`, rep, ttlSec)
  // Hardcode production origin to ensure QR/link always uses the public app domain
  const origin = 'https://app.finscope.us'
  const url = `${origin.replace(/\/$/, '')}/share/${token}`
    return res.json({ token, url, ttl_seconds: ttlSec })
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create share', detail: e?.message })
  }
})

// Retrieve a shared report by token (no auth)
router.get('/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '')
    if (!token) return res.status(400).json({ error: 'Missing token' })
    const rep = await cacheGet(`share:${token}`)
    if (!rep) return res.status(404).json({ error: 'Share not found or expired' })
    return res.json({ report: rep })
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load share', detail: e?.message })
  }
})

export default router
