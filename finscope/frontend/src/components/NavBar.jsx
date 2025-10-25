import { useAuth } from '../hooks/useAuth'

export default function NavBar() {
  const { session, signOut } = useAuth()
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto p-4 flex items-center justify-between">
        <h1 className="font-bold text-lg">FinScope: AI Financial Mission Control</h1>
        <nav className="flex gap-3 items-center">
          {session ? (
            <>
              <span className="text-slate-400 text-sm">{session.user?.email}</span>
              <button onClick={signOut} className="px-3 py-1 rounded bg-red-600 hover:bg-red-500">Sign out</button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  )
}
