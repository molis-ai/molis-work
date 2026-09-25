# PPT 演示稿入口

本机演示稿：改主题色、加幻灯片、预览、导出 JSON。数据在 `{home}/ppt/ppt.db`。

包名：`@molis-ai/molis-work-plugin-ppt`。

插件在 `src/actions.ts` 声明列表、读取、新建、编辑、删除、JSON 导出和 Artifact 发布七项能力。项目 Host 注册原 Store 处理器；HTTP 和原六个 MCP 名称只转发同一动作客户端，可信项目、调用者和权限由 Host 注入。原 MCP 开关仍默认关闭，统一生产客户端授权随系统迁移继续推进。

JSON 导出由动作服务读取已保存的演示稿，返回文件名、MIME 类型与完整 JSON；浏览器下载同一结果。当前不导出 PPTX，也不生成 SVG。

编辑携带读取版本，保存排队；冲突保留当前输入并阻止发布、导出和离开，重新读取前确认丢弃。幻灯片 ID、顺序、要点、讲者备注和配色继续保存在原库。Artifact 发布保存固定快照，关联中断后可恢复原版本，保留后来编辑；下一次明确发布可另存一版。

验证与系统剩余范围见 [动作体系迁移记录](../../../specs/action-architecture/migration.md)。插件作者接入见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`
