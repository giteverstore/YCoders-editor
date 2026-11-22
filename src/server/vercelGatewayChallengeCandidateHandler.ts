import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getChallengeCandidateServerDependencies } from './firebaseAdmin.server.js'
import { handleGatewayChallengeCandidateApi } from './gatewayChallengeCandidateApi.js'
import { createGatewayServiceVerifier } from './gatewayServiceAuth.js'

export async function runGatewayChallengeCandidateHandler(request: VercelRequest, response: VercelResponse) {
  const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined
  const correlationId = typeof request.headers['x-correlation-id'] === 'string' ? request.headers['x-correlation-id'] : undefined
  const result = await handleGatewayChallengeCandidateApi({ authorization, correlationId, method: request.method ?? 'GET', path: request.url?.split('?')[0] ?? '/' }, { verifier: createGatewayServiceVerifier(), source: getChallengeCandidateServerDependencies().source })
  response.status(result.status).json(result.body)
}

