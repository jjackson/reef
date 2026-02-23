import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

let loaded = false

/**
 * Loads .env.local into process.env if not already present.
 * No-op when Next.js has already loaded it (values already in process.env).
 * No-op if .env.local doesn't exist.
 * Does not overwrite existing env vars.
 */
export function loadEnv(): void {
  if (loaded) return
  loaded = true

  const envPath = join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return

  const contents = readFileSync(envPath, 'utf-8')
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()

    // Don't overwrite — Next.js or shell may have already set these
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
