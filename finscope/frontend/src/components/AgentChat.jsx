import { useState } from 'react'
import { api } from '../utils/api'

export default function AgentChat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])

  const send = async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    const userMsg = { role: 'user', content: input }
    setMessages((m) => [...m, userMsg])
    setInput('')
    try {
      const res = await api.post('/api/analyze/chat', { message: input })
      setMessages((m) => [...m, { role: 'assistant', content: res.data.reply || 'No reply' }])
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Error contacting agent.' }])
    }
  }

  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4 h-full flex flex-col">
      <div className="font-semibold mb-2">Agent Chat</div>
      <div className="flex-1 overflow-auto space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`${m.role === 'user' ? 'text-primary' : 'text-slate-300'}`}>{m.role}: {m.content}</div>
        ))}
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input className="flex-1 rounded bg-slate-800 border border-slate-700 px-3 py-2" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask FinScope..." />
        <button className="px-3 py-2 rounded bg-accent hover:brightness-110">Send</button>
      </form>
    </div>
  )
}
