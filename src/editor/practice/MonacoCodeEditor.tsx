import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

(globalThis as typeof globalThis & { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })
export function MonacoCodeEditor({ value, language, onChange, readOnly = false }: { value: string; language: string; onChange: (value: string) => void; readOnly?: boolean }) { return <Editor height="220px" language={languageAlias(language)} value={value} onChange={(next: string | undefined) => onChange(next ?? '')} options={{ readOnly, minimap: { enabled: false }, automaticLayout: true, tabSize: 2, wordWrap: 'on', scrollBeyondLastLine: false }} /> }
function languageAlias(value: string) { return ({ js: 'javascript', ts: 'typescript', py: 'python', csharp: 'csharp' } as Record<string, string>)[value] ?? value }
