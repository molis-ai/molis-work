# Reliability and release

Deliver continuously with service objectives, controlled change, observability and recovery.

For: Production services, Release process, Reliability governance.

## Planning path

1. Define key journeys, objectives and acceptable degradation
2. Identify capacity, dependency, state and change risks
3. Set build, deployment, migration, rollback and gradual rollout
4. Complete observability, alerts, duty ownership and response
5. Improve using fault injection, recovery drills and operational data

## Required coverage

| area | label | question |
| --- | --- | --- |
| critical_journeys_slo | Journey and objectives | Which outcomes must work, and how are success, latency and availability measured? |
| dependency_capacity | Dependencies and capacity | Which dependencies, resources and state can cascade? |
| change_delivery | Change delivery | How are build, config, migration, rollout and rollback controlled? |
| observability_alerting | Observability | Which signals diagnose real user impact? |
| incident_response | Incident response | Who decides, mitigates, communicates, recovers and reviews? |
| continuity_recovery | Continuity | How are data, service and human processes restored to a trusted state? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| release-plan-after-risk | Release, migration and rollback plans need key journeys, state and dependency risks. | release plan depends_on reliability risk model |
| rollout-after-readiness | Production rollout needs runnable output, monitoring, rollback and an available owner. | rollout depends_on operational readiness |

## Completion evidence

- Objectives and signals for key journeys
- Repeatable release, migration and rollback records
- An incident or recovery drill

## Closeout checks

- Alerts map to user impact and have actions
- Recovery and rollback require no guessing
- Critical dependencies and capacity have a fallback

## Common mistakes

- Treating deployment as release completion
- Monitoring without knowing whether users are hurt
- Testing only normal releases, not rollback and data recovery

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
