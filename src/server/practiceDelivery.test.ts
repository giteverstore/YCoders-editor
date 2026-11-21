import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { validPracticeDocument } from '../content/fixtures/validDocuments'
import { BLOCK_SCHEMA_VERSION } from '../content/core/versions'
import { canonicalJson } from '../publication/publicationContracts'
import { DeliveryError } from './courseDelivery'
import { PracticeDeliveryService } from './practiceDelivery'

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

function service({ state = 'published', visibility = 'public', compatible = true, asset = false } = {}) {
  const assetId = '60000000-0000-4000-8000-000000000001', image = Buffer.from('image-bytes')
  const document = structuredClone(validPracticeDocument)
  if (!compatible) { delete (document.content as { execution?: unknown }).execution; delete (document.content as { executablePublicTests?: unknown }).executablePublicTests }
  if (asset) document.content.instructions.push({ id:'60000000-0000-4000-8000-000000000002', type:'image', schemaVersion:BLOCK_SCHEMA_VERSION, data:{ assetId, alt:'Diagram' } } as never)
  const artifact = Buffer.from(canonicalJson(document)), manifest = asset ? [{ assetId, mimeType:'image/png', byteLength:image.length, width:1, height:1, contentHash:sha(image), publishedObjectPath:`editor-v2-published-assets/sha256/${sha(image).slice(7)}.png` }] : []
  const record = { identity:{ namespace:'v2', contentType:'practice', contentId:document.id, publicationVersion:1 }, schemaVersion:'2.0.0', artifactPath:`editor-v2-publications/${document.id}/v1.json`, artifactHash:sha(artifact), documentHash:sha(Buffer.from(canonicalJson(document))), assetManifest:manifest, assetManifestHash:sha(Buffer.from(canonicalJson(manifest))), status:'READY' }
  const firestore = { collection: () => ({ doc: () => ({ get: async () => ({ exists:true, data:() => ({ namespace:'v2', contentType:'practice', state, visibility, activeVersionNumber:1 }) }), collection: () => ({ doc: () => ({ get:async () => ({ exists:true, data:() => record }) }) }) }) }) }
  const bucket = { file: (path:string) => ({ download:async () => [path === record.artifactPath ? artifact : image] }) }
  return new PracticeDeliveryService(firestore as never, bucket as never)
}

describe('Practice delivery', () => {
  it('delivers active and exact immutable learner-safe DTOs', async () => {
    const active = await service().active(validPracticeDocument.id), exact = await service().exact(validPracticeDocument.id, 1)
    expect(active).toMatchObject({ contentType:'practice', publicationVersion:1, practice:{ executionAssurance:'browser-public-tests' } })
    expect(exact.integrity.verified).toBe(true)
    expect(JSON.stringify(active)).not.toMatch(/referenceSolutions|publishedObjectPath|draftRevision/)
  })
  it('rejects archived active discovery while exact history remains readable', async () => {
    const archived = service({ state:'archived', visibility:'hidden' })
    await expect(archived.active(validPracticeDocument.id)).rejects.toMatchObject({ code:'V2_NOT_DISCOVERABLE', status:404 })
    await expect(archived.exact(validPracticeDocument.id, 1)).resolves.toMatchObject({ publicationVersion:1 })
  })
  it('returns a typed compatibility error for legacy Practice artifacts', async () => {
    await expect(service({ compatible:false }).exact(validPracticeDocument.id, 1)).rejects.toMatchObject({ code:'V2_ADAPTER_INCOMPATIBLE', status:422 })
  })
  it('resolves only assets authorized by the exact manifest', async () => {
    const delivered = await service({ asset:true }).asset(validPracticeDocument.id, 1, '60000000-0000-4000-8000-000000000001')
    expect(Buffer.from(delivered.bytes).toString()).toBe('image-bytes')
    await expect(service({ asset:true }).asset(validPracticeDocument.id, 1, '60000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(DeliveryError)
  })
})
