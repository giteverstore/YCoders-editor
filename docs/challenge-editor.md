# Challenge Editor

> Legacy note: this page describes the original coding-content editor retained for read compatibility. New Challenge work follows [challenge-architecture.md](./challenge-architecture.md): a versioned policy plus immutable exact-Practice assignment. Legacy documents cannot create new V2 daily assignments without explicit migration.

E6 uses the E2 Challenge schema directly. Fixed fields include identity, common summary/tags, a timezone-independent `YYYY-MM-DD` scheduling value, difficulty/topics, languages, typed reward configuration, hints, starter code, and expected-output or test-case verification. E2 has no motivation, duration, separate examples, reference solutions, or public-test IDs, so the editor does not invent them.

Scheduling is metadata only. Asia/Kolkata is identified as the future assignment authority, but no timezone conversion, availability lookup, assignment, publication, reward grant, streak update, or completion operation occurs.

Routes explicitly separate `/challenges/local/...` and `/challenges/cloud/...`; legacy routes remain local. IndexedDB version 4 adds `challenge-drafts-v1` while preserving Course and Practice stores. Cloud records remain in `editorV2Drafts`, strictly validated and filtered by `contentType` with existing token/role/revision enforcement.

Instructions use E2-approved blocks, Tiptap, and the lazy Monaco component. Preview is static and approximate. Code is never executed. Production WIF/IAM/rules and learner assignment integration remain future work.
