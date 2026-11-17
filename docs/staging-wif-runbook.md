# E10.3.2 staging WIF and lifecycle runbook

No IAM was provisioned by repository automation. Replace every bracketed value below with the approved staging value and retain the resulting review evidence.

Required identities:

- Google project: `[STAGING_PROJECT_ID]` / number `[STAGING_PROJECT_NUMBER]`.
- Pool/provider: `[POOL_ID]` / `[PROVIDER_ID]`.
- Issuer: `https://oidc.vercel.com/[VERCEL_TEAM_SLUG]`.
- Vercel project: exact MiTutoraPro project ID `[VERCEL_PROJECT_ID]`.
- Environment: `preview` (or a separately approved staging environment).
- Service account: `ycoders-learner-gateway-staging@[STAGING_PROJECT_ID].iam.gserviceaccount.com`.
- Editor audience/origin: `https://[EDITOR_STAGING_HOST]`.

The provider attribute mapping must expose `google.subject=assertion.sub` and the exact Vercel team, project and environment claims. Its condition must be an AND expression requiring all three exact values plus the approved subject/deployment convention. Do not use wildcard team, project, environment, branch or subject matching. Grant `roles/iam.workloadIdentityUser` on only the dedicated service account to only the provider principal set satisfying that condition. No service-account key is created.

MiTutoraPro staging configuration:

```text
V2_GATEWAY_SERVICE_AUTH_MODE=staging-wif
V2_GATEWAY_WIF_AUDIENCE=//iam.googleapis.com/projects/[STAGING_PROJECT_NUMBER]/locations/global/workloadIdentityPools/[POOL_ID]/providers/[PROVIDER_ID]
V2_GATEWAY_SERVICE_ACCOUNT_EMAIL=ycoders-learner-gateway-staging@[STAGING_PROJECT_ID].iam.gserviceaccount.com
V2_GATEWAY_GOOGLE_TOKEN_AUDIENCE=https://[EDITOR_STAGING_HOST]
V2_DELIVERY_SERVICE_URL=https://[EDITOR_STAGING_HOST]
```

Editor staging configuration:

```text
V2_GATEWAY_SERVICE_AUTH_MODE=staging-google
V2_GATEWAY_SERVICE_ACCOUNT_EMAIL=ycoders-learner-gateway-staging@[STAGING_PROJECT_ID].iam.gserviceaccount.com
V2_GATEWAY_GOOGLE_TOKEN_AUDIENCE=https://[EDITOR_STAGING_HOST]
V2_GATEWAY_TRUST_ENVIRONMENT=staging
```

Production must retain disabled feature and service-auth modes. Local Ed25519 keys must not be present in either staging deployment.

## Acceptance and rollback

Run the V1 → V2 → rollback → unpublish → republish → disable/enable → archive scenario through the two deployed HTTPS services. Capture correlation IDs and verify active/exact resolution, immutable assets, independent progress documents, and unchanged legacy sentinels. Also test missing/wrong audience/wrong service/expired tokens, missing learner auth, allowlist denial, timeout and unavailable Editor behavior. This repository run did not execute those deployed checks.

Immediate rollback: disable `V2_COURSE_PILOT_ENABLED`, clear learner/content allowlists, then revoke the provider principal's service-account impersonation binding if required. Do not delete publication history or `v2CourseProgress`.

## E10.3.3B dedicated staging inventory (2026-11-17)

The following boundaries exist and are explicitly non-production. No WIF pool,
provider, service account, impersonation binding, deployment, pilot user, or
pilot content was created in E10.3.3B.

| Item | Value |
| --- | --- |
| Google/Firebase project | `ycoders-v2-staging` |
| Google project number | `417214322239` |
| Project labels | `environment=staging`, `application=ycoders-v2`, `data-classification=nonproduction` |
| Firestore | `(default)`, `FIRESTORE_NATIVE`, `asia-south1` |
| Firebase Storage | `ycoders-v2-staging.firebasestorage.app`, `ASIA-SOUTH1` |
| Firebase Web App | `1:417214322239:web:d917f149ce0ebf48a68a8a` |
| Firebase Auth | email/password enabled; no pilot user created |
| Vercel team | `avinashabbigeris-projects` / `team_JWeTI30xjnERJbMpLUkgTpzV` |
| Learner project | `ycoders-learner-staging` / `prj_AZ45waZW70SNXP1VkgBHiU8CRNR4` |
| Editor project | `ycoders-editor-staging` / `prj_1rpww81OiuVkWJwyXlbggmKCFoWl` |
| Environment | `preview` |
| Learner origin | unknown until the first authorized Preview deployment |
| Editor origin / Google ID-token audience | unknown until the first authorized Preview deployment |
| Pilot learner UID | operator input required |
| Pilot Course content ID | operator input required |

MiTutoraPro keeps its existing `ycoders-admin` repository link. Learner staging
uses explicit project targeting or a separate checkout. The standalone Editor
workspace is linked to `ycoders-editor-staging`. Preview Firebase variables are
configured on both projects, but the learner pilot and Editor cloud-draft gates
remain disabled. WIF values must not be populated until E10.3.3 resumes.

## E10.3.3C Preview deployment preflight (2026-11-17)

Both repository production builds passed. The learner build wrote its output to
an isolated temporary directory, so the MiTutoraPro workspace and its existing
`ycoders-admin` link were not modified.

No deployment was created. Both Vercel staging projects had zero deployments at
preflight time, and Vercel documents that the first deployment of a new project
is marked Production. This conflicts with E10.3.3C's Preview-only requirement
and explicit prohibition on Production deployment. A prior deployment on this
account also resolved an explicit Preview target as Production. An operator must
establish a reviewed mechanism that guarantees the first deployment is Preview,
or explicitly authorize a non-serving bootstrap Production deployment in a
separate milestone. E10.3.3C does not authorize that bootstrap.

The operator must also supply an operator-controlled staging learner email and
password through a secure channel. No Firebase Auth user was invented, copied,
or created. No pilot Course draft was created because the Editor staging API is
not deployed and no staging Admin identity has been designated; bypassing that
API with a direct infrastructure write was not treated as authorization.

## E10.3.3C.1 Git-backed Preview preflight (2026-11-17)

No Git push, Vercel Git connection, or deployment was performed. The Editor
remote `giteverstore/YCoders-editor` has no remote HEAD and no branches, while
the local Editor repository has no commit history and every application file is
untracked. Its first pushed branch would become the repository default branch,
so a proposed `staging/v2-course-pilot` branch cannot yet be proven distinct
from the production branch.

The MiTutoraPro remote is healthy and defaults to `main`, but the local
`phase14-admin-diagnostics` workspace contains extensive mixed modified and
untracked user work. The E10.3 runtime changes are not isolated in a commit.
Pushing that workspace would either include unrelated work or require guessing
which cross-cutting changes belong to the pilot.

Both Vercel staging projects remain disconnected from Git according to the
available project metadata. Their project-level framework, build, install, and
output settings are unset and Node remains `26.x`; the required learner setting
is Node `24.x`. Before retrying this milestone, establish a reviewed baseline
`main` commit and default branch for Editor Studio, isolate the learner V2 work
in a reviewed commit based on MiTutoraPro `main`, and configure the two staging
projects' Git repository, production branch, and build settings explicitly.
