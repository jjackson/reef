import { describe, it, expect, vi } from 'vitest'

vi.mock('../settings', () => ({
  getGlobalNameMap: vi.fn(() => ({
    'open-claw-hal': 'hal-override',
    'dot-openclaw': 'Dot',
  })),
}))

import { getBotName } from '../mapping'

describe('getBotName', () => {
  it('uses explicit map entry when present', () => {
    expect(getBotName('open-claw-hal')).toBe('hal-override')
  })

  it('uses explicit map entry for suffix-pattern names', () => {
    expect(getBotName('dot-openclaw')).toBe('Dot')
  })

  it('auto-derives by stripping open-claw- prefix', () => {
    expect(getBotName('open-claw-marvin')).toBe('marvin')
  })

  it('auto-derives by stripping openclaw- prefix', () => {
    expect(getBotName('openclaw-zaphod')).toBe('zaphod')
  })

  it('auto-derives by stripping -openclaw suffix', () => {
    expect(getBotName('zara-openclaw')).toBe('zara')
  })

  it('auto-derives by stripping -open-claw suffix', () => {
    expect(getBotName('zara-open-claw')).toBe('zara')
  })

  it('ignores __comment keys', () => {
    expect(getBotName('__comment')).toBeNull()
  })
})
