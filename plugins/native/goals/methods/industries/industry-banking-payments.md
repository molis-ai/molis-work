---
method_id: industry-banking-payments
version: 1
kind: industry
name: "银行与支付"
summary: "围绕资金流、账本、授权、清结算、争议和持续可用性建立可信交易闭环。"
applies_to: ["支付产品","银行服务","资金基础设施"]
domain_tags: ["banking","payments","ledger"]
source_refs: ["CPMI-IOSCO Principles for financial market infrastructures","PCI Security Standards Council"]
confidence: 0.91
---

# 银行与支付

## 规划路径

1. 明确参与方、资金来源去向、产品承诺和市场边界
2. 映射授权、记账、清算、结算、退款与争议生命周期
3. 固定账本、余额、幂等、对账和最终性契约
4. 补齐身份、权限、风控、合规、审计和人工运营
5. 用异常交易、失败恢复、资金对账和高峰容量验证

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| payment_participants | 参与方与资金流 | 谁付款、收款、持有、路由或担保，资金在哪些节点改变责任？ |
| transaction_lifecycle | 交易生命周期 | 授权、记账、清结算、退款和争议经过哪些可追溯状态？ |
| ledger_reconciliation | 账本与对账 | 哪个账本是权威余额，重复、延迟和差异如何发现并修复？ |
| identity_risk_controls | 身份与风险 | 身份、权限、限额、欺诈和合规判断在哪发生？ |
| disputes_exceptions | 争议与异常 | 拒付、退款、超时、部分成功和人工调整如何处理？ |
| resilience_audit | 连续性与审计 | 高峰、依赖故障和恢复时如何保持资金与审计一致？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| transaction-after-ledger-contract | 交易实现消费资金流、权威账本、状态机和幂等契约。 | transaction implementation depends_on ledger and lifecycle contract |
| launch-after-reconciliation-proof | 资金产品上线消费端到端对账、异常恢复、权限和审计证据。 | payment launch depends_on reconciliation and control evidence |

## 完成证据

- 资金流、账本与交易状态契约
- 成功、重复、超时、退款和争议的对账记录
- 权限、风险、审计和恢复演练

## 收口检查

- 每一笔金额都能追溯到权威记录和责任方
- 重试不会重复记账或静默丢失交易
- 已按目标市场另行确认牌照与监管要求

## 常见误拆

- 只按接口成功判断支付成功
- 混淆订单、支付意图、账本分录和结算
- 把人工对账当成长期架构
