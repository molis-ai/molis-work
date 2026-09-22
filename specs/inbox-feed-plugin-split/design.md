# Inbox / Feed 拆插件：具体设计

对应 `spec.md`。2026-09-14 对齐后锁定。切片 6 完成。完成等级目标仍是 3 功能可用。

数据层已经分开：`feed_items` 是事实，`inbox_entries`（Attention Module）是注意力。这次拆的是产品入口和所有权，再加 Feed out 规则出 Artifact。不为旧 preset 留双轨。

## 锁定默认

- `source_rule`（来源认为需要你处理）和 out 规则（用户捕捉）互不压制。一条消息可以同时进 Inbox 和 Artifacts。成功出 Artifact 只保证不因这次成功再写一条 Inbox。
- Goal 待判断：一个 Goal 一行。
- 第一期 Inbox 详情不内嵌 Goal 决定表单，点关联对象跳到 Goals。
- Artifact 类型：`io.molis.work.feed.capture` schema 1。
- 插件条顺序：Goals · Sessions · Inbox · Feed · Artifacts。Inbox 在 Feed 前。
- 加 Feed 必须同时加 Inbox。Inbox 可单独加。已启用 Feed 的项目在目录迁移时写入 Inbox。
- 新项目仍只带 Goals。

## 所有权

| 对象 | 拥有者 | 做什么 | 不做什么 |
| --- | --- | --- | --- |
| Feed Item / Material / 来源 | Feed Module + Feed Plugin | 拉取、流水、忽略/保存、升格 Goal、out 规则 | 不画 Inbox，不拥有 Artifact 表 |
| Attention 条目 | Attention Module + Inbox Plugin | 原因、关联、下一步、完成/忽略 | 不复制 Feed/Goal 正文 |
| Artifact | Artifacts Module；Feed Plugin 当生产者 | 精确版本 | Feed Module 不 `registerVersion` |
| Goal 待判断 | Goals 投 Attention | 决定仍在 Goals 完成 | 工作台不再把决定/结果投影成 Feed 行 |

壳只挂两个插件入口。Inbox 不读 Feed 表；Feed 不读 Goals 表。跨插件只走公开 Command / Event。

## 切片 1：壳

交付：`inbox` 成为内置插件 id；市场有 Inbox 卡；启用 Feed 时带上 Inbox；插件条和根目录出现 Inbox；点开独立表面（本切片是空态占位，真实 Attention 列表在切片 2）。

- 目录 schema 升到 12：`project_plugins` 允许 `inbox`；已有 Feed 的项目写入 Inbox。
- `ProjectService.addPlugin("feed")` 在同一事务加入 Inbox；重复添加不写重复事件。
- Feed 内部三按钮去掉 Inbox，只留 Feed | 来源。
- 不在本切片实现 out 规则、Goals 投递、删除 `inbox_message` 写入。

## 切片 2：Inbox 只读 Attention

交付：Inbox 插件目录列出 Attention 条目；详情只展示原因、关联对象、下一步；完成/忽略走 Attention `setStatus`，不删除原对象。订阅设置 UI 不做。

- 新包 `plugins/native/inbox`：UI contribution、投影、`GET /api/inbox` 与 `POST /api/inbox/entries/:id/status`。
- Workbench 用独立 `data-inbox-*` 表面替换空态占位；不复用 `data-feed-directory`。
- Host 新增 `inbox-native-plugin-http.ts`；Feed route table 不再匹配 `/api/inbox`。
- 默认只显示 `open` / `in_progress`；历史筛选可看 `done` / `dismissed`。
- 关联对象：Feed Item 走现有 `data-inbox-open-feed`；来源故障走 `data-open-source-record`；Goal 决定跳 Goals，不内嵌表单。

## 切片 3：Feed 去掉 Inbox 面

交付：打开 Feed 只看到 Feed Item。`POST /api/feed/items/:id/inbox` 只创建或重开 Attention，不改 `feed_items.disposition`。有 Attention 的行不再被投影成 `item_type: inbox_message`。

- Feed 目录不再合并 Attention / 来源故障行；演示数据只留 Feed 示例。
- Feed 工作台不再叫 Inbox，不再接受 `preset=inbox_message` 作为产品面。
- `snapshot.items` / `getItem` 保持 `item_type: feed`。`feedItemTypeForSource` 不再写出 `inbox_message`；账号来源仍可用 `sourceKindOpensAttention` 投 `source_rule`。
- 列值 `disposition=inbox` 仍表示「在流水里」（restore 也写回这个值）。加入 Inbox 不再把它当成和 archived 同级的去向。
- `/decisions` 仍暂时把 Goal 决定表单挂在 Feed 工作台（补充行改标 preset=feed），避免本切片拆掉提案确认。切片 4 再删这些行、改由 Goals 投 Attention。

不做：Goals 开始写 Attention、Out 规则、改 disposition CHECK、删 `item_type` 列兼容、改剩余 DESIGN「Feed owns Inbox」。

## 切片 4：Goals 待判断写 Attention

交付：Goal 待判断由 Goals 投 Attention（一 Goal 一行）；工作台不再把决定/结果投影成 Feed 目录行。Goal 待判断只出现在 Inbox，不出现在 Feed。Inbox 详情不内嵌表单；点「打开 Goal」到 Goal 文档完成判断。

- Goals 在提交提案后 ensure `subject_type: goal_decision`；该 Goal 不再有待判断时把对应 Attention 标 `done`。UNIQUE `(board_id, subject_type, subject_id, reason)` 自然一 Goal 一行。
- 已 `done` 的 Goal 再出现待判断时重开；用户 `dismissed` 的条目在新提交时重开，历史 reconcile 不擅自重开 dismissed。
- 打开工作台时 reconcile 一次，补上历史已 pending 但还没有 Attention 的 Goal。
- 删除 `feedNativePluginSupplementalEntries`（`decision:` / `result:` 行）。提案表单改挂在所属 Goal 文档。
- `/decisions` 改为打开 Inbox，不再把 Feed 当决定面。旧锚点 `#decision-goal-{id}` 跳到 `/goals/{id}`。
- Inbox 第一期仍不内嵌决定表单。

不做：Out 规则、改 disposition CHECK、删 `item_type` 列兼容、改剩余 DESIGN「Feed owns Inbox」、来源拆插件、Inbox 内嵌 Goal 表单。

## 切片 5：Out 规则出 Artifact

交付：Out 规则 CRUD；规则生效之后**新写入或更新**的 Feed Item 求值；命中后 Feed Plugin 作为生产者调用 `artifacts.commands.registerVersion`，立刻留下精确版本。成功不因这次成功再写 Inbox；规则命中但 Command 失败则进 Inbox。新规则不回刷历史。

### 求值时机

- 只在 `FeedApplication.ingestItem` 返回且 Module 报 `created || updated` 之后，由 Plugin 求值。
- `upsertImportedItem`（历史迁入）不求值，避免把导入当成回刷。
- 创建规则时不扫 `feed_items`。已有 Item 即使之后被无更新地重拉（`created: false, updated: false`）也不造 Artifact。
- 不把 out 规则或 `registerVersion` 塞进 `modules/feed`。

### 规则存储

- 规则是 Feed Plugin 产品状态，自管表 `feed_out_rules`，不进 `migrateFeed`。
- `migrateFeedOutRules(db)` 放在 `plugins/native/feed`，由 `createLocalFeedApplication` 和 Host `migrateFeedTables` 调用。
- 字段：`board_id`, `rule_id`, `name`, `enabled`, `match_json`, `created_at`, `updated_at`。
- 第一期匹配：`contains`（标题 / 摘要 / tags / 正文，大小写不敏感）+ 可选 `source_id` / `source_kind`。条件之间 AND。空 contains 且无来源过滤拒绝创建。
- 停用的规则不求值。新规则不回刷。

### Artifact 生产

- 类型：`io.molis.work.feed.capture` schema 1。payload：标题、摘要、来源、原文 URL、时间、tags、材料引用（id / URL / 标题）。
- `artifact_id`：`feed-capture:${item_id}:${rule_id}`。
- 生产者：`plugin_id: io.molis.work.native.feed`，`plugin_version: 0.0.0`，`binding_signature: native:feed`。
- 同 id + version 且 envelope 相同 → replay，不新建 lineage；内容变了 `latest + 1`。
- Feed Plugin 只依赖 contracts 里的 Artifacts 类型。Host 注入 `registerVersion` / `latestArtifactVersion`，不让 Plugin import `@molis-ai/molis-work-module-artifacts`。
- ingest 主路径已提交后才求值；求值失败不得抛回同步，改为写 Attention。

### 失败进 Inbox

- 新 Attention reason：`artifact_out_failed`，`subject_type: feed_item`。与 `source_rule` UNIQUE 分离，两者可并存。
- Contract + SQL CHECK 一起扩展。已有库重建 `inbox_entries` CHECK（复制行，不丢数据）。
- 同一 Item 多条规则失败共用一行 Attention，detail 记 `rule_ids` / `error_codes`，不复制正文。
- 成功出 Artifact 不写 Inbox。这次求值命中的规则全部成功，则把该 Item 上 open/in_progress 的 `artifact_out_failed` 标 `done`；不擅自重开用户 `dismissed` 的成功路径。新的失败会重开 `done` 或 `dismissed`。
- `create()` 对已存在行不重开，失败重开必须 `setStatus(..., "open")`。

### HTTP / UI

- `GET/POST /api/feed/out-rules`，`PATCH/DELETE /api/feed/out-rules/:id`。
- UI 挂来源对话框：一小块「捕捉到 Artifacts」列表 + 名称/包含关键字的创建表单。不做规则引擎编辑器，不加插件条。

### 不做

来源拆插件、Inbox 内嵌表单、改 disposition CHECK、删 `item_type` 列兼容、改剩余 DESIGN「Feed owns Inbox」、类型市场、回刷历史、切片 6。

## 切片 6：删兼容路径

交付：仓库里不再有合并工作台所需的 `feedPreset=inbox_message` 产品路径（测试与 UI）；`FeedSnapshot` 不再带合并投影 `items`；现行 DESIGN 取消「Inbox 是 Feed preset / Inbox Message 行」。

### 产品面

- `FeedUiPreset` / `FeedItemType` 只剩 `"feed"`。HTTP `GET /api/feed/workbench` 只接受缺省或 `preset=feed`；`preset=inbox_message` 返回 400。
- 客户端不再保存 `feedPresetState.inbox_message`。读到旧 localStorage 时忽略该键，不把它当 Inbox 入口，也不把旧 `feedPreset=inbox_message` 改写成 Inbox 插件。
- `data-feed-preset="feed"` 可以留在目录按钮上，只表示 Feed 表面，不再是双预设开关。
- 工作台目录读 `view.feed.feed_items`。目录快照 redact `feed_items` 的正文。

### 删合并投影

- 删 `FeedSnapshot.items`。`snapshot()`、`hydrateFeedSnapshotContent`、`web-view` 与测试改读 `feed_items`。
- 这就是 spec 说的删 `projection.items`。不改 `modules/feed` owner。

### 故意留下的数据层兼容

- `disposition=inbox` 仍表示「在流水里」。不改 disposition CHECK。
- `feed_items.item_type` CHECK 仍含 `'inbox_message'`；新产品写入已是 `feed`。不删列、不重建表。
- `migrateInfoflowContractV2` 仍把历史 `inbox_message` 行改成 `feed` 并补 Attention。契约测试可以继续用 `inbox_message` 当**迁移输入**，不得当产品面。
- Feed Module `markRead(..., expectedItemType?)` 签名保留；产品层只传 `"feed"`。

### 文档

- `DESIGN.md`：Inbox 与 Feed 是并列插件；Goal 待判断在 Inbox / Goal 文档，不再写成 Feed 里的 `Inbox Message` 行；Feed 工作台不再与 Inbox 共用同一套 preset。
- `docs/system/MIGRATION.md` 补一句：产品面不再有 `feedPreset=inbox_message`。
- 不改历史 spec（`specs/goalboard-feed-workbench/**`）。

### 不做

来源拆插件、Inbox 内嵌表单、改 disposition CHECK、删 `item_type` 列、改 Feed Module owner、回刷历史、把 Frame / immersive 未提交改动搅进来。

## 后续切片

无。本切片收口兼容路径后，拆插件主链完成。

## 验证（切片 1）

已跑：

```sh
node --import tsx --test tests/project-plugins.test.ts tests/i18n.test.ts
node --import tsx --test --test-concurrency=1 tests/immersive-workbench.e2e.test.ts tests/chrome-inner-scroll.e2e.test.ts tests/immersive-directory.e2e.test.ts
node --import tsx --test --test-name-pattern "Sources mutation" tests/goals-navigation.e2e.test.ts
```

目录有 Inbox 入口、市场加 Feed 会同时启用 Inbox、插件条能打开 Inbox 空态、Feed 内只剩 Feed | 来源。`tests/goals-narrow-navigation.e2e.test.ts` 仍按旧个人工作台几何断言，切片 1 未改它的主路径。

## 验证（切片 2）

```sh
pnpm boundary:check
node --import tsx --test tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts tests/feed-native-plugin.test.ts tests/i18n.test.ts tests/project-plugins.test.ts
```

Inbox 目录列出 Attention（默认不含 done）、详情有原因/关联/下一步且不复制正文、完成/忽略走 `/api/inbox/entries/:id/status` 且原 Feed Item 仍在。Feed 旧 Inbox 面本切片不删。`pnpm boundary:check` 现为 39 个 workspace 包。

## 验证（切片 3）

```sh
pnpm --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host build
pnpm boundary:check
node --import tsx --test tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts tests/feed-native-plugin.test.ts tests/feed.test.ts tests/feed-contract.test.ts tests/feed-connectors.test.ts tests/i18n.test.ts tests/project-plugins.test.ts tests/feed-goal-promotion.test.ts
node --import tsx --test --test-name-pattern "Feed Item actions|Inbox Message save and start" tests/desktop-tui.test.ts
node --import tsx --test --test-concurrency=1 tests/goals-proposal.e2e.test.ts
```

通过：Feed 目录不再出现 `inbox_message` 行；加入 Inbox 只写 Attention、不改 disposition；`snapshot.items` / `getItem` 保持 `item_type: feed`；`/decisions` 补充行仍在 Feed 工作台且提案确认可点 `data-feed-entry-id="decision:browser-adopt-root"`。

未作为本切片回归：`tests/desktop-tui.test.ts` 整文件里「Web and Desktop share one project workbench」仍按旧 `workspace is-desktop-tui` 断言，以及若干 PTY spawn；`tests/immersive-workbench.e2e.test.ts` 当前失败点在 Goal Frame / 画布导航，不在 Feed Inbox 面。

## 验证（切片 4）

已跑：

```sh
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host build
pnpm boundary:check
node --import tsx --test tests/goal-decision-attention.test.ts tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts tests/feed-native-plugin.test.ts tests/i18n.test.ts
node --import tsx --test --test-concurrency=1 tests/goals-proposal.e2e.test.ts
```

通过：提交提案写一条 `goal_decision` Attention，同一 Goal 再提交仍一行；决定后标 done，新提交从 done 重开；dismissed 后 reconcile 不重开，新提交才重开；历史 pending 无行时 reconcile 补回。Goal 待判断出现在 Inbox 和所属 Goal 文档，不出现在 Feed 目录。`/decisions` 打开 Inbox，无 TUI，无 `decision:` Feed 行。提案确认 e2e 在 Goal 文档上完成采用/退回。

未作为本切片回归：`tests/desktop-tui.test.ts`「Web and Desktop share one project workbench」仍卡在旧 `class="workspace is-desktop-tui"`（现为 `immersive-workspace`），与切片 4 无关。`tests/goal-event-http.test.ts` 冲突预填已改打 `/goals/{child}`，该条通过。

## 验证（切片 5）

已跑：

```sh
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-module-attention-resumption --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host build
pnpm boundary:check
node --import tsx --test tests/feed-out-rules.test.ts tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts tests/feed-native-plugin.test.ts tests/i18n.test.ts tests/feed-goal-promotion.test.ts tests/goal-decision-attention.test.ts tests/feed.test.ts tests/feed-contract.test.ts
```

通过：命中 out 规则后立刻有 `io.molis.work.feed.capture` 精确版本，成功不写 Inbox；同 envelope 重拉不新建 lineage，内容变了升 version；新规则不回刷历史；`registerVersion` 失败写 `artifact_out_failed` 且 Feed Item 仍在；`source_rule` 与成功捕捉可并存；空匹配拒绝创建；停用规则不捕捉；旧库 CHECK 可迁到新 reason。HTTP `GET/POST/PATCH/DELETE /api/feed/out-rules` 可用。来源对话框有「捕捉到 Artifacts」表单。`pnpm boundary:check` 仍为 39 个 workspace 包。

未跑：真实浏览器走来源对话框 → 同步命中 → Artifacts / Inbox。`tests/session-web.test.ts` 根目录仍断言「来源」入口（切片 1 起已不在根目录），与本切片无关。

## 验证（切片 6）

已跑：

```sh
pnpm --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host build
pnpm boundary:check
node --import tsx --test tests/feed-native-plugin.test.ts tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts tests/feed.test.ts tests/feed-contract.test.ts tests/feed-connectors.test.ts tests/feed-sources.test.ts tests/i18n.test.ts tests/project-plugins.test.ts tests/session-web.test.ts
node --import tsx --test --test-name-pattern "Inbox Message save and start" tests/desktop-tui.test.ts
```

通过：`GET /api/feed/workbench?preset=inbox_message` 返回 400，缺省 preset 渲染 Feed；`FeedSnapshot` 没有 `items`；客户端不再读写 `feedPresetState.inbox_message`；测试与 UI 不再把 `inbox_message` 当产品面；根目录断言改为 Inbox / Goals / Sessions / Feed / Artifacts。`pnpm boundary:check` 仍为 39 个 workspace 包。

浏览器走查（2026-09-15，临时项目「拆插件验收」，`?desktop=1`）：根目录分别进入 Inbox / Feed / Artifacts；插件条为 Goals · Inbox · Feed · Artifacts（该项目未加 Sessions）。Inbox 待处理只有「授权即将过期 / 来源规则命中」，没有成功捕捉的 launch 条目；行上有 `data-inbox-reason=source_rule` 与关联 `feed_item`。Feed 内视图只有 Feed | 来源，三条事实都在流水里。来源从 Feed 进入，网页查询「launch coverage」已连接、已拉取 3 条。Artifacts 目录有 `v1 · io.molis.work.feed.capture`（Product launch checklist）。库里对应 `producer_plugin_id=io.molis.work.native.feed`。

未作为本切片回归：`tests/desktop-tui.test.ts`「Web and Desktop share one project workbench」仍卡在旧 `class="workspace is-desktop-tui"`，与本切片无关。迁移 fixture 与 `modules/feed` CHECK 仍含 `inbox_message`，那是历史数据契约，不是产品路径。点 Inbox / Feed / Artifacts 打开工作面见 `specs/archive/plugin-surfaces-with-goal-canvas/spec.md`。
