import axios from 'axios'
import { supabase } from './supabase'

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
export const api = axios.create({ baseURL: API_BASE })

// Simple in-memory GET cache and request coalescing
const responseCache = new Map() // key -> { exp: number, data: any }
const inflight = new Map() // key -> Promise

function cacheKey(config) {
	const url = config.baseURL ? new URL(config.url, config.baseURL).toString() : config.url
	const params = config.params ? JSON.stringify(config.params) : ''
	return `${config.method || 'get'}:${url}?${params}`
}

// Attach Supabase JWT to outgoing requests when available
api.interceptors.request.use(async (config) => {
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
