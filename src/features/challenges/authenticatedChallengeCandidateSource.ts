import type { ChallengeCandidateSource, PracticeCandidateSummary } from './challengePolicyPreview'

export class AuthenticatedChallengeCandidateSource implements ChallengeCandidateSource {
  constructor(private readonly getIdToken: () => Promise<string>) {}
  async listSafeCandidates(): Promise<readonly PracticeCandidateSummary[]> {
    const token = await this.getIdToken()
    const response = await fetch('/api/v2/challenge-candidates', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    const body = await response.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: { message?: string } } | null
    if (!response.ok || body?.ok !== true || !Array.isArray(body.data)) throw new Error(body?.error?.message ?? 'Authoritative Practice candidate metadata is unavailable.')
    return body.data as PracticeCandidateSummary[]
  }
}
