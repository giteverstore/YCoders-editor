import type { VercelRequest, VercelResponse } from '@vercel/node'

import { runV2AdminRouter } from '../../src/server/vercelV2AdminRouter'

export default function handler(request: VercelRequest, response: VercelResponse) {
  return runV2AdminRouter(request, response)
}
