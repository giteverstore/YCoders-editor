import { describe, expect, it } from 'vitest'

import { getReleaseDomainStatus } from './releaseDomains'

describe('Course + Practice release domains', () => {
  it('enables Course and Practice only', () => {
    expect(getReleaseDomainStatus('courses')).toBe('enabled')
    expect(getReleaseDomainStatus('practice')).toBe('enabled')
    expect(getReleaseDomainStatus('challenges')).toBe('work-in-progress')
    expect(getReleaseDomainStatus('projects')).toBe('work-in-progress')
  })
})
