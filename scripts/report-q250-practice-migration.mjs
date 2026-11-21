import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const option = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined }
const learnerRoot = resolve(option('--learner-root') ?? '.tmp-learner-postauth')
const outputPath = option('--output')
const questions = JSON.parse(await readFile(resolve(learnerRoot, 'src/practice/data/q250PracticeQuestions.json'), 'utf8'))
const contracts = await import(pathToFileURL(resolve(learnerRoot, 'src/compiler/function-mode/functionExecutionContract.js')).href)

const validatorMap = Object.freeze({
  exact: 'json-equivalent', 'two-sum': 'two-sum-pair', anagrams: 'anagram-groups', 'top-k': 'top-k', triplets: 'triplet-set',
  'float-close': 'numeric-tolerance', 'closest-points': 'closest-points', 'unordered-nested': 'unordered-nested', 'combination-set': 'combination-set',
  'ordered-int-rows': 'ordered-integer-rows', 'unordered-strings': 'unordered-strings', 'ordered-string-rows': 'ordered-string-rows',
  'graph-adjacency': 'graph-adjacency', 'coordinate-set': 'coordinate-set', 'course-order': 'course-order', 'alien-order': 'alien-order',
  'longest-palindrome': 'longest-palindrome', 'interval-set': 'interval-set', 'quadruplet-set': 'quadruplet-set', 'bst-values': 'bst-values',
  'quad-tree': 'quad-tree', reorganized: 'reorganized-string', happy: 'happy-string', 'permutation-set': 'permutation-set',
  'account-set': 'account-set', 'finite-ratios': 'finite-ratios', 'unordered-unique': 'unordered-unique-integers', 'edge-groups': 'edge-groups',
  'condition-matrix': 'condition-matrix',
})

const rows = questions.map((question) => {
  const contract = contracts.resolvePracticeExecutionContract(question)
  if (!contract) return { questionId: question.id, status: 'deferred', proposedExecutionMode: null, argumentTypes: [], resultType: null, comparator: null, confidence: 'none', mappingSource: 'No accepted learner function/stateful contract', deterministic: false, manualReviewRequired: true, reasonUnsupported: 'No accepted function or stateful execution definition', missingCapability: 'Declarative execution mapping for this question family', missingValidatorFamily: null, likelyContractExtension: 'unknown', intentionallyDeferred: true }
  const validation = contract.validation?.type ?? 'exact', mapped = validatorMap[validation]
  return { questionId: question.id, status: mapped ? 'supported' : 'deferred', proposedExecutionMode: contract.stateful ? 'stateful' : 'function', argumentTypes: contract.arguments.map(({ type }) => type), resultType: contract.returns.type, comparator: validation === 'exact' ? { kind: 'json-equivalent' } : validation === 'float-close' ? { kind: 'numeric-tolerance', tolerance: 1e-9 } : mapped ? { kind: 'semantic', validatorId: mapped } : null, confidence: mapped ? 'high' : 'none', mappingSource: 'Existing accepted browser execution contract and public fixtures', deterministic: Boolean(mapped), manualReviewRequired: true, ...(mapped ? {} : { reasonUnsupported: `Validator ${validation} has no frozen P2 mapping`, missingCapability: 'Declarative validator mapping', missingValidatorFamily: validation, likelyContractExtension: 'review-required', intentionallyDeferred: true }) }
})
const supported = rows.filter(({ status }) => status === 'supported')
const report = { generatedBy: 'report-q250-practice-migration-v1', destructive: false, total: rows.length, supported: supported.length, deferred: rows.length - supported.length, byExecutionMode: Object.fromEntries(['function', 'stateful'].map((mode) => [mode, supported.filter((row) => row.proposedExecutionMode === mode).length])), rows }
const serialized = `${JSON.stringify(report, null, 2)}\n`
if (outputPath) await writeFile(resolve(outputPath), serialized, { flag: 'w' })
else process.stdout.write(serialized)
