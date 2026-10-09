# @molis-ai/molis-work-plugin-text-stats

Counts characters, UTF-8 bytes and lines in a captured file snapshot.

The smallest complete Plugin in the system: one required input, no Capabilities,
no outputs, no events, no storage, no disk. It exists as much to keep the
platform honest as to count characters — if consuming one bound Artifact needs
more than this, the platform is asking too much of whoever writes the next one.

The three counts disagree with each other on purpose. Characters counts code
points, bytes counts UTF-8, and neither is "length" in any language with text
outside ASCII.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

## 开发要求

- 负责：对一份文件快照的字符、UTF-8 字节与行数统计。
- 不负责：读文件、生成快照、任何宿主能力。
- 公开入口：`@molis-ai/molis-work-plugin-text-stats`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 保持系统里最小的完整插件：一个必选输入，无能力、无输出、无事件、无存储。
  - 它是平台的参考插件和测试依托，不是给用户用的功能：插件选择器和市场只在开发者模式下提供它（目录条目 `developer: true`；`MOLIS_WORK_DEVELOPER_MODE=1` 启动 Host），它仍然登记、仍可安装，已经添加它的项目照常显示（W2-18 决定 5，2026-10-09）。
  - 消费一个绑定的 Artifact 若需要更多东西，说明平台要求过重，应改平台而不是往这里加。
  - 字符按码点、字节按 UTF-8 计。
- 改动后必跑：`node scripts/run-tests.mjs tests/text-stats-plugin.test.ts tests/workspace-plugin-graph.test.ts`
- 相关手册：[skills/molis-plugin-dev/examples.md](../../../skills/molis-plugin-dev/examples.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
