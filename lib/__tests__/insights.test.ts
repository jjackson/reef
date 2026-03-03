import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunCommand } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
}))
vi.mock('../ssh', () => ({ runCommand: mockRunCommand }))

const { mockListInstances, mockResolveSSHKey, mockLoadSettings } = vi.hoisted(() => ({
  mockListInstances: vi.fn(),
  mockResolveSSHKey: vi.fn(),
  mockLoadSettings: vi.fn(),
}))
vi.mock('../instances', () => ({
  listInstances: mockListInstances,
  resolveSSHKey: mockResolveSSHKey,
  resolveInstance: vi.fn(),
}))
vi.mock('../settings', () => ({
  loadSettings: mockLoadSettings,
  getAccounts: vi.fn().mockReturnValue([]),
  getNameMap: vi.fn(),
  resetSettingsCache: vi.fn(),
}))

import { getInstanceKnowledge, getFleetKnowledge, findSkill, classifyWorkspaceFiles } from '../insights'

const config = { host: '1.2.3.4', privateKey: 'fake-key' }

// Helper: build batched output matching the for-loop format
function batchOutput(files: { name: string; content: string; epoch: number }[]): string {
  return files.map(f =>
    `___FILE___${f.name}\n${f.content}___REEF_SEP___\n${f.epoch}\n___END___`
  ).join('\n')
}

// Helper: build a single SSH response with all three sections
function sectionedOutput(opts: {
  memory?: { name: string; content: string; epoch: number }[]
  skills?: { name: string; content: string; epoch: number }[]
  workspace?: { name: string; content: string; epoch: number }[]
}): string {
  return [
    '___SECTION___MEMORY',
    batchOutput(opts.memory || []),
    '___SECTION___SKILLS',
    batchOutput(opts.skills || []),
    '___SECTION___WORKSPACE',
    batchOutput(opts.workspace || []),
  ].join('\n')
}

describe('getInstanceKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns memories, skills, and identity files for an instance', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: sectionedOutput({
        memory: [
          { name: '2026-03-01.md', content: 'Daily notes', epoch: 1709000000 },
          { name: '2026-03-02.md', content: 'More notes', epoch: 1709100000 },
        ],
        skills: [
          { name: 'search', content: 'Use grep', epoch: 1709200000 },
          { name: 'coding', content: 'Write code', epoch: 1709300000 },
        ],
        workspace: [
          { name: 'SOUL.md', content: 'I am helpful', epoch: 1709400000 },
          { name: 'IDENTITY.md', content: 'Name: Eva', epoch: 1709500000 },
        ],
      }),
      stderr: '', code: 0,
    })

    const result = await getInstanceKnowledge(config, 'openclaw-eva')

    expect(result.instance).toBe('openclaw-eva')
    expect(result.memories).toHaveLength(2)
    expect(result.skills).toHaveLength(2)
    expect(result.identity).toHaveLength(2)

    expect(result.memories[0].name).toBe('2026-03-01.md')
    expect(result.memories[0].content).toBe('Daily notes')
    expect(result.memories[0].lastModified).toBe(new Date(1709000000 * 1000).toISOString())

    expect(result.skills[0].name).toBe('search')
    expect(result.skills[0].content).toBe('Use grep')

    expect(result.skills[1].name).toBe('coding')
    expect(result.skills[1].content).toBe('Write code')

    expect(result.identity[0].name).toBe('SOUL.md')
    expect(result.identity[0].content).toBe('I am helpful')
    expect(result.config).toEqual([])
    expect(result.docs).toEqual([])

    // Should be exactly 1 SSH call (single batched command)
    expect(mockRunCommand).toHaveBeenCalledTimes(1)
  })

  it('returns empty arrays when instance has no knowledge', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })

    const result = await getInstanceKnowledge(config, 'openclaw-empty')

    expect(result.instance).toBe('openclaw-empty')
    expect(result.memories).toEqual([])
    expect(result.skills).toEqual([])
    expect(result.identity).toEqual([])
    expect(result.config).toEqual([])
    expect(result.docs).toEqual([])
  })
})

describe('classifyWorkspaceFiles', () => {
  it('sorts files into identity, config, and docs categories', () => {
    const files = [
      { name: 'SOUL.md', content: 'I am helpful', lastModified: '2024-01-01T00:00:00.000Z' },
      { name: 'TOOLS.md', content: 'Tool config', lastModified: '2024-01-01T00:00:00.000Z' },
      { name: 'RandomDoc.md', content: 'Some doc', lastModified: '2024-01-01T00:00:00.000Z' },
      { name: 'IDENTITY.md', content: 'Name: Eva', lastModified: '2024-01-01T00:00:00.000Z' },
      { name: 'HEARTBEAT.md', content: 'Heartbeat config', lastModified: '2024-01-01T00:00:00.000Z' },
    ]

    const result = classifyWorkspaceFiles(files)

    expect(result.identity).toHaveLength(2)
    expect(result.identity.map(f => f.name)).toEqual(['SOUL.md', 'IDENTITY.md'])

    expect(result.config).toHaveLength(2)
    expect(result.config.map(f => f.name)).toEqual(['TOOLS.md', 'HEARTBEAT.md'])

    expect(result.docs).toHaveLength(1)
    expect(result.docs[0].name).toBe('RandomDoc.md')
  })
})

describe('getFleetKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aggregates knowledge across multiple instances', async () => {
    mockListInstances.mockResolvedValue([
      { id: 'openclaw-hal', label: 'openclaw-hal', ip: '1.2.3.4', providerId: '123', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref', accountId: 'personal' },
      { id: 'openclaw-eva', label: 'openclaw-eva', ip: '5.6.7.8', providerId: '456', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref2', accountId: 'personal' },
    ])

    mockResolveSSHKey.mockImplementation((ref: string) => {
      if (ref === 'op://ref') return Promise.resolve('fake-key')
      if (ref === 'op://ref2') return Promise.resolve('fake-key2')
      return Promise.reject(new Error('unknown ref'))
    })

    mockLoadSettings.mockReturnValue({ accounts: {}, workspaces: {} })

    mockRunCommand.mockImplementation((cfg: unknown) => {
      const host = (cfg as { host: string }).host

      if (host === '1.2.3.4') {
        return Promise.resolve({
          stdout: sectionedOutput({
            memory: [{ name: 'goal.md', content: 'Be helpful', epoch: 1709000000 }],
            skills: [
              { name: 'search', content: 'Use grep', epoch: 1709100000 },
              { name: 'coding', content: 'Write code', epoch: 1709200000 },
            ],
            workspace: [{ name: 'SOUL.md', content: 'I am Hal', epoch: 1709400000 }],
          }),
          stderr: '', code: 0,
        })
      }

      if (host === '5.6.7.8') {
        return Promise.resolve({
          stdout: sectionedOutput({
            memory: [{ name: 'personality.md', content: 'Be curious', epoch: 1709300000 }],
            skills: [{ name: 'search', content: 'Use ripgrep', epoch: 1709400000 }],
          }),
          stderr: '', code: 0,
        })
      }

      return Promise.resolve({ stdout: '', stderr: '', code: 0 })
    })

    const result = await getFleetKnowledge()

    expect(result.instances).toHaveLength(2)
    expect(result.totalMemories).toBe(2) // 1 from hal + 1 from eva
    expect(result.totalSkills).toBe(3)   // 2 from hal + 1 from eva

    // skillIndex: search should map to both instances
    expect(result.skillIndex['search']).toEqual(expect.arrayContaining(['openclaw-hal', 'openclaw-eva']))
    expect(result.skillIndex['search']).toHaveLength(2)

    // coding should only map to hal
    expect(result.skillIndex['coding']).toEqual(['openclaw-hal'])
  })

  it('gracefully handles SSH key resolution failure', async () => {
    mockListInstances.mockResolvedValue([
      { id: 'openclaw-hal', label: 'openclaw-hal', ip: '1.2.3.4', providerId: '123', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref', accountId: 'personal' },
      { id: 'openclaw-broken', label: 'openclaw-broken', ip: '5.6.7.8', providerId: '456', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://bad-ref', accountId: 'personal' },
    ])

    mockResolveSSHKey.mockImplementation((ref: string) => {
      if (ref === 'op://ref') return Promise.resolve('fake-key')
      return Promise.reject(new Error('no item matched'))
    })

    mockLoadSettings.mockReturnValue({ accounts: {}, workspaces: {} })

    mockRunCommand.mockResolvedValue({
      stdout: sectionedOutput({
        skills: [{ name: 'search', content: 'Use grep', epoch: 1709100000 }],
      }),
      stderr: '', code: 0,
    })

    const result = await getFleetKnowledge()

    expect(result.instances).toHaveLength(1)
    expect(result.instances[0].instance).toBe('openclaw-hal')
    expect(result.totalSkills).toBe(1)
    expect(result.totalMemories).toBe(0)
  })
})

describe('findSkill', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns instances that have a specific skill', async () => {
    mockListInstances.mockResolvedValue([
      { id: 'openclaw-hal', label: 'openclaw-hal', ip: '1.2.3.4', providerId: '123', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref', accountId: 'personal' },
    ])

    mockResolveSSHKey.mockResolvedValue('fake-key')
    mockLoadSettings.mockReturnValue({ accounts: {}, workspaces: {} })

    mockRunCommand.mockResolvedValue({
      stdout: sectionedOutput({
        skills: [
          { name: 'coding', content: 'Write code', epoch: 1709200000 },
          { name: 'search', content: 'Use ripgrep', epoch: 1709400000 },
        ],
      }),
      stderr: '', code: 0,
    })

    const result = await findSkill('coding')

    expect(result).toHaveLength(1)
    expect(result[0].instance).toBe('openclaw-hal')
    expect(result[0].skills.find(s => s.name === 'coding')?.content).toBe('Write code')
  })
})
