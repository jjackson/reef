import { describe, it, expect, vi } from 'vitest'

vi.mock('@/config/name-map.json', () => ({
  default: {
    '__comment': 'ignored',
    'open-claw-hal': 'hal',
    'open-claw-marvin': 'marvin',
  }
}))

import { getBotName } from '../mapping'

describe('getBotName', () => {
  it('returns bot name for a known droplet', () => {
    expect(getBotName('open-claw-hal')).toBe('hal')
  })

  it('returns bot name for another known droplet', () => {
    expect(getBotName('open-claw-marvin')).toBe('marvin')
  })

  it('returns null for an unknown droplet', () => {
    expect(getBotName('open-claw-unknown')).toBeNull()
  })

  it('ignores __comment keys', () => {
    expect(getBotName('__comment')).toBeNull()
  })
})
