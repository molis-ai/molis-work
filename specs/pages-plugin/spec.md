# Pages 文档插件

完成等级（整期目标）：**4 内部完整**。不宣称可发布。第一刀（WI1）只做到「库 + 内核 + 基础格式」可用。

产品方向：Notion 式丰富文档（连续文字 + 块），不是 Google Docs 连续流，也不是 VS Code 文件树。Pagesus 可参考，不原样搬 React/三栏/已删源码。

## 背景目标

GoalBoard 没有给人写长文、块文档的入口。Files 是工作区只读树。Form / Dataset / PPT 是个人插件，但不是文档。要把 Pagesus 里仍有价值的能力做成 native 个人插件 `pages`。

## 当前行为与问题证据

- 工作台侧栏没有文档入口。
- Adeptify Pagesus 源码已删（`34c2eefb2`）；新栈 `modules/pagesus` 为空。
- 纯 `contenteditable` 撑不住块、IME、粘贴、撤销、嵌入。必须有编辑器内核。
- Workbench 客户端是拼接字符串。ProseMirror 不能塞进 Form 那种 factory string，须单独打成浏览器 IIFE。

## 范围（这一期）

库：列表、空态、新建、打开、自动保存、改名、删除确认、文件夹、搜索、收藏、把文档挂到 Goal、导出当前文档 HTML。文件夹的建/改名/删、夹里新建、把文档归进夹，都在列表页发生；点文件夹不换一层目录。编辑页只管这篇正文，不管夹。

写：段落、标题、粗斜体下划线删除线、行内代码、列表、选区浮动格式条。备注、评论。

块：Callout、清单、代码、表、Toggle、分隔线、目录。

插入：`/`、`+`、手柄上下排序、插入线。不要 Markdown 块、顶栏插入、缩放、行引擎、三栏、连线、拖块配置。

提及与卡：`@` 文档、文档引用卡、任务卡（标题/描述/状态/截止日期，不派角色）、月历、日程卡（先读本篇事件）。不要 `@` 空间/角色、三种引用形态。

AI：选区候选写回（G0）；翻译、改写（含四种风格，不单开语调）、扩写、续写、大纲、总结、解释、要点、行动项（写回清单块）、读者视角、写作教练；整篇翻译成新文档；全文校对。接不上模型就诚实 stub。不要 Companion / Differ / 配图。

交接：Promote 成 Artifact，并写入「挂到 Goal」；Extractor（任务→任务卡，知识→新文档或 Artifact）。GoalBoard 无 Knowledge 宿主。

模板：十份。

对外 MCP：登记 list/get/create/update/delete（及后续 WI 增加的读接口），默认关，Host 注入 `project_id`。

## 非目标

- A9 多栏并排、A11 导入 Markdown 文件、A14 分享链接。
- B7 字数统计（静默）、B8 Markdown 快捷键全集（WI1 只保留标题/列表输入规则）。
- `@` 表单 / Goal / 日期；统计块；摘要块；嵌 Goal / Form / Dataset / PPT。
- 版本对比、编辑器内 TabBar / SplitView（工作台已有标签/分栏）。
- I / J / K / M 整组；P 编辑器市场。
- 迁 React、TipTap React、Pagesus 三栏。
- 宣称可发布；提交除非另说。

以后：多栏、@表单/Goal/日期、统计、摘要块、嵌其他插件、版本对比、静默字数。

## 使用场景

1. 侧栏打开 Pages，建一篇，写标题和两段加粗文字，刷新还在。
2. 同一 home 里项目 A 的文档不出现在项目 B。
3. 后续 WI：斜杠插入 Callout、评论、任务卡、选区改写、Promote、从模板新建。

## 方案与关键决策

- 个人插件，对齐 Form：始终在侧栏；数据 `{home}/pages/pages.db`，按 `project_id` 分区。
- 文档模型是 ProseMirror JSON，存在 `body_json`。标题是独立字段，不进文档树。
- 内核：vanilla ProseMirror，打成 `/assets/molis-work-pages-editor.js` IIFE。列表/壳仍是 factory 字符串。
- UI：`plugin-stage-shell` + `mw-*`。阅读面，不要后台表格。
- 自动保存不得重挂正在编辑的内核，不得丢掉光标。打开另一篇才 `setDoc` / 重挂。
- 确认用 `dialog.mw-dialog`。
- AI / Promote / Extractor 分 WI；WI1 不碰 Artifact 事实。
- 插件 id：`io.molis.work.pages` / `pages`。显示名 Pages。

## 输入输出与依赖

输入：工作台编辑、MCP 工具调用。  
输出：本机 SQLite 文档、HTML 导出、后续 Artifact。  
依赖：Plugin Manifest、Workbench catalog、Local Host `/api/pages`、Design System、ProseMirror。

## 文件 / 模块边界

允许：`specs/pages-plugin/`；`packages/contracts/src/modules/pages.ts`；`plugins/native/pages`；Workbench catalog/壳接线；Local Host HTTP 与 MCP 适配；`scripts/workspace-packages.mjs`；SSOT 一行；对应测试与文档。

禁止：改 Goals/Artifacts 事实（除 N1/A12 所在 WI）；新建 MCP 包；编辑器市场；把内核塞进 factory string。

## Work Items

| WI | 内容 | depends_on |
| --- | --- | --- |
| 01 库与内核 | 插件壳、SQLite 库、ProseMirror 挂载、B1–B6、导出 HTML、MCP list/get/create/update/delete | — |
| 02 库整理 | 文件夹、搜索、收藏、十份模板 | 01 |
| 03 块与插入 | Callout/清单/代码/表/Toggle/分隔线/目录；`/` `+` 手柄 插入线 | 01 |
| 04 备注评论 | 块备注、选区评论 | 01 |
| 05 提及与卡 | `@` 文档、引用卡、任务卡、月历、日程卡 | 01 |
| 06 AI | G0 + 命令 + 整篇翻译新文档 + 全文校对；无模型则 stub | 01 |
| 07 交接 | A12 挂 Goal、N1 Promote、N2 Extractor | 01 |
| 08 阅读面 | Notion 式纸面、适时 chrome、去掉毛坯边框线；overlay 挂回舞台 | 01–07 |

并行条件：02–07 都依赖 01；02 与 03 无共享文件时可并行；05 依赖 03 的块 schema 扩展；06 写回清单块依赖 03；07 可与 04 并行，但 N2 任务卡依赖 05。08 在功能接通后串行改 UI 共享面。

## 验收标准（整期）

1. 侧栏有 Pages，不经项目「添加插件」。
2. 核心写读、块、评论、卡、模板、AI stub/真模型、Promote/抽取按各 WI 验收。
3. 工作台 HTML 含 `data-pages=workbench` 与 `molis-work-pages-editor.js`。
4. 自动保存不调用会重挂内核的 fill。
5. 项目隔离。删除有确认。
6. 对外 MCP 默认关。

WI1 验收见 `work-items/01-library-and-kernel/spec.md`。不得用 WI1 证据宣称整期完成。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-plugin-pages --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts tests/creative-tools-plugins.test.ts tests/plugin-declarative-mounting.test.ts tests/lingguang-plugin.test.ts tests/plugin-outbound-mcp.test.ts
```

## 假设与开放问题

- WI1 用 vanilla ProseMirror，不用 `@tiptap/core`。
- 日程卡先读本篇事件；不接 Schedule 模块直到有真实调用需求。
- 知识抽取没有 Knowledge 宿主，落地为新文档或 Artifact。
- 模型入口沿用 Host 已有 provider；WI6 再接，接不上就 stub。
