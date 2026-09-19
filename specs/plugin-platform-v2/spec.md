# Plugin Platform v2：合并 FlyLeaf 插件内核，落地 Coding App

状态：进行中。本文件是这次行为变更的唯一需求书。

落地结果的复查见 [架构复查](architecture-review.md)；Coding 插件的界面与交互设计见
[`specs/coding-plugin/design.md`](../coding-plugin/design.md)。

它取代以下位置对「插件能声明什么、宿主怎么装配、插件之间怎么交换」的旧表述：

- `docs/platform/PLUGIN-PLATFORM.md` §3「Plugin 不声明对另一个 Plugin implementation 的依赖」——结论保留，但**依赖的表达方式**改由本文定义（端口 / 能力 / 事件类型三种契约依赖）。
- `docs/platform/PLUGIN-PLATFORM.md` §4「Native Plugin 是一级产品入口」——Native 不再等于编译期硬编码装配。
- `packages/contracts/src/modules/projects.ts` 的 `BUILTIN_PROJECT_PLUGIN_IDS` 写死 5 个 id。
- `apps/workbench/src/ui-composition.ts` 里 `createWorkbenchUiHost()` 逐个 `host.register(...)`。
- 各插件各写一套 Route Table（`ShelfPluginRouteTable`、Feed routes、Artifact routes…）。

Goal 事件协议、Artifact 版本语义、Module 事实所有权、MCP 工具契约不变。

## 背景与目标

我们有两套已经跑通的插件体系，强项正交：

**Molis Work** 强在身份与持久：publisher 签名 + manifest digest + `install_id`、带 reason/required 的 grant、生命周期状态机、崩溃恢复计数、可重放 receipt；Artifact 落 SQLite，有 `artifact_type_id + schema_version`、producer 身份、scope、availability/archive、inline/blob+digest 和消费兼容检查。

**FlyLeaf** 强在协议与运行语义：manifest 是纯数据，声明**端口**（typed artifact port）、视图/命令、事件发布订阅（订阅必须显式限定来源插件）、输入组、窄输入能力、Agent 清单、显式协作；`InputGraph` 负责工作区连线、固定快照投递、失效撤权与一致性校验；`EventBus` 负责类型校验、命名空间归属、按源 FIFO、generation 门控、懒激活与撤权；单插件故障隔离与重启；统一 Review 拥有全部副作用审批。

目标：把 FlyLeaf 的**声明与运行语义**合并进 Molis Work 的**身份与持久**里，两边能力都保留，然后在这个体系上落 Coding App 插件。完成后新插件只写自己的包 + 一条注册声明，不改宿主启动、导航挂载或任何 plugin-id 分支。

## 当前行为与问题证据

- `packages/contracts/src/platform/plugin.ts`：`PluginContribution` 只有 `PluginIntegrationContribution` 一种；`PluginHostServices` 只有 `storage / artifacts / ui`。没有事件、没有端口、没有 Agent。
- `packages/contracts/src/platform/plugin-manifest.ts`：`capabilities.provides/consumes` 与 `artifacts.produces/consumes` 只做格式校验，**没有任何解析器消费它们**——声明了也不影响启动顺序或可用性。
- 全仓 grep 无事件总线：只有各 Module 内部的 `observed_event_cursor`（幂等游标）和 `runtime-host` 的 `subscribe`（单 Runtime 的 JSON-RPC 转发）。插件之间只能靠 Artifact 轮询。
- `apps/workbench/src/ui-composition.ts` 逐个 `host.register(...)` 21 个 contribution；新增插件必须改这个文件。
- `packages/contracts/src/modules/projects.ts:29` 的 `BUILTIN_PROJECT_PLUGIN_IDS` 是字面量联合类型；`modules/projects/src/project-service.ts:88` 用它做校验；新增项目级插件要改 contract + 服务 + 迁移。
- `apps/local-host` 里 `feed-native-plugin-http.ts` / `shelf-native-plugin-http.ts` / `artifact-native-plugin-http.ts` 是三份同形状的手写挂载。
- `PluginRuntime` 只被 `OfficialIntegrationRegistry` 用于 Integration；Native 插件从不经过安装、grant、崩溃恢复这条链。

## 范围与非目标

### 做

1. **Manifest v2**：`schema_version: 2` / `host_api_version: 2`，新增端口、事件、视图、命令、路由、Agent、协作、依赖声明；v1 manifest 继续可解析并自动投影为 v2。
2. **持久事件流**：项目库落 `plugin_events` + `plugin_event_cursors`；类型校验、命名空间归属、按 (订阅者, 来源) FIFO、generation 门控、懒激活、撤权、重启续投、失败可观察。
3. **端口与输入图**：项目库落 `plugin_port_bindings` + `plugin_input_groups`；固定 Artifact 引用投递、失效撤权、输入组选择、跨输入一致性校验。
4. **依赖解析与激活顺序**：能力依赖拓扑排序决定激活顺序；端口**不参与排序**——消费者懒激活、输入齐备才投递，所以两个插件互喂不同类型不构成环。环、缺必需能力、不可满足端口类型都给具名诊断，不静默降级。
5. **单插件隔离**：一个插件启动失败或崩溃只影响自己，兄弟实例状态保留，可单独重启。
6. **声明式装配**：视图（navigator/stage/inspector/settings）、命令、HTTP 路由全部从 manifest 生成；删除 `ui-composition` 逐个 register、`BUILTIN_PROJECT_PLUGIN_IDS` 写死与各插件 plugin-id 分支。
7. **Agent Host**：新横向服务 `horizontal/agent-host`，统一 Agent 运行契约（角色、Prompt、Skill、MCP、子 Agent、检查点、Review、用量），两个 adapter：Prologue（主）与 CLI Runtime（辅）。
8. **存量全量迁移**：goals / feed / inbox / artifacts / sessions / shelf / work 七个内置插件迁到 v2 声明式装配。
9. **Coding App 插件**：`modules/coding` + `plugins/native/coding`，把 FlyLeaf coding-agent 的业务语义搬过来，UI 按 Molis Work 现行设计体系重写。
10. **脚手架与文档**：`molis-work plugin create --kind app` 生成可直接跑的 v2 插件；更新 `docs/platform/*` 与 `docs/SSOT-MATRIX.md`。

### 不做

- 不做不可信插件沙箱、热更新、独立分发或第三方市场上架流程（签名与打包沿用现有 DV3/DV4 边界）。
- 不做工作流图编辑器、插件间自动编排。
- 不改 Goal 事件协议、MCP 工具 schema、Artifact 版本与 scope 语义。
- 不把 Review/审批权交给插件：副作用审批始终归宿主。
- 不引入 React 到 Workbench；Coding UI 用现有服务端渲染 + 客户端脚本体系。
- 不做 Team Server 上的 Plugin Host（`apps/server` 仍是 `absent`）。

## 使用场景

1. **装新插件**：用户在插件市场启用 Coding。左栏出现 Coding 段，主工作面出现 Coding 页；宿主没有为它写过一行分支。
2. **连线**：Coding 的 `project` 输入在当前项目里只有 Projects 一个候选，自动绑定（origin=`unique`）；`files` 有多个候选时显示为「待选择」，用户在插件设置里选一次，落库。
3. **事件**：Coding 真实落盘后发 `coding.file-changed`；Files 插件订阅到并刷新。Files 当时没启动 → 宿主懒激活它再投递；Files 启动失败 → 只有 Files 显示故障，Coding 不受影响，事件留在游标上等重启续投。
4. **失效**：用户切项目。Coding 的 `project` 输入失效，core 先撤权，Coding 显示真实取消原因，正在跑的 Run 被取消，迟到结果只回原会话。
5. **Coding 主链**：选角色 → 提交任务 → Agent 读代码 → 提出修改 → 宿主统一 Review 里看 Diff → 批准 → 真实落盘拿回执 → 批准跑一条检查命令 → 结果回到同一 Run → Agent 给结论 → 保存固定 Report Artifact。
6. **开发新插件**：`pnpm molis-work plugin create --kind app my-tool` → 填 manifest 端口 → `plugin dev` 跑起来 → 在项目里启用。不改宿主。

## 方案与关键决策

### D1 依赖只表达契约，不表达实现

保留「Plugin 不声明对另一个 Plugin implementation 的依赖」。v2 提供三种**契约**依赖，全部可被任意满足者提供：

| 依赖种类 | 声明位置 | 满足者 | 不满足时 |
| --- | --- | --- | --- |
| 能力 | `requires[].capability_id@version` | Kernel Capability Registry 里的任意 provider | `optional=false` 则插件不激活，给具名诊断 |
| 端口输入 | `ports.inputs[].artifact_type_id@schema_version` | 任意产出该类型的插件输出端口，由 binding 绑定 | 输入未齐：实例可激活但不投递，状态 `missing` |
| 事件订阅 | `events.subscribes[].from_plugin_ids` | 明确列出的来源插件 | 来源未安装：订阅静默不匹配，不算故障 |

P2 实现时确认了一条比初稿更稳的规则：**只有能力依赖决定激活顺序**。端口若也参与拓扑排序，
Coding 产出 ChangeSet 给 Diff、Diff 又把选区回给 Coding 这类正常数据流会被误判成环。改用 FlyLeaf 已验证的
懒激活 + 齐备投递后，端口只贡献「没有任何插件能产出该类型」这一类诊断。

事件订阅点名 `from_plugin_ids` 是**路由限制**不是实现依赖：不允许通配符，防止第三方插件默默接收别人的事件；来源缺失只表示没有匹配，不阻止激活。

### D2 事件流落库（对 FlyLeaf 的升级）

FlyLeaf 的 EventBus 是内存的，进程重启即丢。Molis Work 的事件写项目 SQLite，取得：重启续投、按游标重放、可观察日志、至少一次 + 按 `event_id` 幂等。

投递语义沿用 FlyLeaf 已验证的那套：publish 只做类型校验与接受（返回 `accepted` + ref），投递异步；按 (订阅者, 来源) 串行 FIFO；用 generation 号门控，撤权后旧信封直接丢弃；投递时才懒激活订阅者；订阅者启动失败记录 failure 并保留游标。

正文上限 16 KiB（与 FlyLeaf 同值），超限拒绝并要求改走 Artifact 引用。事件不是内容通道。

`flyleaf.` / `host.` 保留前缀改为 `molis.` / `host.`；插件只能发布自己命名空间（`<plugin_id>.`）下的事件类型。

### D3 端口投递的是持久固定引用（对 FlyLeaf 的升级）

FlyLeaf 投递的是内存快照，重启只能靠 retain/restore 手工恢复。Molis Work 的 Artifact 本来就是 `artifact_id + version` 的持久版本，所以端口投递直接投固定引用：重启后输入图从库里重建，消费者拿到同一版本，不需要插件自己维护 restore 逻辑（`retain/restore` 仍保留为跨项目/跨会话显式保留的入口）。

一致性校验保留 FlyLeaf 的做法：Artifact 类型提供不透明的绑定作用域键（如同一 Project），core 只比较键，不读业务字段；混合来源在投递前撤权。

### D4 视图 / 命令 / 路由全部声明化

- **视图**：`slot` 取 `navigator | stage | settings`，对应 Workbench 现有的三处真实区域：240px 目录栏、带标签页的主工作区、全局设置目录。渲染机制仍是现有 `UiContribution.render(request) => string`，v2 只增加**位置声明**，不改渲染契约。
  初稿还写了 `inspector`，但工作台当前是 `48px 图标栏 + 240px 目录栏 + 主工作区` 三栏，没有右侧检视区。先不声明一个无处安放的位置；将来真加右栏时，manifest 补一个 slot 即可。
- **命令**：进全局命令菜单与内容动作，`input_kinds` 沿用 FlyLeaf 的 `current | object | agent-session | artifacts`。
- **路由**：manifest 声明 `{route_id, method, path, permission}`，宿主统一挂到 `/api/plugins/<plugin_id>/<path>`。迁移期为七个内置插件保留旧路径别名，别名表随迁移逐个删除。

### D5 Agent Host 与两个 adapter

`horizontal/agent-host` 拥有 Agent 运行契约，不拥有模型、凭据或业务语义。

- **Prologue adapter（主）**：`@prologue/sdk/node` 的 `createNodeHost`。local-host 本来就是 Node single writer，Session/Run、审批 Review、Diff/命令/检查点、子 Agent、用量回执整条链可直接复用 FlyLeaf 已验证的语义。
- **CLI Runtime adapter（辅）**：复用现有 `horizontal/runtime-host` 与 PTY，把 Claude Code / Codex 等 CLI 当 runtime。能力矩阵按能力申报（`supported | partial | unsupported`），产品按矩阵降级显示，不假装支持。

两个 adapter 实现同一 `AgentRuntimeAdapter`。**审批始终归宿主 Review**，adapter 只报告待审操作与执行回执。

### D6 存量迁移一次到位

七个内置插件全部迁到 v2。`BUILTIN_PROJECT_PLUGIN_IDS` 字面量联合改为运行期插件注册表：项目插件启用表存 `plugin_id TEXT`，外键指向注册表，不再用 CHECK 约束。已有项目按现有启用集合原样迁移，不改用户可见的启用状态。

### D13 写权限必须经宿主审批，两个 adapter 各自如实申报（P6 实现时确认）

**审批桥**把 Prologue 的待批副作用摆到宿主 Review 队列：Prologue 停下来等，用户在宿主审查面决定，
桥才回答 Prologue。关键语义由测试锁住——

- 批准先消费宿主的一次性授权再回答执行主人，重放的决定授权不了第二次写入；
- **是否真授权以执行主人的回答为准**，不以我们的记录为准：用户批了但 Prologue 没认，回执就写
  `effect_settled: false` 并给出原因，不谎称已发生；
- 拒绝、过期、已被执行主人关闭的待批都不能换个入口变成许可；`later` 不是放行。

**CLI adapter**（Claude Code / Codex）真能跑只读任务：命令行上用 `--allowedTools` /
`--disallowedTools` 把写入工具**在进程层面拒掉**，不靠提示词自觉；`stream-json` 投影成 turns、
工具活动与真实用量，没报用量就显示未知而不是填 0。

但它的 `text-edit` / `command` **申报为 unsupported**——不是因为 CLI 做不到，而是因为它的审批发生在
自己的权限模型里，**不经过宿主 Review 队列**。报成支持就等于放行一次没有记录批准的写入。
要打开它需要一个 permission-prompt 工具把询问转回宿主队列；在那之前，宿主会拒绝 Builder 角色落在它上面。

### D12 Prologue 以 vendor tarball 进仓，执行接线分两步（P6 实现时确认）

SDK 打包为 `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1.tgz`，`file:` 依赖，与仓库里既有的
`@adeptify/intelligence-client`、`@adeptify/search-evidence-layer` 同一做法。好处是构建不依赖
另一个仓库是否克隆在同级目录；代价是 Prologue 更新要重新打包。已验证在本仓可正常加载。

adapter 分两步，**当前只完成第一步**：

1. **会话层（已完成）**：`createNodeHost` + `createRuntime`（`read-only` / `on-request`）、
   真实创建与读取 Prologue Session、按宿主提供的模型配置报告健康。SDK 的 import 只出现在
   `adapters/prologue-node.ts` 一个文件里，其余代码对着窄端口写，因此不需要真实模型就能测。
2. **执行层（未开始）**：`startAgentRun` 需要授权工作区根、冻结 character 和工具集；任何会写的
   角色还需要把 Prologue 的待批副作用桥接到宿主 Review 队列。

能力矩阵如实反映这一点：`session.create` / `session.read` 为 supported，`run.start`、`text-edit`、
`command` 等全部 `unsupported`，调用即明确拒绝。**不把没接通的东西报成支持**——否则宿主的启动授权
会放行一个实际上不会执行的 Run，或者更糟，放行一个绕过审批的写入。

### D11 启动授权归宿主，Runtime 不能自己扩权（P6 实现时确认）

`AgentHost.start` 在把请求交给任何 Runtime 之前先过三道宿主自己的闸：角色必须是插件 Manifest 声明过的、
该角色需要的能力 Runtime 必须**真的**支持（能力矩阵里 `unsupported` 就是不能用，不降级不伪装）、
目录必须是宿主授权且 realpath 已核过的。

启动之后还有一道：Runtime 返回的冻结角色权限若与 Manifest 不一致，该 Run **立刻取消**。
一个声称自己拿到了 `workspace-write` 的只读角色不能继续跑下去。

Review 队列的批准是**一次性**的：`consumeApproval` 消费过就不能再授权第二次写入；拒绝与过期都不能
换个入口变成许可；停止一个 Run 会撤回它名下仍在等待的条目。批准不等于已经发生——`effect_settled`
只有在真实回执回来后才为真。

### D10 内置插件先声明化，运行时托管随 Coding 落地（P5 实现时确认）

六个内置插件（Goals / Sessions / Inbox / Feed / Shelf / Artifacts）现在各自拥有 v2 Manifest，
声明自己的视图位置、图标与顺序；工作台的导航栏和全局设置目录改为从 `BUILTIN_PLUGIN_CATALOG` 推导，
`DIRECTORY_PLUGINS` 那份写死列表已删除。等价性由测试逐项锁住，用户看到的导航一字未变。

它们的 `kind` 仍是 `native` 而不是 `app`，这是**如实标注**而非折中：它们目前仍由构建期组合装配，
没有跑在 Plugin Runtime 的隔离与生命周期里。把它们改成运行时托管的前提是先把各自依赖的 Module 能力
注册进 Kernel Capability Registry（Shelf 需要 shelf store、Feed 需要 connector 等），否则 `start()`
拿不到依赖。这条链路由 Coding 插件作为**第一个完整运行时托管的 app 插件**打通，再回头迁移存量；
在那之前把它们标成 `app` 会让 Manifest 说谎。

`project_plugins` 的 `CHECK (plugin_id IN (...))` 已删除，改由运行期 `ProjectPluginRegistry` 校验，
catalog schema 15 → 16。已有项目的启用状态原样保留（迁移测试直接构造旧表并断言行内容不变）。

### D9 端口当前值与作用域键（P3 实现时补充）

端口投递需要知道"这个输出口现在是哪个版本"，这不是 Artifact 历史能直接回答的问题。新增
`plugin_port_outputs`（board、plugin、port → artifact_id/version/失效原因/作用域键）作为端口的 head：
publish 推进它，invalidate 撤回它，重启后从它恢复连线现状。

跨来源一致性用**生产者附带的不透明作用域键**：Host 只比较键是否相同，从不解析其中的业务字段；
键为空表示不施加约束。两个已绑定输入的非空键不一致时，在投递前判为 `inconsistent` 并撤权。

另有一条在实现中确认的规则：**generation 是"启用世代"，不是"启动次数"**。若每次启动都递增，
懒激活会让触发它的那条事件自己失效（实测复现）。现在只有撤销启用才递增，重启不影响已排队的工作，
配合按 (订阅者, 事件) 去重，`resume` 可以反复调用而不会重投。

### D8 显式停止（P2 实现时补充）

原 `PluginRuntimeApi` 只有 `start` / `reportCrash` / `recover` / `uninstall`：想重启一个正常运行的 Plugin，
只能先谎报一次 crash，而 `recover` 会消耗崩溃恢复额度并在三次后隔离。用户主动点「重启」不该被当成崩溃。

因此新增 `stop(installId)`：停止运行中的 Plugin，保留安装与 grant，状态转为已有的 `disabled`，
再由 `start` 拉起。`PluginLifecycleReceipt.operation` 相应新增 `stop`。崩溃恢复路径不变，
`recovery_count` 只由真实崩溃推进。

同时，Plugin 启动后必须**兑现** Manifest 声明：声明的视图/路由没给出、给出未声明的视图/路由、
借用别的插件身份、声明了订阅却没有 `onEvent`，都判为启动失败并撤权。这类结构化诊断会原样传给用户
（"声明的视图 main 没有兑现"），不被压成通用的「启动失败」；只有不透明的 entrypoint 异常才降级为安全文案。

### D7 兼容策略

v1 manifest 继续解析：`parsePluginManifest` 按 `schema_version` 分派，v1 投影为 v2（`artifacts.produces/consumes` → 单端口 `default` 输入/输出；`ui.contributions` → 无位置声明的视图）。已安装 v1 实例不因升级失效；`manifest_digest` 基于原始 v1 字节计算，不因投影变化。

## 输入输出与依赖

- 输入：现有 Plugin Runtime / Kernel / UI Host / Artifacts Module / Runtime Host；FlyLeaf `packages/core` 的 plugin / events / inputs / runtime / agent 语义；Prologue SDK Node Host。
- 输出：v2 平台契约与实现、七个迁移后的内置插件、Agent Host 与两个 adapter、Coding Module 与插件、脚手架与文档。
- Host 装配 Module、事件表、输入图、HTTP 与 Agent Host；Workbench 只按声明组合 UI。

## 文件 / 模块边界

允许改：

- `packages/contracts/src/platform/{plugin,plugin-manifest,ui,events,wiring,agent}.ts`
- `packages/contracts/src/services/agent-host.ts`、`packages/contracts/src/modules/{projects,coding}.ts`
- `packages/{kernel,plugin-runtime,plugin-sdk,ui-host}/**`
- `horizontal/agent-host/**`
- `modules/coding/**`、`plugins/native/coding/**`
- 七个内置插件的 `manifest` / 注册入口（不重写其业务实现）
- `apps/local-host`（装配、迁移、HTTP、Agent Host 接线）、`apps/workbench`（声明式导航与视图组合）
- `tooling/plugin-cli`、`docs/platform/**`、`docs/SSOT-MATRIX.md`、`PRODUCT.md`

不改：Goal 事件协议与 `goal-event-state`；Artifact 版本/scope/可用性算法；MCP 工具 schema；Feed/Inbox/Shelf/Sessions 的业务写入语义；`archive` 与 `.impeccable` 证据。

## 数据

项目库新增（`board_id` 为现有项目库身份）：

```
plugin_events (
  event_id       TEXT PRIMARY KEY,
  board_id       TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
  sequence       INTEGER NOT NULL,
  event_type_id  TEXT NOT NULL,
  type_version   INTEGER NOT NULL,
  source_plugin_id TEXT NOT NULL,
  source_install_id TEXT NOT NULL,
  payload_json   TEXT NOT NULL,
  correlation_id TEXT,
  occurred_at    TEXT NOT NULL
)
UNIQUE (board_id, sequence)
INDEX (board_id, event_type_id, type_version, source_plugin_id, sequence)

plugin_event_cursors (
  board_id, subscriber_plugin_id, source_plugin_id, event_type_id, type_version,
  delivered_sequence INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL,              -- idle | delivering | retry_wait | quarantined
  retry_at TEXT, last_error_code TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY (board_id, subscriber_plugin_id, source_plugin_id, event_type_id, type_version)
)

plugin_port_bindings (
  board_id, target_plugin_id, target_port,
  source_plugin_id TEXT, source_port TEXT,
  origin TEXT NOT NULL,             -- user | default | unique
  created_at, updated_at,
  PRIMARY KEY (board_id, target_plugin_id, target_port)
)

plugin_input_groups (
  board_id, plugin_id, group_id, updated_at,
  PRIMARY KEY (board_id, plugin_id)
)

plugin_registry (
  board_id, plugin_id, version, kind, manifest_json, enabled INTEGER NOT NULL,
  installed_at, updated_at,
  PRIMARY KEY (board_id, plugin_id)
)
```

HTTP（项目前缀下）：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/plugins` | 注册表、启用状态、依赖诊断 |
| POST | `/api/plugins/:id/enable` · `/disable` · `/restart` | 单插件生命周期 |
| GET | `/api/plugins/:id/ports` | 端口、候选来源、当前绑定与状态 |
| POST | `/api/plugins/:id/ports/:port/bind` | 提交绑定（用户选择） |
| POST | `/api/plugins/:id/input-group` | 提交输入组选择 |
| GET | `/api/plugin-events` | 事件日志（可观察，非插件读取通道） |
| ANY | `/api/plugins/:id/*` | manifest 声明的插件路由 |

## 实施阶段

| 阶段 | 内容 | 出口证据 |
| --- | --- | --- |
| P0 | 本 spec + 契约草案评审 | **已完成**：本文件，三条路线与 D4/D6 已确认 |
| P1 | 契约 v2：manifest / events / wiring / ui / agent | **已完成**：contracts 构建通过；`tests/plugin-manifest-v2.test.ts` 8 项 |
| P2 | Kernel + Plugin Runtime：依赖解析、激活顺序、隔离重启、app contribution | **已完成**：`tests/plugin-dependency-resolution.test.ts` 8 项、`tests/plugin-isolation-restart.test.ts` 8 项 |
| P3 | 事件流落库 + 输入图落库 | **已完成**：`tests/plugin-events.test.ts` 9 项、`tests/plugin-input-graph.test.ts` 9 项、`tests/plugin-durable-coordination.test.ts` 真实 SQLite 重启 1 项 |
| P4 | 声明式装配：视图/命令/路由；删除硬编码分支 | **机制已完成**：`UiViewRegistry`、`PluginRouteRouter`、`tests/plugin-declarative-mounting.test.ts` 7 项。宿主接线与硬编码分支删除随 P5 逐个插件进行 |
| P5 | 存量插件迁移 | **已完成声明化**：六个内置插件各自拥有 v2 Manifest；导航/设置由目录推导，`tests/plugin-declarative-mounting.test.ts` 断言与原写死列表逐项一致；`tests/project-plugin-registry.test.ts` 4 项覆盖注册表与迁移 |
| P6 | Agent Host + Prologue adapter + CLI adapter | **已完成（未经真实模型端到端验证）**：宿主授权、审批桥、能力注册、两个 adapter 的只读执行。`tests/agent-host.test.ts` 15 项、`tests/prologue-approval-bridge.test.ts` 8 项、`tests/prologue-stream.test.ts` 10 项、`tests/cli-agent-adapter.test.ts` 11 项 |
| P7 | Coding App 插件 + 脚手架 + 文档 | **设计已确认（2026-09-19）**：[`specs/coding-plugin/design.md`](../coding-plugin/design.md) 的布局经 UI 稿评审定稿，见其 §14。右栏把运行预览与命令回执拉进首版，相应缺口已记进 §12。实施未开始 |

每阶段结束跑 `pnpm typecheck:all` 与 `pnpm boundary:check`；不跨阶段合并证据。

## 验收

1. 新增一个插件只需：新建包、写 manifest、在注册表加一条声明。`apps/workbench` 与 `apps/local-host` 不出现该插件 id。
2. `ui-composition.ts` 没有逐个 `host.register`；`BUILTIN_PROJECT_PLUGIN_IDS` 字面量联合被注册表取代。
3. 插件 A 发事件、插件 B 订阅：B 未启动时被懒激活；B 启动失败只影响 B；重启后从游标续投且不重复投递。
4. 端口输入缺失 → 消费者状态 `missing` 且不投递；来源失效 → 先撤权再通知；混合项目来源在投递前被拒绝。
5. 声明依赖成环或缺必需能力 → 具名诊断，相关插件不激活，其余插件正常。
6. 七个内置插件迁移后行为不变，已有项目启用集合不变。
7. Coding 插件完成一次真实主链：读代码 → Diff → 批准 → 落盘回执 → 批准命令 → 结果回同一 Run → 结论 → 固定 Report Artifact；未批准时零写入。
8. Agent Host 在 Prologue 与 CLI 两个 adapter 下都能报告能力矩阵；不支持的能力显示为真实不可用，不伪造成功。
9. `molis-work plugin create --kind app` 生成的插件在干净副本里可构建、可启用、可见。

## 验证

```bash
pnpm build:all
pnpm typecheck:all
pnpm boundary:check
```

```bash
pnpm exec tsx --test --test-concurrency=1 \
  tests/plugin-manifest-v2.test.ts \
  tests/plugin-dependency-resolution.test.ts \
  tests/plugin-events.test.ts \
  tests/plugin-input-graph.test.ts \
  tests/plugin-isolation-restart.test.ts \
  tests/plugin-declarative-mounting.test.ts \
  tests/agent-host.test.ts \
  tests/coding-plugin.test.ts
```

真实桌面：启用 Coding → 选项目 → 提交只读任务 → 切 Builder 提交修改任务 → Review 批准 → 落盘 → 批准检查命令 → 看结论与 Report。

## 假设与开放问题

- Prologue SDK 以 `file:` 工作区依赖引入（与 FlyLeaf 同做法）还是先 vendor 一份，待 P6 开工前确认。
- CLI adapter 首批只接 Claude Code 与 Codex；Grok 按需要再加。
- 事件日志保留策略（按条数还是按天）留到 P3 定，默认不自动清理。
- Coding 的 Writers / 多 worktree 协作在 FlyLeaf 侧标记为「未验收」，本期只搬已验收的单 writer 主链，多 writer 排到 Coding 第二期。
- 插件市场的上架/审核流程不在本期；市场页只列本地注册表。
