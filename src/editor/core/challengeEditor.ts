import type { ChallengeDocument } from '../../content/core/envelope'
import { CURRENT_SCHEMA_VERSION } from '../../content/core/versions'
import { validateContent, type ValidationIssue } from '../../content/validation/validateContent'

export function createChallengeDocument(now = new Date().toISOString(), id = () => crypto.randomUUID()): ChallengeDocument {
  const policyId = id()
  return {
    id: policyId, contentType: 'challenge', schemaVersion: CURRENT_SCHEMA_VERSION, documentVersion: 1,
    title: 'Untitled Daily Challenge Policy', slug: 'untitled-daily-challenge-policy',
    status: { authoringState: 'draft', visibility: 'private', hasUnpublishedChanges: true, publishedDocumentVersion: null, publishedAt: null },
    createdAt: now, updatedAt: now, createdBy: 'local-editor', updatedBy: 'local-editor', metadata: { summary: '', tags: [], locale: 'en' },
    content: {
      kind: 'policy', policyVersion: 1, enabled: true,
      schedule: { timezone: 'Asia/Kolkata', resetTime: '00:00:00' },
      source: { mode: 'eligible-pool', includePracticeContentIds: [], excludePracticeContentIds: [], difficulties: [], topics: [] },
      restrictions: { aiTutor: 'disabled', hints: 'practice-defined', retryPolicy: 'unlimited-until-completed' },
      rewards: { coins: 20, streakIncrement: 1, practiceRewardMode: 'challenge-replaces-practice', policyVersion: 'challenge-reward-v1' },
    },
  }
}

export function changeChallenge(document: ChallengeDocument, change: (next: ChallengeDocument) => void) { const next = structuredClone(document); change(next); next.documentVersion += 1; const now = new Date().toISOString(); next.updatedAt = now < next.createdAt ? next.createdAt : now; return next }
export type ChallengeState = { document: ChallengeDocument; past: ChallengeDocument[]; future: ChallengeDocument[]; mode: 'edit' | 'preview'; issues: ValidationIssue[] }
export type ChallengeAction = { type: 'commit' | 'hydrate'; document: ChallengeDocument } | { type: 'undo' | 'redo' } | { type: 'mode'; mode: 'edit' | 'preview' }
const issues = (document: ChallengeDocument) => { const result = validateContent(document); return result.success ? [] : result.issues }
export const challengeState = (document: ChallengeDocument): ChallengeState => ({ document, past: [], future: [], mode: 'edit', issues: issues(document) })
export function challengeReducer(state: ChallengeState, action: ChallengeAction): ChallengeState { if (action.type === 'hydrate') return challengeState(action.document); if (action.type === 'mode') return { ...state, mode: action.mode }; if (action.type === 'commit') return { ...state, document: action.document, past: [...state.past, state.document].slice(-50), future: [], issues: issues(action.document) }; if (action.type === 'undo') { const document = state.past.at(-1); return document ? { ...state, document, past: state.past.slice(0, -1), future: [state.document, ...state.future], issues: issues(document) } : state } const document = state.future[0]; return document ? { ...state, document, past: [...state.past, state.document], future: state.future.slice(1), issues: issues(document) } : state }
