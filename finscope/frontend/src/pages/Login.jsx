import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signIn } = useAuth()
  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <h2 className="text-2xl font-semibold mb-4">Welcome to FinScope</h2>
      <p className="text-slate-400 mb-6">Sign in to view your dashboard and AI insights.</p>
      <button onClick={signIn} className="px-4 py-2 rounded bg-primary hover:brightness-110">Sign in with Supabase</button>
    </div>
  )
}
