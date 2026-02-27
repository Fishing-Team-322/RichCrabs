const { spawnSync } = require('node:child_process')

const required = ['i18next', 'react-i18next']
const missing = required.filter((pkg) => {
  try {
    require.resolve(pkg)
    return false
  } catch {
    return true
  }
})

if (missing.length === 0) process.exit(0)

console.warn(`[ensure-i18n-deps] Missing packages: ${missing.join(', ')}`)
console.warn('[ensure-i18n-deps] Installing missing runtime i18n dependencies...')

const result = spawnSync('npm', ['install', ...missing, '--save'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.status !== 0) {
  console.error('[ensure-i18n-deps] Failed to install missing packages.')
  process.exit(result.status || 1)
}
