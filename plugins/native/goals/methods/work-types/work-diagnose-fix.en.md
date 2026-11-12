---
name: "Diagnose and fix"
summary: "Reproduce and identify the cause, then fix, check regressions and restore confidence."
applies_to: ["Incident diagnosis", "Bug fixes", "Quality problems"]
---

# Diagnose and fix

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
