import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunCommand } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
}))
vi.mock('../ssh', () => ({ runCommand: mockRunCommand }))

const { mockListInstances, mockResolveInstance, mockListAgents, mockLoadSettings } = vi.hoisted(() => ({
  mockListInstances: vi.fn(),
  mockResolveInstance: vi.fn(),
  mockListAgents: vi.fn(),
  mockLoadSettings: vi.fn(),
}))
vi.mock('../instances', () => ({
  listInstances: mockListInstances,
  resolveInstance: mockResolveInstance,
}))
vi.mock('../openclaw', () => ({ listAgents: mockListAgents }))
vi.mock('../settings', () => ({
  loadSettings: mockLoadSettings,
  getAccounts: vi.fn().mockReturnValue([]),
  getNameMap: vi.fn(),
  resetSettingsCache: vi.fn(),
}))

import { getAgentKnowledge, getFleetKnowledge, findSkill } from '../insights'

const config = { host: '1.2.3.4', privateKey: 'fake-key' }

describe('getAgentKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns memories and skills for an agent', async () => {
    const base = '$HOME/.openclaw/agents/hal'
    mockRunCommand.mockImplementation((_cfg: unknown, cmd: string) => {
      if (cmd === `ls -1 "${base}/memories" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'goal.md\nhabits.md\n', stderr: '', code: 0 })
      }
      if (cmd === `ls -1 "${base}/skills" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'search.md\n', stderr: '', code: 0 })
      }
      // combined cat+stat for memory files
      if (cmd === `cat "${base}/memories/goal.md" && echo "___REEF_SEP___" && stat -c '%Y' "${base}/memories/goal.md"`) {
        return Promise.resolve({ stdout: 'Be helpful___REEF_SEP___\n1709000000\n', stderr: '', code: 0 })
      }
      if (cmd === `cat "${base}/memories/habits.md" && echo "___REEF_SEP___" && stat -c '%Y' "${base}/memories/habits.md"`) {
        return Promise.resolve({ stdout: 'Check daily___REEF_SEP___\n1709100000\n', stderr: '', code: 0 })
      }
      // combined cat+stat for skill files
      if (cmd === `cat "${base}/skills/search.md" && echo "___REEF_SEP___" && stat -c '%Y' "${base}/skills/search.md"`) {
        return Promise.resolve({ stdout: 'Use grep___REEF_SEP___\n1709200000\n', stderr: '', code: 0 })
      }
      return Promise.resolve({ stdout: '', stderr: '', code: 1 })
    })

    const result = await getAgentKnowledge(config, 'hal', 'Hal', '\u{1F916}', 'openclaw-hal')

    expect(result.instance).toBe('openclaw-hal')
    expect(result.agentId).toBe('hal')
    expect(result.agentName).toBe('Hal')
    expect(result.agentEmoji).toBe('\u{1F916}')
    expect(result.memories).toHaveLength(2)
    expect(result.skills).toHaveLength(1)

    expect(result.memories[0].name).toBe('goal.md')
    expect(result.memories[0].content).toBe('Be helpful')
    expect(result.memories[0].lastModified).toBe(new Date(1709000000 * 1000).toISOString())

    expect(result.memories[1].name).toBe('habits.md')
    expect(result.memories[1].content).toBe('Check daily')

    expect(result.skills[0].name).toBe('search.md')
    expect(result.skills[0].content).toBe('Use grep')
    expect(result.skills[0].lastModified).toBe(new Date(1709200000 * 1000).toISOString())
  })

  it('returns empty arrays when agent has no memories or skills', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })

    const result = await getAgentKnowledge(config, 'empty-agent')

    expect(result.agentId).toBe('empty-agent')
    expect(result.agentName).toBe('empty-agent')
    expect(result.agentEmoji).toBe('')
    expect(result.instance).toBe('')
    expect(result.memories).toEqual([])
    expect(result.skills).toEqual([])
  })

  it('throws for invalid agent IDs', async () => {
    await expect(getAgentKnowledge(config, '../etc/passwd')).rejects.toThrow('Invalid agent ID: ../etc/passwd')
    await expect(getAgentKnowledge(config, 'foo bar')).rejects.toThrow('Invalid agent ID: foo bar')
    await expect(getAgentKnowledge(config, '')).rejects.toThrow('Invalid agent ID: ')
  })
})

describe('getFleetKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aggregates knowledge across multiple agents on one instance', async () => {
    // Mock listInstances: one instance
    mockListInstances.mockResolvedValue([
      { id: 'openclaw-hal', label: 'openclaw-hal', ip: '1.2.3.4', providerId: '123', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref', accountId: 'personal' },
    ])

    // Mock resolveInstance: returns resolved instance with sshKey
    mockResolveInstance.mockResolvedValue({
      id: 'openclaw-hal', label: 'openclaw-hal', ip: '1.2.3.4', providerId: '123', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref', accountId: 'personal', sshKey: 'fake-key',
    })

    // Mock listAgents: two agents on the instance
    mockListAgents.mockResolvedValue([
      { id: 'hal', identityName: 'Hal', identityEmoji: '\u{1F916}', workspace: 'default', agentDir: '/home/.openclaw/agents/hal', model: 'gpt-4', isDefault: true },
      { id: 'eve', identityName: 'Eve', identityEmoji: '\u{1F331}', workspace: 'default', agentDir: '/home/.openclaw/agents/eve', model: 'gpt-4', isDefault: false },
    ])

    // Mock loadSettings: no workspace filtering needed
    mockLoadSettings.mockReturnValue({ accounts: {}, workspaces: {} })

    // Mock SSH commands for hal's knowledge
    const halBase = '$HOME/.openclaw/agents/hal'
    const eveBase = '$HOME/.openclaw/agents/eve'

    mockRunCommand.mockImplementation((_cfg: unknown, cmd: string) => {
      // Hal memories
      if (cmd === `ls -1 "${halBase}/memories" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'goal.md\n', stderr: '', code: 0 })
      }
      if (cmd === `ls -1 "${halBase}/skills" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'search.md\ncoding.md\n', stderr: '', code: 0 })
      }
      if (cmd === `cat "${halBase}/memories/goal.md" && echo "___REEF_SEP___" && stat -c '%Y' "${halBase}/memories/goal.md"`) {
        return Promise.resolve({ stdout: 'Be helpful___REEF_SEP___\n1709000000\n', stderr: '', code: 0 })
      }
      if (cmd === `cat "${halBase}/skills/search.md" && echo "___REEF_SEP___" && stat -c '%Y' "${halBase}/skills/search.md"`) {
        return Promise.resolve({ stdout: 'Use grep___REEF_SEP___\n1709100000\n', stderr: '', code: 0 })
      }
      if (cmd === `cat "${halBase}/skills/coding.md" && echo "___REEF_SEP___" && stat -c '%Y' "${halBase}/skills/coding.md"`) {
        return Promise.resolve({ stdout: 'Write code___REEF_SEP___\n1709200000\n', stderr: '', code: 0 })
      }
      // Eve memories
      if (cmd === `ls -1 "${eveBase}/memories" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'personality.md\n', stderr: '', code: 0 })
      }
      if (cmd === `ls -1 "${eveBase}/skills" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'search.md\n', stderr: '', code: 0 })
      }
      if (cmd === `cat "${eveBase}/memories/personality.md" && echo "___REEF_SEP___" && stat -c '%Y' "${eveBase}/memories/personality.md"`) {
        return Promise.resolve({ stdout: 'Be curious___REEF_SEP___\n1709300000\n', stderr: '', code: 0 })
      }
      if (cmd === `cat "${eveBase}/skills/search.md" && echo "___REEF_SEP___" && stat -c '%Y' "${eveBase}/skills/search.md"`) {
        return Promise.resolve({ stdout: 'Use ripgrep___REEF_SEP___\n1709400000\n', stderr: '', code: 0 })
      }
      return Promise.resolve({ stdout: '', stderr: '', code: 1 })
    })

    const result = await getFleetKnowledge()

    expect(result.agents).toHaveLength(2)
    expect(result.totalMemories).toBe(2) // 1 from hal + 1 from eve
    expect(result.totalSkills).toBe(3)   // 2 from hal + 1 from eve

    // skillIndex: search.md should map to both agents
    expect(result.skillIndex['search.md']).toEqual(expect.arrayContaining(['hal', 'eve']))
    expect(result.skillIndex['search.md']).toHaveLength(2)

    // coding.md should only map to hal
    expect(result.skillIndex['coding.md']).toEqual(['hal'])
  })

  it('gracefully handles instance resolution failure', async () => {
    mockListInstances.mockResolvedValue([
      { id: 'openclaw-hal', label: 'openclaw-hal', ip: '1.2.3.4', providerId: '123', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref', accountId: 'personal' },
      { id: 'openclaw-broken', label: 'openclaw-broken', ip: '5.6.7.8', providerId: '456', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref2', accountId: 'personal' },
    ])

    // First instance resolves, second returns null
    mockResolveInstance.mockImplementation((id: string) => {
      if (id === 'openclaw-hal') {
        return Promise.resolve({
          id: 'openclaw-hal', label: 'openclaw-hal', ip: '1.2.3.4', providerId: '123', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref', accountId: 'personal', sshKey: 'fake-key',
        })
      }
      return Promise.resolve(null)
    })

    mockListAgents.mockResolvedValue([
      { id: 'hal', identityName: 'Hal', identityEmoji: '\u{1F916}', workspace: 'default', agentDir: '/home/.openclaw/agents/hal', model: 'gpt-4', isDefault: true },
    ])

    mockLoadSettings.mockReturnValue({ accounts: {}, workspaces: {} })

    // SSH commands for hal
    const halBase = '$HOME/.openclaw/agents/hal'
    mockRunCommand.mockImplementation((_cfg: unknown, cmd: string) => {
      if (cmd === `ls -1 "${halBase}/memories" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: '', stderr: '', code: 0 })
      }
      if (cmd === `ls -1 "${halBase}/skills" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'search.md\n', stderr: '', code: 0 })
      }
      if (cmd === `cat "${halBase}/skills/search.md" && echo "___REEF_SEP___" && stat -c '%Y' "${halBase}/skills/search.md"`) {
        return Promise.resolve({ stdout: 'Use grep___REEF_SEP___\n1709100000\n', stderr: '', code: 0 })
      }
      return Promise.resolve({ stdout: '', stderr: '', code: 1 })
    })

    const result = await getFleetKnowledge()

    // Should only have 1 agent (from the successfully resolved instance)
    expect(result.agents).toHaveLength(1)
    expect(result.agents[0].agentId).toBe('hal')
    expect(result.totalSkills).toBe(1)
    expect(result.totalMemories).toBe(0)
  })
})

describe('findSkill', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns agents that have a specific skill', async () => {
    mockListInstances.mockResolvedValue([
      { id: 'openclaw-hal', label: 'openclaw-hal', ip: '1.2.3.4', providerId: '123', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref', accountId: 'personal' },
    ])

    mockResolveInstance.mockResolvedValue({
      id: 'openclaw-hal', label: 'openclaw-hal', ip: '1.2.3.4', providerId: '123', provider: 'digitalocean', platform: 'openclaw', sshKeyRef: 'op://ref', accountId: 'personal', sshKey: 'fake-key',
    })

    mockListAgents.mockResolvedValue([
      { id: 'hal', identityName: 'Hal', identityEmoji: '\u{1F916}', workspace: 'default', agentDir: '/home/.openclaw/agents/hal', model: 'gpt-4', isDefault: true },
      { id: 'eve', identityName: 'Eve', identityEmoji: '\u{1F331}', workspace: 'default', agentDir: '/home/.openclaw/agents/eve', model: 'gpt-4', isDefault: false },
    ])

    mockLoadSettings.mockReturnValue({ accounts: {}, workspaces: {} })

    const halBase = '$HOME/.openclaw/agents/hal'
    const eveBase = '$HOME/.openclaw/agents/eve'

    mockRunCommand.mockImplementation((_cfg: unknown, cmd: string) => {
      // Hal: has coding.md skill only
      if (cmd === `ls -1 "${halBase}/memories" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: '', stderr: '', code: 0 })
      }
      if (cmd === `ls -1 "${halBase}/skills" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'coding.md\n', stderr: '', code: 0 })
      }
      if (cmd === `cat "${halBase}/skills/coding.md" && echo "___REEF_SEP___" && stat -c '%Y' "${halBase}/skills/coding.md"`) {
        return Promise.resolve({ stdout: 'Write code___REEF_SEP___\n1709200000\n', stderr: '', code: 0 })
      }
      // Eve: has search.md skill only
      if (cmd === `ls -1 "${eveBase}/memories" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: '', stderr: '', code: 0 })
      }
      if (cmd === `ls -1 "${eveBase}/skills" 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'search.md\n', stderr: '', code: 0 })
      }
      if (cmd === `cat "${eveBase}/skills/search.md" && echo "___REEF_SEP___" && stat -c '%Y' "${eveBase}/skills/search.md"`) {
        return Promise.resolve({ stdout: 'Use ripgrep___REEF_SEP___\n1709400000\n', stderr: '', code: 0 })
      }
      return Promise.resolve({ stdout: '', stderr: '', code: 1 })
    })

    const result = await findSkill('coding.md')

    expect(result).toHaveLength(1)
    expect(result[0].agentId).toBe('hal')
    expect(result[0].skills).toHaveLength(1)
    expect(result[0].skills[0].name).toBe('coding.md')

    // search.md should only return eve
    const result2 = await findSkill('search.md')
    expect(result2).toHaveLength(1)
    expect(result2[0].agentId).toBe('eve')
  })
})
