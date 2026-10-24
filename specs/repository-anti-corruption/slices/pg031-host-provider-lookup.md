# PG-031 宿主其余写死的提供方

状态：分支 `ac-kernel/pg031-host-remainder`（从 main `61248691d` 重放），等 ac-kernel 开着的 PR 数降下来再开 PR（2026-10-24，ac-kernel，统筹 10-24 排在 S-57 扩展设计稿之后）。本片收掉宿主侧除 Goals（BL-501 另一片）以外仍写死别的插件提供方的地方；PG-031 里「CLI、MCP、宿主从插件包 import `goalsActions`」那一半不在本片。

## 目标与边界

统筹 2026-10-24 裁定（BL-501 同一口径）：宿主调别的插件的动作，按 `capability_id@version` 在共同目录里找唯一提供方，不写死对方的 `plugin_id`；插件自己声明的跨插件依赖（Inbox→Pages、Feed→Goals）和外部调用方的授权（server continuity 的跨设备 MCP 授权）保留精确提供方，换了提供方照样得到 `actions.provider_changed`。

逐项核对 main（`61248691d`）上 spec 列出的宿主写死位置：

| 位置 | 处理 |
| --- | --- |
| `apps/local-host/src/information-actions.ts` 的 `required_actions`（Feed `feed.snapshot`、Inbox `inbox.list`） | 去掉 `provider_id`，只按能力声明依赖 |
| `apps/local-host/src/artifact-document-import.ts` 的 `importThroughArtifacts`（钉 `ARTIFACTS_PLUGIN_ID`） | 没有调用方的死代码，连同只为它留的 import 一起删掉 |
| `apps/local-host/src/home-talk-actions.ts`（钉 `io.molis.work.sessions`） | 已随 #1157 删掉，不再存在 |
| `server/src/continuity/actions.ts` 的 `CONTINUITY_ACTIONS` | 不动：这是外部跨设备调用方的授权，按裁定保留精确提供方 |

其余 `provider_id: …PLUGIN_ID` 写法都是插件钉自己的动作（`work-actions.ts`、`feed-goal-promotion.ts`、`characters-http.ts`、`content-action-providers.ts:44`、各插件 `retainActionAuthority`），或插件自己声明的跨插件依赖，不属本片。

## 方案与取舍

`LocalHost.resolveActionAvailability` 对不写 `provider_id` 的依赖本来就取目录里那一个匹配项。考虑过在那里加「匹配到多个就 `actions.provider_ambiguous`」，没加：内核 `CapabilityRegistry.register` 拒绝同一 `capability_id@version` 在调用方可见范围内的第二次注册（全局与项目、或同一项目），一个调用方的目录里不会出现两个候选，这条判断永远走不到。宿主侧真正可能看到多个提供方的地方是 `pluginActionProvider` 的调用方，已由 BL-501 覆盖。

**`allowed_actions` 的精确提供方不放宽**（统筹 10-23、10-24 裁定）。本片只改宿主自己的动作 `information.plan` 的依赖声明，没有任何 `allowed_actions` 由它派生：`information.plan` 只对 `user` 开放，不能授权给 MCP 客户端（`web-mcp-action-settings.ts` 按 `required_actions` 提示同授的那条路走不到），也不是插件 Manifest 里的动作（`plugin-page-actions.ts` 把插件自己的 `required_actions` 并进页面调用的 `allowed_actions`，那条路不经过这里）。插件声明的依赖（Inbox→Pages 等）照旧写精确提供方，本片不碰。

动作合同快照只有 `information.plan` 一行的 traits 哈希变了（依赖声明变化），输入输出 schema 不变、版本不变；对工作流程步骤、MCP 工具名、Skill 没有影响。

## 验收

- **RAC-340**：`information.plan` 的 Feed、Inbox 依赖只按能力声明，不带提供方；目录照样把两者解析成唯一提供方，依赖停用时照样不可用（`tests/plugin-query-consumers.test.ts`，与原有的 `actions.plugin_disabled` 断言同一用例；快照 `tooling/gates/actions/host-actions.tsv`）。

## 遗留

- PG-031 的另一半（CLI、MCP、宿主从 Goals 包 import 动作定义）已由 PG-031 第一片 #1218 改成 contracts 描述符，随批 PR #1224 落地。
- 宿主里其余 `provider_id: …PLUGIN_ID` 都是插件钉自己的动作或自己登记的提供方（`characters-host.ts`、`characters-http.ts`、`feed-goal-promotion.ts`、`assistant-thread-actions.ts`、`personal-planning-actions.ts`），以及 server continuity 的外部授权（保留），不属本片。
