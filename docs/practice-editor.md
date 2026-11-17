# Practice Editor architecture

E5 adds Practice question authoring using the existing E2 envelope and `practiceContentSchema`. It does not copy the learner application's editor and does not publish or execute code.

## Routes and sources

`/practice/local/new`, `/practice/local/:id/edit`, `/practice/cloud/new`, and `/practice/cloud/:id/edit` explicitly select IndexedDB or the authenticated V2 API. Legacy `/practice/new` and `/practice/:id/edit` remain local. `/practice` keeps local and cloud lists separate.

## Fixed template and flexible content

Fixed positions cover the schema's title, slug, difficulty, tags, topics, estimated time, language configuration, examples, constraints, hints, starter code, reference solutions, public tests, and verification settings. E2 has no separate problem-type field, so none is invented.

The instructional region uses only Practice-approved E2 registry blocks. Tiptap edits rich text, dnd-kit reorders blocks vertically, and immutable commands support insert, edit, duplicate, delete, undo, and redo. Unsupported HTML, video, math, and horizontal layout are absent.

## Languages, Monaco, tests, and verification

Supported languages are explicit schema entries with one default. Starter-code and reference-solution records refer to those IDs; duplicate languages and unsupported references are schema errors. Monaco is lazy-loaded for code fields, uses one generic editor worker, and performs no execution or network compilation.

Public tests contain stable IDs, labels, typed input representations, and expected-output representations. E5 exposes only the existing `exact`, `trimmed`, and `json-equivalent` comparison strategies, case sensitivity, and optional numeric tolerance. No scripts or hidden tests exist.

## Persistence and safety

IndexedDB database version 3 adds `practice-drafts-v1` without changing the Course store. Practice supports create, load, list, save, delete, conflicts, export/import, duplication, navigation protection, and shared cross-tab notifications.

The server continues using `editorV2Drafts/{contentId}`, now validates Course or Practice documents and filters list queries by `contentType`. Cloud operations retain ID-token verification, roles, revisions, explicit Save creation, and collision-safe transfers. Local and cloud revisions are independent; no automatic synchronization occurs.

Development and tests remain guarded to `demo-ycoders-editor-v2` emulators. Production still requires deployed-rule, WIF, IAM, Vercel identity, authorized-domain, and environment approval.

## Limitations

Preview is static and does not claim learner-renderer parity. Code is never run. There is no publishing, autosave, hidden judging, asset upload, or learner submission. Challenge and Project editors remain future work.
