---
method_id: work-design-plan
version: 2
kind: work_type
name: "设计与规划"
summary: "先固定目标和约束，再形成可验证方案与落地路径。"
applies_to: ["产品设计","系统设计","项目规划"]
domain_tags: ["design","plan"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.93
---

# 设计与规划

## 规划路径

1. 建立目标、受众和约束
2. 形成少量差异明确的方向
3. 验证关键风险和核心切片
4. 拆成有依赖的落地计划

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| design_intent | 设计意图 | 为谁解决什么问题，什么不做？ |
| design_constraints | 关键约束 | 哪些现实边界会改变方案？ |
| validation_slice | 验证切片 | 哪一个小而真的结果能最早验证方向？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| slice-after-intent | 验证切片依赖已经明确的用户目标、约束和待验证风险。 | validation slice depends_on intent and constraints |
| implementation-after-direction | 大规模实现依赖关键方向和高风险切片验证。 | implementation depends_on validated direction |

## 完成证据

- 可见或可操作的方案
- 关键场景验证

## 收口检查

- 方案能指导实际行为
- 主要取舍已经明确

## 常见误拆

- 只有文字没有真实切片
- 无限发散不做取舍
- 过早进入全面实现
