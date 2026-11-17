import { runGatewayCourseDeliveryHandler } from '../../../../src/server/vercelGatewayCourseDeliveryHandler'
export default async function handler(request: Parameters<typeof runGatewayCourseDeliveryHandler>[0], response: Parameters<typeof runGatewayCourseDeliveryHandler>[1]) { return runGatewayCourseDeliveryHandler(request, response, 'active') }
