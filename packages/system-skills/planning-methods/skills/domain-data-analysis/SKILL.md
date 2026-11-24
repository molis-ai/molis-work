---
name: domain-data-analysis
version: 2
summary: "从决策问题、口径和数据质量走到可复现结论。"
description: "从决策问题、口径和数据质量走到可复现结论。领域；适用于：指标分析、因果探索、预测与分群。要拆解这类目标、排出依赖和完成证据时使用。"
when_to_use: "要把「数据分析」这类目标拆成可独立交付、可验收的结果，并理清谁依赖谁、各自拿什么证明完成。"
applies_to: assistant
---

# 数据分析

从决策问题、口径和数据质量走到可复现结论。

适用于：指标分析、因果探索、预测与分群。

## 规划路径

1. 定义决策问题和分析单位
2. 固定口径、时间窗和数据来源
3. 清洗并检查偏差
4. 分析、敏感性检查和可复现交付

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| data_question | 分析问题 | 结果要支持什么决定？ |
| data_quality | 数据与口径 | 来源、缺失、偏差和定义是什么？ |
| analysis_validity | 分析有效性 | 哪些假设、对照和敏感性需要检查？ |
| decision_delivery | 决策交付 | 结论怎样被使用和复现？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| analysis-after-quality | 正式分析依赖冻结的口径和通过检查的数据集。 | analysis depends_on validated data |
| decision-delivery-after-analysis | 结论交付和决策建议依赖已完成的分析、反证与敏感性检查。 | decision delivery depends_on validated analysis |

## 完成证据

- 数据来源和口径
- 可复现查询或脚本
- 质量与敏感性检查

## 收口检查

- 结论回答原决策问题
- 限制和外推边界明确

## 常见误拆

- 先画图再定义问题
- 混用口径
- 把相关性当因果

## 怎样用这份方法

按「规划路径」把每个可独立交付、有限可验收的结果拆成一项；覆盖「必须覆盖」相关问题（缺事实列待确认）；依赖只按结果消费连边、其余并行；逐项标明「完成证据」并过「收口检查」；先给用户确认，再按要求用对应工具写入。
