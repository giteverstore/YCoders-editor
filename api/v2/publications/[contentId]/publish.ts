import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runVercelPublicationHandler } from '../../../../src/server/vercelPublicationHandler'
export default async function handler(req: VercelRequest, res: VercelResponse) { const id = Array.isArray(req.query.contentId) ? req.query.contentId[0] : req.query.contentId; await runVercelPublicationHandler(req, res, id, 'publish') }
