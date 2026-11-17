import type { VercelRequest, VercelResponse } from '@vercel/node'

import { runV2GatewayRouter } from '../../src/server/vercelV2GatewayRouter.js'

export default function handler(request: VercelRequest, response: VercelResponse) {
  return runV2GatewayRouter(request, response)
}
