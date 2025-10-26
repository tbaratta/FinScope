import { useCallback, useEffect, useState, useRef, useLayoutEffect } from 'react'
import Loader from '../components/Loader'
import { api } from '../utils/api'
import DataCards from '../components/DataCards'
import ReportView from '../components/ReportView'
import { useSettings } from '../hooks/useSettings.jsx'
 
export default function Dashboard() {
  const { settings } = useSettings()
  const [cards, setCards] = useState([])
  const [agentReport, setAgentReport] = useState(null)
  const [symbolsText, setSymbolsText] = useState(settings.defaultSymbols || 'SPY, QQQ, DIA')
  const [agentLoading, setAgentLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSymbolsNav, setShowSymbolsNav] = useState(true)
  const symbolsNavRef = useRef(null)
  const [heroMinHeight, setHeroMinHeight] = useState(320)
 
  const computeChart = useCallback(async () => {
    try {
      const res = await api.get('/api/data/summary', { cacheTTL: 60 })
      const summary = res.data || {}
      setCards(summary.cards || [])
    } catch (_) { }
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
    const symbols = symbolsText
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 10)
    setError('')
    setAgentLoading(true)
    try {
      const payload = symbols.length ? { symbols } : { symbols: ['SPY'] }
      const { data } = await api.post('/api/agents/report', payload)
      setAgentReport(data || null)
    } catch (err) {
      setError(err?.message || 'Failed to generate report')
    } finally {
      setAgentLoading(false)
    }
  }
 
  const runAgents = async () => {
    try {
      setAgentLoading(true)
      const symbols = symbolsText
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 10) // keep it reasonable
      const payload = symbols.length ? { symbols } : { symbols: ['SPY'] }
      const { data } = await api.post('/api/agents/report', payload)
      setAgentReport(data || null)
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
          {error && <div className="text-xs text-red-400 text-center pb-2">{error}</div>}
        </div>
      </div>
 
      <div className="mt-6 space-y-6">
        <div className="lg:col-span-3">
          <DataCards cards={cards} />
        </div>
 
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