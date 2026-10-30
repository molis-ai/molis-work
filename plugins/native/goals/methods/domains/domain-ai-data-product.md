---
method_id: domain-ai-data-product
version: 2
kind: domain
name: "AI 与数据产品"
summary: "同时覆盖数据、评测、运行成本、安全和用户干预。"
applies_to: ["AI 功能","Agent 产品","数据产品"]
domain_tags: ["ai","data-product"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.94
---

# AI 与数据产品

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
