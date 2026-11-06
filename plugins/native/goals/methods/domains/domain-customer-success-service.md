---
method_id: domain-customer-success-service
version: 1
kind: domain
name: "客户成功与服务"
summary: "从客户目标、采用阶段、支持闭环和续用证据建立可持续服务体系。"
applies_to: ["客户成功","用户支持","专业服务"]
domain_tags: ["customer-success","support","service"]
source_refs: ["ITIL service value system","Molis Work operating-flow method"]
confidence: 0.89
---

# 客户成功与服务

## 规划路径

1. 明确客户希望实现的结果、角色和成功信号
2. 设计签约后启用、采用、扩展和续用阶段
3. 建立知识、培训、支持、升级和异常恢复入口
4. 连接产品使用、服务记录、客户健康与反馈闭环
5. 用结果达成、响应质量、留存和主动推荐持续改进

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| customer_outcome | 客户结果 | 客户购买后希望哪项业务或个人结果发生变化？ |
| stakeholder_roles | 客户角色 | 购买者、管理员、使用者和内部服务角色各自负责什么？ |
| adoption_lifecycle | 采用生命周期 | 从启用到稳定使用、扩展和续用经过哪些状态？ |
| support_escalation | 支持与升级 | 自助、人工支持、专家升级和紧急事件如何衔接？ |
| customer_health | 客户健康 | 哪些使用、结果和关系信号能提前暴露风险？ |
| feedback_learning | 反馈学习 | 服务问题如何进入产品、内容和流程改进？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| service-plan-after-outcome | 启用、培训和支持设计消费客户目标、角色和产品使用路径。 | service plan depends_on customer outcome and product flow |
| expansion-after-success | 扩展和续用动作消费客户已获得价值及风险处理证据。 | expansion depends_on demonstrated customer success |

## 完成证据

- 客户结果、角色与采用阶段地图
- 真实支持案例和升级记录
- 客户健康、结果达成与续用信号

## 收口检查

- 服务流程围绕客户结果而非内部工单流转
- 异常和紧急问题有明确升级与恢复入口
- 客户反馈能追溯到产品或流程决定

## 常见误拆

- 把客户成功等同于被动客服
- 只看回复速度不看问题是否解决
- 在客户尚未获得价值时推动续费或扩展
