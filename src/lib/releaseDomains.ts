import type { DomainDefinition } from './domains'

export type ReleaseDomainStatus = 'enabled' | 'work-in-progress'

export const RELEASE_DOMAIN_STATUS: Readonly<Record<DomainDefinition['slug'], ReleaseDomainStatus>> = {
  courses: 'enabled',
  practice: 'enabled',
  challenges: 'work-in-progress',
  projects: 'work-in-progress',
}

export function getReleaseDomainStatus(slug: DomainDefinition['slug']): ReleaseDomainStatus {
  return RELEASE_DOMAIN_STATUS[slug]
}
