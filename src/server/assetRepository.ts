import type { Firestore } from 'firebase-admin/firestore'
import type { getStorage } from 'firebase-admin/storage'
import { ASSET_COLLECTION, ASSET_PREFIX, assetMetadataSchema, type AssetMetadata } from '../assets/asset.schema.js'
type Bucket=ReturnType<ReturnType<typeof getStorage>['bucket']>
export type AssetCursor={createdAt:string;id:string}
export interface AssetRepository{create(input:Omit<AssetMetadata,'createdAt'|'status'>,bytes:Uint8Array):Promise<AssetMetadata>;list(limit:number,after?:AssetCursor):Promise<AssetMetadata[]>;get(id:string):Promise<AssetMetadata|null>;bytes(asset:AssetMetadata):Promise<Uint8Array>}
export class FirebaseAssetRepository implements AssetRepository{
  constructor(private firestore:Firestore,private bucket:Bucket){}
  async create(input:Omit<AssetMetadata,'createdAt'|'status'>,bytes:Uint8Array){const object=this.bucket.file(input.objectPath);await object.save(Buffer.from(bytes),{resumable:false,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:input.mimeType,cacheControl:'private, max-age=300'}});const metadata=assetMetadataSchema.parse({...input,createdAt:new Date().toISOString(),status:'ready'});try{await this.firestore.collection(ASSET_COLLECTION).doc(input.id).create(metadata);return metadata}catch(error){await object.delete({ignoreNotFound:true}).catch(()=>undefined);throw error}}
  async list(limit:number,after?:AssetCursor){let query=this.firestore.collection(ASSET_COLLECTION).orderBy('createdAt','desc').orderBy('id','desc');if(after)query=query.startAfter(after.createdAt,after.id);const snap=await query.limit(Math.min(51,limit)).get();return snap.docs.map(d=>assetMetadataSchema.parse(d.data()))}
  async get(id:string){const snap=await this.firestore.collection(ASSET_COLLECTION).doc(id).get();return snap.exists?assetMetadataSchema.parse(snap.data()):null}
  async bytes(asset:AssetMetadata){if(!asset.objectPath.startsWith(`${ASSET_PREFIX}/${asset.id}/`))throw new Error('Invalid asset path');const[data]=await this.bucket.file(asset.objectPath).download();return new Uint8Array(data)}
}
