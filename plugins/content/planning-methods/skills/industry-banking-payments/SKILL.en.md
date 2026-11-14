# Banking and payments

Build trustworthy transactions around funds, ledger, authorization, settlement, disputes and availability.

For: Payments, Banking services, Financial infrastructure.

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

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
