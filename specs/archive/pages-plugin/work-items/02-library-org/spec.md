# WI2：Pages 库整理

depends_on：01-library-and-kernel。  
完成等级：**3 功能可用**（库能分组、能搜、能从模板开篇）。整期 4 不在本 WI。

## 背景目标

文档多了之后，平铺列表不够用。这一刀把库收成「能找到、能归类、能从模板起笔」，仍然不是文件管理器，也不是 VS Code 树。

## 当前行为与问题证据

WI1 只有按更新时间倒序的平铺列表。没有文件夹、搜索、收藏、模板。

## 范围

1. 文件夹：建、改名、删。删夹后文档变未分类。一层，不嵌套。
2. 列表按「收藏 / 文件夹 / 未分类」分组浏览。收藏是钉在上面，文档仍留在原分组。
3. 目录搜索：按标题过滤（本机，当前项目）。
4. 十份内置模板：会议纪要、周报、项目计划、PRD、迭代回顾、用户访谈、OKR、复盘、技术方案、竞品分析。空态和工具条都能打开模板。模板是预填 ProseMirror JSON，不是运行中的 App。
5. 本 WI 模板只用 WI1 已有节点（标题、段落、列表）。Callout / 表 / 清单等在 WI3 补进模板。
6. HTTP：list 带 folders；folders CRUD；create 可带 `template_id` / `folder_id` / `starred`；update 可改 `folder_id` / `starred`。
7. MCP create/update/list 带上这些字段，不另开 identity 字段。

## 非目标

多级文件夹、拖拽排序、全文搜正文、模板市场、云端模板、A12 挂 Goal。

## 使用场景

侧栏 Pages → 建夹「产品」→ 从「会议纪要」开一篇进这个夹 → 收藏 → 搜标题仍能找到。删夹后这篇出现在未分类。另一项目看不见。

## 方案与关键决策

- `pages.db` 加 `folders` 表；`pages.folder_id` 空字符串表示未分类；`pages.starred` 0/1。旧库 ALTER。
- UI 复用 `plugin-stage-chrome`、`tree-search`、`goal-collection-fold`、`feed-stage-entry directory-list-row`。
- 确认仍走 `dialog.mw-dialog`。夹名、模板用另外的 dialog，不用 `window.prompt`。
- 内核仍不进 factory string。

## 输入输出与依赖

允许修改：本目录 spec；contracts `PagesRecord`；`plugins/native/pages`（store/routes/mcp/ui/client/styles/en/templates）；`tests/pages-plugin.test.ts`。不改 Goals/Artifacts。

## 验收标准

1. 能建/改名/删文件夹；删夹后文档 `folder_id` 为空。
2. 收藏钉在列表顶部组，刷新还在。
3. 搜索框按标题过滤；无匹配有说明。
4. 十份模板都能新建，正文含对应标题结构，重开 store 还在。
5. 缺项目拒绝；夹和文档按 `project_id` 隔离。
6. `save()` 仍不含 `fillEditor` / `setDoc`。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-plugin-pages --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts
```

## handoff

产物：可分组的库 + 模板起笔。下一切片扩 schema（块）时升级这十份模板，不要重做壳。
