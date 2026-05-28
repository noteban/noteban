import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@noteban/pie-menu': fileURLToPath(new URL('./packages/pie-menu/src/index.ts', import.meta.url)),
    },
  },
})
