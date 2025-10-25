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
        {!SUPABASE_AVAILABLE && (
          <div className="mb-4 rounded border border-amber-600 bg-amber-900/30 text-amber-200 p-3">
            Auth disabled: VITE_SUPABASE_URL/KEY not set. Demo mode is active.
          </div>
        )}
        {session ? <Dashboard /> : <Login />}
      </main>
    </div>
  )
}
