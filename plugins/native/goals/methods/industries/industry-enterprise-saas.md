---
method_id: industry-enterprise-saas
version: 1
kind: industry
name: "企业 SaaS"
summary: "围绕采购、管理、使用、集成和续用角色建立可治理的组织级产品闭环。"
applies_to: ["B2B SaaS","企业软件","组织协作产品"]
domain_tags: ["saas","enterprise","b2b"]
source_refs: ["NIST SP 800-207 Zero Trust Architecture","Molis Work customer-success method"]
confidence: 0.91
---

# 企业 SaaS

## 规划路径

1. 明确购买者、管理员、使用者、安全与财务角色的结果
2. 建立组织、租户、身份、权限、数据和审计边界
3. 走通评估、采购、配置、导入、集成和采用路径
4. 补齐计费、支持、变更管理、退出与数据迁移
5. 用组织内采用、业务结果、安全运营和续用验证

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| enterprise_roles | 企业角色 | 谁购买、批准、配置、使用、审计和承担风险？ |
| tenancy_identity | 租户与身份 | 组织、成员、权限、数据隔离和审计如何建模？ |
| onboarding_adoption | 启用与采用 | 从评估到配置、导入、培训和稳定使用如何完成？ |
| integrations_admin | 集成与管理 | 身份、数据、工作流和管理员工具如何接入现有环境？ |
| contract_billing | 合同与计费 | 套餐、席位、用量、续费和权益变化如何一致？ |
| service_exit | 服务与退出 | 支持、升级、停用、导出和删除如何可控完成？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| product-after-tenant-contract | 企业功能消费稳定的租户、身份、权限、数据和审计契约。 | enterprise features depend_on tenant and identity contract |
| rollout-after-admin-readiness | 组织级上线消费管理员配置、集成、支持和退出准备。 | enterprise rollout depends_on admin and service readiness |

## 完成证据

- 多角色采购、配置和使用旅程
- 租户隔离、权限、审计与数据退出验证
- 至少一个真实集成和组织采用记录

## 收口检查

- 购买者、管理员和使用者的成功标准没有混在一起
- 权限和数据隔离有跨租户验证
- 客户能够接入，也能够安全退出

## 常见误拆

- 把个人产品加一个团队列表就称为企业版
- 只做核心功能不做管理员和集成能力
- 用合同承诺掩盖尚未验证的安全或可靠性
