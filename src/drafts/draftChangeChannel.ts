export type DraftChangeAction = 'created' | 'updated' | 'deleted'
export type DraftChangeEvent = { formatVersion: 1; sourceId: string; action: DraftChangeAction; id: string; revision: number; timestamp: string }
export type DraftChangeListener = (event: DraftChangeEvent) => void
export interface DraftChangePublisher { publish(action: DraftChangeAction, id: string, revision: number): void }

const CHANNEL_NAME = 'ycoders-editor-studio-v2-draft-events'
const STORAGE_KEY = 'ycoders-editor-studio-v2-draft-event'

export class DraftChangeChannel implements DraftChangePublisher {
  readonly sourceId: string
  private channel: BroadcastChannel | null
  private listeners = new Set<DraftChangeListener>()
  private storageListener: ((event: StorageEvent) => void) | null = null

  constructor(sourceId: string = crypto.randomUUID()) {
    this.sourceId = sourceId
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
    if (this.channel) this.channel.onmessage = (message: MessageEvent<unknown>) => this.receive(message.data)
    else if (typeof window !== 'undefined') {
      this.storageListener = (event) => { if (event.key === STORAGE_KEY && event.newValue) { try { this.receive(JSON.parse(event.newValue)) } catch { /* Ignore malformed external notifications. */ } } }
      window.addEventListener('storage', this.storageListener)
    }
  }

  publish(action: DraftChangeAction, id: string, revision: number): void {
    const event: DraftChangeEvent = { formatVersion: 1, sourceId: this.sourceId, action, id, revision, timestamp: new Date().toISOString() }
    if (this.channel) this.channel.postMessage(event)
    else if (typeof localStorage !== 'undefined') { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(event)); localStorage.removeItem(STORAGE_KEY) } catch { /* Revision checks remain authoritative if notifications are unavailable. */ } }
  }

  subscribe(listener: DraftChangeListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  close(): void { this.channel?.close(); if (this.storageListener && typeof window !== 'undefined') window.removeEventListener('storage', this.storageListener); this.listeners.clear() }

  receive(value: unknown): void {
    if (!isDraftChangeEvent(value) || value.sourceId === this.sourceId) return
    this.listeners.forEach((listener) => listener(value))
  }
}

export function isDraftChangeEvent(value: unknown): value is DraftChangeEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Partial<DraftChangeEvent>
  return event.formatVersion === 1 && typeof event.sourceId === 'string' && ['created', 'updated', 'deleted'].includes(String(event.action)) && typeof event.id === 'string' && Number.isInteger(event.revision) && typeof event.timestamp === 'string'
}

export const draftChangeChannel = new DraftChangeChannel()
