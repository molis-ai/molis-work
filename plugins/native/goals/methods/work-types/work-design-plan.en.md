---
name: "Design and plan"
summary: "Establish goals and constraints, then develop a testable direction and implementation path."
applies_to: ["Product design", "System design", "Project planning"]
---

# Design and plan

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
