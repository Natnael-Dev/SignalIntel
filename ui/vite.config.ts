import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy Python FastAPI (8000) and Rust Gateway (8080)
    // so the UI never has to deal with CORS in dev.
    proxy: {
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        rewrite: (p) => p.replace(/^\/ws/, ''),
      },
      '/py': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/py/, ''),
      },
      '/brain': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/brain/, ''),
      },
    },
  },
})
