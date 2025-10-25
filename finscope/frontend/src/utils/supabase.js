import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

const SUPABASE_AVAILABLE = Boolean(url && key)
const supabase = SUPABASE_AVAILABLE ? createClient(url, key) : null

export { supabase, SUPABASE_AVAILABLE }
