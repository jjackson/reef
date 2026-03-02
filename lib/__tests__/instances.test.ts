import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetSecret, mockCreateProvider, mockGetBotName, mockGetAccounts, mockLoadSettings, mockEnsureDefaultWorkspace } = vi.hoisted(() => ({
  mockGetSecret: vi.fn(),
  mockCreateProvider: vi.fn(),
  mockGetBotName: vi.fn(),
  mockGetAccounts: vi.fn(),
  mockLoadSettings: vi.fn(),
  mockEnsureDefaultWorkspace: vi.fn(),
}))

vi.mock('../1password', () => ({ getSecret: mockGetSecret }))
vi.mock('../providers', () => ({ createProvider: mockCreateProvider }))
vi.mock('../mapping', () => ({ getBotName: mockGetBotName }))
vi.mock('../settings', () => ({
  getAccounts: mockGetAccounts,
  loadSettings: mockLoadSettings,
  getNameMap: vi.fn(),
  resetSettingsCache: vi.fn(),
}))
vi.mock('../workspaces', () => ({ ensureDefaultWorkspace: mockEnsureDefaultWorkspace }))

const { listInstances } = await import('../instances')

describe('listInstances (multi-account)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSecret.mockResolvedValue('do-api-token-value')
    mockGetBotName.mockImplementation((name: string) => {
      if (name === 'openclaw-hal') return 'Hal'
      if (name === 'openclaw-alpha') return 'Alpha'
      if (name === 'open-claw-hal') return 'hal'
      if (name === 'open-claw-marvin') return 'marvin'
      return null
    })
    mockLoadSettings.mockReturnValue({ accounts: {}, workspaces: {} })
    mockEnsureDefaultWorkspace.mockImplementation(() => {})
  })

  it('lists instances across multiple accounts', async () => {
    mockGetAccounts.mockReturnValue([
      { id: 'personal', label: 'Personal', tokenRef: 'op://vault/personal-token', provider: 'digitalocean' },
      { id: 'work', label: 'Work', tokenRef: 'op://vault/work-token', provider: 'digitalocean' },
    ])
    mockLoadSettings.mockReturnValue({
      accounts: {
        personal: { provider: 'digitalocean', tokenRef: 'op://vault/personal-token', nameMap: { 'openclaw-hal': 'Hal' } },
        work: { provider: 'digitalocean', tokenRef: 'op://vault/work-token', nameMap: { 'openclaw-alpha': 'Alpha' } },
      },
      workspaces: {},
    })
    const mockProvider1 = { listInstances: vi.fn().mockResolvedValue([{ providerId: '123', name: 'openclaw-hal', ip: '1.2.3.4' }]) }
    const mockProvider2 = { listInstances: vi.fn().mockResolvedValue([{ providerId: '456', name: 'openclaw-alpha', ip: '5.6.7.8' }]) }
    mockCreateProvider
      .mockReturnValueOnce(mockProvider1)
      .mockReturnValueOnce(mockProvider2)

    const result = await listInstances()
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'openclaw-hal', providerId: '123', provider: 'digitalocean', platform: 'openclaw', accountId: 'personal' })
    expect(result[1]).toMatchObject({ id: 'openclaw-alpha', providerId: '456', provider: 'digitalocean', platform: 'openclaw', accountId: 'work' })
    expect(mockEnsureDefaultWorkspace).toHaveBeenCalledWith(['openclaw-hal', 'openclaw-alpha'])
  })

  it('resolves tokens via getSecret for op:// refs', async () => {
    mockGetAccounts.mockReturnValue([
      { id: 'personal', label: 'Personal', tokenRef: 'op://vault/token', provider: 'digitalocean' },
    ])
    mockLoadSettings.mockReturnValue({
      accounts: {
        personal: { provider: 'digitalocean', tokenRef: 'op://vault/token', nameMap: {} },
      },
      workspaces: {},
    })
    const mockProvider = { listInstances: vi.fn().mockResolvedValue([{ providerId: '1', name: 'openclaw-hal', ip: '1.1.1.1' }]) }
    mockCreateProvider.mockReturnValue(mockProvider)

    await listInstances()
    expect(mockGetSecret).toHaveBeenCalledWith('op://vault/token')
  })

  it('falls back to legacy env var when no accounts configured', async () => {
    mockGetAccounts.mockReturnValue([])
    mockLoadSettings.mockReturnValue({ accounts: {}, workspaces: {} })
    process.env.DO_API_TOKEN_OP_REF = 'op://AI-Agents/do-token/credential'
    const mockProvider = { listInstances: vi.fn().mockResolvedValue([{ providerId: '123', name: 'open-claw-hal', ip: '1.2.3.4' }]) }
    mockCreateProvider.mockReturnValue(mockProvider)

    const result = await listInstances()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'open-claw-hal', providerId: '123', provider: 'digitalocean', platform: 'openclaw', accountId: 'default' })
    expect(mockGetSecret).toHaveBeenCalledWith('op://AI-Agents/do-token/credential')
    expect(mockEnsureDefaultWorkspace).toHaveBeenCalledWith(['open-claw-hal'])
  })

  it('skips droplets with no name mapping', async () => {
    mockGetAccounts.mockReturnValue([
      { id: 'personal', label: 'Personal', tokenRef: 'op://vault/token', provider: 'digitalocean' },
    ])
    mockLoadSettings.mockReturnValue({
      accounts: {
        personal: { provider: 'digitalocean', tokenRef: 'op://vault/token', nameMap: {} },
      },
      workspaces: {},
    })
    mockGetBotName.mockReturnValue(null)
    const mockProvider = { listInstances: vi.fn().mockResolvedValue([{ providerId: '123', name: 'openclaw-hal', ip: '1.2.3.4' }]) }
    mockCreateProvider.mockReturnValue(mockProvider)

    const result = await listInstances()
    expect(result).toHaveLength(0)
  })

  it('gracefully handles account errors', async () => {
    mockGetAccounts.mockReturnValue([
      { id: 'good', label: 'Good', tokenRef: 'op://vault/good-token', provider: 'digitalocean' },
      { id: 'bad', label: 'Bad', tokenRef: 'op://vault/bad-token', provider: 'digitalocean' },
    ])
    mockLoadSettings.mockReturnValue({
      accounts: {
        good: { provider: 'digitalocean', tokenRef: 'op://vault/good-token', nameMap: {} },
        bad: { provider: 'digitalocean', tokenRef: 'op://vault/bad-token', nameMap: {} },
      },
      workspaces: {},
    })
    mockGetSecret
      .mockResolvedValueOnce('good-token')
      .mockRejectedValueOnce(new Error('bad token'))
    const mockProvider = { listInstances: vi.fn().mockResolvedValue([{ providerId: '1', name: 'openclaw-hal', ip: '1.1.1.1' }]) }
    mockCreateProvider.mockReturnValue(mockProvider)

    const result = await listInstances()
    expect(result).toHaveLength(1)
    expect(result[0].accountId).toBe('good')
  })
})
