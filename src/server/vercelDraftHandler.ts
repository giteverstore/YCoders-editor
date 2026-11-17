import type { VercelRequest, VercelResponse } from '@vercel/node'

import { handleDraftApi } from './draftApi.js'
import { getServerDependencies } from './firebaseAdmin.server.js'

export async function runVercelDraftHandler(request: VercelRequest, response: VercelResponse, id?: string): Promise<void> {
  try {
    const authorization = singleHeader(request.headers.authorization)
    const contentType = singleHeader(request.headers['content-type'])
    const contentLengthValue = singleHeader(request.headers['content-length'])
    const draftType = Array.isArray(request.query.contentType) ? request.query.contentType[0] : request.query.contentType
    const result = await handleDraftApi({ method: request.method ?? 'GET', authorization, contentType, draftType, contentLength: contentLengthValue ? Number(contentLengthValue) : undefined, body: request.body, id }, getServerDependencies())
    response.status(result.status).json(result.body)
  } catch {
    response.status(503).json({ ok: false, error: { code: 'BACKEND_UNAVAILABLE', message: 'The secure draft backend is not configured or is temporarily unavailable' } })
  }
}

function singleHeader(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value }
