# Sessions 目录按来源分组

状态：已落地。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。它覆盖 `specs/feed-directory-add-top/spec.md` 里「Sessions 新建仍在列表下方」的约定，并补在 `specs/session-directory-goal-row/spec.md` 的行语法之上。

## 背景目标

Sessions 目录是一条平铺列表：标题碰巧像 Runtime 名，来源只在筛选和 `data-record-runtime` 里。Goal 用 `goal-collection-fold` 分组，Feed 用来源嵌套行，新建在列表上方。用户要求 Sessions 按来源分组、点会话看内容、新建按钮上移，对齐其他目录。

## 当前行为与问题证据

- `renderSessionRow` 只画标题 + 可查看/已归档；`runtime_id` 在行属性里，不在分组结构里。
- 新建按钮 `addPlacement` 默认 `end`，在列表最底。
- 客户端 `filterRecords` 会把行 `append` 回 `[data-operation-list]`，一旦分组就会被打平。

## 范围与非目标

做：

- 按 `runtimeId` 分组，每组一个 `goal-collection-fold`：caret、terminal mark、Runtime 显示名、计数；组内 Session 仍是 compact 28px 行，带 `mw-dir-row--nested`。
- 组顺序跟当前列表一致：最近更新的 Runtime 在上，组内保持原更新序。
- 点 Session 行打开该条详情。点分组标题/计数选中该组第一条可见 Session 并保持展开；点 caret 只开合。不另造「该 Runtime 全部」主区。
- 「新建 Session」放到列表上方（`addPlacement: "start"`）。
- 筛选/排序只在组内重排，并隐藏没有可见行的组。

不做：

- 不改 Session 详情、新建对话框、Handoff、归档。
- 不把 bash 做成独立 Enum；`generic` 仍用现有显示名（如「自定义命令」）。
- 不改 Goal / Feed 目录，不改主区空态里的新建按钮。

## 使用场景

1. 打开 Sessions：先看到新建，再看到 Codex / 自定义命令 / Claude Code 等分组，点一条 Session 看内容。
2. 点分组 caret 只收起该 Runtime；点分组标题打开该组第一条 Session。
3. 用筛选只看已归档时，空组消失，有行的组还在。
4. 没有 Session 时仍是空态，新建在列表上方。

## 方案

`renderDirectory` 按 `runtimeId` 聚合成 `<details class="goal-collection-fold" data-session-runtime-fold>`，默认全部展开。行继续 `data-operation-select`。`filterRecords` 发现 fold 后在组内 `append`，不再打到 list 根上。

## 文件边界

- `plugins/native/work/src/ui/render.ts`
- `plugins/native/work/src/ui/directory-client.ts`
- `packages/design-system/src/styles/primitives.ts`（添加按钮跟在 tools 后面时的间距）
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md` 目录描述
- 测试：`tests/work-session-ui.test.ts`

## 验收

1. 多 Runtime 时目录有多个 `data-session-runtime-fold`，Session 行在对应 fold 内且带 `mw-dir-row--nested`。**通过**（4180：Codex / 自定义命令 / Claude Code 三组，行均 nested）。
2. HTML 里 `data-open-session-add` 出现在第一个 `data-session-runtime-fold` 之前。**通过**（新建 top=88，第一组 fold top=120）。
3. 点 Session 行仍切换 `data-operation-detail`；点分组标题选中该组第一条可见 Session；点 caret 不切换详情。**通过**（点 Claude 行打开 Claude 详情；点「自定义命令」选中 bash 且组保持展开）。
4. 筛选/排序后行仍留在各自 fold 内。**通过**（客户端 `fold.append(row)`；未再手点筛选菜单）。
5. 单测覆盖分组 DOM 与新建位置。4180 实屏点选一条 Session。**通过**（`tests/work-session-ui.test.ts`、`tests/primitives.test.ts`、`tests/session-web.test.ts`）。

## 验证命令

```
tsc -p plugins/native/work --pretty false
tsc -p packages/design-system --pretty false
tsc -p apps/workbench --pretty false
node --import tsx --test --test-concurrency=1 tests/work-session-ui.test.ts
```

隔离预览 `127.0.0.1:4180 --home /Users/didi/.molis-work`。
