---
name: "Payments and assets"
summary: "Require reconciliation and recovery for charges, balances, entitlements and transferable assets."
applies_to: ["In-app payments", "Subscription rights", "Balances and digital assets"]
---

# Payments and assets

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
