# Jelly

Status: `partial`

Jelly 的日历、笔记、灵感工作区，使用 Molis Work 控件与舞台。个人数据独立存于 `{home}/jelly/jelly.db`；不会访问或覆盖原 Jelly 数据。功能目标与差异见 `specs/jelly-plugin/`。

Contract: `@molis-ai/molis-work-contracts/platform/plugin` 与 `@molis-ai/molis-work-contracts/modules/jelly`。
Migration Goal: `goal-reorg-f2`。

Host 通过包公开接口注入模型/素材能力；MCP 默认关闭。原始素材和 AI 提案只有在用户确认后才写入日历或笔记。当前实现、工程证据、实际体验和真人验收分别记录，不将本地构建视为完整复刻验收。


动作服务：Manifest 声明 59 项 Home 级能力，由插件的 `actions.ts`、`command-actions.ts` 和 `service-actions.ts` 提供合同及处理器。Host 只注入原 Store、模型和素材端口；HTTP 与旧 MCP 名称转发到同一客户端。写入携带当前 workspace revision，导入及永久删除仍需原确认预览。模型/素材等待使用声明式并发调度，保存前检查原文及素材变化；原表、历史和引用保持不变。

Web 本地用户与 MCP 客户端分别授权；项目访问不自动授予个人内容或模型设置权限。工程、MCP 和桌面/窄屏实操证据见 `specs/action-architecture/migration.md`，系统全量迁移和用户本人验收仍在进行。
