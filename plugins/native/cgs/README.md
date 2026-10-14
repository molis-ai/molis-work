# @molis-ai/molis-work-plugin-cgs

CGS 作者创作插件。业务代码在 Content Growth Studio 维护；这里固定消费带来源与哈希的本地发行包，通过项目 Plugin Runtime 装配。

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

## 开发要求

- 负责：登记 CGS 发行包与可信工厂，提供作品、候选与作者确认的插件能力。
- 不负责：拥有 Home、身份、权限、模型密钥或另起服务器；不自动批准或发布。
- 公开入口：`@molis-ai/molis-work-plugin-cgs` 为可归档的运行定义，`@molis-ai/molis-work-plugin-cgs/native` 为本机文件、材料和模型适配端口。
- 依赖：固定的 `@adeptify/cgs-work` 发行包、`@molis-ai/molis-work-contracts` 和 `@molis-ai/molis-work-plugin-sdk`。
- 不变量：
  - 运行定义可以独立归档恢复，所有写入遵守 beforeEffect 与 revision；没有模型仍可读写已有作品。
- 改动后必跑：`node scripts/run-tests.mjs tests/cgs-runtime-integration.test.ts tests/runtime-plugin-http-discovery.test.ts tests/plugin-release-artifact.test.ts`；装配变更按仓库规范跑全量。
- 相关手册：[包来源](../../../vendor/cgs/README.md)、[接入验收](../../../specs/cgs-formal-integration/spec.md)、[插件开发](../../../skills/molis-plugin-dev/SKILL.md)。
