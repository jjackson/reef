import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetSecret, mockListDroplets, mockGetBotName, mockGetAccounts } = vi.hoisted(() => ({
  mockGetSecret: vi.fn(),
  mockListDroplets: vi.fn(),
  mockGetBotName: vi.fn(),
  mockGetAccounts: vi.fn(),
}))

vi.mock('../1password', () => ({ getSecret: mockGetSecret }))
vi.mock('../digitalocean', () => ({ listOpenClawDroplets: mockListDroplets }))
vi.mock('../mapping', () => ({ getBotName: mockGetBotName }))
vi.mock('../settings', () => ({
  getAccounts: mockGetAccounts,
  getNameMap: vi.fn(),
  resetSettingsCache: vi.fn(),
}))

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
  })

  it('lists instances across multiple accounts', async () => {
    mockGetAccounts.mockReturnValue([
      { id: 'personal', label: 'Personal', tokenRef: 'op://vault/personal-token' },
      { id: 'work', label: 'Work', tokenRef: 'op://vault/work-token' },
    ])
    mockListDroplets
      .mockResolvedValueOnce([{ id: 123, name: 'openclaw-hal', ip: '1.2.3.4' }])
      .mockResolvedValueOnce([{ id: 456, name: 'openclaw-alpha', ip: '5.6.7.8' }])

    const result = await listInstances()
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'openclaw-hal', accountId: 'personal' })
    expect(result[1]).toMatchObject({ id: 'openclaw-alpha', accountId: 'work' })
  })

  it('resolves tokens via getSecret for op:// refs', async () => {
    mockGetAccounts.mockReturnValue([
      { id: 'personal', label: 'Personal', tokenRef: 'op://vault/token' },
    ])
    mockListDroplets.mockResolvedValue([{ id: 1, name: 'openclaw-hal', ip: '1.1.1.1' }])

    await listInstances()
    expect(mockGetSecret).toHaveBeenCalledWith('op://vault/token')
  })

  it('falls back to legacy env var when no accounts configured', async () => {
    mockGetAccounts.mockReturnValue([])
    process.env.DO_API_TOKEN_OP_REF = 'op://AI-Agents/do-token/credential'
    mockListDroplets.mockResolvedValue([{ id: 123, name: 'open-claw-hal', ip: '1.2.3.4' }])

    const result = await listInstances()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'open-claw-hal', accountId: 'default' })
    expect(mockGetSecret).toHaveBeenCalledWith('op://AI-Agents/do-token/credential')
  })

  it('skips droplets with no name mapping', async () => {
    mockGetAccounts.mockReturnValue([
      { id: 'personal', label: 'Personal', tokenRef: 'op://vault/token' },
    ])
    mockGetBotName.mockReturnValue(null)
    mockListDroplets.mockResolvedValue([{ id: 123, name: 'openclaw-hal', ip: '1.2.3.4' }])

    const result = await listInstances()
    expect(result).toHaveLength(0)
  })

  it('gracefully handles account errors', async () => {
    mockGetAccounts.mockReturnValue([
      { id: 'good', label: 'Good', tokenRef: 'op://vault/good-token' },
      { id: 'bad', label: 'Bad', tokenRef: 'op://vault/bad-token' },
    ])
    mockGetSecret
      .mockResolvedValueOnce('good-token')
      .mockRejectedValueOnce(new Error('bad token'))
    mockListDroplets.mockResolvedValue([{ id: 1, name: 'openclaw-hal', ip: '1.1.1.1' }])

    const result = await listInstances()
    expect(result).toHaveLength(1)
    expect(result[0].accountId).toBe('good')
  })
})
