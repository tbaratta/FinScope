import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    // Allow any Cloudflare quick-tunnel hostname and localhost
    allowedHosts: [/\.trycloudflare\.com$/, 'localhost']
  },
  preview: {
    port: 5173,
    host: true,
    // Accept any Cloudflare quick-tunnel hostname and localhost
    allowedHosts: [/\.trycloudflare\.com$/, 'localhost']
  }
})
