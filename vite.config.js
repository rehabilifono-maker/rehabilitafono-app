import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Este archivo es el "traductor" que Vercel necesita para entender React
export default defineConfig({
  plugins: [react()],
})
