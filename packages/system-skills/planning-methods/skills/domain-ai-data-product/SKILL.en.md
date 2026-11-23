# AI and data products

Cover data, evaluation, operating costs, safety and user intervention together.

For: AI features, Agent products, Data products.

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

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
