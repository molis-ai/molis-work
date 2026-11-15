# Diagnose and fix

Reproduce and identify the cause, then fix, check regressions and restore confidence.

For: Incident diagnosis, Bug fixes, Quality problems.

## Planning path

1. Record symptoms and reproduction
2. Narrow impact and propose a falsifiable cause
3. Implement a minimum complete fix
4. Recheck the failure and nearby boundaries

## Required coverage

| area | label | question |
| --- | --- | --- |
| symptom | Symptoms | Which input, environment and action reproduce it? |
| root_cause | Cause | Which contract or transition produces it? |
| regression | Regression | How do we show the fix and protect adjacent paths? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| fix-after-cause | A fix needs a verified cause, not guesswork. | fix depends_on root-cause evidence |
| regression-after-fix | Regression needs the completed fix and original failing baseline. | regression depends_on fix and failure baseline |

## Completion evidence

- Failure before fix
- Passing evidence after fix
- Checks of adjacent paths

## Closeout checks

- The cause explains all key symptoms
- No patches compensating for one another

## Common mistakes

- Adding a condition for each error
- Removing only the visible symptom
- No before/after comparison

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
