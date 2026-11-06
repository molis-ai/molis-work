---
method_id: domain-reliability-release
version: 1
kind: domain
name: "可靠性与发布"
summary: "围绕服务目标、变更控制、可观测性和恢复能力建立持续交付闭环。"
applies_to: ["生产服务","发布流程","稳定性治理"]
domain_tags: ["reliability","release","operations"]
source_refs: ["Google SRE service-level objectives","DORA software delivery performance"]
confidence: 0.92
---

# 可靠性与发布

## 规划路径

1. 定义关键用户旅程、服务目标和可接受退化
2. 识别容量、依赖、状态和变更风险
3. 建立构建、发布、迁移、回滚和渐进放量路径
4. 补齐可观测性、告警、值守和事件响应
5. 用故障注入、恢复演练和真实运行数据改进

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| critical_journeys_slo | 关键旅程与目标 | 哪些用户结果必须可靠，成功、延迟和可用性怎样衡量？ |
| dependency_capacity | 依赖与容量 | 哪些外部依赖、资源上限和状态会导致级联失败？ |
| change_delivery | 变更交付 | 构建、配置、迁移、放量和回滚如何保持可控？ |
| observability_alerting | 可观测与告警 | 哪些信号能在用户受损前后定位真实问题？ |
| incident_response | 事件响应 | 谁决策、如何止损、沟通、恢复和复盘？ |
| continuity_recovery | 连续性与恢复 | 数据、服务和人工流程如何恢复到可信状态？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| release-plan-after-risk | 发布、迁移和回滚方案消费关键旅程、状态与依赖风险。 | release plan depends_on reliability risk model |
| rollout-after-readiness | 生产放量消费可运行产物、可观测性、回滚能力和负责人准备。 | rollout depends_on operational readiness |

## 完成证据

- 关键旅程的服务目标与监控信号
- 可复现的发布、迁移和回滚记录
- 至少一次事件或恢复演练结果

## 收口检查

- 告警对应用户影响并有明确动作
- 回滚和恢复不依赖临场猜测
- 关键外部依赖和容量上限有降级策略

## 常见误拆

- 把部署成功当成发布完成
- 监控很多但无法判断用户是否受损
- 只写正常发布不验证回滚和数据恢复
