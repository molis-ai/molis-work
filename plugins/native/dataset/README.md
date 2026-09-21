# Dataset 数据表入口

本机表格：改列改行、粘贴 CSV、导出、存版本再回滚。数据在 `{home}/dataset/dataset.db`。

包名：`@molis-ai/molis-work-plugin-dataset`。

加列按钮按提示加一列，不调用外部模型。不写 Goal，不发 Artifact。已登记对外 MCP（`mcp_exports`），默认关；Host 从绑定项目注入分区，作者步骤见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`
