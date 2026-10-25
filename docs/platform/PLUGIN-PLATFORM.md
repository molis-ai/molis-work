# Plugin Platform

## 1. 三个组成部分

- `packages/kernel`：Capability 注册、选择、权限判定和生命周期骨架。
- `packages/plugin-runtime`：Plugin 身份、Manifest、签名、安装、grant、隔离、升级/回滚与 Local/Server entrypoint 生命周期。
- `packages/plugin-sdk`：Plugin 作者可使用的稳定 Contract、UI Extension API、测试 fixture 和开发工具接线。

## 2. 身份与安装

- 官方可安装生态由官方发布并审核；第三方源码由用户自行构建和安装。
- 本地 Plugin 默认个人安装、个人数据、不同步。Team 共享是后续方向（Team/Server 目前没有正式实现，见 [SSOT](../SSOT-MATRIX.md)），届时也须用户在 Plugin 内明确选择 Team Project。
- Team Plugin 将由 Team 决定在 Server 上安装和授权；它不能远程安装用户本地 Plugin 或取得个人权限。
- Plugin 身份由发布者签名绑定。签名变化视为新 Plugin，旧 grant、Store 和 Provider Binding 不继承。

## 3. 能力与内容交换

- Module 和 Horizontal Service 对外暴露强类型 Capability。
- Plugin Manifest 声明需要的 Capability、grant、produces/consumes 的成果与过程项类型与 UI Contribution。
- Plugin 不声明对另一个 Plugin implementation 的依赖。
- 人要留存、引用的固定版本走成果（`artifacts.produces`），交给别的插件的数据走过程项（`process_items.produces`）；插件自己的事实留在私有存储，别人经它的动作读取；即时查询/操作直接调用动作目录。
- Artifact consumer 由 `artifact_type_id + schema_version` 匹配，不限制生产者 Plugin。
- **插件调用宿主动作**：Manifest 在 `capabilities.consumes` 里写宿主自己登记的动作 id，并持有该动作要的权限，就能用 `services.actions.invoke` 调它。`consumes` 里写了东西，插件就有 `services.actions`，自己没有动作的插件也一样；`consumes` 是空的而自己又没有动作，就没有这个客户端。现在用到的是工作区的两个读：`projects.workspace.files.read`、`projects.workspace.git.inspect`（要 `workspace:read`；Files、Git、Coding 用，每个读只有这一个 id）。调用按插件受众、用插件自己的 grant、只放行写明的这一个动作，受众、权限、可用性和入参 schema 由内核照常检查；宿主与别的插件的动作都可调用，没写进 `consumes` 的直接拒绝（`actions.forbidden`），停止的实例也拒绝。动作没有它就不能工作时，写进自己的 `action.required_actions`，并把依赖要的权限一并写进该动作的 `permissions`：调用者要持有，目录里才可用。整份文件（`kind: "bytes"`，图片与 PDF 预览）只给宿主运行的、把这个动作写进 `consumes` 的插件：宿主看的是调用里由宿主确认的插件身份（`host_plugin`），不是受众，所以用户、内置 Agent、工作流、MCP 客户端，以及以插件受众调用却没有这个身份的生成（沙箱）插件，都被拒绝（`actions.forbidden`）；入参 schema 里 `kind` 列出 `bytes`，是因为一个读只有一个 id（N-12），对所有调用方都可见，取舍记在防腐 spec §1。用例：`tests/workspace-read-one-id.test.ts`。另有动作目录委托：声明并持有 `actions:delegate` 的插件，在自己运行中的动作里用 `services.actions.directory`，以原调用者的身份、工作流受众调目录里的动作，不列进 `consumes`，只受原调用者的权限约束，调用记录带 `delegated_by`（S-43，用户 2026-10-20 定；用例 `tests/security-invariants-plugin-action-delegation.test.ts`）。
- **插件用本人的服务账号发请求**：Manifest 声明 `connections:use` 和 `connections.slots`（每个槽指向平台登记了固定地址的服务），宿主自己跑的插件就有 `services.connections`，在自己的并发动作或保留的后台作业里向该服务的固定来源发请求。槽绑哪个账号只由人选（`connectors.plugin_slot.bind@1`，只对 `user`）；绑了的由宿主加凭据，插件看不到，没绑就不带凭据；别的来源、内网地址一律拒，跳转原样交回（S-57，用户 2026-10-20 定方案 A；用例 `tests/security-invariants-plugin-connections.test.ts`；写法见 [PLUGIN-DEVELOPMENT](PLUGIN-DEVELOPMENT.md#用本人的服务账号发请求servicesconnections)）。

**v2 把「依赖」这件事说清楚了**（[需求书](../../specs/plugin-platform-v2/spec.md)）。依赖只表达契约，
不表达实现，一共三种，都可被任意满足者提供：

| 种类 | 声明在 | 谁满足 | 不满足时 |
| --- | --- | --- | --- |
| 能力 | `requires[].capability_id@version` | Kernel 注册表里任意 provider | 必需项不满足则不激活，给具名诊断 |
| 端口输入 | `ports.inputs[]` 的 Artifact 类型 | 任意产出该类型的输出端口，由用户连线绑定 | 输入未齐：可激活但不投递，状态 `missing` |
| 事件订阅 | `events.subscribes[].from_plugin_ids` | 明确点名的来源插件；宿主事件（`host.` 前缀）不写来源，只由宿主发 | 来源未安装：静默不匹配，不算故障 |

事件订阅必须点名来源、不许通配符：这是**路由限制**而不是实现依赖，目的是不让第三方插件默默接收别人的事件。宿主事件（X-6）例外：来源只能是宿主，订阅只写类型与版本；写了 `from_plugin_ids`、或订阅宿主没有的 `host.` / `molis.` 类型与版本，读 Manifest 时就拒绝；订阅带权限的广播宿主事件（`host.workspace.changed@1` 要 `workspace:read`）却没声明那项权限的，也拒绝。

Manifest 内部的一致性由解析器保证，而不是留到运行时才炸：声明输出端口必须同时声明 `artifact:write`
且把端口类型列进 `process_items.produces`（交给别的插件的过程项）或 `artifacts.produces`（先固定、再选择进端口的成果）；
输入端口同理对应 `artifact:read` 与 `process_items.consumes` 或 `artifacts.consumes`。一种类型只能是其中一种。

成果与过程项分开存（`specs/archive/artifact-positioning` A2）：成果是人要留存、引用的固定版本，进成果库；过程项是插件之间交换的数据
（文件快照、变更集、运行回执），记在生产插件名下，不出现在成果库、侧栏文件和搜索里。端口发布（`outputs.publish`）一律记成过程项；
插件直接记过程项用 `services.processItems.record`，固定成果用 `services.artifacts.publish`；按引用读取两边都能读到。下一次固定要用的版本号，用 `services.artifacts.head(artifact_id)` 读自己这条成果线的最新版本和它固定时的修订号（项目里还没有就是 `null`，交给 `nextPinnedVersion`）；别的插件开的成果线读不了。读回自己固定的某一版（恢复中断的固定、核对已写的版本）用 `services.artifacts.readOwn(reference)`：已归档的、不在自己 `consumes` 里的也读得到，别的生产者固定的拒绝；`read` 只答插件消费且仍可用的版本。

## 4. v2 的四条运行机制

- **事件流**：类型校验、命名空间归属、按 (订阅者, 来源) 串行、generation 门控、懒激活、撤权。
  事件落项目库，游标绑定订阅安装和世代；同一安装重启可续接未派出的事件，重装从当前日志尾建立新订阅。先持久记录 delivering，再执行处理器；崩溃、撤权等留下的未知结果隔离，不自动重放，不能承诺任意外部副作用 exactly-once。旧无身份游标原样保留为不参与当前投递的历史。正文上限 16 KiB，事件只携带协调事实。
  处理器使用自己的安装身份和 `delivery.signal/beforeEffect()`，不得保存原发布者的临时调用授权；每次异步等待后、产生副作用前重新检查。Files/Git 的刷新端口接收该控制，Host 适配也须检查。停止后的发布 client 不能复用，关闭数据库前 `await events.close()`。
  未知处理在当前项目「插件 → 待核对的插件通知」查看，先核对实际副作用，再填写依据并明确重试或跳过当前一条。重试可能重复副作用，不作为默认选择；关闭弹窗不改变进度。Host 的 `/api/plugins/runtime/events` 与 `/events/recover` 是受控本地用户管理协议，沿用 Runtime 升级/重启的项目及 control-token 边界，不交给插件 clients 或自动 Agent。确认绑定所见 revision、事件、安装世代和版本；过期确认拒绝，决定与历史同事务落库。仅重新启用插件不能解除事件隔离。
- **宿主事件**（X-6，S-54）：宿主自己发、插件按声明订阅的事件。投递方式由合同的类型表（`HOST_EVENT_TYPES`）固定，定向的只能 `notify`，广播的只能 `broadcast`。现在有两条，都在人批准的插件工作区操作执行完、结果定下（成功、失败、不明）时发：
  - `host.review.settled@1`（定向）：发给发起这个审查的那个安装，载荷 `{ review_id, kind, operation_id, workspace_id, outcome }`，别的插件订阅了也收不到；发起的那次激活停了就不发。
  - `host.workspace.changed@1`（广播）：发给本项目里订阅了它、持有 `workspace:read`（Manifest 声明并且已授予）的每个安装，发起的激活停了也发；载荷只有 `{ workspace_id, cause }`，`cause` 是 `"plugin-operation"`（插件发起、人批准的操作）或 `"agent-change"`（Agent 自己经人批准的文字编辑、命令、Git 步骤，按它写到的目录对到项目工作目录，对不上的不发，BL-366），不带审查、操作、结果和发起者，收到就当「这个工作区可能变了，重读」。现在订阅它的是 Git 和 Files（BL-379）。Molis 之外的改动不发。
  投递在 `packages/plugin-runtime/src/host-events.ts` 的 `PluginHostEvents`，不写事件日志：即时、至多一次，不落库、不建游标、不为它启动插件、不重投。收件安装要正在运行、仍启用、安装世代没变、当前 Manifest 订阅了这个类型与版本，还是发出时那一份运行中的贡献；发出时核一次，调用处理器的那一刻再核一次。处理器用同一个 `onEvent`，在动作之外跑，用订阅者自己的身份与 `delivery.signal/beforeEffect()`，抛错只报 `observeFailures`；`source_plugin_id`、`source_install_id` 是 `"host"`，`sequence` 是 0；`correlation_id` 定向的是 `review_id`，广播的是 null。广播给每个收件安装各排一份、各有自己的 `event_id`，发出时与调用处理器时都再核一次权限，中间撤了授权或声明的丢弃。插件拿到的事件客户端只有 `publish`，发不了宿主事件。
  不落库是有意的（10-22 ① 定）：错过一次不丢事实，插件拿 `operation_id` 能读到操作的现状。以后哪条宿主事件真要保证送达，单独设计并先问用户（要升项目库版本、动真实 Home 的维护流程）。X-6 的另一种来源，构建期插件与 Module 写进项目库事件流的领域事件，还没有订阅口。
- **输入图**：端口连线、输入组、固定 Artifact 版本投递、失效先撤权再通知、跨作用域一致性检查。
  连线和端口当前版本都落库，重启后恢复。
- **声明式装配**：导航位置、命令、HTTP 路由全部由 Manifest 推导；路由统一挂在
  `/api/plugins/<plugin_id>/` 下，未声明的路径到不了插件。对外 MCP 就是插件声明的
  `actions`，Host 按客户端授权列入唯一 `molis-work-mcp` 目录；插件不自己开 MCP 进程。`agent.mcp` 是插件内 Agent 调外部 MCP，不是对外贡献。作者步骤见 [Plugin 开发 · 对外 MCP](PLUGIN-DEVELOPMENT.md#对外-mcp)。
- **隔离与重启**：一个插件启动失败只影响自己；显式 `stop` 不消耗崩溃恢复额度；
  启动后必须**兑现** Manifest 声明的视图与路由，否则判为启动失败并撤权。

装配顺序是真约束：事件总线与输入图需要生命周期，生命周期需要 Plugin Runtime，Runtime 需要 executor。
`apps/local-host` 的 `createPluginPlatform` 拥有这个顺序，并用 executor 的 `attach` 接缝收口；
调用方不需要重新发现它。

### 固定成果作为端口输出

`outputs.publish` 为端口生成新 Artifact 版本；`outputs.select({ port, reference, expected_reference })` 则将已有固定成果的精确引用设为端口当前值，不复制正文或改写历史。选择只接受当前项目、当前用户可读、当前插件及相同发布者签名生产的可用版本，类型与 schema 必须符合输出声明；仍需原 `artifact:read` / `artifact:write` grant。

`expected_reference` 比较预览时的原输出，避免旧确认覆盖其他选择；当前已经是目标引用时重试直接返回。连线层持久保存当前引用，沿原输入图投递给声明兼容类型的消费者。生成新版本始终读取端口原 Artifact 身份的最新版本，选择另一成果或旧版本不会回退生成序号。它不替代消费插件的界面、处理流程或业务验收，也不赋予消费者执行权限。

## 5. Native 与 Integration Plugin

Native Plugin 是一级产品入口，组合 Module API 和 UI；它不吸收 Module implementation。所有内置插件都由 molis 发布、带官方签名；Goals 是每个项目都带、工作台里不能移除的插件，其余插件按项目添加或移除。本机偏好用 `settings-page` 挂到 `workbench.settings`，由全局设置目录列出；Feed/Inbox 里的来源和账号仍是插件内容功能，不进全局设置。Functions 事件去向只收录该对象画面上已接线的下一步处置，录取标准与判例见 [Plugin 开发 · 事件去向的动作名单](PLUGIN-DEVELOPMENT.md#事件去向的动作名单)。完整写插件（含 Host 装配、CLI、接入）： [molis-plugin-dev Skill](../../skills/molis-plugin-dev/SKILL.md)。

Integration Plugin 把 Provider 的 Manifest、Local/Server entry、设置 UI、Connector/Listener/Signal/Action Adapter 放在一起。Host 只看 Contract 和 Receipt，不包含 GitHub/Gmail 等 provider 条件分支。

## 6. 安全边界

Plugin 只能在 Manifest 上限和用户实际 grant 的交集内调用；Secret 通过引用交给安全 Adapter；UI 与本地 entrypoint 通过 Host 提供的隔离通道通信。卸载停止代码和 binding，但已保存的 Goal、成果与 Signal 引用仍可安全显示。

## 7. 当前实现边界

v2 已在 Coding、Files、Diff、Git、Text Stats、Shelf 的正式宿主装配中运行（名单见 `tests/builtin-plugin-assembly-gate.test.ts`），
复用 `createPluginPlatform` 的生命周期、Artifact、连线、事件及能力合同；真实 SQLite 重启路径有工程验证。
其他仍标为 `native` 的插件继续由构建期组合装配，该名单冻结、只许减少；新的内置插件只走 Plugin Runtime，不能据 Coding 的接通宣称所有内置插件已迁移。
每个插件的具体产品完成度以自身需求书和正式运行证据为准。

Runtime 以稳定 `install_id` 关联安装记录和私有数据。启动只恢复已安装版本，不会因 Host 提供了较新 Manifest 就改写版本或授权。Manifest 可用 `upgrade_compatibility.compatible_from_versions` 声明新实现可直接兼容的精确来源版本，或用 `migratable_from_versions` 声明仅可经用户手动升级的数据来源；可迁移升级要求插件提供只能读 `storage:private.get` 的 `validateUpgrade` 预检。Host 不做数据迁移；预检通过后目标实现必须直接使用原数据。项目插件市场展示当前项目的候选版本与新旧版本，用户触发升级后 Runtime 校验来源声明、权限保留和数据预检，再切换版本。更高版本升级仍需提高版本号；同版本 Manifest 变更仅在声明兼容当前精确版本时允许继续运行，安装记录指纹保持不变，也不会产生市场候选。内置插件是例外（随 Host 发布，监督器条目标 `bundled`）：启动时安装记录改成 Host 这个构建的清单，版本更高、更低或同版本摘要不同都一样，保留 `install_id` 与私有数据，不恢复旧发行物，也不进市场候选（[发布策略](../releases/POLICY.md)第 7 节）。

Runtime 管理的首方 Native 插件会把其工厂实现打成单文件模块，保存在该项目现有 SQLite 的 `plugin_runtime_release_artifacts` 表中，以插件 ID、发布者签名、版本和 Manifest 指纹绑定。内置插件（监督器条目标 `bundled`）在 Host 启动时跟随当前构建，不从该表恢复旧版：当前构建的发行物照旧写入，但恢复只对不带 `bundled` 的条目生效（`apps/local-host/src/project-plugins.ts` 里带发行物的监督器条目目前都标了 `bundled`，所以这条恢复路径在正式装配里不会触发），此外只有 Schedule 提醒读这张表，按安装记录的版本与摘要取插件显示名。不带 `bundled` 的条目在 Host 重启后若当前候选不兼容已安装版本，就从该表恢复精确旧版，或恢复明确声明兼容该安装版本的已留存实现；兼容候选可以直接运行，但安装记录不变。首次安装、首次运行兼容实现和用户手动升级前都会保存对应发行物。除内置插件外，项目关闭、Host 启动和发布新版本都不会升级安装记录；用户手动升级才调用 Runtime 的预检、切换和回滚路径。发行物不进入插件私有数据，也不另建目录。Plugin Builder 本体也保留 Native 实现；Builder 创建的每个不可变插件发布仍随 Builder 私有数据保存，Host 重启时按 Runtime 安装记录恢复对应发布；发布新版只登记候选，库页手动升级才调用相同的 Runtime 路径。作者约定见 [插件版本升级](PLUGIN-DEVELOPMENT.md#插件版本升级)。

## 8. FD3 历史实现边界

当前参考链路是：Host 安装官方 Manifest → 用户/官方安装流程授予 Manifest 范围内的 grant → Runtime 启动 Plugin → Plugin 返回 Connector Driver 和 Signal Adapter → Listener Host 可靠投递 → Signals Module 保存正式 Signal。

- 安装身份使用 `plugin_id + publisher signature`；记录和引用始终保留 `plugin_id + version`。签名变化产生新安装身份，不继承旧 grant。
- 同一 `plugin_id + version + signature` 的 Manifest 内容不能静默变化；代码变化必须由 Plugin 自己递增 version。
- Runtime 不理解 GitHub/Gmail payload，也不拥有 Source、Signal、Feed 或 Attention 数据。
- Plugin crash 会撤销当前 contribution，可在上限内恢复；uninstall 撤销代码 contribution，但不删除已经形成的 Signal。
- 项目 Runtime SQLite 保留 Runtime 管理的首方 Native 发行物；不带 `bundled` 的条目靠它在 Host 重启后恢复当前安装实现，内置插件（`bundled`）则在启动时跟随当前构建，不靠它恢复（见第 7 节）。其他仍由构建期组合装配的 Native 插件不因此获得版本恢复。不带 `bundled` 的条目若已有安装从未保存过精确发行物，Host 只能在当前候选明确兼容该安装版本时安全接续并归档当前实现；不兼容且没有历史发行物时会保留安装记录并报告不可恢复，不会执行候选代码。Native 插件仍是可信 Host 进程内代码，Runtime 不提供 JavaScript 沙箱；插件创作工作台生成的插件由 Host 放进独立的 macOS 沙箱进程运行（`packages/plugin-sandbox`）。Server entrypoint 仍是后续实现。

当前项目目录通过按项声明的 [项目设置能力](PROJECT-SETTINGS.md) 读取；Workspace 已退出产品导航和运行图。设置槽、项目说明和私有存储保持各自边界。

兼容启动时，`PluginStartContext.version` 表示 Runtime 实际选中的实现版本，供 UI、Artifact 和私有存储客户端验证身份。`install_id` 与 grants 仍来自原安装；安装记录的版本和 Manifest 指纹只在显式升级时改变。崩溃恢复遵循同样规则，停止或崩溃仍撤销该次执行上下文。

首方工作区插件可通过受控制令牌保护的 `POST /api/plugins/:pluginId/restart` 显式重试。达到恢复上限的插件继续隔离，普通重试和页面重开不解除。用户明确选择解除隔离时，Host 通过 `POST /api/plugins/:pluginId/release-quarantine` 发起一次受控恢复；启动成功才解除并重置恢复预算，失败仍隔离。两种操作均不改变安装版本、身份或 grants。

## 9. 合同台账

2026-09-30 之后，动作目录之外又长出一批「插件对平台、平台对插件」的小合同：搜索来源、侧栏文件与浏览器站点声明、放置、撤销、到期提醒、后台任务、情境片段推荐、方法、记忆、插件通知等。台账回答每一项是不是真的接通了：谁定义、谁生产、谁消费、谁守着、写没写进开发手册和 Skill、停用卸载升级撤权后会怎样。它是[防腐整理任务书 §4.10](../prompts/repository-anti-corruption.md)（本轮新合同的全链路）的证据，进度记在 [spec](../../specs/repository-anti-corruption/spec.md)，对照 main（4d59cd4d）读码核对（2026-10-08）；用户在 2026-10-07、10-08 对其中几项做了决定（下称「决定 n」，见 spec §10 的决定表），已定而还没改的写在状态列，标「目标」；逐条款的复核见 [action-architecture §3 的复核小节](../../specs/action-architecture/spec.md)。

### 共同的路径

除「方法」（Manifest 里的一段声明，由宿主登记）、「侧栏浏览器的站点声明」（Manifest 权限上的一段声明，只用于展示）和「插件通知」（走插件事件总线）外，这些合同都走同一条路；记忆、搜索、放置的系统动作由 Host 直接注册提供方，没有 Manifest 声明那一步：

1. **定义**：在 `packages/contracts/src/platform/` 里是 `ActionMetadata` 的一个可选字段，或一对 `input_type` / `output_type` 加规范 schema，以及 `define*` 辅助函数。
2. **声明与校验**：插件把动作写进 Manifest 的 `actions`，`parsePluginManifest` 调 `inspectActionDeclarations` 检查形状（两者都在 plugin-sdk，`src/action-declarations.ts`，内核注册动作时用的是同一个函数）；搜索、片段动作、文件、放置四种协议各自更细的约束由 `src/source-declarations.ts` 里的 `*DeclarationProblems` 检查，协议本身的类型与 Schema 仍在各合同。
3. **注册**：Runtime 插件启动时 `PluginRuntime` 兑现 Manifest（`pluginActionProvider`），构建期插件由 Host 注册；`ActionService.registerProvider` 再检查一次声明。
4. **发现**：消费方向动作目录按 `input_type` / `output_type` 或字段筛选，不另写名单。
5. **调用与授权**：消费方经 `ActionClient.invoke`，权限按它自己的调用上下文核对。
6. **执行与返回**：处理器执行，结果按输出 schema 校验。

停用、卸载、升级、撤权时，动作提供方被注销或标为不可用，消费方下次发现就看不到它。注册和 Manifest 解析时，除逐个动作的形状外，还按同一次注册检查被引用的动作：撤销命令、后台任务状态查询、片段与事项选项的目标都要在同一次注册里、种类与范围对，输入输出里被指的字段和位置要在合同里写出来；声明了的 `result_subject` 要写成对象、位置也要在输出合同里（`inspectActionCrossReferences`，`packages/plugin-sdk/src/action-cross-references.ts`，W3-05）。跨提供方的引用用 `required_actions`，使用时按调用者核对；谁能用目标（受众、权限、效果）也留到使用时。

### 台账

状态词：**生效**＝有真实的生产方和消费方、有守住它的用例；**部分**＝缺其中一项；**未启用**＝合同和校验在，产品里没有生产方，或（对某个受众）没有使用方；这个词只描述产品里有没有人用，不说明代码里是否可达（记忆的 `plugin` 受众是决定 19 在目录里单独关上的一项，见「记忆」一行）。

| 合同 | 定义 | 生产方 | 消费方 | 守住它的用例 | 手册与 Skill | 停用、卸载、升级、撤权 | 状态与缺口 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 对象读取器 `defineSubjectContextAction` | `packages/contracts/src/platform/action-subjects.ts` | 21 个插件加宿主 | 搜索的打开核对、`@` 引用、放置、助理的工作对象 | `tests/system-search.test.ts`、`tests/work-placement.test.ts`、`tests/assistant-mentions.test.ts` | `skills/molis-plugin-dev/continuity.md` | `tests/system-search-lifecycle.test.ts` 覆盖停用、重新启用、重启 | 生效；注册时还接受两种历史输出形状（复核 G3） |
| 搜索来源 `defineSearchEntriesAction` | `packages/contracts/src/platform/search-sources.ts` | 21 个插件 | `horizontal/search` 的 `SearchService` | `tests/system-search.test.ts`、`tests/system-search-host.test.ts` | `skills/molis-plugin-dev/search.md` | `tests/system-search-lifecycle.test.ts` | 生效 |
| 侧栏文件来源 `defineFileEntriesAction`、`defineFileContentAction` | `packages/contracts/src/platform/file-sources.ts` | 8 个插件（artifacts、cognia、dataset、files、images、pages、ppt、shelf） | 侧栏文件页 `apps/local-host/src/side-files-http.ts` | `tests/side-panel-platform.test.ts`、`tests/side-files-artifacts.test.ts` | `skills/molis-plugin-dev/files.md` | `tests/side-panel-platform.test.ts` 用真实 Host 验证一个新插件「声明就加入、停掉就离开」 | 生效 |
| 侧栏浏览器的站点声明 `surface:browser` | Manifest `permissions` 里的 `surface:browser` 加 `origins`：`PluginPermissionDeclaration` 与 `browserSiteDeclarations`（`packages/contracts/src/platform/plugin-manifest.ts`）；`parsePluginManifest`（`packages/plugin-sdk/src/manifest.ts`）要求每个来源是完整的网站来源、不带路径、查询串或片段，别的权限不能带 `origins` | 无：`plugins/` 下没有任何 Manifest 声明它 | 插件市场卡片与「添加到本项目」的提示（`apps/workbench/src/plugin-catalog.ts` 的 `sites`，显示在 `apps/workbench/src/immersive-shell.ts`，「会在侧栏浏览器里使用：…」）；插件命令行 `validate` 的 `browser_sites` 输出（`tooling/plugin-cli/src/cli.ts`） | `tests/side-panel-platform.test.ts`（接受与拒绝的来源写法、命令行输出） | `skills/molis-plugin-dev/ui.md` | 声明只是告诉用户，没有任何运行时检查读它：侧栏浏览器本身（`apps/local-host/src/browser/`）归 Host，站点的允许与拦截是用户在浏览器里的决定（`BrowserSiteDecisions`），助理动手也按那里的规则逐步确认（`skills/molis-plugin-dev/ui.md`）；声明随 Manifest 走，没有单独的登记，所以停用、卸载、升级时没有要同步的东西 | 未启用：合同、校验、展示、手册和用例都在，产品里没有生产方，也没有执行路径依赖它；没有单独的删除决定，这里只标状态 |
| 成果库的预览、固定、比较、继续、引用 | `packages/contracts/src/platform/file-sources.ts`（预览）、`artifact-pins.ts` | 预览 8 个插件；固定、比较、继续 4 个（dataset、form、pages、ppt）；引用 1 个（pages） | Goals 的固定（`apps/local-host/src/goal-callers.ts`）、侧栏的预览（`apps/local-host/src/side-files-http.ts`）、成果库的「从这一版继续」（`apps/local-host/src/artifact-native-plugin-http.ts`）、引用查询（`apps/workbench/src/plugin-catalog.ts`） | `tests/artifact-continue.test.ts`、`tests/artifact-source-and-links.test.ts`、门禁 `tests/artifact-type-gate.test.ts`、`tests/artifact-declaration-gate.test.ts`、`tests/action-artifact-references.test.ts` | `skills/molis-plugin-dev/elements.md`；[PLUGIN-DEVELOPMENT 成果类型声明](PLUGIN-DEVELOPMENT.md#成果类型声明)；辅助函数从插件 SDK 导出（W2-03） | 门禁守声明；停用类用例见侧栏一行 | 生效；解析 Manifest 时对所有插件查显示名、预览与固定/比较/继续的引用（W3-05-2，v1 不能产出成果类型）；成果库的目录只读内置插件，Runtime 与已安装插件声明的成果今天没有读取方（BL-132） |
| 工作流内容站 `defineWorkflowContentActions` | `packages/contracts/src/platform/workflow-content.ts` | 9 个插件（artifacts、dataset、feed、form、inbox、jelly、lingguang、pages、ppt） | 工作流的保存与运行、放置的「转成」 | `tests/workflow-content-actions.test.ts`（含「保存的版本在撤回与升级后保留」） | `skills/molis-plugin-dev/placement.md`、`host.md` | 同左 | 生效 |
| 放置协议 `defineObjectMoveAction`、`defineObjectCopyAction` | `packages/contracts/src/platform/placement.ts` | 移动 6 个插件（dataset、form、lingguang、pages、ppt、todo），复制 5 个（同上，没有 todo） | `horizontal/placement` 的 `PlacementService` | `tests/work-placement.test.ts` 与 4 个浏览器用例 | `skills/molis-plugin-dev/placement.md` | 生产方都是构建期插件，没有 Runtime 插件的停用、卸载、升级用例 | 生效；缺生命周期证明（W4-01） |
| 事项动作 `defineSubjectOffersAction` | `packages/contracts/src/platform/action-offers.ts` | Feed、Inbox | 首页事项动作 `apps/local-host/src/home-offer-actions.ts`、情境条 | `tests/home-offer-actions.test.ts`、`tests/home-offers.e2e.test.ts` | 无 | `tests/home-offer-actions.test.ts` 覆盖派发时撤权 | 生效；注册时查选项目标在同一次注册里、范围相同、支持选项的事项种类（W3-05）；Skill 没写 |
| 首页事项事件 `defineHomeEventsAction` | `packages/contracts/src/platform/home-events.ts` | Feed、Inbox、Todo、Work | 首页、助理的「新资料」扫描 | `tests/home-event-actions.test.ts`、`tests/home-events.e2e.test.ts` | 无 | `tests/home-event-actions.test.ts` 覆盖返回时撤权、停用的来源 | 生效；开发手册与 Skill 没写 |
| 撤销声明 `undo` | `packages/contracts/src/platform/actions.ts` | Pages、Todo、灵光 | 助理（免确认资格、撤销按钮） | `tests/assistant-undo.test.ts`、`tests/assistant-undo-refresh.e2e.test.ts` | 只有 `docs/platform/PLUGIN-DEVELOPMENT.md` | 无 Runtime 插件的用例 | 生效；注册时查撤销命令在同一次注册里、是同范围的命令、输入字段对得上、位置在输出合同里（W3-05）；Skill 没写 |
| 到期提醒 `defineDueRemindersAction` | `packages/contracts/src/platform/due-reminders.ts` | 只有 Todo | 助理的提醒扫描 | `tests/assistant-reminders.test.ts`、`tests/todo-actions.test.ts` | 只有手册（例子已改成只有 Todo 在用，W2-03）；辅助函数从插件 SDK 导出（W2-03） | 无 | 部分：单一生产方；Skill 没写；没有停用或撤权的用例 |
| 后台任务回报 `background_job` | `packages/contracts/src/platform/actions.ts` | 只有炼金术士 | 助理的 `AssistantJobs`：工作图上的一步，由宿主的等待经状态查询结束（prologue-adoption §6.0o） | `tests/assistant-business-gateway.test.ts`、`tests/prologue-work-jobs.test.ts` | 只有手册 | 跟踪途中撤权：每次看都按工作此刻的授权核对，拒绝即不再跟进（S-27，`tests/security-invariants-external-checks.test.ts`）；插件停用时读不到，连续 5 次后不再跟进，没有单独的用例 | 部分：单一生产方；注册时查状态查询在同一次注册里、是同范围的查询、任务标识与状态的位置在合同里（W3-05） |
| 情境片段推荐 `defineFragmentOffersAction` | `packages/contracts/src/platform/action-fragments.ts` | Goals、灵光、Pages、Todo，另有搜索 | `packages/kernel/src/contextual.ts`、`apps/local-host/src/contextual/` | `tests/contextual-fragment-offers.test.ts`、`tests/contextual-interaction.test.ts`、`tests/contextual-dock-parity.test.ts` | 无；辅助函数从插件 SDK 导出（W2-03） | 用例不涉及生命周期 | 部分：缺手册、Skill 和生命周期用例；注册时查选项目标在同一次注册里、范围相同（W3-05） |
| 页面操作卡 | 路由 `/api/assistant/cards`（`apps/local-host/src/assistant/assistant-http.ts`）、`AssistantService.offerFromPage` | 工作台的情境中枢 `apps/workbench/src/scripts/client/context-bus.ts`（浮条的接线在 `context-bar.ts`，浮条本身是设计系统的页面程序 `context-toolbar.ts`；三者由 `context-actions.ts` 拼成一个脚本） | 助理：按当前目录核对后放成一张卡，点击才执行 | `tests/assistant-business-gateway.test.ts`、`tests/contextual-interaction.e2e.test.ts` | 无 | 同一条消息只放一次；卡的动作在点击时重新核对 | 生效；路由缺失（404、405）时退回页面消息的分支是死代码，已删（W2-03）。放卡失败后：经「记录」执行的操作把错误交给情境条显示；没有页面接手、分屏页没接手和助理起点这三条路径则打开助理，带上原话和材料，不在情境条显示错误 |
| Manifest `methods` | `packages/contracts/src/platform/plugin-manifest.ts`；校验 `inspectMethodDeclarations`（`packages/plugin-sdk/src/agent-declarations.ts`，由 `parsePluginManifest` 调用，只许业务工具） | 2 个构建期内置插件：Pages（会议纪要整理，`plugins/native/pages/src/methods.ts`）、Todo（整理待办与推进待办，`plugins/native/todo/src/roles.ts`） | 助理：`AssistantService.methods` 按提供方是否可用过滤，调用走读方法 | `tests/assistant-methods.test.ts`（Pages）、`tests/todo-plugin.test.ts`（Todo 的两个方法登记）、`tests/plugin-methods-runtime.test.ts` | 只有手册 | 插件运行时由定义登记（`apps/local-host/src/plugin-instructions.ts` 的 `registerPluginAgentDefinitions`），内置、Runtime 与已安装插件同一条路（PG-051）；停下后按「未运行」留在设置里、方法不给别的 Agent | 完成（决定 18、W4-02、PG-051） |
| 记忆 `memory.*` | `packages/contracts/src/services/memory.ts` | 平台自己（`horizontal/memory`） | 助理、Agent 轮次、设置页、情境判断（受众 `user`、`agent`）；外部 MCP 客户端只能召回（`memory.recall`，经本人在 `mcp-tools.json` 里的逐客户端授权） | `tests/memory-service.test.ts`、`tests/memory-actions.test.ts`、`tests/assistant-memory.test.ts`、`tests/memory-scopes.test.ts`、`tests/memory-mcp.test.ts`（MCP 授权键）、`tests/agent-built-plugins-catalog.test.ts`（创作台能力板） | 无；Skill 没写（插件今天不能用记忆） | 使用方开关随调用重读；MCP 授权撤销后工具立即消失（`tests/memory-mcp.test.ts`） | 生效；`mcp` 受众保留（决定 19，已补授权用例）。`plugin` 受众未启用：产品里没有插件用记忆，生成插件的调用也不带宿主确认的插件身份。`memory.recall`、`memory.list`、`memory.write` 都带 `plugin: false`，`memory.recall`、`memory.write` 的 `audiences` 也去掉了 `plugin`，所以目录对插件不提供它们，创作台的能力板把它们列在「不开放给插件」里。有插件要用记忆时，连同宿主确认的插件身份一起重新打开；`MemoryService` 里按插件命名空间与类别的规则留着。后续项：设置页「谁可以用」里的「插件」开关文案（`apps/workbench/src/settings-memory.ts`）还写着插件能读到偏好和约定，与未启用不符，改成未启用或隐藏是用户可见的文案改动，另行决定。详见 [Memory](../horizontal/memory.md) 与 [CALL-CHAINS §8](../system/CALL-CHAINS.md) |
| 插件通知（结果未知的事件投递） | `packages/contracts/src/platform/plugin-events.ts`；`packages/plugin-runtime/src/events.ts` | Runtime 插件的 `events.publishes` | 底栏铃铛、插件市场的核对界面 | `tests/plugin-events.test.ts`、`tests/plugin-event-recovery.test.ts`、`tests/plugin-notification-bell.test.ts` | `skills/molis-plugin-dev/elements.md` | 撤销启用丢弃旧世代的事件、撤销后的投递不确认成功（`tests/plugin-events.test.ts`） | 生效 |
| 效果 `effect` | `packages/contracts/src/platform/actions.ts`（`actionEffect`） | 所有动作（未写时按能力 id 推断） | 内核的受众可见性、能力网关、情境推荐、助理免确认资格 | `tests/action-plugin-audience.test.ts`、`tests/assistant-undo.test.ts` | `skills/molis-plugin-dev/capabilities.md` | 不适用 | 生效；`withActionEffect` 已从插件 SDK 导出（W2-03） |
| 作者 `authorship` | 同上 | Goals 的命令 | MCP 来的无会话客户端在派发处被拒，含嵌套调用；助理与内置 Agent 的作者由宿主记、页面上是本人，所以不检查（2026-10-10 决定） | `tests/mcp-goal-events.test.ts`、`tests/action-authorship-dispatch.test.ts` | `skills/molis-plugin-dev/capabilities.md` | 不适用 | 按设计：只管外部 AI 工具（复核 G9，2026-10-10 决定后关闭） |
| 插件调用宿主动作（`capabilities.consumes` 加 `services.actions`） | `apps/local-host/src/plugin-executor.ts`（`PluginHostExecutor`）；动作 `workspaceReadActions`（`packages/contracts/src/modules/workspace-artifacts.ts`） | 宿主（`apps/local-host/src/project-capabilities.ts` 登记两个工作区读） | Files、Git、Coding 三个 Runtime 插件 | `tests/workspace-read-one-id.test.ts`、`tests/files-git-actions.test.ts` | `packages/plugin-sdk/README.md`、本文第 3 节；Skill 没写（`skills/molis-plugin-dev/host.md` 还只讲 `services.capabilities`，待 W1-12 的回放工具就绪后补，路线图 W2-09 后续） | `tests/workspace-read-one-id.test.ts` 覆盖没写 `consumes`、没有 grant、实例停止的拒绝，以及自己没有动作的插件 | 生效；只到宿主的动作，别的插件的动作不开放（W3-06 的平台服务另定）；Skill 未更新 |
| 插件的 Home 库服务 `services.database` | 类型 `packages/contracts/src/platform/plugin-database.ts`（`PluginDatabase`、`PluginDatabaseDeclaration`），经 `platform/plugin.ts` 导出；连接 `apps/local-host/src/plugin-database.ts`（`openPluginDatabase`） | 宿主：Home 级实例由 `HomePluginExecutor` 按目录条目的 `database` 给出；项目里的实例由 `PluginHostExecutor` 按启动名单条目的 `PluginPlatformEntry.database` 给出（W3-06 D，名单检查 `apps/local-host/src/plugin-database-entries.ts`） | Home 级：Issue；项目级：暂无，只有测试夹具（Todo、Form 迁到 Runtime 时是第一批） | `tests/issue-home-runtime.test.ts`、`tests/plugin-project-database.test.ts`（含生产的每项目路径：`MolisWorkLocalHost` 的 `pluginFixtures` 经 `host.actionClient` 写库）、`tests/bundled-plugin-grants.test.ts`（沙箱定义不能当内置插件授予全部权限） | `docs/platform/PLUGIN-DEVELOPMENT.md`「个人 Home Runtime 与插件 SQLite」、`skills/molis-plugin-dev/host.md` | 停用、卸载、撤权后一律拒绝，停止开始后插件自己的 `stop` 也写不进去，旧句柄在重启后仍无效；卸载不删库；`uninstall --purge-user-data` 清 `PERSONAL_HOME_SQLITE_STORES` 里的库目录，项目级声明的库名必须在这份清单里且不是宿主自己的库，否则名单不启动 | Home 级生效；项目级未启用：合同、名单检查和用例都在，生产名单里还没有条目声明库。宿主自己的库名拒绝名单（`HOST_LIBRARY_NAMES`）是临时的，Home 条目与项目条目之间库名是否重复运行时也不查，两者等 W4-11 的 Home 库登记表；每个项目的实例各持一对连接 |
| 插件的项目库服务 `services.project_database` | 类型同 Home 库（`packages/contracts/src/platform/plugin-database.ts` 的 `PluginDatabase`），声明是 Manifest 的 `databases.project`；客户端 `apps/local-host/src/plugin-database-client.ts`（`pluginDatabaseClient`，与 Home 库共用），装配 `apps/local-host/src/plugin-project-library.ts`（`openPluginProjectLibrary`），逐句检查 `packages/plugin-runtime/src/project-database-statements.ts`（`pluginStatementGuard`）；沙箱一侧 `packages/plugin-sandbox/src/database.ts`（`sandboxDatabase`），合同 `platform/plugin-sandbox.ts` 的 `SandboxSdk.projectDatabase` | 宿主：`PluginHostExecutor` 对经 Plugin Runtime 启动、声明了 `databases.project` 的插件给出（`apps/local-host/src/plugin-host-services.ts` 的 `openProjectTables`）；沙箱插件经 broker（`apps/local-host/src/plugin-builder/installed.ts`） | Schedule 已使用公共项目库与事务；Coding 已声明表、启动时拿到它，代码改用它是 ③ 的 C1 | `tests/security-invariants-plugin-project-database.test.ts`、`tests/security-invariants-plugin-original-caller.test.ts`、`tests/installed-plugin-execution.test.ts`（真沙箱，取消与撤权） | `docs/platform/PLUGIN-DEVELOPMENT.md`「项目库里插件自己的表」、`skills/molis-plugin-dev/host.md` | 停用、撤权、取消、别的安装、停止之后一律拒绝（S-18）；表与账本不符的插件不启动（S-46）；升级预检拿不到它 | 生效，Schedule 为生产使用方。创作台写不出 `databases.project`，防腐收尾后删除（BL-377）；沙箱插件的 Home 库等 L4 |
| 插件的模型服务 `services.model` | 类型与限额 `packages/contracts/src/platform/plugin-model.ts`（`PluginModelClient`、`PLUGIN_MODEL_LIMITS`），经 `platform/plugin.ts` 导出；规则 `packages/plugin-runtime/src/model-service.ts`（`createPluginModelClient`）与 `action-scope.ts` | 宿主：`PluginHostExecutor` 对宿主自己运行（非沙箱）、Manifest 声明 `model:invoke` 或只读的 `model:read`（只开列表与 `availability()`）、平台有 Home 的插件给出，端口 `apps/local-host/src/plugin-model-service.ts`（W3-06 E） | 暂为测试夹具（`pluginFixtures`）；Form、Todo 迁移后补 | `tests/plugin-model-service.test.ts` | `docs/platform/PROLOGUE-AI.md` 第 4 节、`skills/molis-prologue-ai/SKILL.md`、`skills/molis-plugin-dev/host.md` | 同左：停用、撤权、取消、动作返回之后的调用都有用例 | 生效；不含选定模型、图片输入、后台任务里调模型、Home 级实例（`HomePluginExecutor`）上的模型 |

### 维护规则

- 新增这类合同，先在上表加一行再合入：要写清定义位置、至少一个真实消费方、守住它的用例和手册与 Skill 的位置；没有消费方的合同不合入，或明确标「未启用」。
- 没有生产方又没有计划的合同删掉，不留空壳：按需搜索来源 `defineSearchQueryAction` 已按决定 19 删除（W2-03：定义、SDK 出口、搜索服务的分支、夹具用例和说明一起去掉），台账不再留行；Manifest 里再这样声明会被搜索来源检查拒绝。
- 「生命周期」一列写不出用例的，就是缺口，不要写「已验证」。一个能被移除的探针插件把这些合同全部走一遍，是 W4-01。
- 表里的数字（生产方个数）以源码里的使用为准，改动时重数：`git grep -l -w <辅助函数名> -- plugins apps modules horizontal ':!*.md' ':!*.test.ts'`，再把命中的文件归到各自的包（一个插件目录、一个应用算一个），数包而不是数文件；说明文档（README、手册）和用例里的出现不算生产方。
