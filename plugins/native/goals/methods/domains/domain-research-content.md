---
method_id: domain-research-content
version: 2
kind: domain
name: "研究与内容"
summary: "确保来源、方法、审核和发布链路可信。"
applies_to: ["研究报告","知识内容","深度文章"]
domain_tags: ["research","content"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.94
---

# 研究与内容

## 规划路径

1. 定义研究问题和读者用途
2. 建立来源与证据层级
3. 选择分析或生产方法
4. 审核、发布并保留可追溯引用

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| source_provenance | 资料来源与可信度 | 来源是否一手、权威且能追溯？ |
| research_content_method | 研究或生产方法 | 如何从资料得到结论或内容？ |
| review_approval | 审核与批准 | 谁检查事实、逻辑和风险？ |
| publication_distribution | 发布与分发 | 成果怎样到达读者并被正确使用？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| draft-after-sources | 结论或内容生产依赖可追溯来源和明确方法。 | draft depends_on sources and method |
| publication-after-review | 发布依赖来源、方法和审核完成。 | publication depends_on review |

## 完成证据

- 可追溯来源
- 方法说明
- 审核记录

## 收口检查

- 结论不超出证据
- 引用和限制可见

## 常见误拆

- 二手摘要层层转述
- 引用很多但没有方法
- 把内容完成当传播完成
