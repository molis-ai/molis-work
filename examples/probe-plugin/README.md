# @molis-ai/molis-work-plugin-probe

A probe built-in plugin that exists only for the platform's own tests (W4-01, `specs/repository-anti-corruption/slices/w5-02-registry.md` §6).
It ships in no build and is not a workspace package here: `tests/probe-plugin.test.ts` copies the repository, puts this package at
`plugins/native/probe`, runs the generator and `pnpm install`, builds, and walks the lifecycle in a one-off Home. Its id is written
only in this package.

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

## 开发要求

- 负责：用几条笔记兑现平台读的声明：一个路由、可撤销的命令、搜索来源、文件来源、一个后台作业、一个方法。
- 不负责：任何产品功能；不进构建、不进目录，只在测试的仓库副本里成为内置插件。
- 公开入口：`@molis-ai/molis-work-plugin-probe`（`src/index.ts`）与 `./registration`；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（`bindPluginActionRoute`）。不导入另一个插件的实现。
- 不变量：
  - id（包名、`plugin_id`、项目里的 `probe`）只写在这个包里；平台靠它的 `registration` 与 Manifest 认识它。
  - 不声明到期提醒与放置：装上的插件今天声明不了（BL-621、BL-622），探针的两边要一样。
- 改动后必跑：`node scripts/run-tests.mjs tests/probe-plugin.test.ts`
