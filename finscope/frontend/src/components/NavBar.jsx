import { useAuth } from '../hooks/useAuth'

function FinScopeLogo() {
  return (
    <svg width="80" height="80" viewBox="0 0 64 64" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-label="FinScope Logo">
      {/* Outer scope ring */}
      <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="2" />

      {/* Crosshair */}
      <line x1="32" y1="10" x2="32" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="32" y1="46" x2="32" y2="54" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="32" x2="18" y2="32" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="46" y1="32" x2="54" y2="32" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>

      {/* Inner ring */}
      <circle cx="32" cy="32" r="12" stroke="currentColor" strokeWidth="2" strokeOpacity="0.6"/>

      {/* Candlesticks */}
      <line x1="24" y1="40" x2="24" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <rect x="22" y="32" width="4" height="6" rx="1" fill="currentColor"/>

      <line x1="32" y1="42" x2="32" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <rect x="30" y="28" width="4" height="10" rx="1" fill="currentColor"/>

      <line x1="40" y1="38" x2="40" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <rect x="38" y="31" width="4" height="5" rx="1" fill="currentColor"/>

      {/* Trend line */}
      <path d="M22 38 L28 34 L32 29 L36 31 L40 27"
            fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8"/>
    </svg>
  )
}

export default function NavBar({ onOpenSettings }) {
  const { session, signOut } = useAuth()
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sky-400"><FinScopeLogo /></span>
          {/* <h1 className="font-bold text-lg">FinScope: AI Financial Mission Control</h1> */}
        </div>
        <nav className="flex gap-3 items-center">
          {session ? (
            <>
              <button onClick={onOpenSettings} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-2" aria-label="Open settings">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.14,12.94a7.14,7.14,0,0,0,.05-1,7.14,7.14,0,0,0-.05-1l2.11-1.65a.5.5,0,0,0,.12-.64l-2-3.46a.5.5,0,0,0-.6-.22L16.9,5.5a7.14,7.14,0,0,0-1.73-1L14.9,2.39a.5.5,0,0,0-.49-.39H9.59a.5.5,0,0,0-.49.39L8.83,4.5a7.14,7.14,0,0,0-1.73,1L5.23,4.97a.5.5,0,0,0-.6.22l-2,3.46a.5.5,0,0,0,.12.64L4.86,10a7.14,7.14,0,0,0-.05,1,7.14,7.14,0,0,0,.05,1L2.75,13.65a.5.5,0,0,0-.12.64l2,3.46a.5.5,0,0,0,.6.22L7.1,18.5a7.14,7.14,0,0,0,1.73,1l.27,2.11a.5.5,0,0,0,.49.39h4.82a.5.5,0,0,0,.49-.39l.27-2.11a7.14,7.14,0,0,0,1.73-1l2.27,1.37a.5.5,0,0,0,.6-.22l2-3.46a.5.5,0,0,0-.12-.64ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/></svg>
                <span className="text-sm">Settings</span>
              </button>
              <span className="text-slate-400 text-sm">{session.user?.email}</span>
              <button onClick={signOut} className="px-3 py-1 rounded bg-red-600 hover:bg-red-500">Sign out</button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  )
}


