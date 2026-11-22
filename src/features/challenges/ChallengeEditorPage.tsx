import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { Eye, Redo2, Save, Trash2, Undo2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../../auth/authContext'
import { hasPermission } from '../../auth/permissions'
import { CloudChallengeDraftRepository } from '../../cloud/cloudChallengeDraftRepository'
import { cloudReadiness } from '../../cloud/cloudReadiness'
import { V2DraftApiClient } from '../../cloud/draftApiClient'
import { UnsavedChangesDialog } from '../../components/ui/UnsavedChangesDialog'
import type { ChallengeDocument } from '../../content/core/envelope'
import { isChallengePolicyContent, type ChallengePolicyContent } from '../../content/domains/challenges/challenge.schema'
import { analyzeLegacyChallenge } from '../../content/domains/challenges/challenge.compatibility'
import { challengeDraftRepository } from '../../drafts/indexedDbChallengeDraftRepository'
import { useCourseDraftPersistence } from '../../drafts/useCourseDraftPersistence'
import { useUnsavedChangesWarning } from '../../drafts/useUnsavedChangesWarning'
import { changeChallenge, challengeReducer, challengeState, createChallengeDocument } from '../../editor/core/challengeEditor'
import { PublicationWorkflow } from '../../publication/PublicationWorkflow'
import { evaluatePolicyCandidates, previewAssignmentNow, type ChallengeCandidateSource, type PracticeCandidateSummary } from './challengePolicyPreview'
import { AuthenticatedChallengeCandidateSource } from './authenticatedChallengeCandidateSource'

export function ChallengeEditorPage({ source = 'local', candidateSource }: { source?: 'local' | 'cloud'; candidateSource?: ChallengeCandidateSource }) {
  const { id } = useParams(), navigate = useNavigate(), auth = useAuth()
  const cloud = useMemo(() => new CloudChallengeDraftRepository(new V2DraftApiClient(auth.getIdToken)), [auth.getIdToken])
  const serverCandidateSource = useMemo(() => new AuthenticatedChallengeCandidateSource(auth.getIdToken), [auth.getIdToken])
  const effectiveCandidateSource = candidateSource ?? serverCandidateSource
  const repository = source === 'cloud' ? cloud : challengeDraftRepository
  const write = Boolean(auth.role && hasPermission(auth.role, 'draft:write')), readOnly = source === 'cloud' && !write
  const [state, dispatch] = useReducer(challengeReducer, createChallengeDocument(), challengeState)
  const hydrate = useCallback((document: ChallengeDocument) => dispatch({ type: 'hydrate', document }), [])
  const persistence = useCourseDraftPersistence({ id, document: state.document, hydrate, repository, source })
  const warning = useUnsavedChangesWarning(persistence.isDirty)
  const [candidateState, setCandidateState] = useState<{ status: 'loading' | 'ready' | 'error'; candidates: readonly PracticeCandidateSummary[]; message?: string }>({ status: 'loading', candidates: [] })

  useEffect(() => { if (persistence.createdId && !persistence.isDirty) navigate(`/challenges/${source}/${persistence.createdId}/edit`, { replace: true }) }, [navigate, persistence.createdId, persistence.isDirty, source])
  useEffect(() => { let active = true; effectiveCandidateSource.listSafeCandidates().then((candidates) => { if (active) setCandidateState({ status: 'ready', candidates }) }, (error: unknown) => { if (active) setCandidateState({ status: 'error', candidates: [], message: error instanceof Error ? error.message : 'Candidate metadata is unavailable.' }) }); return () => { active = false } }, [effectiveCandidateSource])

  if (source === 'cloud' && !cloudReadiness.enabled) return <div>{cloudReadiness.reason}</div>
  if (persistence.loadState === 'loading') return <div>Loading Challenge Policy…</div>
  const change = (mutate: (document: ChallengeDocument) => void) => { if (!readOnly) dispatch({ type: 'commit', document: changeChallenge(state.document, mutate) }) }

  return <div className="practice-editor-page">
    <UnsavedChangesDialog open={warning.isOpen} onStay={warning.stay} onDiscard={warning.discard}/>
    {isChallengePolicyContent(state.document.content)
      ? <PolicyEditor document={state.document} content={state.document.content} source={source} readOnly={readOnly} change={change} dispatch={dispatch} persistence={persistence} candidateState={candidateState}/>
      : <LegacyChallengeView document={state.document} source={source} dispatch={dispatch} persistence={persistence}/>}
  </div>
}

type EditorPersistence = ReturnType<typeof useCourseDraftPersistence<ChallengeDocument>>
type Dispatch = React.Dispatch<Parameters<typeof challengeReducer>[1]>

function PolicyEditor({ document, content, source, readOnly, change, dispatch, persistence, candidateState }: { document: ChallengeDocument; content: ChallengePolicyContent; source: 'local' | 'cloud'; readOnly: boolean; change: (mutate: (document: ChallengeDocument) => void) => void; dispatch: Dispatch; persistence: EditorPersistence; candidateState: { status: 'loading' | 'ready' | 'error'; candidates: readonly PracticeCandidateSummary[]; message?: string } }) {
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'eligible' | 'incompatible'>('all')
  const [difficultyFilter, setDifficultyFilter] = useState(''), [topicFilter, setTopicFilter] = useState('')
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewAssignmentNow>> | null>(null)
  const readiness = useMemo(() => evaluatePolicyCandidates(content, candidateState.candidates), [candidateState.candidates, content])
  const blocking = stateIssues(document, readiness.findings)
  const evaluations = readiness.evaluations.filter((value) => candidateFilter === 'all' || (candidateFilter === 'eligible') === value.eligible).filter(({ candidate }) => !difficultyFilter || candidate.difficulty === difficultyFilter).filter(({ candidate }) => !topicFilter || candidate.topics.includes(topicFilter))
  const policyChange = (mutate: (policy: ChallengePolicyContent) => void) => change((next) => { if (!isChallengePolicyContent(next.content)) return; mutate(next.content) })
  const switchMode = (mode: 'eligible-pool' | 'fixed-practice') => policyChange((policy) => { policy.source.mode = mode; policy.source.fixedPracticeContentId = mode === 'fixed-practice' ? policy.source.fixedPracticeContentId : undefined; if (mode === 'fixed-practice') { policy.source.includePracticeContentIds = []; policy.source.excludePracticeContentIds = []; policy.source.difficulties = []; policy.source.topics = [] } })
  const runPreview = async () => setPreview(await previewAssignmentNow({ policyId: document.id, policy: content, candidates: candidateState.candidates }))

  return <>
    <div className="memory-warning"><strong>Daily Challenge Policy</strong> This draft configures orchestration only. Preview never creates an assignment.</div>
    {!blocking && <PublicationWorkflow contentId={document.id} contentType="challenge" title={document.title} source={source} revision={persistence.revision} isDirty={persistence.isDirty}/>}
    {blocking && <div className="publication-status"><strong>Publication blocked</strong><small>Resolve Challenge Policy readiness findings first.</small></div>}
    <CommandBar document={document} readOnly={readOnly} dispatch={dispatch} persistence={persistence}/>

    <Section title="General">
      <Field label="Policy title" value={document.title} disabled={readOnly} set={(value) => change((next) => { next.title = value })}/>
      <Field label="Policy slug" value={document.slug} disabled={readOnly} set={(value) => change((next) => { next.slug = value })}/>
      <Field label="Summary" value={document.metadata.summary ?? ''} disabled={readOnly} set={(value) => change((next) => { next.metadata.summary = value })}/>
      <label><input type="checkbox" checked={content.enabled} disabled={readOnly} onChange={(event) => policyChange((policy) => { policy.enabled = event.target.checked })}/> Enabled</label>
    </Section>

    <Section title="Schedule">
      <ReadOnlyFact label="Timezone" value="Asia/Kolkata"/><ReadOnlyFact label="Reset time" value="00:00:00"/>
      <p>One Challenge day follows IST. Assignment identity uses YYYY-MM-DD and resets at local midnight.</p>
    </Section>

    <Section title="Question source">
      <label><input type="radio" name="source-mode" checked={content.source.mode === 'eligible-pool'} disabled={readOnly} onChange={() => switchMode('eligible-pool')}/> Eligible Practice Pool</label>
      <label><input type="radio" name="source-mode" checked={content.source.mode === 'fixed-practice'} disabled={readOnly} onChange={() => switchMode('fixed-practice')}/> Fixed Practice</label>
      {content.source.mode === 'fixed-practice' ? <PracticeSelect label="Fixed Practice" value={content.source.fixedPracticeContentId ?? ''} candidates={candidateState.candidates} disabled={readOnly} set={(value) => policyChange((policy) => { policy.source.fixedPracticeContentId = value || undefined })}/> : <>
        <PracticeMultiSelect label="Include Practice" values={content.source.includePracticeContentIds} candidates={candidateState.candidates} disabled={readOnly} set={(values) => policyChange((policy) => { policy.source.includePracticeContentIds = values })}/>
        <PracticeMultiSelect label="Exclude Practice" values={content.source.excludePracticeContentIds} candidates={candidateState.candidates} disabled={readOnly} set={(values) => policyChange((policy) => { policy.source.excludePracticeContentIds = values })}/>
        <Field label="Difficulty filters (comma-separated)" value={content.source.difficulties.join(', ')} disabled={readOnly} set={(value) => policyChange((policy) => { policy.source.difficulties = value.split(',').map((item) => item.trim()).filter((item): item is 'beginner' | 'intermediate' | 'advanced' => ['beginner', 'intermediate', 'advanced'].includes(item)) })}/>
        <Field label="Topic filters (comma-separated)" value={content.source.topics.join(', ')} disabled={readOnly} set={(value) => policyChange((policy) => { policy.source.topics = value.split(',').map((item) => item.trim()).filter(Boolean) })}/>
      </>}
    </Section>

    <Section title="Rules">
      <ReadOnlyFact label="AI Tutor" value="Disabled"/>
      <label>Hints<select value={content.restrictions.hints} disabled={readOnly} onChange={(event) => policyChange((policy) => { policy.restrictions.hints = event.target.value as 'practice-defined' | 'disabled' })}><option value="practice-defined">Practice-defined</option><option value="disabled">Disabled</option></select></label>
      <ReadOnlyFact label="Retry policy" value="Unlimited until completed"/>
    </Section>

    <Section title="Rewards">
      <ReadOnlyFact label="Challenge reward" value="20 coins"/><ReadOnlyFact label="Streak increment" value="+1"/><ReadOnlyFact label="Practice reward mode" value="Challenge replaces Practice reward"/>
      <p>A Challenge Run grants +20 coins. It does not issue the normal Practice +5 reward.</p>
    </Section>

    <Section title="Practice eligibility preview">
      {candidateState.status === 'loading' && <p role="status">Loading safe Practice metadata…</p>}
      {candidateState.status === 'error' && <p role="alert">Candidate source unavailable: {candidateState.message}</p>}
      {candidateState.status === 'ready' && <><p>Total {readiness.totals.candidates} · Eligible {readiness.totals.eligible} · Excluded/incompatible {readiness.totals.incompatible}</p>
        <div><select aria-label="Eligibility filter" value={candidateFilter} onChange={(event) => setCandidateFilter(event.target.value as typeof candidateFilter)}><option value="all">All candidates</option><option value="eligible">Eligible only</option><option value="incompatible">Incompatible only</option></select><input aria-label="Candidate difficulty filter" value={difficultyFilter} placeholder="Difficulty" onChange={(event) => setDifficultyFilter(event.target.value)}/><input aria-label="Candidate topic filter" value={topicFilter} placeholder="Topic" onChange={(event) => setTopicFilter(event.target.value)}/></div>
        <CandidateTable evaluations={evaluations}/></>}
    </Section>

    <Section title="If Assigned Now">
      <button type="button" disabled={candidateState.status !== 'ready' || blocking} onClick={() => void runPreview()}>If Assigned Now</button>
      {preview && (preview.ok ? <dl><ReadOnlyFact label="Challenge date" value={preview.challengeDate}/><ReadOnlyFact label="Selected Practice" value={preview.selected.title}/><ReadOnlyFact label="Practice content ID" value={preview.selected.contentId}/><ReadOnlyFact label="Pinned publication version" value={String(preview.selected.activePublicationVersion)}/><ReadOnlyFact label="Reward" value="20 coins"/><ReadOnlyFact label="AI Tutor" value="Disabled"/><ReadOnlyFact label="Hints" value={content.restrictions.hints === 'practice-defined' ? 'Practice-defined' : 'Disabled'}/><ReadOnlyFact label="Eligibility snapshot hash" value={preview.eligibilitySnapshotHash}/></dl> : <p role="alert">Preview blocked by policy readiness.</p>)}
    </Section>

    <Section title="Challenge Policy readiness"><ReadinessPanel document={document} findings={readiness.findings}/></Section>
  </>
}

function LegacyChallengeView({ document, source, dispatch, persistence }: { document: ChallengeDocument; source: 'local' | 'cloud'; dispatch: Dispatch; persistence: EditorPersistence }) {
  const analysis = analyzeLegacyChallenge(document)
  return <><div className="memory-warning"><strong>Legacy Challenge Content</strong> This standalone coding-question document is preserved read-only and cannot be published as a V2 Daily Challenge Policy.</div><CommandBar document={document} readOnly dispatch={dispatch} persistence={persistence}/><Section title="Migration assistance"><p>Title and summary may seed a new policy. Difficulty and topics require review as filters. Instructions, starter code, languages, hints, and verification must move to a separate Practice publication.</p><ul>{analysis.findings.map((finding) => <li key={finding.code}><strong>{finding.code}</strong>: {finding.message}</li>)}</ul><p>Source: {source}. No automatic migration is performed.</p></Section></>
}

function CommandBar({ document, readOnly, dispatch, persistence }: { document: ChallengeDocument; readOnly: boolean; dispatch: Dispatch; persistence: EditorPersistence }) { return <div className="editor-commandbar"><div><button onClick={() => dispatch({ type: 'undo' })}><Undo2/>Undo</button><button onClick={() => dispatch({ type: 'redo' })}><Redo2/>Redo</button><button disabled={readOnly || !persistence.isDirty} onClick={() => void persistence.save()}><Save/>Save</button>{document.id && <button disabled={readOnly} onClick={() => void persistence.deleteDraft()}><Trash2/>Delete</button>}</div><button onClick={() => dispatch({ type: 'mode', mode: 'preview' })}><Eye/>Policy preview</button></div> }
function stateIssues(document: ChallengeDocument, findings: readonly { severity: string }[]) { return !isChallengePolicyContent(document.content) || findings.some(({ severity }) => severity === 'blocking') }
function ReadinessPanel({ document, findings }: { document: ChallengeDocument; findings: readonly { severity: 'blocking' | 'warning' | 'ready'; code: string; message: string }[] }) { const values = [...findings]; if (isChallengePolicyContent(document.content)) values.push({ severity: 'ready', code: 'challenge-policy.contract-fixed', message: 'Timezone, reset, AI, retry, reward, streak, and Practice reward mode satisfy the canonical contract.' }); return <div>{(['blocking', 'warning', 'ready'] as const).map((severity) => { const group = values.filter((value) => value.severity === severity); return group.length ? <section key={severity}><h3>{severity[0].toUpperCase() + severity.slice(1)}</h3><ul>{group.map((finding) => <li key={finding.code}><strong>{finding.code}</strong>: {finding.message}</li>)}</ul></section> : null })}</div> }
function CandidateTable({ evaluations }: { evaluations: ReturnType<typeof evaluatePolicyCandidates>['evaluations'] }) { return <table className="draft-table"><thead><tr><th>Practice</th><th>Content ID</th><th>Version</th><th>Difficulty</th><th>Topics</th><th>Languages</th><th>Eligibility</th><th>Reason</th></tr></thead><tbody>{evaluations.map(({ candidate, eligible, findings }) => <tr key={candidate.contentId}><td>{candidate.title}</td><td>{candidate.contentId}</td><td>{candidate.activePublicationVersion}</td><td>{candidate.difficulty}</td><td>{candidate.topics.join(', ')}</td><td>{candidate.supportedLanguages.join(', ')}</td><td>{eligible ? 'Eligible' : 'Incompatible'}</td><td>{findings.join(', ')}</td></tr>)}</tbody></table> }
function PracticeSelect({ label, value, candidates, disabled, set }: { label: string; value: string; candidates: readonly PracticeCandidateSummary[]; disabled: boolean; set: (value: string) => void }) { return <label>{label}<select value={value} disabled={disabled} onChange={(event) => set(event.target.value)}><option value="">Select Practice…</option>{candidates.map((candidate) => <option key={candidate.contentId} value={candidate.contentId}>{candidate.title} · v{candidate.activePublicationVersion} · {candidate.difficulty} · {candidate.contentId}</option>)}</select></label> }
function PracticeMultiSelect({ label, values, candidates, disabled, set }: { label: string; values: readonly string[]; candidates: readonly PracticeCandidateSummary[]; disabled: boolean; set: (values: string[]) => void }) { return <fieldset><legend>{label}</legend>{candidates.map((candidate) => <label key={candidate.contentId}><input type="checkbox" disabled={disabled} checked={values.includes(candidate.contentId)} onChange={(event) => set(event.target.checked ? [...values, candidate.contentId] : values.filter((id) => id !== candidate.contentId))}/>{candidate.title} · v{candidate.activePublicationVersion} · {candidate.contentId}</label>)}</fieldset> }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="practice-section"><h2>{title}</h2>{children}</section> }
function Field({ label, value, set, disabled = false }: { label: string; value: string; set: (value: string) => void; disabled?: boolean }) { return <label className="field">{label}<input value={value} disabled={disabled} onChange={(event) => set(event.target.value)}/></label> }
function ReadOnlyFact({ label, value }: { label: string; value: string }) { return <div><strong>{label}:</strong> <span>{value}</span></div> }
