# E10.2 private V2 Course delivery

E10.2 adds a server-only, authenticated Course pilot. This private delivery API is not yet used by normal Ycoders learners. It does not change learner routes, legacy fallbacks, feature flags, progress, bookmarks, certificates, assignments, rewards, or workspaces.

## Endpoints and identity

- `GET /api/v2/delivery/courses/{contentId}` resolves the actively discoverable V2 Course.
- `GET /api/v2/delivery/courses/{contentId}/versions/{version}` resolves one retained immutable V2 Course version.
- `GET /api/v2/delivery/courses/{contentId}/versions/{version}/assets/{assetId}` returns one image authorized by that exact version manifest.

All lookup is explicitly namespace `v2`, content type `course`, content UUID, and numeric publication version. A missing V2 identity returns a typed V2 error and never searches legacy collections.

## Resolution and lifecycle

Active discovery requires `state=published`, `visibility=public`, and a non-null active version. Private, unpublished, disabled, and archived pointers are not actively discoverable. Existing E9 publishing deliberately creates `private` pointers, so ordinary publications remain hidden during this milestone.

Exact-version retrieval ignores discovery state and remains available for valid retained versions after a newer publication, rollback, unpublish, disable, or archive. It remains subject to private authentication.

The service reads the exact immutable artifact, verifies its SHA-256, parses the supported V2 schema, verifies namespace/type/content/version identity, validates the asset manifest, validates the canonical document hash, and invokes the E10.1 Course adapter. Adapter incompatibility returns structured diagnostics rather than a partial or downgraded Course.

## Assets

The transport resolver converts the E10.1 semantic asset descriptor into the exact-version delivery endpoint; the adapter contains no URL knowledge. Asset delivery authorizes the tuple `(contentId, publicationVersion, assetId)` by manifest membership. The server never accepts an object path, never exposes Storage credentials or paths, and verifies media type, byte length, and content hash before returning PNG, JPEG, or WebP with `nosniff`.

## Authentication and errors

All four recognized Admin roles currently receive the separate `delivery:read` permission for private validation. This is intentionally distinct from Editor asset permissions. Firebase ID tokens are verified server-side with revocation checks. Final learner authorization, entitlement, routing, and namespace propagation belong to a later milestone.

Typed failures include content/version not found, not discoverable, integrity failure, adapter incompatibility, manifest authorization failure, missing asset, and unauthorized access. Responses do not include request records, audit events, actor IDs, stack traces, or object paths.

## Cache intentions

- Active pointer responses use `private, no-store` so lifecycle and rollback changes are immediately observed.
- Exact immutable Course responses use conservative `private, no-cache` plus `Vary: Authorization`; a future authenticated gateway may permit immutable caching.
- Immutable assets use the same conservative private policy for now; future delivery can use content-addressed caching after authorization architecture is approved.

No CDN configuration is introduced. E10.3 should define an isolated learner-auth pilot, entitlement rules, explicit namespace/version routing, observability, and non-production rollout controls before any normal learner consumes this API.

## E10.3.1 learner-gateway boundary

The Admin endpoints above remain unchanged. A separate Course-only namespace is available at `/api/v2/gateway/courses/{contentId}`, with exact versions and assets under the same version-addressed shape. It reuses the immutable Course delivery service, integrity verification, learner adapter, lifecycle behavior, and manifest-bound asset reads, but authenticates the caller as the learner gateway service rather than as a Firebase Admin user.

Learner authentication and entitlement stay in MiTutoraPro. Editor Studio receives no learner Firebase token and makes no entitlement decision. The minimum propagated context is a correlation ID; learner UID and PII are not forwarded. No Admin Firebase identity is used to represent the learner gateway.

Local/emulator tests use Ed25519 assertions with a process/harness-provided key pair. Each assertion is limited to 60 seconds and binds issuer, exact gateway service identity, Editor gateway audience, emulator environment, HTTP method, exact path, and correlation ID. Test verification refuses `VERCEL_ENV=production` and any non-`demo-*` Firebase project. Missing configuration fails closed; Firebase learner/Admin bearer tokens do not satisfy service authentication.

Production must replace the test verifier with Google-signed short-lived workload identity derived from the learner gateway's Vercel OIDC identity through WIF. The expected upstream issuer is the exact team-scoped `https://oidc.vercel.com/<team-slug>` issuer—not a wildcard. Its audience must equal the exact Google provider resource `//iam.googleapis.com/projects/<project-number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`. Provider attribute conditions must bind the intended Vercel team, MiTutoraPro project ID, `production` environment, and exact deployment/subject convention. Preview requires a separate explicit provider condition and is not implicitly trusted.

Only that provider principal may impersonate a dedicated learner-gateway service account. The impersonated account then mints a Google-signed ID token whose audience is the exact Editor gateway origin/audience; Editor verifies the Google issuer, exact audience, verified service-account email/subject, and token times. It must reject other service accounts even from the same project. Vercel assertions and Google identity tokens are expected to be short-lived (no more than one hour), obtained fresh through standard credential caching, and never logged. IAM/WIF provisioning and deployed verification remain outside this milestone, so production verification intentionally fails closed.
