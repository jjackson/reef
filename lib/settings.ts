import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

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
  } catch (err) {
    console.warn(`[reef] Failed to parse ${settingsPath}: ${err instanceof Error ? err.message : err}`)
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

/** Write JSON to file atomically: write to temp file, then rename over target. */
function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = filePath + '.tmp'
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n')
  renameSync(tmpPath, filePath)
}

export function addToNameMap(accountId: string, dropletName: string, botName: string): void {
  const settingsPath = join(process.cwd(), 'config', 'settings.json')
  const settings = loadSettings()
  if (!settings.accounts[accountId]) {
    settings.accounts[accountId] = { tokenRef: '', nameMap: {} }
  }
  settings.accounts[accountId].nameMap[dropletName] = botName
  atomicWriteJson(settingsPath, settings)
  cached = settings
}

export function writeSettings(settings: Settings): void {
  const settingsPath = join(process.cwd(), 'config', 'settings.json')
  atomicWriteJson(settingsPath, settings)
  cached = settings
}
