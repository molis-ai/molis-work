# 来源、Feed 与 Inbox 可交互高保真切片

Molis Work Goal：`draft-8f160677-f8f8-4f2b-935d-0881edb3aba3`

## 背景与目标

当前产品把 Inbox 和 Feed 作为同一 Item Workbench 的类型预设，并把“来源与连接”的主要管理路径放在大 Dialog 中。用户能完成局部动作，却很难形成稳定心智模型：来源到底管理什么、哪些内容属于完整消息流、为什么某些内容需要进入 Inbox。

本 Work Item 交付一个小而真的高保真切片，让用户在桌面和约 `720×820` 窄屏中走完：

`来源（接入与拉取） → Feed（全部消息事实流） → Inbox（只保留需介入引用） → 处理完成`

完成等级：**2 · 可交互原型**。这一轮只验证信息架构、内容表达、关键状态和交互路径；真实 GitHub、Gmail、RSS 拉取、OAuth、后台调度和正式数据迁移由后续 Goal 承担。

## 当前行为与问题证据

- 根目录中的“来源与连接”通过 `data-feed-sources-open` 打开大 Dialog，不是可以连续浏览的目录—详情工作台。
- Inbox / Feed 复用同一套 `FeedItemType`，主要差异是预设和归档文案，Feed Item 加入 Inbox 的对象关系不可见。
- Inbox 同时承载外部消息和 Molis Work 决定，但列表没有优先解释“为什么现在需要我处理”与“下一步是什么”。
- 窄屏已有目录 / 列表 / 详情分层基础，但来源管理仍是 Dialog，无法验证同一关键路径。

## 保留、替换、忽略

### 保留

- 现有单目录 Project-Tab Workbench、项目切换、Goal Tree、Goal 详情与 Runtime 行为。
- Goal 目录已经验证的紧凑行、原位下钻、桌面目录与详情并列、窄屏逐层推进模式。
- 现有颜色、字体、Icon 与 Light / Dark token；Feed 外部内容继续标明为不可信数据。
- 当前真实 `view.feed.sources` / `view.feed.items` 作为首选展示内容，现有 Feed 动作和 Source API 不删除。

### 替换

- “来源与连接”根入口改为直接进入来源目录；大 Dialog 降为“添加来源 / 连接账号 / 迁移 Relay”的次级动作。
- Feed 文案和动作改为“全部来源消息事实流”；对 Feed Item 提供可见的“加入 Inbox / 保存资料 / 升格 Goal / 忽略”去向。
- Inbox 列表优先显示进入原因、关联对象、当前状态和真实下一步；处理完成后立即退出默认待处理列表。
- 窄屏把来源目录、来源详情、Feed 详情、Inbox 详情都放入同一层级导航，不横向挤压三栏。

### 忽略 / 非目标

- 不改 Source / FeedItem 的正式数据库模型，不实现 InboxEntry 持久化模型。
- 不发起真实 GitHub、Gmail、RSS 授权、同步或外部写入；原型调度与同步结果明确标为模拟。
- 不重做来源、Feed、Inbox 之外的产品视觉，不改变 Goal 权威状态机。
- 不宣称达到内部完整或可发布等级。

## 用户路径与代表状态

1. 用户从根目录进入“来源”，在紧凑目录中搜索或按账号 / 公开 Feed、连接状态筛选来源。
2. 选择 GitHub、Gmail 或 RSS 来源后，右侧显示概览、配置、拉取计划、来源消息、运行状态五个区域；用户可以切换定时拉取并运行一次模拟同步。
3. 用户进入 Feed，看到 GitHub、Gmail、RSS 等消息在同一事实流中；选择一条消息后将其加入 Inbox，并能看见“已进入 Inbox”的去向。
4. 用户进入 Inbox，看到 Feed 消息、Goal 决定、来源故障三种条目，以及各自的进入原因和下一步；完成其中一项后，该项退出默认列表并显示完成反馈。
5. 窄屏按照“目录 → 当前列表 → 详情”逐层推进，详情页有明确返回路径；关键动作可完成且没有横向溢出。

必须覆盖的状态：来源正常、来源需重新授权、同步中、模拟调度已保存、Feed 无匹配结果、Inbox 空状态、Inbox 处理完成。

## 方案与关键决策

- 采用 Operate 型高密度工作台，不增加第二条常驻侧栏，不使用 Dashboard 卡片墙。
- 来源列表与 Feed / Inbox 列表共用目录行语法；详情通过右侧工作面呈现，不把来源管理继续塞进 Modal。
- 原型在 DOM 中使用当前真实记录并补充脱敏演示记录，补充内容必须带 `演示` / `模拟` 标记，且所有动作只改变本页状态。
- Feed → Inbox 在本 Work Item 中是可见的页面内引用关系；不伪装成生产数据库已完成正式 `InboxEntry` 写入。
- Inbox 完成动作从默认列表隐藏条目，但保留页面内“最近完成”反馈和原对象可追溯信息。
- 在 `760px` 及以下复用现有 Companion 导航：根目录进入来源 / Feed / Inbox 后先显示列表，选择后进入详情；返回按钮回到当前列表。

## 文件与模块边界

- `src/web/render.ts`：来源目录 / 详情、Feed 与 Inbox 语义和交互、原型演示数据、窄屏导航状态。
- `src/web/visual-foundation.ts`：工作台布局、列表与详情视觉、关键状态、窄屏断点。
- `src/web/i18n.ts`：新增界面文案。
- `tests/web.test.ts`、`tests/desktop-tui.test.ts`：DOM 契约、行为边界和响应式结构回归。
- `.impeccable/surfaces/src-web-render-ts.md`、`DESIGN.md`：验收后只记录已经实现并验证的结构决定。

不修改 Feed Provider、数据库迁移、Connector auth 或后台调度模块。

## 验收标准

1. `hifi-source-workspace`：来源是可直接进入的目录—详情工作台；列表显示类型、状态、上次 / 下次拉取，详情包含概览、配置、拉取计划、来源消息、运行状态。
2. `hifi-feed-workspace`：Feed 同时呈现 GitHub、Gmail、RSS 代表消息；详情保留来源与时间，提供加入 Inbox、保存资料、升格 Goal、忽略，并显示当前去向。
3. `hifi-inbox-workspace`：Inbox 至少呈现 Feed 引用、Goal 决定、来源故障三种代表条目；每条解释进入原因和下一步；处理完成后退出默认列表。
4. `hifi-responsive-flow`：桌面保持目录和详情并列；约 `720×820` 下按目录 → 列表 → 详情推进，来源配置、Feed 加入 Inbox、Inbox 完成都可操作，无横向溢出。
5. `hifi-states-and-honesty`：断开 / 失败、同步中、Feed 空筛选、Inbox 空状态和处理完成可演示；授权、同步、调度和处理都明确为模拟，不产生外部写入。
6. `hifi-object-boundaries`：由一骏实际走完原型后确认来源、Feed、Inbox 三者职责和数据去向不再混淆；Runtime 不替代这一产品判断。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/web.test.ts tests/desktop-tui.test.ts`
- 浏览器：桌面 `1440×900` 与窄屏约 `720×820`，覆盖来源详情 / 模拟同步、Feed 加入 Inbox、Inbox 完成、空状态与横向溢出。
- 输出截图和可复现交互步骤；记录本轮所有模拟边界。

## 假设与开放问题

- 现有 Source / FeedItem 真实数据不足时，使用脱敏演示记录补齐 GitHub、Gmail、RSS 与异常状态；演示记录不会写回数据库。
- Inbox 的正式引用模型、规则命中与跨重启恢复属于后续数据契约与实现 Goal；本 Work Item 只验证用户能否理解和使用该关系。
- 最终 `hifi-object-boundaries` 需要一骏确认；其他检查项由 DOM、交互和截图证据复核。
