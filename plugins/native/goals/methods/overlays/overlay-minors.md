---
method_id: overlay-minors
version: 1
kind: overlay
name: "未成年人"
summary: "为面向或可能触达未成年人的产品叠加年龄适配、监护、安全和商业约束。"
applies_to: ["儿童产品","青少年社区","可能被未成年人使用的服务"]
domain_tags: ["minors","child-safety","age-appropriate"]
source_refs: ["UNICEF Policy Guidance on AI for Children","UN Convention on the Rights of the Child"]
confidence: 0.91
---

# 未成年人

## 规划路径

1. 明确年龄范围、成熟度、使用场景和监护关系
2. 识别内容、互动、数据、消费和沉迷风险
3. 设计年龄适配体验、默认保护和监护入口
4. 补齐举报、人工升级、商业限制和恢复机制
5. 用不同年龄与监护场景验证理解、安全和自主性

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| age_context | 年龄情境 | 哪些年龄可能使用，理解、判断和自主能力有何差异？ |
| guardian_role | 监护角色 | 哪些动作需要监护人知情、同意、观察或介入？ |
| child_data | 儿童数据 | 哪些数据不应收集、推断、公开或用于个性化？ |
| content_contact_safety | 内容与接触安全 | 不当内容、陌生人接触、欺凌和诱导如何预防与处理？ |
| commercial_wellbeing | 商业与福祉 | 付费、奖励、通知和使用时长是否利用脆弱性？ |
| age_recovery | 保护与恢复 | 误判年龄、越权或受害后如何升级和恢复？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| experience-after-age-risk | 互动、推荐、社交和商业机制消费年龄情境与风险评估。 | experience depends_on age and safety assessment |
| launch-after-safeguarding | 面向未成年人发布消费默认保护、监护、举报和人工升级验证。 | minors launch depends_on safeguarding evidence |

## 完成证据

- 年龄分层、风险和默认保护清单
- 监护、举报与人工升级演练
- 不同年龄用户对关键提示和选择的理解验证

## 收口检查

- 默认设置保护未成年人而非要求主动发现开关
- 商业和互动机制不利用判断能力差异
- 已按目标市场另行确认儿童保护要求

## 常见误拆

- 只加年龄输入框就认为完成保护
- 把全部责任转给监护人
- 用高参与度掩盖成瘾、欺凌或消费风险
