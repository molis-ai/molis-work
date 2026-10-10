# PPT 演示稿入口

本机演示稿：改主题色、加幻灯片、预览、导出 JSON 与 PowerPoint 文件。数据在 `{home}/ppt/ppt.db`。

包名：`@molis-ai/molis-work-plugin-ppt`。

插件在 `src/actions.ts` 声明列表、读取、新建、编辑、删除、JSON 导出、PPTX 导出、按文字或 Pages 文档生成大纲、AI 整理大纲和存成成果等能力。项目 Host 注册原 Store 处理器；HTTP 只转发同一动作客户端，MCP 只经授权的动作工具，可信项目、调用者和权限由 Host 注入。

JSON 导出由动作服务读取已保存的演示稿，返回文件名、MIME 类型与完整 JSON；浏览器下载同一结果。`ppt.pptx` 导出 PowerPoint 文件（标题、要点、讲者备注与配色，不含图片与图表）。不生成 SVG。

编辑携带读取版本，保存排队；冲突保留当前输入并阻止发布、导出和离开，重新读取前确认丢弃。幻灯片 ID、顺序、要点、讲者备注和配色继续保存在原库。Artifact 发布保存固定快照，固定下来的版本归本机的人，固定它的行为者记在 `created_by`；演示稿移走又移回后下一次固定接着项目成果库里已有的最高版号，关联中断后可恢复原版本，保留后来编辑；下一次明确发布可另存一版。

验证与系统剩余范围见 [动作体系迁移记录](../../../specs/action-architecture/migration.md)。插件作者接入见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

## 开发要求

- 负责：幻灯片目录、大纲、预览与 JSON／PPTX 导出。
- 不负责：Goal 与成果库事实、SVG 生成、富排版（图片、图表、母版）。
- 公开入口：`@molis-ai/molis-work-plugin-ppt`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 冲突保留当前输入，并阻止发布、导出和离开。
  - 发布保存固定快照；中断后恢复原版本并保留后来的编辑。
  - 项目被删除时宿主按目录条目上的 `project_data`（`pptProjectData`，`src/project-data.ts`：确认框里的标签与 `purgePptProject`）调用清掉演示稿，连同复制回执；只读库文件，库不存在时不创建，重复运行没有副作用。
- 改动后必跑：`node scripts/run-tests.mjs tests/ppt-actions.test.ts tests/ppt-mcp.test.ts tests/creative-artifact-promote.test.ts tests/document-pin-after-move.test.ts tests/artifact-compare-moved.test.ts tests/project-deletion-owners.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/model-ready-surfaces.e2e.test.ts`（页面在没有模型时显示「没有模型」，模型设置页宣布第一个模型（`molis-work:model-ready`）后它要重读；这个文件每个页面一条用例）。
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
