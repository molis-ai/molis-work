---
name: "Reliability and release"
summary: "Deliver continuously with service objectives, controlled change, observability and recovery."
applies_to: ["Production services", "Release process", "Reliability governance"]
---

# Reliability and release

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
