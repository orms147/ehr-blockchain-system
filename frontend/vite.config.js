import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Enable global polyfills
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Exclude packages that have issues
      exclude: ['fs', 'http', 'https', 'net', 'tty', 'child_process'],
      // Enable protocol imports
      protocolImports: true,
      // Override specific modules
      overrides: {
        process: 'process/browser',
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
      // Force browser-compatible process
      'process': 'process/browser',
    },
  },
  define: {
    'process.env': {},
    'global': 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', 'process/browser', 'bn.js', '@web3auth/modal'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/node_modules/],
    },
  },
})


