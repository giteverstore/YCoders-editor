import { z } from 'zod'

export const uuidSchema = z.uuid('Must be a valid UUID')
export type ContentId = z.infer<typeof uuidSchema>

export const slugSchema = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens')

export const actorIdSchema = z.string().trim().min(1).max(128)
export const isoDateTimeSchema = z.iso.datetime({ offset: true })
export const calendarDateSchema = z.iso.date()

export function findDuplicateIds(items: ReadonlyArray<{ id: string }>): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id)
    seen.add(item.id)
  }
  return [...duplicates]
}
