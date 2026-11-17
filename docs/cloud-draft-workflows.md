# Local and cloud Course drafts

E4.4 connects the Course Editor to the V2 draft API without replacing IndexedDB. Draft source is always explicit: `local` and `cloud` are separate repositories, and the same UUID may exist in both without implying synchronization.

## Routes

- `/courses/local/new` and `/courses/local/:id/edit` select IndexedDB.
- `/courses/cloud/new` and `/courses/cloud/:id/edit` select the authenticated V2 API.
- `/courses/new` and `/courses/:id/edit` remain backward-compatible local routes.

Opening a cloud-new route does not create anything. The UUID is generated in the editor, and the API creates revision 1 only after Save. Cloud saves and deletes send the authoritative expected revision. Local revisions never become cloud revisions.

## Explicit transfers

**Upload Local Draft to Cloud** validates the editing-valid Course document and checks the exact cloud ID before creating it. An existing destination is never overwritten. The user may cancel or explicitly create an independent copy with a new UUID. The local source is unchanged.

**Save Cloud Draft as Local Copy** snapshots the complete cloud document into IndexedDB at local revision 1. If that ID already exists locally, the copy receives a new UUID. The cloud source is unchanged.

There is no background synchronization, autosave, upload-on-open, or merge behavior.

## Conflicts and permissions

HTTP 409 is a terminal stale-revision state for the current editor session. The working document stays in memory, repeated Save is disabled, and the user can export that working document as JSON or confirm reloading the latest cloud revision. The editor never retries, merges, or overwrites automatically. Edits made while Save is in flight remain dirty because the saved fingerprint represents only the captured request document.

`SUPER_ADMIN`, `CONTENT_ADMIN`, and `CONTENT_EDITOR` may read/create/edit/delete cloud drafts. `CONTENT_REVIEWER` has read-only cloud UI. These frontend controls are only presentation; the API independently verifies the Firebase ID token, revocation, exact `adminRole`, and permission for every request.

## Emulator development and readiness guard

Firebase browser variables alone do not enable cloud drafts. Set:

```text
VITE_ENABLE_CLOUD_DRAFTS=true
VITE_FIREBASE_PROJECT_ID=demo-ycoders-editor-v2
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
```

Development fails closed unless the project starts with `demo-` and Auth uses a loopback emulator. Preview remains disabled unless `VITE_ENABLE_PREVIEW_CLOUD_DRAFTS=true` is also deliberately supplied for an approved isolated preview backend. Never point development or tests at the real Ycoders project.

Before Production activation, security owners must verify deployed Firestore and Storage rules, the Firebase project, authorized domains, Vercel project identity, WIF provider trust conditions, runtime service account, least-privilege IAM, environment separation, and revocation behavior. Production approval is operational and cannot be inferred from these switches.

## Limitations

Cloud drafts do not publish or alter content in the learner application. There is no asset upload, autosave, automatic recovery sync, cross-source merge, Practice editor, Challenge editor, or Project editor.
