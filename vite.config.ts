import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const keyPath = resolve('.cert/localhost-key.pem')
  const certPath = resolve('.cert/localhost-cert.pem')
  const localHttps = mode === 'https-preview' && existsSync(keyPath) && existsSync(certPath)

  return {
    base: process.env.GITHUB_PAGES === 'true' ? '/collide/' : '/',
    plugins: [react()],
    preview: localHttps
      ? {
          allowedHosts: ['.trycloudflare.com', '.loca.lt'],
          https: {
            key: readFileSync(keyPath),
            cert: readFileSync(certPath),
          },
        }
      : {
          allowedHosts: ['.trycloudflare.com', '.loca.lt'],
        },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      setupFiles: './src/setupTests.ts',
    },
  }
})
