---
method_id: work-operate-process
version: 3
kind: work_type
name: "运营与流程"
summary: "围绕角色、触发、交接、例外和度量建立可运行流程。"
applies_to: ["运营机制","组织流程","重复性工作"]
domain_tags: ["operations","process"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.93
---

# 运营与流程

## 规划路径

1. 定义触发和服务对象
2. 明确角色、交接和权限
3. 设计正常流与例外流
4. 区分首次能力建设与能力建立后的持续运行
5. 建立度量、Evidence 与有限改进入口

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| roles_responsibilities | 角色与职责 | 谁发起、执行、批准和兜底？ |
| exception_handling | 例外处理 | 失败、超时和冲突怎样恢复？ |
| measurement | 衡量方式 | 如何知道流程有效且值得继续？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| workflow-after-ownership | 流程执行依赖角色、权限和交接责任已经明确。 | workflow depends_on roles and permissions |
| improvement-after-measurement | 流程改进依赖真实运行记录和结果度量，而不是主观印象。 | improvement depends_on operational evidence |

## 完成证据

- 真实流程记录
- 例外案例
- 结果指标

## 收口检查

- 交接无隐含责任
- 异常有恢复入口
- 能力建设 Goal 可完成，持续运行另行产生 Evidence

## 常见误拆

- 只画正常流程
- 套用全职团队责任制
- 没有可观察结果
- 把持续运行写成永久未完成 Goal
