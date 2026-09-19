# Plugin Platform v2：架构复查

2026-09-19。本文是对 [需求书](spec.md) 落地结果的一次复查：架构上哪里不清晰、实现是否符合架构、
是否经得起扩展、已有插件与能力是否都整合到位。

**这不是验收报告。** 已修的部分有测试佐证；未修的部分在下面如实列出，不因为"机制已具备"就算整合完成。

## 1. 复查中发现并已修的问题

### 1.1 契约声明了服务，装配却从不提供

v2 契约给 `PluginHostServices` 加了 `events` / `inputs` / `outputs` / `capabilities` 四个成员，
但 `PluginHostExecutor` 只装配 `storage` / `artifacts` / `ui`。插件真去用会拿到 `undefined`——
机制建好了却没接到发服务的地方。

**已修**：executor 现在按 Manifest 声明装配这四个服务；声明了才给，没声明就没有。
`tests/plugin-host-services.test.ts` 用真实 Artifacts 模块与 SQLite 断言了这条对应关系。

### 1.2 装配存在真实的构造环

事件总线与输入图需要生命周期 → 生命周期需要 Plugin Runtime → Runtime 需要 executor →
executor 需要总线与输入图。这是环，不是顺序问题。

**已修**：executor 增加一个显式的 `attach` 接缝，并由 `apps/local-host` 的 `createPluginPlatform`
拥有整个装配顺序。环被摆在明面上，而不是藏进某个懒读的全局。

### 1.3 Manifest 内部可以自相矛盾，要到运行时才炸

声明了输出端口却不声明 `artifact:write`、或端口类型没列进 `artifacts.produces`，
解析都能通过，直到第一次 publish 才被 Artifact 客户端拒绝。

**已修**：解析器现在要求端口与权限、端口类型与 `artifacts.produces/consumes` 一致。
作者在校验期就知道，而不是上线后才发现。

### 1.4 Agent Host 不在任何索引里

新增的横向服务没有进 SSOT 矩阵、没有 `docs/horizontal/` 条目，文档里的"4 个横向运行服务"也没更新。

**已修**：SSOT 增行、`docs/horizontal/agent-host.md` 新建、计数更正为 5。

### 1.5 横向服务一个 Capability 都不对外暴露

架构规定插件通过官方 Capability 调用能力，但四个横向服务没有任何 `HostCapabilityDefinition`。
Coding 插件要起一次 Run，按当时的代码**无路可走**。

**已修**：Agent Host 定义了 8 个 Capability（运行时列表、角色可用性、会话、Run 启动/读取/控制、
审查队列读取），并提供注册入口 `registerAgentHostCapabilities`。**批准动作刻意不做成 Capability**——
那是用户在宿主审查面里的动作，开成插件可调的能力就等于让插件批准自己的副作用。

按本文自己的判据补一句：**这些能力目前只有测试在注册，生产装配没有调用这个入口**
（和 2.1 同一个原因）。说"路通了"是对的，说"已经在跑"就不对。

2026-09-19 补充：能力增至 9 个（加了 `agent.command-output.v1`），`local-host` 暴露了
`registerCapability` 接缝。**当晚这句话不再成立**：`composeAgentHost` 已经在
`apps/local-host/src/web-server.ts` 里被调用，CLI 运行时真的注册进去了，
插件经 Capability 拿得到运行时列表、角色可用性与启动授权
（`tests/agent-host-composition.test.ts` 5 项，含目录授权那道闸的两条反例）。

仍然没有接的是**审查面的挂载**：渲染器写好了，但还没有页面挂它。

### 1.6 契约缺口：adapter 拿不到角色 Prompt

`AgentStartRequest` 只有 `role_id`。Prompt 正文归插件所有，adapter 不能自己编，也没有别的来源。

**已修**：新增 `AgentFrozenRole`，由 Host 从插件自己的声明里冻结后交给 adapter。
CLI adapter 现在真的把角色 Prompt 组进这一跑；拿不到冻结角色时**拒绝起跑**，
而不是跑一个没有角色约束的 agent。

### 1.7 vendored SDK 把解析不了的传递依赖带进了产品安装图

把 Agent Host 加进根依赖后，`@prologue/sdk` 进入产品运行时依赖图，而它硬依赖
`@tauri-apps/api`。安装器会传递遍历每一个 `dependencies`，解析不到就**拒绝安装**——
这是它有意的不变量。pnpm 只把该包放进 `.pnpm`，从 SDK 的软链路径按标准 ancestor
规则找不到，于是 install / uninstall / npm-package / runtime-payload / e2e 整族失败。

**已修**：`horizontal/agent-host` 显式声明 `@tauri-apps/api`，`scripts/workspace-packages.mjs`
的 `extraDependencies` 同步列上。这条约束对**以后每一个 vendored SDK** 都成立：
vendor 一个包，就要把它自己的运行时依赖一起变成可解析的，否则产品装不上。

### 1.8 顺带发现（不属于本次插件工作）：purge 没有真的 purge

复查回归时发现 `uninstall --purge` 之后家目录仍然留着 `sessions/`（含 sessions.db 与内容
blob）和 `shelf/`（用户上传的文件）——`purgeDataPaths` 是一张写死的清单，Shelf 与 Session
的家目录存储进来之后没有同步扩。测试本来就断言 purge 之后家目录必须消失，所以这是实现
没跟上既定意图。**已修**：两个目录纳入 purge 清单。

### 1.9 契约和实现各写各的，因为没有任何东西把两者绑在一起

整理代码时做了一次"导出了但没人引用"的扫描，捞出两处**契约已经和实现对不上**的地方。
它们都不是笔误，而是同一个结构性原因：契约类型只是摆在那里，没有任何代码声明自己实现它，
于是实现怎么改，契约都不会报错。

- **`AgentHostErrorCode` 声明了 8 个错误码，实际抛出的是 17 个**。10 个真实存在的码
  （`model_not_configured`、`role_not_frozen`、`runtime_duplicate`、`runtime_missing`、
  4 个 `review_*`、2 个 `pending_*`）压根不在契约里；同时契约声明的 `agent.review_required`
  **从来没有被抛出过**。五个错误类各写各的内联联合类型，互不相干。
- **`PluginWiringApi` 的每个方法签名都和 `PluginInputGraph` 不一致**。契约按 board 和 actor
  逐个方法传参，实现则是"一个实例服务一个 board"，board 在构造时就固定了。这是更早一版设计
  留下的形状，没人实现它，所以没人发现。

**已修**：错误码联合改为覆盖全部 17 个真实码并按领域分组，五个错误类一律用
`Extract<AgentHostErrorCode, ...>` 收窄——抛一个契约里没有的码现在**编译不过**（已用反例验证）。
`PluginWiringApi` 改成实现的真实形状，`PluginInputGraph` 声明 `implements PluginWiringApi`。

**规则**：契约类型必须有东西声明实现它，否则它就不是契约，只是注释。

### 1.10 `boundary:check` 不是类型门禁

根 `tsconfig.json` 的 `include` 只有 `apps/desktop/launchers/**`，所以 `pnpm boundary:check`
里那步 `tsc` **根本不覆盖 packages / horizontal / plugins**。整理过程中 `agent-host` 一度有
语法错误，`boundary:check` 照样报 `"errors": []`。

真正的全量类型门禁是 `pnpm workspace:typecheck`（`typecheck:all` 把三者串起来）。
**改完这些包要跑的是它，不是 `boundary:check`。**

## 2. 仍然存在的缺口（如实列出）

### 2.1 v2 平台尚未在运行中的产品里组装

`createPluginPlatform` 存在、经过真实 SQLite 重启验证，但**生产装配根没有调用它**。
今天跑起来的产品仍是构建期组合的那套。

这不是遗漏，是顺序：平台只有在第一个 v2 app 插件（Coding）存在时才有东西可托管。
但它必须被说出来，否则"平台已完成"会被读成"产品已在用"。

### 2.2 六个内置插件是 `native` 而不是 `app`

它们各自拥有 v2 Manifest 并驱动导航与设置目录，但仍由构建期组合装配，没跑在 Plugin Runtime 的
隔离与生命周期里。前提是先把它们各自依赖的 Module 能力注册进 Kernel Capability Registry
（Shelf 要 shelf store，Feed 要 connector，等等），否则 `start()` 拿不到依赖。

**标成 `app` 会让 Manifest 说谎**，所以它们现在标 `native`。

2026-09-20：**Coding 已经走通这条链路并标成 `app`**——产品经 `coding-surface.ts` 起平台、
启动它、用它的 contribution 渲染目录。六个存量插件仍是 `native`，迁移可以照 Coding 这条路逐个做。

### 2.3 只有 Goals 把能力注册进了 Kernel

`registerProjectCapabilities` 注册了约 30 个 Goals 能力；Projects、Artifacts、Shelf、Feed、
Sessions 以及 connector/listener/runtime 三个横向服务，**一个都没有**。

这是 2.2 的直接原因，也是插件间"按契约依赖"目前只能依赖 Goals 的原因。

### 2.4 Prologue 的执行未经真实模型验证

`startAgentRun` 的接线已完成：授权工作区根、从冻结角色生成 character、事件流投影、
控制面（停止/取消/暂停/恢复/转向）都已接上，只读角色可以真实起跑。

**但没有用真实模型端到端跑过。** 参数组装由编译器对着 SDK 自己的类型检查，
adapter 逻辑通过窄端口用替身测过；一次真实 Provider 的完整 Run 没有做。
`horizontal/agent-host/src/adapters/prologue-node.ts` 的文件头如实写明了这一点。

2026-09-19 补充：**审批桥现在可以挂到这个 Runtime 上了**。`PrologueAgentAdapter` 接受一个
`approvals` 桥；不挂时 `text-edit` 照旧申报不支持、会写入的角色被拒，挂上之后才申报支持，
并且 Run 停下等的每一笔副作用都先进宿主审查队列，用户决定之前执行主人收不到答复
（`tests/prologue-approval-attachment.test.ts` 5 项）。
`command` 不随桥变化：它的回执没有来源，报成支持等于给出一个读一次失败一次的能力。

真实模型端到端仍未跑过，**产品装配也仍然没有构造 Agent Host**，所以今天跑起来的产品里写入档位依旧不可用。

### 2.5 CLI 的写入能力不经宿主审批

Claude Code 的审批发生在它自己的权限模型里。`text-edit` / `command` 因此申报为不支持，
宿主会拒绝 Builder 角色落在它上面。打开它需要 permission-prompt 工具把询问转回宿主队列。

## 3. 已确认整合到位的部分

- **官方 Integration 插件**（GitHub / Gmail / RSS / YouTube / Web Query）：走 `PluginRuntime`
  的安装、grant、崩溃恢复，返回 Connector Driver 与 Signal Adapter。它们不需要端口或事件，
  用 `integration` contribution 是正确的类型选择，不是被落下。
- **Artifacts 模块**：端口投递的是它的真实版本记录；端口发布经由插件 Artifact 客户端，
  producer 身份与权限检查照常生效，v2 没有绕开它另开一条写入路径。
- **UI Host**：v2 只增加**位置声明**，渲染仍是原来的 `UiContribution.render`。
  导航等价性由测试逐项锁住，用户看到的一字未变。
- **项目插件注册表**：`CHECK (plugin_id IN (...))` 已移除（catalog schema 15 → 16），
  改由运行期注册表校验，已有项目启用状态原样保留。
- **`horizontal/scheduler`**：SSOT 已标 `absent`，是已知的未实现项而非新发现的缺口。

## 4. 扩展性评估

**加一个新插件现在需要什么**：新建包、写 Manifest、在 `BUILTIN_PLUGIN_CATALOG` 加一条。
导航位置、设置页、HTTP 路由、项目可启用性全部由 Manifest 推导，宿主代码里不出现该插件的 id。
`tests/plugin-declarative-mounting.test.ts` 断言推导结果与原写死列表逐项一致。

**加一个新 Agent Runtime 需要什么**：实现 `AgentRuntimeAdapter`，如实申报能力矩阵。
宿主的启动授权、角色冻结、越权复核、审批队列全部复用，不需要动平台代码。
CLI adapter 就是照这条路加的第二个运行时。

**仍会卡住扩展的地方**：新插件若要依赖 Goals 以外的任何 Module 能力，
需要先在 `registerProjectCapabilities` 注册那个能力（见 2.3）。这是当前最实的扩展性约束。

## 5. 一条贯穿始终的规则

复查里反复出现同一条判据：**没接通的东西不能报成支持**。

它在几处具体化为：能力矩阵里 `unsupported` 就是真不可用；用量没报就显示未知而不是填 0；
批准不等于已发生，`effect_settled` 要等真实回执；Runtime 返回的权限比 Manifest 宽就取消该 Run；
内置插件是 `native` 就写 `native`。

这条规则也解释了第 2 节为什么要如实列出——机制具备不等于产品已在用。
