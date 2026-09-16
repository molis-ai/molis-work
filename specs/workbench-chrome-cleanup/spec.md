# 工作台 Chrome 调用链收敛

状态：已验收（内部完整）。完成等级 **4：内部完整**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次存量整理的唯一需求书。它不改 tab-workspace、看板、Feed 任务树、设置舞台的产品合同；只把已经落地的主链收成一条，删掉被取代的并行实现。

## 背景目标

`feat/canvas-board-objects` 已把主屏换成分组标签 + 分栏，Goals 母标签有画布/看板，Feed 列表在右边舞台。壳层仍挂着被取代的 Goal `work-tabs`、Feed 左栏空 panel、以及始终 hidden 的 Feed/来源子页签。调用链因此看起来像多套 owner 同时活着。

## 当前行为与问题证据

- 生产 DOM 只有 `[data-titlebar-tabs]` / `[data-tab-workspace]`，没有 `[data-work-tabs]`。`bootstrap` 仍装配 `GOALS_WORK_TABS_CLIENT_FACTORY_SCRIPT`，`selectGoal` 仍 `ensureWorkTab`，全部空转。
- 点 Feed 仍 `setDesktopDirectory("feed")`，左栏切到空的 `data-directory-panel="feed"`；列表实际在 `[data-feed-stage-directory]`。`specs/feed-stage-directory/spec.md` 已规定左边只留目的地。
- `goals-page-renderer` 仍渲染 `hidden` 的 `data-feed-views`（Feed / 来源）。合同要求不再出现这对子页签。
- `tab-workspace` 管跨插件标签和分栏；`frame-container` 管 Goals 画布/看板/Frame。两套并存是合同，不是 bug。看板点卡片走 `selectGoal` 展开工作框，目录点 Goal 走开 item 标签——这也是合同，不在本轮合并。

硬边界（plugin 互引、workbench 写库）本轮审计未发现违规。Feed 投影仍在 workbench、settings folds 与 stage 双壳，记 later，不在本轮搬迁。

## 范围与非目标

### 做

- 删除生产路径上的 Goal work-tabs 客户端、存储键、Host 装配和 `selectGoal` / 刷新里的空调用。
- 左栏 `feed` / `sources` 目录一律落到 `root`（目的地）。点 Feed 不再露出空列表壳。
- 删除 hidden 的 `data-feed-views`。
- Feed 左栏 contribution 不再输出空 panel。
- 在 tab-workspace、frame-container、settings folds/stage 顶部写清唯一职责。
- 更新因此失效的源码断言；旧 `.desktop-work-tabs` CSS 与隔离滚动测试保留（设计系统仍有这套样式）。

### 不做

- 不把 `feed-projection-ui` / Feed 客户端迁进 plugin。
- 不合并用户设置与项目设置 renderer，不删 folds hub。
- 不改看板点卡片是否开 item 标签。
- 不拆 `events-primary` / `events-secondary`。
- 不删 source-workbench（来源配置表单仍挂在那里）。
- 不改 MCP、Goal 事件、用户库。

## 使用场景

1. 打开项目、点 Goals、点一条 Goal：只走 tab-workspace item 标签 + `selectGoal`，titlebar 不再尝试画旧 work-tabs。
2. 点 Feed：左边停在目的地（root），右边是任务树；没有 Feed/来源子页签，左栏没有 Item 行。
3. 刷新后 `directory: "feed"` 的旧 UI 状态按 root 恢复，主区仍能回到 Feed 舞台。
4. 画布/看板/Frame 仍由 frame-container 记忆和切换。

## 方案与关键决策

1. **一条标签主链。** 工作区标签只属于 `tab-workspace-ops` + `tab-workspace` 客户端。Goals plugin 不再拥有一套打开列表。
2. **Feed 左栏是例外，收在一个 choke point。** `setDesktopDirectory` 把 `feed` / `sources` 映射成 `root`，调用方不必各写一遍。
3. **Frame 不是第三套通用标签。** 只在注释里钉死职责，本轮不重写。

## 输入输出与依赖

- 输入：现有 immersive 壳、tab-workspace 状态、Feed 舞台 DOM。
- 输出：同一用户路径，少一套死客户端和左栏空壳。
- 依赖：`specs/workbench-tab-workspace/spec.md`、`specs/feed-stage-directory/spec.md`、`specs/goal-kanban-view/spec.md`。

## 文件 / 模块边界

允许改：

- `apps/workbench/src/scripts/client/{bootstrap,navigation-feed,events-secondary,initialization,refresh-decisions,tab-workspace,immersive-navigation}.ts`
- `apps/workbench/src/{browser-assets,goals-page-renderer,immersive-shell,project-settings-folds,project-settings-stage}.ts`
- `apps/workbench/src/scripts/client/frame-container.ts`（只加职责说明）
- `plugins/native/goals/src/{work-tabs-client.ts,navigation-client.ts,index.ts}`
- `plugins/native/feed/src/ui.ts`
- 对应测试

不改：Goal / Feed 领域写入、MCP、design-system 里仍被隔离测试引用的 `.desktop-work-tabs` 样式。

## 验收标准

1. 生产客户端不再查询 `[data-work-tabs]`，不再写入 `molis-work-work-tabs:`，`selectGoal` 不再 `ensureWorkTab`。
2. 点 Feed：`#goal-tree-pane` 不含 `[data-feed-list]`；无 `data-feed-views`；左栏 `data-desktop-directory` 为 `root`。
3. 打开 Goal、拆栏、关到首页仍走 tab-workspace。
4. 定向测试通过。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-plugin-goals build
pnpm --filter @molis-ai/molis-work-plugin-feed build
pnpm --filter @molis-ai/molis-work-plugin-work build
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/tab-workspace-ops.test.ts \
  tests/feed-native-plugin.test.ts \
  tests/web.test.ts \
  tests/project-plugins.test.ts \
  tests/workbench-tab-workspace.e2e.test.ts \
  tests/workbench-frame-container.e2e.test.ts \
  tests/immersive-directory.e2e.test.ts \
  tests/immersive-workbench.e2e.test.ts \
  tests/goal-kanban.e2e.test.ts
node --import tsx --test --test-concurrency=1 \
  --test-name-pattern 'Web and Desktop share one project workbench' \
  tests/desktop-tui.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须临时 `--home`。`desktop-tui.test.ts` 全文件含 PTY，本轮只跑工作台 HTML/脚本断言。`rename-molis-work.test.ts` 因 `LEGACY_SESSION_REGISTRY_OWNER` 导出口缺失无法加载，是 pull 后预存问题，不在本轮验收。

## 验收记录

1. 通过。生产 `CLIENT_SCRIPT` 不再含 `ensureWorkTab` / `persistWorkTabs` / `[data-work-tabs]` 查询。
2. 通过。Feed e2e：左栏 directory=`root`，无 `data-feed-views`，`[data-feed-list]` 不在 `#goal-tree-pane`。
3. 通过。`workbench-tab-workspace.e2e` 与 `workbench-frame-container.e2e`。
4. 通过。上列定向测试；工作台 Chrome 选择器已对齐 titlebar 标签。画布上点开工作框不是 item 标签，点 Goals 目的地回母标签（画布），刷新也恢复母标签。

## 假设与开放问题

- 旧 `molis-work-work-tabs:` localStorage 不再读取，残留键无害。
- source-workbench 仍是来源配置的挂载点；迁到 Feed 任务行下是 later。
- Feed 投影仍在 workbench 是已知跨界，本轮不搬。
- settings folds 与 stage 双壳仍并存，本轮只钉职责注释。
- 画布 `data-graph-open` 只 `selectGoal`，不开 item 标签；这与「目录点 Goal 开 item 标签」仍是两套合同。
