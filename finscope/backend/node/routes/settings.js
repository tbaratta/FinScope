import { Router } from 'express'

const router = Router()

// Simple server-side settings persistence.
// If MongoDB is configured, persist in collection 'settings' with _id='default'.
// Otherwise, keep an in-memory copy for the lifetime of the process.

const memorySettings = new Map() // user_id -> settings object

const DEFAULT_SETTINGS = {
  defaultSymbols: 'SPY, QQQ, DIA',
  chartDays: 7,
  currency: 'USD',
  timezone: 'America/New_York',
  beginnerMode: false,
}

function sanitizeSettings(body) {
  const s = {}
  if (typeof body?.defaultSymbols === 'string') s.defaultSymbols = body.defaultSymbols
  if (Number.isFinite(Number(body?.chartDays))) s.chartDays = Number(body.chartDays)
  if (typeof body?.currency === 'string') s.currency = body.currency
  if (typeof body?.timezone === 'string') s.timezone = body.timezone
  if (typeof body?.beginnerMode === 'boolean') s.beginnerMode = body.beginnerMode
  return s
}

router.get('/', async (req, res) => {
  try {
    const user_id = String(req.headers['x-user-id'] || req.query.user_id || 'demo-user')
    const db = req.app?.locals?.db
    if (db) {
      const doc = await db.collection('settings').findOne({ _id: `settings:${user_id}` })
      return res.json({ settings: { ...DEFAULT_SETTINGS, ...(doc?.settings || {}) }, user_id })
    }
    // Fallback to memory or defaults
    const mem = memorySettings.get(user_id) || {}
    return res.json({ settings: { ...DEFAULT_SETTINGS, ...mem }, user_id })
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load settings' })
  }
})

router.put('/', async (req, res) => {
  try {
    const incoming = sanitizeSettings(req.body || {})
    const user_id = String(req.headers['x-user-id'] || req.body?.user_id || 'demo-user')
    const db = req.app?.locals?.db
    if (db) {
      const result = await db.collection('settings').findOneAndUpdate(
        { _id: `settings:${user_id}` },
        { $set: { settings: { ...DEFAULT_SETTINGS, ...incoming } } },
        { upsert: true, returnDocument: 'after' }
      )
      const settings = result?.value?.settings || { ...DEFAULT_SETTINGS, ...incoming }
      return res.json({ ok: true, settings, user_id })
    }
    // Memory fallback
    const current = memorySettings.get(user_id) || {}
    const next = { ...DEFAULT_SETTINGS, ...current, ...incoming }
    memorySettings.set(user_id, next)
    return res.json({ ok: true, settings: next, user_id })
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save settings' })
  }
})

export default router
