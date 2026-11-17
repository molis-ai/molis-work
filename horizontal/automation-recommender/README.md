# 项目自动化建议

根据 Projects 已授权的目录和宿主提供的原能力目录生成建议。建议正文只保留在一次返回和有界保存引用中。偏好属于本服务，报告文稿属于 Pages。

## 开发要求

- 负责：固定路径和预算的只读扫描、配置去重、建议排序、每人每项目的偏好和保存引用。
- 不负责：Projects 的目录授权、插件安装与设置、连接凭据、Pages 的文稿和版本。
- 公开入口：宿主使用 `@molis-ai/molis-work-service-automation-recommender` 的扫描和偏好服务。调用方使用 `@molis-ai/molis-work-contracts/services/automation-recommender` 的动作合同。
- 依赖：`@molis-ai/molis-work-contracts` 的动作与工作区读取合同、`@molis-ai/molis-work-plugin-sdk` 的数据校验、`@molis-ai/molis-work-storage` 的文件条件提交。
- 不变量：
  - 扫描只读授权目录，保持偏好与业务数据原样，工作区内容始终作为数据处理。
  - 报告引用绑定用户、项目和项目创建身份。用户明确保存才写入，重复保存沿用原 Pages 请求号。
  - 偏好按原 revision 条件提交。
- 改动后必跑：`node scripts/run-tests.mjs --jobs 1 tests/security-invariants-automation-recommender.test.ts tests/automation-recommendations.e2e.test.ts`，按仓库规则使用机器槽位。
- 相关手册：[项目自动化建议](../../docs/horizontal/automation-recommender.md)。
