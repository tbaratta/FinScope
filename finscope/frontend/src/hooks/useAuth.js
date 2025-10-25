import { create } from 'zustand'
import { supabase, SUPABASE_AVAILABLE } from '../utils/supabase'

export const useAuth = create((set, get) => ({
  session: null,
  init: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      set({ session })
      supabase.auth.onAuthStateChange((_evt, s) => set({ session: s }))
    } catch (e) {
      console.warn('Auth init failed:', e?.message || e)
      set({ session: null })
    }
  },
  signIn: async () => {
    if (!SUPABASE_AVAILABLE) {
      console.warn('Supabase not configured; sign-in disabled.')
      return
    }
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'github' })
    if (error) console.error(error)
  },
  signOut: async () => {
    await supabase.auth.signOut()
  }
}))
