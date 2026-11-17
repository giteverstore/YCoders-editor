import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MAX_EDITOR_VERCEL_FUNCTIONS = 6

describe('Vercel function budget', () => {
  it('keeps the consolidated API below the guarded limit', () => {
    const functions = readdirSync('api', { recursive: true })
      .filter((entry) => typeof entry === 'string' && entry.endsWith('.ts'))

    expect(functions).toHaveLength(2)
    expect(functions.length).toBeLessThanOrEqual(MAX_EDITOR_VERCEL_FUNCTIONS)
  })
})
