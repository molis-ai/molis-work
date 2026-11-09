---
name: "Product and UX"
summary: "Verify behavior through the person's goal and main journey, then complete the experience."
applies_to: ["Product design", "Interaction design", "Experience improvement"]
---

# Product and UX

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
