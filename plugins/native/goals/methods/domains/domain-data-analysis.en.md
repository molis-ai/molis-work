---
name: "Data analysis"
summary: "Move from a decision, definitions and data quality to reproducible conclusions."
applies_to: ["Metrics analysis", "Causal exploration", "Forecasting and segmentation"]
---

# Data analysis

## Planning path

1. Define the decision and unit of analysis
2. Fix definitions, time window and sources
3. Clean data and check bias
4. Analyze, test sensitivity and deliver reproducible work

## Required coverage

| area | label | question |
| --- | --- | --- |
| data_question | Question | What decision will the result inform? |
| data_quality | Data and definitions | What are the sources, gaps, biases and definitions? |
| analysis_validity | Validity | Which assumptions, comparisons and sensitivities require checking? |
| decision_delivery | Delivery | How will the conclusion be used and reproduced? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| analysis-after-quality | Formal analysis depends on fixed definitions and checked data. | analysis depends_on validated data |
| decision-delivery-after-analysis | Conclusions and recommendations need completed analysis, counterevidence and sensitivity checks. | decision delivery depends_on validated analysis |

## Completion evidence

- Sources and definitions
- Reproducible query or script
- Quality and sensitivity checks

## Closeout checks

- Conclusion answers the original decision
- Limits and extrapolation boundaries are explicit

## Common mistakes

- Charting before defining the question
- Mixing definitions
- Treating correlation as causation
