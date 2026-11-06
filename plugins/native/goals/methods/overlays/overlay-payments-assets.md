---
method_id: overlay-payments-assets
version: 1
kind: overlay
name: "支付与资产"
summary: "为任何涉及收费、余额、权益或可转移资产的产品叠加账实一致和异常恢复约束。"
applies_to: ["应用内支付","订阅权益","余额或数字资产"]
domain_tags: ["payments","assets","entitlements"]
source_refs: ["PCI Security Standards Council","Molis Work ledger dependency rules"]
confidence: 0.92
---

# 支付与资产

## 规划路径

1. 明确资金、余额、积分、权益或资产的法律与产品含义
2. 固定购买、授权、记账、发放、消费和撤销状态
3. 设计幂等、对账、退款、争议和人工调整
4. 补齐权限、风控、审计、供应方和故障恢复
5. 用重复、延迟、部分成功和逆向交易验证一致性

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| asset_definition | 资产定义 | 用户拥有的是支付结果、服务权益、余额还是可转移资产？ |
| entitlement_ledger | 权益与账本 | 哪个记录是权威状态，金额和权益如何对应？ |
| transaction_idempotency | 交易幂等 | 重试、重复回调和并发请求如何只生效一次？ |
| reversal_dispute | 撤销与争议 | 取消、退款、拒付、过期和人工调整如何反向处理？ |
| provider_reconciliation | 供应方对账 | 内部记录与支付或资产供应方怎样发现并修复差异？ |
| asset_recovery | 恢复与审计 | 故障后如何恢复账实一致并保留完整审计？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| fulfillment-after-confirmed-transaction | 不可逆发货或权益发放消费可验证的交易状态与幂等键。 | fulfillment depends_on confirmed idempotent transaction |
| launch-after-reversal-proof | 支付或资产能力发布消费对账、撤销、争议和恢复验证。 | asset launch depends_on reconciliation and reversal evidence |

## 完成证据

- 交易、账本、权益和逆向状态契约
- 重复、超时、部分成功与退款测试
- 内外部对账及恢复演练

## 收口检查

- 支付接口成功不直接等同于最终资金状态
- 所有权益变化都能追溯到权威交易
- 已按目标市场另行确认支付或资产监管要求

## 常见误拆

- 先发权益再异步补记账
- 用业务订单表代替不可变账本
- 只测成功支付不测退款和争议
