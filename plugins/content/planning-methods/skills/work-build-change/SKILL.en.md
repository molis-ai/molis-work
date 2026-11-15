# Build and change

Work backward from an observable outcome to capabilities, foundations and delivery.

For: Build products, Create capability, Change existing systems.

## Planning path

1. Define outcome and use
2. Separate main capability from supporting foundations
3. Split Goals by independent delivery and acceptance
4. Complete validation, release and recovery

## Required coverage

| area | label | question |
| --- | --- | --- |
| final_outcome | Outcome | What ships, who uses it and what changes? |
| operating_flow | Real flow | How is the result made, used and maintained; how do roles work together? |
| core_capabilities | Core capabilities | What business or professional capabilities must work? |
| foundation_infrastructure | Foundations | What data, assets, tools, permissions and environment do those capabilities consume? |
| quality_continuous_delivery | Quality and delivery | How do we verify, deliver, observe, recover and improve? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| capability-after-foundation | Core capabilities depend on foundations only when they consume infrastructure, data, privileges or contracts. | capability depends_on consumed foundation |
| delivery-after-capability | Delivery, release and acceptance need runnable core capability and verification. | delivery depends_on validated capability |

## Completion evidence

- Runnable or usable output
- Evidence tied to acceptance

## Closeout checks

- User outcome is observable
- One main acceptance outcome per leaf
- Core capabilities actually consume the foundation

## Common mistakes

- Mechanical split by file or layer
- Listing features without operations and delivery
- Treating discussion order as execution

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
