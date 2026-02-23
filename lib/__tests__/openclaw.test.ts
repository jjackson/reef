import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunCommand } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
}))
vi.mock('../ssh', () => ({ runCommand: mockRunCommand }))

import { getHealth, listAgents, listDirectory, sendChatMessage, restartOpenClaw } from '../openclaw'

const config = { host: '1.2.3.4', privateKey: 'fake-key' }

describe('getHealth', () => {
  it('returns processRunning: true when systemctl says active', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: 'active\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '/ 20G 8G 12G 40%', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'Mem: 2G 1G 1G', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'up 3 days', stderr: '', code: 0 })

    const result = await getHealth(config)
    expect(result.processRunning).toBe(true)
    expect(result.uptime).toBe('up 3 days')
  })

  it('returns processRunning: false when process is not running', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: 'inactive\n', stderr: '', code: 1 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })

    const result = await getHealth(config)
    expect(result.processRunning).toBe(false)
  })
})

describe('listAgents', () => {
  it('parses structured JSON from openclaw agents list --json', async () => {
    const jsonOutput = JSON.stringify([
      { id: 'main', identityName: 'Hal', identityEmoji: '🤖', workspace: '/root/.openclaw/workspace', agentDir: '/root/.openclaw/agents/main/agent', model: 'anthropic/claude-opus-4-6', isDefault: true },
    ])
    mockRunCommand.mockResolvedValue({ stdout: jsonOutput, stderr: '', code: 0 })
    const result = await listAgents(config)
    expect(result).toEqual([
      { id: 'main', identityName: 'Hal', identityEmoji: '🤖', workspace: '/root/.openclaw/workspace', agentDir: '/root/.openclaw/agents/main/agent', model: 'anthropic/claude-opus-4-6', isDefault: true },
    ])
  })

  it('falls back to ls when openclaw CLI is unavailable', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '', stderr: 'command not found', code: 1 }) // openclaw agents list --json
      .mockResolvedValueOnce({ stdout: 'hal\nmarvin\n', stderr: '', code: 0 })     // ls fallback
    const result = await listAgents(config)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('hal')
    expect(result[0].identityName).toBe('hal')
    expect(result[1].id).toBe('marvin')
  })

})

describe('listDirectory', () => {
  it('distinguishes files from directories using trailing slash', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: 'memories/\nskills/\nconfig.json\n',
      stderr: '',
      code: 0,
    })
    const result = await listDirectory(config, '~/.openclaw/agents/hal')
    expect(result).toEqual([
      { name: 'memories', type: 'directory' },
      { name: 'skills', type: 'directory' },
      { name: 'config.json', type: 'file' },
    ])
  })

  it('returns empty array when directory is empty or missing', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    const result = await listDirectory(config, '~/.openclaw/agents/hal/memories')
    expect(result).toEqual([])
  })
})

describe('sendChatMessage', () => {
  it('parses structured JSON response from openclaw CLI', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: JSON.stringify({ reply: 'Hello from hal', agentId: 'main', model: 'anthropic/claude-opus-4-6', sessionId: 'abc123' }),
      stderr: '',
      code: 0,
    })
    const result = await sendChatMessage(config, 'hal', 'Hello')
    expect(result.reply).toBe('Hello from hal')
    expect(result.agentId).toBe('main')
    expect(result.model).toBe('anthropic/claude-opus-4-6')
  })

  it('falls back to plain text when output is not JSON', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: 'Hello, I am hal!',
      stderr: '',
      code: 0,
    })
    const result = await sendChatMessage(config, 'hal', 'Hello')
    expect(result.reply).toBe('Hello, I am hal!')
    expect(result.agentId).toBe('hal')
  })
})

describe('restartOpenClaw', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns success via systemd when service restarts cleanly', async () => {
    // systemctl restart succeeds (code 0), then is-active returns active
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }) // systemctl restart
      .mockResolvedValueOnce({ stdout: 'active\n', stderr: '', code: 0 }) // is-active check

    const resultPromise = restartOpenClaw(config)
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.success).toBe(true)
    expect(result.method).toBe('systemd')
  })

  it('returns success: false via systemd when service does not come up', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }) // systemctl restart
      .mockResolvedValueOnce({ stdout: 'failed\n', stderr: '', code: 1 }) // is-active check

    const resultPromise = restartOpenClaw(config)
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.success).toBe(false)
    expect(result.method).toBe('systemd')
  })

  it('falls back to process-kill when systemd is unavailable', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '', stderr: 'Failed to connect to bus', code: 1 }) // systemctl fails
      .mockResolvedValueOnce({ stdout: 'killed\n', stderr: '', code: 0 }) // pkill+check

    const result = await restartOpenClaw(config)
    expect(result.success).toBe(true)
    expect(result.method).toBe('process-kill')
  })

  it('reports failure when process-kill cannot kill the process', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '', stderr: 'No such service', code: 1 }) // systemctl fails
      .mockResolvedValueOnce({ stdout: 'still_running\n', stderr: '', code: 0 }) // process still alive

    const result = await restartOpenClaw(config)
    expect(result.success).toBe(false)
    expect(result.method).toBe('process-kill')
  })
})
