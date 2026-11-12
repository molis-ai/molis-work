---
name: "Build and change"
summary: "Work backward from an observable outcome to capabilities, foundations and delivery."
applies_to: ["Build products", "Create capability", "Change existing systems"]
---

# Build and change

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
