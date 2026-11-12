---
name: "Human review of AI"
summary: "Add observability, intervention and recovery to AI affecting people, content, funds or professional judgment."
applies_to: ["Decision support", "Automated content or operations", "High-impact outputs"]
---

# Human review of AI

## Planning path

1. Define role, context, outputs and responsibilities AI cannot take over
2. Divide automatic action, recommendation, review and prohibition by impact and reversibility
3. Give people places to observe, understand, correct and take over
4. Establish evaluation, monitoring, feedback, rollback and model-change governance
5. Verify bad quality, timeout, bias, adversarial cases and recovery

## Required coverage

| area | label | question |
| --- | --- | --- |
| ai_role_context | Role and context | What state does AI consume, and what artifact, decision or state change results? |
| impact_reversibility | Impact and reversibility | Who is harmed by errors, what can be undone, and what must be reviewed first? |
| human_observation | Observation | Where do people see evidence, uncertainty and affected scope? |
| intervention_override | Intervention | How can a person correct, reject, pause, retry or take over? |
| evaluation_monitoring | Evaluation and monitoring | How are offline ability, real outcomes, bias and drift observed? |
| ai_failure_recovery | Failure and recovery | How is a trustworthy state restored after timeout, poor output, provider outage or restart? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| automation-after-impact-boundary | Automatic actions need explicit impact tiers, reversibility and human responsibility. | automation depends_on impact and oversight contract |
| high-impact-release-after-evaluation | High-impact release needs representative evaluation, takeover, monitoring and recovery evidence. | high-impact AI release depends_on evaluation and recovery evidence |

## Completion evidence

- Role, context, output and state contract
- Representative, edge and failure evaluations
- Human rejection, correction, takeover and recovery drill

## Closeout checks

- AI changes an explicit outcome or state
- Review has enough context and can prevent or correct action
- Model/provider changes cannot bypass evaluation

## Common mistakes

- Replacing control with disclaimers
- Measuring averages while ignoring high-impact failures
- Showing results with no way to stop, correct or recover
