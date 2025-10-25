import { Router } from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { GoogleGenerativeAI } from '@google/generative-ai'

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

async function fetchSeries(symbol) {
  const { data } = await axios.get(`${PY_URL}/market`, { params: { symbol, period: '1mo', interval: '1d' }, timeout: 15000 })
  if (data?.error) throw new Error(data.error)
  return data
}

async function runTeacher(summaryInput) {
  const apiKey = process.env.ADK_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) return { explanation: 'Gemini API key not configured.' }
  const genAI = new GoogleGenerativeAI(apiKey)
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const model = genAI.getGenerativeModel({ model: modelName })
  const prompt = `You are FinScope Teacher. Explain these analytics in plain English with clear next steps.\n\n${JSON.stringify(summaryInput, null, 2)}`
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
        const s = await fetchSeries(sym)
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

    // Step 3: Macro (FRED) and News
    const [dgs10, cpi, unrate, headlines] = await Promise.all([
      fetchFredSeries('DGS10'),
      fetchFredSeries('CPIAUCSL'),
      fetchFredSeries('UNRATE'),
      fetchNewsHeadlines(),
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
    }
    run.steps.push({ name: 'MacroNews', type: 'context', status: 'ok', output: { macro, headlinesCount: headlines.length } })

    // Compute per-asset overview (last/prev/change)
    const asset_overview = {}
    for (const sym of okSymbols) {
      const vals = seriesMap[sym]?.values || []
      const n = vals.length
      if (n >= 2) {
        const last = Number(vals[n - 1])
        const prev = Number(vals[n - 2])
        const changePct = prev ? ((last - prev) / prev) * 100 : null
        asset_overview[sym] = { last, prev, changePct }
      }
    }

    // Step 4: Teacher (LLM explanation across market, macro, news)
    const teacherOut = await runTeacher({ symbols: okSymbols, asset_overview, macro, analysis, headlines })
    run.steps.push({ name: teacherAgent?.name || 'TeacherAgent', type: 'teach', status: 'ok', output: teacherOut })

    const report = {
      run_id: Date.now().toString(36),
      generated_at: new Date().toISOString(),
      input_symbols: symbols,
      input_weights: weightMap || null,
      market_data_keys: Object.keys(seriesMap),
      market_data_samples: Object.fromEntries(Object.entries(seriesMap).map(([k, v]) => [k, (v.values || []).slice(0, 5)])),
      asset_overview,
      macro,
      headlines,
      analysis,
      explanation: teacherOut?.explanation || '',
    }
    return res.json({ report, steps: run.steps })
  } catch (err) {
    return res.status(500).json({ error: 'Agent pipeline failed', detail: err?.message, steps: run.steps })
  }
})

export default router
