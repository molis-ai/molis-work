# Data analysis

Move from a decision, definitions and data quality to reproducible conclusions.

For: Metrics analysis, Causal exploration, Forecasting and segmentation.

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

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
