import crypto from 'crypto'

// Simple key-value cache with TTL. Uses Redis if REDIS_URL provided, else in-memory Map.
// Exposes: get(key), set(key, value, ttlSec), with JSON serialization.

let client = null
let hasRedis = false

async function initRedis() {
  if (client || hasRedis) return
  const url = process.env.REDIS_URL
  if (!url) return
  try {
    const { createClient } = await import('redis')
    client = createClient({ url })
    client.on('error', (err) => console.warn('[cache] Redis error:', err?.message))
    await client.connect()
    hasRedis = true
    console.log('[cache] Connected to Redis')
  } catch (e) {
    console.warn('[cache] Redis unavailable; falling back to in-memory cache:', e?.message)
    client = null
    hasRedis = false
  }
}

const memory = new Map()

function nowSec() { return Math.floor(Date.now() / 1000) }

function memGet(key) {
  const rec = memory.get(key)
  if (!rec) return null
  if (rec.exp && rec.exp < nowSec()) { memory.delete(key); return null }
  return rec.value
}

function memSet(key, value, ttlSec) {
  const exp = ttlSec ? (nowSec() + ttlSec) : 0
  memory.set(key, { value, exp })
}

export async function get(key) {
  await initRedis()
  if (hasRedis && client) {
    try {
      const raw = await client.get(key)
      return raw ? JSON.parse(raw) : null
    } catch (_) { /* ignore */ }
  }
  return memGet(key)
}

export async function set(key, value, ttlSec = 60) {
  await initRedis()
  if (hasRedis && client) {
    try {
      const payload = JSON.stringify(value)
      if (ttlSec) {
        await client.setEx(key, ttlSec, payload)
      } else {
        await client.set(key, payload)
      }
      return
    } catch (_) { /* ignore */ }
  }
  memSet(key, value, ttlSec)
}

export function keyOf(prefix, obj) {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj)
  const h = crypto.createHash('sha1').update(json).digest('hex').slice(0, 16)
  return `${prefix}:${h}`
}

export async function withCache({ key, ttlSec, task }) {
  const hit = await get(key)
  if (hit != null) return hit
  const val = await task()
  if (val != null) await set(key, val, ttlSec)
  return val
}
