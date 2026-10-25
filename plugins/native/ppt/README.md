# PPT 演示稿入口

本机演示稿：改主题色、加幻灯片、预览、导出 JSON 与 PowerPoint 文件。数据在 `{home}/ppt/ppt.db`。

包名：`@molis-ai/molis-work-plugin-ppt`。

插件在 `src/actions.ts` 声明列表、读取、新建、编辑、删除、JSON 导出、PPTX 导出、按文字或 Pages 文档生成大纲、AI 整理大纲和存成成果等能力。项目 Host 经 Plugin Runtime 装配 `createPptPlugin`，数据库事务使用 Runtime 端口；Manifest 的 11 条 HTTP 路由经 SDK 转发同一动作客户端，MCP 只经授权的动作工具，可信项目、调用者和权限由 Host 注入。Pages 原文经 `services.actions.invokeQuery` 保留原调用者授权；每个发布阶段在实际写入前重新核对取消与授权。

JSON 导出由动作服务读取已保存的演示稿，返回文件名、MIME 类型与完整 JSON；浏览器下载同一结果。`ppt.pptx` 导出 PowerPoint 文件（标题、要点、讲者备注与配色，不含图片与图表）。不生成 SVG。

编辑携带读取版本，保存排队；冲突保留当前输入并阻止发布、导出和离开，重新读取前确认丢弃。幻灯片 ID、顺序、要点、讲者备注和配色继续保存在原库。Artifact 发布保存固定快照，固定下来的版本归本机的人，固定它的行为者记在 `created_by`；演示稿移走又移回后下一次固定接着项目成果库里已有的最高版号，关联中断后可恢复原版本，保留后来编辑；下一次明确发布可另存一版。

页面的客户端是 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 从 `src/browser/factory.ts` 打成 `dist/ppt-client.js`（banner/footer 包成工作台要的 `(host) => {…}` 工厂），`src/client.ts` 只读这份包；请求经共同的 `molisWorkRequest`，路径来自 `host.pluginRoute`，浏览器代码里不写插件 id。

页面上的字是稳定键（`ppt.<区域>.<名称>`），中英文都在 `src/messages.ts`，登记在 `registration.ts` 的 `messages`，不经工作台的 `i18n/en.ts` import。`src/en.ts` 的 `PPT_EN` 只留 18 条宿主还按中文原文翻译的词（服务端标签与错误、别的主人在查的词，BL-461）；大纲弹窗把服务端写的「模型不可用」「读不到 Pages 文档」句子原样交给共同翻译器，这两处是 `src/browser/outline.ts` 里仅有的动态翻译（`tests/ppt-client-bundle.test.ts` 钉住）。

验证与系统剩余范围见 [动作体系迁移记录](../../../specs/action-architecture/migration.md)。插件作者接入见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

## 开发要求

- 负责：幻灯片目录、大纲、预览与 JSON／PPTX 导出。
- 不负责：Goal 与成果库事实、SVG 生成、富排版（图片、图表、母版）。
- 公开入口：`@molis-ai/molis-work-plugin-ppt`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（`defineErrorCodes`，错误码都是 `ppt.<原因>`，状态由错误种类决定，PPT 不自带状态表）。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 从 Pages 等待原文期间保留大纲原调用的授权和读取版本；返回后经共享动作控制复查执行资格，版本变化拒绝写入。只有标题、正文与备注都空的唯一初始页可被自动填充，只有标题的页按已有内容保留。
  - 大纲弹窗的一次请求只采用它开始时的演示稿、编辑版本与输入；关闭/Escape 中止该请求，迟到回包不能清空后来的输入或关掉重开的弹窗。
  - 冲突保留当前输入，并阻止发布、导出和离开。
  - 发布保存固定快照；中断后恢复原版本并保留后来的编辑。
  - 项目被删除时平台按 Manifest 里 Home 库的 `project_rows`（`src/database.ts`：确认框里的标签与要删的表）删掉演示稿，连同复制回执；插件的代码不参与，平台在自己的连接上删，库不存在时不创建，重复运行没有副作用（PG-024）。
- 改动后必跑：`node scripts/run-tests.mjs tests/ppt-actions.test.ts tests/ppt-mcp.test.ts tests/ppt-client-bundle.test.ts tests/creative-tools-plugins.test.ts tests/creative-artifact-promote.test.ts tests/document-pin-after-move.test.ts tests/artifact-compare-moved.test.ts tests/project-deletion-owners.test.ts tests/document-plugins-error-model.test.ts`
- 大纲等待、标题页与弹窗定向回归：`node scripts/run-tests.mjs tests/content-owner-regressions.test.ts tests/content-editing-regressions.e2e.test.ts`（浏览器文件需要本机 Chrome；provider 停用由目录注册的 disposer 模拟，不代替真实 Host Catalog 停用）。
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/model-ready-surfaces.e2e.test.ts`（页面在没有模型时显示「没有模型」，模型设置页宣布第一个模型（`molis-work:model-ready`）后它要重读；这个文件每个页面一条用例）。
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
