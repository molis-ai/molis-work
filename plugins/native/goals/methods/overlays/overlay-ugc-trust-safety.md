---
method_id: overlay-ugc-trust-safety
version: 1
kind: overlay
name: "UGC 与信任安全"
summary: "为用户生成内容和社交互动叠加内容生命周期、治理、申诉和受害者保护约束。"
applies_to: ["内容社区","评论与聊天","用户上传内容"]
domain_tags: ["ugc","trust-safety","moderation"]
source_refs: ["Santa Clara Principles on Transparency and Accountability in Content Moderation","Digital Trust & Safety Partnership best practices"]
confidence: 0.9
---

# UGC 与信任安全

## 规划路径

1. 明确内容与互动类型、参与者和潜在伤害
2. 建立规则、检测、举报、审核和限制生命周期
3. 设计分发控制、受害者保护、申诉和恢复机制
4. 补齐审核人员工具、质量、权限和身心保护
5. 用对抗案例、误判、漏判和透明度数据持续校正

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| ugc_surface | 内容与互动面 | 用户能创建、上传、评论、私信、直播或传播什么？ |
| harm_taxonomy | 伤害分类 | 哪些内容或行为伤害个人、群体、平台或公共安全？ |
| moderation_lifecycle | 治理生命周期 | 预防、检测、举报、审核、处置和复查如何衔接？ |
| victim_protection | 受害者保护 | 如何停止持续伤害、保留证据并提供恢复入口？ |
| appeals_transparency | 申诉与透明 | 被处置者如何理解、申诉，平台如何观察误判与偏差？ |
| moderator_operations | 审核运营 | 人工审核的权限、质量、容量和身心风险怎样管理？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| distribution-after-policy | 内容分发和互动能力消费明确规则、风险分级和处置契约。 | distribution depends_on policy and harm model |
| launch-after-safety-operations | UGC 或社交功能发布消费举报、审核、申诉、受害者保护和事件响应准备。 | ugc launch depends_on safety operations |

## 完成证据

- 内容面、伤害分类和治理状态地图
- 举报、审核、申诉和紧急升级演练
- 误判、漏判、响应时间和受害者结果指标

## 收口检查

- 安全能力与内容发布同时设计而非上线后补充
- 自动检测不承担最终责任且有人工升级边界
- 处置、申诉和恢复都可追溯

## 常见误拆

- 只做关键词过滤就开放社区
- 只保护平台指标不保护受害者
- 只追求审核速度不观察误判和审核员负担
