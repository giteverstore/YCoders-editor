# Local course draft persistence

E4.1 stores course drafts in IndexedDB on the current browser and device. These records are not cloud-backed, synchronized, published, or available to the learner application. Clearing site data deletes them.

## Repository contract

`DraftRepository<TDocument>` provides asynchronous `create`, `get`, `list`, `save`, and `delete` operations. React uses dedicated persistence hooks; editor commands, blocks, and rich-text components have no storage knowledge. The interface contains no Firebase concepts and is intended to support a future remote implementation.

Every stored record includes its stable document ID, content type, schema version, positive repository revision, document JSON, creation timestamp, and last-saved timestamp. Creation rejects an existing ID. Save and delete require the caller's expected revision.

## IndexedDB layout

- Database: `ycoders-editor-studio-v2-drafts`
- Database version: `2`
- Object store: `course-drafts-v1`
- Migration metadata store: `draft-metadata-v2`
- Primary key: document ID
- Index: last-saved timestamp

The names are dedicated to Editor Studio V2 and do not overlap legacy Ycoders storage. Version 2 adds migration bookkeeping without rewriting the version-1 course store. The `idb` wrapper supplies promise-based, typed transactions. Rich-text and complete documents are stored directly in IndexedDB, never localStorage.

## Validation boundaries

Publication validation remains the strict E2 `contentEnvelopeSchema`. Storage uses the explicit `courseDraftDocumentSchema`: it accepts safe editing-time incompleteness such as an empty title, temporarily invalid slug, empty learning outcomes, or no modules, while still enforcing the V2 identity and schema version, course-only hierarchy, strict keys, size bounds, recognized blocks, safe rich text, UUID uniqueness, and non-executable data.

This separation does not weaken publication rules. A stored draft can be editable but not publication-ready, and the editor continues to display E2 validation issues.

## Revisions and conflicts

New records start at revision 1. Each successful save atomically reads the stored record, checks the expected revision, writes the new document, and increments the revision. A stale client receives `DraftConflictError` with expected and current revisions. Its working document is preserved and no retry or overwrite occurs. Reload Latest requires confirmation because it discards local working changes.

Delete uses the same revision check, preventing a stale course-list row or editor tab from deleting newer data.

## Dirty state and save timing

Dirty state is derived by comparing the full working document with the exact last-saved snapshot; it is not an input-event flag. Undoing back to the snapshot becomes clean. Saving captures a document snapshot. If editing continues while that asynchronous write is in flight, only the captured snapshot becomes saved and the newer working document remains dirty. A request guard prevents overlapping saves.

The first save creates exactly one record and then replaces `/courses/new` with `/courses/:id/edit`. Later saves use its authoritative revision. Refresh and route loading preserve the original document ID.

## Navigation protection

Dirty editors install both a React Router blocker and the browser `beforeunload` warning. This covers links, browser history, refresh, and closing the tab. Clean documents do not prompt. Successful first-save and delete transitions occur only after the controller marks the current snapshot clean.

## Future remote repository

A Firebase or API-backed repository can implement the same interface later, but E4.1 includes neither. A remote implementation must retain explicit revisions, typed conflicts, schema-version checks, stable IDs, and separation between editing-valid drafts and publication-ready documents. Migration and cross-device synchronization require a later milestone.
