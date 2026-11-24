---
name: domain-ai-data-product
version: 2
summary: "同时覆盖数据、评测、运行成本、安全和用户干预。"
description: "同时覆盖数据、评测、运行成本、安全和用户干预。领域；适用于：AI 功能、Agent 产品、数据产品。要拆解这类目标、排出依赖和完成证据时使用。"
when_to_use: "要把「AI 与数据产品」这类目标拆成可独立交付、可验收的结果，并理清谁依赖谁、各自拿什么证明完成。"
applies_to: assistant
---

# AI 与数据产品

同时覆盖数据、评测、运行成本、安全和用户干预。

适用于：AI 功能、Agent 产品、数据产品。

## 规划路径

1. 定义 AI 角色和消费上下文
2. 建立数据与评测基线
3. 设计产物、观察和干预位置
4. 验证成本、安全、失败与恢复

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| ai_data_sources_quality | 数据来源与质量 | 输入来自哪里，质量和许可如何保证？ |
| ai_evaluation | 评测与效果边界 | 如何衡量好坏和知道不能做什么？ |
| ai_runtime_cost | 运行方式与成本 | 延迟、成本、超时和重试怎样约束？ |
| ai_safety_governance | 安全与治理 | 用户怎样观察、干预和恢复低质量结果？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| ai-after-eval-baseline | AI 实现依赖数据边界与可复现评测基线。 | runtime capability depends_on data and evaluation |
| rollout-after-safety | 真实上线依赖成本、权限、安全、人工干预和失败恢复已经验证。 | rollout depends_on safety and recovery evidence |

## 完成证据

- 代表性评测集
- 质量/成本/延迟结果
- 失败和恢复演练

## 收口检查

- AI 产生可用产物或状态变化
- 低质量和超时有恢复

## 常见误拆

- 把 AI 简化成聊天框
- 只看演示样例
- 没有人类干预位置

## 怎样用这份方法

按「规划路径」把每个可独立交付、有限可验收的结果拆成一项；覆盖「必须覆盖」相关问题（缺事实列待确认）；依赖只按结果消费连边、其余并行；逐项标明「完成证据」并过「收口检查」；先给用户确认，再按要求用对应工具写入。
