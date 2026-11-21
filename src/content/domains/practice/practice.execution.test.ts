import { describe, expect, it } from 'vitest'

import {
  PRACTICE_SEMANTIC_VALIDATORS, comparePracticeValues, executablePracticeTestCaseSchema, normalizeExactText,
  normalizeTrimmedText, practiceArgumentTypeSchema, practiceExecutionContractSchema, practiceLanguageIdSchema,
  practiceResultTypeSchema, practiceSemanticValidatorIdSchema,
  typedPracticeValueSchema,
} from './practice.execution'

describe('Practice execution contract', () => {
  it('closes the executable language vocabulary', () => {
    expect(practiceLanguageIdSchema.options).toEqual(['python', 'java', 'javascript', 'typescript', 'c', 'cpp', 'php', 'r', 'csharp'])
    expect(practiceLanguageIdSchema.safeParse('rust').success).toBe(false)
  })

  it('accepts only stdout, function, and stateful execution', () => {
    expect(practiceExecutionContractSchema.options.map((option) => option.shape.mode.value)).toEqual(['stdout', 'function', 'stateful'])
    expect(practiceExecutionContractSchema.safeParse({ mode: 'judge', serialization: 'canonical-json-v1' }).success).toBe(false)
  })

  it('defines only inventoried argument and result types', () => {
    expect(practiceArgumentTypeSchema.options).toContain('operation-rows')
    expect(practiceArgumentTypeSchema.options).toContain('tree-node-reference')
    expect(practiceResultTypeSchema.options).toContain('quad-tree')
    expect(practiceArgumentTypeSchema.safeParse('arbitrary-object').success).toBe(false)
    expect(practiceResultTypeSchema.safeParse('runtime-value').success).toBe(false)
  })

  it('rejects values that do not match their declared portable type', () => {
    expect(typedPracticeValueSchema.safeParse({ type: 'integer-array', value: [1, 2, 3] }).success).toBe(true)
    expect(typedPracticeValueSchema.safeParse({ type: 'integer-array', value: [1, 2.5] }).success).toBe(false)
    expect(typedPracticeValueSchema.safeParse({ type: 'string', value: 1 }).success).toBe(false)
  })

  it('implements exact text without internal whitespace collapse', () => {
    expect(normalizeExactText('a  b\r\n')).toBe('a  b')
    expect(comparePracticeValues({ kind: 'exact-text', case: 'sensitive', newline: 'normalize-crlf' }, 'a  b\r\n', 'a  b\n')).toBe(true)
    expect(comparePracticeValues({ kind: 'exact-text', case: 'sensitive', newline: 'normalize-crlf' }, 'a  b', 'a b')).toBe(false)
  })

  it('trims only the whole text value', () => {
    expect(normalizeTrimmedText('  a  b \n')).toBe('a  b')
    expect(comparePracticeValues({ kind: 'trimmed-text', case: 'sensitive', newline: 'normalize-crlf' }, '  a  b ', 'a  b')).toBe(true)
    expect(comparePracticeValues({ kind: 'trimmed-text', case: 'sensitive', newline: 'normalize-crlf' }, 'a  b', 'a b')).toBe(false)
  })

  it('compares JSON structurally with ordered arrays and unordered object keys', () => {
    expect(comparePracticeValues({ kind: 'json-equivalent' }, { b: [1, 2], a: null }, { a: null, b: [1, 2] })).toBe(true)
    expect(comparePracticeValues({ kind: 'json-equivalent' }, [1, 2], [2, 1])).toBe(false)
  })

  it('requires an explicit positive numeric tolerance', () => {
    expect(comparePracticeValues({ kind: 'numeric-tolerance', tolerance: 0.01 }, 1, 1.009)).toBe(true)
    const invalid = executablePracticeTestCaseSchema.safeParse({ id: '20000000-0000-4000-8000-000000000001', label: 'bad', mode: 'stdout', stdin: '', expectedOutput: '', comparison: { kind: 'numeric-tolerance', tolerance: 0 } })
    expect(invalid.success).toBe(false)
  })

  it('has documented metadata for every accepted semantic validator', () => {
    expect(Object.keys(PRACTICE_SEMANTIC_VALIDATORS).sort()).toEqual([...practiceSemanticValidatorIdSchema.options].sort())
    Object.values(PRACTICE_SEMANTIC_VALIDATORS).forEach((entry) => { expect(entry.meaning.length).toBeGreaterThan(20); expect(entry.resultTypes.length).toBeGreaterThan(0) })
  })

  it.each(['python', 'java', 'javascript', 'typescript', 'c', 'cpp', 'php', 'r', 'csharp'])('uses the same canonical JSON fixture for %s', (languageId) => {
    expect(practiceLanguageIdSchema.parse(languageId)).toBe(languageId)
    const fixture = { id: '20000000-0000-4000-8000-000000000001', label: languageId, mode: 'function', arguments: [{ type: 'integer-matrix', value: [[1, 2], [3, 4]] }], expectedResult: { type: 'integer-array', value: [3, 7] }, comparison: { kind: 'json-equivalent' } }
    expect(executablePracticeTestCaseSchema.safeParse(fixture).success).toBe(true)
  })
})
