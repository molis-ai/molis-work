# Migrate and refactor

Define compatibility and rollback, then replace and verify in stages.

For: Data migrations, Architecture refactors, System replacements.

## Planning path

1. Inventory current behavior and compatibility
2. Define target state and batches
3. Prepare rollback and verification in both directions
4. Switch in stages and remove old paths

## Required coverage

| area | label | question |
| --- | --- | --- |
| baseline_contract | Current contract | Which behavior and data survive? |
| migration_path | Migration | How does each batch enter, verify and exit? |
| rollback | Rollback | How can we return to a trusted state on failure? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| cutover-after-proof | Switching requires verified migration and usable rollback. | cutover depends_on validation and rollback |
| cleanup-after-cutover | Removal needs a switched and observed replacement with confirmed rollback boundary. | legacy cleanup depends_on proven cutover |

## Completion evidence

- Reconciliation before and after
- Rollback drill or reproducible steps

## Closeout checks

- Old path has a clear exit
- No silent loss of compatible behavior

## Common mistakes

- Migrating without a baseline
- Moving only successful paths
- Keeping old paths forever

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
