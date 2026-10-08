# 调用链

状态：现行。对照 main（4d59cd4d）逐环节读码写成（2026-10-08）；链 4、5、8 此前没有逐环节记录，这次首次读码核对。凡写「已定」的，出处是 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md#10-42419-普查与路线2026-10-07) 里用户的决定（§1 的 10-07、10-08 各行与 §10 的 27 项决定表，下称「决定 n」）；已定而代码里还没做的，都标「目标」，并写明今天是什么样。

这份文档回答一个问题：一件事从入口走到落库，中间经过谁、带着什么身份、怎样被拒绝、留下什么痕迹。八条链路来自 `docs/prompts/repository-anti-corruption.md` §4.2，每条链一张环节表：

- **环节**：这一步做什么；**归谁**：代码在哪里，也就是出了问题找谁；
- **输入 → 输出**；**身份与权限**；**失败时**：真实的错误码或状态；**事件与记录**：这一步留下的东西。

文中引用的路径、能力 id、错误码都在代码里存在；行号不写，用符号名定位。「现状与缺口」里的编号 `#n` 指 [平台逻辑复查](../../specs/repository-anti-corruption/spec.md#11-平台逻辑复查2026-10-07补第一步按-goal-收窄的范围)，`W3-01` 这类编号指 [路线](../../specs/repository-anti-corruption/roadmap-2026-10-07.md) 里的切片。

## 1. 先记住的五件事

1. **身份只来自调用上下文。** 每个入口先造一个 `ActionCallContext`（`packages/contracts/src/platform/actions.ts`）：`actor_id`、`project_id`、`audience`、`permissions`、可选的 `allowed_actions`、`validate_authority`、`signal`。页面参数、MCP 参数、模型输出都不能填这些字段。`_meta` 里的 Runtime 会话 id 只用来做审计作者（`audit_actor_id`），不是权限。
2. **能力只有一条执行路径。** 页面、MCP、助理、Agent、工作流、插件 SDK 都经 `ActionClient.invoke`，到 `ActionService`（`packages/kernel/src/action-service.ts`）→ `CapabilityRegistry` → 处理器。入口只在「谁在调、看得到哪些、怎样呈现结果」上不同。例外集中登记在 §10。
3. **等待模型或外部服务的动作声明 `scheduling: "concurrent"`，写入前调 `beforeEffect()`。** 它复查注册实例、可用性、授权、权限和取消；调用结束后再调就抛 `actions.expired`。
4. **调用记录只写「谁调了什么、怎样结束」，不写输入和结果。** 只记命令（`operation === "command"`），在 `apps/local-host/src/action-call-log.ts`；不经 `ActionService` 的 typed 能力不写。
5. **目前没有贯穿全链的调用标识。** `ActionCallContext` 没有 call id；一次性键 `x-molis-work-idempotency-key` 只在 HTTP 入口防重放、不往下传；调用记录里的行也没有编号。界面上的报错因此追不到具体环节。
   - **目标（决定 5）**：Host 给每次调用一个编号，贯穿各入口与调用记录（W3-01）；界面报错的详情里显示它的短形式，叫「诊断编号」，可以一键复制；「设置 › 诊断」按诊断编号列出最近的调用。
   - **今天**：「设置 › 诊断」（`apps/workbench/src/settings-renderer.ts` 的诊断页）只有本体安装状态、提示词与角色登记、助理与执行服务的账目、启动入口和常驻服务，不列调用。最近的命令调用在「能力」页的「调用记录」（`apps/workbench/src/capabilities.ts`，数据来自 `ActionCallLog`），每行没有编号，查询不记。

### 入口对照

| 入口 | actor 与受众 | 权限从哪来 | 排队 | 错误怎样呈现 |
| --- | --- | --- | --- | --- |
| 页面（本机 HTTP） | `web-user`（`LOCAL_PERSON_ACTOR_ID`），`user` | 该页面的内置权限集，加上本项目运行中 Runtime 插件的已授 grant（`localWebActionContext`） | 项目串行队列 | JSON `{ error, code? }`，HTTP 状态由各插件自己的 `*RouteErrorResponse` 决定（14 份） |
| 外部 Runtime（MCP） | `runtime:<runtime_id>`（无 Runtime 标识时 `local-mcp`），`mcp`；会话作审计作者 | 每个客户端、每个项目、每个动作的显式授权（`{home}/config/mcp-tools.json`） | 同上，经常驻 Host | 文本 `错误: …` 加 `{"code":…}`，`isError: true` |
| 助理 | `web-user`，`agent`；`audit_actor_id` 为 `assistant:<work_id>` | 本工作范围内对 `agent` 开放、且人没关掉的动作 | 同上 | 工具结果里的文字；对界面是 `AssistantError`（`assistant.*`） |
| Agent（Coding、定时任务、Character） | 同一 `agent` 受众 | Manifest 角色的精确 `action_tools` 或能力网关 | 同上 | 工具结果 |
| Runtime 内置插件（Coding、Files 等） | `web-user`（`LOCAL_PERSON_ACTOR_ID`），`user`（`apps/local-host/src/plugin-executor.ts` 的 `actionCaller`） | 安装时用户确认的 grant；`allowed_actions` 只含本插件 Manifest 声明的动作 | 同上 | 抛给插件代码 |
| 创作台生成的插件（沙箱进程） | `plugin:<插件 id>`，`actor_kind` 为 `runtime`，受众 `plugin`（`apps/local-host/src/plugin-builder/catalog.ts` 的 `catalogCapabilities`） | 每次调用只带被调那一项能力自己的权限，先由沙箱 broker 对照该安装的 grant；能调用的是目录里对 `plugin` 受众开放的能力：声明了 `plugin` 受众，或对 `agent` 开放且没有 `plugin: false`，撤不回的除外（`actionReachesAudience`），不限于自己声明的动作 | 同上 | 抛给沙箱里的插件代码；不确定的结局报 `unknown` |
| 工作流 | 沿用触发运行的调用者，Workflows 插件把受众改成 `workflow` | 调用者原有的权限 | 同上 | 步骤状态 |
| 后台定时器 | 到期拉取（连同它触发的判断）：`web-user`，`user`，权限为本机用户的权限集（`LOCAL_OWNER_PERMISSIONS`）；Schedule 唤醒投递提醒或定时操作结果后的判断（项目运行环境打开时装配的触发器）：`workflow-events`，`workflow` | 前者是权限集，后者是触发器写死的权限串 | 到期拉取是 concurrent | 只记在来源状态与事件里 |
| CLI（`molis-work v1`） | 不经动作服务，直接调 typed 能力 | 进程内的 `LocalHost` | 进程内 | 命令行 `错误: …` |

## 2. 链 1：界面操作 → 事件 → 界面刷新

以 Todo「改状态」为例；其他内置插件结构相同，只是路由表和处理器不同。

| # | 环节 | 归谁 | 输入 → 输出 | 身份与权限 | 失败时 | 事件与记录 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 页面发请求 | `apps/workbench/src/scripts/control.ts`（`molisWorkControlHeaders`）；各插件客户端自带 `fetch` 包装 | 用户操作 → JSON 请求；头带 `x-molis-work-control-token`（取自页面 meta）和每次新生成的 `x-molis-work-idempotency-key` | 页面只带控制令牌，不带身份 | 读 `body.error` 显示；没有共用的请求客户端，也不显示调用标识 | 无 |
| 2 | 本机入口与防重放 | `apps/local-host/src/web-server.ts` → `authorizeLocalWebRequest`（`apps/local-host/src/web-http.ts`） | 请求 → 放行或拒绝 | Host 必须是回环地址；写 API 还要求 Origin 与 Host 一致、令牌常量时间比对相等、一次性键 8 到 200 位 | 403「本地控制请求校验失败」；400 缺键；409 `request.in_flight`；409「这次操作已经提交」 | 进程内键表（上限 4096 条），成功后记 complete；Goal 事件命令路径允许同键重放 |
| 3 | 项目解析 | `apps/local-host/src/web-routing.ts`（`resolveWebRequest`）、`apps/local-host/src/web-request.ts` | 路径 → 项目引用（`project_id` 加库路径） | 项目目录库（catalog） | 404「找不到这个 Molis Work 项目」；库文件不存在 404 | 无 |
| 4 | 路由分发 | `apps/local-host/src/web-request.ts` 依次尝试各个 handle…Http 处理函数；旧路径插件走 `apps/local-host/src/` 下各自的 native-plugin-http 文件（例如 `apps/local-host/src/workflows-native-plugin-http.ts`），Runtime 插件走 `apps/local-host/src/coding-surface.ts` 的 `handleCodingPluginHttp` 和 `PluginRouteRouter` | URL → 命中的路由表 | 项目由 Host 按路径绑定，query 和 body 不能覆盖 | 没命中就落到下一个处理器；Runtime 插件在本项目未启用时 404 `plugin_not_enabled` | 无 |
| 5 | 插件路由表 | 插件包，例如 `plugins/native/todo/src/routes.ts`、`plugins/native/todo/src/route-handlers.ts` | HTTP 参数 → 动作输入；动作结果 → HTTP 响应 | 无新增身份，只持有 `BoundActionClient`；请求断开时 `AbortController` 取消 | 由插件的 `todoRouteErrorResponse` 一类函数映射状态 | 无 |
| 6 | 绑定调用者 | `apps/local-host/src/local-web-actions.ts`（`bindLocalWebActions`、`localWebActionContext`） | → `ActionCallContext` | 权限 = 页面内置权限集 + 本项目运行中且 grant 覆盖的 Runtime 插件权限；带 `allowed_actions`，对 Runtime 插件的授权在派发时用 `validate_authority` 重读 | `actions.forbidden`（授权已失效） | 无 |
| 7 | 项目运行环境与排队 | `apps/local-host/src/project-host.ts`（`MolisWorkLocalHost.actionClient`：每次发现或调用先 `prepareProjectPlugins`，保证本项目的 Runtime 插件和已安装的生成插件已启动）→ `apps/local-host/src/local-host.ts`（`LocalHost.actionClient`，内部 `enqueue`） | → 打开项目运行环境，排进队列执行 | 调用者的 `project_id` 必须等于所选项目；先做宿主层可用性检查：项目是否启用该插件（`apps/local-host/src/project-action-availability.ts`）、`required_actions` 依赖、`required_scene` 的绑定 | `actions.scope_mismatch`；`actions.host_closed`；`actions.plugin_disabled` | 同一项目的命令串行排队；声明 `concurrent` 的动作和 `wait` 在队列旁执行；占住队列超过 20 秒，日志点名该能力（不含输入） |
| 8 | 动作服务 | `packages/kernel/src/action-service.ts`（`ActionService.invoke`）→ `packages/kernel/src/index.ts`（`CapabilityRegistry.invoke`） | 能力引用加输入 → 校验后的结果 | 可见性检查：受众、权限、`allowed_actions`、项目一致；`required_actions` 依赖也要可用；输入按 JSON Schema 校验 | `actions.missing`；`actions.provider_changed`；`actions.forbidden`；`actions.project_required`；`actions.input_invalid`；`actions.rate_limited`；`actions.timeout` | 无 |
| 9 | 处理器、领域、存储 | 插件或模块，例如 `plugins/native/todo/src/actions.ts` 的 `createTodoActionHandlers` | 输入 → 领域结果；写入在 owner 自己的库里 | 处理器自己再判断范围，例如 Todo 只让人自己的页面跨项目读（`todoAccess`）；异步等待后、写入前 `await beforeEffect()` | owner 自己的错误码，例如 `todo.not_found`、`todo.conflict`；已写入后输出不合合同报 `actions.output_invalid_after_effect` | 由 owner 决定：多数把领域事件写进库里的事件日志（例如成果库经 `LocalProjectDatabase.appendEvent`）；Todo 在输出里给 `change_id`，供撤销 |
| 10 | 结算 | `apps/local-host/src/project-host.ts`（`actionSettled`）→ `ActionCallLog` | 一次调用的结局 → 一行记录 | 无 | 记录失败不改变调用结果 | `{home}/logs/action-calls.jsonl`：谁、哪个能力、成功与否、错误码与前 200 字；连续相同结局（10 分钟内）合并；文件超过 2000 行时只保留最近 1000 行；成功的命令还会通知搜索「这个提供方的内容变了」 |
| 11 | 响应与刷新 | 插件客户端脚本；`webViewCache`（`apps/local-host/src/web-view.ts`） | JSON → 页面更新 | — | 页面显示 `error` | 普通写入没有服务端推送：页面靠响应、标签页重新可见和轮询刷新；服务端渲染的视图在相关写入后清缓存 |

**守住它的用例**：`tests/local-web-actions.test.ts`、`tests/local-host-actions.test.ts`、`tests/web-home-isolation.test.ts`。

**现状与缺口**

- 没有调用标识，诊断编号的目标见 §1 第 5 条（W3-01）；14 份各自的错误映射对同一个错误码给出不同状态，例如 `actions.plugin_disabled` 在 `plugins/native/feed/src/route-error.ts` 里是 403，在 Todo 与 Pages 里是 400（W3-02）；浏览器端没有共用请求客户端（W3-10）。
- 步骤 4 是手写的前缀链；改成注册表是 W5-07。新的内置插件只走 Plugin Runtime，不再新增这类文件。
- 不经 `ActionService` 的 typed 能力（`LocalHost.register` 的非动作分支）不校验 schema、不写调用记录；边界见 §10。
- [系统架构 §4](ARCHITECTURE.md) 写的「owner 提交后经 Durable Outbox 发布事件」是目标，不是现状（[BL-070](../../specs/BACKLOG.md)）：现在各 owner 在自己的事务里写自己的事件日志，没有统一的发布通道，消费方靠读 owner 的动作或轮询。

## 3. 链 2：外部 Runtime 经 MCP → 逐客户端授权 → 同一条业务路径

唯一的对外 MCP 进程是 `molis-work-mcp`（`apps/desktop/launchers/mcp/server.ts`）。正式的 stdio 进程里，动作经本机网关转给同一个 Home 的常驻 Web 宿主执行；连接工具和管理工具在该进程内直接操作项目目录库和项目库（步骤 7、8）。测试和嵌入才在进程内用 `LocalHost` 直接执行动作。

| # | 环节 | 归谁 | 输入 → 输出 | 身份与权限 | 失败时 | 事件与记录 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 协议 | `apps/mcp/src/protocol.ts`（`handleMcpMessage`）、`apps/mcp/src/stdio.ts` | JSON-RPC → tools/list、tools/call | 取 `_meta` 里的会话 id（键名 molis-work/sessionId、`threadId`、`sessionId`），只作审计作者 | 未知方法 -32601；工具失败 `isError: true` | 不主动发 tools/list_changed |
| 2 | 装配与实时发现 | `apps/local-host/src/mcp-server.ts`（`LocalMcpServer.ensureCatalog`）、`apps/local-host/src/mcp-catalog.ts` | 每次 tools/list 重新发现 → 平台工具加已授权且可用的动作 | 目录由 `authorizeMcpActions` 的授权结果过滤；名字冲突直接报错，不覆盖 | `MCP 名称重复`；常驻服务离线时只剩连接工具 | 无 |
| 3 | 客户端授权 | `apps/local-host/src/mcp-action-client.ts`（`authorizeMcpActions`）、`apps/local-host/src/mcp-action-grants.ts`、`apps/local-host/src/mcp-settings-store.ts` | 目录 + `{home}/config/mcp-tools.json` → 带 `allowed_actions` 的上下文 | 授权键是 客户端 + 项目 + 能力 + 版本 + 提供方 + 权限集，必须逐项一致；无权限要求的系统动作无需授权记录；管理页写授权，所有 MCP 进程每次重读 | `mcp.action_revoked`；`mcp.permission_revoked` | 设置页写原子文件 |
| 4 | 跨进程转发 | `apps/local-host/src/action-gateway.ts`（`LocalActionGatewayClient`）→ `apps/local-host/src/action-gateway-http.ts`（`/api/internal/action-service`） | `discover`、`invoke` → 常驻 Host 的同一 `ActionClient` | 网关挂在链 1 的步骤 2 之后：回环、令牌（读自 Home 的令牌文件）、一次性键；Home 标识和 Host 实例标识必须一致 | `actions.service_unavailable`；`actions.delivery_unknown`（连接中断，不自动重发）；`actions.host_replaced`；`actions.home_mismatch` | 无 |
| 5 | 分发 | `LocalMcpServer.callToolResult` 按目录条目的 `source` 分三路 | 工具名 → 动作 / 连接工具 / 管理工具 | `assertMcpToolAllowed`（`apps/local-host/src/mcp-authority.ts`）：工具必须在当前目录里；Runtime 受众只能用连接工具和已授权动作 | `mcp.tool_unknown`；`mcp.tool_disabled`；`mcp.authority_denied`；`mcp.connection_incomplete` | 无 |
| 6 | 动作路径 | `apps/mcp/src/action-tools.ts`（`createActionMcpPorts`）→ 链 1 的步骤 7 到 10 | 工具参数 → `ActionClient.invoke`；非对象输入用 `input` 包一层，输出用 `result` | 上下文由传输层绑定，受众强制为 `mcp`，参数和 `_meta` 不能改身份、项目、权限；`authorship: "session"` 的动作必须有稳定会话，否则 `mcp.runtime_identity_missing` | 与链 1 相同的 `actions.*`；`actions.mcp_unavailable` | 同链 1；Runtime 的 Goals 写入另记入会话活动（`mcpRuntimeSessionActivity`） |
| 7 | 连接工具 | `apps/mcp/src/runtime-context-tools.ts` | 7 个连接工具（解析、绑定、解绑、拒绝建议、新建并绑定、列项目、删项目）→ 直接打开项目目录库 | 身份来自 MCP 宿主与会话；但 5 个写入工具仍从参数读 `actor_id` | `mcp.context_host_missing` 等 | 目录库自己的记录 |
| 8 | 管理工具 | `apps/mcp/src/tool-dispatch.ts`（`dispatchMcpProjectTool`） | 3 个管理工具（初始化、事件决定、目标树决定）→ typed 的 Goals 能力 | 只对 `management` 受众（受信任的管理入口）开放；Runtime 受众调用被步骤 5 拒绝 | `mcp.authority_denied`；`goal_tree_proposal.runtime_decide_unsupported`（Runtime 不能写目标树决定的第二道闸） | Goals 自己的事件 |

**守住它的用例**：`tests/action-mcp.test.ts`、`tests/action-mcp-stdio.test.ts`、`tests/action-gateway.test.ts`、`tests/mcp-action-grants.test.ts`、`tests/mcp-action-catalog.test.ts`、`tests/production-action-mcp.test.ts`。

**现状与缺口**

- 步骤 7 的删项目与网页的删项目是两份实现：网页（`apps/local-host/src/web-project-settings.ts`）有终端存活时 409 的保护并释放运行环境，MCP 版没有。已定（决定 7）：宿主设置里的写入仍只走本机管理 HTTP，其中只有删除项目要统一，Web 与 MCP 共用一份 Host 删除服务（W2-07）。删除时别的主人存在 Home 里的该项目数据，已定由各主人一起清、可重试（spec §1，2026-10-07 的行）；现在 `ManagedProjectDeletion`（`apps/local-host/src/managed-project-deletion.ts`）的清理端口 `ProjectDeletionCleanupPorts` 只有会话绑定和面板两项，还没有按主人登记的钩子。
- 步骤 7 的 5 个写入工具读 `actor_id` 参数，违反「可信身份不从输入读」；已定（决定 6）从可信会话取并删参数（W2-07）。
- 步骤 8 的管理入口走 typed 桥而非动作；已定「对外的只走动作」（N-12，W3-07）。
- `authorship: "session"` 只在步骤 6 的 MCP 入口检查，助理和 Agent 不经这条检查（见 [action-architecture §3 复核](../../specs/action-architecture/spec.md)）。

## 4. 链 3：助理与 Agent

对话 → Agent Host → Prologue → 工具调用 → 动作服务 → 副作用前复查 → 结果与运行记录。模型调用的一般规则和有界推理的链见 [Prologue AI 手册](../platform/PROLOGUE-AI.md#3-调用链)，这里写助理这一条。

| # | 环节 | 归谁 | 输入 → 输出 | 身份与权限 | 失败时 | 事件与记录 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 页面发送 | `apps/workbench/src/scripts/client/assistant-island.ts` → `apps/local-host/src/assistant/assistant-http.ts`（`/api/assistant/send`） | 文字、材料、`request_id` → 一次 Send | 链 1 的步骤 2 到 4；项目只决定新工作的范围 | `AssistantError` → HTTP：`assistant.not_found` 404、`assistant.scope` 403、冲突类 409、其余 400；未预期错误 500 `assistant.failed` | 无 |
| 2 | 去重与建工作 | `AssistantService.send`（`apps/local-host/src/assistant/assistant-service.ts`） | `request_id` 先认领 → 新建或取回工作 | 同一 `request_id` 只执行一次，重复请求返回第一次的结果 | 失败时释放认领，未发出的话留作草稿 | 助理库 `{home}/assistant/assistant.db` 里的工作、材料、关系 |
| 3 | 派出一轮 | `AssistantService.dispatch` → `horizontal/agent-host/src/index.ts`（`AgentHost.start`） | 任务、材料、`action_gateway: true`、预算 → 一个运行句柄 | Host 从插件声明冻结角色；核对工作区方式、会话归属（项目、插件、安装、actor 必须一致）、预算与日用量上限 | `assistant.budget`；`assistant.needs_check`；`agent.role_not_declared`、`agent.capability_unavailable`、`agent.session_unknown` 等 | 助理记下这一轮（`addRound`）；Prologue 持久保存运行 |
| 4 | 授权来源 | `apps/local-host/src/assistant/assistant-authority.ts`（`assistantAuthority`） | → 每次调用重新计算的上下文 | 本工作范围内对 `agent` 开放的动作，减去人关掉的；`validate_authority` 在每次派发时重读目录 | `assistant.action_revoked` | 无 |
| 5 | 模型与工具循环 | `horizontal/agent-host/src/adapters/prologue-node.ts` 和 `horizontal/agent-host/src/adapters/prologue-action-gateway.ts` | 模型提出工具调用 → 网关工具 `find-capabilities`、`read-capability`、`change-capability`、`change-reversible`、`suggest-action` | 每次调用都重新读目录；写入工具与读取工具分开；只读角色不能用写入工具 | `actions.missing`（不再提供就明说，不换别的能力）；`actions.gateway_mismatch`；写入已发出未结束报 `actions.outcome_unknown` | 无 |
| 6 | 人的确认 | `horizontal/agent-host/src/reviews.ts`（`AgentReviewQueue`）、`horizontal/agent-host/src/adapters/prologue-approvals.ts`；`AssistantService.decide` | 一条待审写入 → 允许或拒绝 | 批准是一次性的；拒绝、过期、已被关闭的待审不能换个入口变成许可；声明了撤销、人没设成每次确认的写入可免确认（`directEligible`） | `assistant.scope`（确认不属于这项工作） | 回执记录是否真的发生；拒绝会转告模型「没有执行」 |
| 7 | 进动作服务 | `assistantAuthority` 的 `invoke` → `LocalHost.actionClient` → 链 1 的步骤 7 到 10 | 工具调用 → 动作结果 | 受众 `agent`；`beforeEffect` 在写入前复查注册实例、授权、取消 | 同链 1；`actions.cancelled`（停止时还没发出） | 调用记录里这行的受众是 `agent`；成功的命令在助理库登记撤销和结果对象的关系（`recordResult`、`recordUndo`） |
| 8 | 结果与跟进 | `AssistantService.read` / `list`、`watchJob`、`notice` | 运行视图 → 工作面板；后台任务按 `background_job` 声明跟进 | 读取走人的上下文（`scopeActions`） | 6 小时未结束的后台任务标记 `unknown` | 状态变化才产生通知（失败、等待确认、完成），同一轮同一状态只一次 |

**守住它的用例**：`tests/assistant-business-gateway.test.ts`、`tests/assistant-undo.test.ts`、`tests/assistant-memory.test.ts`、`tests/assistant-work-continuity.test.ts`。

**现状与缺口**

- Coding 的 Agent 轮次、`agent.run.start.v1` 等能力和 Character 冻结在 [Prologue AI 手册](../platform/PROLOGUE-AI.md#agent-轮次以-coding-为例) 里有逐步说明，结构与上表第 3 到 7 步相同，只是动作工具来自角色的精确 `action_tools`。
- 助理的 `remember`（#28）把本人在这项工作里自己打的消息（宿主保存的轮次；定时安排拼出的轮次和助理写给子任务的话在写入时标了 `written_by`，不算）交给写入门，写入门只在要记的内容就是其中某一整条消息的全文时记作「你说过」，记下来的是那条消息本身，不是模型交来的版本（`apps/local-host/src/assistant/assistant-memory-tools.ts`、`horizontal/memory/src/spoken.ts` 的 `theirWords`；只容许 `horizontal/memory/src/text.ts` 的 `fold` 列出的大小写、全角半角、空白、引号样式和最后一个句号的差别，不做 Unicode 归一化）；改写、删减、只取其中一句、拼接都不是，一律作为建议等本人认可，不再读意思。已有的自动记忆只在它自己的正文与本人的某条消息是同样的话时才变成「你说过」；判断“已经记着”也按同样的话，逗号、符号、问号不同的是另一条。「忘掉」是停用，记成助理做的、本人可撤销，彻底删除留给本人；子任务没有记住和忘掉。经 `memory.write` 动作调用的其他 Agent（Coding 会话、插件里的 Agent）宿主没有它和本人的对话，没有可核对的原话，它交来的 `said` 不算消息，所以它写的一律作为建议等本人认可。
- 助理和 Agent 的运行记录在 Prologue 与助理库里，没有调用标识把它们和调用记录里的行连起来（W3-01）。
- 助理的实现 `AssistantService`（`apps/local-host/src/assistant/assistant-service.ts`）是一个巨大单元；已定（决定 3）先就地按包形边界拆、再搬成独立包，第一刀是提醒与跟进的协作者（W4-05）。
- 实验里本地 `grok` 与 `laya` 的调用不经这条链，见 §10。

## 5. 链 4：插件生命周期

安装或启用 → 校验 → 注册 → 加载 → 目录与发现 → 停用、卸载、升级时能力与界面同步撤下。代码里有三种「插件」，生命周期不同：

| 种类 | 谁装配 | 项目里「添加或移除」怎样生效 |
| --- | --- | --- |
| 构建期内置插件（Goals、Pages、Todo、Feed 等，名单冻结在 `tests/builtin-plugin-assembly-gate.test.ts`） | 项目运行环境打开时由 Host 注册动作提供方（`apps/local-host/src/project-host.ts`） | 只改项目目录库里的成员关系；动作仍在注册表里，但每次调用的宿主层可用性检查返回 `actions.plugin_disabled` |
| Runtime 内置插件（Coding、Files、Diff、Git、Text Stats、Shelf、Characters；Characters 已定改成宿主的一节设置，见下方缺口） | `apps/local-host/src/project-plugins.ts` 的监督器条目；对该项目第一次发现或调用动作时（`prepareProjectPlugins`）一起启动 | 成员关系同上；Runtime 管自己的状态机 |
| 创作台生成的插件 | `apps/local-host/src/installed-plugin-host.ts`（`lifecycle`），在隔离沙箱进程里运行；已安装的在同一时机恢复 | 创作台的安装、启用、停用、卸载、升级、回滚 |

下表是 Runtime 管理的插件（后两种）的链路；第一种只有第 1、7 行里「成员关系」的那一半。

| # | 环节 | 归谁 | 输入 → 输出 | 身份与权限 | 失败时 | 事件与记录 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 声明与校验 | `packages/contracts/src/platform/plugin-manifest.ts`（`parsePluginManifest`，含 `inspectActionDeclarations` 与 `inspectMethodDeclarations`）；`PluginRuntime`（`packages/plugin-runtime/src/index.ts`）的 `validateManifest` | Manifest → 通过或拒绝 | 实际 grant 不能超过 Manifest 声明上限，缺必需 grant 拒绝 | `plugin_manifest_invalid`；`plugin_grant_denied`；`plugin_entrypoint_missing` | 无 |
| 2 | 依赖解析 | `packages/plugin-runtime/src/resolution.ts`（`resolvePluginActivation`）、`PluginSupervisor.start`（`packages/plugin-runtime/src/supervisor.ts`） | 一批 Manifest → 激活顺序，依赖不满足的标 blocked | 依赖只表达契约：能力、端口输入、点名来源的事件订阅 | 状态 `blocked`（带具名诊断）；事件契约与校验器不一致的插件不启动，不影响其他插件 | 内存里的监督状态 |
| 3 | 安装记录 | `PluginRuntime.install`，记录存项目库的 `plugin_runtime_installs` 表（`SqlitePluginRuntimeRepository`） | 定义 + 部署环境 + grant → 安装记录（`installed`） | 同一插件 id + 版本 + 签名只能对应一份 Manifest；已有安装不能被重复 install 悄悄改部署环境或 grant；内置随 Host 的插件（`bundled`）跟 Host 版本走 | `plugin_definition_conflict`；`plugin_upgrade_required`；`plugin_state_invalid` | 安装记录；Native 发行物存进项目库，用于重启后恢复精确旧版 |
| 4 | 启动与兑现 | `PluginRuntime.start` → `PluginHostExecutor.start`（`apps/local-host/src/plugin-executor.ts`）→ `assertContributionMatchesManifest`（`packages/plugin-runtime/src/contribution.ts`） | 插件 `start(context)` → contribution（视图、路由、动作处理器） | 上下文里的服务按 Manifest 声明才出现；动作客户端只能调用本插件声明的动作 | 声明了没兑现，或兑现了没声明：`plugin_contribution_unredeemed`，启动失败并撤权；入口抛错：`plugin_executor_failed`，记为 `crashed` | 状态 `running`；连续失败达上限（默认 3 次）进入 `quarantined`，需人显式解除 |
| 5 | 注册动作 | `PluginRuntime.redeem` → `pluginActionProvider`（`packages/plugin-runtime/src/action-provider.ts`）→ `LocalHost.actionRegistry` | Manifest 的动作和场景 → 动作提供方 | 每个动作的可用性随安装记录实时读：未运行 `actions.plugin_unavailable`，缺授权 `actions.plugin_permission`；注册表再检查一次声明形状 | `actions.definition_invalid`；`actions.unredeemed`；`kernel.capability_duplicate` | 提供方变化通知搜索（`SearchHost.providerChanged`），下次查询重新核对该来源 |
| 6 | 目录与发现 | `LocalHost.inspectActions`；页面 `localWebActionContext`；MCP `ensureCatalog` | 调用者上下文 → 看得到的动作及可用性 | 目录条目包含「暂不可用」及原因，执行时重新校验 | — | 无；MCP 每次 tools/list 重新读 |
| 7 | 路由与界面 | `PluginRouteRouter`（`packages/plugin-runtime/src/routes.ts`）；`handleCodingPluginHttp` | `/api/plugins/<插件 id>/…` → 已声明的路由 | 路径统一在这个前缀下，未声明的到不了插件；未启用 `plugin_not_enabled`（404），未运行 `plugin_unavailable`（503） | `plugin_route_unbound`（500，插件自身的错） | 界面版本号 `viewRevision`（`/api/plugins/<插件 id>/view-revision`）在插件通知宿主视图变了时递增（`invalidateView`，例如工作目录或 Git 工作区变化），页面据此刷新 |
| 8 | 停用 | 内置：`PluginSupervisor.revoke` + `PluginRuntime.stop`；生成插件：`lifecycle` 的 `disable` 分支 | → 状态 `disabled` | 先撤销调用授权，再等插件自己的清理 | 清理失败：`plugin_executor_failed`，记为 `crashed` | `revoke` 取消启用世代，排队的事件按世代丢弃，`PluginHostExecutor.stop` 撤销事件客户端；动作提供方注销，通知搜索重新核对；生成插件另把对外暴露的动作撤下、提示词登记标为停用 |
| 9 | 卸载 | `PluginRuntime.uninstall`；生成插件 `lifecycle` 的 `uninstall` 分支 | → 状态 `uninstalled` | 停止、撤权，定义从内存移除；生成插件另取消该安装的定时提醒与定时操作、删密钥引用 | 停止失败：撤权后记为 `crashed`，可重试卸载 | 私有数据是否保留由调用方决定（生成插件的 `keepData`），Runtime 只记 `retain_private_data` |
| 10 | 升级与回滚 | `PluginSupervisor.upgrade` / `rollback` → `PluginRuntime.upgrade`（`changeVersion`） | 目标定义 → 新版本运行，失败回到旧版本 | 目标必须声明可从当前版本升级（`compatible_from_versions` 直接兼容，`migratable_from_versions` 要先过只读旧私有数据的 `validateUpgrade`）；不得丢失已有 grant；不能改变执行信任边界 | `plugin_upgrade_required`；`plugin_upgrade_validation_failed`；`plugin_upgrade_rollback_failed`（私有数据没能回滚，旧插件已停止） | 升级前捕获私有数据快照，失败时恢复并重启旧版本 |

**守住它的用例**：`tests/plugin-upgrades.test.ts`、`tests/plugin-platform-composition.test.ts`、`tests/plugin-events.test.ts`、`tests/plugin-release-artifact.test.ts`、`tests/installed-plugin-host.test.ts`、`tests/installed-plugin-policy.test.ts`、`tests/system-search-lifecycle.test.ts`、`tests/side-panel-platform.test.ts`。

**现状与缺口**

- 停用的 Runtime 插件在升级或回滚时会被重新启动（`changeVersion` 把状态写成 `installed` 再启动）。已定「只换版本、保持停用」（#1，修复中）。
- 卸载时保留了私有数据、重装的新版本又不能从旧版本升级，现在直接拒绝；已定「重装时让人选：丢弃旧数据或取消」（#3、#60）。
- 构建期内置插件的停用靠宿主层可用性检查，而不是注销动作，所以目录里它们仍在，只是标为不可用。成员关系是项目目录库里的事实（`project.plugin_added`、`project.plugin_removed` 事件），不是 Runtime 的状态。
- 没有一个可移除的探针插件把 undo、到期提醒、`background_job`、情境片段、`methods`、放置走完「安装 → 发现 → 调用 → 停用 → 撤权 → 卸载 → 升级」；这些合同的生产方都是构建期插件（W4-01，台账见 [PLUGIN-PLATFORM §9](../platform/PLUGIN-PLATFORM.md)）。
- Manifest 的 `methods` 通过校验，但只有构建期内置插件会被登记：`builtinRegistrations`（`apps/local-host/src/agent-definitions/builtin-agents.ts`）遍历 `BUILTIN_PLUGIN_CATALOG`，现有的声明方是 Pages 与 Todo；Runtime 插件和已安装插件的宿主都不登记它，声明了也不生效。已定（决定 18）：和内置插件一样注册，启动时登记，停用、卸载、升级时收回（W4-02）。
- 已定（决定 9）：个人插件装在一个 Home 级的 Runtime 实例里，按项目启用照旧，数据文件留在 `{home}/<id>/<id>.db`、由平台库服务打开；Goals、Artifacts、Sessions 和插件创作台列为批准的构建期例外，其余构建期插件逐族迁到 Runtime（W5-01）。这是目标：上表第 3 行的安装记录今天仍按项目存在各项目库里。
- 已定（决定 26）：Characters 不再是 Runtime 插件，代码并进宿主或一个 Module，界面仍是「设置」里的一节；它的安装记录与 `project-plugins.ts` 里的监督器条目一起删（第 4 波的一片）。今天它仍是上表第二种。

## 6. 链 5：后台——调度与监听 → Feed → Inbox → 提醒与通知

后台没有一个统一的调度器。触发者有三处：Web 服务的 30 秒定时器（Feed 的到期拉取和 Schedule 的唤醒）、助理自己的定时器（到期提醒每分钟、新资料每 5 分钟；定时跟进由 Prologue 的持久队列保存）、人手动点「立即拉取」。下表按一次「到点拉取新消息」走一遍，再列另外两条入箱路径和通知。

| # | 环节 | 归谁 | 输入 → 输出 | 身份与权限 | 失败时 | 事件与记录 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 谁来叫醒 | `apps/local-host/src/web-server.ts` 的 30 秒定时器，对 `feedSchedulers` 里每个项目各调一次拉取和一次 Schedule 的 `tick` | 定时 → 触发 | 无调用者；触发里自己装配上下文 | 单个项目抛错被吞掉，下一次再来 | 有变化时清该项目的页面视图缓存 |
| 2 | 项目登记 | `apps/local-host/src/web-request.ts`：某个项目第一次被网页请求打开时，才创建它的拉取器并登记 | 项目打开 → 登记 | — | — | 见缺口 |
| 3 | 到期拉取 | 动作 `feed.sources.tick`（`plugins/native/feed/src/source-actions.ts`）→ `FeedSourceScheduler.tick`（`plugins/native/feed/src/source-scheduler.ts`） | 空输入 → 已到期来源数、完成、失败、跳过 | 受众只有 `user`，权限 `feed:read`、`feed:write`；`scheduling: "concurrent"`，等网络时不占项目队列 | 单个来源失败只记该来源，不影响其他，失败的拉取也花掉当次计划（`advanceSchedule`），不会每 30 秒重拉；失去授权，或拉取期间人改了来源的名称、说明、启停、计划或配置，整个调用终止，不再推进计划 | 同一来源同一计划时间幂等键相同；进程内 `inFlight` 防重叠 |
| 4 | 同步一个来源 | 动作 `feed.sources.sync`；公开来源 `FeedSourceService.sync`，账号来源 `FeedConnectorSync.sync`（`plugins/native/feed/src/connector-sync.ts`） | 来源 id、幂等键 → 新增与去重条数 | 每次异步等待后用 `beforeEffect` 核对来源仍启用、未删除、配置和账号引用没变 | `feed_source_paused`；`connector_needs_auth`；`feed_source_sync_interrupted`；`feed_source_connection_changed` | 来源状态加事件 `feed_connector.sync_completed`、`feed_connector.sync_failed`、`feed_connector.sync_interrupted`；进程内的同步租约（`feedSourceSyncLease`）让同一个来源不会被两个连接实例同时拉取，再入报 `feed_source_sync_interrupted` |
| 5 | 监听与信号 | `apps/local-host/src/feed-connector-sync.ts`：`ConnectorHost` 加官方集成的 driver，`ListenerHost.run` 保存 cursor 和 lease、去重，`SignalsModule` 保存信号 | 一次运行 → 信号草稿被接受 | 凭据只给引用 | 运行没取得终态：来源标 `error`，报 `feed_source_sync_interrupted`，可安全重试 | 每个被接受的信号回调给 Feed |
| 6 | 收进 Feed | `FeedApplication.ingestItem`（`plugins/native/feed/src/application.ts`）→ `modules/feed` 的 `commands.ingest` | 信号 → Feed 条目（按外部 id 去重） | Feed 是条目的 owner | Feed 的领域错误（`FeedDomainError`、`FeedStoreError`） | 新增或更新的条目进入待判断队列（`JudgmentQueue`，只在进程内存里） |
| 7 | 规则与判断 | `FeedApplication.flushPendingJudgments` → `JudgmentQueue.flush`（`plugins/native/feed/src/judgment-queue.ts`）→ `captureJudgment`、`homeJudgment`、`inboxJudgment` 三个触发器（`createFeedCaptureTrigger` 在 `plugins/native/feed/src/scenes.ts`，`createHomeJudgmentTrigger` 在 `apps/local-host/src/home-actions.ts`）；等模型的动作（`scheduling: "concurrent"`）不冲整条队列，用 `FeedApplication.ingestItemJudged`，或用 `flushPendingInboxJudgments` 点名条目，只判断自己这一步排进去的；场景处理器 `apps/local-host/src/feed-scene.ts`、`apps/local-host/src/inbox-scene.ts` | 条目 → 场景判断（经 Functions，模型走 Prologue） | 三个触发器都取「传进来的调用者，没有就用装配时给的上下文」（`explicitCaller ?? context()`），所以要看是谁把条目带进来的。来源同步（到期拉取、立即拉取、账号来源的同步，动作 `feed.sources.tick`、`feed.sources.sync`）用 `judgedAs(caller)` 装配（`apps/local-host/src/content-action-providers.ts`），判断以这次调用的调用者运行，并保留对这个 Feed 动作的授权复查；定时器触发的到期拉取是 `web-user`、`user`、`LOCAL_OWNER_PERMISSIONS`。工作流交进内容（`feed.content.receive`、`inbox.content.receive`）和把条目加入 Inbox（`feed.items.inbox`）都把自己的调用者传进去，只判断自己排进队列的条目，不借自己的身份去判断别人排的。只有 Schedule 的唤醒（`judgeDelivered`，经 `bindScheduleDeliveryFeed` 装配）是 Host 自己叫起来的，没有调用者，用项目运行环境装配的 `workflow-events`、受众 `workflow`，权限串在 `apps/local-host/src/workflow-feed-options.ts` 里写死 | 判断失败不阻止收件 | 判断结果记在 Functions 模块的判断记录里 |
| 8 | 入 Inbox | `modules/attention-resumption`（`attention.commands.ensureFeedItem` / `create`），经 Feed 应用调用 | 条目 + 原因 → Inbox 条目 | Inbox 条目属于关注模块 | — | 来源的不可重试故障（授权、配置、游标失效）会建一条 `source_fault` 条目，之后同步成功自动关闭，来源退役时也关闭（连同本地历史删除时一并删掉） |

另外两条入箱路径：

- **插件提醒**：Schedule 的唤醒（`scheduler.wakeup.v1`，`horizontal/scheduler`）到点调用 `deliverHostReminder`（`apps/local-host/src/schedule-reminders.ts`），把提醒写成 Feed 里 `plugin-reminders` 来源的条目并带 `source_rule` 关注原因，随后进 Inbox。安装已卸载或世代不符的提醒不投递。投递提交之后，`apps/local-host/src/schedule-runtime.ts` 的 `judgeDelivered` 再运行这条条目启动的捕捉规则与 Inbox 下一步判断（由 `bindScheduleDeliveryFeed` 装配，身份是第 7 步最后说的 `workflow-events`）；判断失败不会撤销投递。插件定时操作的结果同样以 `plugin-runs` 来源进 Feed（`apps/local-host/src/schedule-operations.ts`）。
- **到期提醒**：Todo 的 `todo.reminders.window` 由助理每分钟询问一次（`AssistantService.sweepReminders`），每个提醒只通知一次，错过的会标明「错过的提醒」。

**通知有三处，没有系统级通知**（`docs/platform/DESKTOP.md` 说明系统通知尚未实现）：

1. Inbox 条目，在 Inbox 插件和项目首页看；
2. 助理通知（`AssistantService.notices`）：工作状态变化、后台任务结束、到期提醒、与工作相关的新资料（每 5 分钟扫一次）；页面每 20 秒读 `/api/assistant/notices`，同一事件一次；人设的规则可以压住；
3. 插件事件里「结果未知」的投递，页面铃铛每 30 秒读 `/api/plugins/runtime/events`，由人在插件市场核对后重试或跳过。

**守住它的用例**：`tests/feed-source-actions.test.ts`、`tests/feed-sources.test.ts`、`tests/feed-inbox-pages-loop.test.ts`、`tests/inbox-action-scenes.test.ts`、`tests/scheduler.test.ts`、`tests/schedule-reminder-recovery.test.ts`、`tests/assistant-reminders.test.ts`、`tests/plugin-notification-bell.test.ts`。

**现状与缺口**

- **定时拉取只对本进程里被打开过的项目生效**（步骤 2）：服务重启后，没人打开的项目不会自己开始拉取。同一个 30 秒定时器里的 `schedule.tick()` 驱动 Schedule 的提醒唤醒和 Agent 定时任务，它们的运行器（`bindScheduledTaskRunner`）也只在项目被网页请求打开时绑定（`apps/local-host/src/web-request.ts`），所以同样受这个限制。统一的周期任务登记是 W4-09。
- Feed 的 `FeedSourceScheduler` 和 Schedule 的 `horizontal/scheduler` 是两套并行的定时机制（`docs/SSOT-MATRIX.md` §6 已写明）。
- 待判断队列（`JudgmentQueue`，`plugins/native/feed/src/judgment-queue.ts`：待判断的 Feed 条目一个数组，待判断的 Inbox 条目一个映射）只在进程内存里。往里放的只有两处，`FeedApplication.ingestItem`（`queueItem`）和 Inbox 条目创建的订阅（`queueEntry`），按这两处的全部引用核对，代码里没有从库重建它的路径；进程在拉取和判断之间退出，条目已落库，判断不会补做。
- 第 7 步的身份在代码注释里还是旧说法：`apps/local-host/src/workflow-feed-options.ts` 的注释写着 `workflow-events` 用于「工作流、来源的定时拉取、Schedule 的唤醒」，实际只有 Schedule 的唤醒用它，注释待改（改注释不改行为，并进文档与代码对齐一类的收尾，或随下一次动这个文件）。同一类的死接线：`apps/local-host/src/web-request.ts` 为网页请求装配的 `web-user` 触发器（`feedOptions`）今天只用来恢复被打断的来源运行（`recoverInterruptedSourceRuns`，不触发判断），传给 `handleFeedNativePluginHttp` 的 `feedOptions` 也没有被读取。
- Feed/Inbox 一组逻辑问题（#50、#51、#53、#54、#57、#58）已由 PR #302 合入 main，表中按合入后的代码写：失败的定时拉取也花掉当次计划；对一条 Item 的归档、保存、开始处理、升格和恢复，对它所有未关闭的 Inbox 条目一并生效；已忽略的 Item 不能被加入或重开 Inbox 条目，来源再次看到它也不会把它带回 Inbox；来源退役时关闭它的故障条目，连同本地历史删除时还删没有任何项目引用的加密正文和搜索记录。

## 7. 链 6：搜索、@ 引用与放置

来源声明 → 索引 → 对象读取器 → 权限 → 打开位置。三个服务（搜索、放置，以及下一链的记忆）按 [系统架构 §3](ARCHITECTURE.md) 属于「平台产品服务」：可以持有跨插件策略和自己的机制记录，不拥有业务事实，对象事实总向所有者读。

| # | 环节 | 归谁 | 输入 → 输出 | 身份与权限 | 失败时 | 事件与记录 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 来源声明 | 插件用 `defineSearchEntriesAction` 声明可搜的对象种类（输入输出类型 `SEARCH_ENTRIES_INPUT_TYPE`、`SEARCH_ENTRIES_OUTPUT_TYPE`），用 `defineSubjectContextAction` 声明对象读取器 | Manifest → 动作目录里的两类动作 | 注册时校验输入输出合同（`searchSourceDeclarationProblems`） | `actions.definition_invalid` | 无 |
| 2 | 建索引 | `horizontal/search/src/index.ts`（`SearchService.catchUp`、`runSync`）；Host 装配 `apps/local-host/src/search-actions.ts` | 来源的集合版本、条目版本 → 增量读取变化的正文 → `{home}/search/search.db` | 用 Host 给的本机用户上下文建索引，结果不随提问者变化 | 一次同步失败不删已有条目；删除只在完整列出之后；项目没打开则稍后再更新 | 触发：成功的命令（`SearchHost.changed`）、提供方注册或撤下（`providerChanged`）、超过新鲜期、`search.rebuild` |
| 3 | 查询 | 系统动作 `search.query`（提供方 `system.search`）← `apps/local-host/src/search-http.ts` | 查询词、范围 → 命中（对象引用、摘要、高亮、状态） | 用调用者自己的权限发现来源，只返回调用者当前可用的来源；有读取器的种类还要求调用者能用该读取器 | `actions.input_invalid`；`empty_scope`；索引未好返回 `indexing` 或 `partial` | 无 |
| 4 | 打开 | 系统动作 `search.open`（`SearchService.open`） | `hit_id` → `ok`、`missing` 或 `unavailable` | 按调用者重新发现来源，用保留的调用授权调原插件的对象读取器；读取器报任何错，都只记作「现在读不到」，不看错误码和措辞，随后用调用者的权限再向来源自己的完整列出（`findEntry`）核对，和建索引判断「已删除」是同一条规则 | `unavailable`：来源已停用、升级或无权限，读取器返回的对象与命中不一致，读取器报错而来源的列出里仍有这个对象（索引条目保留），或按需查询的来源（没有列出可核对，读取器报错或没有读取器都是 `unavailable`）；`missing`：来源的完整列出里没有它，同时把它移出索引；读取器没有、且列出本身读不了时，错误原样抛出 | 无 |
| 5 | @ 引用 | 输入框 `@` → `search.query` → 命中带 `reference` 随 Send 发出；`AssistantService.readReferences` | 命中 → 重新核对并读正文，作为材料 | 以人的上下文调 `search.open` 和读取器 | 引用对象已不存在或读不到：Send 被拒绝并说明原因；若已被移走，说明移到了哪里 | 材料里写明版本；没有读取器就只给搜索摘要并说明不是全文 |
| 6 | 放置 | 系统动作 `placement.link`、`placement.move`、`placement.copy` 等（`apps/local-host/src/placement-actions.ts`）← `apps/local-host/src/placement-http.ts`；服务 `horizontal/placement/src/index.ts` | 对象 + 目的地 → 位置描述、关联、移动、复制、转成 | 改变位置与访问范围的动作只对本机用户（`user`）开放；读取描述的动作（`placement.describe`、`placement.spaces`、`placement.related`、`placement.locate`、`placement.goals`）对 `user` 和 `agent` 开放，创作台生成的插件也看得到（受众规则 `actionReachesAudience`：声明了 `plugin` 受众，或对 `agent` 开放且没有 `plugin: false`，撤不回的除外），工作流不在其内；对象存在性向所有者读 | `placement.project_missing`；所有者报 `not_found` 才是「原对象已删除」，其余是「暂时读不到」 | 关系写在 Home 的 `{home}/placement/placement.db`（Context Ledger 加标题缓存）；用于项目、来自、复制自 |
| 7 | 跨插件移动与复制 | 服务调插件声明的放置协议动作（`PLACEMENT_MOVE_INPUT_TYPE` 等） | 对象 → 新分区里的同一对象 | 受调用者权限约束；移入某项目时指向它的「用于项目」关系自动去掉 | 对象所在的插件没有声明移动或复制协议时，该操作不可用 | 位置索引更新，旧引用经它找到新位置 |

**守住它的用例**：`tests/system-search.test.ts`、`tests/system-search-host.test.ts`、`tests/system-search-lifecycle.test.ts`、`tests/system-search-assistant.test.ts`、`tests/system-search-artifact-open.test.ts`、`tests/work-placement.test.ts`、`tests/work-placement-restart.test.ts`。

**现状与缺口**

- 搜索来源 21 个插件在用，对象读取器 21 个插件加宿主自己在用。`defineSearchQueryAction`（按需查询的来源）在产品里没有生产方，只有 `tests/system-search.test.ts` 的夹具。已定（决定 19）删除，要一起去掉的有：合同定义（`packages/contracts/src/platform/search-sources.ts`）、插件 SDK 的出口（`packages/plugin-sdk/src/index.ts`）、搜索服务里为它留的分支（`horizontal/search/src/index.ts` 的 `querySources`，以及它在 `open` 和查询里的用法）、夹具用例，和 `skills/molis-plugin-dev/search.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`packages/plugin-sdk/README.md` 里的说明（W2-03）。
- 逻辑复查 #22（读取器报「读不到」被当作已删除、条目被移出索引）已由 PR #305 合入 main，表中第 4 步按合入后的代码写；打开时按读取器的错误码和措辞猜「已删除」的旧判断已不在代码里。
- 放置协议的生产方（Dataset、Form、灵光、Pages、PPT、Todo 等）都是构建期插件，没有 Runtime 插件的停用、卸载、升级用例（W4-01）。

## 8. 链 7：记忆

写入门 → 存储 → 召回 → 使用回执 → 在设置里查看与撤销。记忆正文、版本、删除和作用域隔离在 Prologue Memory（经 Agent Host）；开关、写入门、召回编排、候选、最近变动和撤销在 `horizontal/memory`；Host 装配与 HTTP 在 `apps/local-host/src/memory/memory-host.ts`。详见 [Memory](../horizontal/memory.md)。

| # | 环节 | 归谁 | 输入 → 输出 | 身份与权限 | 失败时 | 事件与记录 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 入口 | 系统动作 `memory.write`、`memory.recall`、`memory.change` 等（提供方 `system.memory`）；设置页走 `/api/memory/*`（`handleMemoryHttp`） | 请求 → `MemoryService` | 使用方（助理、Agent、界面、插件、MCP）从可信上下文的受众得出，不从输入读；`memory.recall` 声明了 `user`、`agent`、`workflow`、`plugin`、`mcp`；`memory.list` 声明了 `user`、`agent`（对 `plugin` 可达是按受众规则从 `agent` 带出来的，见缺口）；`memory.write` 声明了 `user`、`agent`、`plugin`，MCP 不能写；其余动作只对 `user` | `memory.forbidden`；`memory.invalid`；`memory.not_found`；`memory.off`（运行时没有记忆能力） | 无 |
| 2 | 写入门 | `MemoryService.write` / `offer`（`horizontal/memory/src/service.ts`） | 文字 + 范围 + 种类 → 写入、替换、重复、候选或拒绝 | 开关、秘密形状、像指令的文字、范围、重复与冲突；Agent 必须带 `said`；插件只能写进自己的命名空间且要有人允许 | 结果是 `outcome`，不是异常：`refused`、`candidate` 带原因 | 每次写入记一条「最近变动」，规则版本写进来源 |
| 3 | 存储 | `prologueMemoryBackend`（memory-host.ts）→ Agent Host 的 Prologue 适配器 | → 记忆条目 | 运行时没起来则先启动 | `memory.off` | 旁表（开关、候选、变动、使用记录、配对）在 `{home}/memory/memory.db`（`openMemoryLedger`） |
| 4 | 召回 | `MemoryService.recall`；助理轮次用 `memoryForRound`，其他 Agent 轮次用 `memoryForAgentRun`，情境判断用 `memory.recall` | 查询 + 情境 → 带出处和类别的条目 | 按使用方的开关取范围与类别；停用、暂停、过期、不适用的不返回；外部 AI 客户端默认读不到个人记忆 | 全部范围被关掉时返回 `state: "off"` 和原因 | 每次召回生成回执，用上的和因预算或上限没带上的都记使用记录 |
| 5 | 使用回执 | `MemoryService.uses` / `settleUses` | 回执 → 设置里「最近用于」 | 本人 | — | 删除一条记忆后，旁表和最近变动里的正文也一并清除 |
| 6 | 查看与撤销 | 设置页 `apps/workbench/src/settings-memory.ts` → `/api/memory/overview`、`/api/memory/changes/<id>/undo` | 变动 → 撤销（写入的删除、替换的还原、停用的恢复） | 只有本人能撤销 | `memory.invalid`（这次变动不能撤销） | 变动标为 `undone` |

**守住它的用例**：`tests/memory-service.test.ts`、`tests/memory-actions.test.ts`、`tests/memory-scopes.test.ts`、`tests/memory-agent-runs.test.ts`、`tests/memory-learning.test.ts`、`tests/memory-upkeep.test.ts`、`tests/assistant-memory.test.ts`。

**现状与缺口**

- 记忆服务里的写入门和候选规则是跨插件的产品策略，不是业务事实；按 N-03 的决定归「平台产品服务」，代码位置不动。
- **记忆的 `plugin` 受众与 MCP 受众：决定 19 已定，代码还没跟上。**
  - **目标（决定 19，2026-10-08）**：MCP 受众保留，并补一条经 `mcp-tools.json` 授权键的用例（今天只有服务层的 `tests/memory-service.test.ts` 用 `consumer: "mcp"` 查过只回项目范围的条目，没有走 MCP 授权的）；`plugin` 受众在有插件真的要用记忆之前标「未启用」。落地是后续项，归 W2-03（同一条决定里删按需搜索的那一片），登记在 §10.2：让目录与「未启用」一致，也就是三个动作不再对 `plugin` 受众提供（三个都加 `plugin: false`，因为它们都对 `agent` 开放，光去掉声明还会被 `actionReachesAudience` 带进来；`memory.recall`、`memory.write` 另从 `audiences` 去掉 `plugin`），创作台的「能力板」随之不再列出它们；有插件要用记忆时，连同宿主确认的插件身份一起重新打开。
  - **今天**：`plugin` 受众在目录层是通的，只是没有人用。`memory.recall`、`memory.list`、`memory.write` 三个动作对 `plugin` 受众都可达（用 `actionReachesAudience` 逐个核对 `memoryActions` 的结果：`memory.recall` 对 `plugin`、`workflow`、`mcp` 可达；`memory.write` 自己声明了 `plugin` 受众；`memory.list` 只声明了 `user`、`agent`，因对 `agent` 开放且没有 `plugin: false`（效果为读，不属于撤不回的）而被带进来；其余动作只对 `user`）。创作台的「能力板」（面向生成插件的动作目录，`apps/local-host/src/plugin-builder/catalog.ts` 的 `capabilityCatalog`）按 `plugin` 受众列目录，这三个都在里面；生成插件装上时要用户授权（`memory:recall`、`memory:read`、`memory:write`），调用时沙箱 broker 再对照这份授权。实际调用的结果与目录不一致：创作台生成插件的调用上下文（`catalogCapabilities`）不带 `host_plugin`，产品代码里只有 `LocalHost.invoke` 在带 `plugin_caller` 的类型化调用上设置它，所以 `apps/local-host/src/memory/memory-host.ts` 的 `caller()` 取到 `plugin_id: null`。后果是：`memory.write` 被 `MemoryService.write`（`horizontal/memory/src/service.ts`）以「插件写记忆必须由宿主确认插件身份」拒绝；`memory.recall`、`memory.list` 照常执行，但用户对某个插件单独放行或禁止的规则（`prefs.plugins[<插件 id>]`）套不上，只剩插件总开关，`recall` 按默认类别（preference、convention）取，`list` 还不按类别过滤（它只看是否允许，不像 `recall` 那样套 `access.kinds`），所以比 `recall` 宽；别的插件写在自己命名空间里的记忆除外，它们对其他调用者不可见。没有使用方的是：没有任何内置插件调用 `memory.*`，仓库里也没有流程消费 MCP 受众（它只对被授权的外部客户端有意义）。
  - 插件开发 Skill 没写插件怎么用记忆。
- 已定未做：自动写入的建议不再由模型的 `same_as` 决定保留别人的建议、撤销自动记忆不删本人明说的内容、`memory.recall` 补写入前复查（#24、#27、#32）。

## 9. 链 8：CLI、安装与升级

`molis-work` 的子命令由 `apps/cli`（命令分发）和 `apps/local-host/src/cli-host.ts`（装配）组成，启动器是 `apps/desktop/launchers/cli/main.ts`。

| # | 环节 | 归谁 | 输入 → 输出 | 身份与权限 | 失败时 | 事件与记录 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 分发 | `apps/cli/src/dispatch.ts`（`dispatchCli`） | 命令行 → `plugin`、`install`、`service`、`demo`、`uninstall`、`v1` 之一 | 本机进程，没有网络身份 | 未知命令打印并返回 1 | 无 |
| 2 | 安装本体 | `apps/local-host/src/installer/home.ts`（`installMolisWorkHome`），入口 `apps/local-host/src/cli-install-service.ts` | 源目录 + 版本 → `{home}/releases/<版本>` 与三个启动器 | 只写 App 自有文件，不创建项目、不改 Runtime 配置 | 失败回滚文本改动和已提升的发行目录 | `{home}/config/installation.json`；结果状态 `installed`、`upgraded`、`refreshed`、`repaired`、`unchanged` |
| 3 | 升级本体 | 同上：同一命令换新源；`inspectRelease` 判断已有发行是 valid、refreshable 还是 missing | 版本不同 → 新的 `{home}/releases/<版本>`；同版本内容变了或损坏 → 暂存后替换，旧目录先改名留作备份（`promoteRelease`），成功后删备份 | 同上 | 暂存或提升失败时还原（`rollbackPromotedRelease`），旧发行保持可用 | 重写三个启动器和 `installation.json`；状态 `upgraded`、`refreshed` 或 `repaired` |
| 4 | 常驻服务 | `apps/local-host/src/installer/web-service.ts`（`MolisWorkWebServiceManager`），命令 `molis-work service` | 动作 → 先预览，`--confirm` 才修改 macOS 用户级 LaunchAgent | 显式确认；计划与确认配对 | `conflict`、`unsupported` 状态；没有计划编号不执行 | 计划与结果回执 |
| 5 | Runtime 接入 | `apps/local-host/src/installer/runtime-integration.ts`（`RuntimeIntegrationService`）；网页 `apps/local-host/src/web-runtime-settings.ts` | 客户端、动作 → 预览，确认后写 MCP 配置与 Skill 链接 | 显式确认；只改带 Molis 所有权收据的条目 | 配置与收据不符报冲突，不执行 | 所有权收据；改动前备份 |
| 6 | 启动 Web 宿主 | `apps/desktop/launchers/web/server.ts`，`molis-work-web`（`apps/local-host/src/web-server.ts`） | Home → 常驻服务；令牌写进 Home | 控制令牌；回环地址 | 不再支持 `--db`、`--project-id`、`--demo`，直接报错 | 令牌文件 `web-control-token` |
| 7 | 数据库版本 | `packages/storage/src/sqlite-baseline.ts`（`applySqliteBaseline`） | 打开任一 Home 库 → 空库建当前基线；同版本放行 | 无 | 版本不符或有表无版本：`storage.schema_version_mismatch`，说明路径、两个版本，不就地升级 | 无 |
| 8 | 项目命令 | `apps/local-host/src/cli-project.ts`（`runV1Cli`）→ `apps/cli/src/command-dispatch.ts` | `v1 init`、`snapshot`、`active-goal`、`goal-tree-*` → typed 的 Goals 能力 | 进程内的 `LocalHost`，直接打开 `--db` 指的项目库 | `Molis Work 数据库不存在` | Goals 自己的事件 |
| 9 | 插件开发 | `tooling/plugin-cli/src/main.ts` → `apps/local-host/src/local-plugin-development.ts` | 插件目录 → 在隔离的开发库里安装、启动、渲染、卸载 | 显式 `allow_unsigned_development`；状态目录必须是带标记的空目录 | 非空普通目录拒绝 | 开发库不进用户项目 |
| 10 | 卸载 | `apps/local-host/src/installer/uninstall.ts`（`MolisWorkUninstallService`），命令 `molis-work uninstall` | 预览 → 确认 | 普通卸载保留用户项目、目录库、备份与日志；清除用户数据是另一次确认，要求完全相同的目录和项目数 | `uninstall.conflict`、`uninstall.plan_missing` | `{home}/config/uninstall.json` 回执 |

**守住它的用例**：`tests/install.test.ts`、`tests/uninstall.test.ts`、`tests/uninstall-catalog.test.ts`、`tests/runtime-integration.test.ts`、`tests/plugin-runtime-integration.test.ts`、`tests/release-assets.test.ts`、`tests/installer-symlink-dependencies.test.ts`。

**现状与缺口**

- 升级只覆盖程序本体；数据库不随升级迁移，版本不符就拒绝。在有真实用户之前，开发用的 Home 由一次性脚本升级或重建（`specs/repository-anti-corruption/spec.md` §4.1）。
- 步骤 8 的 CLI 是第二个进程内宿主，不转发给常驻服务；与「一个 Home 只有一个执行进程」的约束并存，登记在 §10。
- 插件本身的升级是链 4 的第 10 行。随 Host 带来的 Runtime 内置插件（监督器条目标 `bundled`）在 Host 启动时把安装记录升到 Host 带来的版本，保留新 Manifest 仍声明的 grant 并补上必需的；其余的升级要在插件市场确认（`PluginSupervisor.upgradeCandidates`）。
- `installMolisWorkHome` 不清理旧版本的发行目录；新版本只是另起 `{home}/releases/<版本>` 并改写启动器。
- 已定（决定 20）：新增离线快照命令（先让常驻宿主暂停，再拍带清单和版本核对的一致快照），「卸载并清除数据」覆盖库登记表里登记的所有库。这是目标：今天 `molis-work` 的子命令里没有快照命令（`apps/cli/src/dispatch.ts`），步骤 10 的清除按目录与项目数确认。
- 已定（决定 11，只写计划）：第三方插件用 `molis-work plugin install <bundle>` 在本地安装，首次安装确认并记住发布者密钥，在独立进程的沙箱里运行。今天 `molis-work plugin` 只有 `validate`、`create`、`pack`、`identity`、`sign`、`verify`、`dev`（`tooling/plugin-cli/src/cli.ts`），没有 `install`。

## 10. 例外登记

下列路径不符合「能力只有一条路径」或「每项事实一个主人」（10.2 里还有一项是目录开放的范围比已定的决定宽），分两张表：10.1 是长期登记的例外，各自写明理由和删除条件；10.2 是已定要修的偏离，不是例外，写明修在哪一片。新增例外要先改这张表并经评审。

### 10.1 长期登记的例外

决定 7 的范围是宿主设置里的写入：它们保持为只在本机用的管理 HTTP（都在 `authorizeLocalWebRequest` 之后，即回环、控制令牌和一次性键），不进动作目录，助理、Agent 和 MCP 的工具调不到它们；只有删除项目要与 MCP 的删除统一，连接器路由以后搬进各自的官方接入插件（`plugins/official-integrations/`）。盘点的方法：设置页的各栏是 `apps/workbench/src/settings-sections.ts` 的 `HOST_SECTIONS`，逐栏找它写的路由。界面与语言栏的页面没有调用写入路由（`apps/workbench/src/settings-appearance.ts` 里没有 `fetch`）；记忆栏走 `/api/memory/*`，每条写路由调的都是 `memory.*` 动作（`apps/local-host/src/memory/memory-host.ts` 的 `handleMemoryHttp`）；能力库的「判断规则」走 Functions 的 `/api/functions` 与 `/api/functions/<id>/…`，经动作客户端以 `user` 受众调用（`apps/local-host/src/functions-http/route-handlers.ts`），只有 `/api/functions/settings` 不是，下表有一行；调用记录只读（`apps/workbench/src/capabilities.ts` 的 `history` 只渲染列表，页面没有写入调用）。这些不是例外。诊断栏不是只读：它的「Web 常驻服务」区有安装、启动、重启、停止、移除五个按钮（`apps/workbench/src/settings-renderer.ts` 的 `renderDiagnosticsSettings` 里的 `data-web-service-action`），`apps/workbench/src/scripts/settings-web-service.ts` 把它们 POST 到 `/api/settings/web-service/plan` 与 `/confirm`，这两条路由在下表「Runtime 接入与常驻服务」一行里。其余各栏（模型设置、助理、提示词、AI 与执行工具、服务连接、对外接入、诊断里的常驻服务），再加项目目录、首次引导、侧栏浏览器的站点授权和 Runtime 插件的运维，它们的写入路由在下表逐条列出，各有删除条件；这张表之外还没有逐条盘点的只走 HTTP 的写入列在本节末尾。

| 例外 | 在哪里 | 为什么存在 | 删除条件 |
| --- | --- | --- | --- |
| 项目目录：创建 `POST /api/settings/projects`、改名 `POST /api/settings/projects/<id>/rename`、示例数据 `POST /api/settings/demo`、项目里添加与移除插件 `POST`、`DELETE /api/settings/projects/<id>/plugins` | `apps/local-host/src/web-project-settings.ts` | 写的是 Home 级项目目录（owner 是 `modules/projects`），不是插件内容；入口是本机设置页。MCP 的「新建并绑定」是另一条实现（`apps/mcp/src/runtime-context-tools.ts`） | 助理、MCP 或 CLI 需要同一项操作时，把它做成动作，HTTP 改为调用该动作；在此之前保持 |
| 项目目录：删除项目 `POST /api/settings/projects/<id>/delete` | `apps/local-host/src/web-project-settings.ts`，MCP 的删项目工具在 `apps/mcp/src/runtime-context-tools.ts` | 现在是两份实现：网页有终端存活时 409 的保护并释放运行环境，MCP 没有。决定 7 要把这一项统一。删除时别的主人存在 Home 里的数据要一起清，那是 spec §11「删除项目留下别的主人的数据」一组的修复 | W2-07：Web 与 MCP 共用一份 Host 删除服务；之后这个 HTTP 只是它的入口，随上一行的条件处理 |
| 首次引导与个人空间：`POST /api/onboarding/personal`、`/dismiss`、`/initialize` | `apps/local-host/src/web-onboarding.ts` | 写的是 Home 的引导状态，并建项目；`/initialize` 还调用 Goals 的 typed 桥（见 10.2） | 与项目目录一行相同；其中对 Goals 的调用随 W3-07 改走动作 |
| 模型供应商：保存与删除 `POST`、`DELETE /api/settings/models/<provider>`，连通性试验 `POST /api/settings/models/<provider>/test` | `apps/local-host/src/web-model-settings.ts` | 供应商配置属于宿主（`apps/local-host/src/model-provider-store.ts` 的 `ModelProviderStore`，在项目目录库里），密钥存成连接库里的 `model-api` 连接；试验经 `horizontal/agent-host` 的 Prologue 适配器，不写设置 | 模型设置成为插件的设置面，或助理需要代用户改模型时；密钥只给引用的规则不变 |
| 对外接入授权：`POST /api/settings/mcp/actions` | `apps/local-host/src/web-mcp-action-settings.ts`，写 `{home}/config/mcp-tools.json` | 这是 MCP 客户端授权的来源，必须是本人在本机页面上的决定；客户端不能给自己授权 | 不能成为 MCP、Agent 可调用的动作；只有授权改成「只对 `user` 受众开放、目录里对其他受众不可见」的系统动作时才改 |
| Runtime 接入与常驻服务：`POST /api/settings/runtimes/<id>/plan`、`/confirm`（页面在设置 › AI 与执行工具），`POST /api/settings/web-service/plan`、`/confirm`（页面在设置 › 诊断的「Web 常驻服务」，`apps/workbench/src/scripts/settings-web-service.ts`） | `apps/local-host/src/web-runtime-settings.ts`，服务在 `apps/local-host/src/installer/runtime-integration.ts`、`apps/local-host/src/installer/web-service.ts` | 改的是应用之外的文件（MCP 配置、Skill 链接、LaunchAgent），按「先预览、再确认」配对；网页和 CLI 是同一服务的两个入口 | 预览与确认配对成为动作合同，并且这些改动允许助理发起时 |
| 连接器：provider 专属的 OAuth 与设备授权（Gmail、GitHub、Notion、飞书各一组） | `apps/local-host/src/web-connectors-settings.ts` | 授权回调要落在固定的本机地址，凭据落在 Home 的连接库 | 已定（决定 7）以后搬进各自的官方接入插件（W5-11）；搬完后这一行删除。`plugins/official-integrations/` 下今天只有 gmail、github 有自己的接入包（另有 catalog、rss、web-query、youtube）；Notion 与飞书没有，它们只是共用的 `catalog` 包里的两个条目，所以这两组路由要先有各自的接入插件，才满足这个删除条件。回调路径变了，要同步各 provider 的客户端登记 |
| 连接器：按认证方式的通用路由和连接库管理（`/api/settings/connectors/connections`、`.../authorizations/<id>`、`.../methods/…`） | `apps/local-host/src/web-connector-connections.ts`、`apps/local-host/src/web-connector-methods.ts`、`apps/local-host/src/web-connector-api-methods.ts` | 连接库是宿主的（`apps/local-host/src/connector-connection-store.ts`），不属于某个 provider | 没有 provider 专属路由以后，连接库管理成为动作或设置面时再议；此前保持 |
| 判断服务的账号连接：`POST /api/functions/settings`（选择或清除 Functions 绑定的 TypeSafe 连接，另有 `GET` 读状态） | `apps/local-host/src/functions-http.ts` 调 `bindTypeSafeConnection`、`unbindTypeSafeConnection`（`apps/local-host/src/typesafe-connection.ts`），绑定写在 Home 的连接库里（范围 `home`，插件位 `functions`，槽 `typesafe`）；页面是 `apps/workbench/src/functions/settings-client.ts`（设置 › 服务连接） | 选哪个账号给判断服务用是本人的决定；连接库是宿主的，与上一行的通用连接路由同源 | 与上一行相同：连接库管理成为动作或设置面时再议；此前保持 |
| 提示词：`POST /api/agent-definitions/prompt`（保存）、`POST /api/agent-definitions/prompt/reset`（恢复默认）；设置 › 提示词 | `apps/local-host/src/agent-definitions/agent-definitions-http.ts` 直接调 `AgentDefinitions.save`、`reset`（`apps/local-host/src/agent-definitions/agent-definitions.ts`），页面是 `apps/workbench/src/settings-prompts.ts`；库是 Home 的 `agent-definitions` 存储（`AGENT_DEFINITIONS_STORE`） | 改的是模型指令的登记册，一个 Home 一份，不属于任何插件；带 `expected_revision` 防冲突并记历史；页面写明改文字不改变角色能做什么，权限由 Host 在代码里执行。让助理、Agent、MCP 能调它，等于让它们改自己的指令 | 需要代用户改提示词的入口出现，或提示词成为各插件设置面的一部分时；在此之前不进动作目录 |
| 设置 › 助理：`POST /api/assistant/capabilities`（助理能用哪些动作、哪些每次确认）、`POST /api/assistant/rules` 与 `/rules/remove`（不打扰与暂停提醒的规则）、`POST /api/assistant/budget`（每日用量上限）。另有 `POST /api/assistant/memory-prefs` 与 `/memories` 仍挂着，今天 `apps/workbench/src` 里没有页面调用它们（设置 › 记忆走 `/api/memory/*`；记忆系统规格 `specs/archive/memory-system/spec.md` 写明保留这些路径并内部转发） | `apps/local-host/src/assistant/assistant-http.ts` 直接调 `AssistantService`（`saveRule`、`saveBudget`、`saveMemoryPrefs` 等）和 `AssistantStore`，页面是 `apps/workbench/src/settings-assistant.ts`；库是 Home 的助理库（`ASSISTANT_STORE_NAME`，`apps/local-host/src/assistant/assistant-store.ts`） | 这几项约束助理自己：能用什么、花多少、何时不打扰。必须是本人在本机页面上的决定，助理不能给自己放宽 | 改成只对 `user` 受众开放、目录里对其他受众不可见的系统动作时才改（与对外接入授权同条件）；`memory-prefs` 与 `/memories` 两条在确认没有别的调用方后，随助理 HTTP 的下次整理删除 |
| 侧栏浏览器的站点授权：`POST /api/browser/sites`（允许、拦截或忘记某个网站）、`POST /api/browser/assistant`（助理能否使用侧栏浏览器） | `apps/local-host/src/browser/browser-http.ts`，数据在 `{home}/browser/sites.json`（`BrowserSiteDecisions`，`apps/local-host/src/browser/browser-surfaces.ts`） | 这是助理在侧栏浏览器里用哪些网站的授权，与对外接入授权同类：必须是本人的决定，助理不能给自己授权 | 与对外接入授权一行相同 |
| Runtime 插件的运维：`POST /api/plugins/<插件 id>/restart`、`/release-quarantine`、`/upgrade`，`POST /api/plugins/runtime/events/recover` | `apps/local-host/src/coding-surface.ts`（`handleCodingPluginHttp`）调 `PluginSupervisor.restart` 与 `PluginSupervisor.upgrade`（`packages/plugin-runtime/src/supervisor.ts`，经 `apps/local-host/src/plugin-platform.ts` 的平台对象）；`apps/local-host/src/plugin-event-http.ts`（`handlePluginEventHttp`）调 `PluginEventBus.recover`（`packages/plugin-runtime/src/events.ts`） | 重启、解除隔离和升级是人对已装插件的运维决定（升级换版本、解除隔离让被隔离的插件重新运行）；`recover` 是人对「结果未知」的事件投递选择重试或跳过。都要求 POST 确认，处理器在 Host 的监督器与事件总线里，不属于某个插件 | 插件运维成为只对 `user` 受众开放的系统动作（升级与重启带预览、确认配对），或助理需要代用户升级插件时；在此之前保持 |
| 实验里的本地 `grok` 命令行和 `laya` 检查点 | `apps/local-host/src/experiments-executor.ts`、`apps/local-host/src/experiments-grok.ts`、`apps/local-host/src/experiments-process.ts` | 实验要对比本地模型和外部 Agent 运行时，这两类在 Prologue 收敛口径里暂缓；绕过 `horizontal/agent-host`；实验里的 Jev 判断走 Prologue，不在例外内 | Prologue 能经 Agent Host 承载本地模型与外部 CLI Agent 运行时，或实验被移出主线 |
| typed 能力注册表 | `packages/kernel/src/index.ts`（`CapabilityRegistry`）；`apps/local-host/src/local-host.ts` 的 `LocalHost.register` 非动作分支 | 已定（N-12，决定 1）只留作 Runtime 插件的宿主内服务通道：`agent.*`（`packages/contracts/src/services/agent-host.ts`）、`scheduler.wakeup.v1`（`packages/contracts/src/services/scheduler.ts`）、`schedule.*` 等，以 W3-07 重写 PACKAGE-BOUNDARIES §6 时的清单为准；门禁不许再加 | 对外能力不再有 typed 注册：见 10.2 的 Goals typed 桥、两个工作区读 id 和 Casebook；管理入口改走动作（W3-07） |
| CLI 进程内宿主 | `apps/local-host/src/cli-project.ts` | 命令行在没有常驻服务的机器上也要能建项目、读快照 | W3-07 把管理入口改走 Goals 动作；CLI 是否继续在进程内执行，要按「一个 Home 只有一个执行进程」重新评审 |

### 10.2 已定要修的偏离

这些不是长期例外，是已经决定要改、还没改完的偏离；改完就从这张表里删掉。

| 偏离 | 在哪里 | 现状 | 怎么修 |
| --- | --- | --- | --- |
| 宿主直接读 IM 服务的表（越界读表，不是实验） | `apps/local-host/src/im-server.ts` 在 `POST /projects/<id>/api/im/connect` 里用 SQL 直接读 IM 服务库（`{home}/server/server.sqlite`）的 `mw_projects.owner_id` 和 `mw_members.display_name`；这两张表的 owner 是 `server/` 包（`@molis-ai/molis-work-server`）。`apps/server/src/main.ts` 的独立启动器同样直接读 | 右栏「讨论」页签和 IM 代码是在用、还会迭代的产品功能（决定 4）；错的只是三处账目：库没有登记进 Home 数据与备份表，宿主越过包直接读它的表，包被归成基础包而不是业务包 | 决定 4：宿主不再直接读它的表，改经 `server/` 包的公开入口取项目所有者和成员（W2-06，同时加跨主人 SQL 门禁）；`{home}/server/server.sqlite` 登记进 Home 数据与备份表、归类改成业务、SSOT 行同步（W2-12）；`apps/server` 独立启动器的去留随功能迭代另定 |
| Goals 的 typed 桥 | `plugins/native/goals/src/board-entry-capabilities.ts`、`plugins/native/goals/src/goal-event-entry-capabilities.ts`、`plugins/native/goals/src/proposal-capabilities.ts`；调用方 CLI、管理 MCP、`apps/local-host/src/web-onboarding.ts` | CLI 和管理 MCP 仍从这里进；其余入口在产品里没有调用方 | N-12（决定 1）：无生产调用方的先删（W2-08），其余随管理入口改走动作（W3-07） |
| MCP 连接工具读 `actor_id` 参数 | `apps/mcp/src/runtime-context-tools.ts` | 连接发生在项目解析之前，当时没有可信项目身份 | 决定 6：从可信会话取并删参数（W2-07） |
| Casebook 的 5 个 typed 能力与 HTTP | `apps/local-host/src/casebook/integration.ts`（`registerCasebookCapabilities` 登记 `io.molis.work.casebook.interaction-authorization`、`set-interaction-authorization`、`read-interaction-facts`、`read-goal-contexts`、`read-operation-receipts`），`apps/local-host/src/casebook/http.ts`（路径 `/casebook/v1/`） | 外部 Casebook 插件按这些 id 与路径对接，在控制令牌门之前有自己的回环检查（`apps/local-host/src/web-server.ts`） | N-12 与决定 8：改成同 id 的 `plugin` 受众动作，与外部 Casebook 插件一起发版（W3-08） |
| 两个读工作区的重复身份 | 定义 `packages/contracts/src/modules/workspace-artifacts.ts`，登记 `apps/local-host/src/project-capabilities.ts` | 同一处理器同时注册 typed（`projects.workspace.file.read.v1`、`projects.workspace.git.read.v1`）与动作两个 id | N-12：保留动作 id，删 typed id（W2-09） |
| 记忆的 `plugin` 受众在目录里可达，产品里没有使用方；MCP 受众没有走授权键的用例 | `packages/contracts/src/services/memory.ts`（`memory.recall`、`memory.list`、`memory.write` 的 `audiences`）；创作台的「能力板」`apps/local-host/src/plugin-builder/catalog.ts`（`capabilityCatalog`） | 三个动作对 `plugin` 受众可达，创作台会列给生成插件；生成插件的调用不带宿主确认的插件身份，所以 `memory.write` 被拒绝，另两个套不上用户对单个插件的设置（逐项见 §8 缺口）。MCP 受众只有服务层的用例，没有经 `mcp-tools.json` 授权键的 | 决定 19（已定，2026-10-08）：MCP 受众保留并补那条用例；`plugin` 受众标「未启用」，目录里也不再提供（三个动作加 `plugin: false`，`memory.recall`、`memory.write` 另去掉 `audiences` 里的 `plugin`），有插件要用记忆时连同宿主确认的插件身份一起重新打开。后续项，归 W2-03 |

**登记之外**：页面渲染、静态资产、终端和浏览器 WebSocket、面板会话等传输层路由（`apps/local-host/src/web-server.ts`）不是「能力」，不进这两张表，但它们也不能绕开链 1 的步骤 2。IM 服务的路由（`/im`、`/projects/<id>/api/im/connect`）同样是「讨论」页签自己的传输层；它越界读表的问题在 10.2。

**还没有逐条盘点的只走 HTTP 的写入**：下面几组不是宿主设置，是各个功能自己的传输层，没有列进 10.1，也没有检查过它们是否应该是动作；不要把它们当作已经审过。是否登记、登记进哪一张表，还没有定。
- 助理面板自己的路由：`/api/assistant/` 下除设置页用的几条以外的写入（发送、卡片、附件、通知处理 `notices`、取消跟进 `followups/remove`、记忆建议的认可与放弃 `memory-candidates/…`、工作里的操作），在 `apps/local-host/src/assistant/assistant-http.ts`。链 3 只写了发送这一条。
- 插件创作台自己的 HTTP：`apps/local-host/src/plugin-builder/agent-surface.ts` 的 `handleAgentStudioHttp`，路径在 `/api/plugin-builder/studio/` 下，含保存密钥 `POST …/secrets`、`…/settings`、新建构建 `…/builds`、构建里的 `…/action`、`…/call`。
- 首次引导里的整理旅程 `/api/onboarding/context/…`（`apps/local-host/src/web-context-onboarding.ts`）。
- Agent 审批 `POST /api/agent/reviews/decide`、`/api/agent/reviews/recovery`（`apps/local-host/src/agent-review-http.ts`）和首页的 `POST /api/home/…`（`apps/local-host/src/home-dock-http.ts`）。
