---
name: "AI and data products"
summary: "Cover data, evaluation, operating costs, safety and user intervention together."
applies_to: ["AI features", "Agent products", "Data products"]
---

# AI and data products

## Planning path

1. Define the AI's role and the context it consumes
2. Establish data and evaluation baselines
3. Design outputs and points for observation and intervention
4. Verify cost, safety, failures and recovery

## Required coverage

| area | label | question |
| --- | --- | --- |
| ai_data_sources_quality | Data sources and quality | Where do inputs come from, and how are quality and permission assured? |
| ai_evaluation | Evaluation and limits | How do we measure quality and identify limits? |
| ai_runtime_cost | Operation and cost | How are latency, cost, timeouts and retries bounded? |
| ai_safety_governance | Safety and governance | How can a person observe, intervene and recover from bad results? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| ai-after-eval-baseline | AI implementation needs defined data boundaries and a repeatable evaluation baseline. | runtime capability depends_on data and evaluation |
| rollout-after-safety | A real release requires verified costs, permissions, safety, human intervention and recovery. | rollout depends_on safety and recovery evidence |

## Completion evidence

- Representative evaluation set
- Quality, cost and latency results
- Failure and recovery drill

## Closeout checks

- AI creates a usable artifact or state change
- Poor quality and timeouts have a recovery path

## Common mistakes

- Reducing AI to a chat box
- Testing only demos
- No point for human intervention
