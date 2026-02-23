import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunCommand, mockSftpPull } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
  mockSftpPull: vi.fn(),
}))
vi.mock('../ssh', () => ({ runCommand: mockRunCommand, sftpPull: mockSftpPull }))

import { getAgentHealth, runDoctor, backupAgent } from '../openclaw'

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

describe('runDoctor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns openclaw doctor output', async () => {
    mockRunCommand.mockResolvedValueOnce({ stdout: 'Doctor complete.\n', stderr: '', code: 0 })

    const result = await runDoctor(config)
    expect(result.output).toContain('Doctor complete.')
    expect(result.exitCode).toBe(0)
  })

  it('passes --fix flag when requested', async () => {
    mockRunCommand.mockResolvedValueOnce({ stdout: 'Fixed.\n', stderr: '', code: 0 })

    await runDoctor(config, { fix: true })
    expect(mockRunCommand).toHaveBeenCalledWith(config, 'openclaw doctor --fix --non-interactive 2>&1')
  })
})

describe('backupAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('tars the agent dir, pulls it via SFTP, then removes the remote tmp file', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    mockSftpPull.mockResolvedValue(undefined)

    const localPath = '/tmp/hal-backup.tar.gz'
    const remoteTmp = '/tmp/reef-agent-backup-hal.tar.gz'

    await backupAgent(config, 'hal', localPath)

    expect(mockRunCommand).toHaveBeenNthCalledWith(
      1,
      config,
      `tar -czf ${remoteTmp} -C $HOME/.openclaw/agents hal`
    )
    expect(mockSftpPull).toHaveBeenCalledWith(config, remoteTmp, localPath)
    expect(mockRunCommand).toHaveBeenNthCalledWith(2, config, `rm ${remoteTmp}`)
  })
})
