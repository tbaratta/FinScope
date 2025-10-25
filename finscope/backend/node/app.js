import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import dataRoutes from './routes/data.js'
import analyzeRoutes from './routes/analyze.js'
import forecastRoutes from './routes/forecast.js'
import reportRoutes from './routes/report.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const app = express()
app.use(cors())
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
  }).catch(err => console.error('Mongo connection failed', err.message))
}

// Required configuration validation (no demo mode)
const requiredEnv = [
  'ALPHAVANTAGE_API_KEY',
  'FRED_API_KEY',
  'ADK_API_KEY',
]
const missing = requiredEnv.filter(k => !process.env[k])
if (missing.length) {
  console.error('\n[FinScope] Missing required environment variables (no demo mode):')
  missing.forEach(k => console.error('  -', k))
  console.error('Set these in finscope/.env or your deployment environment and restart.')
  process.exit(1)
}

app.get('/api/health/config', (_req, res) => {
  res.json({
    ok: true,
    required: requiredEnv,
    missing: [],
  })
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.use('/api/data', dataRoutes)
app.use('/api/analyze', analyzeRoutes)
app.use('/api/forecast', forecastRoutes)
app.use('/api/report', reportRoutes)

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Node API listening on :${PORT}`))
