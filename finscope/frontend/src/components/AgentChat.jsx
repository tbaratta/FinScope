import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../utils/api'

export default function AgentChat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const listRef = useRef(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = listRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

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
      <div ref={listRef} className="flex-1 overflow-auto space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`${m.role === 'user' ? 'text-primary' : 'text-slate-300'}`}>
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">{m.role}</div>
            {m.role === 'assistant' ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                p: ({ children }) => <p className="text-sm leading-6 mb-2">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside text-sm space-y-1 mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside text-sm space-y-1 mb-2">{children}</ol>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{children}</a>,
                hr: () => <hr className="border-slate-800 my-3" />,
              }}>
                {m.content}
              </ReactMarkdown>
            ) : (
              <div className="text-sm">{m.content}</div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input className="flex-1 rounded bg-slate-800 border border-slate-700 px-3 py-2" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask FinScope..." />
        <button className="px-3 py-2 rounded bg-accent hover:brightness-110">Send</button>
      </form>
    </div>
  )
}
