# Forms 问卷入口

本机问卷：建题、预览填写、看结果。数据在 `{home}/form/form.db`。

包名：`@molis-ai/molis-work-plugin-form`。

插件在 `src/actions.ts` 声明列表、读取、新建、编辑、删除、本地加题、AI 拟题、标记已发布、停止收集、提交与导入答卷、读取与导出结果、导出填写页、存成成果等能力。项目 Host 注册插件处理器；HTTP 只转发同一动作客户端，MCP 只经授权的动作工具，项目、调用者及权限由 Host 注入。

“按题目加题”只做本地追加；“AI 拟题加题”显式使用系统文字模型和连接，另需 `model:invoke`。缺模型禁用 AI，保留本地操作。模型等待期间问卷被编辑、删除，或调用取消、连接撤销时不追加过期结果。

“标记已发布”只保存本机状态和稳定 `share_id`，不产生外网填写链接。“存成 Artifact”保存问卷内容，不包含答卷；固定下来的版本归本机的人，固定它的行为者记在 `created_by`。发布中断后恢复上次固定快照；后续编辑保留，可另存一版。问卷移走又移回后，下一次固定接着项目成果库里已有的最高版号，不把旧版当作中断记录交回。

编辑携带读取版本，保存冲突保留输入，重新读取前确认丢弃。填写时提交预览版本；题目变更会拒绝错版答卷。新答卷在原数据行保留提交时的题目，旧答卷没有快照时明确说明并保留原题号和答案。同次提交使用稳定 `request_id`，响应丢失后重试不重复保存。

验证与系统剩余范围见 [动作体系迁移记录](../../../specs/action-architecture/migration.md)。插件作者接入见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

## 开发要求

- 负责：问卷目录、题目、预览填写与结果。
- 不负责：Goal 与 Artifact 事实、模型提供方、托管收集服务。
- 公开入口：`@molis-ai/molis-work-plugin-form`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 缺模型时禁用 AI，保留本地操作。
  - 编辑带读取版本，冲突保留输入；重新读取前确认丢弃。
  - 新答卷保留提交时的题目快照；同次提交用稳定的 `request_id`，重试不重复保存。
  - 答卷来源由调用方的 audience 决定：只有本机界面（user）的填写页和试填可以用输入里的 `source` 自称 `fill` 或 `preview`；助理、MCP、流程、插件的答卷记为各自的来源，输入的 `source` 对它们无效。
  - 流程交来的标题和题目列表按问卷的上限（标题 80 字、40 题）截取后再收，不因超限而整次拒收。
- 改动后必跑：`node scripts/run-tests.mjs tests/form-actions.test.ts tests/form-mcp.test.ts tests/creative-tools-plugins.test.ts tests/document-pin-after-move.test.ts tests/artifact-compare-moved.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
