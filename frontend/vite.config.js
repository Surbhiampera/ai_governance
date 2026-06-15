import { defineConfig, transformWithEsbuild } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    {
      name: 'treat-js-files-as-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (/\/src\/.*\.js$/.test(id)) {
          return transformWithEsbuild(code, id, { loader: 'jsx' })
        }
      },
    },
    react(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api-proxy': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ''),
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            // Backend not ready yet (ECONNREFUSED) or restarting — return JSON 503
            // so axios error handlers get a parseable response instead of an HTML 500.
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ detail: 'Backend unavailable — please wait and retry.' }))
            }
          })
        },
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
})
