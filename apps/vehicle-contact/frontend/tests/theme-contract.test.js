import { describe, expect, it } from 'vitest'
import { themes } from '../src/stores/ui.js'

describe('DaisyUI theme contract', () => {
  it('exposes the complete approved DaisyUI 5.8 theme registry without duplicates', () => {
    expect(themes).toHaveLength(35)
    expect(new Set(themes).size).toBe(themes.length)
    expect(themes).toContain('light')
    expect(themes).toContain('dark')
    expect(themes).toContain('corporate')
    expect(themes).toContain('fantasy')
  })
})
