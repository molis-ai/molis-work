---
name: work-design-plan
version: 2
summary: "先固定目标和约束，再形成可验证方案与落地路径。"
description: "先固定目标和约束，再形成可验证方案与落地路径。工作类型；适用于：产品设计、系统设计、项目规划。要拆解这类目标、排出依赖和完成证据时使用。"
when_to_use: "要把「设计与规划」这类目标拆成可独立交付、可验收的结果，并理清谁依赖谁、各自拿什么证明完成。"
applies_to: assistant
---

# 设计与规划

先固定目标和约束，再形成可验证方案与落地路径。

适用于：产品设计、系统设计、项目规划。

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

## 怎样用这份方法

按「规划路径」把每个可独立交付、有限可验收的结果拆成一项；覆盖「必须覆盖」相关问题（缺事实列待确认）；依赖只按结果消费连边、其余并行；逐项标明「完成证据」并过「收口检查」；先给用户确认，再按要求用对应工具写入。
