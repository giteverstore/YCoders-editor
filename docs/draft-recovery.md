# Draft recovery and reliability

E4.2 adds portable JSON backups, safe restoration, duplication, cross-tab change notices, accessible navigation confirmation, and explicit IndexedDB upgrade infrastructure. These features remain local-first and do not provide cloud synchronization.

## Backup format

Course backups use a strict JSON envelope:

```json
{
  "format": "ycoders-course-draft",
  "formatVersion": 1,
  "exportedAt": "2026-11-16T14:00:00.000Z",
  "draft": {
    "id": "uuid",
    "contentType": "course",
    "schemaVersion": "2.0.0",
    "revision": 3,
    "document": {},
    "createdAt": "ISO timestamp",
    "lastSavedAt": "ISO timestamp"
  }
}
```

The full E4.1 draft record is validated before download. Filenames use `ycoders-course-{safe-slug}-r{revision}.json`. Exporting is read-only and contains no credentials, IndexedDB internals, UI selection, undo history, or browser identifiers.

Imports are limited to 5 MB and pass JSON parsing, export-envelope validation, exact export-version checks, exact content-schema checks, and the editing-valid Course draft schema. Unsafe rich text and arbitrary fields are rejected with paths. Backups are recovery files, not synchronized cloud records.

Two restore choices are explicit:

- Restore as new generates a new document UUID and resets document audit timestamps/actors. Module, section, lesson, and block IDs are preserved because they identify structure inside the independent course.
- Restore original identity keeps the backed-up document UUID, but only when it does not already exist locally. Import never overwrites an existing draft.

Both modes create a fresh local repository record at revision 1; the exported revision is historical backup metadata only.

## Duplication

Duplicate creates a new document UUID, adds “Copy” to the title, and creates a collision-resistant slug using the new UUID prefix. Internal structural IDs are preserved because there is no shared document identity or mutable reference between the deep-cloned records. Document version, authoring/audit metadata, publication version/date, and visibility are reset so the copy cannot share future publication identity with its source. The source remains unchanged.

## Cross-tab behavior

Repository create, update, and delete operations publish a version-1 notification through `BroadcastChannel`. Browsers without it use a short-lived localStorage event as a notification transport only; documents are never stored there. Messages contain only source-tab ID, action, document ID, revision, and timestamp. The sender ignores its own source ID.

When another tab changes an open course, the editor displays a nonblocking warning and preserves all working content. Reloading another tab's revision is explicit and confirmed. Optimistic repository revisions remain the authoritative conflict boundary if notification delivery is unavailable or delayed.

## Navigation confirmation

Internal links and browser back/forward actions use a modal alert dialog with focus placement, focus trapping, Escape-to-stay, and explicit “Stay and continue editing” and “Discard changes and leave” actions. Refresh and tab/window closing retain the browser-native `beforeunload` warning. Clean documents do not prompt.

## IndexedDB upgrades

The database is now version 2. Upgrade steps are monotonic and based on `oldVersion`:

- Version 1 creates and retains `course-drafts-v1` plus its last-saved index.
- Version 2 adds `draft-metadata-v2` as future migration bookkeeping infrastructure.

Existing course records are neither rewritten nor revalidated during the database upgrade. Content-schema migration is intentionally separate and remains unimplemented. Tests build a real version-1 database, upgrade it, and verify that its draft survives unchanged.

## Limitations and future cloud migration

Backups are manual snapshots. There is no automatic backup schedule, autosave, merge UI, live collaborative editing, cloud storage, or device synchronization. A future cloud repository must preserve stable document identities, explicit revisions, safe draft validation, conflict refusal, and import/export versioning rather than treating local backup revision numbers as server revisions.
