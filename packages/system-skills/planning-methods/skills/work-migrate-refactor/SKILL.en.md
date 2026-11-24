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

Follow the planning path to split finite, independently deliverable items; answer relevant required-coverage questions (list unknowns as open); link dependencies only for consumed outputs and keep unrelated work parallel; attach completion evidence, run closeout checks, and show the person before writing to any tool.
