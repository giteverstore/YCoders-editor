# Q250 Practice migration report

Run the deterministic, non-destructive report with:

```powershell
node scripts/report-q250-practice-migration.mjs --learner-root .tmp-learner-postauth
```

It reads the checked-in Q250 bank and accepted browser execution registry and never changes questions. Every row reports the proposed mode, argument/result types, comparator or validator, mapping source, confidence, determinism and mandatory manual review.

Current result: 250 total, 214 supported proposals and 36 deferred. The supported set contains 197 function and 17 stateful contracts.

The following questions remain intentionally deferred because no accepted function/stateful definition exists. Their missing capability is an explicit declarative mapping for the question family; no validator is guessed from examples or expected output.

`NC250-159`, `NC250-161`, `NC250-162`, `NC250-163`, `NC250-171`, `NC250-173`, `NC250-174`, `NC250-184`, `NC250-189`, `NC250-201`, `NC250-204`, `NC250-205`, `NC250-207`, `NC250-209`, `NC250-210`, `NC250-211`, `NC250-212`, `NC250-213`, `NC250-226`, `NC250-227`, `NC250-228`, `NC250-229`, `NC250-230`, `NC250-231`, `NC250-232`, `NC250-233`, `NC250-234`, `NC250-235`, `NC250-236`, `NC250-237`, `NC250-238`, `NC250-239`, `NC250-240`, `NC250-241`, `NC250-242`, `NC250-250`.

For every deferred row the report emits:

- reason: no accepted execution definition;
- missing capability: declarative family mapping;
- missing validator family: not inferred;
- likely contract extension: review required/unknown;
- intentionally deferred: true.
