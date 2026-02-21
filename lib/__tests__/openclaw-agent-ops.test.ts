import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunCommand } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
}))
vi.mock('../ssh', () => ({ runCommand: mockRunCommand, sftpPull: vi.fn() }))

import { getAgentHealth, runAgentHygieneCheck, backupAgent } from '../openclaw'

const config = { host: '1.2.3.4', privateKey: 'fake-key' }

describe('getAgentHealth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns health data for an existing agent', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: 'exists\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '1.2G\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '1708000000.000\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'running\n', stderr: '', code: 0 })

    const result = await getAgentHealth(config, 'hal')
    expect(result.exists).toBe(true)
    expect(result.dirSize).toBe('1.2G')
    expect(result.processRunning).toBe(true)
  })

  it('returns exists: false for a missing agent', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: 'missing\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '0\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '0\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'stopped\n', stderr: '', code: 0 })

    const result = await getAgentHealth(config, 'nonexistent')
    expect(result.exists).toBe(false)
    expect(result.processRunning).toBe(false)
  })
})

describe('runAgentHygieneCheck', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns hygiene metrics', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '5\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '3\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '1.2G\n', stderr: '', code: 0 })

    const result = await runAgentHygieneCheck(config, 'hal')
    expect(result.errorCount).toBe(5)
    expect(result.staleFileCount).toBe(3)
    expect(result.dirSize).toBe('1.2G')
  })
})

describe('backupAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs tar and cleanup commands', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })

    await backupAgent(config, 'hal', '/tmp/hal-backup.tar.gz')
    expect(mockRunCommand).toHaveBeenCalledWith(config, expect.stringContaining('tar'))
    expect(mockRunCommand).toHaveBeenCalledWith(config, expect.stringContaining('rm'))
  })
})
