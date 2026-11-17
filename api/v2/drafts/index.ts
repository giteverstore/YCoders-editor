import type { VercelRequest, VercelResponse } from '@vercel/node'

import { runVercelDraftHandler } from '../../../src/server/vercelDraftHandler'

export default async function handler(request: VercelRequest, response: VercelResponse) { await runVercelDraftHandler(request, response) }
