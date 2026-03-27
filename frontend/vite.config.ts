import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router') || id.includes('react-dom') || id.includes('react')) {
              return 'react-vendor';
            }
            if (id.includes('recharts')) {
              return 'charts-vendor';
            }
            if (id.includes('@xyflow')) {
              return 'flow-vendor';
            }
            if (id.includes('framer-motion') || id.includes('lucide-react')) {
              return 'ui-vendor';
            }
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true, // Listen on all addresses (for Docker)
  },
})
