import { z } from 'zod'
import { isoDateTimeSchema, uuidSchema } from '../content/core/identifiers.js'
export const ASSET_COLLECTION='editorV2Assets',ASSET_PREFIX='editor-v2-assets',MAX_IMAGE_BYTES=2*1024*1024,MAX_IMAGE_DIMENSION=6000,MAX_IMAGE_PIXELS=24_000_000
export const assetMimeSchema=z.enum(['image/png','image/jpeg','image/webp'])
export const assetMetadataSchema=z.object({id:uuidSchema,originalFilename:z.string().min(1).max(200),objectPath:z.string().startsWith(`${ASSET_PREFIX}/`),mimeType:assetMimeSchema,size:z.number().int().positive().max(MAX_IMAGE_BYTES),width:z.number().int().positive().max(MAX_IMAGE_DIMENSION),height:z.number().int().positive().max(MAX_IMAGE_DIMENSION),createdAt:isoDateTimeSchema,createdBy:z.string().min(1).max(128),status:z.literal('ready')}).strict()
export type AssetMetadata=z.infer<typeof assetMetadataSchema>
