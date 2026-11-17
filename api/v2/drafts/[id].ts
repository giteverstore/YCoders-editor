import type { VercelRequest, VercelResponse } from '@vercel/node'

import { runVercelDraftHandler } from '../../../src/server/vercelDraftHandler'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const id = Array.isArray(request.query.id) ? request.query.id[0] : request.query.id
  await runVercelDraftHandler(request, response, id)
}
