# Practice execution contract

P2 freezes the browser-safe Practice contract without adding learner routes, persistence, gateway delivery, or deployment.

## Vocabulary

Practice execution languages are exactly `python`, `java`, `javascript`, `typescript`, `c`, `cpp`, `php`, `r`, and `csharp`. The closed execution modes are `stdout`, `function`, and `stateful`.

`stdout` runs a complete program, supplies UTF-8 stdin, and captures stdout. `function` invokes a named entrypoint with typed canonical-JSON arguments and captures either its return value or a declared mutated argument. `stateful` constructs a named object, applies a declared operation trace, and captures declared operation results. Run always executes and evaluates every configured public test once; its result is passed, failed, or error. Persistence is not part of this contract.

The inventoried argument types are scalar integer/number/boolean/string values; scalar arrays and matrices; linked-list, cyclic-list, random-list, tree, BST, node-reference, adjacency-list, operation-row, and cycle-position representations. Results use the corresponding result-bearing types plus void, returned-node, and quad-tree. Function adapter families describe stable result semantics (return value, mutated argument, valid-prefix mutation, linked/tree/graph/stateful structures, semantic collections, and quad trees), not runtime implementation names.

All non-text structured values use canonical JSON v1. JSON objects are unordered by key and arrays remain ordered. Nullability is declared in argument/result specifications. Mutation output identifies a declared argument index. Collection order is either ordered or validator-defined.

## Comparators

- `exact-text`: normalizes CRLF/CR to LF and ignores at most one terminal newline. It preserves all other whitespace. Case policy is explicit.
- `trimmed-text`: applies exact-text newline handling, then removes whitespace only around the entire value. Internal and per-line whitespace is preserved. Case policy is explicit.
- `json-equivalent`: structural JSON equality; object key order is irrelevant, array order is significant, and JSON null/boolean/number/string semantics apply.
- `numeric-tolerance`: finite numeric values differ by no more than an explicit positive tolerance.
- `semantic`: selects a closed declarative validator ID. No executable comparator code is accepted.

The semantic registry in `practice.execution.ts` documents each accepted validator's mathematical meaning and supported result types. The existing browser implementations supply deterministic evaluation. Unregistered IDs fail schema validation.

## Migration

The envelope schema remains `2.0.0`. Existing Practice documents remain readable through the retained legacy fields. They are not learner-deliverable unless `execution` and `executablePublicTests` are explicitly present and mutually mode-consistent. No execution metadata is inferred from generic text/JSON examples.

New learner DTOs contain only publication identity, learner presentation fields, starter code, safe blocks/assets, explicit execution, and public tests. Reference solutions, draft/audit metadata, private paths, and trusted content are excluded.

## Q250 classification

The current 250-question learner bank resolves as follows:

- Immediately representable with typed direct comparison: 179
- Representable after mapping to declared semantic/numeric validators: 35
- Currently unsupported/deferred: 36
- Execution modes among the 214 resolved questions: 197 function, 17 stateful
- Every question provides starters for all nine accepted Practice languages.

Resolved adapter families are: 148 return-value, 17 stateful, 11 linked-list, 22 tree, 4 semantic-collection, 1 graph, 8 mutation, 2 valid-prefix mutation, and 1 quad-tree.

The semantic group counts are recorded by the learner contract audit: two-sum 1, anagrams 1, top-k 1, triplets 1, floating tolerance 2, closest-points 1, unordered-nested 3, combinations 1, ordered integer rows 1, unordered strings 3, ordered string rows 2, graph adjacency 1, coordinates 1, course order 1, alien order 1, longest palindrome 1, intervals 1, quadruplets 1, BST values 2, quad tree 1, reorganized string 1, happy string 1, permutations 1, accounts 1, finite ratios 1, unordered unique values 1, edge groups 1, and condition matrix 1.

The former test expectation of 191 was stale. Commit `9edb5f7` introduced 214 definitions and was titled accordingly, while two assertions still said 191. Both the exported ID set and runtime resolution produce 214; only those assertions were corrected.
