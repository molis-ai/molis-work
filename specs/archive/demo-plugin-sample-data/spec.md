# 示例项目：各插件示例数据

完成等级 **3：功能可用**。不宣称可发布。不改用户项目。重建只动 `regenerable_demo`。

## 背景目标

打开 Molis Work 示例项目时，Goals 已有完整树和多种状态，但 Inbox、Feed、Artifacts、Sessions 仍是空列表。Feed 在 `demo` 标记下只注入页面内伪来源/伪条目，不能完成、忽略或同步。用户要求每个插件都有可点开的示例数据。

## 当前行为与问题证据

- `seedDemoBoard` 只写 Goal 事件；`feed_items` / `inbox_entries` / Artifact 版本为空。
- Catalog 创建 demo 时只启用 `goals`；Sessions / Inbox / Feed / Artifacts 要事后手动加插件才出现。
- Work Session 在 Home 的 Session Registry，不在项目库；示例项目没有绑定会话。
- Shelf 是个人置物架，首次打开会有 `试用示例.pdf`，与项目库无关。
- 打开工作台时 `GoalDecisionAttentionSync.reconcile` 只认 Goal Tree proposal；给 `DECIDE` 的 `requestDecision` 写 `goal_decision` Inbox 会被立刻标成已完成。

## 范围与非目标

做：

- 创建、打开已有、重建示例项目时启用全部内置插件：`goals` / `sessions` / `inbox` / `feed` / `artifacts`。
- 项目库写入真实 Feed 来源与条目：RSS 目录、YouTube 公开频道、网页查询、未授权的 GitHub / Gmail。已有示例项目若 catalog `board_id` 仍是 `goalboard-v1-demo`，按该 Board 写入，不要求先重建 Goal 树。
- Inbox 有待处理（手工、来源规则、来源故障）和历史（已完成、已忽略）。
- Artifacts 有 Goal 交付版本，以及 Feed 捕捉规则产出的版本。
- Home Session Registry 为该 `project_id` 写入两条带 Molis Work TUI 记录的 Session。
- 打开 Shelf 时确保已有试用 PDF。
- 项目库里一旦有真实 Feed 条目，不再叠加页面伪 Feed。

不做：

- 不改 `seedDemoBoard` 的 Goal 树、ID、标题、CORE 收尾、AUTO-CONNECT 回收站。
- 不为测试夹具里单独调用的 `seedDemoBoard` 写入插件数据（避免 Feed/Artifact 计数测试误伤）。
- 不写真实 OAuth、不联网拉取、不伪造 GitHub/Gmail 凭据。
- 不把 `DECIDE` 的事件决定写成 `goal_decision` Inbox（打开页面会被 reconcile 关掉）。
- 不改用户项目，不把 Shelf 材料绑到单个项目。

## 使用场景

1. 打开示例项目，插件条里能进 Inbox / Feed / Artifacts / Sessions，列表不是空状态。
2. Inbox 待处理能完成或忽略；历史里能看到已完成和已忽略。
3. Feed 条目是项目库事实，加入 Inbox 会留下 Attention 引用。
4. GitHub/Gmail 来源显示未连接，点连接走真实授权，不假装已经连上。
5. 重建示例项目后，Goal 树和插件示例一起回到这套数据；用户项目不动。

## 方案与关键决策

Catalog 的 demo 生命周期在 Goal seed 之后调用生产 API：`FeedSourceService.register`、`FeedApplication.ingestItem` / `createInboxEntry`、`ArtifactsModule.registerVersion`、`MolisWorkSessionRegistry.createSession` + `appendEvent`。

GitHub / Gmail 用 `upsertSource` 写成 `disconnected`，条目是本地历史，不带 `credential_ref`。

Session 用 `metadata.regenerable_demo` + `seed_key` 幂等，不写假的 `native_runtime_session_id`，避免被当成可读取的原 Runtime 线程。

## 输入输出与依赖

- 输入：demo 项目库路径、catalog `project_id`、Home 目录、执行者。
- 输出：项目库中的来源/条目/Inbox/Artifact；Home 中该项目的 Session 与 Shelf 试用 PDF。
- 依赖：现有 Feed / Attention / Artifacts / Session / Shelf 生产入口。

## 文件 / 模块边界

- `apps/local-host/src/demo-plugin-seed.ts`（新）
- `apps/local-host/src/demo-project-lifecycle.ts`
- `apps/local-host/src/project-catalog.ts`
- `apps/workbench/src/feed-projection-ui.ts`（有真实条目时不叠伪数据）
- `modules/private-work-context/src/session-schema.ts`（已有 Session Registry 的 provenance CHECK 仍是 `goalboard_created`、event source CHECK 仍是 `goalboard_tui` / `goalboard` 时，写入 `molis_work_created` / `molis_work_tui` 会被 SQLite 拒绝；打开时重建 CHECK，并把 `goalboard_tui`→`molis_work_tui`、`goalboard`→`molis_work`）
- `tests/project-catalog.test.ts` 或 `tests/demo-plugin-sample.test.ts`

## 验收标准

1. 新创建或重建的示例项目 `listProjectPlugins` 含 `goals, sessions, inbox, feed, artifacts`。
2. 项目库有 RSS / YouTube / 网页查询 / GitHub / Gmail 来源，且至少 5 条 FeedItem。
3. Inbox 默认列表有 `manual`、`source_rule`、`source_fault`；历史有 `done` 与 `dismissed`。
4. `listArtifacts` 非空，含 Goal 交付和 Feed 捕捉两类。
5. 该 `project_id` 下至少两条 Session，且 `eventCount > 0`。
6. 单独 `seedDemoBoard` 的夹具库仍无这些插件示例。
7. 有真实 FeedItem 时，工作台 Feed 列表不含 `prototype-feed-github`。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-local-host typecheck
node --import tsx --test --test-concurrency=1 tests/demo-plugin-sample.test.ts tests/project-catalog.test.ts tests/feed-native-plugin.test.ts
```

已有示例项目再走一次 ensure 会按该项目现有 `board_id` 补插件数据（含仍叫 `goalboard-v1-demo` 的旧示例），不拆 Goal 树。要整棵 Goal 树也回到现行种子，才需要 `demo reset`。

## 假设与开放问题

- 假设用户要看结果时会重建，或走一次 ensure。本任务结束时可对 `~/.molis-work` 执行一次 reset。
- YouTube / 网页查询条目是本地示例，不是当场联网结果。
