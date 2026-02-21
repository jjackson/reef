import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetSecret, mockListDroplets, mockGetBotName } = vi.hoisted(() => ({
  mockGetSecret: vi.fn(),
  mockListDroplets: vi.fn(),
  mockGetBotName: vi.fn(),
}))

vi.mock('../1password', () => ({ getSecret: mockGetSecret }))
vi.mock('../digitalocean', () => ({ listOpenClawDroplets: mockListDroplets }))
vi.mock('../mapping', () => ({ getBotName: mockGetBotName }))

const { listInstances, getInstance, resolveInstance } = await import('../instances')

const fakeDroplets = [
  { id: 123, name: 'open-claw-hal', ip: '1.2.3.4' },
  { id: 456, name: 'open-claw-marvin', ip: '5.6.7.8' },
]

describe('listInstances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DO_API_TOKEN_OP_REF = 'op://AI-Agents/do-token/credential'
    mockGetSecret.mockResolvedValue('do-api-token-value')
    mockListDroplets.mockResolvedValue(fakeDroplets)
    mockGetBotName.mockImplementation((name: string) =>
      name === 'open-claw-hal' ? 'hal' : name === 'open-claw-marvin' ? 'marvin' : null
    )
  })

  it('returns resolved instances for all mapped droplets', async () => {
    const result = await listInstances()
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'open-claw-hal',
      label: 'open-claw-hal',
      ip: '1.2.3.4',
      sshKeyRef: 'op://AI-Agents/hal - SSH Private Key/notesPlain',
    })
  })

  it('skips droplets with no name mapping', async () => {
    mockGetBotName.mockReturnValue(null)
    const result = await listInstances()
    expect(result).toHaveLength(0)
  })
})

describe('getInstance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DO_API_TOKEN_OP_REF = 'op://AI-Agents/do-token/credential'
    mockGetSecret.mockResolvedValue('do-api-token-value')
    mockListDroplets.mockResolvedValue(fakeDroplets)
    mockGetBotName.mockImplementation((name: string) =>
      name === 'open-claw-hal' ? 'hal' : null
    )
  })

  it('returns instance by id', async () => {
    const result = await getInstance('open-claw-hal')
    expect(result?.label).toBe('open-claw-hal')
  })

  it('returns null for unknown id', async () => {
    const result = await getInstance('nonexistent')
    expect(result).toBeNull()
  })
})
