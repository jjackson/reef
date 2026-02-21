import { describe, it, expect, vi } from 'vitest'

vi.mock('ssh2', () => {
  const makeStream = (stdout: string, exitCode: number) => {
    const handlers: Record<string, Function> = {}
    const stderrHandlers: Record<string, Function> = {}

    const stream = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
        if (event === 'close') {
          Promise.resolve().then(() => {
            stderrHandlers['data']?.(Buffer.from(''))
            handlers['data']?.(Buffer.from(stdout))
            handlers['close']?.(exitCode)
          })
        }
        return stream
      }),
      stderr: {
        on: vi.fn((event: string, handler: Function) => {
          stderrHandlers[event] = handler
          return stream.stderr
        }),
      },
    }
    return stream
  }

  class Client {
    _handlers: Record<string, Function> = {}
    exec = vi.fn((_cmd: string, cb: Function) => {
      cb(null, makeStream('command output\n', 0))
    })
    connect = vi.fn()
    end = vi.fn()
    on(event: string, handler: Function) {
      this._handlers[event] = handler
      if (event === 'ready') Promise.resolve().then(() => handler())
      return this
    }
  }

  return { Client }
})

import { runCommand } from '../ssh'

describe('runCommand', () => {
  it('resolves with stdout and exit code 0', async () => {
    const result = await runCommand(
      { host: '1.2.3.4', privateKey: 'fake-key' },
      'echo hello'
    )
    expect(result.stdout).toBe('command output\n')
    expect(result.code).toBe(0)
  })
})
