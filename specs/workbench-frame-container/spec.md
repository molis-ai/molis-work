# 工作台 Frame 容器：画布、多窗口、多标签

状态：2026-09-14 锁定所有权；同日纠正 Goal 画布：现生产画布与原展开不改，只加 Frame 按钮。容器是壳；Frame 是按 Goal 绑定的工作面能力（不是左目录插件，也不塞进 Goals）；目录插件只提供可拖资产，拖入只存引用。切片：`docs/design/workbench-frame-container/`。`plan.md` 仍是旧模型，视觉锁定前不要执行。

本文件是 Frame 容器的需求书。目录 IA 已由 `specs/directory-plugin-switcher/spec.md` 取代：目的地始终可见，点插件会离开当前 Frame。它仍取代沉浸式工作台里「右侧主区由当前插件整页独占」的主区模型；**不取代**现有 Goal 关系画布、原 `.goal-canvas-open` 打开的固定工作框、项目首页、Goals / Work / Feed / Artifacts 的领域事实，也不恢复已废止的顶部 Goal tabs。

## 背景与目标

工作台现在是左目录 + 右插件整页。点 Goal、Session、Feed、交付物，主区就被该插件换掉；不能同时摊开几份工作，也不能按项目记住一套打开中的标签和窗口。旧个人工作台有过项目级 Goal 标签，沉浸式改版已明确废掉。

目标：工作台主表面仍是 **现生产 Goal 画布**（目标关系、依赖箭头、258×190 节点）。主区外包一层 **Container**（钉住的 Goal 画布 Tab + 各 Goal 的 Frame Tab）。卡片右上角 **原展开不动**（maximize → 原来的 Goal 工作框）；**只再加一个按钮** 打开该 Goal 的 **Frame**。Session / Feed / 交付物等只能拖进当前 Frame，不能进 Goal 画布。打开的 Tab 按项目暂存。当前完成等级 **4：内部完整**：真实数据上，点 Block 展开成安静的阅读卡（Feed 正文、Inbox 处理上下文、Session 执行记录、Artifact 版本事实）。卡内没有会抢走 Container 的操作。明确缺口：不把 PTY / 浏览器嵌进 Block；来源配置页、项目首页、插件市场仍可独占主区。不宣称可发布；不改已安装 App、不写用户真实库做演示。`plan.md` 仍是旧模型，不要执行。

## 当前行为与问题证据

- UI Host 只有 `workbench.directory` / `workbench.main` / `workbench.overlay`。插件把整页贡献到 `workbench.main`，主区一次只能是一个插件表面。
- 沉浸式接入后，点 Goal 在右侧插件区打开固定工作框，一次一个；文档里写明旧顶部 Goal tabs、70/30 不再验收。
- `documents-state.ts` 已能按项目存部分 UI 状态，但没有 Frame / Window / 跨插件 Tab 这套对象。
- Work 插件已有真实 Browser、Terminal / PTY 所有权；它们目前嵌在插件页或 Goal 工作框里，不能作为工作台顶层窗口/标签独立打开。
- Artifact 模块是交付物身份与版本，不是画布上的「工作内容」。本次用产品隐喻：画布对象引用插件 Item，不把 Goal 迁进 Artifacts 模块。

## 范围与非目标

### 第一期范围（切片已按此模型）

- 右侧主区是 **Container**，顶部一条 Tab 条，按项目暂存。
- 钉住的第一个 Tab 是 **Goal 画布**：就是现生产的目标关系画布，只放本项目的 Goal 节点。不另做一套对话卡片。
- Goal 卡片右上角： **原 `.goal-canvas-open` 原样保留**（打开现有 Goal 工作框）；其左侧 **再加一个按钮** 打开该 Goal 的 Frame。
- 每个 Goal 最多一个 **Frame Tab**。Frame 内是无限画布，可从左目录拖入 Session / Feed / 交付物等 **Block**。
- Goal 画布拒绝非 Goal 内容。Goal 本身留在主画布，不作为 Block 拖进 Frame。
- 点目录 Goal：选中主画布上的对应卡片并回到 Goal 画布 Tab，不新开 Frame。
- 切项目换整套 Tab（Goal 画布 + 已展开的 Frame）。
- 中文/英文、深浅外观沿用现壳。
- 点 Frame 上的 Block：该块展开成安静的阅读卡（纸面细线、可读正文/事实），不是把插件整页塞进卡片。同一 Frame 同时只展开一块。卡内没有会抢走 Container 的操作。不把终端或浏览器嵌进块里。

多 Window 拆分、撕出视口、Browser/Terminal 作为与 Goal 画布平级的顶层 Tab：基础概念可留，**不作为本期主角**。

### 非目标

- 通用 Frame 当工作台主表面（第一版切片作废）。
- 点任何目录 Item 都新建 Frame Tab。
- 把 Session / Feed / Artifact / 终端丢到 Goal 画布上。
- 把 Goal / Session 的身份迁进 Artifacts 模块。
- 用另一套「对话/展开」卡片画布替换现生产 Goal 画布。
- 改掉或替换原来的 `.goal-canvas-open`（maximize → Goal 工作框）。
- 用工作台画布取代 Goals 插件里的依赖关系图。
- 再开真正的 macOS / OS 窗口。
- Frame 构图跨设备同步。
- 各插件自己做一套标签。
- 左边目录出现 Frame 模块，或把 Frame 做成可从项目卸载的市场插件。
- 壳层拥有「这个 Goal 要哪些 Session / 交付物」这类构图事实。
- 把 Frame 画布塞进 Goals 插件，让 Goals 宿主终端、浏览器、交付物。
- 拖入 Frame 时复制或改写资产身份（不把 Session 变成 Artifact，不把 Goal 迁进 Artifacts）。
- 重做设置、onboarding、MCP / Goal 事件协议。
- 发布、安装新 App、改用户真实项目数据来演示。

## 产品结构（已锁定）

```text
工作台
├─ Directory（左）     项目 / 插件 / Item 列表
└─ Container（右）     按项目暂存
    ├─ Tab 条：Goal 画布（钉住）| Goal A 的 Frame | Goal B 的 Frame | …
    └─ 当前 Tab
        ├─ Goal 画布 → 现生产节点（原展开 = 工作框；新按钮 = Frame Tab）
        └─ 某 Goal 的 Frame → Canvas → Block（目录拖入的非 Goal 内容）
```

| 对象 | 拥有者 | 含义 |
| --- | --- | --- |
| Directory | 壳层 | 现有项目与插件目录，本次不改成窗口 |
| Container | 壳层 | 当前项目的 Tab 集合、拖拽路由、打开了哪些 Frame |
| Tab | 壳层 | 钉住的 Goal 画布，或某个 Goal 的 Frame |
| Goal 画布 | 壳层 Tab；内容仍是现生产 Goals 关系图 | 主画布；只放 Goal 节点；不接收非 Goal 拖入 |
| Goal 卡片 | 壳层摆放 / Goals 拥有事实 | 现生产节点；原 maximize 打开工作框；新按钮打开 Frame |
| Frame | Frame 工作面能力，按 Goal 一对一 | 该 Goal 怎么被做完：相机、画布、Block 引用、空态 |
| Block | Frame 摆放 / 资产插件画表面 | 引用一条非 Goal 的插件 Item，不复制身份 |
| Item（资产） | Goals / Work / Feed / Artifacts | Goal / Session / Feed / 交付物 / Browser / Terminal |

Goal 画布 Tab 不可关。空项目仍有 Goal 画布，上面没有卡片。首页可后置于「没有项目 / 目录根」；不作为与 Goal 画布平级的主表面。

## 所有权（已锁定）

三层，互不代替：

1. **容器（壳）**：Goal 画布、顶栏 Tab、把拖拽送到「当前 Frame 或拒绝」、按项目记住打开中的 Frame Tab。不懂某个 Goal 的工作构图。
2. **Frame（工作面能力）**：挂在一个 `goal_id` 上。拥有这份构图。合同按插件来写（可被拖入、可画块、错误隔离），第一期是内置能力，**不出现在左目录**，不能从项目里卸掉。
3. **资产（目录插件）**：Goals 拥有 Goal 与卡片对话；Work / Feed / Artifacts 拥有各自 Item。拖进 Frame 只留下 `{ plugin_id, item_type, item_id }` 加摆放矩形。

关 Frame Tab 不删资产。删 Goal 时收回该 Goal 的 Frame 构图；被引用的 Session / 交付物 / 终端仍在原插件。

Frame 不是 Goals 的一个页面，也不是壳上的通用画布。以后若要可替换的工作面实现，沿用同一合同，不必先做市场安装。

## 使用场景

1. 打开项目 → 顶栏第一个 Tab 是 Goal 画布，上面是现生产的目标关系节点。
2. 点目录「写周报」→ 回到 Goal 画布，选中该卡片。不新开 Frame，也不打开工作框。
3. 卡片右上角原来的展开（maximize）→ 打开现有 Goal 工作框（终端 + 信息/时间线）。双击节点同样。
4. 卡片右上角新加的 Frame 按钮 → 顶栏出现「写周报」Frame Tab 并聚焦。再点只聚焦已有 Tab。
5. 在该 Frame 里从目录拖入 Session / Feed / 交付物 → 画布增加 Block。拖到 Goal 画布则拒绝。
6. 切到另一项目 → 换那套 Goal 画布 + 已展开 Frame。切回来原样。
7. 关某个 Goal 的 Frame Tab → 回到 Goal 画布；该 Goal 卡片还在。再点 Frame 按钮可打开同一 Frame 构图。

## 方案与关键决策

1. **Goal 画布是基础画布。** 工作台主表面不是通用 Frame，也不是插件整页。主画布只表达 Goal。
2. **一 Goal 一 Frame。** Frame 不是任意工作袋。展开某个 Goal，得到且只得到该 Goal 的工作画布。构图按 Goal 保留。
3. **原展开不动，Frame 是新按钮。** 现生产 maximize 仍打开 Goal 工作框。Frame 不是替换它，只在右侧再占一个 28px 图标。二者都不是顶栏上的两个平级 App。卡片内对话不是本期切片。
4. **非 Goal 只能进 Frame。** 目录拖拽的目标是「当前 Frame」。当前停在 Goal 画布时拒绝，并说明要先展开 Frame。
5. **点目录 Goal 是定位，不是开窗。** 选中主画布卡片。打开工作框走原来的展开/双击；打开 Frame 只走新按钮。
6. **产品隐喻，不统一身份。** Goal 仍由 Goals 模块拥有。Frame 上的 Block 只存引用，不把 Goal/Session 迁进 Artifacts。
7. **Frame 是工作面能力，不是目录插件。** 构图不归壳、不归 Goals。左目录继续只列 Goals / Work / Feed / Artifacts 的资产。
8. **两级持久化。** Goal 在画布上的摆放归壳+Goals；每个 Goal 的 Frame 构图归 Frame 能力；打开了哪些 Frame Tab 是按项目本机暂存。不进 Goal 事件、不进 Artifact 版本。
9. **多窗 / 撕出后置。** 当前切片先把 Tab 模型讲清楚。VSCode 式拆窗、Browser/Terminal 顶层 Tab 等视觉过了再加，且不得把它们做成与 Goal 画布争夺主角的默认布局。

## 打开、拖拽、关闭

### 打开

| 动作 | 结果 |
| --- | --- |
| 进入项目 | 显示 Goal 画布 Tab（钉住） |
| 点目录 Goal | 切到 Goal 画布，选中对应卡片 |
| 卡片原展开 / 双击节点 | 打开现有 Goal 工作框，仍停在 Goal 画布 Tab |
| 卡片 Frame 按钮 | 打开或聚焦该 Goal 的 Frame Tab |
| 点目录非 Goal（当前是 Frame） | 可加到当前 Frame；切片里点击与拖入等价 |
| 点目录非 Goal（当前是 Goal 画布） | 打开该插件工作面并选中该条；不 toast。拖到画布仍拒绝。详见 `specs/plugin-surfaces-with-goal-canvas/spec.md` |
| 点 Frame 上的 Block | 展开该块并载入详情；点另一块换展开。收起走关闭钮；切片里再点标题条也可收起。已展开正文可滚动、选字，不启动拖拽。 |

### 拖拽

| 动作 | 结果 |
| --- | --- |
| 目录非 Goal → 当前 Frame | 该 Frame 增加 Block |
| 目录非 Goal → Goal 画布 | 拒绝 |
| 目录 Goal → Goal 画布 | 选中该卡片（已在画布上则不复制） |
| 目录 Goal → Frame | 拒绝；Goal 留在主画布 |
| Goal 卡片 / Block 在本画布内拖 | 只改摆放。Frame 未展开 Block 整张卡可拖（含说明），已展开时标题条可拖、正文不拖。 |

Tab 溢出时条可滚，当前 Tab 完整可见。Goal 画布 Tab 始终在最左且不可关。

### 关闭与空状态

- Goal 画布 Tab 不可关。
- 关某个 Goal 的 Frame Tab：顶栏去掉该 Tab，构图保留；再展开仍是同一 Frame。被引用的资产不删。
- 不提供「关 Tab 即删除 Frame / 删除 Goal / 删除 Session」。
- 删除 Goal：收回该 Goal 的 Frame 构图；资产仍在原插件。
- 项目没有 Goal 时，Goal 画布为空。

## 持久化

按 `project_id` 隔离，换项目换全套，不串数据。

| 数据 | 存什么 | 拥有者 | 性质 |
| --- | --- | --- | --- |
| Goal 画布 | 各 Goal 节点位置、当前选中、是否打开工作框 | 壳摆放；Goal 事实与工作框归 Goals | 项目工作内容 |
| Frame 构图 | 按 goal_id：相机、Block 引用 + 画布矩形 | Frame 工作面能力 | 项目工作内容，一 Goal 一份 |
| Container 暂存 | 打开的 Frame Tab 顺序、当前 Tab | 壳 | 本机按项目暂存 |
| Item | Goal / Session / Feed / 交付物 / 终端等 | 各目录插件 | 插件事实 |

刷新、桌面重开：先恢复 Goal 画布与各 Goal 的 Frame 构图，再恢复打开中的 Frame Tab。暂存损坏时落到 Goal 画布，Frame 构图仍在。

Frame 构图不写 Artifacts 模块，不写 Goal 事件。具体表结构在实现计划里定，本 spec 只锁语义。

## 插件合同

**资产插件**（Goals / Work / Feed / Artifacts）登记：

- 可出现在目录、可拖进 Frame 的 Item 类型（Goals 的 Goal 除外：Goal 只上主画布）。
- **Goal 卡片表面**：Goals 继续提供现生产节点、原展开工作框；壳管摆放、选中、以及新加的 Frame 按钮。
- **Block 表面**：Frame 给定尺寸，资产插件在块内画可操作 UI；不负责相机、Tab 条、Frame 构图。

**Frame 工作面**登记（合同按插件，第一期内置、无目录 contribution）：

- 接受拖入的 Item 引用，写入该 `goal_id` 的构图。
- 画出 Frame 画布、空态、Block 槽。
- 不读各资产插件的领域库；不拥有 Session / 交付物 / PTY。

**壳层**：

- 拥有 Container Tab 条、拖拽路由、打开集合。Goal 画布 Tab 里仍挂现生产关系图。
- 不拥有 Frame 构图，不读 Goal / Session / Feed / Artifact / PTY 的领域库。
- 打开失败、插件渲染失败：卡片或 Block 就地错误，不拆掉整个容器。

左侧 Directory 仍由各资产插件贡献列表。Frame 不进目录。

## 输入输出与依赖

- 输入：当前 `project_id`、目录点击/拖拽、原展开工作框、Frame 按钮、画布指针手势、项目切换。
- 输出：该项目的 Goal 画布、打开中的 Frame Tab、各 Goal 的 Frame 构图（引用，不是复制的资产）。
- 依赖：现有 Projects 身份、UI Host、Goals / Work / Feed / Artifacts 的 Item 读写。
- 不依赖：新 MCP 工具、OS 多窗 API、把 Goal 迁进 Artifacts、左目录 Frame 模块。

现有 `workbench.main` 整页挂载改为：Container 占主区。`workbench.directory` / `overlay` 保留。

## 文件与模块边界

生产实现等切片锁定后再拆。允许修改的方向：

- `apps/workbench`：Container、Goal 画布、Tab 条、拖拽路由、项目切换恢复。不把 Frame 构图写进壳状态充当局域库。装载插件给出的 Frame 阅读卡，不在壳里重画 Feed/Artifact 整页。
- Frame 工作面：本期落在 Workbench Host 模块（`apps/workbench/src/scripts/client/frame-container.ts`），按 `goal_id` 读写构图与 Frame 画布。无 `workbench.directory` contribution。不把构图写入 Goals / Artifacts 领域库。
- `packages/ui-host` 与 `packages/contracts`：本期不新增 Slot。Frame 阅读卡由各资产插件的 UI 函数产出，Host 只请求并摆放。
- `apps/local-host`：现有项目身份与插件 HTTP；构图仍由 Host 的项目级 localStorage 暂存。
- `plugins/native/goals|work|feed|inbox|artifacts`：资产列表、现生产 Goal 节点与工作框、Frame 阅读卡表面。不在插件内做 Tab 条，Goals 不宿主 Frame 画布。

共享状态仍只由主对话串行改工作台壳层脚本。插件互不改对方 UI。

## 验收标准

| 项 | 通过条件 |
| --- | --- |
| Goal 画布 | 顶栏有钉住的 Goal 画布 Tab；画面是现生产关系图（节点、箭头、「目标关系」），不是对话卡片 |
| 目录 Goal | 点 Goal 只选中主画布卡片，不新开 Tab，不打开工作框 |
| 原展开 | 右上角 maximize 位置、图标、行为不变；打开现有 Goal 工作框 |
| Frame 按钮 | 原展开左侧多一个按钮；点后出现该 Goal 的 Frame Tab，再点聚焦同一 Tab |
| Frame 拖入 | Session / Feed / 交付物可拖进当前 Frame 并成为 Block |
| Block 详情 | 点 Block 展开后能读 Feed 正文、Inbox 处理上下文、Session 执行记录、Artifact 版本；卡片是阅读卡不是插件整页；失败就地显示，不拆掉 Frame |
| Block 拖拽 | 未展开时整张卡（含说明）可拖，位移很小视为点击展开；已展开正文不拖。原 Goal 画布的点选、双击工作框、原展开按钮、Frame 按钮不受影响。 |
| 卡内操作 | 展开卡里没有「查看来源 / 升格 / 开始」等会换掉 Container 的动作；打开原文可以新窗口 |
| 拒绝 | 非 Goal 拖到 Goal 画布被拒绝；Goal 拖进 Frame 被拒绝 |
| 项目隔离 | A 的 Goal 画布与 Frame 不会出现在 B |
| 关 Frame | 构图仍在，Goal 卡片仍在主画布；Session / 交付物不删 |
| 所有权 | 左目录没有 Frame 项；构图不进 Goals / Artifacts 领域库 |
| 外观 | 中英、深浅、现有目录宽度与标题栏行为不回退 |

窄屏：第一期允许单 Tab 条 + 目录抽屉。不得用旧的双窗截图冒充完成。

## 验证命令

```sh
pnpm --filter @molis-ai/molis-work-plugin-goals typecheck
pnpm --filter @molis-ai/molis-work-plugin-feed typecheck
pnpm --filter @molis-ai/molis-work-plugin-artifacts typecheck
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
pnpm --filter @molis-ai/molis-work-design-system typecheck
node --import tsx --test --test-concurrency=1 tests/goals-momentum-ui.test.ts tests/workbench-frame-container.e2e.test.ts tests/graph-home-refinement.e2e.test.ts tests/immersive-workbench.e2e.test.ts tests/goal-canvas-workspace.e2e.test.ts tests/goals-navigation.e2e.test.ts tests/goals-document.e2e.test.ts tests/goals-tree.e2e.test.ts tests/goals-narrow-navigation.e2e.test.ts
```

2026-09-14 等级 3 验证：上列 typecheck 与测试均通过；另跑通 `tests/immersive-directory.e2e.test.ts`、`tests/chrome-inner-scroll.e2e.test.ts`。场景 1–7 由 `tests/workbench-frame-container.e2e.test.ts` 用隔离 Chrome 走完（点 Session / Feed / 交付物进 Block；Goal 拖进 Frame 用合成 drop）。同日用隔离 `--home` 在浏览器走通同一条路径；原生 HTML5 拖拽在 Cursor 浏览器里会变成画布平移，没有带上 DataTransfer。没对用户真实库做手工试用。

2026-09-15 等级 4 验证（阅读卡补完）：上列 typecheck 与定向测试均通过，含 leftover 的 `tests/goals-document.e2e.test.ts` / `tests/goals-tree.e2e.test.ts` / `tests/goals-narrow-navigation.e2e.test.ts`。`tests/workbench-frame-container.e2e.test.ts` 点开后读到 `.frame-reading`：Feed 正文「只验证引用」、无「查看来源 / 升格」操作条、Artifact `example.note`、Session 执行记录、Inbox「你手工加入」。同日用隔离 `--home` 在浏览器看过展开卡（浅色、深色、390 宽）；主区仍是 Container。没对用户真实库做手工试用。

浏览器走通场景 1–7：打开项目 → Goal 画布 Tab → 目录点 Goal 只选中卡片 → maximize 开工作框 → Frame 按钮开 Frame Tab → 拖入/点击 Session·Feed·交付物进 Frame → 拖到画布被拒绝。

切片仍可对照视觉：

```sh
python3 -m http.server 64521 --bind 127.0.0.1 --directory docs/design/workbench-frame-container
```

## 假设与开放问题

已锁定假设：Goal 画布就是现生产关系图；原展开工作框不改；Frame 是额外按钮；一 Goal 一 Frame；点目录 Goal 只选中卡片；非 Goal 只能进 Frame；**容器是壳、Frame 是按 Goal 的工作面能力、目录插件只提供可拖资产并产出阅读卡、Host 只请求并摆放**；点 Block 展开成安静阅读卡（Feed 正文、Inbox 处理上下文、Session 执行记录、Artifact 版本事实），卡内操作不抢走 Container；PTY / 浏览器不进 Frame。

实现时再定、不阻塞当前切片：

- Frame 工作面本期落在 Workbench Host；以后若要可替换实现，沿用同一合同。
- 来源配置页是否永远独占，或改为 overlay。
- 卡片内对话以后要不要加、怎么加；本期不加。
- 终端 / 浏览器进 Frame 的方式，以及是否允许以后再升为顶层 Tab。
- 多 Window 拆分何时回来、默认布局不得再是「左 Frame 右 Terminal」。
- Frame 空态文案。
- 窄屏具体降级手势。

## 与既有 spec 的关系

- `specs/immersive-workbench-implementation/spec.md`：保留左目录、项目首页、插件按项目添加。主区从「插件整页」改为 Container（Goal 画布 Tab + 按 Goal 的 Frame）；原 Goal 工作框仍由 maximize 打开。
- `specs/goal-canvas-workspace/spec.md` 与 Goals 依赖图：工作台 Goal 画布 Tab **就是**这份表面，不另做一套卡片画布。Frame 不是它，也不替换原工作框。
- `specs/goalboard-personal-workbench-shell/spec.md` 中的项目级 Goal 标签：不复活旧的「只有 Goal 的顶部 tabs」。新模型是 **Goal 画布 Tab + 各 Goal 的 Frame Tab**。
- `docs/platform/UI-PLATFORM.md`：Frame 经 Slot/Contribution 挂载 Block，不直接传 Store；资产插件不改宿主导航。
