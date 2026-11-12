---
name: "Healthcare"
summary: "Organize around health outcomes, clinical workflow, evidence, safety and qualified responsibility."
applies_to: ["Digital health", "Care services", "Health management"]
---

# Healthcare

## Planning path

1. Define population, outcomes, use and clinical responsibility excluded
2. Map patient, professional, institution and continuity workflows
3. Establish evidence, safety risk, human judgment and escalation
4. Design health data, interoperability, privacy and audit
5. Verify safety, effectiveness, usability and equity in real use

## Required coverage

| area | label | question |
| --- | --- | --- |
| health_outcome_scope | Health outcomes and limits | What improves and which diagnostic or treatment decisions are out of scope? |
| care_workflow | Care workflow | How are information and responsibility handed off? |
| clinical_evidence | Clinical evidence | What supports the claims, for whom and with what limits? |
| patient_safety | Safety | What harm can error, delay, omission or misunderstanding cause? |
| professional_oversight | Supervision | Which decisions require a qualified professional to review, explain or take over? |
| health_data_interop | Data and interoperability | How do origin, meaning, consent, exchange and audit remain trustworthy? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| workflow-after-clinical-boundary | Product and care workflow need confirmed outcomes, evidence limits and professional responsibility. | care workflow depends_on clinical scope and evidence |
| deployment-after-safety-proof | Deployment requires verified safety, human escalation, data governance and recovery. | clinical deployment depends_on safety and oversight evidence |

## Completion evidence

- Claims, evidence level and boundaries
- Responsibility and escalation drill
- Safety, data, privacy and supervision verification

## Closeout checks

- Claims stay within evidence
- A professional can observe and take over high-risk results
- Relevant requirements were confirmed separately for the market

## Common mistakes

- Treating usability as clinical effectiveness
- Replacing professional judgment with AI confidence
- Connecting data without meaning, access and audit
