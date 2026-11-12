---
name: "Sensitive data and privacy"
summary: "Add minimization, consent and lifecycle boundaries to personal, health, financial and confidential data."
applies_to: ["Personal data", "Sensitive business data", "Sharing across parties"]
---

# Sensitive data and privacy

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
