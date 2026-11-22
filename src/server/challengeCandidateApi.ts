import { authenticateAdmin, AuthenticationError, AuthorizationError, type TokenVerifier } from './auth.server.js'
import type { ChallengeCandidateSource } from './challengeCandidateService.js'

type Result = { status: number; body: { ok: boolean; data?: unknown; error?: { code: string; message: string } } }
export async function handleChallengeCandidateApi(request: { method: string; authorization?: string }, dependencies: { verifier: TokenVerifier; source: ChallengeCandidateSource }): Promise<Result> {
  try {
    if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Use GET for Challenge candidates')
    await authenticateAdmin(request.authorization, 'draft:write', dependencies.verifier)
    return { status: 200, body: { ok: true, data: await dependencies.source.list() } }
  } catch (error) {
    if (error instanceof AuthenticationError) return fail(401, 'AUTHENTICATION_REQUIRED', error.message)
    if (error instanceof AuthorizationError) return fail(403, 'PERMISSION_DENIED', error.message)
    return fail(503, 'challenge-policy.candidate-source-unavailable', 'Authoritative Practice candidate metadata is unavailable')
  }
}
const fail = (status: number, code: string, message: string): Result => ({ status, body: { ok: false, error: { code, message } } })
