import { Router } from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { setLastReport } from '../controllers/cache.js'
import { withCache, keyOf } from '../lib/kvCache.js'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = path.resolve(__dirname, '../../../agents')
const PY_URL = process.env.PYTHON_SERVICE_URL || 'http://py-api:8000'
const FRED_API_KEY = process.env.FRED_API_KEY
const NEWS_API_KEY = process.env.NEWS_API_KEY

// In-flight request dedupe and simple concurrency control
const inflight = new Map() // key -> Promise

function dedupe(key, task) {
  if (inflight.has(key)) return inflight.get(key)
  const p = (async () => {
    try { return await task() } finally { inflight.delete(key) }
  })()
  inflight.set(key, p)
  return p
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let i = 0
  let active = 0
  return await new Promise((resolve) => {
    const next = () => {
      while (active < limit && i < items.length) {
        const idx = i++
        active++
        Promise.resolve(worker(items[idx], idx))
          .then(r => { results[idx] = r })
          .catch(e => { results[idx] = { __error: e?.message || String(e) } })
          .finally(() => { active--; (i >= items.length && active === 0) ? resolve(results) : next() })
      }
      if (i >= items.length && active === 0) resolve(results)
    }
    next()
  })
}

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

async function runTeacher(summaryInput, teacherConfig, isBeginner = false) {
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
    isBeginner
      ? 'Write in very simple language (5th–6th grade). Avoid jargon. If a term is unavoidable (like CPI, 10Y yield, unemployment), briefly define it in parentheses the first time. Use short sentences and clear bullets. Keep it friendly and reassuring.'
      : null,
    'Structure your response into clear sections:',
    '- Market Overview',
    '- Macro Watch (explain 10Y, CPI YoY, Unemployment if present)',
    '- Headlines Snapshot (cite sources briefly)',
    '- Technicals Snapshot (volatility, SMA trends, 6m high/low proximity)',
    isBeginner
      ? '- What This Means In Simple Words (3–5 short bullets)'
      : '- Educational Recommendations (3-5 items) with rationale and risk notes',
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

// Build a very simple, rule-based beginner explanation as a fallback when no LLM key is present
function buildSimpleExplanation({ symbols, asset_overview, macro, headlines, invest }) {
  try {
    const lines = []
    lines.push('# In simple words')
    // Market overview
    if (Array.isArray(symbols) && symbols.length) {
      lines.push('## Today\'s moves')
      const rows = symbols.map((s) => {
        const o = asset_overview?.[s] || {}
        const chg = Number(o.changePct)
        if (!Number.isFinite(chg)) return `- ${s}: no data`
        const up = chg >= 0
        return `- ${s}: ${up ? 'up' : 'down'} ${Math.abs(chg).toFixed(2)}%`
      })
      lines.push(...rows)
    }
    // Macro
    const hasMacro = macro && (macro.ten_year_yield_pct != null || macro.cpi_yoy_pct != null || macro.unemployment_rate_pct != null)
    if (hasMacro) {
      lines.push('## Big picture (macro)')
      if (macro.ten_year_yield_pct != null) lines.push(`- 10-year yield (what the US pays to borrow): ${Number(macro.ten_year_yield_pct).toFixed(2)}%`)
      if (macro.cpi_yoy_pct != null) lines.push(`- Inflation (CPI YoY): ${Number(macro.cpi_yoy_pct).toFixed(2)}%`)
      if (macro.unemployment_rate_pct != null) lines.push(`- Unemployment: ${Number(macro.unemployment_rate_pct).toFixed(2)}%`)
      lines.push('- Higher yields often mean borrowing is more expensive.\n- Lower inflation is usually good for shoppers and businesses.\n- Unemployment shows how many people can\'t find jobs.')
    }
    // Headlines
    if (Array.isArray(headlines) && headlines.length) {
      lines.push('## Top stories')
      headlines.slice(0, 3).forEach((h) => {
        if (h?.title) lines.push(`- ${h.title}${h.source ? ` — ${h.source}` : ''}`)
      })
    }
    // Actionable but safe
    lines.push('## What to consider (not advice)')
    if (invest && !invest.error) {
      if (typeof invest.signal === 'string') {
        const sig = String(invest.signal)
        if (sig.includes('rebalance')) {
          lines.push('- Markets look bouncy. A small shift to safer assets can smooth the ride.')
        } else if (sig.includes('hold')) {
          lines.push('- No big changes needed today. Keep an eye on the week ahead.')
        }
      }
    }
    lines.push('- If you buy or sell, do it slowly and in small steps.\n- Diversify (don\'t put all your eggs in one basket).')
    // Next steps
    lines.push('## Next steps')
    lines.push('- Check your top 1–2 holdings: are they up or down today?')
    lines.push('- Skim the top story and think: could it affect your plan?')
    lines.push('- Revisit next week — one day rarely changes the big picture.')
    return lines.join('\n')
  } catch {
    return 'Today: markets moved a bit. Keep calm, diversify, and review weekly.'
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

// --- Simple sentiment and symbol mapping from headlines ---
function headlineSentiment(text = '') {
  const t = String(text).toLowerCase()
  const pos = ['beat', 'beats', 'surge', 'surges', 'rally', 'rallies', 'rise', 'rises', 'up', 'record', 'strong', 'optimistic', 'bull', 'expand', 'growth', 'gain', 'gains', 'rebound', 'improve']
  const neg = ['miss', 'misses', 'plunge', 'plunges', 'fall', 'falls', 'down', 'drop', 'drops', 'weak', 'pessimistic', 'bear', 'cut', 'cuts', 'downgrade', 'downgrades', 'fear', 'fears', 'concern', 'concerns', 'risk', 'risks']
  let score = 0
  for (const w of pos) if (t.includes(w)) score += 1
  for (const w of neg) if (t.includes(w)) score -= 1
  return score // integer; >0 positive, <0 negative
}

function symbolSynonyms(sym) {
  const s = String(sym).toUpperCase()
  const map = {
    'SPY': ['s&p', 's&p 500', 'sp500', 's and p'],
    'QQQ': ['nasdaq', 'nasdaq-100', 'nasdaq 100'],
    'DIA': ['dow', 'dow jones', 'djia'],
    '^VIX': ['vix', 'volatility index'],
    'BTC-USD': ['bitcoin', 'btc', 'crypto']
  }
  return [s, ...(map[s] || [])]
}

function buildNewsImpact(symbols, headlines) {
  const impact = {}
  const list = Array.isArray(headlines) ? headlines : []
  const syms = Array.isArray(symbols) ? symbols : []
  for (const sym of syms) {
    const syns = symbolSynonyms(sym)
    const items = []
    for (const h of list) {
      const title = String(h?.title || '')
      if (!title) continue
      const lt = title.toLowerCase()
      const matches = syns.some(k => lt.includes(String(k).toLowerCase()))
      if (!matches) continue
      const sc = headlineSentiment(title)
      items.push({ title, source: h?.source, url: h?.url, score: sc })
    }
    if (items.length) {
      const total = items.reduce((a, b) => a + (Number(b.score) || 0), 0)
      const dir = total > 0.5 ? 'increase' : total < -0.5 ? 'decrease' : 'neutral'
      impact[sym] = {
        direction: dir,
        score: total,
        headlines: items.slice(0, 5)
      }
    }
  }
  return impact
}

router.post('/report', async (req, res) => {
  const run = { steps: [] }
  try {
    const t0 = Date.now()
    // Load agent YAMLs (for future capability flags; not strictly required to run)
  const dataAgent = loadAgent('data_collector_agent.yaml')
  const analyzerAgent = loadAgent('analyzer_agent.yaml')
  const teacherAgent = loadAgent('teacher_agent.yaml')

  const { positions, symbols } = extractPositionsFromPayload(req.body || {})
  const isFast = (String(req.query?.fast || '').toLowerCase() === '1') || (req.body && req.body.fast === true)
  const isBeginner = (String(req.query?.beginner || '').toLowerCase() === '1') || (req.body && req.body.beginner === true)
  run.mode = isFast ? 'fast' : 'full'
  run.input = { symbols, positions, beginner: isBeginner }

    // Step 1: Data (via Python service)
  const seriesMap = {}
    const labelsRef = new Set()
    const failures = []
    const seriesResults = await mapLimit(symbols, 4, async (sym) => {
      try {
        const s = await withCache({ key: `yf:${sym}:6mo:1d`, ttlSec: 120, task: () => fetchSeries(sym, '6mo', '1d') })
        return { sym, s }
      } catch (e) {
        return { sym, error: e?.message || String(e) }
      }
    })
    for (const r of seriesResults) {
      if (!r) continue
      if (r.error || !r.s) {
        failures.push({ symbol: r.sym, error: r.error || 'unknown' })
      } else {
        seriesMap[r.sym] = r.s
        for (const d of (r.s.labels || [])) labelsRef.add(d)
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
      withCache({ key: 'fred:DGS10', ttlSec: 300, task: () => fetchFredSeries('DGS10') }),
      withCache({ key: 'fred:CPIAUCSL', ttlSec: 300, task: () => fetchFredSeries('CPIAUCSL') }),
      withCache({ key: 'fred:UNRATE', ttlSec: 300, task: () => fetchFredSeries('UNRATE') }),
      withCache({ key: 'news:top', ttlSec: 300, task: () => fetchNewsHeadlines() }),
      withCache({ key: 'yf:^VIX:6mo:1d', ttlSec: 120, task: () => fetchSeries('^VIX', '6mo', '1d').catch(() => null) }),
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

      // Step 3.1: News-driven impact (simple sentiment mapping)
      const news_impact = buildNewsImpact(okSymbols, headlines)
      if (Object.keys(news_impact).length) {
        run.steps.push({ name: 'NewsImpact', type: 'analysis', status: 'ok', output: Object.fromEntries(Object.entries(news_impact).map(([k,v]) => [k, v.direction])) })
      } else {
        run.steps.push({ name: 'NewsImpact', type: 'analysis', status: 'empty' })
      }

    // Step 3.2: Personal finances (Plaid transactions summary via Python DB)
    let personal_finance = null
    try {
      const { data: pf } = await axios.get(`${PY_URL}/bank/summary`, { params: { days: 30 }, timeout: 10000 })
      if (!pf?.error) personal_finance = pf
    } catch (_) {}
    run.steps.push({ name: 'BankSummary', type: 'context', status: personal_finance ? 'ok' : 'empty' })

    // Step 3.5: Forecasts (call Python /forecast for each symbol) — parallelized and skippable in fast mode
    const forecast = {}
    if (!isFast) {
      const fResults = await mapLimit(okSymbols, 4, async (sym) => {
        try {
          const r = await withCache({
            key: `py:forecast:${sym}:14`,
            ttlSec: 600,
            task: async () => {
              const r = await axios.get(`${PY_URL}/forecast`, { params: { symbol: sym, horizon: 14 }, timeout: 15000 })
              return r
            }
          })
          const f = r.data
          return (!f?.error && Array.isArray(f?.forecast)) ? { sym, f } : { sym }
        } catch (e) {
          return { sym, error: e?.message || String(e) }
        }
      })
      fResults.forEach(r => { if (r && r.f) forecast[r.sym] = r.f })
      run.steps.push({ name: 'ForecasterAgent', type: 'forecast', status: Object.keys(forecast).length ? 'ok' : 'empty', output: Object.keys(forecast) })
    } else {
      run.steps.push({ name: 'ForecasterAgent', type: 'forecast', status: 'skipped' })
    }

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
    let teacherOut
    let teacherOutSimple
    if (!isFast) {
      // Try to generate either normal or beginner explanation depending on flag
      teacherOut = await runTeacher({ symbols: okSymbols, asset_overview, macro, headlines, technicals, analysis, forecast, personal_finance }, teacherAgent, !!isBeginner)
      // If we generated a beginner-focused explanation, treat it as simple; otherwise build a rule-based one
      teacherOutSimple = isBeginner && teacherOut?.explanation ? teacherOut : { explanation: buildSimpleExplanation({ symbols: okSymbols, asset_overview, macro, headlines, invest }) }
      run.steps.push({ name: teacherAgent?.name || 'TeacherAgent', type: 'teach', status: 'ok', output: { normal: !isBeginner, beginner: !!isBeginner } })
    } else {
      teacherOut = { explanation: 'Quick preview mode — forecasts and detailed explanation skipped. Generate full report for deeper insights.' }
      teacherOutSimple = { explanation: buildSimpleExplanation({ symbols: okSymbols, asset_overview, macro, headlines, invest }) }
      run.steps.push({ name: 'TeacherAgent', type: 'teach', status: 'skipped' })
    }

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
  news_impact,
      analysis,
      forecast,
      invest,
      personal_finance,
      explanation: teacherOut?.explanation || '',
      explanation_simple: teacherOutSimple?.explanation || buildSimpleExplanation({ symbols: okSymbols, asset_overview, macro, headlines, invest }),
    }
    // Cache the latest report for contextual chat
    try { setLastReport(report) } catch {}
    // Also cache full agents report keyed by symbols/weights/mode for a short time (60s) and dedupe in-flight
    const cacheKey = keyOf('agents:report', { symbols, weightMap, mode: run.mode })
    const payload = await dedupe(cacheKey, async () => {
      try { await withCache({ key: cacheKey, ttlSec: 60, task: async () => report }) } catch {}
      return { report, steps: run.steps }
    })
    res.set('X-Report-Duration-ms', String(Date.now() - t0))
    return res.json(payload)
  } catch (err) {
    return res.status(500).json({ error: 'Agent pipeline failed', detail: err?.message, steps: run.steps })
  }
})

export default router
