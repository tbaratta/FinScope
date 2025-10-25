import { create } from 'zustand'
import { supabase, SUPABASE_AVAILABLE } from '../utils/supabase'

const AUTH_PROVIDER = import.meta.env.VITE_AUTH_PROVIDER || 'email'

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
  // sign in using configured provider. If using email, pass an email string.
  signIn: async (email) => {
    if (!SUPABASE_AVAILABLE) {
      console.warn('Supabase not configured; sign-in disabled.')
      return { error: new Error('Supabase not configured') }
    }
    if (AUTH_PROVIDER === 'email') {
      if (!email) {
        const err = new Error('Email is required for passwordless sign-in')
        console.warn(err.message)
        return { error: err }
      }
      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin }
      })
      if (error) console.error(error)
      return { data, error }
    }
    // OAuth providers (e.g., 'github', 'google')
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: AUTH_PROVIDER })
    if (error) {
      // Give a clearer hint when provider isn't enabled in the Supabase dashboard
      if (String(error?.message || '').toLowerCase().includes('provider is not enabled')) {
        console.error('Supabase OAuth provider not enabled. Switch VITE_AUTH_PROVIDER to "email" or enable the provider in Supabase Auth settings.')
      } else {
        console.error(error)
      }
    }
    return { data, error }
  },
  // Optional explicit provider override
  signInWithProvider: async (provider) => {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider })
    if (error) console.error(error)
    return { data, error }
  },
  signOut: async () => {
    await supabase.auth.signOut()
  }
}))
