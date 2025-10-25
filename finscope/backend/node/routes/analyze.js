import { Router } from 'express'
import axios from 'axios'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getLastReport } from '../controllers/cache.js'

const router = Router()
// Use docker service name by default when running in compose
const PY_URL = process.env.PYTHON_SERVICE_URL || 'http://py-api:8000'

router.post('/', async (req, res) => {
  try {
    const r = await axios.post(`${PY_URL}/analyze`, req.body, { timeout: 15_000 })
    res.json(r.data)
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed', detail: err.message })
  }
})

router.post('/chat', async (req, res) => {
  try {
    const apiKey = process.env.ADK_API_KEY || process.env.GOOGLE_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured (set ADK_API_KEY)' })
    }
    const genAI = new GoogleGenerativeAI(apiKey)
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    const model = genAI.getGenerativeModel({ model: modelName })

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : []
    const single = typeof req.body?.message === 'string' ? req.body.message : ''
    const userText = (messages.slice(-1)[0]?.content || single || '').toString()

    // Gather lightweight context: latest cached report and current bank summary
    let pf = null
    try {
      const r = await axios.get(`${PY_URL}/bank/summary`, { params: { days: 30 }, timeout: 8000 })
      pf = r.data
    } catch { /* ignore */ }
    const { report: cachedReport, updated_at } = getLastReport()
    // Build compact context to keep prompt size reasonable
    const context = {
      cached_report_meta: cachedReport ? {
        generated_at: cachedReport.generated_at,
        symbols: cachedReport.input_symbols,
      } : null,
      macro: cachedReport?.macro || null,
      technicals: cachedReport?.technicals || null,
      analysis: cachedReport?.analysis || null,
      invest: cachedReport?.invest || null,
      personal_finance: pf || cachedReport?.personal_finance || null,
    }
    const systemPreamble = [
      'You are FinScope Mission Control. Answer user questions using the provided context JSON when relevant.',
      'Be concise, educational, and include a brief disclaimer. Do not provide personalized financial advice.',
      'If the user asks about banking/transactions, summarize from personal_finance (totals, top categories/merchants).',
      'If the user asks about markets, use macro/technicals/analysis/invest signals when available.',
      'If data is missing or stale, say so briefly and suggest how to refresh (Generate Report or Fetch Transactions).'
    ].join('\n')

    const prompt = `${systemPreamble}\n\nContext JSON:\n${JSON.stringify(context)}\n\nUser: ${userText}`
    const result = await model.generateContent(prompt)
    const reply = result?.response?.text() || 'No response from model.'
    return res.json({ reply })
  } catch (err) {
    return res.status(500).json({ error: 'Gemini chat failed', detail: err?.message })
  }
})

export default router
