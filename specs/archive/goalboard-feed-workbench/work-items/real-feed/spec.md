# 统一真实 Feed 工作台

Molis Work Goal：`goal-infoflow-real-feed`

完成等级：4（Feed 工作台达到内部完整；GitHub、Gmail、RSS 的真实外部账号 smoke test 仍由各 Provider Goal 验收）

## 背景与目标

Feed 是所有来源消息的完整事实流。当前数据层已经统一写入 `feed_items`，但 Web 仍沿用早期 Inbox/Feed 兼容投影：进入 Inbox 的消息会从 Feed 目录消失，生产项目缺少真实“加入 Inbox”动作，筛选也没有覆盖消息类型和时间。

本 Work Item 把 Feed 切到 canonical `feed_items`，让消息无论被分流到哪里都继续留在 Feed，并把阅读、筛选、去向动作、错误恢复和窄屏路径接到真实持久化行为。

## 当前问题证据

- `src/web/render.ts#feedDirectoryEntries` 读取兼容字段 `view.feed.items`，有活跃 InboxEntry 的消息会被改写成 `inbox_message`，因此不再出现在 Feed。
- 真实 Feed 详情只有开始处理、升格 Goal、保存、忽略，没有与高保真一致的“加入 Inbox”。
- `/api/feed/items/:id/*` 已有 revision 冲突控制，但 `restore` 对 Feed 一律恢复成 `inbox`，没有“回到仅保留在 Feed”的状态。
- 目录只有来源、状态和排序；缺少类型与时间筛选。
- 外部文本已 HTML 转义、外链已限制为 HTTP(S)，但缺少针对恶意富文本、异常 URL 和空内容的验收测试。

## 范围

### 包含

- Feed 始终从 canonical `feed_items` 渲染，进入 Inbox、保存资料、升格 Goal 或忽略后仍可在相应状态筛选中追溯。
- 标题/摘要/来源搜索；来源、Provider/消息类型、时间和去向状态筛选；时间/来源/标题排序。
- 详情显示来源、时间、作者、正文或摘要、材料、原链接和当前去向。
- “加入 Inbox”“保存为资料”“升格 Goal”“忽略”四种真实、幂等、带 revision 冲突恢复的动作。
- 加入 Inbox 只建立 `InboxEntry` 引用；忽略和恢复不会破坏原始 FeedItem 或来源引用。
- 外部内容始终 HTML 转义，外链只允许 HTTP(S)，Runtime 上下文继续包裹为不可信数据并脱敏。
- 桌面与 760px 以下目录 → 列表 → 详情路径，以及首次、空、筛选无结果、加载中、加载失败、动作失败和恢复反馈。

### 不包含

- GitHub、Gmail、RSS 的新联网或 OAuth 能力。
- Inbox 对 Goal 决定、来源故障和 Feed 引用的完整处理工作台；由 `goal-infoflow-attention-inbox` 验收。
- AI 自动摘要、分类或优先级。
- 外部发布运维。

## 方案与关键决定

### 1. Feed 与 Inbox 的显示所有权

- Feed 目录只读 `FeedSnapshot.feed_items`；这是所有来源消息的 canonical 集合。
- Inbox 兼容目录继续从 `InboxEntry` 和内部决定派生，但同一 FeedItem 的 Inbox 行使用独立 UI entry id，并保留 canonical item id 供详情和动作 API 使用。
- `FeedItem.disposition` 只表达用户当前去向；它不决定这条外部事实是否还属于 Feed。

### 2. 去向动作

- `inbox`：幂等创建/恢复一个 active InboxEntry，并把 disposition 设为 `inbox`。
- `saved`：保留完整 FeedItem 与已有材料，把 disposition 设为 `saved`。
- `promote`：复用现有 Goal 创建与 input binding，重复操作返回同一个 Goal。
- `archive`（界面文案“忽略”）：只退出默认 Feed 状态，原数据、来源和历史仍可筛选追溯。
- `restore`：Feed 中恢复为仅保留在 Feed 的中性状态，不能错误地自动加入 Inbox。
- 现有版本化契约把 `disposition='inbox'` 作为最初的未分流值；是否真的占用 Inbox 由 active `InboxEntry` 决定。因此本 Work Item 不追加另一轮表迁移，而是在 Feed 侧把“`inbox` 且无 active 引用”解释为“仅 Feed”，把“`inbox` 且有 active 引用”解释为“已加入 Inbox”。这保留已验收的迁移 28 边界。

### 3. 查询与安全呈现

- 浏览器端对已加载的本地 Feed 做组合筛选：来源、Provider/消息类型、时间窗口、状态和关键词；不引入新服务端索引或远程查询。
- 列表只展示转义后的纯文本摘要；详情正文和材料正文也按纯文本呈现。
- `javascript:`、`data:`、畸形 URL 不渲染成可点击链接；HTTP(S) 外链带 `target=_blank` 与 `rel=noreferrer`。
- Feed 到 Runtime 的上下文继续使用明确的不可信边界和秘密脱敏。

### 4. 交互与恢复

- 真实动作在当前详情显示 pending、成功或错误；成功后刷新 canonical 状态，revision 冲突提示刷新后重试。
- 加载列表不读取完整正文；选中真实 Item 才请求详情。
- 窄屏维持目录 → 列表 → 详情逐层推进，返回路径与当前筛选状态保留。

## 输入、输出与模块边界

输入：迁移 28 后的 `FeedItem / InboxEntry` 契约、来源运行底座、现有 Goal promotion 与 Runtime context 绑定。

输出：统一保存、阅读、筛选和真实分流来源消息的 Feed 工作台。

- `src/feed/store.ts`：幂等状态转换、恢复到仅 Feed 与 Inbox 引用。
- `src/web/server.ts`：Feed 动作 API。
- `src/web/render.ts`：canonical Feed 目录、真实详情、组合筛选与动作反馈。
- `src/web/visual-foundation.ts`：筛选、去向反馈和响应式样式。
- `tests/feed.test.ts` / `tests/web.test.ts` / `tests/desktop-tui.test.ts`：持久化、API、UI、安全与恢复回归。

## 验收标准

- [x] Feed 始终包含 GitHub、Gmail、RSS 等来源的 canonical FeedItem；加入 Inbox 后仍留在 Feed 且可回到原来源。
- [x] 标题/摘要/来源搜索，以及来源、类型、时间、状态筛选真实可组合；桌面和窄屏无横向溢出。
- [x] 加入 Inbox、保存资料、升格 Goal、忽略四种动作真实持久化、重复幂等，失败或 revision 冲突可恢复。
- [x] 加入 Inbox 只产生引用；保存/升格/忽略不复制正文，也不破坏来源、外部身份或材料。
- [x] 外部标题、正文、富文本和链接不能注入页面或 Runtime 指令；空、异常内容有稳定降级。
- [x] 类型检查、构建、受影响测试和浏览器桌面/窄屏检查通过；非本 Goal 的已知失败单独记录。

## 验证命令

```bash
CI=true pnpm typecheck
node --import tsx --test tests/feed-contract.test.ts tests/feed.test.ts tests/feed-sources.test.ts tests/feed-connectors.test.ts tests/feed-security.test.ts tests/web.test.ts tests/desktop-tui.test.ts
CI=true pnpm build
git diff --check
```

浏览器验证：真实 Feed 列表与懒加载详情、五类组合筛选、四种去向、状态刷新、空/无结果/加载/错误恢复，以及桌面与 390px 窄屏。

## 假设与开放问题

- V1 数据规模允许浏览器端组合筛选；大规模分页和全文索引留待真实使用数据证明需要后再做。
- “保存为资料”当前表示把 FeedItem 标记为长期资料并保留其已有 `FeedMaterial`，不额外复制一份正文。
- Inbox 的四类引用与处理完成体验由下一个 Inbox Goal 补齐；本 Work Item 只保证手工加入引用的写入和 Feed 侧可追溯。

## 验证结果（2026-08-30）

- 类型检查、正式构建、108 个受影响测试与 `git diff --check` 通过。
- 真实项目浏览器验证覆盖 195 条 FeedItem、RSS/Gmail/GitHub 内容、五组组合筛选、桌面/窄屏、空态、加载态、断服失败与重试恢复；详见 `.impeccable/review/real-feed-qa.md`。
- 完整套件 335/336；唯一失败是本任务开始前已存在且属于后续内部整合 Goal 的英文静态文案词典缺口。没有用该失败宣称“全量测试通过”。
