# PPT 演示稿入口

本机演示稿：改主题色、加幻灯片、预览、导出 JSON。数据在 `{home}/ppt/ppt.db`。

包名：`@molis-ai/molis-work-plugin-ppt`。

不做 SVG 生成，也不导出 PPTX。不写 Goal，不发 Artifact。已登记对外 MCP（`mcp_exports`），默认关；Host 从绑定项目注入分区，作者步骤见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`
