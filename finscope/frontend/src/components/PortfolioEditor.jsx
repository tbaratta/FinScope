import { useEffect, useMemo, useState } from 'react'
import { api } from '../utils/api'
import { useAuth } from '../hooks/useAuth'

export default function PortfolioEditor({ onSaved }) {
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const { session } = useAuth()

  const isAuthed = useMemo(() => Boolean(session?.access_token || session), [session])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setMessage('')
      try {
        if (!isAuthed) {
          setPositions([])
          return
        }
        const res = await api.get('/api/data/portfolio')
        setPositions(Array.isArray(res.data?.positions) ? res.data.positions : [])
      } catch (err) {
        const status = err?.response?.status
        if (status === 401) {
          setMessage('Sign in to view and edit your portfolio.')
        } else {
          setMessage(err?.response?.data?.error || 'Unable to load portfolio')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isAuthed])

  const addRow = () => setPositions([...positions, { symbol: '', weight: 0 }])
  const removeRow = (i) => setPositions(positions.filter((_, idx) => idx !== i))
  const updateRow = (i, field, val) => {
    const next = positions.slice()
    next[i] = { ...next[i], [field]: field === 'weight' ? Number(val) : val }
    setPositions(next)
  }

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const clean = positions.map(p => ({ symbol: (p.symbol || '').toUpperCase().trim(), weight: Number(p.weight) }))
      const res = await api.put('/api/data/portfolio', { positions: clean })
      setPositions(res.data.positions || [])
      setMessage('Saved!')
      if (typeof onSaved === 'function') onSaved(res.data.positions || [])
    } catch (err) {
      const detail = err?.response?.data?.error || err?.message
      setMessage(detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Portfolio</div>
        <div className="flex gap-2">
          <button onClick={addRow} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">Add</button>
          <button onClick={save} disabled={saving} className="px-3 py-1 rounded bg-primary disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {!isAuthed ? (
        <div className="text-slate-400 text-sm">Sign in to manage your portfolio.</div>
      ) : loading ? (
        <div className="text-slate-400 text-sm">Loading portfolio…</div>
      ) : (
        <div className="space-y-2">
          {positions.map((p, i) => (
            <div key={i} className="grid grid-cols-6 gap-2 items-center">
              <input
                value={p.symbol}
                onChange={e => updateRow(i, 'symbol', e.target.value)}
                placeholder="Symbol"
                className="col-span-3 px-3 py-2 rounded bg-slate-800 border border-slate-700"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={p.weight}
                onChange={e => updateRow(i, 'weight', e.target.value)}
                placeholder="Weight (0..1)"
                className="col-span-2 px-3 py-2 rounded bg-slate-800 border border-slate-700"
              />
              <button onClick={() => removeRow(i)} className="px-3 py-2 rounded bg-red-700 hover:bg-red-600">Remove</button>
            </div>
          ))}
          {positions.length === 0 && (
            <div className="text-slate-500 text-sm">No positions yet. Add a few tickers with weights summing to ~1.0.</div>
          )}
          <div className="flex justify-end text-xs text-slate-400">
            Total weight:&nbsp;
            <span className={(positions.reduce((acc, p) => acc + Number(p.weight || 0), 0) > 0.95 && positions.reduce((acc, p) => acc + Number(p.weight || 0), 0) < 1.05) ? 'text-green-400' : 'text-yellow-400'}>
              {positions.reduce((acc, p) => acc + Number(p.weight || 0), 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}
      {message && <div className="mt-2 text-sm text-slate-300">{message}</div>}
    </div>
  )
}
