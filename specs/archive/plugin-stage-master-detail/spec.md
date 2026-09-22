# 插件列表统一成 Goals 舞台主从

状态：可验收。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次体验变更的唯一需求书。它覆盖 Feed 左右重复分类、Inbox / Artifacts / Shelf 另占第二栏，以及 Artifacts 仍用目录两行组件、进页自动展开上次版本。Sessions 已按 `specs/archive/session-stage-list/spec.md` 落地。

## 背景目标

Goals / Sessions / Feed / Inbox：点插件条没有第二栏，内容区默认铺满列表；点一行，宽屏列表收成 `--tree-width`，右边出详情。

Shelf 仍贡献 `data-directory-panel="shelf"`，左边三组、右边预览。Artifacts 已进舞台壳，但行是 `mw-dir-row--meta`，fold 标题是原始 `artifact_type_id`，从插件条打开会 restore sessionStorage 里的版本并展开。

用户要求：Shelf 和 Artifact 也走上面那一套。

## 当前行为与问题证据

- Shelf：`renderShelfDirectory` 产出第二栏；插件条带 `data-directory-open="shelf"`；工作面是独立 `.shelf-stage`，点行只换预览，不 `data-expanded`。
- Artifacts：已是 `plugin-stage-shell`，但行是 `renderDirectoryRow`；`<strong>` 用原始 type id；`plugin-workbench` 的 `open("artifacts")` 会 `loadArtifacts()` 默认上次版本。

## 范围与非目标

做：

- Feed、Inbox、Artifacts、**Shelf** 不再贡献第二栏 panel。点插件只开工作面，`is-plugin-directory-empty` 为 true。
- 默认内容区是铺满的舞台列表。分类是 `goal-collection-fold`：caret + 状态 mark + 标题 + 计数。点分组头只开合，不筛掉其他组，不自动打开第一条。
- 宽屏单击一行：`data-expanded="true"`，列表收成 `--tree-width`，右边是该条详情。窄屏列表藏起，正文铺满；返回按钮回到铺满列表。
- 打开插件不自动选中第一条。从插件条打开 Artifacts 始终进 `/artifacts` 列表，不 restore 上次版本、不自动展开。
- Feed：每个已配置来源都是 fold，包括 0 条 Item 的空任务；`status_kind === active` 用勾（`check`），其余用三角（`alert`）。
- Inbox：待处理（三角）和历史（勾）两个 fold 同时在列表里。
- Artifacts：按 `artifact_type_id` 分组；可用勾、不可用/归档三角。行用 `feed-stage-entry`（标题 + 版本 + 状态），不要 `mw-dir-row`。类型名：已知 `io.molis.work.goal.delivery` → `Goal 交付`、`io.molis.work.feed.capture` → `Feed 捕获`，其余取 type id 最后一段；已知项走 `p.text`。点版本进右栏，语义仍是精确版本。
- Shelf：三组 fold（材料 / 生成结果 / 剪贴板）进舞台列表，空组也显示。失败条目 → 三角，否则勾。默认列表铺满舞台；点材料、结果或剪贴板一行才展开预览。搜索 / + / 更多和页脚「副本工作区 / ⌘V」属于目录栏：钉在这一栏顶和底，不跟在最后一行后面，展开后也不伸进预览。DropAgent 预览、对照、TTY、jobs、轮盘、行 glyph、`--da-*` 留在行和预览上。列表背景走 `--da-side`。
- Artifacts 列表空态留在舞台 list 里左对齐，不按文档页居中。

不做：

- 不把 Goals 第二栏加回来；首页 / 市场 / 用户收起目录仍按内容收窄。
- 不改 Feed 拉取、Inbox 注意力状态机、Artifact 精确版本 / 导出、Shelf 进货/抽字/Job/轮盘语义。
- 不把 Shelf 预览和底栏涂成 Coss 强调色。
- 不把来源管理升成第三个插件；`data-directory-panel="sources"` 仍可隐藏存在。
- 不改用户真实库。

## 使用场景

1. 点 Feed：左边只有插件条；内容区是各来源任务 fold。点一条 Item，宽屏左边留下窄目录，右边出正文。
2. 点 Inbox：待处理和历史都是 fold。不自动打开第一条。
3. 点 Artifacts：按人话类型名分组。点一个版本才出详情；从插件条再点一次回到铺满列表。
4. 点 Shelf：三个 fold 铺满舞台；「副本工作区 / ⌘V」钉在目录栏底。点一份材料，宽屏左边收成 213px，右边出预览，页脚仍在左栏底。空组仍在。
5. 窄屏点插件进铺满列表，点行后只看正文，返回回列表。

## 方案与关键决策

- Host：Shelf / Inbox / Artifacts 与 Goals / Sessions / Feed 一样，插件条不带 `data-directory-open`；没有 panel 就不打开第二栏。
- 共享舞台壳：`plugin-stage-shell` + `plugin-stage-list` + `plugin-stage-workspace`，宽屏展开 grid 为 `var(--tree-width, var(--immersive-sidebar-width)) minmax(0, 1fr)`。
- Shelf 的 `data-shelf="directory"` 留在舞台 list 上，避免重写整个 client；`selectItem` / `selectClip` 后 `data-expanded="true"`。目录栏用 flex 列：中间滚动，页脚 `margin-top: auto` 钉栏底。
- 集合头 mark 只表达需要不需要盯：勾 = 安好/已处理/可用/无失败；三角 = 要盯。

## 输入输出与依赖

输入：现有 Feed Source/Item、Inbox Attention、Artifact 精确版本、Shelf snapshot。输出：同一套选中、详情、动作 API。依赖：Host 按 panel 有无开第二栏、Goals/Sessions 主从列宽合同。Shelf DropAgent 合同见 `specs/shelf-plugin/spec.md`（工作台 IA 以本文为准）。

## 文件 / 模块边界

- `plugins/native/feed/src/ui.ts`、`plugins/native/inbox/src/ui.ts`、`plugins/native/artifacts/src/browser-ui.ts`、`plugins/native/shelf/src/ui.ts`、`plugins/native/shelf/src/client.ts`、`plugins/native/shelf/src/styles.ts`
- `apps/workbench/src/styles/plugin-stage.ts`、`immersive-shell.ts`、`goals-page-renderer.ts`、`scripts/client/plugin-workbench.ts`
- 测试：`tests/feed-native-plugin.test.ts`、`tests/inbox-native-plugin.test.ts`、`tests/desktop-tui.test.ts`、`tests/artifact-browser.test.ts`、`tests/shelf-plugin.test.ts`、`tests/shelf-plugin.e2e.test.ts`、`tests/immersive-directory.e2e.test.ts`

## 验收标准

1. 点 Feed / Inbox / Artifacts / Shelf：工作区带 `is-plugin-directory-empty`，没有对应 `data-directory-panel`；插件条没有 `data-directory-open`。
2. 未点行时没有可见详情；Feed 空任务仍有 fold；分组 mark 是 `check` 或 `alert`。Shelf 页脚钉在全宽目录栏底。
3. 宽屏单击后列表仍可见且宽度等于目录列；对应详情在右侧且 `hidden === false`。Shelf 展开后页脚宽度不超过 213px 左栏。
4. 点返回后 `data-expanded` 不是 true，详情隐藏。Shelf 回到全宽列表，页脚仍在栏底。
5. Inbox 待处理和历史同时作为 fold 出现；打开 Inbox 不选中第一条。
6. Artifacts 按类型分组，fold 标题是人话名不是 raw type id；行是 `feed-stage-entry`；点版本后右栏是该精确版本；从插件条打开不自动展开上次版本。
7. Shelf 三组 fold 在舞台列表（空组也在）；默认全宽，点行才展开预览；页脚「副本工作区 / ⌘V」钉在目录栏底（全宽或 213px），不跟在最后一行后、也不伸进预览。提取 PDF / 对照 / 底栏仍可用。完成等级 3。不改用户真实库。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-plugin-artifacts --filter @molis-ai/molis-work-plugin-shelf --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/feed-native-plugin.test.ts tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts tests/desktop-tui.test.ts tests/project-plugins.test.ts tests/artifact-browser.test.ts tests/shelf-plugin.test.ts tests/goal-decision-attention.test.ts tests/chrome-inner-scroll.test.ts
```

## 假设与开放问题

- 假设 4174 + `~/.molis-work` 仍是内部试用入口。
- 工作台里不再有插件占用第二栏后，目录列宽拖动只能在仍有 panel 的设置页验证；插件舞台窄栏宽仍读 `--tree-width`。
