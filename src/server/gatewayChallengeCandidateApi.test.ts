import { describe, expect, it, vi } from 'vitest'
import { handleGatewayChallengeCandidateApi } from './gatewayChallengeCandidateApi'
import { GatewayServiceAuthError } from './gatewayServiceAuth'

const candidate = { title:'Eligible',namespace:'v2' as const,contentType:'practice' as const,contentId:'2d075567-672e-4f73-8dfa-f66871fc30ad',activePublicationVersion:1,state:'published' as const,discoverable:true,difficulty:'beginner' as const,topics:['basics'],executionCompatible:true,publicTestsValid:true,supportedLanguages:['javascript'],learnerDtoReady:true }

describe('service-authenticated Challenge candidate gateway',()=>{
  it('returns exactly the canonical safe C4 projection',async()=>{const verify=vi.fn(async()=>({serviceId:'learner',environment:'staging',correlationId:'c'}));const result=await handleGatewayChallengeCandidateApi({method:'GET',path:'/api/v2/gateway/challenge-candidates',authorization:'Bearer token',correlationId:'c'},{verifier:{verify},source:{list:async()=>[candidate]}});expect(result).toEqual({status:200,body:{ok:true,data:[candidate]}});expect(JSON.stringify(result)).not.toMatch(/starter|testPayload|referenceSolution|objectPath|draftRevision/i)});
  it('rejects missing service identity and fails closed on source errors',async()=>{const denied=await handleGatewayChallengeCandidateApi({method:'GET',path:'/api/v2/gateway/challenge-candidates'},{verifier:{verify:async()=>{throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHENTICATED','required')}},source:{list:async()=>[]}});expect(denied.status).toBe(401);const unavailable=await handleGatewayChallengeCandidateApi({method:'GET',path:'/api/v2/gateway/challenge-candidates'},{verifier:{verify:async()=>({serviceId:'x',environment:'staging',correlationId:'c'})},source:{list:async()=>{throw new Error('offline')}}});expect(unavailable).toMatchObject({status:503,body:{error:{code:'CHALLENGE_CANDIDATES_UNAVAILABLE'}}})});
})
