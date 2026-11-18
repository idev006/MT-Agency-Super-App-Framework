import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

describe('native daisyUI component sizing', () => {
  it('does not impose a global minimum height on inputs and buttons', () => {
    const rule = css.match(/button,\s*input,\s*select,\s*textarea\s*\{([^}]*)\}/)
    expect(rule?.[1]).toBeTruthy()
    expect(rule[1]).not.toContain('min-height')
    expect(rule[1]).toContain('font: inherit')
  })

  it('does not override DaisyUI component namespace for form layout', () => {
    expect(css).not.toMatch(/\.form-control\s*\{/)
    expect(css).toMatch(/\.field-stack\s*\{/)
  })
})
