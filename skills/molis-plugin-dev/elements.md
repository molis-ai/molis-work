# 插件要素词典

Manifest 在 `packages/contracts/src/platform/plugin.ts`。用不到的块省略。声明了就必须兑现。

## 身份

- `schema_version`：产品插件用 `2`（ports、events、views、commands、routes、agent、mcp_exports）。CLI 样例脚手架仍可能生成 `1`。
- `host_api_version`：与 schema 对齐，产品用 `2`。
- `plugin_id`：反向域名，如 `io.molis.work.feed`。
- `*_PROJECT_PLUGIN_ID`：项目库短名（`feed`）。和全球 id 不是同一个字段。
- `name`、`version`：给人看的名字；代码变化必须自己递增 version。同一 `plugin_id + version + signature` 的 Manifest 不能静默改内容。升级来源要通过 `upgrade_compatibility` 精确声明。
- `publisher.signature` 变了 = 新身份，旧 grant 不继承。
- `entrypoints[]`：`deployment: "local" | "server"` + `entrypoint` 路径。一等插件常用 `./index.js`。
- `kind`：`native` | `app` | `integration`。选贡献形态，不是信任等级。

## 版本升级

`upgrade_compatibility` 不是版本范围或自动升级开关，而是目标发布对精确旧版本的声明：

- `compatible_from_versions`：新代码可直接读写该版本的私人数据，并沿用旧 grant。项目重启可用兼容实现恢复，但已安装版本只在用户手动升级后更新。同版本修正文档可列出当前版本以继续运行，但不会改变安装指纹或显示成升级。
- `migratable_from_versions`：允许用户手动升级；目标定义还必须实现 `validateUpgrade({ from, context })`，通过只读 `get` 检查现有私人数据。Host 不执行数据迁移；预检通过后，目标实现直接使用已有格式。需要转换格式的插件目前不受此协议支持。
- 来源必须是精确 SemVer；较高版本的来源必须早于当前 `version`，只有 `compatible_from_versions` 可列出与 Manifest 相同的版本。未声明的来源不能升级；升级不能降低版本。
- Runtime 检查目标 Manifest 保留全部旧 grant 和必需权限，不会自动授予新权限。相同身份的普通安装仍要求指纹一致；同版本不同 Manifest 只有明确兼容声明才可用于继续运行，存储的版本与指纹保持不变。
- `validateUpgrade` 收到旧安装记录和受限上下文；只有目标 Manifest 声明且旧安装已授予的 `storage:private.get` 可用，不暴露其他服务。校验失败时旧安装记录、grant 和存储仍留在原位。

完整流程和 Manifest 片段见[本地 Plugin 开发·版本升级](../../docs/platform/PLUGIN-DEVELOPMENT.md#插件版本升级)。

## 权限与能力

`permissions[]`：`permission` + `required` + `reason`。真权限 = Host grant ∩ Manifest 上限。常见：

| permission | 何时 |
| --- | --- |
| `storage:private` | 本机私人库、计数、草稿 |
| `artifact:read` / `artifact:write` | 按类型读写 Artifact |
| `ui:register` | 样例注册 UI（CLI 脚手架） |
| `network:<host>` | 访问该主机 |
| `secret:<name>` | 凭据引用，不要自己存可导出密钥 |

`requires[]`：`capability_id`、`version`、`reason`。可选的写 `optional: true`。每一条的 `capability_id` 必须同时出现在 `capabilities.consumes`，否则解析拒绝。旧 Feed 判断仍有可选 `functions.evaluate`；Inbox 已改用动态消费场景，不声明这项旧依赖。

`capabilities.provides` 是契约 id，不是别的插件包名。不带 `@` 时版本按 1：`functions.evaluate` 对得上 requires 里的 version 1；`functions.evaluate.v1` 是另一个 id。`consumes` 写不带版本的 id。Kernel 里任意满足者都可以。必需项没有提供者、依赖成环、或依赖的插件被挡住，才不激活。

## 个人 vs 项目

Host catalog（`apps/workbench/src/plugin-catalog.ts`）的 `personal: true`：每个项目都可用，不进项目启用列表。今天（`BUILTIN_PLUGIN_CATALOG`）：Cognia、插件创作台、Images、Jelly、Experiments、Shelf、灵光、Characters、Pages、Forms、Dataset、PPT、Alchemist、Workflows。

其余按项目启用。必选输入口会拉上能产出该类型的同伴插件；可选取消口（Diff）不拉同伴。Feed 启用会带上 Inbox（`PROJECT_PLUGIN_COMPANIONS`）。

市场卡片靠 catalog 的 `summary`。没有 summary 的（Coding 族）不进内建市场列表。

## UI

- `ui.contributions`：contribution id 列表。
- `ui.views`：`view_id`、`slot`、`title`、`contribution_id`、`icon`（Host 图标名）、`order`。可选 `accepts_objects`。
- **槽（合同四选一）**：`navigator` 一级入口（底栏插件切换与 Dock）、`stage` 工作区工具面、`settings` 全局设置目录、`island` 底栏右侧的个人常驻入口（项目圆钮旁）。不要发明第五个。
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

## actions / action_scenes

新插件通过 `actions` 提供查询、判断或操作，通过 `action_scenes` 贡献真实消费入口。不能仅写一个场景标签或让 Host 增加判断去向枚举。定义和公开类型在 contracts/platform/actions，SDK 的 `defineAction` 用同一份定义生成 manifest 与 handler 引用。

- 动作：身份与版本、名称、输入输出、语义类型、权限、作用域、允许入口。`required_scene` 可声明触发入口依赖的已启用判断绑定。
- 场景：事件触发、对象种类、提供的输入和接受的结果、作用域与权限。`event_schema` 和 `prepare` 将业务事件转换为函数上下文；私有 `state` 留给消费方。
- 兑现：运行实例提供 `bindings`、`bind`、`consume`；需要时提供 `prepare` 和 `failed`。绑定数据保留在原业务 owner。消费前核对业务对象；共同内核负责绑定修订、提供方实例和权限重查。
- 发现：Host 场景客户端根据注册合同判断兼容性，并从真实绑定反查使用位置。新场景无需更新 Host ID 名单。完整系统管理 UI 与部分旧编辑器尚在迁移，不能把注册成功等同于所有产品入口完成。

`behaviors` 已废弃，内置插件均已移除；`function_scenes` 和 `judgment_subjects` 只是兼容声明，不兑现实际场景消费。可调用能力用 `actions`，消费判断用 `action_scenes`；Home、Inbox、Feed 的判断都已走共同场景。详情见 [Host 接线](host.md#接到统一判断场景) 和 [开发手册](../../docs/platform/PLUGIN-DEVELOPMENT.md#统一动作与消费场景)。

## MCP（对外贡献）

方向：人/Agent → 本插件。登记在 `mcp_exports`。

- 每条：`tool_id`、`description`、`input_schema`（object）、`effect`：`read` | `write`。
- 可选 `audience`（默认 `runtime`）、`scope`：`home`（不绑项目也可用，如判断规则相关动作）或默认 `project`。
- 禁止 schema 字段：`board_id`、`database_path`、`web_base_url`、`actor_id`、`actor_kind`、`runtime_actor_id`、`submitted_session_id`。
- 禁止自报对外名和 `enabled`。公开名 `molis_work_v1_<短名>_<tool_id>`。
- 存量导出只维护已有兼容名称，并须用 `required_actions` 指向真实动作；新能力直接声明 `actions`。
- 新贡献默认关；人在设置 → MCP 打开后，**之后新开的**连接才看得到。
- 个人插件但按项目分区（Pages / Forms / Dataset / PPT）：不要标 `home`；`project_id` 由 Host 注入。
- Native 还要在 `apps/local-host/src/mcp-native-plugins.ts` 加 adapter，`default_enabled` 默认 `false`。
- `app` 的 `contribution.mcp` 与 Manifest 一一对应。生产 `tools/call` 未接 Runtime 时不要给 Coding 等填 `mcp_exports`。

`agent.mcp` 是反方向：插件里的 Agent 能不能调**外面**的 MCP。

SSOT：`specs/archive/plugin-outbound-mcp/spec.md`。

## Artifacts / ports

- `artifacts.produces/consumes`：`artifact_type_id` + `schema_version`。消费方按类型匹配，不指定生产者插件。
- **新类型先写合同**（如 `packages/contracts/src/modules/workspace-artifacts.ts` 或该插件的 `modules/<id>.ts`），再声明 `produces`。只写端口、合同里没有这个类型，连不上。
- `ports.inputs/outputs`：按 Artifact 类型连接，不指定生产者插件。声明输出口必须同时 `artifact:write` 且类型在 `produces`。输入同理 `artifact:read` + `consumes`。
- 输入口默认必选。项目启用时会拉上能产出该类型的同伴插件；可选取消口（Diff）不拉同伴。不会永远有生产者就不要声明必选入口。
- 缺绑定仍然可以 `start`。状态是 `missing`，Host 不会调用 `onUpstreamReady`。整份构建里没有产出者时，解析只记 `port_type_unsatisfiable`，插件不因此进 `blocked`。挡住启动的是必需 Capability、依赖成环，或依赖的插件被挡住。
- 产品里还没有连线页。`PluginWiringApi.bind` / `selectInputGroup` 在 Runtime 里，测试会调用。Local Host 没有挂 `/api/plugins/:id/ports`。
- 默认连线只有一张名单：`apps/local-host/src/workspace-plugin-bindings.ts`，只覆盖 Coding、Shelf、Files、Git、Diff、Text stats 之间的端口。新插件的输入口不会自动接上，也不要往名单里加自己的行；需要跨插件取内容时优先走公开动作或 Capability。等有第三方端口插件时再由 Manifest 声明首选来源（specs/archive/repository-systematic-review D-04）。
- 输出口：`services.outputs.publish`、`invalidate(port, 给人看的原因)`、`retain(引用)`。同一轮输入是否算一组，由 Host 创建 client 时附上 `scope_key`。`publish` 参数里没有这个字段。
- `input_groups`：组之间换着用；选中的那一组端口生效，其余不绑也不算失败。
- 完整输入一次送达 `onUpstreamReady`；失效走 `onUpstreamUnavailable`。Host 不投递半套。
- 输入状态的 `missing.reason` 区分未选择和已失效，界面保留 waiting/unavailable 的语义。输入通知刷新当前投影，不是一次性业务命令。`onUpstreamReady(inputs, context)` 接到可用且未归档的固定版本；异步读取后、更新投影前调用 `context.beforeEffect()`，并把 `context.signal` 传给可取消操作。Host 从已提交的领域 journal 发现失效/归档并重算既有输入图。新实例重新读取当前输入，不能把重启通知当作再次执行外部操作的授权。

## 插件事件总线（不是判断场景）

三件都叫「事件」，别混：

| 叫法 | 是什么 | 给谁 |
| --- | --- | --- |
| 判断场景 | 首页 / Inbox / Feed 上判断亮哪颗按钮 | `action_scenes` |
| 插件事件总线 | 插件之间打招呼 | Manifest `events` + `onEvent` |
| Integration Signal | 外部世界进来的消息 | Connector → Feed Item |

总线规则：

- `events.publishes` / `subscribes`。订阅必须列出 `from_plugin_ids`。来源没装只是不匹配，不算激活失败。
- 正文上限 16 KiB。更大的走 Artifact 引用。
- 禁止 `molis.` / `host.` 命名空间。
- **事件 id 放合同**，不放发布者插件包。Coding 的 `file-changed` 在 `workspace-artifacts` 合同里，Files 只点名 id，不 import Coding 实现。
- `PluginDefinition.event_types` 的 `validate` 必须覆盖自己 publishes 的每一种；Host 只存校验通过的。
- 发布：`context.services.events.publish({ event_type_id, type_version, payload })`。没声明 publishes 就没有 `services.events`。
- 接收：`start()` 返回的 contribution 上写 `onEvent(event, delivery)`（Files/Git 用来刷工作区）。使用订阅安装自己的身份及 `delivery.signal`，每次异步等待后、写入前调用 `delivery.beforeEffect()`；传给 Host 端口时继续传该控制，不能长期保留原发布 Action 的临时授权。
- 落项目库，按 (订阅者, 来源) 串行，游标绑定 install_id 与安装世代。同一安装重启续接未派出的工作，重装建立新订阅，不继承旧游标或重放历史。无可信身份的旧游标保留原数据，仅作为历史。
- 处理前持久记录 delivering，确认前重查实例、版本和订阅。处理器已开始但崩溃或被撤销，结果未知则隔离，不能自动重试；启动失败且没有派出处理器时可以恢复。普通处理器异常记录后不自动重投，不能声称任意副作用 exactly-once。Host 关闭先 `await events.close()` 再关闭数据库。
- 隔离事件由人从项目「插件 → 待核对的插件通知」核对，填写依据后明确 retry/skip。插件不能给自己恢复，普通启用不能补权。所见 revision、首条事件、安装世代与版本必须保持一致，决定及历史同事务保存；不替换原安装，不跳过后续事件。重试存在重复副作用的可能，必须在确认中说明。

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

`subagent_workspaces: "required"` 只放在只读父角色上（Coding 的协调者、并行写入）。工作目录是 Host 事实，候选通过 `projectSettingsCapabilities.workspaces` 读取。`directory_input_port` 不会让 Host 采信目录。

今天两例：`plugins/native/coding`（kind `app`）、`plugins/native/schedule`（kind `native`）。不要把 Coding 的 agent 块抄到普通内容插件。合同里还有 `compaction`、`text_sources`、`skills`，这两个插件没用，先不要写成必填。

## Integration

`kind: "integration"`。`definePollingIntegrationPlugin`：Manifest + `createProvider` → Connector Driver + Signal Adapter。Host 只看 Contract 和 Receipt。细节：[integrations.md](integrations.md)。

## 当前项目设置能力

从 `contracts/modules/projects` 导入 `projectSettingsCapabilities`：`workspaces` 返回当前项目已关联目录，`browsingWorkspace` 返回 Files/Git 的当前浏览目录或 null。逐项将完整 `capability_id` 写入 Manifest consumes，然后调用 `invoke(capability, [])`。不可传 project_id，不支持 key 袋或通配读取。Host 裁剪其他项目关联字段。工作目录在项目设置中维护，不再接 Workspace 输出。Coding 会话执行目录独立；`projects.workspace.read.v1` 只保留旧执行默认值兼容。

`settings` 槽只放页面，不给其他插件读权；`storage:private` 只存自己的偏好。项目说明仍属 Goals。归属与例子见 `docs/platform/PROJECT-SETTINGS.md`。

生产事件要从事实 owner 的提交或回执接出，不能从审批通过或一次历史查询推断新执行。Coding `run-updated`、Git `operation-updated` 是刷新提示，包含失败/未知状态；不冒充旧的 review 失效或 file-changed 协议。Host 按项目和 activation 装配、停止时注销；提示到 Files/Git 后只失效视图 revision。可靠业务副作用仍需要自己的提交一致性，不能由 UI revision 冒充持久 outbox。
