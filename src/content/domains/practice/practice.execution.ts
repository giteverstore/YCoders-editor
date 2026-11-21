import { z } from 'zod'

import { uuidSchema } from '../../core/identifiers.js'

export const practiceLanguageIdSchema = z.enum(['python', 'java', 'javascript', 'typescript', 'c', 'cpp', 'php', 'r', 'csharp'])
export type PracticeLanguageId = z.infer<typeof practiceLanguageIdSchema>

export const practiceExecutionModeSchema = z.enum(['stdout', 'function', 'stateful'])
export const practiceArgumentTypeSchema = z.enum([
  'integer', 'number', 'boolean', 'string', 'integer-array', 'number-array', 'string-array', 'integer-matrix', 'string-matrix',
  'linked-list', 'linked-list-array', 'cyclic-linked-list', 'random-linked-list', 'binary-tree', 'level-order-tree', 'bst',
  'tree-node-reference', 'adjacency-list', 'operation-rows', 'cycle-position',
])
export const practiceResultTypeSchema = z.enum([
  'void', 'integer', 'number', 'boolean', 'string', 'integer-array', 'number-array', 'string-array', 'integer-matrix', 'string-matrix',
  'linked-list', 'random-linked-list', 'level-order-tree', 'returned-node', 'adjacency-list', 'quad-tree',
])

export const practiceAdapterFamilySchema = z.enum([
  'return-value', 'mutated-argument', 'valid-prefix-mutation', 'linked-structure', 'tree-structure', 'graph-structure',
  'stateful-object', 'semantic-collection', 'quad-tree-structure',
])

export const practiceSemanticValidatorIdSchema = z.enum([
  'two-sum-pair', 'unordered-nested', 'triplet-set', 'combination-set', 'quadruplet-set', 'ordered-integer-rows',
  'coordinate-set', 'interval-set', 'permutation-set', 'ordered-string-rows', 'anagram-groups', 'unordered-strings',
  'unordered-unique-integers', 'top-k', 'closest-points', 'longest-palindrome', 'finite-ratios', 'account-set',
  'course-order', 'alien-order', 'edge-groups', 'graph-adjacency', 'bst-values', 'quad-tree', 'reorganized-string',
  'happy-string', 'condition-matrix',
])
export type PracticeSemanticValidatorId = z.infer<typeof practiceSemanticValidatorIdSchema>
export const PRACTICE_SEMANTIC_VALIDATORS: Readonly<Record<PracticeSemanticValidatorId, { meaning: string; resultTypes: readonly string[] }>> = Object.freeze({
  'two-sum-pair': { meaning: 'Two distinct returned indexes identify values whose sum equals the target.', resultTypes: ['integer-array'] },
  'unordered-nested': { meaning: 'Nested rows compare as multisets after canonical row normalization.', resultTypes: ['integer-matrix', 'string-matrix'] },
  'triplet-set': { meaning: 'Unique integer triplets compare without row ordering.', resultTypes: ['integer-matrix'] },
  'combination-set': { meaning: 'Unique combinations compare without row ordering.', resultTypes: ['integer-matrix'] },
  'quadruplet-set': { meaning: 'Unique integer quadruplets compare without row ordering.', resultTypes: ['integer-matrix'] },
  'ordered-integer-rows': { meaning: 'Integer rows retain row and element order.', resultTypes: ['integer-matrix'] },
  'coordinate-set': { meaning: 'Coordinate rows compare without row ordering.', resultTypes: ['integer-matrix'] },
  'interval-set': { meaning: 'Intervals compare as canonical interval rows.', resultTypes: ['integer-matrix'] },
  'permutation-set': { meaning: 'Unique permutations compare without permutation ordering.', resultTypes: ['integer-matrix', 'string-matrix'] },
  'ordered-string-rows': { meaning: 'String rows retain row and element order.', resultTypes: ['string-matrix'] },
  'anagram-groups': { meaning: 'String groups compare after sorting members and groups.', resultTypes: ['string-matrix'] },
  'unordered-strings': { meaning: 'Strings compare as a multiset.', resultTypes: ['string-array'] },
  'unordered-unique-integers': { meaning: 'Unique integers compare without ordering.', resultTypes: ['integer-array'] },
  'top-k': { meaning: 'The result contains exactly k values with the required highest frequencies.', resultTypes: ['integer-array'] },
  'closest-points': { meaning: 'The result contains the required number of points at minimum squared distance.', resultTypes: ['integer-matrix'] },
  'longest-palindrome': { meaning: 'The result is a palindrome substring with maximum required length.', resultTypes: ['string'] },
  'finite-ratios': { meaning: 'Finite numeric ratios compare elementwise using the declared deterministic relative bound.', resultTypes: ['number-array'] },
  'account-set': { meaning: 'Merged accounts compare by owner and canonical email set.', resultTypes: ['string-matrix'] },
  'course-order': { meaning: 'The result is a valid topological order for all prerequisites.', resultTypes: ['integer-array'] },
  'alien-order': { meaning: 'The result is a valid character order satisfying the supplied dictionary constraints.', resultTypes: ['string'] },
  'edge-groups': { meaning: 'Critical and pseudo-critical edge index sets compare independently without order.', resultTypes: ['integer-matrix'] },
  'graph-adjacency': { meaning: 'Adjacency rows compare after sorting neighbor identifiers.', resultTypes: ['adjacency-list'] },
  'bst-values': { meaning: 'The returned tree contains the required binary-search-tree value structure.', resultTypes: ['level-order-tree', 'returned-node'] },
  'quad-tree': { meaning: 'Canonical quad-tree leaf/value structure compares recursively.', resultTypes: ['quad-tree'] },
  'reorganized-string': { meaning: 'The result preserves source character counts and has no equal adjacent characters.', resultTypes: ['string'] },
  'happy-string': { meaning: 'The result obeys character limits and contains no run longer than two.', resultTypes: ['string'] },
  'condition-matrix': { meaning: 'The matrix contains each required value once and satisfies all row and column precedence constraints.', resultTypes: ['integer-matrix'] },
})

const textComparison = z.object({
  kind: z.enum(['exact-text', 'trimmed-text']),
  case: z.enum(['sensitive', 'insensitive']).default('sensitive'),
  newline: z.literal('normalize-crlf').default('normalize-crlf'),
}).strict()
const jsonComparison = z.object({ kind: z.literal('json-equivalent') }).strict()
const numericComparison = z.object({ kind: z.literal('numeric-tolerance'), tolerance: z.number().finite().positive() }).strict()
const semanticComparison = z.object({ kind: z.literal('semantic'), validatorId: practiceSemanticValidatorIdSchema, parameters: z.record(z.string(), z.json()).optional() }).strict()
export const practiceComparisonSchema = z.discriminatedUnion('kind', [textComparison, jsonComparison, numericComparison, semanticComparison])

const integer = (value: unknown) => Number.isSafeInteger(value)
const finiteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const arrayOf = (value: unknown, predicate: (item: unknown) => boolean) => Array.isArray(value) && value.every(predicate)
const matrixOf = (value: unknown, predicate: (item: unknown) => boolean) => arrayOf(value, (row) => arrayOf(row, predicate))
export function isPracticeValueOfType(type: string, value: unknown): boolean {
  if (type === 'integer' || type === 'cycle-position') return integer(value)
  if (type === 'number') return finiteNumber(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'string') return typeof value === 'string'
  if (type === 'integer-array') return arrayOf(value, integer)
  if (type === 'number-array') return arrayOf(value, finiteNumber)
  if (type === 'string-array') return arrayOf(value, (item) => typeof item === 'string')
  if (type === 'integer-matrix' || type === 'adjacency-list') return matrixOf(value, integer)
  if (type === 'string-matrix') return matrixOf(value, (item) => typeof item === 'string')
  if (type === 'linked-list' || type === 'cyclic-linked-list' || type === 'level-order-tree' || type === 'bst' || type === 'tree-node-reference' || type === 'returned-node') return Array.isArray(value) || value === null
  if (type === 'linked-list-array' || type === 'operation-rows') return Array.isArray(value)
  if (type === 'random-linked-list') return matrixOf(value, (item) => item === null || integer(item))
  if (type === 'binary-tree') return Array.isArray(value) || value === null
  if (type === 'quad-tree') return value === null || (typeof value === 'object' && !Array.isArray(value))
  if (type === 'void') return value === null
  return false
}
export const typedPracticeValueSchema = z.object({ type: practiceArgumentTypeSchema, value: z.json() }).strict().superRefine((item, context) => { if (!isPracticeValueOfType(item.type, item.value)) context.addIssue({ code: 'custom', path: ['value'], message: `Value does not match Practice type ${item.type}` }) })
export const typedPracticeResultSchema = z.object({ type: practiceResultTypeSchema, value: z.json() }).strict().superRefine((item, context) => { if (!isPracticeValueOfType(item.type, item.value)) context.addIssue({ code: 'custom', path: ['value'], message: `Result does not match Practice type ${item.type}` }) })

const argumentSpecSchema = z.object({ name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), type: practiceArgumentTypeSchema, nullable: z.boolean().default(false) }).strict()
const resultSpecSchema = z.object({ type: practiceResultTypeSchema, nullable: z.boolean().default(false), ordering: z.enum(['ordered', 'validator-defined']).default('ordered') }).strict()

const stdoutExecutionSchema = z.object({
  mode: z.literal('stdout'), serialization: z.literal('utf8-text-v1'), sourceShape: z.literal('program'),
}).strict()
const functionExecutionSchema = z.object({
  mode: z.literal('function'), serialization: z.literal('canonical-json-v1'), entrypoint: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  adapterFamily: practiceAdapterFamilySchema, arguments: z.array(argumentSpecSchema).max(16), result: resultSpecSchema,
  resultSource: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('return-value') }).strict(),
    z.object({ kind: z.literal('mutated-argument'), argumentIndex: z.number().int().nonnegative() }).strict(),
  ]),
}).strict().superRefine((value, context) => {
  if (value.resultSource.kind === 'mutated-argument' && value.resultSource.argumentIndex >= value.arguments.length) context.addIssue({ code: 'custom', path: ['resultSource', 'argumentIndex'], message: 'Mutation target must reference a declared argument' })
})
const statefulExecutionSchema = z.object({
  mode: z.literal('stateful'), serialization: z.literal('canonical-json-v1'), objectType: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  constructorArguments: z.array(argumentSpecSchema).max(16), operations: z.array(z.object({ operationId: z.string().min(1).max(80), method: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), arguments: z.array(argumentSpecSchema).max(16), result: resultSpecSchema.optional() }).strict()).min(1).max(100),
  result: resultSpecSchema,
}).strict()
export const practiceExecutionContractSchema = z.discriminatedUnion('mode', [stdoutExecutionSchema, functionExecutionSchema, statefulExecutionSchema])

const testBase = { id: uuidSchema, label: z.string().min(1).max(100) }
const stdoutTestSchema = z.object({ ...testBase, mode: z.literal('stdout'), stdin: z.string().max(50_000), expectedOutput: z.string().max(50_000), comparison: practiceComparisonSchema }).strict()
const functionTestSchema = z.object({ ...testBase, mode: z.literal('function'), arguments: z.array(typedPracticeValueSchema).max(16), expectedResult: typedPracticeResultSchema, comparison: practiceComparisonSchema }).strict()
const statefulTestSchema = z.object({ ...testBase, mode: z.literal('stateful'), constructorArguments: z.array(typedPracticeValueSchema).max(16), operations: z.array(z.object({ operationId: z.string().min(1).max(80), arguments: z.array(typedPracticeValueSchema).max(16) }).strict()).min(1).max(100), expectedResult: typedPracticeResultSchema, comparison: practiceComparisonSchema }).strict()
export const executablePracticeTestCaseSchema = z.discriminatedUnion('mode', [stdoutTestSchema, functionTestSchema, statefulTestSchema])

export const PRACTICE_EXECUTION_ERROR_CODES = Object.freeze({
  language: 'practice.language-unsupported', mode: 'practice.execution-mode-unsupported', argumentType: 'practice.argument-type-unsupported',
  returnType: 'practice.return-type-unsupported', comparator: 'practice.comparator-unsupported', comparatorConfig: 'practice.comparator-config-invalid',
  validator: 'practice.semantic-validator-unsupported', dtoSafety: 'practice.dto-safety-violation', legacy: 'practice.execution-contract-missing',
})

export function normalizeExactText(value: unknown) { return String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '') }
export function normalizeTrimmedText(value: unknown) { return normalizeExactText(value).trim() }
export function comparePracticeValues(comparison: z.infer<typeof practiceComparisonSchema>, actual: unknown, expected: unknown): boolean {
  if (comparison.kind === 'numeric-tolerance') return typeof actual === 'number' && typeof expected === 'number' && Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= comparison.tolerance
  if (comparison.kind === 'json-equivalent') return canonicalJson(actual) === canonicalJson(expected)
  if (comparison.kind === 'semantic') throw new TypeError(`Semantic validator ${comparison.validatorId} requires its deterministic registry implementation`)
  const normalize = comparison.kind === 'trimmed-text' ? normalizeTrimmedText : normalizeExactText
  const [left, right] = [normalize(actual), normalize(expected)].map((value) => comparison.case === 'insensitive' ? value.toLocaleLowerCase('en-US') : value)
  return left === right
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}
