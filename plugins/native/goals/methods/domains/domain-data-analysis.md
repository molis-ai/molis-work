---
method_id: domain-data-analysis
version: 2
kind: domain
name: "数据分析"
summary: "从决策问题、口径和数据质量走到可复现结论。"
applies_to: ["指标分析","因果探索","预测与分群"]
domain_tags: ["data","analysis"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.94
---

# 数据分析

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
