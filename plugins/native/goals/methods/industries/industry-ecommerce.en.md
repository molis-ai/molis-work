---
name: "E-commerce"
summary: "Connect discovery, inventory and price, purchase, fulfillment, support and business outcomes."
applies_to: ["Online retail", "Brand storefronts", "Transaction commerce"]
---

# E-commerce

## Planning path

1. Define customers, shopping job, supply and promises
2. Establish authoritative product, price, stock, promotion and content
3. Walk discovery, comparison, cart, checkout and payment
4. Connect picking, shipment, delivery, returns, refunds and support
5. Verify conversion, margin, fulfillment, returns and repeat purchase

## Required coverage

| area | label | question |
| --- | --- | --- |
| shopper_mission | Shopping job | Why buy, and how do customers find, compare and trust it? |
| catalog_offer | Product and offer | Who owns product, variant, price, stock and promotion facts? |
| checkout_payment | Checkout | How do address, tax, discount, payment and confirmation stay consistent? |
| fulfillment_delivery | Fulfillment | How are stock promises, picking, logistics and delivery exceptions handled? |
| returns_service | After sale | How do returns, cancellations, refunds and support finish? |
| merchandising_economics | Economics | How do traffic, conversion, margin, stock and repeat sales inform decisions? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| checkout-after-offer-contract | Checkout needs stable product, price, inventory, discounts and delivery promises. | checkout depends_on catalog and offer contract |
| promise-after-fulfillment | External stock and delivery promises need capacity, fulfillment and exception recovery evidence. | customer promise depends_on fulfillment readiness |

## Completion evidence

- Reconciled states from product through order, payment, fulfillment and support
- Boundary tests for price, stock, discounts and refunds
- Real shopping job and delivery exceptions

## Closeout checks

- Visible price, stock and delivery agree with the backend
- Payment is distinct from fulfillment
- Returns, refunds and support are available at release

## Common mistakes

- Building only storefront pages
- Multiple authorities for price or stock
- Optimizing conversion without margin, returns and retention
