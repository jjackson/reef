import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'fs'

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

const { loadSettings, getAccounts, getNameMap, getGlobalNameMap, resetSettingsCache } = await import('../settings')

const sampleSettings = {
  accounts: {
    personal: {
      tokenRef: 'op://AI-Agents/Reef - Digital Ocean/credential',
      nameMap: {
        'openclaw-hal': 'Hal',
        'openclaw-eva': 'Eva',
      },
    },
    work: {
      tokenRef: 'op://Work/DO-Token/credential',
      nameMap: {
        'openclaw-alpha': 'Alpha',
      },
    },
  },
}

describe('settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSettingsCache()
  })

  it('loads settings from config/settings.json', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleSettings))
    const settings = loadSettings()
    expect(settings.accounts).toHaveProperty('personal')
    expect(settings.accounts).toHaveProperty('work')
  })

  it('returns empty accounts when file does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    const settings = loadSettings()
    expect(settings.accounts).toEqual({})
  })

  it('getAccounts returns account list with ids', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleSettings))
    const accounts = getAccounts()
    expect(accounts).toHaveLength(2)
    expect(accounts[0]).toMatchObject({ id: 'personal', tokenRef: 'op://AI-Agents/Reef - Digital Ocean/credential' })
  })

  it('getNameMap returns per-account name map', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleSettings))
    expect(getNameMap('personal')).toEqual({ 'openclaw-hal': 'Hal', 'openclaw-eva': 'Eva' })
    expect(getNameMap('nonexistent')).toEqual({})
  })

  it('getGlobalNameMap merges all accounts', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleSettings))
    const global = getGlobalNameMap()
    expect(global).toEqual({
      'openclaw-hal': 'Hal',
      'openclaw-eva': 'Eva',
      'openclaw-alpha': 'Alpha',
    })
  })
})
