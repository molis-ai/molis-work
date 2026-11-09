---
name: "Software development"
summary: "Fix project and module ownership first, then organize implementation, integration and delivery around vertical and horizontal modules."
applies_to: ["Application development", "Service development", "Engineering changes"]
---

# Software development

## Planning path

1. Confirm product outcome, behavior, acceptance and non-goals
2. Verify the project source of truth for invariants, authoritative state and decisions, module index and cross-module contracts
3. Divide by end-to-end outcomes and shared capabilities, resolving overlaps in state, contracts, decisions and writes
4. After the map is stable, write module sources in parallel for ownership, inputs, outputs, consumers, recovery and Impact surfaces
5. Derive implementation Goals from module sources; wait only for consumed contracts, and keep provider and consumer parallel when doubles, fixtures or an agreed compatibility layer allow independent verification
6. Integration, end-to-end acceptance, migration, release and recovery consume runnable outputs from all involved modules

## Required coverage

| area | label | question |
| --- | --- | --- |
| core_function | Main capability | Which real user or caller path must work? |
| user_journey | User journey | How do they enter, finish and recover? |
| interaction_ui | Interaction and UI | How do people observe and control the system? |
| content_information | Information | What does the system present and retain? |
| project_ssot | Project source of truth | Which repository document owns outcomes, non-goals, invariants, authoritative state, module index, cross-module contracts and validation; is it still valid? |
| module_architecture | Module map | Which vertical modules own end-to-end outcomes, which horizontal ones serve multiple consumers, and who alone owns each fact, contract and decision? |
| module_ssot_contracts | Module source of truth | Where does each module specify responsibilities, non-responsibilities, I/O, public contracts, consumers, recovery and acceptance? |
| parallel_impact_boundaries | Concurrent writes | Which Impact surfaces does each parallel Goal read, write, decide or hold exclusively; where is there unresolved overlap? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| project-ssot-after-product-plan | Project source of truth uses confirmed goals, behavior, acceptance and non-goals; product planning does not depend on implementation. | project SSOT depends_on confirmed product plan |
| module-ssot-after-project-ssot | Module sources use project invariants, map and cross-module contracts; parallelize writing once the map settles. | module SSOT depends_on project SSOT and module map |
| implementation-after-module-ssot | Implementation needs its stable, testable module specification and public contracts it actually consumes. | module implementation depends_on its module SSOT and consumed provider contract |
| provider-consumer-implementations-parallel | Keep provider and consumer parallel where a stable contract plus double, fixture or agreed layer lets the consumer verify independently. | keep provider and consumer implementations parallel after contract |
| integration-after-module-implementations | Integration, end-to-end acceptance, release and recovery consume both parties' runnable outputs. | integration and release depend_on provider and consumer implementations |
| contract-before-consumer | Consumer implementation requires a stable, testable provider contract. | consumer depends_on provider contract |

## Completion evidence

- Readable project source and module index
- Readable module specifications and public contracts
- Ownership and Impact read/write check
- Targeted tests, build or types and a real main path

## Closeout checks

- Project and module facts have one authority each
- One owner for each state, datum, contract and decision
- Parallel Goals have no conflicting write, decide or exclusive surface
- Dependencies reflect contracts or usable outputs, not organization
- I/O, errors, release and recovery are executable

## Common mistakes

- Dividing mechanically by UI/API/DB, folder or team
- Duplicating all module detail in the root spec
- Shared ownership of one state or contract
- A horizontal module with no clear consumers
- Waiting for provider implementation even when a stable contract enables independent work
- Claiming usability from unit tests
- Missing failure and migration paths

## Event types

| type_id | version | name | purpose | semantic_family |
| --- | --- | --- | --- | --- |
| engineering-delivery | 1 | Delivery | Record the usable output, where to start and known gaps. | delivery |
| engineering-behavior-verification | 1 | Behavior verification | Record what changed, how it was verified and what was observed. | verification |
| engineering-ui-inspection | 1 | Interface check | Record which visible interface was checked and what it showed. | verification |
| engineering-concern | 1 | Concern | Record the issue or risk and what it affects. | concern |

## Event fields

| type_id | field_id | name | purpose | format | required |
| --- | --- | --- | --- | --- | --- |
| engineering-delivery | result | Delivered result | What can be used now | text | true |
| engineering-delivery | entry | How to use | Where the next person starts | text | false |
| engineering-delivery | limits | Known gaps | Unfinished or unverified work | longtext | false |
| engineering-behavior-verification | target | Subject | Behavior verified | text | true |
| engineering-behavior-verification | method | Method | How it was checked | text | true |
| engineering-behavior-verification | observation | Observed | What happened | longtext | true |
| engineering-behavior-verification | conclusion | Conclusion | Current judgment | text | true |
| engineering-ui-inspection | surface | Interface checked | Visible scope | text | true |
| engineering-ui-inspection | observation | Observation | Actual appearance or issue | longtext | true |
| engineering-ui-inspection | conclusion | Conclusion | Current judgment | text | true |
| engineering-concern | problem | Issue or risk | What happened | longtext | true |
| engineering-concern | impact | Affected | Result or path affected | text | true |
| engineering-concern | status | Current treatment | Open, accepted or awaiting a later event | text | true |

## Default requirements

| requirement_id | statement | bound_type_id | applies_when |
| --- | --- | --- | --- |
| engineering-delivery | This work delivered something usable | engineering-delivery | Explicit adoption is required for a completion requirement; not every Goal needs a delivery record |
| engineering-behavior-verification | Behavior changes have corresponding checks | engineering-behavior-verification | Adopt only when behavior changes |
| engineering-ui-inspection | Visible interfaces were checked | engineering-ui-inspection | Adopt only for interface changes |
| engineering-concern | Unresolved issues are recorded | engineering-concern | Adopt when a risk or problem exists, not on every Goal |
