---
method_id: overlay-sensitive-data-privacy
version: 1
kind: overlay
name: "敏感数据与隐私"
summary: "为涉及个人、健康、财务或机密数据的工作叠加最小化、授权和生命周期约束。"
applies_to: ["个人数据","敏感业务数据","跨主体数据共享"]
domain_tags: ["privacy","sensitive-data","governance"]
source_refs: ["NIST Privacy Framework","OECD Privacy Guidelines"]
confidence: 0.93
---

# 敏感数据与隐私

## 规划路径

1. 识别数据主体、敏感等级、处理目的和禁止用途
2. 映射收集、推断、使用、共享、保留和删除生命周期
3. 设计最小化、授权、访问、隔离和可撤回机制
4. 补齐审计、主体请求、泄露响应和供应方约束
5. 用权限越界、撤回、删除和恢复场景验证

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| data_purpose | 数据目的 | 每类敏感数据为何必要，哪些用途明确禁止？ |
| data_subject_control | 主体控制 | 数据主体如何知情、选择、访问、更正、导出或删除？ |
| sensitive_data_flow | 数据流 | 数据从哪里来，到哪里去，谁能看到或推断？ |
| retention_deletion | 保留与删除 | 保留依据、期限、备份和删除证明是什么？ |
| third_party_data | 第三方处理 | 外部服务、模型和合作方获得什么，责任如何约束？ |
| privacy_incident | 隐私事件 | 越权、误传或泄露后如何限制影响并恢复？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| processing-after-purpose | 数据采集、共享和推断消费明确的目的、最小范围和授权边界。 | data processing depends_on purpose and authorization |
| launch-after-lifecycle-proof | 敏感数据功能发布消费权限、撤回、删除、审计和事件响应验证。 | sensitive-data launch depends_on lifecycle evidence |

## 完成证据

- 数据清单、目的、流向和访问矩阵
- 授权撤回、导出和删除验证
- 第三方处理与事件响应记录

## 收口检查

- 没有为未来可能使用而无目的收集数据
- 用户撤回后数据和权限真实停止生效
- 日志、缓存和备份没有绕过删除边界

## 常见误拆

- 把隐私等同于一份政策文本
- 用用户同意覆盖不必要的数据处理
- 只删除主库不处理派生数据和备份
