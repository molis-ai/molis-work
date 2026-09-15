---
method_id: domain-product-ux
version: 2
kind: domain
name: "产品与 UX"
summary: "从用户目标和关键动线验证产品行为，再扩展完整体验。"
applies_to: ["产品设计","交互设计","体验优化"]
domain_tags: ["product","ux"]
source_refs: ["Molis Work product protocol"]
confidence: 0.95
---

# 产品与 UX

## 规划路径

1. 定义用户、时刻和现有阻力
2. 设计核心动线和状态
3. 制作真实高保真切片
4. 补齐首次使用、异常和响应式体验

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| user_problem | 用户问题 | 用户此刻真正想完成什么？ |
| core_flow | 核心动线 | 最短闭环怎样自然发生？ |
| system_feedback | 状态与反馈 | 用户如何知道发生了什么并可干预？ |
| edge_experience | 边界体验 | 首次、空、错、慢和恢复怎样处理？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| slice-after-flow | 高保真切片依赖明确的核心动线、关键状态和待验证风险。 | high-fidelity slice depends_on core flow and states |
| scale-after-slice | 全面实现依赖一个真实高保真切片验证。 | full build depends_on validated slice |

## 完成证据

- 可见可操作的关键切片
- 真实内容和关键状态

## 收口检查

- 无需解释文案也能推进主任务
- 信息层级和错误恢复清楚

## 常见误拆

- 通用 Dashboard 套模板
- 只改样式不改动线
- 靠大段文案解释交互
