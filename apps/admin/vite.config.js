import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = process.env.API_TARGET || 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true }
    }
  },
  build: { chunkSizeWarningLimit: 1500 }
})
