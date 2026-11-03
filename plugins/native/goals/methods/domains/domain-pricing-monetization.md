---
method_id: domain-pricing-monetization
version: 1
kind: domain
name: "定价与商业化"
summary: "把用户价值、计价单位、套餐边界、收费链路和商业证据连成闭环。"
applies_to: ["产品定价","套餐设计","订阅与用量收费"]
domain_tags: ["pricing","monetization","packaging"]
source_refs: ["Molis Work result-consumption dependency model","Molis Work orthogonal SSOT framework"]
confidence: 0.88
---

# 定价与商业化

## 规划路径

1. 明确付费者、使用者、获得的结果和替代成本
2. 选择与价值增长一致且可理解的计价单位
3. 设计套餐、权益、限制、升级和降级边界
4. 走通报价、支付、开通、计量、账单和退款链路
5. 用转化、使用、留存和单位经济验证后迭代

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| payer_user_value | 付费与使用角色 | 谁付费、谁使用、谁批准，分别获得什么结果？ |
| value_metric | 价值计量 | 价格随什么可观察价值变化，用户能否预测费用？ |
| packaging_entitlements | 套餐与权益 | 各套餐包含什么、限制什么，升级降级如何生效？ |
| commercial_flow | 收费链路 | 从报价到开通、计量、账单、退款和终止如何闭环？ |
| unit_economics | 单位经济 | 收入、服务成本、渠道成本和风险成本如何对应？ |
| pricing_evidence | 定价证据 | 哪些行为和访谈能区分意愿、能力与真实支付？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| billing-after-model | 计费、权益和账单实现消费已经确认的计价单位、套餐和状态契约。 | billing implementation depends_on pricing and entitlement model |
| rollout-after-commercial-proof | 扩大收费范围消费真实支付、使用、留存与支持成本证据。 | monetization rollout depends_on commercial evidence |

## 完成证据

- 付费者与使用者的价值和决策证据
- 套餐、权益与状态变化契约
- 至少一条真实或沙盒端到端收费链路

## 收口检查

- 用户可以理解价格并预估主要费用
- 权益、计量、账单和退款状态一致
- 价格增长与用户价值和服务成本没有明显背离

## 常见误拆

- 先接支付再决定卖什么
- 套餐差异只按功能数量堆叠
- 只看转化不看留存、退款和服务成本
