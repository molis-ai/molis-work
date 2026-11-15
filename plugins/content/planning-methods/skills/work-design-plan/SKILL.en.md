# Design and plan

Establish goals and constraints, then develop a testable direction and implementation path.

For: Product design, System design, Project planning.

## Planning path

1. Define goal, audience and constraints
2. Create a small set of distinct directions
3. Verify major risks in a realistic slice
4. Break into implementation work with actual dependencies

## Required coverage

| area | label | question |
| --- | --- | --- |
| design_intent | Intent | For whom and what, and what is out of scope? |
| design_constraints | Constraints | Which practical boundaries change the design? |
| validation_slice | Test slice | What small real outcome can verify the direction soonest? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| slice-after-intent | The slice needs confirmed goals, constraints and risks. | validation slice depends_on intent and constraints |
| implementation-after-direction | Broad implementation requires a tested direction and high-risk slice. | implementation depends_on validated direction |

## Completion evidence

- Visible or usable proposal
- Verification of key scenario

## Closeout checks

- Proposal guides actual behavior
- Main tradeoffs are explicit

## Common mistakes

- Only words, no real slice
- Endless divergence without choosing
- Implementing the entire design prematurely

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
