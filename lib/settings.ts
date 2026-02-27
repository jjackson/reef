import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface AccountConfig {
  tokenRef: string
  nameMap: Record<string, string>
}

export interface Settings {
  accounts: Record<string, AccountConfig>
}

export interface Account {
  id: string
  label: string
  tokenRef: string
}

let cached: Settings | null = null

export function resetSettingsCache(): void {
  cached = null
}

export function loadSettings(): Settings {
  if (cached) return cached

  const settingsPath = join(process.cwd(), 'config', 'settings.json')
  if (!existsSync(settingsPath)) {
    cached = { accounts: {} }
    return cached
  }

  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    cached = { accounts: raw.accounts || {} }
  } catch {
    cached = { accounts: {} }
  }
  return cached
}

export function getAccounts(): Account[] {
  const settings = loadSettings()
  return Object.entries(settings.accounts).map(([id, config]) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    tokenRef: config.tokenRef,
  }))
}

export function getNameMap(accountId: string): Record<string, string> {
  const settings = loadSettings()
  return settings.accounts[accountId]?.nameMap ?? {}
}

export function getGlobalNameMap(): Record<string, string> {
  const settings = loadSettings()
  const merged: Record<string, string> = {}
  for (const config of Object.values(settings.accounts)) {
    Object.assign(merged, config.nameMap)
  }
  return merged
}
