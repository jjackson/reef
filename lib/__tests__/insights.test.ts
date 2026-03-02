import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunCommand } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
}))
vi.mock('../ssh', () => ({ runCommand: mockRunCommand }))

import { getAgentKnowledge } from '../insights'

const config = { host: '1.2.3.4', privateKey: 'fake-key' }

describe('getAgentKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns memories and skills for an agent', async () => {
    // ls memories
    mockRunCommand.mockImplementation((_cfg: unknown, cmd: string) => {
      const base = '$HOME/.openclaw/agents/hal'
      if (cmd === `ls -1 ${base}/memories 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'goal.md\nhabits.md\n', stderr: '', code: 0 })
      }
      if (cmd === `ls -1 ${base}/skills 2>/dev/null || true`) {
        return Promise.resolve({ stdout: 'search.md\n', stderr: '', code: 0 })
      }
      // cat memory files
      if (cmd === `cat ${base}/memories/goal.md`) {
        return Promise.resolve({ stdout: 'Be helpful', stderr: '', code: 0 })
      }
      if (cmd === `cat ${base}/memories/habits.md`) {
        return Promise.resolve({ stdout: 'Check daily', stderr: '', code: 0 })
      }
      // cat skill files
      if (cmd === `cat ${base}/skills/search.md`) {
        return Promise.resolve({ stdout: 'Use grep', stderr: '', code: 0 })
      }
      // stat memory files
      if (cmd === `stat -c '%Y' ${base}/memories/goal.md`) {
        return Promise.resolve({ stdout: '1709000000\n', stderr: '', code: 0 })
      }
      if (cmd === `stat -c '%Y' ${base}/memories/habits.md`) {
        return Promise.resolve({ stdout: '1709100000\n', stderr: '', code: 0 })
      }
      // stat skill files
      if (cmd === `stat -c '%Y' ${base}/skills/search.md`) {
        return Promise.resolve({ stdout: '1709200000\n', stderr: '', code: 0 })
      }
      return Promise.resolve({ stdout: '', stderr: '', code: 1 })
    })

    const result = await getAgentKnowledge(config, 'hal', 'Hal', '🤖', 'openclaw-hal')

    expect(result.instance).toBe('openclaw-hal')
    expect(result.agentId).toBe('hal')
    expect(result.agentName).toBe('Hal')
    expect(result.agentEmoji).toBe('🤖')
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
})
