import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunCommand } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
}))
vi.mock('../ssh', () => ({ runCommand: mockRunCommand }))

import { getHealth, listAgents, listDirectory, runHygieneCheck, sendChatMessage } from '../openclaw'

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
  it('returns agent names from ~/.openclaw/agents/', async () => {
    mockRunCommand.mockResolvedValue({ stdout: 'hal\nmarvin\n', stderr: '', code: 0 })
    const result = await listAgents(config)
    expect(result).toEqual(['hal', 'marvin'])
  })

  it('returns empty array when agents directory is empty', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    const result = await listAgents(config)
    expect(result).toEqual([])
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

describe('runHygieneCheck', () => {
  it('returns stdout from the openclaw check command', async () => {
    mockRunCommand.mockResolvedValue({ stdout: 'All checks passed\n', stderr: '', code: 0 })
    const result = await runHygieneCheck(config)
    expect(result).toContain('All checks passed')
  })
})

describe('sendChatMessage', () => {
  it('returns the response from the OpenClaw agent', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: '{"reply": "Hello from hal"}',
      stderr: '',
      code: 0,
    })
    const result = await sendChatMessage(config, 'hal', 'Hello')
    expect(result).toContain('Hello from hal')
  })
})
