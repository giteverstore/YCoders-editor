import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runVercelPublicationHandler } from '../../../../../src/server/vercelPublicationHandler'
export default async function handler(req: VercelRequest, res: VercelResponse) { const id = Array.isArray(req.query.contentId) ? req.query.contentId[0] : req.query.contentId, version = Array.isArray(req.query.version) ? req.query.version[0] : req.query.version; await runVercelPublicationHandler(req, res, id, 'versions', version) }
