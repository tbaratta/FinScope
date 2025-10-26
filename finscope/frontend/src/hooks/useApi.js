import axios from 'axios'

// Hardcode production API base
const api = axios.create({ baseURL: 'https://app.finscope.us/api' })

export function useApi() {
  return api
}
