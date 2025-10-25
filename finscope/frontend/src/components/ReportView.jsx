import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

function Card({ title, value, badge }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-3">
      <div className="text-slate-400 text-xs">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
      {badge && <div className="text-xs text-slate-500">{badge}</div>}
    </div>
  )
}

export default function ReportView({ report }) {
  const rep = report?.report || report
  if (!rep) return null

  const symbols = rep.input_symbols || []
  const series = rep.series || {}
  const macro = rep.macro || {}
  const pf = rep.personal_finance || null
  const analysis = rep.analysis || null
  const invest = rep.invest || null

  const mainSym = symbols[0]
  const chartData = useMemo(() => {
    if (!mainSym || !series[mainSym]) return null
    const s = series[mainSym]
    return {
      labels: s.labels,
      datasets: [
        { label: mainSym, data: s.values, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.25)', pointRadius: 0, tension: 0.25 }
      ]
    }
  }, [mainSym, series])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xl font-semibold">FinScope Report</div>
        <div className="text-slate-400 text-sm">{new Date(rep.generated_at).toLocaleString()}</div>
        {symbols.map(s => (
          <span key={s} className="px-2 py-1 rounded bg-primary/20 border border-primary/30 text-primary text-xs">{s}</span>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Number.isFinite(Number(macro.ten_year_yield_pct)) && <Card title="10Y Yield" value={`${Number(macro.ten_year_yield_pct).toFixed(2)}%`} />}
        {Number.isFinite(Number(macro.cpi_yoy_pct)) && <Card title="CPI YoY" value={`${Number(macro.cpi_yoy_pct).toFixed(2)}%`} />}
        {Number.isFinite(Number(macro.unemployment_rate_pct)) && <Card title="Unemployment" value={`${Number(macro.unemployment_rate_pct).toFixed(2)}%`} />}
        {Number.isFinite(Number(macro.vix_last)) && <Card title="VIX" value={Number(macro.vix_last).toFixed(2)} />}
      </div>

      {chartData && (
        <div className="rounded border border-slate-800 bg-slate-900 p-3">
          <div className="font-semibold mb-2">{mainSym} — last 6 months</div>
          <Line data={chartData} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { ticks: { callback: v => `$${v}` } } } }} />
        </div>
      )}

      {rep.explanation && (
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <div className="font-semibold mb-2">Summary & Recommendations</div>
          <div className="whitespace-pre-wrap text-slate-200 text-sm">{rep.explanation}</div>
        </div>
      )}

      {analysis && !analysis.error && (
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <div className="font-semibold mb-2">Analysis</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Number.isFinite(Number(analysis.z_score_last)) && <Card title="Z-Score (last)" value={Number(analysis.z_score_last).toFixed(2)} />}
            {Array.isArray(analysis.anomaly_flags) && <Card title="Recent Anomalies (last 5)" value={analysis.anomaly_flags.slice(-5).filter(Boolean).length} />}
          </div>
          {Array.isArray(analysis.insights) && analysis.insights.length > 0 && (
            <ul className="list-disc list-inside text-slate-200 text-sm mt-2">
              {analysis.insights.map((it, idx) => <li key={idx}>{it}</li>)}
            </ul>
          )}
        </div>
      )}

      {rep.technicals && Object.keys(rep.technicals).length > 0 && (
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <div className="font-semibold mb-2">Technicals Snapshot (6m)</div>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="py-1 pr-3">Symbol</th>
                  <th className="py-1 pr-3">Last</th>
                  <th className="py-1 pr-3">Change %</th>
                  <th className="py-1 pr-3">Vol20 %</th>
                  <th className="py-1 pr-3">Trend</th>
                  <th className="py-1 pr-3">6m Dist (↓High | ↑Low)</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(rep.technicals).map(sym => {
                  const t = rep.technicals[sym]
                  const o = rep.asset_overview?.[sym] || {}
                  return (
                    <tr key={sym} className="border-t border-slate-800">
                      <td className="py-1 pr-3">{sym}</td>
                      <td className="py-1 pr-3">{o.last != null ? Number(o.last).toFixed(2) : '—'}</td>
                      <td className={`py-1 pr-3 ${Number(o.changePct) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{Number.isFinite(Number(o.changePct)) ? `${Number(o.changePct).toFixed(2)}%` : '—'}</td>
                      <td className="py-1 pr-3">{Number.isFinite(Number(t.vol20_pct)) ? `${Number(t.vol20_pct).toFixed(2)}%` : '—'}</td>
                      <td className={`py-1 pr-3 ${t.sma_trend === 'bullish' ? 'text-emerald-400' : t.sma_trend === 'bearish' ? 'text-rose-400' : ''}`}>{t.sma_trend || '—'}</td>
                      <td className="py-1 pr-3">{Number.isFinite(Number(t.dist_to_6m_high_pct)) && Number.isFinite(Number(t.dist_to_6m_low_pct)) ? `${Number(t.dist_to_6m_high_pct).toFixed(2)}% | ${Number(t.dist_to_6m_low_pct).toFixed(2)}%` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rep.forecast && Object.keys(rep.forecast).length > 0 && (
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <div className="font-semibold mb-2">Forecast (next 14 days)</div>
          <ul className="list-disc list-inside text-slate-200 text-sm">
            {Object.keys(rep.forecast).map(sym => {
              const f = rep.forecast[sym]
              const path = Array.isArray(f?.forecast) ? f.forecast.map(Number).filter(v => Number.isFinite(v)) : []
              const last = Number(rep.asset_overview?.[sym]?.last)
              if (!(path.length && Number.isFinite(last) && last > 0)) return null
              const end = path[path.length - 1]
              const chg = ((end - last) / last) * 100
              const s = `${sym}: ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% vs last (linear trend)`
              return <li key={sym}>{s}</li>
            })}
          </ul>
        </div>
      )}

      {invest && !invest.error && (
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <div className="font-semibold mb-2">Portfolio Signal</div>
          <div className="text-sm text-slate-200"><span className="text-slate-400">Signal:</span> {invest.signal}</div>
          <div className="text-sm text-slate-200"><span className="text-slate-400">Confidence:</span> {Number(invest.confidence).toFixed(2)}</div>
          <div className="text-sm text-slate-200"><span className="text-slate-400">Rationale:</span> {invest.rationale}</div>
        </div>
      )}

      {pf && !pf.error && (
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <div className="font-semibold mb-2">Personal Finance Snapshot (last {pf.window_days}d)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
            {Number.isFinite(Number(pf.total_spend)) && <Card title="Total Spend" value={`$${Number(pf.total_spend).toFixed(2)}`} />}
          </div>
          {Array.isArray(pf.top_categories) && pf.top_categories.length > 0 && (
            <div className="mb-3">
              <div className="text-slate-300 font-semibold mb-1">Top Categories</div>
              <ul className="text-sm text-slate-200 list-disc list-inside">
                {pf.top_categories.map((c, i) => <li key={i}>{c.category}: ${Number(c.total).toFixed(2)} ({c.count})</li>)}
              </ul>
            </div>
          )}
          {Array.isArray(pf.top_merchants) && pf.top_merchants.length > 0 && (
            <div>
              <div className="text-slate-300 font-semibold mb-1">Top Merchants</div>
              <ul className="text-sm text-slate-200 list-disc list-inside">
                {pf.top_merchants.map((m, i) => <li key={i}>{m.merchant}: ${Number(m.total).toFixed(2)} ({m.count})</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {Array.isArray(rep.headlines) && rep.headlines.length > 0 && (
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <div className="font-semibold mb-2">Top Headlines</div>
          <ul className="list-disc list-inside text-slate-200 text-sm">
            {rep.headlines.slice(0, 8).map((h, idx) => (
              <li key={idx}>{h.title}{h.source ? <span className="text-slate-500"> — {h.source}</span> : null}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
