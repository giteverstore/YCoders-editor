import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getCourseDeliveryServerDependencies } from './firebaseAdmin.server.js'
import { handleCourseDeliveryApi, type DeliveryApiRequest } from './courseDeliveryApi.js'

export async function runCourseDeliveryHandler(request: VercelRequest, response: VercelResponse, kind: DeliveryApiRequest['kind']) {
  try {
    const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
    const value = (name: string) => Array.isArray(request.query[name]) ? request.query[name]![0] : request.query[name]
    const result = await handleCourseDeliveryApi({ authorization, contentId: value('contentId'), version: value('version'), assetId: value('assetId'), kind }, getCourseDeliveryServerDependencies())
    Object.entries(result.headers).forEach(([name, header]) => response.setHeader(name, header))
    if (result.bytes) response.status(result.status).send(Buffer.from(result.bytes)); else response.status(result.status).json(result.body)
  } catch { response.status(503).setHeader('Cache-Control', 'private, no-store').json({ ok: false, error: { code: 'V2_DELIVERY_FAILURE', message: 'Private V2 Course delivery is unavailable' } }) }
}
