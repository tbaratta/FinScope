import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import axios from 'axios'
import dataRoutes from './routes/data.js'
import analyzeRoutes from './routes/analyze.js'
import forecastRoutes from './routes/forecast.js'
import reportRoutes from './routes/report.js'
import agentsRoutes from './routes/agents.js'
import plaidRoutes from './routes/plaid.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const app = express()

// Security & performance middleware
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN
app.use(cors({ origin: FRONTEND_ORIGIN ? [FRONTEND_ORIGIN] : '*', credentials: false }))
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(compression())
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600 }))
app.use(express.json({ limit: '2mb' }))
app.use(morgan('dev'))

// Mongo connection (optional)
let mongo
const { MONGO_URI, MONGO_DB_NAME } = process.env
if (MONGO_URI) {
  MongoClient.connect(MONGO_URI).then(client => {
    mongo = client.db(MONGO_DB_NAME || 'finscope')
    app.locals.db = mongo
    console.log('MongoDB connected')
    // Ensure indexes
    mongo.collection('portfolios').createIndex({ user_id: 1 }, { unique: true })
      .then(() => console.log('Index ensured: portfolios.user_id (unique)'))
      .catch(err => console.warn('Index creation warning:', err?.message))
  }).catch(err => console.error('Mongo connection failed', err.message))
}

// Config hints (non-fatal): log missing keys that improve features
const recommendedEnv = [
  'GOOGLE_API_KEY', // or ADK_API_KEY for LLM
  'FRED_API_KEY',   // macro series
  'NEWS_API_KEY',   // headlines (optional)
  'PLAID_CLIENT_ID',
  'PLAID_SECRET',
]
const missingRecommended = recommendedEnv.filter(k => !process.env[k])
if (missingRecommended.length) {
  console.warn('[FinScope] Optional env not set (features may degrade):', missingRecommended.join(', '))
}

app.get('/api/health/config', (_req, res) => {
  res.json({
    ok: true,
    required: requiredEnv,
    missing: [],
  })
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/health/ready', async (_req, res) => {
  // Basic readiness: can we reach Python API?
  const pyUrl = process.env.PYTHON_SERVICE_URL || 'http://py-api:8000'
  try {
    const r = await axios.get(`${pyUrl}/health`, { timeout: 3000 })
    if (r.status === 200 && r.data?.ok) return res.json({ ok: true })
    return res.status(503).json({ ok: false, reason: 'py-api unhealthy' })
  } catch (e) {
    return res.status(503).json({ ok: false, reason: 'py-api unreachable' })
  }
})

app.use('/api/data', dataRoutes)
app.use('/api/analyze', analyzeRoutes)
app.use('/api/forecast', forecastRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/agents', agentsRoutes)
app.use('/api/plaid', plaidRoutes)

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Node API listening on :${PORT}`))
