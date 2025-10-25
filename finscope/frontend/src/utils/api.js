import axios from 'axios'
import { supabase } from './supabase'

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
export const api = axios.create({ baseURL: API_BASE })

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
	return config
})
