import { describe, expect, it, vi } from 'vitest'
import { CourseDeliveryService, DEFAULT_COURSE_CATALOG_LIMIT, MAX_COURSE_CATALOG_LIMIT, normalizeCourseCatalogLimit } from './courseDelivery'
import { handleGatewayCourseDeliveryApi } from './gatewayCourseDeliveryApi'

const releasedA = '10000000-0000-4000-8000-000000000001'
const releasedB = '10000000-0000-4000-8000-000000000002'
const records = [
  { contentId: releasedA, contentType: 'course', state: 'published', visibility: 'public', activeVersionNumber: 2, updatedAt: '2026-11-25T12:00:00.000Z' },
  { contentId: releasedB, contentType: 'course', state: 'published', visibility: 'public', activeVersionNumber: 4, updatedAt: '2026-11-25T12:00:00.000Z' },
  { contentId: '10000000-0000-4000-8000-000000000003', contentType: 'course', state: 'published', visibility: 'private', activeVersionNumber: 5, updatedAt: '2026-11-26T12:00:00.000Z' },
  { contentId: '10000000-0000-4000-8000-000000000004', contentType: 'course', state: 'draft', visibility: 'private', activeVersionNumber: null, updatedAt: '2026-11-27T12:00:00.000Z' },
  { contentId: '10000000-0000-4000-8000-000000000005', contentType: 'course', state: 'archived', visibility: 'hidden', activeVersionNumber: null, updatedAt: '2026-11-28T12:00:00.000Z' },
  { contentId: '10000000-0000-4000-8000-000000000006', contentType: 'practice', state: 'published', visibility: 'public', activeVersionNumber: 1, updatedAt: '2026-11-29T12:00:00.000Z' },
]

function firestore() {
  let values = [...records], maximum = 100
  const query = {
    where(field: string, _operator: string, value: unknown) { values = values.filter((record) => record[field as keyof typeof record] === value); return query },
    orderBy(field: unknown, direction = 'asc') { if (typeof field === 'string') values.sort((a, b) => direction === 'desc' ? String(b[field as keyof typeof b]).localeCompare(String(a[field as keyof typeof a])) : String(a[field as keyof typeof a]).localeCompare(String(b[field as keyof typeof b]))); else values.sort((a, b) => a.contentId.localeCompare(b.contentId)); return query },
    limit(value: number) { maximum = value; return query },
    async get() { return { docs: values.slice(0, maximum).map((data) => ({ id: data.contentId, data: () => data })) } },
  }
  return { collection: vi.fn(() => query) }
}

describe('released Course catalog', () => {
  it('returns only released public Courses in deterministic release-time/content-ID order with exact active versions', async () => {
    const service = new CourseDeliveryService(firestore() as never, {} as never)
    vi.spyOn(service, 'exact').mockImplementation(async (contentId, version) => ({ namespace: 'v2', contentType: 'course', contentId, publicationVersion: version, integrity: {} as never, warnings: [], course: { title: contentId === releasedA ? 'Alpha' : 'Beta', description: `${contentId} summary`, language: 'javascript', difficulty: 'beginner', estimatedMinutes: 30, courseIcon: contentId === releasedA ? { kind: 'versioned-v2-asset', namespace: 'v2', contentId, publicationVersion: version, assetId: '20000000-0000-4000-8000-000000000001', deliveryKey: `v2:${contentId}:v${version}:asset:icon` } : null } }))
    const result = await service.catalog(10)
    expect(result.items.map(({ contentId, publicationVersion }) => ({ contentId, publicationVersion }))).toEqual([{ contentId: releasedA, publicationVersion: 2 }, { contentId: releasedB, publicationVersion: 4 }])
    expect(result.items[0]).toMatchObject({ title: 'Alpha', description: `${releasedA} summary`, courseIcon: { kind: 'versioned-v2-asset', publicationVersion: 2 }, releasedAt: '2026-11-25T12:00:00.000Z' })
    expect(JSON.stringify(result)).not.toMatch(/draft|revision|publishedObjectPath|updatedBy|artifact/i)
  })

  it('bounds catalog reads and reports the effective limit', async () => {
    expect(normalizeCourseCatalogLimit(undefined)).toBe(DEFAULT_COURSE_CATALOG_LIMIT)
    expect(normalizeCourseCatalogLimit('999')).toBe(MAX_COURSE_CATALOG_LIMIT)
    expect(normalizeCourseCatalogLimit('invalid')).toBe(DEFAULT_COURSE_CATALOG_LIMIT)
    const service = new CourseDeliveryService(firestore() as never, {} as never)
    vi.spyOn(service, 'exact').mockImplementation(async (contentId, version) => ({ namespace: 'v2', contentType: 'course', contentId, publicationVersion: version, integrity: {} as never, warnings: [], course: { title: 'Course', description: '', language: 'javascript', difficulty: 'beginner', estimatedMinutes: 1, courseIcon: null } }))
    expect((await service.catalog(1)).page).toEqual({ limit: 1, count: 1 })
  })

  it('exposes a service-authenticated read-only gateway route without Editor admin authorization', async () => {
    const catalog = vi.fn(async () => ({ namespace: 'v2', contentType: 'course', items: [], page: { limit: 24, count: 0 } }))
    const verifier = { verify: vi.fn(async () => ({ serviceId: 'ycoders-learner-gateway', environment: 'production', correlationId: 'catalog-request' })) }
    const request = { authorization: 'ServiceAssertion signed', correlationId: 'catalog-request', method: 'GET', path: '/api/v2/gateway/courses', kind: 'catalog' as const }
    const result = await handleGatewayCourseDeliveryApi(request, { verifier, service: { catalog } as never })
    expect(result).toMatchObject({ status: 200, headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }, body: { data: { items: [], page: { limit: 24, count: 0 } } } })
    expect(catalog).toHaveBeenCalledWith(24)
    expect(await handleGatewayCourseDeliveryApi({ ...request, method: 'POST' }, { verifier, service: { catalog } as never })).toMatchObject({ status: 405, body: { error: { code: 'V2_METHOD_NOT_ALLOWED' } } })
  })
})
