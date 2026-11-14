# Product and UX

Verify behavior through the person's goal and main journey, then complete the experience.

For: Product design, Interaction design, Experience improvement.

## Planning path

1. Define the person, moment and current friction
2. Design main journey and states
3. Build a realistic high-fidelity slice
4. Complete first use, failure and responsive cases

## Required coverage

| area | label | question |
| --- | --- | --- |
| user_problem | User need | What is the person trying to finish right now? |
| core_flow | Main journey | What is the shortest natural complete path? |
| system_feedback | State and feedback | How does the person know and intervene? |
| edge_experience | Edge experiences | How do first use, empty, failed, slow and recovery states work? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| slice-after-flow | A high-fidelity slice requires the main journey, key states and risks to test. | high-fidelity slice depends_on core flow and states |
| scale-after-slice | Full implementation requires a tested realistic slice. | full build depends_on validated slice |

## Completion evidence

- Visible, usable slice
- Real content and key states

## Closeout checks

- The main job progresses without instructional copy
- Hierarchy and recovery are clear

## Common mistakes

- Using a generic dashboard
- Restyling without improving the path
- Explaining poor interaction with paragraphs

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
