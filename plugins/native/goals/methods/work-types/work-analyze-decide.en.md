---
name: "Analyze and decide"
summary: "Turn questions, evidence and alternatives into a traceable decision."
applies_to: ["Data analysis", "Market decisions", "Choosing an approach"]
---

# Analyze and decide

## Planning path

1. Define the decision and success criteria
2. Set data and evidence boundaries
3. Develop comparable choices
4. Record decision, reasons and review triggers

## Required coverage

| area | label | question |
| --- | --- | --- |
| decision_question | Decision | Which decision must this analysis support? |
| evidence_base | Evidence | What are sources, quality and limits? |
| alternatives | Alternatives | Which options genuinely differ, and how? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| evidence-after-question | Evidence collection needs a clear question and definitions; avoid aimless accumulation. | evidence plan depends_on decision question |
| decision-after-evidence | Decisions use analytical evidence; analysis does not depend on a preset result. | decision depends_on evidence |

## Completion evidence

- Sources and definitions
- Key assumptions
- Counterevidence or sensitivity check

## Closeout checks

- Conclusion traces to evidence
- Limits and uncertainty are visible

## Common mistakes

- Deciding before finding data
- Collecting without options
- Treating correlation as causation
