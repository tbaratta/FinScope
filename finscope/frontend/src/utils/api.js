import axios from 'axios'
import { supabase } from './supabase'

// Hardcode production API base to ensure no stale domains are used in the bundle
export const API_BASE = 'https://app.finscope.us/api'
export const api = axios.create({ baseURL: API_BASE })
try { console.debug('[FinScope] API_BASE =', API_BASE) } catch (_) {}

// Simple in-memory GET cache and request coalescing
const responseCache = new Map() // key -> { exp: number, data: any }
const inflight = new Map() // key -> Promise

function cacheKey(config) {
	// Build a stable key even if baseURL is relative (e.g., '/api')
	try {
		if (config.baseURL && /^https?:\/\//i.test(String(config.baseURL))) {
			const u = new URL(config.url, config.baseURL)
			return `${config.method || 'get'}:${u.toString()}?${config.params ? JSON.stringify(config.params) : ''}`
		}
	} catch (_) {}
	const base = (config.baseURL || '').replace(/\/+$/, '')
	const path = String(config.url || '').replace(/^\/+/, '')
	const url = base ? `${base}/${path}` : `/${path}`
	const params = config.params ? JSON.stringify(config.params) : ''
	return `${config.method || 'get'}:${url}?${params}`
}

// Attach Supabase JWT to outgoing requests when available
api.interceptors.request.use(async (config) => {
	// Normalize URL to avoid double '/api' when baseURL already includes it
	try {
		const base = (config.baseURL ?? API_BASE ?? '').replace(/\/+$/, '')
		if (typeof config.url === 'string') {
			let url = config.url
			// If base ends with '/api' and url starts with '/api/', strip one '/api'
			if (/\/api$/i.test(base) && /^\/api\//i.test(url)) {
				url = url.replace(/^\/api\//i, '/')
			}
			// Also collapse any accidental double slashes (but keep 'http://')
			url = url.replace(/([^:])\/+/g, '$1/')
			config.url = url
		}
	} catch (_) {}
	try {
		if (supabase) {
			const { data: { session } } = await supabase.auth.getSession()
			const token = session?.access_token
			if (token) {
				config.headers = config.headers || {}
				config.headers.Authorization = `Bearer ${token}`
			}
		}
	} catch (_) {
		// ignore
	}
	// GET cache hit
	try {
		const method = (config.method || 'get').toLowerCase()
		if (method === 'get') {
			const key = cacheKey(config)
			const rec = responseCache.get(key)
			const ttlMs = (config.cacheTTL != null ? Number(config.cacheTTL) : 30) * 1000
			if (rec && rec.exp > Date.now()) {
				// short-circuit: return a resolved promise with cached response shape
				return Promise.reject({ __fromCache: true, __cacheData: rec.data, config })
			}
			// request coalescing
			if (inflight.has(key)) {
				return inflight.get(key)
			}
			config.metadata = { cacheKey: key, ttlMs }
			const p = Promise.resolve(config).finally(() => inflight.delete(key))
			inflight.set(key, p)
			return p
		}
	} catch (_) {}
	return config
})

// If the request interceptor returned a cache marker, adapt the flow to use it
api.interceptors.response.use(
	(response) => {
		// store in cache if GET
		try {
			const cfg = response.config || {}
			const method = (cfg.method || 'get').toLowerCase()
			if (method === 'get' && cfg.metadata?.cacheKey) {
				responseCache.set(cfg.metadata.cacheKey, { exp: Date.now() + (cfg.metadata.ttlMs || 30000), data: response })
			}
		} catch (_) {}
		return response
	},
	(error) => {
		if (error && error.__fromCache) {
			return Promise.resolve(error.__cacheData)
		}
		return Promise.reject(error)
	}
)
