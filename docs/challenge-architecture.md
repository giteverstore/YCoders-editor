# Challenge architecture

This document is the source of truth for Challenge C2-C7. Challenge is orchestration over immutable Practice publications; it is not a second coding-question domain.

C3 makes new Challenge drafts policy documents in the existing local/cloud Challenge draft stores. The Editor exposes General, fixed IST Schedule, Practice Source, fixed Rules/Rewards, safe eligibility preview, readiness findings, and a non-persisting deterministic “If Assigned Now” preview. Legacy Challenge documents open in a read-only migration-assistance view and are never rewritten automatically. Until C4 connects an authenticated authoritative candidate source to server publication preparation, the backend blocks policy publication with `challenge-policy.candidate-validation-required`.

## Policy and publication

A Challenge policy is a versioned `challenge-policy` document. It owns the global schedule, eligible Practice pool, restrictions, and fixed reward/streak rules. Its immutable publication version is the policy version used by assignment creation. Policy content never includes problem statements, instructions, languages, starter code, tests, comparators, execution contracts, hints, or reference solutions.

The first contract fixes:

- timezone `Asia/Kolkata` and reset time `00:00:00`;
- AI Tutor `disabled`;
- hints `practice-defined` or `disabled`, defaulting to `practice-defined`;
- retries `unlimited-until-completed` (Runs are repeatable, completion/reward/streak are idempotent);
- reward 20 coins, streak increment one, and `challenge-replaces-practice` reward mode.

Legacy Challenge content remains readable through the original `challenge` envelope. It is classified as `legacy-challenge-content`, cannot feed new assignments, and requires manual migration. Duplicated question material is migrated to a separate Practice publication, never copied into a policy.

## Daily assignment

One assignment is shared by all learners for a policy/date scope. Its key is `{policyId}:{YYYY-MM-DD}`; a future multi-policy system therefore cannot collide. It pins the Challenge policy version and exact Practice `(contentId, publicationVersion)`, snapshots reward/restrictions, records an eligibility snapshot hash, and stores an absolute `assignedAt` timestamp. All other assignment fields are immutable.

Creation is create-once: get the canonical scope, return it if present, otherwise select and invoke an atomic repository `createIfAbsent`. A concurrent loser receives the stored winner. A Firestore adapter must implement this with a transaction or create-only precondition, never an unprotected read/write pair.

## Date authority

Challenge dates are calendar strings in Asia/Kolkata, never UTC-midnight timestamps. The trusted orchestration server derives the current date. Local midnight starts the new date; `assignedAt` remains an absolute timestamp. Client dates may navigate history but cannot authorize creation, reward, or streak.

## Eligibility and selection

Candidate projections contain only content ID, active publication version, pointer lifecycle/discoverability, difficulty/topics, execution/test compatibility, supported languages, and learner DTO readiness. Both pool and fixed-Practice modes require a published, discoverable, non-disabled/non-archived, execution-compatible exact Practice version with valid executable public tests, a supported language, a safe learner DTO, and matching filters.

Eligibility returns deterministic findings rather than silently dropping candidates. Selection sorts candidates canonically, prefers candidates outside the supplied recent-ID set, and hashes date, policy identity/version, deterministic seed, and the canonical candidate snapshot. Input ordering cannot affect selection. The SHA-256 eligibility snapshot excludes full Practice DTOs, source code, tests, and reference solutions.

## Delivery, state, completion, and rewards

Learner delivery combines the immutable assignment with the safe exact-version Practice DTO. The accepted Practice workspace, browser execution, public tests, and comparators are reused. Challenge mode has Run only: no Submit, Verify, hidden tests, or server-side code execution.

Practice language/code state remains keyed by learner, Practice content ID, and Practice publication version. Challenge creates no duplicate source-code store.

Completion evidence binds learner UID, assignment ID, Challenge date, policy version, Practice content ID, and Practice publication version. Reward identity binds learner UID, assignment/date, and reward policy version. A Challenge Run invokes only Daily Challenge completion; normal Practice completion and its 5-coin reward are suppressed.

The first qualifying current-date completion starts streak one. A consecutive date increments it; a gap resets it to one; duplicates do nothing; longest streak never decreases. A Challenge Pass may unlock historical completion and the assignment reward under existing rules, but recovery never restores/increments streak and never duplicates reward.

## AI and hints

The assignment explicitly snapshots `aiTutor: disabled`. C4/C5 must make trusted Daily Challenge context a hard server-side denial in addition to hiding learner controls. This limits YCoders AI surfaces, not external tools. Hints default to the Practice-defined hints or may be disabled by policy; C2 introduces no hint costs or counters.

## Security and future IAM

Use gateway-supplied safe candidate projections (Option A). This avoids Firestore list/query permission in the assignment service.

Proposed staging-only identity, not created in C2:

- Service account: `ycoders-challenge-staging@ycoders-v2-staging.iam.gserviceaccount.com`
- Custom role: `ycodersChallengeWriter`
- Permissions only: `datastore.entities.get`, `datastore.entities.create`, `datastore.entities.update`
- Grant the custom role only to that service account.
- Grant `roles/iam.workloadIdentityUser` on that service account only to `principal://iam.googleapis.com/projects/417214322239/locations/global/workloadIdentityPools/ycoders-vercel-staging/subject/owner:avinashabbigeris-projects:project:ycoders-learner-staging:environment:preview`.
- Preview variables only: `V2_CHALLENGE_SERVICE_AUTH_MODE=staging-wif` and `V2_CHALLENGE_SERVICE_ACCOUNT_EMAIL=ycoders-challenge-staging@ycoders-v2-staging.iam.gserviceaccount.com`.

The existing learner gateway remains responsible for authenticated Editor delivery. The Challenge identity must not replace Course progress, Practice state, learner gateway, or Editor identities. No delete/list/query, Storage, Firebase Auth, Service Account Token Creator, key, or broad project role is proposed. IAM is deferred until the repository adapter and actual operations are ready for staging proof.
