import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleChallengeCandidateApi } from './challengeCandidateApi.js'
import { getChallengeCandidateServerDependencies } from './firebaseAdmin.server.js'

export async function runVercelChallengeCandidateHandler(request: VercelRequest, response: VercelResponse) {
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  const result = await handleChallengeCandidateApi({ method: request.method ?? 'GET', authorization }, getChallengeCandidateServerDependencies())
  response.status(result.status).setHeader('Cache-Control', 'private, no-store').json(result.body)
}
