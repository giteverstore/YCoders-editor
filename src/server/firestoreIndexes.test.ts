import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type IndexDefinition = {
  collectionGroup: string
  queryScope: string
  fields: Array<{ fieldPath: string; order: string }>
}

const configuration = JSON.parse(readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8')) as { indexes: IndexDefinition[] }

function fields(collectionGroup: string) {
  return configuration.indexes.find((index) => index.collectionGroup === collectionGroup)?.fields
}

describe('Production Firestore query indexes', () => {
  it('declares the Course/Practice draft list query index', () => {
    expect(fields('editorV2Drafts')).toEqual([
      { fieldPath: 'contentType', order: 'ASCENDING' },
      { fieldPath: 'updatedAt', order: 'DESCENDING' },
    ])
  })

  it('declares the asset cursor list query index', () => {
    expect(fields('editorV2Assets')).toEqual([
      { fieldPath: 'createdAt', order: 'DESCENDING' },
      { fieldPath: 'id', order: 'DESCENDING' },
    ])
  })
})
