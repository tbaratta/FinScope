import axios from 'axios'

// Hardcode production Python API base
export const PY_API_BASE = 'https://app.finscope.us/py'
export const pyApi = axios.create({ baseURL: PY_API_BASE })
