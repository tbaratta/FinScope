import { Router } from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { setLastReport } from '../controllers/cache.js'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = path.resolve(__dirname, '../../../agents')
const PY_URL = process.env.PYTHON_SERVICE_URL || 'http://py-api:8000'
const FRED_API_KEY = process.env.FRED_API_KEY
const NEWS_API_KEY = process.env.NEWS_API_KEY

function loadAgent(fileName) {
  try {
    const p = path.join(AGENTS_DIR, fileName)
    if (!fs.existsSync(p)) return null
    const txt = fs.readFileSync(p, 'utf8')
    return yaml.load(txt)
  } catch (e) {
    return null
  }
}

function extractPositionsFromPayload(body) {
  // Returns { positions: [{symbol, weight}], symbols: [..] }
  if (Array.isArray(body?.positions) && body.positions.length) {
    const pos = body.positions
      .filter(p => p && typeof p.symbol === 'string')
      .map(p => ({ symbol: p.symbol.toUpperCase(), weight: Number(p.weight) }))
      .filter(p => p.symbol && Number.isFinite(p.weight) && p.weight > 0)
    if (pos.length) return { positions: pos, symbols: pos.map(p => p.symbol) }
  }
  if (Array.isArray(body?.symbols) && body.symbols.length) {
    const syms = body.symbols.filter(s => typeof s === 'string').map(s => s.toUpperCase())
    if (syms.length) return { positions: null, symbols: syms }
  }
  if (body?.portfolio && typeof body.portfolio === 'object') {
    const syms = Object.keys(body.portfolio)
    if (syms.length) return { positions: null, symbols: syms.map(s => s.toUpperCase()) }
  }
  return { positions: null, symbols: ['SPY'] }
}

async function fetchSeries(symbol, period = '6mo', interval = '1d') {
  const { data } = await axios.get(`${PY_URL}/market`, { params: { symbol, period, interval }, timeout: 20000 })
  if (data?.error) throw new Error(data.error)
  return data
}

async function runTeacher(summaryInput, teacherConfig) {
  const apiKey = process.env.ADK_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) return { explanation: 'Gemini API key not configured.' }
  const genAI = new GoogleGenerativeAI(apiKey)
  const cfgModel = teacherConfig?.model && typeof teacherConfig.model === 'string' ? teacherConfig.model : null
  const modelName = cfgModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const model = genAI.getGenerativeModel({ model: modelName })
  const teacherInstr = typeof teacherConfig?.instruction === 'string' ? teacherConfig.instruction : ''
  const system = [
    'You are FinScope Mission Control Teacher. Provide concise, actionable, educational insights.',
    'Do NOT provide personalized financial advice. Include disclaimers where appropriate.',
    teacherInstr,
    'Structure your response into clear sections:',
    '- Market Overview',
    '- Macro Watch (explain 10Y, CPI YoY, Unemployment if present)',
    '- Headlines Snapshot (cite sources briefly)',
    '- Technicals Snapshot (volatility, SMA trends, 6m high/low proximity)',
    '- Educational Recommendations (3-5 items) with rationale and risk notes',
    '- Next Steps (3 bullets)'
  ].filter(Boolean).join('\n')
  const prompt = `${system}\n\nContext JSON:\n${JSON.stringify(summaryInput, null, 2)}`
  try {
    const result = await model.generateContent(prompt)
    const reply = result?.response?.text() || ''
    return { explanation: reply }
  } catch (e) {
    return { explanation: `LLM failed: ${e?.message || e}` }
  }
}

// --- Additional data sources ---
async function fetchFredSeries(seriesId) {
  if (!FRED_API_KEY) return null
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json`
  const { data } = await axios.get(url, { timeout: 15000 })
  const obs = (data?.observations || []).filter(o => o.value !== '.')
  if (!obs.length) return null
  const last = Number(obs[obs.length - 1].value)
  return { last, obs }
}

async function fetchNewsHeadlines() {
  try {
    if (NEWS_API_KEY) {
      const url = `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=8&apiKey=${NEWS_API_KEY}`
      const { data } = await axios.get(url, { timeout: 15000 })
      const articles = Array.isArray(data?.articles) ? data.articles : []
      return articles.map(a => ({
        title: a?.title?.trim(),
        source: a?.source?.name || 'news',
        url: a?.url,
        publishedAt: a?.publishedAt,
      })).filter(x => x.title && x.url)
    }
    // Fallback: Reuters Business RSS (no key required)
    const rssUrl = 'https://feeds.reuters.com/reuters/businessNews'
    const { data: rss } = await axios.get(rssUrl, { timeout: 15000 })
    // naive parse for <item><title> and <link>
    const items = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let m
    while ((m = itemRegex.exec(rss)) !== null) {
      const block = m[1]
      const t = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/) || [])[1]
      const l = (block.match(/<link>(.*?)<\/link>/) || [])[1]
      if (t && l) items.push({ title: t.replace(/\s+/g, ' ').trim(), source: 'Reuters', url: l })
    }
    return items.slice(0, 8)
  } catch (_) {
    return []
  }
}

router.post('/report', async (req, res) => {
  const run = { steps: [] }
  try {
    // Load agent YAMLs (for future capability flags; not strictly required to run)
  const dataAgent = loadAgent('data_collector_agent.yaml')
  const analyzerAgent = loadAgent('analyzer_agent.yaml')
  const teacherAgent = loadAgent('teacher_agent.yaml')

  const { positions, symbols } = extractPositionsFromPayload(req.body || {})
  run.input = { symbols, positions }

    // Step 1: Data (via Python service)
  const seriesMap = {}
    const labelsRef = new Set()
    const failures = []
    for (const sym of symbols) {
      try {
        const s = await fetchSeries(sym, '6mo', '1d')
        seriesMap[sym] = s
        for (const d of (s.labels || [])) labelsRef.add(d)
      } catch (e) {
        failures.push({ symbol: sym, error: e?.message || String(e) })
      }
    }
    run.steps.push({ name: dataAgent?.name || 'DataAgent', type: 'data', symbols, status: failures.length ? 'partial' : 'ok', failures })
    const okSymbols = Object.keys(seriesMap)
    if (!okSymbols.length) {
      return res.status(400).json({ error: 'No market data available for requested symbols', failures })
    }
  const labels = Array.from(labelsRef).sort()

    // Step 2: Analyzer (call Python /analyze with a simple equal-weight portfolio)
    // Build portfolio series: weighted if positions provided, else equal-weight across okSymbols
    let weightMap = null
    if (Array.isArray(positions) && positions.length) {
      const totalW = positions.reduce((acc, p) => acc + (Number(p.weight) || 0), 0)
      const norm = totalW > 0 ? totalW : 1
      weightMap = {}
      for (const p of positions) {
        const sym = String(p.symbol).toUpperCase()
        if (okSymbols.includes(sym)) {
          weightMap[sym] = (Number(p.weight) || 0) / norm
        }
      }
    }
    const equalW = 1 / okSymbols.length
    const values = labels.map(d => {
      let sum = 0
      let any = false
      for (const sym of okSymbols) {
        const idx = (seriesMap[sym]?.labels || []).indexOf(d)
        if (idx >= 0) {
          const v = Number(seriesMap[sym].values[idx])
          if (Number.isFinite(v)) {
            const w = weightMap ? (weightMap[sym] || 0) : equalW
            sum += w * v
            any = true
          }
        }
      }
      return any ? sum : null
    })
    // Trim nulls from both ends for cleanliness
    const firstIdx = values.findIndex(v => v != null)
    const lastIdx = values.length - 1 - [...values].reverse().findIndex(v => v != null)
    const cleanLabels = firstIdx >= 0 ? labels.slice(firstIdx, lastIdx + 1) : []
    const cleanValues = firstIdx >= 0 ? values.slice(firstIdx, lastIdx + 1).map(v => (v == null ? undefined : v)) : []
    let analysis = null
    try {
      const r = await axios.post(`${PY_URL}/analyze`, { portfolio: { labels: cleanLabels, values: cleanValues } }, { timeout: 15000 })
      analysis = r.data
    } catch (e) {
      analysis = { error: e?.message || 'analyze failed' }
    }
    run.steps.push({ name: analyzerAgent?.name || 'AnalyzerAgent', type: 'analyze', status: analysis?.error ? 'error' : 'ok', output: analysis })

    // Step 3: Macro (FRED), News, and VIX
    const [dgs10, cpi, unrate, headlines, vix] = await Promise.all([
      fetchFredSeries('DGS10'),
      fetchFredSeries('CPIAUCSL'),
      fetchFredSeries('UNRATE'),
      fetchNewsHeadlines(),
      fetchSeries('^VIX', '6mo', '1d').catch(() => null),
    ])
    let cpiYoY = null
    if (cpi?.obs?.length >= 13) {
      const last = Number(cpi.obs[cpi.obs.length - 1].value)
      const prev = Number(cpi.obs[cpi.obs.length - 13].value)
      cpiYoY = prev > 0 ? ((last - prev) / prev) * 100 : null
    }
    const macro = {
      ten_year_yield_pct: dgs10 ? Number(dgs10.last) : null,
      cpi_yoy_pct: cpiYoY,
      unemployment_rate_pct: unrate ? Number(unrate.last) : null,
      vix_last: vix?.values?.length ? Number(vix.values[vix.values.length - 1]) : null,
    }
    run.steps.push({ name: 'MacroNews', type: 'context', status: 'ok', output: { macro, headlinesCount: headlines.length } })

    // Step 3.2: Personal finances (Plaid transactions summary via Python DB)
    let personal_finance = null
    try {
      const { data: pf } = await axios.get(`${PY_URL}/bank/summary`, { params: { days: 30 }, timeout: 10000 })
      if (!pf?.error) personal_finance = pf
    } catch (_) {}
    run.steps.push({ name: 'BankSummary', type: 'context', status: personal_finance ? 'ok' : 'empty' })

    // Step 3.5: Forecasts (call Python /forecast for each symbol)
    const forecast = {}
    for (const sym of okSymbols) {
      try {
        const r = await axios.get(`${PY_URL}/forecast`, { params: { symbol: sym, horizon: 14 }, timeout: 15000 })
        const f = r.data
        if (!f?.error && Array.isArray(f?.forecast)) {
          forecast[sym] = f
        }
      } catch (_) {
        // ignore individual forecast failures
      }
    }
    run.steps.push({ name: 'ForecasterAgent', type: 'forecast', status: Object.keys(forecast).length ? 'ok' : 'empty', output: Object.keys(forecast) })

    // Compute per-asset overview and technicals
    const asset_overview = {}
    const technicals = {}
    for (const sym of okSymbols) {
      const vals = (seriesMap[sym]?.values || []).map(Number).filter(v => Number.isFinite(v))
      const n = vals.length
      if (n >= 2) {
        const last = Number(vals[n - 1])
        const prev = Number(vals[n - 2])
        const changePct = prev ? ((last - prev) / prev) * 100 : null
        asset_overview[sym] = { last, prev, changePct }
      }
      // Technicals: daily returns, 20D volatility, SMA(5/20), 6m high/low proximity
      if (n >= 20) {
        const rets = []
        for (let i = 1; i < n; i++) {
          const r = vals[i - 1] ? (vals[i] - vals[i - 1]) / vals[i - 1] : 0
          if (Number.isFinite(r)) rets.push(r)
        }
        const last20 = rets.slice(-20)
        const vol20 = last20.length ? Math.sqrt(last20.reduce((a, b) => a + (b * b), 0) / last20.length) * 100 : null
        const sma = (arr, w) => {
          if (arr.length < w) return null
          let s = 0
          for (let i = arr.length - w; i < arr.length; i++) s += arr[i]
          return s / w
        }
        const sma5 = sma(vals, 5)
        const sma20 = sma(vals, 20)
        const hi = Math.max(...vals)
        const lo = Math.min(...vals)
        const last = vals[n - 1]
        const toHighPct = ((hi - last) / hi) * 100
        const toLowPct = ((last - lo) / lo) * 100
        technicals[sym] = {
          vol20_pct: vol20,
          sma5,
          sma20,
          sma_trend: (sma5 != null && sma20 != null) ? (sma5 > sma20 ? 'bullish' : 'bearish') : null,
          dist_to_6m_high_pct: Number.isFinite(toHighPct) ? toHighPct : null,
          dist_to_6m_low_pct: Number.isFinite(toLowPct) ? toLowPct : null,
        }
      }
    }

    // Step 4: InvestAgent-lite (via Python /invest)
    let invest = null
    try {
      const invPositions = (Array.isArray(positions) && positions.length)
        ? positions
        : okSymbols.map(s => ({ symbol: s, weight: 1 / okSymbols.length }))
      const r = await axios.post(`${PY_URL}/invest`, { positions: invPositions, macro }, { timeout: 15000 })
      invest = r.data
    } catch (e) {
      invest = { error: e?.message || 'invest failed' }
    }
    run.steps.push({ name: 'InvestAgent', type: 'invest', status: invest?.error ? 'error' : 'ok', output: invest })

    // Step 5: Teacher (LLM explanation across market, macro, news, technicals, forecasts, invest)
    const teacherOut = await runTeacher({ symbols: okSymbols, asset_overview, macro, headlines, technicals, analysis, forecast, personal_finance }, teacherAgent)
    run.steps.push({ name: teacherAgent?.name || 'TeacherAgent', type: 'teach', status: 'ok', output: teacherOut })

    // Build compact timeseries for charts (last ~120 points)
    const series = {}
    for (const sym of okSymbols) {
      const s = seriesMap[sym] || {}
      const L = Math.max(0, (s.labels || []).length - 120)
      series[sym] = {
        labels: (s.labels || []).slice(L),
        values: (s.values || []).slice(L)
      }
    }

    const report = {
      run_id: Date.now().toString(36),
      generated_at: new Date().toISOString(),
      input_symbols: symbols,
      input_weights: weightMap || null,
      market_data_keys: Object.keys(seriesMap),
      market_data_samples: Object.fromEntries(Object.entries(seriesMap).map(([k, v]) => [k, (v.values || []).slice(0, 5)])),
      series,
      technicals,
      asset_overview,
      macro,
      headlines,
      analysis,
      forecast,
      invest,
      personal_finance,
      explanation: teacherOut?.explanation || '',
    }
    // Cache the latest report for contextual chat
    try { setLastReport(report) } catch {}
    return res.json({ report, steps: run.steps })
  } catch (err) {
    return res.status(500).json({ error: 'Agent pipeline failed', detail: err?.message, steps: run.steps })
  }
})

export default router
