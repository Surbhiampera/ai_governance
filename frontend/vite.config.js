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
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
})
