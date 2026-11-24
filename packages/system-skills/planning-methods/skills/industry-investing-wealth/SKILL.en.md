# Investing and wealth management

Connect client goals, suitability, market data, trading and disclosure.

For: Investment tools, Wealth management, Securities trading.

## Planning path

1. Define goals, horizon, risk tolerance and responsibility
2. Establish provenance and freshness of market data, research, advice and disclosure
3. Map order, risk checks, fill, position, valuation and corporate actions
4. Design monitoring, warnings, human service and conflict handling
5. Test bad data, failed trades, hindsight bias and client understanding

## Required coverage

| area | label | question |
| --- | --- | --- |
| investor_context | Client context | What are goals, horizon, liquidity, risk tolerance and experience? |
| advice_execution_boundary | Advice and execution | Does the product inform, analyze, advise or execute, and who is responsible? |
| market_data_provenance | Market data | Where do prices, fundamentals and research originate, when do they refresh, and how are errors found? |
| order_position_lifecycle | Orders and positions | How do order, fill, fee, position, valuation and corporate action agree? |
| portfolio_risk | Portfolio risks | How are concentration, liquidity, leverage, volatility and scenarios observed? |
| disclosure_audit | Disclosure and audit | How are risk, fee, conflicts and past decisions understood and traced? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| recommendation-after-context-data | Personal advice requires client context, responsibility and traceable data. | recommendation depends_on investor context and market data |
| execution-after-controls | Execution requires order state, access, risk, fees and recovery contracts. | execution depends_on trading controls and lifecycle contract |

## Completion evidence

- Client goals, risk and responsibility
- Market source, freshness and error records
- Order-to-position reconciliation and disclosure verification

## Closeout checks

- Returns include risk, fees and date range
- Advice and execution trace to context and data at the time
- Market-specific licensing and protections confirmed separately

## Common mistakes

- Using past returns to imply certainty
- Mixing information, advice and execution
- Testing orders without positions, costs or corporate actions

## How to use this method

Follow the planning path to split finite, independently deliverable items; answer relevant required-coverage questions (list unknowns as open); link dependencies only for consumed outputs and keep unrelated work parallel; attach completion evidence, run closeout checks, and show the person before writing to any tool.
