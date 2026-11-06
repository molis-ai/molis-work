---
method_id: domain-security-privacy
version: 1
kind: domain
name: "安全与隐私"
summary: "从资产、信任边界和威胁建立预防、检测、响应与数据治理闭环。"
applies_to: ["安全设计","隐私治理","高风险功能"]
domain_tags: ["security","privacy","risk"]
source_refs: ["NIST Cybersecurity Framework","NIST Privacy Framework"]
confidence: 0.92
---

# 安全与隐私

## 规划路径

1. 盘点资产、主体、敏感数据、权限和信任边界
2. 建立威胁、滥用、隐私影响和风险优先级
3. 设计最小权限、数据最小化和关键控制
4. 补齐检测、审计、响应、恢复和通知流程
5. 用攻击路径、权限边界和恢复演练验证控制

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| protected_assets | 受保护资产 | 哪些数据、能力、凭据和业务结果一旦受损影响最大？ |
| actors_trust_boundaries | 主体与信任边界 | 谁能访问什么，身份、权限和系统边界在哪里变化？ |
| threats_abuse | 威胁与滥用 | 哪些攻击、误用和内部滥用路径现实可行？ |
| privacy_lifecycle | 隐私生命周期 | 数据为何收集、如何使用、共享、保留和删除？ |
| controls_assurance | 控制与验证 | 哪些预防、检测和审计控制降低了具体风险？ |
| incident_recovery | 事件与恢复 | 发现问题后如何限制影响、恢复可信状态并通知？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| controls-after-risk-model | 安全和隐私控制消费已经识别的资产、信任边界、威胁与影响。 | controls depend_on risk model |
| release-after-assurance | 高风险能力发布消费权限检查、攻击路径验证和事件恢复准备。 | high-risk release depends_on assurance evidence |

## 完成证据

- 资产、数据流、信任边界和权限清单
- 与具体风险对应的控制和验证记录
- 事件响应与恢复演练结果

## 收口检查

- 每项高风险数据和能力都有明确所有者
- 控制能对应具体威胁而非只满足清单
- 最小权限、删除和恢复路径实际可执行

## 常见误拆

- 上线前才统一做安全检查
- 把合规清单当成威胁模型
- 只防外部攻击不处理误用和权限漂移
