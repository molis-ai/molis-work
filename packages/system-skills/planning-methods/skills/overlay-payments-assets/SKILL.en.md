# Payments and assets

Require reconciliation and recovery for charges, balances, entitlements and transferable assets.

For: In-app payments, Subscription rights, Balances and digital assets.

## Planning path

1. Define legal and product meaning of funds, balance, points, entitlements or assets
2. Fix purchase, authorization, posting, issuance, use and reversal states
3. Design idempotency, reconciliation, refunds, disputes and adjustment
4. Add permissions, risk, audit, suppliers and recovery
5. Verify duplicate, delay, partial success and reverse transactions

## Required coverage

| area | label | question |
| --- | --- | --- |
| asset_definition | Asset definition | What does the person hold: payment result, access right, balance or transferable asset? |
| entitlement_ledger | Ledger and entitlements | What record is authoritative, and how do money and rights agree? |
| transaction_idempotency | Idempotency | How do retries, duplicate callbacks and concurrency take effect once? |
| reversal_dispute | Reversal and disputes | How do cancellation, refund, chargeback, expiry and adjustment reverse outcomes? |
| provider_reconciliation | Provider reconciliation | How are differences detected and fixed? |
| asset_recovery | Recovery and audit | How is reconciliation restored without losing audit? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| fulfillment-after-confirmed-transaction | Irreversible shipment or grants need verified transaction state and idempotency keys. | fulfillment depends_on confirmed idempotent transaction |
| launch-after-reversal-proof | Release needs reconciliation, reversals, disputes and recovery tests. | asset launch depends_on reconciliation and reversal evidence |

## Completion evidence

- Transaction, ledger, entitlement and reversal contracts
- Duplicate, timeout, partial and refund tests
- Internal/external reconciliation and recovery drill

## Closeout checks

- Successful API response does not prove final funds
- Entitlement changes trace to authoritative transactions
- Market-specific payments or asset rules confirmed separately

## Common mistakes

- Granting rights before posting
- Using the order table as immutable ledger
- Testing payment success but no refunds or disputes

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
