import axios from 'axios'

export const PY_API_BASE = import.meta.env.VITE_PY_API_BASE_URL || 'http://localhost:8000'
export const pyApi = axios.create({ baseURL: PY_API_BASE })
