# E10.1 pure learner adapters

E10.1 introduces deterministic transformation functions only. No learner route, repository, feature flag, public endpoint, Firebase record, progress record, assignment, reward, certificate, or workspace is changed. No learner runtime consumes V2 publications yet.

## Boundary and identity

Adapters receive an immutable document together with its namespace-aware publication identity and immutable asset manifest. Every successful output retains the tuple `(v2, contentType, contentId, publicationVersion)` in an integration envelope. There is no content-ID-only or implicit legacy fallback.

Normal compatibility failures return typed findings containing domain, stable code, severity, path, message, and required action. Results classify content as compatible, compatible with warnings, requiring a learner upgrade, requiring a V2 schema change, or an invalid publication. Inputs are never mutated and repeated adaptation produces identical output.

## Domain mappings

- Course preserves Course/module/section/lesson/block identities and ordering, supports direct and sectioned modules independently, generates deterministic previous/next navigation, validates an explicit default target, and blocks removed stable lessons or unsupported blocks.
- Practice maps identity, languages, starter/reference code, examples, hints, instructions, and trusted-verification metadata. Exact and trimmed are directly compatible. Normalized-lines is understood by the learner adapter but requires a V2 schema addition. JSON-equivalent, numeric tolerance, and independent case policies fail rather than being downgraded.
- Challenge maps date, Asia/Kolkata semantics, languages, starter code, instructions, hints, verification, 20 coins, and streak +1 without creating an assignment or issuing anything. Reward mismatch, invalid calendar dates, missing streak/timezone contracts, and unsupported comparison behavior fail explicitly.
- Project maps languages, runtime, entrypoint, files, instructional blocks, checkpoints, tasks, hints, validators, requirements, and objectives. Checkpoint/task IDs, file paths, and explicit validator IDs are preserved. Runtime, entrypoint, and validator identities are never inferred.

## Asset descriptor

Managed image blocks receive a pure delivery descriptor:

`v2:{contentId}:v{publicationVersion}:asset:{assetId}`

The descriptor includes namespace, content ID, publication version, and asset ID. It is not a URL, contains no private draft or published Storage path, and performs no network delivery. An image absent from the immutable manifest is rejected.

## Required contract changes

The current frozen V2 schemas still need versioned changes for:

- Practice `normalized-lines` comparison.
- Challenge explicit `streakIncrement`, comparison policy, and `Asia/Kolkata` timezone contract.
- Project runtime identifier, entrypoint, and stable IDs on every task/final validator.
- Learner persistence of the complete namespace-aware publication identity.

The current learner system still needs explicit V2 routing, version-pinned progress/resume behavior, trusted Practice verification parity, Challenge assignment/reward integration, Project execution integration, version-aware Course certification, and a real authenticated asset delivery service. Those are not implemented here.

## Fixtures and rollout

The deterministic fixture matrix covers Course direct lessons, sections, stable/removed/duplicate IDs, images, invalid navigation, and unsupported blocks; Practice exact, trimmed, normalized-lines, JSON-equivalent, tolerance, and case policy; Challenge compatible, reward mismatch, invalid date, and unsupported comparison; and Project compatible future contract plus each missing execution field.

Course is the recommended first E10.2 pilot because its structural mapping is compatible without introducing execution, trusted judging, assignments, rewards, or workspaces. The pilot must still use explicit namespace/version routing, authenticated version-addressed asset delivery, and isolated non-production data before any learner exposure.
