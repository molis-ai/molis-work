# 网页目录刷新稳定性修复

完成等级：3（功能可用）

## 背景与目标

Molis Work 网页每 4 秒读取一次 Board 事件游标。游标变化后，客户端拉取新的 Goal Tree 与正文，再恢复刷新前的界面状态。

当前存在四条会让用户离开刚选择目录或对象的路径：

1. 刷新请求开始后、响应返回前，用户从 Inbox / Feed 切到 Goals；客户端仍会把请求开始时捕获的旧目录状态重新应用。
2. `/decisions` 页面已经渲染出一个占位 Goal 工作面，导致点击 Goals 只在当前待决定路由内临时切换；该路由的恢复规则随后又把目录和工作面强制设回 Inbox。
3. `/decisions` 的每次状态恢复都把目录、工作面和 Feed preset 固定为 Inbox；用户切到 Feed、来源、Promotion 或可视化工作面后，只要 Board 游标变化就会被抢回 Inbox。
4. 当前 Goal 被其他 Runtime 归档、恢复或移入回收站后，刷新会静默选择集合里的另一条 Goal，却保留旧 URL，造成地址与正文不一致。

此外，首次打开 `/decisions` 且没有已有 `sessionStorage` 状态时，服务端把 `data-desktop-directory` 设为 `feed`，但 Feed 目录面板仍带有 `hidden`，初始化也没有主动同步面板可见性。

当前、归档、回收站还共用同一个 `sessionStorage` key。直接打开集合路由时，可能继承另一个集合的 Feed 或来源工作面，而不是进入对应 Goal 集合。

本修复的目标是：内容更新继续自动出现，但绝不覆盖用户在刷新期间做出的目录、工作面或 Goal 选择；待决定页的 Goals 入口进入真实 Goal 页面；首次进入待决定页即可看到 Inbox；Goal 跨集合移动时继续跟随同一个对象并保持 URL 与正文一致；三个 Goal 集合的恢复状态互不污染。回收站中的 Goal 详情还要沿用普通 Goal 详情的容器、色彩和信息层级，让跨集合后的落点看起来仍是同一个工作台中的 Goal，而不是另一套说明页。

## 当前行为与证据

- `src/web/render.ts#refreshBoard` 在网络请求前调用 `readUiState()`，网络返回后无条件调用 `applyUiState(ui)`。
- `applyUiState` 在 `decisionView` 下固定选择 `directory=feed`、`workSurface=feed`。
- `applyUiState` 在 `decisionView` 下还固定选择 `feedPreset=inbox_message`，因此 Feed、来源和占位工作面都会在游标更新后退出。
- `refreshBoard` 在所选 Goal 离开当前集合后使用 active Goal 或第一条 Goal 作为 `nextSelected`，但不会同步 URL。
- current/archive/trash 路由都读取相同的项目级 UI storage key。
- Goals 点击只有在页面不存在 Goal work surface 时才调用 `restoreLastGoal(true)`；当前 `/decisions` 页面已经包含 Goal work surface，因此不会导航。
- `renderFeedDirectory` 默认输出 `hidden`；无持久状态的初始化分支没有调用 `setDesktopDirectory`。
- 现有 Web 测试只断言轮询和目录状态代码存在，没有覆盖刷新请求期间的用户导航。

## 范围

- 调整 Web 客户端刷新时读取 UI 状态的时机，并防止旧 Goal 响应覆盖刷新期间的新 Goal 选择。
- 调整 `/decisions` 中 Goals 入口，使其恢复最近 Goal 并进入真实 Goal URL。
- 无持久 UI 状态时，显式同步初始目录面板。
- 让 `/decisions` 只在没有可恢复状态的首次进入时默认 Inbox；刷新和重新载入尊重用户最后选择的工作面、Feed preset、来源选择与筛选。
- 所选 Goal 跨 current/archive/trash 集合移动时，导航到同一 Goal 的新 canonical URL，并给出明确提示；禁止回退到无关 Goal。
- 为 current/archive/trash 使用独立 UI storage key；current 只读兼容一次旧 key，避免现有用户丢失主工作台状态。
- 让回收站 Goal 详情复用普通 Goal 的标题工作面、正文工作面、语义 token 和响应式层级；保留回收站状态、原因和恢复动作，不改变领域行为。
- 增加针对上述导航与恢复行为的定向回归测试。

## 非目标

- 不改变 4 秒轮询频率、Board 游标协议或服务端事件模型。
- 不重做 Inbox、Feed、Goals 的信息架构。
- 不修改任何 Goal、InboxEntry 或 FeedItem 数据。
- 不顺带处理与目录刷新无关的视觉或 Connector 问题。
- 不重做普通 Goal、归档 Goal 或整个工作台的视觉系统。

## 方案与关键决策

1. `refreshBoard` 在确定本次请求的 Goal 后保存该 Goal ID；页面响应返回时，如果当前 Goal 已经变化，放弃这份旧响应并安排下一次刷新。
2. UI 状态不再在页面请求之前捕获，而是在所有异步读取完成、DOM 替换开始前读取。此后到 `applyUiState` 之间不再 `await`，因此用户最新目录、工作面、筛选和滚动状态不会被旧快照覆盖。
3. `/decisions` 中点击 Goals 时，无论页面是否存在占位 Goal surface，都调用 `restoreLastGoal(true)`，由真实 `/goals/:goal_id` 路由承载 Goal 工作台。
4. 没有可恢复 UI 状态时，根据服务端写入的 `data-desktop-directory` 主动调用一次 `setDesktopDirectory`；`decisionView` 首次进入时使用 `feed`。
5. `applyUiState` 不再在 `decisionView` 中覆盖已经记录的 `directory`、`workSurface` 和 `feedPreset`；首次默认值仍由无恢复状态的初始化分支决定。来源选择、来源筛选和来源搜索也进入 UI 状态，避免工作面保持但内部位置被重置。
6. 刷新响应落地前检查原 Goal 是否仍属于当前集合。如果它进入 current、archive 或 trash 的另一集合，保存一次性提示并用 `location.replace` 打开同一个 Goal 的新 canonical URL；只有对象在全部集合中都不存在时才回到当前集合根页。
7. current、archive、trash 和 decisions 分别使用 `:current`、`:archive`、`:trash`、`:inbox` storage key。旧的无后缀 key 只作为 current 的兼容读取来源。
8. 回收站 Goal 详情复用普通 Goal 的两层内容结构：标题/状态与正文工作面使用现有 `Goal Canvas`、`Navigator Gray`、`Quiet Line` 和按钮 token；宽屏保持清晰的状态与恢复分组，窄屏按单列堆叠且操作目标不小于 44px。

## 输入、输出与依赖

- 输入：Board 游标变化、刷新期间的用户目录/Goal 选择、当前路由、项目级 `sessionStorage` UI 状态。
- 输出：最新 Board 内容，以及保持不变的用户当前导航选择。
- 依赖：现有 `/api/board/cursor`、`/api/board/refresh`、`readUiState/applyUiState`、`restoreLastGoal`。
- 修改边界：`src/web/render.ts`、`tests/web.test.ts` 与本 spec。

## 验收标准

1. 用户在 Board 刷新请求期间切到 Goals、Inbox、Feed、来源、Promotion 或可视化，响应落地后仍停留在最后一次用户选择。
2. 用户在刷新请求期间选择另一条 Goal，旧 Goal 响应不会覆盖新 Goal；后续刷新仍能取得最新数据。
3. 从 `/decisions` 选择 Goals 会进入最近可用 Goal 的真实 URL，不在待决定路由内显示占位 Goal 工作面。
4. 首次打开 `/decisions`、没有已存 UI 状态时，Inbox 目录可见。
5. 正常 Board 数据更新仍会刷新 Goal Tree 与当前 Goal 内容。
6. `/decisions` 从 Feed 或来源经历真实游标更新后仍保留当前工作面；Feed 不变回 Inbox，来源选择与筛选不被重置。
7. current Goal 被移入归档或回收站、archive/trash Goal 被恢复时，页面打开同一 Goal 的新 canonical URL，并展示移动提示；不得显示无关 Goal，也不得留下旧 URL。
8. current、archive、trash 的恢复状态相互独立；直接进入某个集合不会继承另一个集合的 Feed 或来源工作面。
9. 回收站 Goal 详情在明暗主题和窄屏下与普通 Goal 详情属于同一视觉系统；状态、移入原因、原始目标和恢复动作均清晰可见，没有横向溢出。

## 验证

- `pnpm typecheck`
- 定向运行包含 Web workbench 断言的 `tests/web.test.ts`
- 实际网页版验证：使用隔离临时数据库触发真实游标更新，检查 decisions 的 Feed/来源、普通 Goal 的 Feed/来源、Goal 跨集合移动、三个集合的独立恢复状态，以及回收站 Goal 详情的明暗主题和窄屏布局。

## 假设与开放问题

- 本修复以当前单线程浏览器事件循环为前提：最后一次异步响应完成后，到读取 UI 状态和同步替换 DOM 之间没有新的 `await`。
- 如果后续把 DOM 更新拆成异步分段，需要引入显式 navigation revision；当前最小修复不提前增加这一机制。
