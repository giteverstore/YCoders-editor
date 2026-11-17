# V2 content architecture

The Editor Studio V2 contract is independent from the existing Ycoders learner application. The learner application does not yet understand or render these documents; integration will require an explicit adapter or learner-side V2 implementation.

## Envelope and identifiers

Every document has a UUID `id`, `contentType`, exact `schemaVersion` (`2.0.0`), positive `documentVersion`, title, slug, lifecycle status, audit timestamps/actors, common metadata, and domain-specific `content`. Structural entities and blocks also use UUIDs, so identity never depends on array position. Array order is the canonical display order; authors do not maintain numeric order fields.

Unsupported schema versions are rejected rather than coerced. Future migrations must be explicit, version-to-version functions.

## Lifecycle

`status.authoringState` models draft, published, unpublished, disabled, or archived authoring state. `status.visibility` separately models private, scheduled, public, unlisted, or hidden delivery. `hasUnpublishedChanges` and `publishedDocumentVersion` allow a publicly visible version to coexist with a newer working draft. E2 defines state only; it performs no publishing behavior.

## Domain structures

- Course: metadata and ordered modules. Each module explicitly uses either direct lessons or ordered sections containing lessons; the two shapes cannot be mixed. Flexible blocks exist only on lessons.
- Practice: language configuration, examples, constraints, hints, per-language starter/reference code, public test cases, declarative comparison settings, and instructional blocks.
- Challenge: ISO `YYYY-MM-DD` schedule date, topics, languages, explicit rewards, hints, starter code, and expected-output or public test-case verification.
- Project: learning objectives, language-aware starter workspace, ordered checkpoints/tasks, hints, completion criteria, and declarative validators. Validators cannot contain executable scripts.

## Blocks and rich text

All blocks contain UUID `id`, discriminating `type`, numeric `schemaVersion`, and strictly validated `data`. Supported types are rich text, image, code, callout, divider, table, quiz, exercise, expected output, and solution. The registry supplies UI metadata, default-data factories, schemas, categories, and per-domain permissions.

Rich text is constrained ProseMirror-compatible JSON, not HTML. Approved nodes are doc, paragraph, heading levels 1–4, bullet/ordered lists, list item, blockquote, text, and hard break. Approved marks are bold, italic, underline, inline code, and links. Links allow only HTTP, HTTPS, and mailto. The link metadata and ordered-list start attributes emitted by Tiptap are narrowly allowlisted; arbitrary attributes remain rejected. Structural nesting, depth (12), node collections, text lengths, and total serialized size (100 KB) are bounded. Video, math, layout, script, arbitrary HTML, and unknown nodes are rejected.

## Templates

The template registry describes non-movable fixed fields, required metadata, structural containers, and flexible vertical regions. Modules, lessons, checkpoints, and tasks are structural entities rather than blocks. This lets the future hybrid editor render fixed inspectors alongside controlled block canvases without making the contract generic page-builder data.

## Validation

`validateContent(unknown)` validates the discriminated envelope and matching domain in one pass. It returns either parsed data or stable issues containing a code, message, and field path while retaining the original Zod error. Validation includes exact versions, strict unknown-key rejection, block permissions, safe rich text, configured-language references, cross-field verification rules, and duplicate structural/block IDs.

## Future integration

E2 contains no Firebase model, persistence identifier, save state, execution engine, scheduler, reward issuer, or publishing transport. Future learner integration should consume only validated documents, select an explicit supported schema version, and render blocks through a non-executable allowlist. Published snapshots should remain immutable even while an author edits a newer document version.
