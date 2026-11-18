import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPublicationServerDependencies } from './firebaseAdmin.server.js'
import { handlePublicationApi } from './publicationApi.js'

export async function runVercelPublicationHandler(request: VercelRequest, response: VercelResponse, contentId?: string, action?: 'prepare' | 'publish' | 'versions' | 'integrity' | 'release' | 'rollback' | 'unpublish' | 'republish' | 'disable' | 'enable' | 'archive', version?: string) {
  try {
    const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
    const result = await handlePublicationApi({ method: request.method ?? 'GET', authorization, contentId, action, version, body: request.body }, getPublicationServerDependencies())
    response.status(result.status).json(result.body)
  } catch { response.status(503).json({ ok: false, error: { code: 'BACKEND_UNAVAILABLE', message: 'Publication backend is unavailable' } }) }
}
