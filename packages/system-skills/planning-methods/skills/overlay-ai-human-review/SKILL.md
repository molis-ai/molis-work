---
name: overlay-ai-human-review
version: 2
summary: "为会影响用户、内容、资金或专业判断的 AI 能力叠加可观察、可干预和可恢复约束。"
description: "为会影响用户、内容、资金或专业判断的 AI 能力叠加可观察、可干预和可恢复约束。附加约束；适用于：AI 决策辅助、自动化内容或操作、高影响模型输出。要拆解这类目标、排出依赖和完成证据时使用。"
when_to_use: "要把「AI 人工复核」这类目标拆成可独立交付、可验收的结果，并理清谁依赖谁、各自拿什么证明完成。"
applies_to: assistant
---

# AI 人工复核

为会影响用户、内容、资金或专业判断的 AI 能力叠加可观察、可干预和可恢复约束。

适用于：AI 决策辅助、自动化内容或操作、高影响模型输出。

## 规划路径

1. 明确 AI 角色、消费上下文、产生的结果和不能代替的责任
2. 按影响与可逆性划分自动执行、建议、复核和禁止边界
3. 设计用户与操作人员的观察、解释、修改和接管入口
4. 建立评测、监控、反馈、回滚和模型变化治理
5. 用低质量、超时、偏差、对抗和恢复场景验证

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| ai_role_context | AI 角色与上下文 | AI 消费什么状态，产生什么 Artifact、决定或状态变化？ |
| impact_reversibility | 影响与可逆性 | 错误会伤害谁，能否撤销，哪些动作必须先复核？ |
| human_observation | 人工观察 | 用户或操作人员在哪里看到依据、不确定性和影响范围？ |
| intervention_override | 干预与接管 | 人如何修改、拒绝、暂停、重试或完全接管？ |
| evaluation_monitoring | 评测与监控 | 离线能力、真实结果、偏差和模型漂移如何观察？ |
| ai_failure_recovery | 失败与恢复 | 超时、低质量、供应方故障和重启后如何恢复可信状态？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| automation-after-impact-boundary | 自动执行能力消费明确的影响分级、可逆性与人工责任边界。 | automation depends_on impact and oversight contract |
| high-impact-release-after-evaluation | 高影响 AI 发布消费代表性评测、人工接管、监控和恢复证据。 | high-impact AI release depends_on evaluation and recovery evidence |

## 完成证据

- AI 角色、上下文、输出和状态变化契约
- 代表性、边界和失败场景评测
- 人工拒绝、修改、接管和恢复演练

## 收口检查

- AI 不是只增加一个 Chat，而是明确改变什么结果或状态
- 人工复核有足够上下文且真正能阻止或纠正动作
- 模型或供应方变化不会绕过既有评测门槛

## 常见误拆

- 用免责声明代替人工控制
- 只评测平均质量不看高影响失败
- 人工只能看结果却不能阻止、修改或恢复

## 怎样用这份方法

按「规划路径」把每个可独立交付、有限可验收的结果拆成一项；覆盖「必须覆盖」相关问题（缺事实列待确认）；依赖只按结果消费连边、其余并行；逐项标明「完成证据」并过「收口检查」；先给用户确认，再按要求用对应工具写入。
