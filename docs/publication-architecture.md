# V2 publication architecture — E9.1.2 contract freeze

E9.1.2 froze these contracts. E9.2 now implements the isolated, server-side Auth/Firestore/Storage emulator backend. It adds no learner delivery, assignment, certification, reward, asset deletion, or publishing UI.

> **V2 publications are not learner-visible in E9.2.** All read routes are authenticated Admin/history routes.

## E9.2 implemented backend

The Admin SDK backend uses `editorV2Publications`, numeric `versions/{publicationVersion}`, `editorV2PublicationAudit`, and `editorV2PublicationRequests`. Vercel-compatible routes are:

```text
POST /api/v2/publications/{contentId}/publish
GET  /api/v2/publications/{contentId}
GET  /api/v2/publications/{contentId}/versions
GET  /api/v2/publications/{contentId}/versions/{version}
```

Firebase ID tokens are verified server-side with revocation checking. `SUPER_ADMIN` and `CONTENT_ADMIN` can publish; all four Admin roles can read pointer/history metadata. There is no unauthenticated or learner endpoint.

The publish state machine is:

1. Read the authoritative draft and exact revision.
2. Validate E2 schema, stable IDs, domain compatibility and private assets.
3. Read and hash asset bytes, build the deterministic manifest, and verify the three-step confirmation.
4. Transactionally reserve a unique numeric version and durable idempotency request. The pointer is the serialization point.
5. Copy content-addressed assets and create the canonical artifact with generation-zero preconditions.
6. Verify hashes, then transactionally create the immutable version, activate the pointer, append audit, and commit the request result.

No active pointer can reference a missing version because activation and version creation share the final Firestore transaction. Storage and Firestore cannot share a transaction: a failure after reservation leaves an `IN_PROGRESS` request that tracks the recoverable attempt; immutable objects may be safely reused on retry. A lost response is recovered by replaying the same request ID and payload. Payload mismatch is rejected. Failed confirmation or validation occurs before reservation and creates no publication state.

Private source assets are never mutated. Published copies have no public URL or ACL, are content-addressed by verified SHA-256, and are reused across versions. External URLs and missing/mismatched assets block publication. Emulator browser rules remain deny-all for Firestore and Storage, while Admin SDK operations bypass those client rules.

Evidence labels are **Confirmed by inspected source**, **Approved design decision**, **Requires learner implementation**, and **Requires deployed verification**.

## Identity and namespaces

Every historical reference is the tuple `{ namespace, contentType, contentId, publicationVersion }`. `namespace` is `legacy` or `v2`; V2 writers always emit `v2`. `contentId` is the stable global UUID, `contentType` is the domain, and `publicationVersion` is a positive integer. A resolver must select a namespace before lookup: no V2-to-legacy fallback is allowed.

New learner state will eventually store this complete identity. Existing learner state is unchanged. Propagation and mixed legacy/V2 resolution **Require learner implementation**.

## Storage contract

Approved V2 namespaces are:

```text
editorV2Publications/{contentId}
editorV2Publications/{contentId}/versions/{publicationVersion}
editorV2PublicationAudit/{eventId}
editorV2PublicationIdempotency/{actorUid}:{contentId}:{operation}:{requestId}
editor-v2-publications/{contentId}/v{publicationVersion}.json
editor-v2-published-assets/sha256/{sha256}.{png|jpg|webp}
```

The mutable pointer contains identity/type, lifecycle state, visibility, active and latest numeric versions, optimistic revision, and last actor/time. It never duplicates the published document, hash, manifest, source provenance, or publication actor/time.

An immutable version contains the full namespace identity, E2 schema/content version, immutable artifact path and hash, canonical document hash, validated document, immutable asset manifest, publication actor/time, source draft ID/revision/fingerprint, request ID, and correlation ID. Audit records are append-only. Draft revisions, document versions, and publication versions are independent counters.

## Canonical JSON and hashes

Canonicalization uses RFC 8785/JCS through the maintained `json-canonicalize` package. SHA-256 is computed over the canonical UTF-8 bytes and represented as `sha256:{64 lowercase hex characters}`.

The document hash includes the complete E2 envelope and nothing added by the publication operation. The artifact hash covers the complete stored immutable artifact representation. The asset-manifest hash used by confirmation covers the sorted final manifest. Request payload hashes cover the normalized operation, target identity, expected pointer revision, source draft revision/fingerprint, proposed visibility/version, and manifest hash. Timestamps, server correlation IDs, and generated audit IDs are excluded from pre-operation hashes.

JCS defines object ordering, Unicode handling and ECMAScript number serialization. Non-JSON values, non-finite numbers, sparse/undefined values, and values rejected by JCS are publication errors. Formatting is never locale dependent.

## Immutable assets

Publication copies referenced ready draft assets to the content-addressed prefix `editor-v2-published-assets/sha256/{digest}.{ext}`. The manifest binds asset UUID, MIME type, byte length, dimensions, SHA-256 and immutable path. Creation must use generation-match-zero semantics. If a path already exists, the backend must verify bytes and metadata; differing content is an integrity incident.

Only PNG, JPEG and WebP are approved. Published objects have no public ACL in this milestone. They are retained while referenced by any historical version; deletion requires a complete reference audit and a separately approved retention policy.

External HTTPS image blocks remain editing-valid, but are publication-blocking. The future import flow explicitly downloads through a restricted importer, validates type/size/dimensions, creates a private V2 asset, replaces the external reference with its stable asset ID, and requires fresh validation. The publisher never fetches arbitrary URLs.

## Version allocation and recovery

- First publication allocates version 1.
- A successful new publication allocates `latestVersionNumber + 1` in a transaction serialized on the pointer.
- Numbers are never reused, including failed or rolled-back attempts once committed as a version.
- Rollback repoints to an existing immutable version and does not create, edit, or renumber history.
- Asset copies and the immutable artifact are prepared before the Firestore pointer transaction.
- The transaction verifies draft revision/fingerprint, confirmation, idempotency scope, expected pointer revision and next version; then creates the version and audit and updates the pointer atomically.
- If object creation succeeds but Firestore activation fails, the object is an unreferenced immutable orphan. It must be recorded/reconciled and must never be treated as published merely because it exists.
- Historical `READY` versions and assets remain retrievable to authorized, version-pinned sessions regardless of the current active pointer.

## Lifecycle, visibility and retrieval

Publishing and learner release are deliberately separate. The initial publication creates an immutable READY version and a `published/private` pointer. The explicit `release` lifecycle operation validates the active READY version and atomically changes only that pointer to `published/public`; active/latest version numbers, artifacts, manifests, assets, hashes, and the source draft remain unchanged. The operation is revision-bound, idempotent, audited, and available only to `SUPER_ADMIN` and `CONTENT_ADMIN`.

After release, `unpublish` changes `published/public` to `unpublished/hidden`, and `republish` restores `published/public`. `disable` applies an operational `disabled/hidden` state and `enable` restores `published/public`. `archive` remains terminal and hidden. Active learner discovery continues to require exactly `published/public`; private publications are never treated as discoverable.

| Operation | From | To | Active version | Discovery | Pinned historical retrieval |
|---|---|---|---|---|---|
| First publish | Draft | Published | new v1 | According to visibility | Yes |
| Publish new version | Published | Published | new next version | According to visibility | Yes, all versions |
| Unpublish | Published | Unpublished | retained | No | Yes |
| Republish | Unpublished | Published | retained or separately published new version | Yes | Yes |
| Disable | Published/Unpublished | Disabled | retained | No | Yes only for already authorized pinned sessions |
| Enable | Disabled | Published | retained | Yes after integrity checks | Yes |
| Rollback | Published/Unpublished/Disabled | Published | existing target | Yes | Yes |
| Archive | Any non-archived state | Archived | cleared | No | Yes |

Archive is terminal for that content identity and deletes nothing. `draft` and `archived` pointers cannot have an active version. `published` requires one. Public visibility requires published state. Active version cannot exceed latest version. Visibility controls catalog exposure, while lifecycle and authorization separately govern access.

The precise authorization mechanism for pinned sessions **Requires learner implementation**; deployed gateway/IAM/rules remain **Requires deployed verification**.

## Durable idempotency

The client supplies a UUID request ID. The durable record is scoped to actor UID, content ID, operation and request ID, and binds a canonical request-payload hash, correlation ID, status, original result, creation time and 30-day expiry.

- Same scope and payload after commit returns the original result.
- Same request ID with a different actor, content, operation or payload is rejected.
- Concurrent in-progress replay never starts a second mutation.
- A client that loses the HTTP response queries/retries the same request ID and receives the committed result.
- Expiry permits record cleanup, not version reuse. A retried expired ID is handled as a new request against current pointer/draft preconditions, so stale confirmation cannot succeed.
- Publication-version uniqueness derives from the pointer transaction, independently of idempotency retention.

## Compatibility validation

The pure result separates:

1. `schemaValid`: E2 document validity.
2. `storageReady`: assets resolved, external images imported, immutable material available.
3. `learnerRuntimeCompatible`: current learner can preserve authored semantics.
4. `learnerIntegrationReady`: deployed namespace routing, trusted backend and delivery integration exist.

Every finding carries domain, severity, JSON-style path, stable code, explanation, required action and evidence classification. Unsupported semantics are never silently transformed.

| Domain | Confirmed learner contract | V2 compatibility result |
|---|---|---|
| Course | Stable Course/lesson identity, flat or sectioned modules, exact history, version-aware certification | Structurally adaptable. Removing a published lesson is blocking; module/section removal warns. Certification integration remains required. |
| Practice | `exact`, `trimmed`, `normalized-lines`; versioned completion and trusted verification | `exact` and `trimmed` are candidates for adapter mapping. JSON-equivalent, independent case policy and numeric tolerance are valid V2 but incompatible until client/backend support exists. No downgrade. |
| Challenge | `YYYY-MM-DD`, Asia/Kolkata, immutable assignment, exact version, 20 coins, streak +1 | Date is representable. Rewards other than 20 warn as incompatible; missing explicit streak contract is a learner-integration gap. Draft scheduling never creates an assignment. |
| Project | Numeric version, stable checkpoint/task IDs, files, entrypoint/runtime, validators, exact historical resume | Files/checkpoints/tasks map, but runtime, entrypoint and stable validator IDs need explicit V2 contracts. Defaults may not be invented. |

For Project gaps: existing files are directly usable; entrypoint/runtime and validator IDs **require explicit V2 fields/contracts**; execution semantics still **require learner-side integration**. No identified gap is safely derivable without semantic loss.

## Stable IDs

| ID | Scope | Referenced by learner state | Stability rule |
|---|---|---:|---|
| Course/Practice/Challenge/Project content UUID | Global V2 identity | Yes | Never changes; a different identity is new content |
| Module/section UUID | Course document | Indirectly/structurally | Stable across compatible versions; removal warns |
| Lesson UUID | Course document | Yes | Removal/replacement blocks compatible publication |
| Practice question UUID | Global content UUID | Yes | Never changes |
| Checkpoint/task UUID | Project document | Yes | Removal/replacement blocks compatible publication |
| Validator ID | Project document | Expected by recovery/evidence | Required schema gap; must be stable once published |
| Image asset UUID | V2 asset registry | Version manifest | Never regenerated during publish; manifest binds it to immutable bytes |

Publishing compares the proposed document against the previous published version. IDs are never regenerated. Renaming/reordering is allowed when identity and semantics remain stable; removals produce the policies above.

## Permissions

No new claims are introduced.

| Operation | SUPER_ADMIN | CONTENT_ADMIN | CONTENT_EDITOR | CONTENT_REVIEWER |
|---|---:|---:|---:|---:|
| Read history | Yes | Yes | Yes | Yes |
| Publish/new version | Yes | Yes | No | No |
| Rollback/unpublish | Yes | Yes | No | No |
| Disable/enable/archive | Yes | Yes | No | No |

Asset-upload authorization remains separate. There is no review/approval workflow.

## Three-step confirmation

1. **Validation:** identity/domain, exact draft/document versions, structured schema/storage/learner findings, blockers, warnings and validation fingerprint.
2. **Impact:** proposed and previous active versions, visibility change, immutable asset dependencies, stable-ID changes and historical implications.
3. **Final authorization:** explicit actor authorization and acknowledgment of target identity, operation, immutable creation and retained history.

The server-issued context binds actor, operation, content/type, draft revision, document version, draft and validation fingerprints, pointer revision, proposed publication version, sorted asset IDs, manifest hash, issue/expiry time, and three completed steps. A draft save, pointer revision, asset bytes/status/reference, validation policy, actor/role/token, operation, target or expiry change invalidates it. UI flags alone have no authority.

## Known E2 gaps and E9.2 boundary

Known schema gaps are Project runtime, entrypoint and validator identity; Challenge streak semantics and learner reward mapping; Practice `normalized-lines` authoring representation; and an explicit namespace identity in learner state. These are not silently changed in E9.1.2.

E9.2 may implement only emulator-backed preflight, durable idempotency, transactional numeric allocation, immutable artifact/asset creation, audit, pointer operations and fault-injection tests against these frozen contracts. It must not write legacy collections, infer execution defaults, deploy production resources, expose public objects, create challenge assignments, issue rewards/certificates, or alter learner state.

Before production: verify deployed Firebase project/buckets/rules/IAM, WIF and runtime service accounts, Vercel environment/routing, authorized domains, retention/backup, gateway authorization, learner namespace propagation, trusted verification, certification, assignment/reward behavior and observability.
# E9.3 admin publishing workflow

Every Course, Practice, Challenge, and Project editor now includes a compact publication status. Local drafts explain that they must be explicitly uploaded or transferred to cloud. A cloud draft must have a saved revision and no unsaved changes before publishing can begin; the studio never autosaves for publication.

Only `SUPER_ADMIN` and `CONTENT_ADMIN` receive the Publish action. `CONTENT_EDITOR` and `CONTENT_REVIEWER` retain read access to publication status/history but cannot prepare or submit a publication. Server authorization remains authoritative.

The modal requires three separate decisions:

1. Validation displays the authoritative schema, storage, learner-runtime, learner-integration, error, and warning results returned by `POST /api/v2/publications/{contentId}/prepare`.
2. Impact review displays the active and proposed versions, lifecycle/visibility effect, asset count and manifest fingerprint, immutable history retention, and learner-invisibility statement.
3. Final authorization identifies the actor, exact draft and pointer context, proposed version, assets, and confirmation expiry before the descriptive `Publish Version X` action is enabled.

Preparation is read-only. It creates a short-lived confirmation context bound to actor, operation, content identity, draft/document fingerprints, validation fingerprint, pointer revision, proposed version, asset IDs/manifest hash, and issue/expiry times. The browser may only add the three explicit completion decisions. The publication backend recomputes and verifies every authoritative value.

`CONFIRMATION_STALE`, draft conflicts, pointer conflicts, and asset changes require acknowledgement and a fresh Step 1 preparation. They are never retried automatically. If the final network response is uncertain, the UI retains the same request UUID and offers an explicit exact-operation retry; a committed replay is presented as normal success. Permission loss closes access to the prepared operation. Draft content, dirty state, undo/redo state, and cloud revision are never changed by publishing.

Success refreshes the pointer and read-only version-history preview and reports the published version, source draft revision, integrity prefix, asset count, and idempotent replay state. V2 publication visibility remains `private`; no learner or legacy collections are written and V2 content is not learner-visible.

E9.3 deliberately did not implement rollback, unpublish, disable/enable, or archive; those operations were added by E9.4 below. Learner delivery, assignments, rewards, and certificates remain out of scope.

## E9.4 history and lifecycle management

The cloud editor publication status opens a dedicated, Admin-only history and lifecycle dialog. All recognized Admin roles may inspect pointer state, visibility, active/latest versions, source revisions, actors, integrity hashes, asset counts, artifact status, and compatibility snapshots. Only `SUPER_ADMIN` and `CONTENT_ADMIN` may mutate lifecycle state.

| Current state | Allowed operations | Result |
| --- | --- | --- |
| Published | Rollback, Unpublish, Disable, Archive | Rollback remains published/private; Unpublish and Disable become hidden; Archive is terminal. |
| Unpublished | Rollback, Republish, Disable, Archive | Republish or Rollback becomes published/private. |
| Disabled | Rollback, Enable, Archive | Enable or Rollback becomes published/private. |
| Archived | None | History remains readable; the identity cannot publish, republish, or enable. |

Rollback changes only `activeVersionNumber` to an existing READY, integrity-verified historical version. It does not create or clone a version and never decrements `latestVersionNumber`. Unpublish removes ordinary discovery while retaining the active version for exact-version history. Disable is a distinct administrative availability block. Republish and Enable reactivate the existing READY active version and never create new bytes. Archive clears the active pointer and is terminal for that identity, but it does not physically delete versions, artifacts, manifests, or assets.

Every lifecycle mutation requires an explicit operation-specific confirmation bound to actor, content identity, operation, current lifecycle, active version, target version, and expected pointer revision. Archive requires two explicit decisions. Pointer changes make the confirmation stale. The existing durable request collection provides exact-payload idempotent replay; request-ID reuse with different state or targets is rejected.

Lifecycle transactions atomically update the pointer, increment its revision, append a detailed audit event, and commit the idempotency result. Activation operations run read-only diagnostics first: version metadata must be READY, the namespace/content identity must match, the artifact must exist and match its hash, and the asset manifest must satisfy the frozen structure. Corruption is reported and never repaired or activated automatically.

Historical version documents, artifacts, and content-addressed asset copies are retained unchanged through every transition. Lifecycle mutations affect only the private V2 publication registry. There is still no learner-facing delivery in E9.4.

History pagination is deferred. The current endpoint uses deterministic descending version order but returns the bounded history as one Admin response; opaque cursor pagination should be added before histories can grow without an operational bound. Artifact repair, unarchive, cloning archived identities, and learner delivery remain out of scope.
