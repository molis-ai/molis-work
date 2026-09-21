# WI1：Pages 库与编辑器内核

depends_on：无。  
完成等级：**3 功能可用**（库 + 能写能存的内核）。整期 4 不在本 WI。

## 背景目标

先有一篇能打开、能写、刷新还在的文档，证明插件壳和内核能进工作台。后面的块、评论、AI 都挂在这棵文档树上。

## 当前行为与问题证据

没有 `pages` 插件、没有 `/api/pages`、工作台没有文档舞台。

## 范围

1. native 个人插件 `io.molis.work.pages` / `pages`。
2. `{home}/pages/pages.db`：文档 id、project_id、title、body_json、时间、version。
3. 列表、空态、新建、打开、改标题、自动保存正文、删除确认、返回列表。
4. 编辑区挂 ProseMirror：段落、H1–H3、粗/斜/下划线/删除线、行内代码、有序/无序列表、选区浮动格式条。
5. 导出当前文档为 HTML 文件（浏览器下载）。
6. HTTP：list / create / get / update / delete。
7. MCP：同上五个 `tool_id`，默认关，Host 注入项目。
8. Workbench catalog / 舞台 / 样式 / 英文目录接线。内核以 IIFE 提供，不进 factory string。

## 非目标

文件夹、搜索、收藏、模板、块（Callout 等）、`/` 菜单、评论、`@`、任务卡、AI、Promote、挂 Goal。

## 使用场景

侧栏 Pages → 新建 → 写标题和加粗段落 → 等自动保存 → 刷新仍在。删前弹出确认。另一项目看不到这篇。

## 方案与关键决策

- 对齐 Form 的 store / routes / Host HTTP / MCP adapter。
- `body_json` 是 ProseMirror doc。服务端只校验是 `type: "doc"` 的对象且体积上限，不在 Node 里跑 ProseMirror。
- 内核入口 `plugins/native/pages/src/editor-browser.ts`，esbuild IIFE，`MolisWorkPagesEditor.{mount,getDoc,setDoc,destroy,toHTML,emptyDoc}`。Host 提供 `/assets/molis-work-pages-editor.js`。
- `save()` 只 POST，不 `fillEditor` / 不 `setDoc`。打开另一篇才 `setDoc`。
- 标题是舞台顶栏大输入，不进 PM。
- 导航 order 56；Form/Dataset/PPT 顺延 57/58/59，让 Pages 紧挨 Functions。

## 输入输出与依赖

见总 spec。允许修改：本目录 spec；contracts `modules/pages`；`plugins/native/pages`；Workbench catalog/壳/i18n/导航名单；Local Host HTTP/MCP；design-system palette 一行；workspace-packages；SSOT；`tests/pages-plugin.test.ts` 及被个人插件名单打断的测试；mcp/平台文档里 Forms 并列处。

## 验收标准

1. 侧栏有 Pages，市场「已添加」。
2. 创建 → 改标题 → 存 body → 重开 store 记录仍在。
3. HTML 含 `data-pages=workbench`、`data-pages-editor`、`molis-work-pages-editor.js`。
4. 客户端 `save` 源码不含 `fillEditor` / `setDoc`；`fillEditor` 会 `clearTimeout(saveTimer)`。
5. 删除走确认 dialog。
6. 缺 `project_id` 拒绝；跨项目 get 404。
7. MCP 登记且默认不进 runtime list。
8. `new Function(workbench client)` 仍能解析。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-plugin-pages --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts tests/creative-tools-plugins.test.ts tests/plugin-declarative-mounting.test.ts tests/lingguang-plugin.test.ts tests/plugin-outbound-mcp.test.ts
node scripts/workspace-packages.mjs
```

## handoff

产物：可打开的 Pages 舞台 + 持久化 PM JSON + IIFE 内核。下一切片从扩 schema（块）或库整理开始，不要重做壳。
