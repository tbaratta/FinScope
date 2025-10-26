import { useCallback, useEffect, useState, useRef, useLayoutEffect } from 'react'
import Loader from '../components/Loader'
import { api } from '../utils/api'
import DataCards from '../components/DataCards'
import ReportView from '../components/ReportView'
import { useSettings } from '../hooks/useSettings.jsx'
import FavoriteReports from '../components/FavoriteReports.jsx'
 
export default function Dashboard() {
  const { settings } = useSettings()
  const [cards, setCards] = useState([])
  const [agentReport, setAgentReport] = useState(null)
  const [symbolsText, setSymbolsText] = useState(settings.defaultSymbols || 'SPY, QQQ, DIA')
  const [includeFavorites, setIncludeFavorites] = useState(false)
  const [agentLoading, setAgentLoading] = useState(false)
  const [quickMode, setQuickMode] = useState(false)
  const [configHint, setConfigHint] = useState('')
  const [error, setError] = useState('')
  const [showSymbolsNav, setShowSymbolsNav] = useState(true)
  const symbolsNavRef = useRef(null)
  const [heroMinHeight, setHeroMinHeight] = useState(320)
 
  const computeChart = useCallback(async () => {
    try {
      const res = await api.get('/api/data/summary', { cacheTTL: 60 })
      const summary = res.data || {}
      setCards(summary.cards || [])
      setConfigHint('')
    } catch (err) {
      // Surface a gentle hint when backend is missing required keys
      const msg = err?.response?.data?.error || err?.message || ''
      if (String(msg).toLowerCase().includes('missing api keys')) {
        setConfigHint('Some API keys are missing (e.g., FRED, AlphaVantage). The dashboard summary may be limited. Configure .env as in README to enable full data.')
      }
    }
  }, [])
 
  useEffect(() => { computeChart() }, [computeChart])
  useEffect(() => { setSymbolsText(settings.defaultSymbols || 'SPY, QQQ, DIA') }, [settings.defaultSymbols])
 
  // Hide the symbols nav when the user scrolls down; only show it when scrolled to the very top
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const y = window.scrollY || window.pageYOffset
          // only show when scrolled all the way to the top
          setShowSymbolsNav(y <= 5)
          ticking = false
        })
        ticking = true
      }
    }
    // initialize based on current scroll position
    setShowSymbolsNav((window.scrollY || window.pageYOffset) <= 5)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
 
  // Measure header + symbols nav and compute hero min height so the hero sits
  // nicely beneath the sticky navs (slightly above vertical center).
  const measureHero = () => {
    try {
      const header = document.querySelector('header')
      const headerH = header ? header.offsetHeight : 0
      const symH = (showSymbolsNav && symbolsNavRef.current) ? symbolsNavRef.current.offsetHeight : 0
      // Leave some breathing room (approx 6rem) so hero is a bit higher than exact center
      const buffer = 242
      const h = Math.max(220, window.innerHeight - headerH - symH - buffer)
      setHeroMinHeight(h)
    } catch (e) {
      setHeroMinHeight(320)
    }
  }
 
  useLayoutEffect(() => {
    measureHero()
    window.addEventListener('resize', measureHero)
    return () => window.removeEventListener('resize', measureHero)
  }, [showSymbolsNav])
 
  const generateReport = async () => {
    const baseSymbols = symbolsText
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
    const favs = includeFavorites && Array.isArray(settings?.favorites)
      ? settings.favorites.map(s => String(s).toUpperCase()).filter(Boolean)
      : []
    const symbols = Array.from(new Set([...baseSymbols, ...favs])).slice(0, 10)
    setError('')
    setAgentLoading(true)
    try {
      const payload = symbols.length ? { symbols } : { symbols: ['SPY'] }
  const res = await api.post('/api/agents/report', payload, { params: { beginner: settings?.beginnerMode ? 1 : undefined, fast: quickMode ? 1 : undefined } })
  setAgentReport(res?.data || null)
    } catch (err) {
      setError(err?.message || 'Failed to generate report')
    } finally {
      setAgentLoading(false)
    }
  }
 
  const openFullReportForSymbol = async (symOrPayload) => {
    if (symOrPayload && typeof symOrPayload === 'object' && symOrPayload.report) {
      setAgentReport(symOrPayload)
      setTimeout(() => { try { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) } catch (_) {} }, 50)
      return
    }
    try {
      setAgentLoading(true)
      const sym = String(symOrPayload).toUpperCase()
      const payload = { symbols: [sym] }
      const res = await api.post('/api/agents/report', payload, { params: { beginner: settings?.beginnerMode ? 1 : undefined, fast: quickMode ? 1 : undefined } })
      setAgentReport(res?.data || null)
      // Scroll to report view
      setTimeout(() => { try { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) } catch (_) {} }, 50)
    } catch (err) {
      setError(err?.message || 'Failed to generate report')
    } finally {
      setAgentLoading(false)
    }
  }

  const openQuickPayload = (payload) => {
    setAgentReport(payload || null)
    setTimeout(() => { try { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) } catch (_) {} }, 50)
  }

  const runAgents = async () => {
    try {
      setAgentLoading(true)
      const baseSymbols = symbolsText
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
      const favs = includeFavorites && Array.isArray(settings?.favorites)
        ? settings.favorites.map(s => String(s).toUpperCase()).filter(Boolean)
        : []
      const symbols = Array.from(new Set([...baseSymbols, ...favs])).slice(0, 10) // keep it reasonable
      const payload = symbols.length ? { symbols } : { symbols: ['SPY'] }
      const res = await api.post('/api/agents/report', payload, { params: { beginner: settings?.beginnerMode ? 1 : undefined, fast: quickMode ? 1 : undefined } })
    setAgentReport(res?.data || null)
    } catch (err) {
      setAgentReport({ error: 'Agent run failed', detail: err?.message })
    }
    finally {
      setAgentLoading(false)
    }
  }
 
  return (
    <div>
      <div ref={symbolsNavRef} className={`flex justify-center sticky top-16 z-0 transform transition-transform duration-300 ${showSymbolsNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
        <div className="inline-flex flex-col bg-slate-900/95 backdrop-blur supports-backdrop-blur:bg-slate-900/80 border-x border-b border-slate-800 rounded-b-lg">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="flex items-center gap-2 bg-slate-800/60 hover:bg-slate-800/80 border border-slate-700/50 rounded-md px-3 py-1.5 w-80 transition-colors">
              <label className="text-sm font-medium text-slate-400">Tickers:</label>
              <input
                value={symbolsText}
                onChange={(e) => setSymbolsText(e.target.value)}
                placeholder="e.g., SPY, QQQ, DIA"
                className="bg-transparent border-none outline-none w-full text-slate-200 text-sm placeholder:text-slate-600 focus:ring-0"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400 select-none">
              <input
                type="checkbox"
                checked={includeFavorites}
                onChange={(e) => setIncludeFavorites(e.target.checked)}
                className="accent-primary w-3.5 h-3.5"
              />
              Include favorites
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400 select-none">
              <input
                type="checkbox"
                checked={quickMode}
                onChange={(e) => setQuickMode(e.target.checked)}
                className="accent-primary w-3.5 h-3.5"
              />
              Quick mode
            </label>
            {agentLoading ? (
              <Loader />
            ) : (
              <button 
                onClick={generateReport} 
                className="px-4 py-1.5 rounded-md bg-primary hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50 text-sm font-medium whitespace-nowrap shadow-sm shadow-primary/20 transition-all" 
                disabled={agentLoading}
              >
                Generate Today's Report
              </button>
            )}
          </div>
          {configHint && (
            <div className="px-4 pb-2 -mt-1 text-[11px] text-amber-300">
              {configHint}
            </div>
          )}
          {error && <div className="text-xs text-red-400 text-center pb-2">{error}</div>}
        </div>
      </div>
 
      <div className="mt-6 space-y-6">
        <div className="lg:col-span-3">
          <DataCards cards={cards} />
        </div>

        <FavoriteReports onOpenQuickReport={openQuickPayload} onOpenFullReport={openFullReportForSymbol} />
 
        {agentReport ? (
          <ReportView report={agentReport} />
        ) : (
          <div
  style={{ minHeight: `${heroMinHeight}px` }}
  className="flex flex-col items-center justify-center text-center px-4"
>
  <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-sky-400 bg-clip-text text-transparent">
    Your Daily Financial News with FinScope
  </h1>
  <p className="mt-6 text-base md:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
    Stay informed every morning with FinScope, an AI-powered platform that delivers personalized financial insights, market trends, and news in one daily report.
  </p>
</div>

        )}
      </div>
    </div>
  )
}