# Security and privacy

Build prevention, detection, response and data governance around assets, trust boundaries and threats.

For: Security design, Privacy governance, High-risk features.

## Planning path

1. Inventory assets, principals, sensitive data, permissions and trust boundaries
2. Assess threats, abuse, privacy impact and priorities
3. Design least privilege, data minimization and key controls
4. Provide detection, audit, response, recovery and notification
5. Verify controls against attacks, permission boundaries and recovery drills

## Required coverage

| area | label | question |
| --- | --- | --- |
| protected_assets | Protected assets | Which data, powers, credentials and outcomes would cause most harm if compromised? |
| actors_trust_boundaries | Principals and trust boundaries | Who can access what, and where does identity, privilege or the system boundary change? |
| threats_abuse | Threats and abuse | Which attacks, mistakes and insider abuse are plausible? |
| privacy_lifecycle | Data lifecycle | Why collect it, how use and share it, and when retain or delete it? |
| controls_assurance | Controls and tests | Which prevention, detection and audit controls reduce a concrete risk? |
| incident_recovery | Incidents and recovery | How do we contain harm, restore a trusted state and notify people? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| controls-after-risk-model | Controls consume identified assets, boundaries, threats and impact. | controls depend_on risk model |
| release-after-assurance | Releasing a high-risk feature needs verified access, attack paths and prepared recovery. | high-risk release depends_on assurance evidence |

## Completion evidence

- Assets, data flows, boundaries and privileges
- Controls and tests tied to concrete risks
- Incident and recovery drill

## Closeout checks

- A named owner for each high-risk asset and capability
- Controls address actual threats
- Least privilege, deletion and recovery can be exercised

## Common mistakes

- Leaving security until release
- Treating a compliance checklist as the threat model
- Ignoring mistakes and permission drift

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
