import { useEffect, useState } from 'react'
import PlaidConnect from './PlaidConnect'
import { useSettings } from '../hooks/useSettings.jsx'

export default function SettingsModal({ open, onClose }) {
  const { settings, updateSettings } = useSettings()
  const [defaultSymbols, setDefaultSymbols] = useState(settings.defaultSymbols || 'SPY, QQQ, DIA')
  const [chartDays, setChartDays] = useState(String(settings.chartDays || 7))
  const [currency, setCurrency] = useState(settings.currency || 'USD')
  const [timezone, setTimezone] = useState(settings.timezone || 'America/New_York')
  const [beginnerMode, setBeginnerMode] = useState(!!settings.beginnerMode)

  useEffect(() => {
    if (open) {
      setDefaultSymbols(settings.defaultSymbols || 'SPY, QQQ, DIA')
      setChartDays(String(settings.chartDays || 7))
      setCurrency(settings.currency || 'USD')
      setTimezone(settings.timezone || 'America/New_York')
      setBeginnerMode(!!settings.beginnerMode)
    }
  }, [open])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="text-lg font-semibold">Settings</div>
            <button onClick={onClose} className="p-2 rounded hover:bg-slate-800" aria-label="Close settings">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M18.3 5.71L12 12.01l-6.29-6.3-1.41 1.42 6.29 6.29-6.3 6.29 1.42 1.41 6.29-6.29 6.29 6.3 1.41-1.42-6.29-6.29 6.3-6.29z"/></svg>
            </button>
          </div>
          <div className="max-h-[70vh] overflow-auto p-4 space-y-6">
            <section>
              <h3 className="text-base font-semibold mb-2">General</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-slate-300">Default symbols</span>
                  <input value={defaultSymbols} onChange={(e)=>setDefaultSymbols(e.target.value)} className="rounded bg-slate-800 border border-slate-700 px-3 py-2" placeholder="SPY, QQQ, DIA" />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-slate-300">Chart window</span>
                  <select value={chartDays} onChange={(e)=>setChartDays(e.target.value)} className="rounded bg-slate-800 border border-slate-700 px-3 py-2">
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-slate-300">Currency</span>
                  <select value={currency} onChange={(e)=>setCurrency(e.target.value)} className="rounded bg-slate-800 border border-slate-700 px-3 py-2">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-slate-300">Timezone</span>
                  <select value={timezone} onChange={(e)=>setTimezone(e.target.value)} className="rounded bg-slate-800 border border-slate-700 px-3 py-2">
                    <option value="America/New_York">America/New_York</option>
                    <option value="UTC">UTC</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 md:col-span-2">
                  <input type="checkbox" checked={beginnerMode} onChange={(e)=>setBeginnerMode(e.target.checked)} className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="text-sm text-slate-300">Beginner mode</span>
                    <span className="text-xs text-slate-400">Simplify the report and explain concepts in plain language.</span>
                  </div>
                </label>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => { updateSettings({ defaultSymbols, chartDays: Number(chartDays), currency, timezone, beginnerMode }); onClose?.() }}
                  className="px-3 py-2 rounded bg-primary"
                >Save</button>
              </div>
            </section>
            <section>
              <h3 className="text-base font-semibold mb-2">Banking connections</h3>
              <p className="text-sm text-slate-400 mb-3">Connect or manage your bank accounts used for personal finance insights.</p>
              <div className="rounded border border-slate-800 bg-slate-900 p-3">
                <PlaidConnect />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
