# Project Editor

The Project Editor uses the E2 Project schema as its content contract. Fixed overview fields remain separate from the instructional block canvas. Checkpoints and tasks are structural children with UUID identities; their array order is presentation order.

Starter workspace files are draft JSON (`path`, configured `languageId`, and content) edited with Monaco. Paths must be relative and cannot contain `..`; files are not uploaded or executed. E2 does not define runtime identifiers, entrypoints, or file IDs, so the editor does not invent them.

Validators are declarative descriptors only: `file-exists`, `file-contains`, `output-equals`, and `tests-pass`. Task validators and final Project validators can be authored, but are never executed. E2 has no checkpoint validators, implementation-contract object, or task completion-condition model.

Local drafts use a migration-safe IndexedDB v5 Project store. Cloud drafts use the authenticated V2 API and isolated `editorV2Drafts` collection with optimistic revisions. Local and cloud drafts retain separate identities and revisions; there is no automatic synchronization or autosave.

Preview is a read-only approximation showing metadata, workspace summaries, checkpoints, tasks, hints, validators, and completion criteria. Future learner integration must define runtime execution, validator interpretation, asset handling, and publishing separately.

## Portability and explicit transfers

Saved local Projects can be exported as a versioned `ycoders-project-draft` JSON envelope containing the content schema version, complete saved record, saved revision, and export timestamp. Imports enforce the 5 MB limit, validate the full E2 schema and rich-text block schemas, reject unknown validators, traversal paths, duplicate workspace paths, unsupported versions, and collisions. Restore-as-new changes only the Project identity and lifecycle metadata; checkpoint, task, hint, and block identities remain stable. Restore-original succeeds only when that Project ID is absent locally. Imported records begin at revision 1.

Duplication deep-copies the Project, keeps scoped internal structure IDs, assigns a new Project ID and unique copy slug, resets lifecycle/publication references and document version, and creates an independent revision-1 record.

Local-to-cloud upload requires draft-write permission, never deletes the local draft, checks for the cloud ID first, and only generates a fresh ID after explicit collision confirmation. Cloud-to-local backup leaves the cloud record unchanged, retaining its ID when available locally and generating a fresh ID on collision. Transfers are one-shot copies: revisions are not merged and no synchronization or autosave is introduced.
