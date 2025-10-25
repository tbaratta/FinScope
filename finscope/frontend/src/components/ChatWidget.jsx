import { useState } from 'react'
import AgentChat from './AgentChat'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)

  return (
  <div className="fixed bottom-4 right-4 z-40">
      {/* Chat Panel */}
      <div className={`${open ? '' : 'hidden'} w-96 h-[28rem] mb-3 rounded-xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col overflow-hidden`}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/70 backdrop-blur-sm">
          <div className="text-sm font-semibold">FinScope Chat</div>
          <div className="flex items-center gap-1">
            <button
              aria-label="Minimize chat"
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-slate-800 text-slate-300"
              title="Minimize"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M6 18h12v-2H6v2z"/></svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden p-2">
          <div className="h-full">
            <AgentChat />
          </div>
        </div>
      </div>

      {/* Bubble Button */}
      <button
        aria-label="Open chat"
        onClick={() => setOpen(true)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary ${open ? 'bg-slate-700 text-slate-200' : 'bg-primary text-white'}`}
        title={open ? 'Chat open' : 'Open chat'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
          <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2zM6 9h12v2H6V9zm0-3h12v2H6V6zm0 6h8v2H6v-2z"/>
        </svg>
      </button>
    </div>
  )
}
