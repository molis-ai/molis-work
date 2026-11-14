# Operate and improve a process

Define roles, triggers, handoffs, exceptions and measures for runnable operations.

For: Operations, Organizational workflow, Recurring work.

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

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
