# UGC and trust and safety

Add lifecycle, moderation, appeals and victim protection to user content and social interaction.

For: Content communities, Comments and messaging, User uploads.

## Planning path

1. Identify content and interaction surfaces, participants and harms
2. Establish policy, detection, reporting, review and enforcement
3. Design distribution controls, protection, appeal and recovery
4. Provide reviewer tooling, quality, access and wellbeing
5. Calibrate against adversarial cases, misses, false positives and transparency data

## Required coverage

| area | label | question |
| --- | --- | --- |
| ugc_surface | Surfaces | What can people create, upload, comment, message, stream or share? |
| harm_taxonomy | Harms | Which behavior harms individuals, groups, the platform or public safety? |
| moderation_lifecycle | Moderation lifecycle | How do prevention, detection, reporting, review, enforcement and re-review connect? |
| victim_protection | Victim protection | How do we stop ongoing harm, preserve evidence and provide recovery? |
| appeals_transparency | Appeals and transparency | How can people understand and appeal, and how does the platform see bias and mistakes? |
| moderator_operations | Moderation operations | How are reviewer authority, quality, capacity and health risks managed? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| distribution-after-policy | Distribution and interaction need clear rules, risk tiers and enforcement contracts. | distribution depends_on policy and harm model |
| launch-after-safety-operations | Release needs reports, review, appeals, victim protection and incident response ready. | ugc launch depends_on safety operations |

## Completion evidence

- Surface, harm and moderation-state map
- Report, review, appeal and urgent escalation drill
- Mistakes, misses, response times and victim outcomes

## Closeout checks

- Safety is designed with publication
- Automation does not own the final decision and has escalation
- Enforcement, appeal and recovery are traceable

## Common mistakes

- Opening a community with only keyword filters
- Protecting metrics instead of victims
- Optimizing speed without accuracy or reviewer burden

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
