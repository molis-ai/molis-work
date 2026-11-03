---
method_id: industry-developer-tools
version: 1
kind: industry
name: "开发者工具"
summary: "围绕开发工作流、集成契约、反馈速度、兼容性和可调试性组织工具产品。"
applies_to: ["SDK","API 产品","CLI 与开发平台"]
domain_tags: ["developer-tools","api","sdk"]
source_refs: ["Semantic Versioning 2.0.0","OpenTelemetry specification"]
confidence: 0.92
---

# 开发者工具

## 规划路径

1. 明确开发者任务、现有工作流、环境和成功时间
2. 固定 API、SDK、CLI、配置和扩展点契约
3. 设计安装、首次成功、反馈、调试和本地到 CI 路径
4. 建立版本、兼容、弃用、迁移和生态集成策略
5. 用真实项目、失败诊断、性能和升级路径验证

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| developer_job | 开发者任务 | 开发者在什么工作流中要完成什么，现有摩擦在哪里？ |
| integration_contract | 集成契约 | API、SDK、CLI、配置和扩展点的输入输出与错误是什么？ |
| time_to_success | 首次成功 | 从发现到安装、认证和第一个真实结果需要什么？ |
| feedback_debugging | 反馈与调试 | 错误、日志、追踪和诊断信息能否指导下一步？ |
| compatibility_versioning | 兼容与版本 | 版本、弃用、迁移和多环境支持如何演进？ |
| docs_examples | 文档与样例 | 文档、参考、示例和实际行为如何保持一致？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| clients-after-contract | SDK、CLI、文档和集成实现消费稳定且可测试的公共契约。 | clients and docs depend_on public contract |
| release-after-compatibility | 新版本发布消费兼容性、迁移、错误诊断和真实项目验证。 | release depends_on compatibility evidence |

## 完成证据

- 真实项目中的首次成功时间和主路径
- 公共契约、错误模型和兼容性测试
- 安装、升级、迁移与调试记录

## 收口检查

- 文档和示例可在干净环境复现
- 错误信息能让开发者自行定位下一步
- 公共契约变更有明确兼容与迁移路径

## 常见误拆

- 只实现 API 不验证开发者工作流
- 用源码或内部知识代替文档和诊断
- 发布破坏性变更但没有迁移窗口
