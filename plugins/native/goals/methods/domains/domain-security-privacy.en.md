---
name: "Security and privacy"
summary: "Build prevention, detection, response and data governance around assets, trust boundaries and threats."
applies_to: ["Security design", "Privacy governance", "High-risk features"]
---

# Security and privacy

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
