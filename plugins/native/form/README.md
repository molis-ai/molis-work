# Forms 问卷入口

本机问卷：建题、预览填写、看结果。数据在 `{home}/form/form.db`。

包名：`@molis-ai/molis-work-plugin-form`。

出题按钮按提示加一题，不调用外部模型。不写 Goal，不发 Artifact。已登记对外 MCP（`mcp_exports`），默认关；Host 从绑定项目注入分区，作者步骤见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`
