import { Router } from 'express'
import axios from 'axios'
import { GoogleGenerativeAI } from '@google/generative-ai'

const router = Router()
const PY_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

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

    const messages = req.body?.messages || []
    const userText = (messages.slice(-1)[0]?.content || '').toString()
    const systemPreamble = 'You are FinScope Mission Control. Provide concise, actionable financial insights with disclaimers. Avoid personal financial advice; offer educational guidance.'

    const prompt = `${systemPreamble}\n\nUser: ${userText}`
    const result = await model.generateContent(prompt)
    const reply = result?.response?.text() || 'No response from model.'
    return res.json({ reply })
  } catch (err) {
    return res.status(500).json({ error: 'Gemini chat failed', detail: err?.message })
  }
})

export default router
