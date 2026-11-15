# Sensitive data and privacy

Add minimization, consent and lifecycle boundaries to personal, health, financial and confidential data.

For: Personal data, Sensitive business data, Sharing across parties.

## Planning path

1. Identify subjects, sensitivity, purposes and prohibited uses
2. Map collection, inference, use, sharing, retention and deletion
3. Design minimization, consent, access, isolation and withdrawal
4. Add audit, subject requests, breach response and processor limits
5. Test access violation, withdrawal, deletion and recovery

## Required coverage

| area | label | question |
| --- | --- | --- |
| data_purpose | Purpose | Why is each category needed and which uses are prohibited? |
| data_subject_control | Subject control | How can people understand, choose, see, correct, export or delete? |
| sensitive_data_flow | Flow | Where does data originate and go, and who can see or infer it? |
| retention_deletion | Retention and deletion | What authorizes retention and what are deadlines, backups and deletion evidence? |
| third_party_data | Processors | What do external services, models and partners receive, and what constrains them? |
| privacy_incident | Incidents | How do we contain and recover after unauthorized access, misdelivery or exposure? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| processing-after-purpose | Collection, sharing and inference need explicit purpose, minimum scope and authority. | data processing depends_on purpose and authorization |
| launch-after-lifecycle-proof | Release needs tested access, withdrawal, deletion, audit and incident response. | sensitive-data launch depends_on lifecycle evidence |

## Completion evidence

- Inventory, purpose, flows and access matrix
- Withdrawal, export and deletion checks
- Third-party processing and incident records

## Closeout checks

- No aimless collection for possible later use
- Withdrawal really stops access and use
- Logs, caches and backups do not bypass deletion

## Common mistakes

- Reducing privacy to a policy
- Using consent for unnecessary processing
- Deleting only the primary store

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
