# Two-sided marketplace

Add liquidity, matching, trust, governance and balanced incentives.

For: Transaction platforms, Service matching, Creator or developer markets.

## Planning path

1. Define roles, benefits, costs and ways around the platform
2. Establish supply quality, demand intent, matching and liquidity
3. Design identity, reputation, transaction, dispute and governance
4. Balance subsidy, fees, ranking and long-term health
5. Verify density, success, retention and trust by region or category

## Required coverage

| area | label | question |
| --- | --- | --- |
| marketplace_sides | Sides | What does each side contribute and receive, and who bears the main cost or risk? |
| liquidity_matching | Liquidity and match | Where and when do suitable parties find each other and transact? |
| supply_quality | Supply quality | Who can join, and how are quality, ranking, correction and exit handled? |
| marketplace_trust | Trust | How do identity, reputation, guarantees, reviews and disputes reduce uncertainty? |
| platform_governance | Governance | Who decides and explains ranking, fees, subsidy, penalties and appeals? |
| side_health | Health | How do we prevent growth on one side from eroding long-term value on the other? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| matching-after-side-contract | Matching and ranking require each side's value, supply standards, demand intent and governance limits. | matching depends_on side and governance contract |
| expansion-after-liquidity | Expansion requires local liquidity, success, trust and economics. | marketplace expansion depends_on local liquidity proof |

## Completion evidence

- Value, cost and risk map by side
- Local match, success and dispute records
- Ranking, governance, penalty and appeal cases

## Closeout checks

- Aggregate volume does not hide one side's health
- Ranking and reputation resist manipulation
- Cold start is narrow enough to prove density

## Common mistakes

- Expanding both sides until nowhere is liquid
- Subsidizing short-term trade without durable value
- Scores without disputes or appeals

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
