# 插件要素词典

Manifest 在 `packages/contracts/src/platform/plugin.ts`。用不到的块省略。声明了就必须兑现。

## 身份

- `schema_version`：产品插件用 `2`（ports、events、views、commands、routes、agent、mcp_exports）。CLI 样例脚手架仍可能生成 `1`。
- `host_api_version`：与 schema 对齐，产品用 `2`。
- `plugin_id`：反向域名，如 `io.molis.work.feed`。
- `*_PROJECT_PLUGIN_ID`：项目库短名（`feed`）。和全球 id 不是同一个字段。
- `name`、`version`：给人看的名字；代码变化必须自己递增 version。同一 `plugin_id + version + signature` 的 Manifest 不能静默改内容。
- `publisher.signature` 变了 = 新身份，旧 grant 不继承。
- `entrypoints[]`：`deployment: "local" | "server"` + `entrypoint` 路径。一等插件常用 `./index.js`。
- `kind`：`native` | `app` | `integration`。选贡献形态，不是信任等级。

## 权限与能力

`permissions[]`：`permission` + `required` + `reason`。真权限 = Host grant ∩ Manifest 上限。常见：

| permission | 何时 |
| --- | --- |
| `storage:private` | 本机私人库、计数、草稿 |
| `artifact:read` / `artifact:write` | 按类型读写 Artifact |
| `ui:register` | 样例注册 UI（CLI 脚手架） |
| `network:<host>` | 访问该主机 |
| `secret:<name>` | 凭据引用，不要自己存可导出密钥 |

`requires[]`：`capability_id`、`version`、`reason`。可选的写 `optional: true`。每一条的 `capability_id` 必须同时出现在 `capabilities.consumes`，否则解析拒绝。Inbox 绑判断是可选 `functions.evaluate`，两处都写了。

`capabilities.provides` 是契约 id，不是别的插件包名。不带 `@` 时版本按 1：`functions.evaluate` 对得上 requires 里的 version 1；`functions.evaluate.v1` 是另一个 id。`consumes` 写不带版本的 id。Kernel 里任意满足者都可以。必需项没有提供者、依赖成环、或依赖的插件被挡住，才不激活。

## 个人 vs 项目

Host catalog（`apps/workbench/src/plugin-catalog.ts`）的 `personal: true`：每个项目都可用，不进项目启用列表。今天：Shelf、Lingguang、Functions、Pages、Forms、Dataset、PPT。

其余按项目启用。必选输入口会拉上能产出该类型的同伴插件；可选取消口（Diff）不拉同伴。Feed 启用会带上 Inbox（`PROJECT_PLUGIN_COMPANIONS`）。

市场卡片靠 catalog 的 `summary`。没有 summary 的（Coding 族）不进内建市场列表。

## UI

- `ui.contributions`：contribution id 列表。
- `ui.views`：`view_id`、`slot`、`title`、`contribution_id`、`icon`（Host 图标名）、`order`。可选 `accepts_objects`。
- **槽（合同四选一）**：`navigator` 侧栏、`stage` 工作区工具面、`settings` 全局设置目录、`island` 项目卡片上方。不要发明第五个。
- `ui.commands`：命令菜单。`input_kinds`：`current` / `object` / `artifacts` / `agent-session`。必须写清作用对象。
- 贡献 descriptor 的 HTML Slot：`workbench.directory` / `workbench.main` / `workbench.overlay` / `workbench.settings`。`settings-page` 只能挂 settings。
- `kind`：`primary-page` | `embedded` | `overlay` | `settings-page`。

Native：构建期装配，Host 注入 HTML primitives。  
`app`：`start()` 返回的 `views` 必须覆盖 Manifest 每一条，否则启动失败。

## HTTP

两条路径，不要抄错：

1. **合同 / 第三方 app**：Manifest `routes[]`（`route_id`、method、`path` 带 `:name`）。Host 挂 `/api/plugins/<plugin_id>/`。未声明路径到不了插件。`app` 必须兑现每条 `routes[].handle`。
2. **一等 Native**：Host 文件把短名接到产品 API（`/api/feed/`、`/api/inbox/`、`/api/pages/`…）。插件包里自管 route table，由 `*-native-plugin-http.ts` 调用。个人插件进 `personal-native-plugin-http.ts`；Feed/Inbox/Schedule 进 `web-request.ts`。`project_id` 由 Host 从当前项目注入，不要从 body / MCP schema 收。

写操作要 revision / 幂等；冲突可恢复。handler 用注入的 Module/端口，不 import 别的插件实现。

## behaviors / function_scenes / judgment_subjects

这是「让 Functions 能绑到你的画面」，**不是**在本插件里写一条判断函数。函数记录在 Functions 插件（`{home}/functions/functions.db`）里写、试跑、发布。

顺序不能反：

1. 画面上已经有一颗能点的下一步处置（HTTP + 客户端真能改状态）。
2. Manifest `behaviors`：`behavior_id` 为 `[a-z0-9][a-z0-9-]*`，公开名 `{短名}.{behavior_id}`。与系统 id 撞号（如 `inbox.done`）时系统项保留。每条要 `title`、`effect`（`read`|`write`）、`subject_kinds`。
3. 若这个时刻要让 Functions 来挑：`function_scenes`（`scene_id` 如 `feed.capture`）+ `judgment_subjects`。
4. Host 总表：插件 Manifest 进 `apps/local-host/src/behavior-catalog.ts` 的 `NATIVE_BEHAVIOR_MANIFESTS`。只改自己的 Manifest，行为总表收不到。
5. **「用在哪」不会扫 Manifest 自动生成。** `functionAuthoringDestinations()` 和 `sceneBehaviorIds()` 写死三个去向：`home.dock`、`inbox.next`、`feed.capture`。新 `scene_id` 只写进 Manifest，函数页不会多一行。那是平台改动。
6. `judgment_subjects` 会合并进作者目录的「看什么」。去向仍是上面那张死表。
7. 对象到来时 Host/插件要真的调 `JudgmentPort`（对照 Feed 的 `judgeScene`）。只声明、落地时不调，按钮不会按建议亮。
8. 绑定 HTTP：Inbox / 首页是 `/api/inbox/judgment`、`/api/home/dock-judgment`；Feed 绑在捕捉规则上。再注入 `MolisWorkWebView.function_scenes`。
9. 画面吃建议：`suggested_behavior_ids`、`visibleFeedDispositionIds`、首页 `dock_behaviors`。判断只建议，不自动写。
10. 要判断就写可选 `requires: functions.evaluate`，并把这个 id 放进 `capabilities.consumes`（Inbox/Feed 就是这样）。`app` 还要兑现 `behaviors[].handle`。

`home.dock` 是 Host 的首页去向，不是某个插件自己的 scene。Agent 去向是 `agent.mcp`。没有「对象到来 / 点开挑按钮」这种时刻，不要新开去向。

录取四问和判例：`docs/platform/PLUGIN-DEVELOPMENT.md`。接线清单：[host.md](host.md)。

## MCP（对外贡献）

方向：人/Agent → 本插件。登记在 `mcp_exports`。

- 每条：`tool_id`、`description`、`input_schema`（object）、`effect`：`read` | `write`。
- 可选 `audience`（默认 `runtime`）、`scope`：`home`（不绑项目也可用，如 Functions 三项）或默认 `project`。
- 禁止 schema 字段：`board_id`、`database_path`、`web_base_url`、`actor_id`、`actor_kind`、`runtime_actor_id`、`submitted_session_id`。
- 禁止自报对外名和 `enabled`。公开名 `molis_work_v1_<短名>_<tool_id>`。
- 每条导出会自动进行为总表：`behavior_id` 就是这条公开名，`subject_kinds` 是 `mcp_invoke`。不要再为同一个工具写一条 `behaviors`。手写行为的公开名仍是 `{短名}.{behavior_id}`。
- 新贡献默认关；人在设置 → MCP 打开后，**之后新开的**连接才看得到。
- 个人插件但按项目分区（Pages / Forms / Dataset / PPT）：不要标 `home`；`project_id` 由 Host 注入。
- Native 还要在 `apps/local-host/src/mcp-native-plugins.ts` 加 adapter，`default_enabled` 默认 `false`。
- `app` 的 `contribution.mcp` 与 Manifest 一一对应。生产 `tools/call` 未接 Runtime 时不要给 Coding 等填 `mcp_exports`。

`agent.mcp` 是反方向：插件里的 Agent 能不能调**外面**的 MCP。

SSOT：`specs/plugin-outbound-mcp/spec.md`。

## Artifacts / ports

- `artifacts.produces/consumes`：`artifact_type_id` + `schema_version`。消费方按类型匹配，不指定生产者插件。
- **新类型先写合同**（如 `packages/contracts/src/modules/workspace-artifacts.ts` 或该插件的 `modules/<id>.ts`），再声明 `produces`。只写端口、合同里没有这个类型，连不上。
- `ports.inputs/outputs`：按 Artifact 类型连接，不指定生产者插件。声明输出口必须同时 `artifact:write` 且类型在 `produces`。输入同理 `artifact:read` + `consumes`。
- 输入口默认必选。项目启用时会拉上能产出该类型的同伴插件；可选取消口（Diff）不拉同伴。不会永远有生产者就不要声明必选入口。
- 缺绑定仍然可以 `start`。状态是 `missing`，Host 不会调用 `onUpstreamReady`。整份构建里没有产出者时，解析只记 `port_type_unsatisfiable`，插件不因此进 `blocked`。挡住启动的是必需 Capability、依赖成环，或依赖的插件被挡住。
- 产品里还没有连线页。`PluginWiringApi.bind` / `selectInputGroup` 在 Runtime 里，测试会调用。Local Host 没有挂 `/api/plugins/:id/ports`。
- 输出口：`services.outputs.publish`、`invalidate(port, 给人看的原因)`、`retain(引用)`。同一轮输入是否算一组，由 Host 创建 client 时附上 `scope_key`。`publish` 参数里没有这个字段。
- `input_groups`：组之间换着用；选中的那一组端口生效，其余不绑也不算失败。
- 完整输入一次送达 `onUpstreamReady`；失效走 `onUpstreamUnavailable`。Host 不投递半套。

## 插件事件总线（不是 Functions「事件去向」）

三件都叫「事件」，别混：

| 叫法 | 是什么 | 给谁 |
| --- | --- | --- |
| Functions「事件去向」 | 首页 / Inbox / Feed 上判断亮哪颗按钮 | `function_scenes` |
| 插件事件总线 | 插件之间打招呼 | Manifest `events` + `onEvent` |
| Integration Signal | 外部世界进来的消息 | Connector → Feed Item |

总线规则：

- `events.publishes` / `subscribes`。订阅必须列出 `from_plugin_ids`。来源没装只是不匹配，不算激活失败。
- 正文上限 16 KiB。更大的走 Artifact 引用。
- 禁止 `molis.` / `host.` 命名空间。
- **事件 id 放合同**，不放发布者插件包。Coding 的 `file-changed` 在 `workspace-artifacts` 合同里，Files 只点名 id，不 import Coding 实现。
- `PluginDefinition.event_types` 的 `validate` 必须覆盖自己 publishes 的每一种；Host 只存校验通过的。
- 发布：`context.services.events.publish({ event_type_id, type_version, payload })`。没声明 publishes 就没有 `services.events`。
- 接收：`start()` 返回的 contribution 上写 `onEvent`（Files/Git 用来刷工作区）。
- 落项目库，按 (订阅者, 来源) 串行，重启从游标续。

**今天只有 Coding 族这条 `createPluginPlatform` 真的在跑总线。** Feed / Inbox / Pages 这类构建期 Native 没有。给 Native 抄 Coding 的 `events:` 块，运行时不会投递。

对照：Files 订阅 Coding/Git 的文件变更；Coding 发布 file-changed / workspace-invalidated。

## 命令菜单

`ui.commands[]`：`command_id`、`title`、`input_kinds`（`current` / `object` / `artifacts` / `agent-session`）、`opens_view_id`。`opens_view_id` 必填，且必须是本 Manifest 已声明的 `view_id`。必须写清作用对象，不要默认「当前这一行」。

`app` 的 `start()` 还要兑现：

- `commandAvailability(commandId)` → `{ available, reason? }`
- `executeCommand(commandId, input)` → 打开的视图

只写 Manifest、不写这两个函数，菜单点不动。Native 一等入口今天几乎不用这条，对照 Coding / Files / Git。

## agent 块

仅 Agent 驱动才需要。至少有一个角色。`execution`：`read-only` | `text-edit` | `workspace-write`，省略等于只读，启动后不能自己放宽。

每个角色写 `role_id`、`version`、`name`，用 `prompts` 点名自己的提示词，用 `host_tools` 点名能叫的 Host 工具。不写 `prompts` 时，运行组合会把本插件声明的全部提示词交给这个角色；解析器同时要求有一条与 `role_id` 同名的 Prompt，否则 Manifest 无效。只读角色点名自己的那几条。

提示词层级是 `base` | `role` | `project`，省略等于 `role`。`task` 是用户这一次写的，插件声明会被拒绝。正文在包装里的 `agent_prompts` / `agent_skills`，不进 Manifest。Host 还要把正文挂进 catalog，见 [host.md](host.md)。

`subagent_workspaces: "required"` 只放在只读父角色上（Coding 的协调者、并行写入）。工作目录是 Host 事实，走 `projects.workspace.read.v1`。`directory_input_port` 不会让 Host 采信目录。

今天两例：`plugins/native/coding`（kind `app`）、`plugins/native/schedule`（kind `native`）。不要把 Coding 的 agent 块抄到普通内容插件。合同里还有 `compaction`、`text_sources`、`skills`，这两个插件没用，先不要写成必填。

## Integration

`kind: "integration"`。`definePollingIntegrationPlugin`：Manifest + `createProvider` → Connector Driver + Signal Adapter。Host 只看 Contract 和 Receipt。细节：[integrations.md](integrations.md)。
