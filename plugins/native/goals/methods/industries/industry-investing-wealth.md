---
method_id: industry-investing-wealth
version: 1
kind: industry
name: "投资与财富管理"
summary: "围绕客户目标、适配边界、市场数据、交易生命周期和风险披露组织投资服务。"
applies_to: ["投资工具","财富管理","证券交易服务"]
domain_tags: ["investing","wealth","markets"]
source_refs: ["IOSCO Objectives and Principles of Securities Regulation","CFA Institute Asset Manager Code"]
confidence: 0.89
---

# 投资与财富管理

## 规划路径

1. 明确客户目标、期限、风险承受和产品责任边界
2. 建立市场数据、研究、建议和披露的来源与时效
3. 映射下单、风控、成交、持仓、估值和公司行动生命周期
4. 设计组合观察、风险提示、人工服务与冲突管理
5. 用行情异常、交易失败、回溯偏差和客户理解验证

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| investor_context | 客户情境 | 目标、期限、流动性、风险承受和经验是什么？ |
| advice_execution_boundary | 建议与执行边界 | 产品提供信息、分析、建议还是代客执行，责任如何区分？ |
| market_data_provenance | 市场数据 | 行情、基本面和研究数据来自哪里，何时更新，错了如何发现？ |
| order_position_lifecycle | 订单与持仓 | 订单、成交、费用、持仓、估值和公司行动如何一致？ |
| portfolio_risk | 组合风险 | 集中、流动性、杠杆、波动和情景风险怎样观察？ |
| disclosure_audit | 披露与审计 | 风险、费用、利益冲突和历史决定如何被理解与追溯？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| recommendation-after-context-data | 个性化建议消费客户情境、责任边界和可追溯的市场数据。 | recommendation depends_on investor context and market data |
| execution-after-controls | 交易执行消费订单状态、权限、风险控制、费用和异常恢复契约。 | execution depends_on trading controls and lifecycle contract |

## 完成证据

- 客户目标、风险与服务责任边界
- 市场数据来源、时效和异常处理记录
- 订单到持仓的对账及风险披露验证

## 收口检查

- 收益展示同时呈现风险、费用和时间范围
- 建议和执行可以追溯到当时数据与客户情境
- 已按目标市场另行确认适用牌照与投资者保护要求

## 常见误拆

- 用历史收益暗示未来确定性
- 把数据展示、投资建议和交易执行混为一体
- 只验证下单成功不验证持仓、费用和公司行动
