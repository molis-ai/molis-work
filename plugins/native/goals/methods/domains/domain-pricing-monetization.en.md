---
name: "Pricing and monetization"
summary: "Connect customer value, pricing units, plans, charging and commercial evidence."
applies_to: ["Product pricing", "Plan design", "Subscription and usage billing"]
---

# Pricing and monetization

## Planning path

1. Identify payer, user, results and alternative costs
2. Choose a comprehensible unit that grows with value
3. Design entitlements, limits, upgrades and downgrades
4. Walk quote, payment, activation, metering, invoice and refund
5. Iterate using conversion, use, retention and unit economics

## Required coverage

| area | label | question |
| --- | --- | --- |
| payer_user_value | Payer and user | Who pays, uses and approves, and what does each get? |
| value_metric | Value unit | What observable value changes the price, and is cost predictable? |
| packaging_entitlements | Plans | What do plans include and limit, and when do changes take effect? |
| commercial_flow | Billing path | How do quote, activation, metering, invoicing, refund and termination connect? |
| unit_economics | Unit economics | How do revenue, service, channel and risk costs relate? |
| pricing_evidence | Pricing evidence | How do behavior and interviews distinguish interest, ability and payment? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| billing-after-model | Billing, entitlements and invoices need agreed units, plans and state contracts. | billing implementation depends_on pricing and entitlement model |
| rollout-after-commercial-proof | Broader charging requires real payment, use, retention and support-cost evidence. | monetization rollout depends_on commercial evidence |

## Completion evidence

- Payer and user's value and decision evidence
- Entitlement and state-transition contract
- A real or sandbox end-to-end charge

## Closeout checks

- The person understands and can estimate cost
- Entitlement, usage, invoice and refund agree
- Price increases are consistent with delivered value and service cost

## Common mistakes

- Integrating payments before deciding what to sell
- Differentiating plans only by feature count
- Ignoring retention, refunds and service costs
