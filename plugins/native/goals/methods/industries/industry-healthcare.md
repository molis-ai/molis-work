---
method_id: industry-healthcare
version: 1
kind: industry
name: "医疗健康"
summary: "围绕健康结果、临床工作流、证据、安全和专业人员责任组织工作。"
applies_to: ["数字健康","医疗服务","健康管理"]
domain_tags: ["healthcare","clinical","patient-safety"]
source_refs: ["WHO Classification of Digital Health Interventions","WHO guidance on ethics and governance of AI for health"]
confidence: 0.9
---

# 医疗健康

## 规划路径

1. 明确目标人群、健康结果、使用场景和不能承担的临床责任
2. 映射患者、专业人员、机构和照护连续性工作流
3. 建立证据等级、安全风险、人工判断和升级边界
4. 设计健康数据、互操作、隐私和审计链路
5. 用真实场景中的安全性、有效性、可用性和公平性验证

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| health_outcome_scope | 健康结果与边界 | 希望改善什么结果，产品明确不做哪些诊断或治疗决定？ |
| care_workflow | 照护工作流 | 患者、临床人员和机构如何交接信息与责任？ |
| clinical_evidence | 临床证据 | 哪种证据支持主张，适用人群和限制是什么？ |
| patient_safety | 患者安全 | 错误、延迟、遗漏或误解可能造成什么伤害？ |
| professional_oversight | 专业监督 | 哪些决定必须由合格专业人员审核、解释或接管？ |
| health_data_interop | 健康数据与互操作 | 数据来源、语义、授权、交换和审计如何保持可信？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| workflow-after-clinical-boundary | 产品和照护工作流消费已经确认的健康目标、证据边界与专业责任。 | care workflow depends_on clinical scope and evidence |
| deployment-after-safety-proof | 真实照护场景部署消费安全验证、人工升级、数据治理和恢复准备。 | clinical deployment depends_on safety and oversight evidence |

## 完成证据

- 健康主张、证据等级和适用边界
- 临床或照护工作流中的责任与升级演练
- 安全、数据、隐私和人工监督验证记录

## 收口检查

- 所有健康主张都没有超出证据
- 高风险结果有专业人员观察和接管入口
- 已按目标市场另行确认适用监管要求

## 常见误拆

- 把一般用户体验验证当成临床有效性
- 用 AI 置信度替代专业人员责任
- 只做数据接入不处理语义、授权和审计
