# Forms 问卷入口

本机问卷：建题、预览填写、看结果。数据在 `{home}/form/form.db`。

包名：`@molis-ai/molis-work-plugin-form`。

插件在 `src/actions.ts` 声明 11 项能力：列表、读取、新建、编辑、删除、本地加题、AI 拟题、标记已发布、提交答卷、读取结果、存成 Artifact。项目 Host 注册插件处理器；HTTP 和原 10 个 MCP 名称只转发同一动作客户端，项目、调用者及权限由 Host 注入。原 MCP 开关仍默认关闭，生产统一客户端授权随系统迁移继续推进。

“按题目加题”只做本地追加；“AI 拟题加题”显式使用系统文字模型和连接，另需 `model:invoke`。缺模型禁用 AI，保留本地操作。模型等待期间问卷被编辑、删除，或调用取消、连接撤销时不追加过期结果。

“标记已发布”只保存本机状态和稳定 `share_id`，不产生外网填写链接。“存成 Artifact”保存问卷内容，不包含答卷。发布中断后恢复上次固定快照；后续编辑保留，可另存一版。

编辑携带读取版本，保存冲突保留输入，重新读取前确认丢弃。填写时提交预览版本；题目变更会拒绝错版答卷。新答卷在原数据行保留提交时的题目，旧答卷没有快照时明确说明并保留原题号和答案。同次提交使用稳定 `request_id`，响应丢失后重试不重复保存。

验证与系统剩余范围见 [动作体系迁移记录](../../../specs/action-architecture/migration.md)。插件作者接入见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`
