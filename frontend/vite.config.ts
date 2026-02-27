import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

const chunkBudgetKb = Number(process.env.BUNDLE_BUDGET_KB || 300)

const budgetPlugin = () => ({
  name: 'bundle-budget-check',
  generateBundle(_: unknown, bundle: Record<string, { type: string; fileName: string; code?: string }>) {
    const violations: string[] = []

    for (const item of Object.values(bundle)) {
      if (item.type !== 'chunk' || !item.code || item.fileName.includes('vendor')) continue
      const sizeKb = Buffer.byteLength(item.code, 'utf8') / 1024
      if (sizeKb > chunkBudgetKb) {
        violations.push(`${item.fileName}: ${sizeKb.toFixed(1)}KB > ${chunkBudgetKb}KB`)
      }
    }

    if (violations.length) {
      throw new Error(`Bundle budget exceeded:\n${violations.join('\n')}`)
    }
  },
})

export default defineConfig({
  plugins: [
    react(),
    budgetPlugin(),
    process.env.ANALYZE === 'true' && visualizer({ filename: 'dist/bundle-stats.html', gzipSize: true, brotliSize: true }),
  ],
  resolve: {
    alias: {
      'qrcode-react': 'qrcode.react',
    },
  },
  build: {
    chunkSizeWarningLimit: chunkBudgetKb,
  },
  server: {
    port: 3000,
    open: true,
  },
})
