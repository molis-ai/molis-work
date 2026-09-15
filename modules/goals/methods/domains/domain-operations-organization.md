---
method_id: domain-operations-organization
version: 3
kind: domain
name: "运营与组织流程"
summary: "把角色、权限、工具、例外和度量连成可持续运行闭环。"
applies_to: ["组织流程","服务运营","跨角色协作"]
domain_tags: ["operations","organization"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.93
---

# 运营与组织流程

## 规划路径

1. 定义服务结果与触发
2. 配置角色、权限和工具
3. 设计交接与例外
4. 区分首次能力建设与持续运行
5. 运行、记录 Evidence 并提出有限改进

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| roles_responsibilities | 角色与职责 | 真实投入条件下谁负责什么？ |
| permissions | 权限与授权 | 哪些动作需要谁批准？ |
| tools_workflow | 工具与工作流 | 事实在哪记录，怎样交接？ |
| exception_handling | 例外处理 | 阻塞、冲突和失败如何处理？ |
| measurement | 衡量方式 | 如何观察效率、质量和结果？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| workflow-after-ownership | 工作流和工具配置依赖角色、权限和真实投入边界已经确认。 | workflow depends_on roles and permissions |
| improvement-after-measurement | 改进动作依赖真实运行、异常记录和结果度量。 | improvement depends_on operational evidence |

## 完成证据

- 角色确认
- 真实流程演练
- 结果指标

## 收口检查

- 流程能在现实投入下运转
- 异常有明确负责人和恢复动作
- 持续运行不阻止能力建设 Goal 完成

## 常见误拆

- 照搬大公司流程
- 责任与投入不匹配
- 记录系统和实际工作脱节
- 把重复运行写成永久未完成 Goal
