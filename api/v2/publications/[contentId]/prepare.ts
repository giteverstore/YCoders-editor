import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runVercelPublicationHandler } from '../../../../src/server/vercelPublicationHandler'

export default (request: VercelRequest, response: VercelResponse) => runVercelPublicationHandler(request, response, String(request.query.contentId), 'prepare')
