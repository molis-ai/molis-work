A transient read failure in the Assistant's work database currently looks like the work was deleted. The first failed authority check therefore ends a followed background job as unchecked, and unlocking the database does not resume it. This contradicts the existing unknown-and-recheck behavior in prologue-adoption §6.0o.

Only the owner's explicit assistant.not_found refusal now means the work is absent. Other storage errors reach the existing condition checker, which uses the SDK's bounded unknown retry. No new retry loop, status, schema or authority is added.

Validation so far:
- Reproduced on the previous implementation with a real SQLite exclusive lock and real Prologue adapter: the first failure ended the step permanently.
- The added RAC-61/62 regression holds and releases a real database lock. The same step remains running, then succeeds with one status query and no model call; genuinely missing work and the wrong graph still have no authority.
- Full build, merge-base health gates and package boundaries passed. All 64 required/scoped files passed (581 tests, including two real Chrome cases); no failures or skips.

This is independent of the queued Plugin Runtime migrations. It changes only assistant-jobs.ts, its existing test fixture/case, and the anti-corruption spec. No live Home data, page assets, contract snapshots or gate rules are changed.
