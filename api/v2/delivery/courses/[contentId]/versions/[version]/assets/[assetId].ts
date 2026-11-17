import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runCourseDeliveryHandler } from '../../../../../../../../src/server/vercelCourseDeliveryHandler'
export default (request: VercelRequest, response: VercelResponse) => runCourseDeliveryHandler(request, response, 'asset')
