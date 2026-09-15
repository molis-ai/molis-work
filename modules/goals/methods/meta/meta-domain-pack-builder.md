---
method_id: meta-domain-pack-builder
version: 2
kind: meta
name: "陌生领域方法包生成"
summary: "先弄清领域中的对象、生命周期、产物、证据和专业依赖，再拆实际 Goal。"
applies_to: ["未知领域","现有方法包匹配不足"]
domain_tags: ["meta","discovery"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.9
---

# 陌生领域方法包生成

## 规划路径

1. 界定领域边界、任务结果和主要使用者
2. 识别核心对象、角色、生命周期和价值流
3. 收集权威来源、专业标准与代表性案例
4. 提炼标准产物、证据门槛、依赖模式和失败模式
5. 用至少两个典型案例和一个反例校验方法包
6. 标注来源、适用范围、可信度和重新审查条件

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| domain_objects | 领域对象 | 领域中哪些对象会改变状态，谁对它们负责？ |
| domain_lifecycle | 领域生命周期 | 工作从输入到结果通常经历哪些阶段？ |
| domain_artifacts | 专业产物 | 每个阶段交付什么可使用、可检查的产物？ |
| domain_evidence | 证据标准 | 专业上凭什么相信结果成立？ |
| domain_dependencies | 依赖模式 | 哪些结果必须先出现，哪些工作可以并行？ |
| domain_failure_modes | 失败模式 | 常见误拆、遗漏和错误顺序是什么？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| decomposition-after-method | 实际任务拆分依赖已经完成领域方法的证据校验，不能用尚未验证的方法指导真实 Goal。 | task decomposition depends_on validated method pack |

## 完成证据

- 至少一个权威或一手来源
- 至少一个可追溯实践来源
- 典型案例与反例的校验记录

## 收口检查

- 适用边界明确
- 依赖方向能用产出消费关系解释
- 未知项和低可信判断显式可见

## 常见误拆

- 直接套用相邻领域模板
- 只整理术语而不建立生命周期
- 研究尚未完成就开始拆实际 Goal
