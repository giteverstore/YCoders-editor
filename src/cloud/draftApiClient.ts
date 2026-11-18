import type { ContentDocument, ContentType } from '../content/core/envelope'
import type { CloudDraftRecord, CloudDraftSummary } from '../server/cloudDraft.types'

export class DraftApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) { super(message); this.name = 'DraftApiError' }
}

type TokenProvider = (forceRefresh?: boolean) => Promise<string>
type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } }

export class V2DraftApiClient {
  constructor(private readonly getToken: TokenProvider, private readonly baseUrl = '/api/v2/drafts', private readonly request: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  list(contentType: ContentType = 'course'): Promise<CloudDraftSummary[]> { return this.call<CloudDraftSummary[]>(`?contentType=${contentType}`, { method: 'GET' }) }
  get(id: string): Promise<CloudDraftRecord> { return this.call<CloudDraftRecord>(`/${encodeURIComponent(id)}`, { method: 'GET' }) }
  create(document: ContentDocument): Promise<CloudDraftRecord> { return this.call<CloudDraftRecord>('', { method: 'POST', body: JSON.stringify({ document }) }) }
  save(id: string, document: ContentDocument, expectedRevision: number): Promise<CloudDraftRecord> { return this.call<CloudDraftRecord>(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ document, expectedRevision }) }) }
  delete(id: string, expectedRevision: number): Promise<void> { return this.call<{ deleted: true }>(`/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedRevision }) }).then(() => undefined) }

  private async call<T>(path: string, init: RequestInit, retried = false): Promise<T> {
    const token = await this.getToken(retried)
    const response = await this.request(`${this.baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
    if (response.status === 401 && !retried) return this.call<T>(path, init, true)
    let envelope: ApiEnvelope<T>
    try { envelope = await response.json() as ApiEnvelope<T> } catch { throw new DraftApiError(response.status, 'INVALID_RESPONSE', 'The draft API returned an invalid response') }
    if (!response.ok || !envelope.ok) { const error = envelope.ok ? { code: 'HTTP_ERROR', message: 'Draft API request failed' } : envelope.error; throw new DraftApiError(response.status, error.code, error.message, 'details' in error ? error.details : undefined) }
    return envelope.data
  }
}
