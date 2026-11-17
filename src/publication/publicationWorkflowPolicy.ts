export function publicationEntryState(role: string | null, source: 'local' | 'cloud', revision: number | null, isDirty: boolean) {
  const visible = role === 'SUPER_ADMIN' || role === 'CONTENT_ADMIN'
  return { visible, enabled: visible && source === 'cloud' && revision !== null && !isDirty,
    reason: source === 'local' ? 'Transfer to cloud first' : isDirty ? 'Save the cloud draft before publishing' : revision === null ? 'Save the cloud draft before publishing' : null }
}
export type LifecycleAction = 'rollback' | 'unpublish' | 'republish' | 'disable' | 'enable' | 'archive'
export function lifecycleOperations(state: string): readonly LifecycleAction[] {
  if (state === 'published') return ['rollback', 'unpublish', 'disable', 'archive']
  if (state === 'unpublished') return ['rollback', 'republish', 'disable', 'archive']
  if (state === 'disabled') return ['rollback', 'enable', 'archive']
  return []
}
