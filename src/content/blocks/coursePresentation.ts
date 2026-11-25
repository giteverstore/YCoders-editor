import type { PracticeLanguageId } from '../domains/practice/practice.execution'

export type CourseLanguage = {
  id: string
  label: string
  monacoLanguage: string
  compilerLanguage?: PracticeLanguageId
}

export const COURSE_LANGUAGES: readonly CourseLanguage[] = Object.freeze([
  { id: 'python', label: 'Python', monacoLanguage: 'python', compilerLanguage: 'python' },
  { id: 'java', label: 'Java', monacoLanguage: 'java', compilerLanguage: 'java' },
  { id: 'javascript', label: 'JavaScript', monacoLanguage: 'javascript', compilerLanguage: 'javascript' },
  { id: 'typescript', label: 'TypeScript', monacoLanguage: 'typescript', compilerLanguage: 'typescript' },
  { id: 'c', label: 'C', monacoLanguage: 'c', compilerLanguage: 'c' },
  { id: 'cpp', label: 'C++', monacoLanguage: 'cpp', compilerLanguage: 'cpp' },
  { id: 'csharp', label: 'C#', monacoLanguage: 'csharp', compilerLanguage: 'csharp' },
  { id: 'php', label: 'PHP', monacoLanguage: 'php', compilerLanguage: 'php' },
  { id: 'r', label: 'R', monacoLanguage: 'r', compilerLanguage: 'r' },
  { id: 'html', label: 'HTML', monacoLanguage: 'html' },
  { id: 'css', label: 'CSS', monacoLanguage: 'css' },
  { id: 'json', label: 'JSON', monacoLanguage: 'json' },
  { id: 'sql', label: 'SQL', monacoLanguage: 'sql' },
  { id: 'bash', label: 'Bash / Shell', monacoLanguage: 'shell' },
  { id: 'text', label: 'Plain text', monacoLanguage: 'plaintext' },
])

export function courseLanguage(id: string): CourseLanguage | undefined {
  return COURSE_LANGUAGES.find((language) => language.id === id)
}

export const CALLOUT_VARIANTS = Object.freeze({
  info: { label: 'Info', icon: 'ⓘ' },
  tip: { label: 'Tip', icon: '✶' },
  warning: { label: 'Warning', icon: '⚠' },
  danger: { label: 'Danger', icon: '!' },
})

export function calloutVariant(tone: string) {
  return CALLOUT_VARIANTS[tone as keyof typeof CALLOUT_VARIANTS] ?? { label: 'Note', icon: '•' }
}
