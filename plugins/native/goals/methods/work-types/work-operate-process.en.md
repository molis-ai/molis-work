---
name: "Operate and improve a process"
summary: "Define roles, triggers, handoffs, exceptions and measures for runnable operations."
applies_to: ["Operations", "Organizational workflow", "Recurring work"]
---

# Operate and improve a process

## Planning path

1. Define trigger and who the service serves
2. Set roles, handoffs and permissions
3. Design normal and exception flows
4. Separate setup from recurring operation
5. Define measures, evidence and finite improvement paths

## Required coverage

| area | label | question |
| --- | --- | --- |
| roles_responsibilities | Roles | Who starts, executes, approves and takes responsibility on failure? |
| exception_handling | Exceptions | How do we recover from failure, timeout and conflict? |
| measurement | Measurement | How will we know the process works and should continue? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| workflow-after-ownership | Execution needs clear roles, rights and handoffs. | workflow depends_on roles and permissions |
| improvement-after-measurement | Improvement depends on real operational evidence and outcomes, not impressions. | improvement depends_on operational evidence |

## Completion evidence

- Real operating records
- Exceptions
- Outcome metrics

## Closeout checks

- Handoffs leave no implied responsibilities
- Exceptions have recovery
- Setup Goal can close; ongoing work produces separate evidence

## Common mistakes

- Showing only the normal flow
- Applying full-time roles to part-time work
- No observable outcome
- A permanently open Goal for ongoing work
