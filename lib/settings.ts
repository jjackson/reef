import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface AccountConfig {
  provider?: string
  tokenRef: string
  nameMap: Record<string, string>
}

export interface WorkspaceConfig {
  label: string
  instances: string[]
}

export interface Settings {
  accounts: Record<string, AccountConfig>
  workspaces: Record<string, WorkspaceConfig>
}

export interface Account {
  id: string
  label: string
  tokenRef: string
  provider: string
}

let cached: Settings | null = null

export function resetSettingsCache(): void {
  cached = null
}

export function loadSettings(): Settings {
  if (cached) return cached

  const settingsPath = join(process.cwd(), 'config', 'settings.json')
  if (!existsSync(settingsPath)) {
    cached = { accounts: {}, workspaces: {} }
    return cached
  }

  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    cached = { accounts: raw.accounts || {}, workspaces: raw.workspaces || {} }
  } catch {
    cached = { accounts: {}, workspaces: {} }
  }
  return cached
}

export function getAccounts(): Account[] {
  const settings = loadSettings()
  return Object.entries(settings.accounts).map(([id, config]) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    tokenRef: config.tokenRef,
    provider: config.provider || 'digitalocean',
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

export function addToNameMap(accountId: string, dropletName: string, botName: string): void {
  const settingsPath = join(process.cwd(), 'config', 'settings.json')
  const settings = loadSettings()
  if (!settings.accounts[accountId]) {
    settings.accounts[accountId] = { tokenRef: '', nameMap: {} }
  }
  settings.accounts[accountId].nameMap[dropletName] = botName
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  cached = settings
}

export function writeSettings(settings: Settings): void {
  const settingsPath = join(process.cwd(), 'config', 'settings.json')
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  cached = settings
}
