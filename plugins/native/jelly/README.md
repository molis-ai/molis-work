# Jelly

Status: `partial`

Jelly 的日历、笔记、灵感工作区，使用 Molis Work 控件与舞台。个人数据独立存于 `{home}/jelly/jelly.db`；不会访问或覆盖原 Jelly 数据。功能目标与差异见 `specs/archive/jelly-plugin/`。

Contract: `@molis-ai/molis-work-contracts/platform/plugin` 与 `@molis-ai/molis-work-contracts/modules/jelly`。
Migration Goal: `goal-reorg-f2`。

Host 通过包公开接口注入模型/素材能力；`completeJson` 使用 Prologue 的公共格式解码，Jelly 只验证证据引用和领域内容。每次分段/合并调用及最终提交都复查原 Action 权限；MCP 默认关闭。原始素材和 AI 提案只有在用户确认后才写入日历或笔记。当前实现、工程证据、实际体验和真人验收分别记录，不将本地构建视为完整复刻验收。


动作服务：Manifest 声明 59 项 Home 级能力，由插件的 `actions.ts`、`command-actions.ts` 和 `service-actions.ts` 提供合同及处理器。Host 只注入原 Store、模型和素材端口；HTTP 与旧 MCP 名称转发到同一客户端。写入携带当前 workspace revision，导入及永久删除仍需原确认预览。模型/素材等待使用声明式并发调度，保存前检查原文及素材变化；原表、历史和引用保持不变。

Web 本地用户与 MCP 客户端分别授权；项目访问不自动授予个人内容或模型设置权限。工程、MCP 和桌面/窄屏实操证据见 `specs/action-architecture/migration.md`，系统全量迁移和用户本人验收仍在进行。

## 开发要求

- 负责：个人日历、笔记与灵感工作区。
- 不负责：原 Jelly App 的数据、项目 Goal 事实、第二个运行时。
- 公开入口：`@molis-ai/molis-work-plugin-jelly`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 不访问或覆盖原 Jelly 数据。
  - 素材与 AI 提案只有用户确认后才写入日历或笔记。
  - 项目访问不自动授予个人内容或模型设置权限。
  - `delete_preview` 只保存确认凭证（显式声明为写），真正删除是另一个动作。
  - 改一个对象的命令声明结果对象（`result_subject`），输出附带改后的这一个，可由该种类的 `subject.read` 读回：日程（事项，或重复系列整体）是 `jelly_item`（`item` 或 `series`），笔记是 `jelly_note`（`note`），灵感是 `jelly_inspiration`（`inspiration`）。灵感转为笔记、摘要写入笔记，结果是那篇笔记。恢复让对象重新可读，结果就是这个对象。作用于多条或整个工作区的命令，以及归档与删除，仍是 `jelly_workspace`：读取动作把归档的对象当作不存在，结果刚记下就会显示为已不在。
- 改动后必跑：`node scripts/run-tests.mjs tests/jelly-actions.test.ts tests/jelly-content.test.ts tests/jelly-mcp.test.ts tests/jelly-model.test.ts tests/jelly-plugin.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

素材解析通过 Host 的公共 `materials` 契约执行；原生源代码、构建、二进制与许可证归 `apps/local-host/native/materials`。Jelly 不再构建解析组件；历史 `jelly/imports` 与 `jelly/models` 路径保持不变。等待后和上传保存/派出前复核当前调用，取消不能提交晚结果。
