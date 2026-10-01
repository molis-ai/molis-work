# 来源、Feed、Inbox 数据契约与迁移边界

## 背景与目标

当前生产代码把公开来源写成 `item_type = feed`，把 GitHub、Gmail 等账号消息直接写成
`item_type = inbox_message`。这让“消息事实”和“为什么需要用户处理”共用同一行状态，后续实现
Feed 与 Inbox 时会出现重复正文、去重范围不清和处理状态互相覆盖。

本 Work Item 达到 **3 · 功能可用（契约与迁移层）**：建立唯一、可测试的 Source、SyncRun、
FeedItem、InboxEntry 契约，并将已有 `inbox_message` 数据事务迁移为“FeedItem 事实 + InboxEntry
引用”。生产 UI、后台定时调度和 Provider 完整联网行为由后续 Goal 负责。

## 当前行为与问题证据

- `src/feed/store.ts` 的 `feed_items.item_type` 同时决定对象类型和页面入口。
- `ingestItem` 对账号来源直接写 `inbox_message`，公开来源写 `feed`，因此并非“所有拉取结果先进入 Feed”。
- `feed_items` 的旧唯一索引按 `source_kind + external_id` 去重；多个 Gmail 安装或同类来源必须依赖调用方手工改写 external ID 才不冲突。
- Source 没有正式的拉取计划字段；删除、断开、保留历史的选择也没有版本化契约。
- Gmail 只执行读取，但 OAuth 默认还请求 `gmail.compose`；GitHub OAuth Device Flow 默认请求经典 `repo`，其权限宽于只读接入所需。

## 唯一对象契约

- **Source**：拥有接入配置、凭据引用、账号标签、启停状态、拉取计划和最后成功游标；不拥有消息正文。
- **SyncRun**：拥有单次拉取的 operation/idempotency、阶段、结果、安全错误、计数和诊断 receipt；只有完整可信成功才能推进 Source cursor。
- **FeedItem**：拥有一次外部消息的本地事实快照。所有 Provider 结果都先写 FeedItem；稳定身份为 `board_id + source_id + external_id`。
- **InboxEntry**：只拥有“为什么需要人工介入”、处理状态和原对象引用。`feed_item`、`goal_decision`、`source_fault` 三类引用互斥；不得复制标题、摘要或正文。

兼容层可以临时把有活动 InboxEntry 的 FeedItem 投影成旧 `inbox_message` 供现有 UI 使用，但数据库新写入只允许 `item_type = feed`。旧列删除的退出条件是 Feed 与 Inbox 后续 Goal 都已改为分别消费 `feed_items` 和 `inbox_entries`。

## 迁移与回退

1. 在 migration 29 中新增 `inbox_entries`、Source `schedule_json` 和迁移对账 receipt。
2. 为每条旧 `item_type = inbox_message` 生成一个确定性 InboxEntry；处理中的行转为 `in_progress`，已保存/升格转为 `done`，已归档转为 `dismissed`，其他为 `open`。
3. 对账 FeedItem 总数不变、旧类型归零、所有 feed_item 引用可解析后，才写 migration receipt 和 schema migration 记录。
4. 整个 migration 29 与 migration 记录在同一个 SQLite immediate transaction 内；任何异常都回滚表、数据和版本记录。
5. 旧全局去重索引替换为 Source 作用域索引。迁移不修改现有 Goal、Material、正文、用户 disposition、linked Goal 或 read state。

## Provider、隐私与生命周期边界

- GitHub：PAT 优先使用 fine-grained、Repository metadata read + Issues read + Pull requests read；Device Flow 默认只请求 `read:user`，私有仓库读取在后续 GitHub App/fine-grained 授权完成前必须诚实标为受限。凭据只进 SecretStore。
- Gmail：只请求 `gmail.readonly`、`openid`、`email`；它是 restricted scope。Token 加密保存，断开时停止拉取并撤销/删除本地 Token；日志不记录主题、正文或凭据。
- RSS：无账号凭据，只允许受防 SSRF 约束的 HTTPS 拉取；内容始终是不可信外部数据。
- 删除 Source 必须由调用方显式传 `retain_history` 或 `delete_local_history`，不能用默认值替用户决定。断开只停止未来拉取，不自动删除历史。

官方依据：

- GitHub OAuth、Device Flow 与最小权限：<https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps>、<https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app>
- GitHub fine-grained token endpoint permissions：<https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens>
- Gmail scopes：<https://developers.google.com/workspace/gmail/api/auth/scopes>
- Google OAuth token storage/revocation：<https://developers.google.com/identity/protocols/oauth2/resources/best-practices>

## 模块边界

- `src/feed/types.ts`：四个对象及其状态、删除决策、快照结构的类型 SSOT。
- `src/feed/contract.ts`：版本、模块所有权、Provider 数据访问矩阵、公共错误模型和运行时不变量。
- `src/feed/store.ts`：migration 29、对账 receipt、Source-scoped dedupe、InboxEntry 状态写入和旧 UI 投影。
- `src/feed/connectors/*`、`src/feed/sources/*`：只通过 Store 写 FeedItem；是否进入 Inbox 由显式 attention 规则产生 InboxEntry。
- `src/feed/relay-import.ts`：导入 FeedItem 后按旧来源语义补 InboxEntry，不再创建持久化 `inbox_message`。
- `tests/feed-contract.test.ts`：版本化契约、迁移对账/回退、Provider fixture、权限与错误模型检查。

## 非目标

- 不实现生产 Feed / Inbox 新 UI。
- 不实现后台调度器或睡眠补拉。
- 不完成 GitHub App、Gmail OAuth 审核或真实账号联网验收。
- 不删除旧 `item_type` 列；它仅保留为临时兼容读取层。
- 不删除任何现有 Relay、Source 或历史消息。

## 验收标准

- [x] 自动化测试证明所有新 Provider 拉取先写 FeedItem，账号消息另外创建 InboxEntry，InboxEntry 不含正文复制字段。
- [x] Source schedule、SyncRun、FeedItem、InboxEntry 的所有权、状态转换、Source-scoped identity 和公共错误契约有唯一版本化定义。
- [x] 代表性旧数据迁移前后 FeedItem 数、引用、用户状态一致；迁移失败演练证明 schema、数据和 migration 记录回到迁移前状态。
- [x] Provider fixture 可被 GitHub、Gmail、RSS 后续实现共同消费，且错误只返回安全分类、可重试性与用户动作。
- [x] Gmail 默认权限不再包含 compose；GitHub Device Flow 不再默认请求经典 repo scope；凭据、断开、保留和删除边界有测试。
- [x] `pnpm typecheck`、定向 Feed 测试、`pnpm build` 和 diff 检查通过。

## 验证命令

- `CI=true pnpm typecheck`
- `node --import tsx --test tests/feed-contract.test.ts tests/feed.test.ts tests/feed-sources.test.ts tests/feed-connectors.test.ts tests/feed-security.test.ts`
- `CI=true pnpm build`
- `git diff --check`

## 假设与开放边界

- 当前 Web 可以通过兼容投影继续工作；Feed 与 Inbox 后续 Work Item 迁移到新集合后才删除旧投影。
- Gmail `gmail.readonly` 属于 restricted scope，内部本机试用不等于外部发布已通过 Google 验证或安全评估。
- GitHub OAuth App 没有满足私有仓库只读需求的经典细粒度 scope；后续优先 GitHub App 或 fine-grained PAT，不用宽权限 `repo` 冒充最小授权。

## 验证结果（2026-08-30）

- `CI=true pnpm typecheck`：通过。
- 契约、Feed、Connector、Security 定向测试：20/20 通过。
- 契约 + Feed + Source API + Web + Desktop 受影响回归：105/105 通过。
- `CI=true pnpm build`、`git diff --check`：通过。
- 完整 `CI=true pnpm test`：327/328 通过；唯一失败是上一轮高保真页面新增中文标签尚未补齐英文词典。它不影响本 Work Item 的数据库契约或迁移判定，归入后续 `goal-infoflow-internal-integration` 的 `integration-regression` 验收，在内部完整前必须修复。
