import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const paperclip = process.env.PAPERCLIP_DEV_SERVER || 'http://localhost:3100'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/paperclip': {
        target: paperclip,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/paperclip/, '/api'),
      },
    },
  },
})
