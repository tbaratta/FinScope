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

function extractSymbolsFromPayload(body) {
  if (Array.isArray(body?.symbols)) return body.symbols.filter(s => typeof s === 'string')
  if (Array.isArray(body?.positions)) return body.positions.map(p => p?.symbol).filter(Boolean)
  if (body?.portfolio && typeof body.portfolio === 'object') return Object.keys(body.portfolio)
  return ['AMD']
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

router.post('/report', async (req, res) => {
  const run = { steps: [] }
  try {
    // Load agent YAMLs (for future capability flags; not strictly required to run)
    const dataAgent = loadAgent('data_collector_agent.yaml')
    const analyzerAgent = loadAgent('analyzer_agent.yaml')
    const teacherAgent = loadAgent('teacher_agent.yaml')

    const symbols = extractSymbolsFromPayload(req.body || {})
    run.input = { symbols }

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
    const values = labels.map(d => {
      let total = 0, cnt = 0
      for (const sym of okSymbols) {
        const idx = (seriesMap[sym]?.labels || []).indexOf(d)
        if (idx >= 0) {
          const v = Number(seriesMap[sym].values[idx])
          if (Number.isFinite(v)) { total += v; cnt++ }
        }
      }
      return cnt ? total / cnt : null
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

    // Step 3: Teacher (LLM explanation)
    const teacherOut = await runTeacher({ symbols, analysis })
    run.steps.push({ name: teacherAgent?.name || 'TeacherAgent', type: 'teach', status: 'ok', output: teacherOut })

    const report = {
      run_id: Date.now().toString(36),
      generated_at: new Date().toISOString(),
      input_symbols: symbols,
      market_data_keys: Object.keys(seriesMap),
      market_data_samples: Object.fromEntries(Object.entries(seriesMap).map(([k, v]) => [k, (v.values || []).slice(0, 5)])),
      analysis,
      explanation: teacherOut?.explanation || '',
    }
    return res.json({ report, steps: run.steps })
  } catch (err) {
    return res.status(500).json({ error: 'Agent pipeline failed', detail: err?.message, steps: run.steps })
  }
})

export default router
