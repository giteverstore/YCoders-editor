import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Undo2, Redo2, Eye, Trash2 } from 'lucide-react';
import type { ChallengeDocument } from '../../content/core/envelope';
import { createChallengeDocument, changeChallenge, challengeReducer, challengeState } from '../../editor/core/challengeEditor';
import { useCourseDraftPersistence } from '../../drafts/useCourseDraftPersistence';
import { challengeDraftRepository } from '../../drafts/indexedDbChallengeDraftRepository';
import { CloudChallengeDraftRepository } from '../../cloud/cloudChallengeDraftRepository';
import { V2DraftApiClient } from '../../cloud/draftApiClient';
import { useAuth } from '../../auth/authContext';
import { hasPermission } from '../../auth/permissions';
import { cloudReadiness } from '../../cloud/cloudReadiness';
import { useUnsavedChangesWarning } from '../../drafts/useUnsavedChangesWarning';
import { UnsavedChangesDialog } from '../../components/ui/UnsavedChangesDialog';
import { RichTextEditor } from '../../editor/course/RichTextEditor';
import { ImageBlockEditor } from '../../assets/ImageBlockEditor';
import { AssetBlockPreview } from '../../assets/AssetBlockPreview';
import { PublicationWorkflow } from '../../publication/PublicationWorkflow';
const Monaco = lazy(() => import('../../editor/practice/MonacoCodeEditor').then(m => ({ default: m.MonacoCodeEditor })));
export function ChallengeEditorPage({ source = 'local' }: {
    source?: 'local' | 'cloud';
}) { const { id } = useParams(); const nav = useNavigate(); const auth = useAuth(); const cloud = useMemo(() => new CloudChallengeDraftRepository(new V2DraftApiClient(auth.getIdToken)), [auth.getIdToken]); const repo = source === 'cloud' ? cloud : challengeDraftRepository; const write = !!auth.role && hasPermission(auth.role, 'draft:write'); const readOnly = source === 'cloud' && !write; const [state, dispatch] = useReducer(challengeReducer, createChallengeDocument(), challengeState); const hydrate = useCallback((d: ChallengeDocument) => dispatch({ type: 'hydrate', document: d }), []); const p = useCourseDraftPersistence({ id, document: state.document, hydrate, repository: repo, source }); const warn = useUnsavedChangesWarning(p.isDirty); useEffect(() => { if (p.createdId && !p.isDirty)
    nav(`/challenges/${source}/${p.createdId}/edit`, { replace: true }); }, [nav, p.createdId, p.isDirty, source]); if (source === 'cloud' && !cloudReadiness.enabled)
    return <div>{cloudReadiness.reason}</div>; if (p.loadState === 'loading')
    return <div>Loading Challenge…</div>; const change = (fn: (d: ChallengeDocument) => void) => { if (!readOnly)
    dispatch({ type: 'commit', document: changeChallenge(state.document, fn) }); }; const c = state.document.content; return <div className="practice-editor-page">
<UnsavedChangesDialog open={warn.isOpen} onStay={warn.stay} onDiscard={warn.discard}/>
<div className="memory-warning">
<strong>{source} Challenge draft</strong> Scheduling and rewards are configuration only; nothing is assigned or granted.</div>
<PublicationWorkflow contentId={state.document.id} contentType="challenge" title={state.document.title} source={source} revision={p.revision} isDirty={p.isDirty}/>
<div className="editor-commandbar">
<div>
<button onClick={() => dispatch({ type: 'undo' })}>
<Undo2 />Undo</button>
<button onClick={() => dispatch({ type: 'redo' })}>
<Redo2 />Redo</button>
<button disabled={readOnly || !p.isDirty} onClick={() => void p.save()}>
<Save />Save</button>{id && <button onClick={() => void p.deleteDraft()}>
<Trash2 />Delete</button>}</div>
<button onClick={() => dispatch({ type: 'mode', mode: state.mode === 'edit' ? 'preview' : 'edit' })}>
<Eye />Preview</button>
</div>{state.mode === 'preview' ? <article className="practice-preview">
<h1>{state.document.title}</h1>
<p>{c.scheduledDate} (Asia/Kolkata calendar date) · {c.difficulty}</p>
<p>Reward: {c.rewards.points} points {c.rewards.label}</p>
<h2>Instructions</h2>{c.instructions.map(b => <AssetBlockPreview key={b.id} block={b}/>)}<h2>Verification</h2>
<pre>{JSON.stringify(c.verification, null, 2)}</pre>
</article> : <div className="practice-editor-sections">
<Section title="Identity and scheduling">
<Field label="Title" value={state.document.title} set={v => change(d => { d.title = v; })}/>
<Field label="Slug" value={state.document.slug} set={v => change(d => { d.slug = v; })}/>
<Field label="Summary" value={state.document.metadata.summary ?? ''} set={v => change(d => { d.metadata.summary = v; })}/>
<Field label="Scheduled date (YYYY-MM-DD)" type="date" value={c.scheduledDate} set={v => change(d => { d.content.scheduledDate = v; })}/>
<Field label="Topics" value={c.topics.join(', ')} set={v => change(d => { d.content.topics = v.split(',').map(x => x.trim()).filter(Boolean); })}/>
</Section>
<Section title="Rewards (configuration only)">
<Field label="Points" type="number" value={String(c.rewards.points)} set={v => change(d => { d.content.rewards.points = Number(v); })}/>
<Field label="Badge ID" value={c.rewards.badgeId ?? ''} set={v => change(d => { d.content.rewards.badgeId = v || undefined; })}/>
<Field label="Label" value={c.rewards.label ?? ''} set={v => change(d => { d.content.rewards.label = v || undefined; })}/>
</Section>
<Section title="Instructions">{c.instructions.map((b, i) => b.type === 'richText' ? <RichTextEditor key={b.id} value={b.data.document} onCommit={document => change(d => { const x = d.content.instructions[i]; if (x.type === 'richText')
    x.data.document = document; })}/> : b.type === 'image' ? <ImageBlockEditor key={b.id} block={b} onChange={next => change(d => { d.content.instructions[i] = next; })}/> : <pre key={b.id}>{b.type}</pre>)}</Section>
<Section title="Starter code">{c.starterCode.map((e, i) => <Suspense key={e.languageId} fallback={null}>
<Monaco language={e.languageId} value={e.code} onChange={code => change(d => { d.content.starterCode[i].code = code; })}/>
</Suspense>)}</Section>
<Section title="Verification">
<select value={c.verification.mode} onChange={e => change(d => { d.content.verification = e.target.value === 'test-cases' ? { mode: 'test-cases', cases: [{ input: '', expectedOutput: '' }] } : { mode: 'expected-output', expectedOutput: '' }; })}>
<option value="expected-output">Expected output</option>
<option value="test-cases">Test cases</option>
</select>{c.verification.mode === 'expected-output' ? <Field label="Expected output" value={c.verification.expectedOutput ?? ''} set={v => change(d => { d.content.verification = { mode: 'expected-output', expectedOutput: v }; })}/> : c.verification.cases?.map((t, i) => <div className="practice-item" key={i}>
<Field label="Input" value={t.input} set={v => change(d => { d.content.verification.cases![i].input = v; })}/>
<Field label="Expected" value={t.expectedOutput} set={v => change(d => { d.content.verification.cases![i].expectedOutput = v; })}/>
</div>)}</Section>{state.issues.length > 0 && <Section title="Validation">
<ul>{state.issues.map((x, i) => <li key={i}>{x.path.join('.')}: {x.message}</li>)}</ul>
</Section>}</div>}</div>; }
function Section({ title, children }: {
    title: string;
    children: React.ReactNode;
}) { return <section className="practice-section">
<h2>{title}</h2>{children}</section>; }
function Field({ label, value, set, type = 'text' }: {
    label: string;
    value: string;
    set: (v: string) => void;
    type?: string;
}) { return <label className="field">{label}<input type={type} value={value} onChange={e => set(e.target.value)}/>
</label>; }
