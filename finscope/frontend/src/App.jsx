import { useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import NavBar from './components/NavBar'
import { SUPABASE_AVAILABLE } from './utils/supabase'

export default function App() {
  const { session, init } = useAuth()

  useEffect(() => { init() }, [])

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-7xl mx-auto p-4">
        {!SUPABASE_AVAILABLE ? (
          <div className="mx-auto max-w-xl mt-20 text-center rounded border border-red-700 bg-red-900/30 text-red-200 p-6">
            <div className="text-xl font-semibold mb-2">Configuration required</div>
            <p className="mb-2">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY in finscope/.env, then restart the dev server.</p>
            <p>Agent chat also requires ADK_API_KEY and GEMINI_MODEL, and live data requires FRED and AlphaVantage keys.</p>
          </div>
        ) : (
          (session ? <Dashboard /> : <Login />)
        )}
      </main>
    </div>
  )
}
