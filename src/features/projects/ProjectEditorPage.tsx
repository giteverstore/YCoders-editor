/* eslint-disable react-hooks/preserve-manual-memoization */
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, Redo2, Save, Trash2, Undo2 } from 'lucide-react';
import type { ProjectDocument } from '../../content/core/envelope';
import type { ProjectValidator } from '../../content/domains/projects/project.schema';
import { addCheckpoint, addTask, changeProject, createProjectDocument, move, projectReducer, projectState, safeWorkspacePath } from '../../editor/core/projectEditor';
import { useCourseDraftPersistence } from '../../drafts/useCourseDraftPersistence';
import { projectDraftRepository } from '../../drafts/indexedDbProjectDraftRepository';
import { CloudProjectDraftRepository } from '../../cloud/cloudProjectDraftRepository';
import { V2DraftApiClient } from '../../cloud/draftApiClient';
import { useAuth } from '../../auth/authContext';
import { hasPermission } from '../../auth/permissions';
import { cloudReadiness } from '../../cloud/cloudReadiness';
import { useUnsavedChangesWarning } from '../../drafts/useUnsavedChangesWarning';
import { UnsavedChangesDialog } from '../../components/ui/UnsavedChangesDialog';
import { RichTextEditor } from '../../editor/course/RichTextEditor';
import { createBlock, blocksForDomain } from '../../content/blocks/block.registry';
import { ProjectConflictRecovery } from './ProjectConflictRecovery';
import { ImageBlockEditor } from '../../assets/ImageBlockEditor';
import { AssetBlockPreview } from '../../assets/AssetBlockPreview';
import { PublicationWorkflow } from '../../publication/PublicationWorkflow';
const Monaco = lazy(() => import('../../editor/practice/MonacoCodeEditor').then(m => ({ default: m.MonacoCodeEditor })));
export function ProjectEditorPage({ source = 'local' }: {
    source?: 'local' | 'cloud';
}) { const { id } = useParams(), nav = useNavigate(), auth = useAuth(), cloud = useMemo(() => new CloudProjectDraftRepository(new V2DraftApiClient(auth.getIdToken)), [auth.getIdToken]), repo = source === 'cloud' ? cloud : projectDraftRepository, readOnly = source === 'cloud' && (!auth.role || !hasPermission(auth.role, 'draft:write')), [state, dispatch] = useReducer(projectReducer, createProjectDocument(), projectState), hydrate = useCallback((d: ProjectDocument) => dispatch({ type: 'hydrate', document: d }), []), p = useCourseDraftPersistence({ id, document: state.document, hydrate, repository: repo, source }), warn = useUnsavedChangesWarning(p.isDirty); useEffect(() => { if (p.createdId && !p.isDirty)
    nav(`/projects/${source}/${p.createdId}/edit`, { replace: true }); }, [nav, p.createdId, p.isDirty, source]); if (source === 'cloud' && !cloudReadiness.enabled)
    return <div>{cloudReadiness.reason}</div>; if (p.loadState === 'loading')
    return <div>Loading Project…</div>; const change = (fn: (d: ProjectDocument) => void) => { if (!readOnly)
    dispatch({ type: 'commit', document: changeProject(state.document, fn) }); }, c = state.document.content, selection = state.selection; const selectedCheckpoint = selection.kind === 'overview' ? undefined : c.checkpoints.find(x => x.id === selection.checkpointId), selectedTask = selection.kind === 'task' ? selectedCheckpoint?.tasks.find(x => x.id === selection.taskId) : undefined; const blocks = selectedTask?.instructions ?? selectedCheckpoint?.description ?? c.instructions; return <div className="practice-editor-page">
<UnsavedChangesDialog open={warn.isOpen} onStay={warn.stay} onDiscard={warn.discard}/>
<div className="memory-warning">
<strong>{source} Project draft</strong> Static authoring only. Code and validators are never executed.</div>
<PublicationWorkflow contentId={state.document.id} contentType="project" title={state.document.title} source={source} revision={p.revision} isDirty={p.isDirty}/>
<div className="editor-commandbar">
<div>
<button onClick={() => dispatch({ type: 'undo' })}>
<Undo2 />Undo</button>
<button onClick={() => dispatch({ type: 'redo' })}>
<Redo2 />Redo</button>
<button disabled={readOnly || !p.isDirty || Boolean(p.conflict)} onClick={() => void p.save()}>
<Save />Save</button>{id && <button disabled={readOnly} onClick={() => { if (confirm('Delete this Project draft?'))
    void p.deleteDraft(); }}>
<Trash2 />Delete</button>}</div>
<button onClick={() => dispatch({ type: 'mode', mode: state.mode === 'edit' ? 'preview' : 'edit' })}>
<Eye />Preview</button>
</div>
{p.conflict && <ProjectConflictRecovery conflict={p.conflict} document={state.document} reloadLatest={p.reloadLatest}/>}
{p.externalChange && <div className="persistence-message conflict" role="status">Another tab changed this draft. Your working content remains in memory. Reload only after confirming you can discard it.</div>}
{state.mode === 'preview' ? <Preview d={state.document}/> : <>
<Section title="Project structure">
<button onClick={() => dispatch({ type: 'select', selection: { kind: 'overview' } })}>Overview</button>{c.checkpoints.map((cp, ci) => <div className="practice-item" key={cp.id}>
<button onClick={() => dispatch({ type: 'select', selection: { kind: 'checkpoint', checkpointId: cp.id } })}>{cp.title}</button>
<button onClick={() => change(d => move(d.content.checkpoints, ci, ci - 1))}>↑</button>
<button onClick={() => change(d => move(d.content.checkpoints, ci, ci + 1))}>↓</button>
<button onClick={() => { if (confirm(`Delete ${cp.title} and its ${cp.tasks.length} task(s)?`))
    change(d => { d.content.checkpoints.splice(ci, 1); }); }}>Delete</button>{cp.tasks.map((t, ti) => <div key={t.id}>↳ <button onClick={() => dispatch({ type: 'select', selection: { kind: 'task', checkpointId: cp.id, taskId: t.id } })}>{t.title}</button>
<button onClick={() => change(d => move(d.content.checkpoints[ci].tasks, ti, ti - 1))}>↑</button>
<button onClick={() => change(d => move(d.content.checkpoints[ci].tasks, ti, ti + 1))}>↓</button>
<button onClick={() => { if (confirm(`Delete ${t.title}?`))
    change(d => { d.content.checkpoints[ci].tasks.splice(ti, 1); }); }}>Delete</button>
</div>)}<button onClick={() => dispatch({ type: 'commit', document: addTask(state.document, cp.id) })}>Add task</button>
</div>)}<button onClick={() => dispatch({ type: 'commit', document: addCheckpoint(state.document) })}>Add checkpoint</button>
</Section>{selection.kind === 'overview' ? <Overview d={state.document} change={change}/> : <Section title={selectedTask ? 'Task' : 'Checkpoint'}>
<Field label="Title" value={(selectedTask ?? selectedCheckpoint)?.title ?? ''} set={v => change(d => { const cp = d.content.checkpoints.find(x => x.id === selectedCheckpoint!.id), t = selectedTask ? cp?.tasks.find(x => x.id === selectedTask.id) : undefined; if (t)
    t.title = v;
else if (cp)
    cp.title = v; })}/>{selectedTask && <>
<List label="Hints" values={selectedTask.hints.map(h => h.text)} set={v => change(d => { d.content.checkpoints.find(x => x.id === selectedCheckpoint!.id)!.tasks.find(x => x.id === selectedTask.id)!.hints = v.map(text => ({ id: crypto.randomUUID(), text })); })}/>
<Validators values={selectedTask.validators} set={v => change(d => { d.content.checkpoints.find(x => x.id === selectedCheckpoint!.id)!.tasks.find(x => x.id === selectedTask.id)!.validators = v; })}/>
</>}<Blocks values={blocks} change={change} selection={selection}/>
</Section>}{state.issues.length > 0 && <Section title="Validation">
<ul>{state.issues.map((x, i) => <li key={i}>{x.path.join('.')}: {x.message}</li>)}</ul>
</Section>}</>}</div>; }
function Overview({ d, change }: {
    d: ProjectDocument;
    change: (f: (d: ProjectDocument) => void) => void;
}) { const c = d.content; return <>
<Section title="Project metadata">
<Field label="Title" value={d.title} set={v => change(x => { x.title = v; })}/>
<Field label="Slug" value={d.slug} set={v => change(x => { x.slug = v; })}/>
<Field label="Description" value={d.metadata.summary ?? ''} set={v => change(x => { x.metadata.summary = v; })}/>
<label>Difficulty<select value={c.difficulty} onChange={e => change(x => { x.content.difficulty = e.target.value as typeof c.difficulty; })}>
<option>beginner</option>
<option>intermediate</option>
<option>advanced</option>
</select>
</label>
<Field label="Estimated minutes" type="number" value={String(c.projectMetadata.estimatedMinutes)} set={v => change(x => { x.content.projectMetadata.estimatedMinutes = Number(v); })}/>
<List label="Tags" values={d.metadata.tags} set={v => change(x => { x.metadata.tags = v; })}/>
<List label="Topics" values={c.projectMetadata.topics} set={v => change(x => { x.content.projectMetadata.topics = v; })}/>
<List label="Learning objectives" values={c.learningObjectives} set={v => change(x => { x.content.learningObjectives = v; })}/>
<List label="Completion criteria" values={c.completionCriteria} set={v => change(x => { x.content.completionCriteria = v; })}/>
</Section>
<Workspace d={d} change={change}/>
<Section title="Final validators">
<Validators values={c.validation.validators} set={v => change(x => { x.content.validation.validators = v; })}/>
<label>
<input type="checkbox" checked={c.validation.requireAll} onChange={e => change(x => { x.content.validation.requireAll = e.target.checked; })}/> Require all</label>
</Section>
</>; }
function Workspace({ d, change }: {
    d: ProjectDocument;
    change: (f: (d: ProjectDocument) => void) => void;
}) { const w = d.content.starterWorkspace; return <Section title="Starter workspace">{w.files.map((f, i) => <div className="practice-item" key={i}>
<Field label="Path" value={f.path} set={v => change(x => { x.content.starterWorkspace.files[i].path = v; })}/>{!safeWorkspacePath(f.path) && <p className="field-error">Relative paths cannot contain parent traversal.</p>}<Field label="Language ID" value={f.languageId} set={v => change(x => { x.content.starterWorkspace.files[i].languageId = v; })}/>
<Suspense fallback={null}>
<Monaco language={f.languageId} value={f.content} onChange={v => change(x => { x.content.starterWorkspace.files[i].content = v; })}/>
</Suspense>
<button onClick={() => change(x => { x.content.starterWorkspace.files.splice(i, 1); })}>Remove file</button>
</div>)}<button onClick={() => change(x => { x.content.starterWorkspace.files.push({ path: `src/file${w.files.length + 1}.js`, languageId: x.content.languages.defaultLanguageId, content: '' }); })}>Add file</button>
</Section>; }
function Validators({ values, set }: {
    values: ProjectValidator[];
    set: (v: ProjectValidator[]) => void;
}) { return <div>
<h3>Declarative validators</h3>{values.map((v, i) => <div className="practice-item" key={i}>
<select value={v.kind} onChange={e => { const kind = e.target.value; const n: ProjectValidator = kind === 'file-exists' ? { kind, path: 'src/index.js' } : kind === 'file-contains' ? { kind, path: 'src/index.js', pattern: 'TODO', match: 'literal' } : kind === 'output-equals' ? { kind, commandId: 'run', expected: '', normalizeWhitespace: true } : { kind: 'tests-pass', suiteId: 'default' }; set(values.map((x, j) => j === i ? n : x)); }}>
<option value="file-exists">File exists</option>
<option value="file-contains">File contains</option>
<option value="output-equals">Output equals</option>
<option value="tests-pass">Tests pass</option>
</select>{'path' in v && <Field label="Path" value={v.path} set={x => set(values.map((a, j) => j === i ? { ...a, path: x } : a))}/>} {'pattern' in v && <Field label="Pattern" value={v.pattern} set={x => set(values.map((a, j) => j === i ? { ...a, pattern: x } : a))}/>} {'commandId' in v && <Field label="Command ID" value={v.commandId} set={x => set(values.map((a, j) => j === i ? { ...a, commandId: x } : a))}/>} {'expected' in v && <Field label="Expected output" value={v.expected} set={x => set(values.map((a, j) => j === i ? { ...a, expected: x } : a))}/>} {'suiteId' in v && <Field label="Suite ID" value={v.suiteId} set={x => set(values.map((a, j) => j === i ? { ...a, suiteId: x } : a))}/>}<button onClick={() => set(values.filter((_, j) => j !== i))}>Remove</button>
</div>)}<button onClick={() => set([...values, { kind: 'file-exists', path: 'src/index.js' }])}>Add validator</button>
</div>; }
function Blocks({ values, change, selection }: {
    values: ProjectDocument['content']['instructions'];
    change: (f: (d: ProjectDocument) => void) => void;
    selection: ReturnType<typeof projectState>['selection'];
}) { const mutate = (fn: (b: typeof values) => void) => change(d => { const cp = selection.kind === 'overview' ? undefined : d.content.checkpoints.find(x => x.id === selection.checkpointId), b = selection.kind === 'task' ? cp!.tasks.find(x => x.id === selection.taskId)!.instructions : selection.kind === 'checkpoint' ? cp!.description : d.content.instructions; fn(b); }); return <div>
<h3>Instruction blocks</h3>{values.map((b, i) => <div className="practice-item" key={b.id}>{b.type === 'richText' ? <RichTextEditor value={b.data.document} onCommit={document => mutate(bs => { const x = bs[i]; if (x.type === 'richText')
    x.data.document = document; })}/> : b.type === 'image' ? <ImageBlockEditor block={b} onChange={next => mutate(bs => { bs[i] = next; })}/> : <pre>{JSON.stringify(b.data, null, 2)}</pre>}<button onClick={() => mutate(x => move(x, i, i - 1))}>↑</button>
<button onClick={() => mutate(x => move(x, i, i + 1))}>↓</button>
<button onClick={() => mutate(x => x.splice(i, 1, structuredClone({ ...b, id: crypto.randomUUID() })))}>Duplicate</button>
<button onClick={() => mutate(x => x.splice(i, 1))}>Delete</button>
</div>)}<select defaultValue="" onChange={e => { if (e.target.value)
    mutate(x => x.push(createBlock(e.target.value as Parameters<typeof createBlock>[0], crypto.randomUUID()))); e.target.value = ''; }}>
<option value="">Insert block…</option>{blocksForDomain('project').map(x => <option key={x.type} value={x.type}>{x.displayName}</option>)}</select>
</div>; }
function Preview({ d }: {
    d: ProjectDocument;
}) { const c = d.content; return <article className="practice-preview">
<p>
<em>Approximation of learner-facing rendering; no code or validators execute.</em>
</p>
<h1>{d.title}</h1>
<p>{d.metadata.summary}</p>
<p>{c.difficulty} · {c.projectMetadata.estimatedMinutes} minutes</p>
<h2>Overview</h2>{c.instructions.map(b => <AssetBlockPreview key={b.id} block={b}/>)}
<h2>Objectives</h2>
<ul>{c.learningObjectives.map(x => <li key={x}>{x}</li>)}</ul>
<h2>Workspace</h2>
<ul>{c.starterWorkspace.files.map(f => <li key={f.path}>{f.path} ({f.languageId})</li>)}</ul>{c.checkpoints.map(cp => <section key={cp.id}>
<h2>{cp.title}</h2>{cp.description.map(b => <AssetBlockPreview key={b.id} block={b}/>)}{cp.tasks.map(t => <div key={t.id}>
<h3>{t.title}</h3>
<p>{t.instructions.length} instructional block(s); {t.validators.length} validator(s)</p>{t.instructions.map(b => <AssetBlockPreview key={b.id} block={b}/>)}
<ul>{t.hints.map(h => <li key={h.text}>{h.text}</li>)}</ul>
</div>)}</section>)}<h2>Completion</h2>
<ul>{c.completionCriteria.map(x => <li key={x}>{x}</li>)}</ul>
<p>{c.validation.validators.length} final declarative validator(s).</p>
</article>; }
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
function List({ label, values, set }: {
    label: string;
    values: string[];
    set: (v: string[]) => void;
}) { return <Field label={`${label} (one per line)`} value={values.join('\n')} set={v => set(v.split('\n').map(x => x.trim()).filter(Boolean))}/>; }
