import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signIn, signInWithProvider } = useAuth()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  const oauthProvider = import.meta.env.VITE_AUTH_PROVIDER && import.meta.env.VITE_AUTH_PROVIDER !== 'email' 
    ? import.meta.env.VITE_AUTH_PROVIDER 
    : null

  const handleEmailSignIn = async () => {
    setMessage('')
    setSending(true)
    const { error } = await signIn(email)
    setSending(false)
    if (error) {
      setMessage(error.message || 'Failed to send magic link')
    } else {
      setMessage('Check your email for a sign-in link.')
    }
  }

  const handleOAuth = async () => {
    if (!oauthProvider) return
    setMessage('')
    setSending(true)
    const { error } = await signInWithProvider(oauthProvider)
    setSending(false)
    if (error) setMessage(error.message || 'OAuth sign-in failed')
  }
  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <h2 className="text-2xl font-semibold mb-4">Welcome to FinScope</h2>
      <p className="text-slate-400 mb-6">Sign in to view your dashboard and AI insights.</p>

      <div className="flex flex-col items-stretch gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2 rounded border border-slate-700 bg-slate-900 focus:outline-none"
        />
        <button
          onClick={handleEmailSignIn}
          disabled={sending || !email}
          className="px-4 py-2 rounded bg-primary hover:brightness-110 disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send magic link'}
        </button>

        {oauthProvider && (
          <>
            <div className="text-slate-500 my-2">or</div>
            <button
              onClick={handleOAuth}
              className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600"
            >
              Sign in with {oauthProvider.charAt(0).toUpperCase() + oauthProvider.slice(1)}
            </button>
          </>
        )}
      </div>

      {message && <div className="mt-4 text-sm text-slate-300">{message}</div>}
    </div>
  )
}
