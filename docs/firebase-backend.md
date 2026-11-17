# Firebase authentication and secure V2 draft API

E4.3 adds authentication and a server-only cloud draft foundation while leaving IndexedDB as the active Course Editor repository. No code in this milestone migrates, uploads, or synchronizes local drafts. The existing learner application and legacy Admin collections remain untouched.

## Frontend Firebase configuration

Copy `.env.example` to a local ignored environment file and provide:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

Storage configuration is intentionally absent because E4.3 performs no asset operations. Firebase browser configuration identifies the public web application; it is not a credential and grants no Admin authorization. Authorization comes only from a server-verified Firebase ID token and its `adminRole` custom claim.

The frontend supports Google and email/password sign-in, session restoration through `onIdTokenChanged`, sign-out, loading/error states, denied-role UI, and one forced token refresh after an API 401. Authenticated content is not rendered until claim checks complete.

## Roles and proposed V2 policy

No reliable legacy permission implementation exists in this standalone repository. E4.3 therefore adopts and documents this explicit V2 policy rather than claiming to copy old semantics:

| `adminRole` | Read drafts | Create/edit | Delete |
| --- | --- | --- | --- |
| `SUPER_ADMIN` | Yes | Yes | Yes |
| `CONTENT_ADMIN` | Yes | Yes | Yes |
| `CONTENT_EDITOR` | Yes | Yes | Yes |
| `CONTENT_REVIEWER` | Yes | No | No |

Legacy `admin: true`, Firestore profile fields, and unrecognized role strings never grant access. Frontend checks control presentation only. Every API operation repeats authentication and authorization server-side.

## API contracts

Vercel functions expose Course-only endpoints:

- `GET /api/v2/drafts` — list summaries
- `POST /api/v2/drafts` — `{ document }`
- `GET /api/v2/drafts/:id` — load one draft
- `PUT /api/v2/drafts/:id` — `{ document, expectedRevision }`
- `DELETE /api/v2/drafts/:id` — `{ expectedRevision }`

Requests require `Authorization: Bearer <Firebase ID token>`. Mutating requests require `Content-Type: application/json` and are limited to 5 MB. IDs must be UUIDs. Request objects are strict and Course documents use the E4.1 editing-valid schema.

Success responses use `{ "ok": true, "data": ... }`. Errors use `{ "ok": false, "error": { "code", "message", "details?" } }`. Stable status classes are 401 authentication, 403 authorization, 404 missing draft, 409 duplicate/conflict, 413 body size, 415 media type, 422 validation, and sanitized 500/503 failures. Raw exceptions, tokens, credentials, and Firebase snapshot objects are never returned.

## Firestore representation and isolation

Only `editorV2Drafts/{contentId}` is referenced. Collection names and Firestore paths are constants, never request input. The server record is:

```ts
{
  id: string
  contentType: "course"
  schemaVersion: "2.0.0"
  revision: number
  document: CourseDraft
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}
```

Create, update, and delete use Firestore transactions. Creation rejects an existing ID and starts at revision 1. Updates/deletes compare `expectedRevision` inside the transaction. Actor UIDs, timestamps, and revisions are generated server-side and cannot be spoofed by request bodies.

The API never accepts a collection/path parameter and contains no generic database endpoint. It does not reference `adminContentDrafts`, `publishedContent`, `adminContentAssets`, `adminContentAudit`, learner progress, subscriptions, or coins.

## Server credentials and deployment

Server configuration requires `FIREBASE_ADMIN_PROJECT_ID`. Never place service-account JSON or server credentials in `VITE_*` variables. Never commit a service-account key.

Production Vercel must use its OIDC identity with Google Cloud Workload Identity Federation and Application Default Credentials. Provisioning is intentionally manual and outside this repository:

1. Create/audit a Google Cloud workload identity pool and Vercel OIDC provider.
2. Bind only the intended Vercel project/environment identity to a dedicated service account.
3. Grant the minimum Firebase Auth token-verification/revocation-check and Firestore data permissions required by this API.
4. Configure ADC/WIF environment values in Vercel's encrypted server environment, never as `VITE_*` values.
5. Review IAM regularly because project-level Firestore credentials may technically access more collections than this API intentionally exposes.

Application code hard-scopes collection access, but IAM should still follow least privilege. The dedicated runtime identity must not have Storage administration, Auth user mutation, role/claim mutation, or unrelated project-administration privileges.

## Emulator and development safety

Non-production server initialization fails unless all of these are set:

```text
FIREBASE_ADMIN_PROJECT_ID=demo-ycoders-editor
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

Use a demo/test project ID, not the production project. Unit tests use injected token verifiers and an in-memory repository; the separate emulator suite initializes Firebase Admin only after its strict environment guard passes.

### Real emulator integration suite

E4.3.1 adds Firebase CLI configuration for the fixed `demo-ycoders-editor-v2` project. Install a supported Node LTS release (20, 22, or 24), Java, and project dependencies, then run:

```bash
npm install
npm run emulators:test
```

The command starts only Auth and Firestore on loopback addresses, runs `npm run test:emulator`, and shuts them down afterward. The dedicated test command is intentionally fail-closed when run without the CLI-provided emulator hosts. `npm test` runs isolated unit tests and excludes emulator tests.

The integration bootstrap clears only the demo emulator database/users, provisions test-only email/password users, applies test-only custom claims for every supported role, and obtains real Auth emulator ID tokens. It exercises the real Firebase Admin verifier, Firestore repository, transactions, and Vercel adapters. It never imports a service-account file.

Safety checks require all configured project IDs to equal `demo-ycoders-editor-v2`, both hosts to be `localhost`/`127.0.0.1` with explicit ports, inline `FIREBASE_CONFIG` to identify the demo project, `VERCEL_ENV` not to be production, and `GOOGLE_APPLICATION_CREDENTIALS` to be absent.

`emulator/firestore.rules` is deliberately deny-all and exists only to confirm that browser SDK writes cannot bypass the API. Firebase Admin operations bypass these emulator rules, as they do in production. This file is not a proposed or verified copy of Ycoders production rules.

The current Auth emulator accepts an already-issued token after `revokeRefreshTokens`; the suite documents this emulator limitation. Invalid-token behavior is emulator-verified, but expired/revoked-token rejection remains a production/WIF staging verification item. Production code still calls `verifyIdToken(token, true)`.

## Required production browser-rule posture

The real Ycoders rules are not available in this repository and were not modified or verified. The production rules owner must ensure direct browser access to the server-managed collection is denied. The required posture is equivalent to this documentation-only fragment:

```text
match /editorV2Drafts/{draftId} {
  allow read, write: if false;
}
```

This fragment must not be deployed from this repository. It is an example of the required boundary, not a claim about current production configuration. Approved production rules must be independently supplied and tested against the emulator before deployment.

## Local versus cloud drafts

E4.4 connects the Course Editor to both repositories through explicit source routes. IndexedDB remains available and is never silently synchronized with cloud storage. Transfers require a named user action and never overwrite an existing destination. See [cloud-draft-workflows.md](./cloud-draft-workflows.md) for routing, revision, transfer, conflict, permission, emulator, and readiness behavior.

## Deployment blockers

Do not deploy the cloud draft API until all blockers are resolved:

- Existing Admin-role semantics must be reviewed by the Ycoders security owner and the proposed V2 matrix approved.
- Firestore rules for `editorV2Drafts` must be inspected. Direct browser writes must be denied. E4.3 deliberately does not modify rules; permissive existing/default rules are a blocker.
- WIF trust conditions and the runtime service account's IAM permissions must be reviewed and tested in a non-production Firebase project.
- The new collection and required composite query/index behavior must be verified in an emulator or isolated project.
- CORS/origin and Vercel environment separation must be reviewed for preview deployments.

No deployment, security-rule change, custom-claim change, user mutation, IAM provisioning, or production Firebase access was performed in E4.3.
