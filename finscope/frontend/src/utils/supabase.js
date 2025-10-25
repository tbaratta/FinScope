import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

let supabase
let SUPABASE_AVAILABLE = true

try {
	if (!url || !key) throw new Error('Supabase env not set')
	supabase = createClient(url, key)
} catch (_e) {
	SUPABASE_AVAILABLE = false
	// Minimal no-op stub so the app can function without Supabase configured
	supabase = {
		auth: {
			async getSession() { return { data: { session: null }, error: null } },
			onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } } },
			async signInWithOAuth() { console.warn('Supabase not configured (VITE_SUPABASE_* missing)'); return { error: null } },
			async signOut() { return { error: null } },
		}
	}
}

export { supabase, SUPABASE_AVAILABLE }
