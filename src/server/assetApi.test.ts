import { describe, expect, it, vi } from 'vitest'
import { handleAssetApi } from './assetApi'
import type { AssetRepository } from './assetRepository'
const png=()=>{const b=new Uint8Array(24);b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);b[19]=1;b[23]=1;return Buffer.from(b).toString('base64')}
const repo={create:vi.fn(async x=>({...x,createdAt:new Date().toISOString(),status:'ready'as const})),list:vi.fn(async()=>[]),get:vi.fn(async()=>null),bytes:vi.fn()}as unknown as AssetRepository
describe('asset API authorization',()=>{
  it('requires authentication',async()=>expect((await handleAssetApi({method:'GET'},{repository:repo,verifier:{verify:async()=>({uid:'u'})}})).status).toBe(401))
  it.each(['SUPER_ADMIN','CONTENT_ADMIN'])('allows %s to upload',async role=>expect((await handleAssetApi({method:'POST',authorization:'Bearer x',body:{filename:'x.png',mimeType:'image/png',base64:png()}},{repository:repo,verifier:{verify:async()=>({uid:'u',adminRole:role})}})).status).toBe(201))
  it.each(['CONTENT_EDITOR','CONTENT_REVIEWER'])('denies %s upload but permits reads',async role=>{const verifier={verify:async()=>({uid:'u',adminRole:role})};expect((await handleAssetApi({method:'POST',authorization:'Bearer x',body:{}},{repository:repo,verifier})).status).toBe(403);expect((await handleAssetApi({method:'GET',authorization:'Bearer x'},{repository:repo,verifier})).status).toBe(200)})
  it('rejects malformed cursors and page sizes',async()=>{const verifier={verify:async()=>({uid:'u',adminRole:'CONTENT_ADMIN'})};expect((await handleAssetApi({method:'GET',authorization:'Bearer x',cursor:'bad'},{repository:repo,verifier})).status).toBe(422);expect((await handleAssetApi({method:'GET',authorization:'Bearer x',pageSize:'500'},{repository:repo,verifier})).status).toBe(422)})
})
