import type { ChallengeCandidateSource } from './challengeCandidateService.js'
import { GatewayServiceAuthError, type GatewayServiceVerifier } from './gatewayServiceAuth.js'

export type GatewayChallengeCandidateRequest = { authorization?: string; correlationId?: string; method: string; path: string }

export async function handleGatewayChallengeCandidateApi(request: GatewayChallengeCandidateRequest, dependencies: { verifier: GatewayServiceVerifier; source: ChallengeCandidateSource }) {
  try {
    if (request.method !== 'GET') return { status: 405, body: { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET for Challenge candidates' } } }
    await dependencies.verifier.verify(request)
    const candidates = await dependencies.source.list()
    return { status: 200, body: { ok: true, data: candidates } }
  } catch (error) {
    if (error instanceof GatewayServiceAuthError) return { status: error.status, body: { ok: false, error: { code: error.code, message: error.message } } }
    return { status: 503, body: { ok: false, error: { code: 'CHALLENGE_CANDIDATES_UNAVAILABLE', message: 'Authoritative Practice candidates are unavailable' } } }
  }
}

