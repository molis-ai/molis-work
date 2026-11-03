---
method_id: work-analyze-decide
version: 2
kind: work_type
name: "分析与决策"
summary: "从问题、证据和备选方案走到可追溯决定。"
applies_to: ["数据分析","市场判断","方案选择"]
domain_tags: ["analysis","decision"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.94
---

# 分析与决策

## 规划路径

1. 定义决策和成功标准
2. 确认数据与证据边界
3. 形成可比较选项
4. 记录决定、理由和复盘触发条件

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| decision_question | 决策问题 | 这次分析最终要支持哪个决定？ |
| evidence_base | 证据基础 | 数据和证据的来源、质量与限制是什么？ |
| alternatives | 备选方案 | 有哪些真正不同的选项和取舍？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| evidence-after-question | 证据收集依赖明确的决策问题和口径，避免无目的堆资料。 | evidence plan depends_on decision question |
| decision-after-evidence | 决定消费分析证据，分析不依赖预设结论。 | decision depends_on evidence |

## 完成证据

- 来源和口径
- 关键假设
- 反证或敏感性检查

## 收口检查

- 结论能追溯到证据
- 限制和不确定性可见

## 常见误拆

- 先有结论再找数据
- 堆资料但不形成选项
- 把相关性写成因果
