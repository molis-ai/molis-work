---
name: "Banking and payments"
summary: "Build trustworthy transactions around funds, ledger, authorization, settlement, disputes and availability."
applies_to: ["Payments", "Banking services", "Financial infrastructure"]
---

# Banking and payments

## Planning path

1. Identify parties, funds, commitments and market boundary
2. Map authorization, posting, clearing, settlement, refunds and disputes
3. Fix ledger, balances, idempotency, reconciliation and finality contracts
4. Provide identity, grants, risk control, compliance, audit and operations
5. Verify with exceptions, recovery, reconciliation and peak loads

## Required coverage

| area | label | question |
| --- | --- | --- |
| payment_participants | Parties and funds | Who pays, receives, holds, routes or guarantees, and where does responsibility change? |
| transaction_lifecycle | Lifecycle | Which traceable states cover authorization through settlement and disputes? |
| ledger_reconciliation | Ledger and reconciliation | What is authoritative, and how are duplicates, delays and differences repaired? |
| identity_risk_controls | Identity and risk | Where are identity, access, limits, fraud and compliance checked? |
| disputes_exceptions | Exceptions | How do chargebacks, refunds, timeouts, partial success and manual adjustments work? |
| resilience_audit | Continuity and audit | How do funds and audit stay consistent through peaks, outages and recovery? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| transaction-after-ledger-contract | Implementation needs funds flow, authoritative ledger, states and idempotency. | transaction implementation depends_on ledger and lifecycle contract |
| launch-after-reconciliation-proof | Release requires end-to-end reconciliation, recovery, permissions and audit evidence. | payment launch depends_on reconciliation and control evidence |

## Completion evidence

- Funds flow and transaction-state contracts
- Reconciliation for success, duplicate, timeout, refund and dispute
- Permissions, risk, audit and recovery drill

## Closeout checks

- Every amount traces to the authoritative record and responsible party
- Retries never duplicate or silently lose postings
- Market-specific licensing and regulatory requirements have separate confirmation

## Common mistakes

- Equating a successful API call with payment
- Confusing order, intent, ledger entry and settlement
- Treating manual reconciliation as permanent architecture
