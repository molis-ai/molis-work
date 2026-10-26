# Plugin 安装与生命周期

管理 Plugin 定义、安装身份、权限授予、启动、崩溃恢复和卸载，让 Host 能追踪一次安装的状态与访问权。

包名：`@molis-ai/molis-work-plugin-runtime`。工作区内部包，通过仓库构建和 Host 装配使用。


Home 激活通过 `actions.home` 选择稳定插件 provider，并在启动上下文提供 `provider_id`；项目行为不变。Supervisor 条目的 `enabled: false` 登记工厂但不启动，显式 `enable` 才恢复；Host 正常关闭先 `stop(..., { preserve_enabled: true })`，再撤销监督器引用。真实 Home 生命周期验证：`tests/issue-home-runtime.test.ts`。

Host 的 Home 与项目执行器共用可信定义对象的 provider 规则：bundled 使用 plugin_id，其余 install_id。Home 复用此包的安装、发行物、私有 KV 与模型调用规则；Local Host 在完整 v2 基线核对后才构造 Repository，旧版/坏结构不由 constructor 补表。业务库仍由插件拥有，Home 不造项目 artifacts、端口或事件。公开 Host 的组合回归是 `tests/home-plugin-platform.test.ts`、`tests/home-plugin-private-store.test.ts`、`tests/home-plugin-model-lifecycle.test.ts`；模型与 KV 的原独立回归仍须保留。

## 一次典型调用

PluginRuntime 使用注入的 repository 和 executor；启动或恢复产生新的 grant context，失败和卸载撤销旧 context。SQLite repository 保存安装事实，private storage 按安装 ID 隔离 opaque string 数据。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | PluginRuntime 与 executor/repository 端口 |
| [src/repository.ts](src/repository.ts) | 安装状态持久化 |
| [src/private-storage.ts](src/private-storage.ts) | 按安装隔离的数据 |
| [src/package-verification.ts](src/package-verification.ts) | 包和签名验证 |
| [src/runtime-rules.ts](src/runtime-rules.ts) | 清单校验、安装身份、必需授权检查这些不碰状态的规则 |
| [src/model-service.ts](src/model-service.ts)、[src/action-scope.ts](src/action-scope.ts) | `services.model` 的规则（谁能调、调之前问什么）与「正在执行哪个动作」的记录 |
| [src/background-service.ts](src/background-service.ts) | 一次已受理后台执行的原授权、取消与结束；不拥有任务状态或重放 |
| [src/activation-jobs.ts](src/activation-jobs.ts) | 随激活存活的后台作业：在哪里能登记、作业的调用者与 control、共用的 200 ms 重核、按项目停与关闭；不落盘、不重放 |
| [src/memory-repository.ts](src/memory-repository.ts)、[src/native-executor.ts](src/native-executor.ts) | 内存里的安装记录；直接运行插件代码的执行器 |

可对照现有调用方 [apps/local-host/src/plugin-development.ts](../../apps/local-host/src/plugin-development.ts) 阅读装配方式。

## 接入与边界

这是受信任的进程内执行，不是 OS sandbox。包签名验证认证 bytes 与受信公钥，不代表官方审核。普通卸载保留私人数据；成功执行不保留数据的卸载后，Host 还须调用 deleteInstallationData，不能顺手删除交换出的 Artifacts。

私人存储增加可选的 `compareAndSet(key, expected, value)`：仅当当前值与 expected 完全相同才原子替换；expected 为 null 表示仅在 key 不存在时创建。返回 false 表示冲突，未修改数据。SQLite 实现使用单条条件写入，检查当前安装权限，支持不同连接间的冲突检测。旧 `get/set/delete` 不变；第三方 Host 未提供该可选方法时，需要原子更新的插件必须明确拒绝，不能用先读后写冒充原子操作。

这是单 key 的条件写入，不是任意多 key 事务，也不提供跨设备团队同步。消费者可把同一次原子提交的状态放在一个带修订标记的值中；不要在冲突后盲目重跑含外部副作用的逻辑。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-runtime typecheck
pnpm --filter @molis-ai/molis-work-plugin-runtime build
```

已有行为示例与回归：[plugin-runtime-integration.test.ts](../../tests/plugin-runtime-integration.test.ts)、[plugin-private-storage.test.ts](../../tests/plugin-private-storage.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/plugin-runtime-integration.test.ts tests/plugin-private-storage.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

Host 使用 `runInPluginAction` 将已验证的安装、动作定义和调用控制绑定到生成插件的公开操作；嵌套调用不借用上游插件的安装身份，取消和撤权仍沿原调用检查。

动作可用性在同步只读作用域读取插件自己的设置，按原调用者权限检查；写入、模型执行与回调结束后的访问均拒绝。插件动作、动作可用性和全部场景回调共用隔离后的上下文视图，视图不含 Host 签发的 `host_plugin`；Runtime 内部保留原上下文检查授权，插件继续经自己的 SDK 服务调用。 `original_input` 含嵌套 Action 引用也必须独立复制，插件修改自己的视图不能改变 Host 留存的本人原件证明；回归沿用 S-18 callback mutations。已受理后台执行保留原调用身份与授权控制，但明确剥离只属于当次操作的 `original_input`，由 RAC-53 同时验证正常后台结果仍提交。

## 开发要求

`listPluginProjectDatabases(database)` 只读项目库的现行插件 ledger，沿该 owner 的严格 parser 返回插件 id、库名、版本与发布者，用于离线快照子版本记录；不激活插件、不迁移或初始化账本，不向 Host 暴露跨 owner SQL。回归包含 `tests/home-snapshot-content.test.ts`。

显式解除隔离时，Runtime 先把安装转为可恢复状态，再启动新激活，使启动期间声明的常驻作业接受同一安装检查；启动失败恢复隔离。普通恢复仍拒绝隔离安装，不能绕过用户决定。验证见 `tests/plugin-compatible-recovery-http.test.ts` 与 `tests/plugin-host-executor.test.ts`。

- 负责：插件身份、安装、授予、隔离、生命周期与回滚。
- 不负责：Module 业务事实、提供方协议。
- 公开入口：`@molis-ai/molis-work-plugin-runtime`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（Manifest 解析与版本比较，路由器的拒绝用它的 `actionErrorResponse` 答）。方向：平台包只依赖 contracts/platform 与更低层平台包，公开发布面（contracts、plugin-sdk）在最下层（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 安装事实存 SQLite repository；私有存储按安装 ID 隔离。
  - 每次重装已卸载的安装，都在注册代码、保存新代之前同步调用 Host 的 `PluginExecutor.prepareReinstall`，补清原文件登记、按记录连接等授权；保留私有数据也不能跳过。授权 owner 失败就拒绝发布，原卸载记录不变，关闭后新建 Runtime 也照常检查。这个端口不删私有数据；不能在同步安装中重放允许异步返回的 `uninstalled`。回归见 `tests/security-invariants-installation-records.test.ts` 的 RAC-472/473。
  - 稳定 install_id 用于私有数据；installation_generation 区分每次确认安装，重启、启停和升级不变，卸载重装生成新值。持久任务绑定二者。安装记录必有 installation_generation 与 execution（`host` 或 `sandbox`），缺的记录不是当前 schema。
  - `stop()` 默认记录 disabled；Host 正常关闭可传 `preserve_enabled: true`，停止进程与撤销上下文后保留 installed 状态。该选项不能重新启用已经 disabled 的安装，失败仍记录 crashed。是否启动由 Host 的当前启用策略决定。
  - 不保留数据的卸载后 Host 还要调用 `deleteInstallationData`，但不能删除已交换出去的 Artifacts。
  - 已 disabled 的安装可以升级与回滚：只换版本，安装仍是 disabled，不启动新旧任何一版的实例（插件自带的 `validateUpgrade` 与私有数据捕获照常运行，生成插件没有），失败也不会启动旧实现（其余失败的升级恢复升级前的旧实现）。Host 重启后 Supervisor 不登记 disabled 的安装；带目标定义的 `upgrade`/`rollback` 会为它登记并保持撤销启用状态，之后 `enable` 启动的是切换后的版本。对没登记过、又不是 disabled 的插件，升级回答 `plugin_unknown` 且不留状态。启用只由显式 start/enable 完成。
  - 卸载后的确认安装是新的安装（新 installation_generation，沿用 install_id），可以是别的已发布版本。卸载时保留了私有数据的，目标版本要声明 `compatible_from_versions` 包含被卸载的版本（Host 随带的更新版本、生成插件回到更低版本不受此限），否则以 `plugin.kept_data_incompatible` 拒绝；调用者明确带 `discard_kept_data: true`（人确认放弃旧数据）才全新安装，Runtime 只放行这次安装，保留的私有数据由 Host 删除。未保留数据则不受限制。同版本 Manifest 指纹不同仍拒绝。没做完的确认安装用 `abandonInstall(installed, earlier?)` 退回：记录整条回到它顶替的那条已卸载记录（版本、Manifest 指纹、installation_generation、是否保留数据都不变），第一次安装没有可退回的记录（不带 `earlier`），就记为已卸载、不保留数据；运行中的实例先停。只能撤销 `installed` 指明的那次安装，且只在行仍属于它时：已被后来的安装顶替的不动；行已在这次安装自己的 installation_generation 上被卸载的也不动（不是这次安装做的，是人做的，他对数据去留的选择要算数；已退回到 `earlier` 的重放不受此限）。两种情形都以 `plugin.install_replaced` 拒绝（与「指明的不是同一安装、已卸载的记录」的 `plugin.state_invalid` 区分开），调用者据此不去动属于新安装或人那次选择的密钥、数据和提示词。这样下一次确认安装仍被问到保留数据的取舍。
  - Supervisor 对非 `host` 信任的条目，默认 grant 在已有安装满足全部必需权限时重放已有 grant，随带升级后变成可选的权限、人关掉或打开的可选权限都不会让下次启动被当成静默改 grant；`host` 信任的条目按 `hostBuildGrants`（见下一条），条目自己的 `grants` 对它不起作用；升级失败后无论旧实现是否在运行，事件合同都回到旧版本的。
  - 动作的提供方编号由宿主定（用户 2026-10-10，W3-06 C）：`PluginRuntime` 的构造选项 `actions.providerId(record, definition)` 给出登记用的 `provider_id`，不给就是 `install_id`；`pluginActionProvider` 登记的提供方总带 `plugin_install_id`（它读哪一份安装的授权），所以随宿主发布的插件用 `plugin_id` 登记、与宿主手写装配的同名提供方（Shelf 有三个）共用一个 `provider_id` 也分得清。凡是要从登记找回「是哪份安装」的地方（本机网页的授权、`bindOwnerPluginAction` 的嵌套复查、插件自己的动作客户端）都认 `plugin_install_id`，不拿 `provider_id` 当安装编号用。`providerId` 只由宿主自己的启动名单决定（`apps/local-host/src/plugin-platform.ts` 把给 `trust: HOST_BUILD_TRUST` 的定义对象记进 `WeakSet`），插件的 Manifest、安装记录、`execution` 都不参与：非 host 的安装占用或点分段嵌套宿主保留 ID 时被拒，其余外部插件用安装编号。Runtime 构造必填 `hostIds`，由 Host 传实际随构建发布的目录；安装与启动/恢复都检查 S-75：unsigned 同标签也不得嵌套，pinned 以可信 key 判发布者且与 Manifest 签名相符。安装拒绝在任何安装、同意或私有数据准备/清理之前；启动冲突只记 crashed 诊断、撤销提供方。
  - 兑现检查（`assertContributionMatchesManifest`）两个方向都查：提供了没声明的一律拒；声明了没提供的，默认也拒。只有宿主经构造选项 `redemption(definition)` 说这次启动是双实例插件的一半（`partial`）时，才不要求兑现声明的动作、场景、视图、路由、命令；端口与事件只有项目实例收得到，宿主同时说没有项目连到这个实例（`outside_project`）才不要求。登记只取这一半提供了处理器的动作与场景（`offeredManifest`），撤销、后台任务这类互相引用的动作要在同一半。插件的 Manifest 与 contribution 都不参与这个判断（[双实例 spec](../../specs/dual-instance-plugins/spec.md)）。
  - 内置插件（Supervisor 条目给 `trust: HOST_BUILD_TRUST`，`install` 带 `trust: HOST_BUILD_TRUST`）一律跟当前构建（用户 2026-10-08，[发布策略](../../docs/releases/POLICY.md)第 7 节做法 A）：已有安装（未卸载，同一 install_id 即同一 plugin_id 与发布者签名）的记录与构建的清单不同，不论版本更高、更低还是同版本摘要不同，启动时都改成构建的清单（`version`、`publisher_id`、`manifest_digest`、`selected_entrypoint`、`grants`、`updated_at`；`recordToFollow`、`followHostBuild`），不看 `upgrade_compatibility`，不调 `validateUpgrade`。`install_id`、`installation_generation`、`state`、`installed_at`、`retain_private_data` 不变，私有数据留在这次安装上；部署环境和执行信任边界仍不能借启动改变。授权与其他插件同一规则（用户 2026-10-18，改 2026-10-10 W3-06 B；[发布策略](../../docs/releases/POLICY.md)第 7.8 节）：必需的权限总有，可选的按人留下的给，可选的都能关（`runtime.grant`，插件先停；设置里的开关是下一片），关了只是用到它的动作不可用。内置插件的不同只在起点：全新安装时可选的默认都开（`hostBuildGrants` 不带已有授权），不论调用者传什么 `grants`。之后同一构建的启动按记录重放，不补回人关掉的（`hostBuildGrants` 带记录的授权，结果就是记录本身）；跟随新构建时，新清单不再声明的去掉，必需的补上，记录持有、新清单仍声明的保留，新清单声明而记录自己那个构建没声明的（`install` 的 `declared_before`，Supervisor 从发行物存档里记录自己那个（版本，摘要）的清单取，`startInstallInput`）像新装一样默认打开；存档里找不到记录自己的构建时只补必需的，不打开任何可选的，人关掉的不会被启动打开（`followHostBuild`）。已有记录缺了必需的权限（同一构建也一样）时启动把它补上，不报 `plugin.state_invalid`（`recordToFollow`）；只缺可选的不是跟随的理由。Supervisor 对这类条目不恢复任何存档发行物（`directlyUsable` 恒为真），`upgradeCandidates` 不列它们；当前构建的发行物照旧存档，记录自己的（版本，摘要）在表里总有一行。非 `host` 信任的插件规则不变：版本更低、更高但没有声明来源、同版本不同摘要仍拒绝，Supervisor 仍恢复存档发行物；已卸载的记录不在此列，重装仍走保留数据的规则（`keptDataRefusal`）。
  - `stop()` 在返回 Promise 前撤销当前 activation 的 grant 与动作注册，再按原生命周期队列调用清理 hook；调用者不必等待清理完成，迟到的模型文字和结果就已无权交付。
  - `services.model`（W3-06 E）：`createPluginModelClient` 只在 Manifest 声明 `model:invoke` 或只读的 `model:read`、宿主自己运行（非沙箱）的插件上由宿主建出来。`choices()` 与 `availability()` 认二者之一（既声明又持有），两样都不持时 `choices()` 抛 `plugin.grant_denied`、`availability()` 答 `actions.plugin_permission`；`complete()` 只认 `model:invoke`。`pluginActionProvider` 给每个动作处理器包一层 `runInPluginAction`（`AsyncLocalStorage`），记下正在执行的安装、动作声明和这次调用的 `ActionExecutionContext`；`complete` 只认这份记录，插件不传调用上下文。放行条件：记录属于本安装、动作声明含 `model:invoke` 且 `scheduling: "concurrent"`、调用者带 `model:invoke`、实例在运行且安装持有授权、这次调用的 `beforeEffect()` 通过，之后才查指令（只收本插件自己的 `InstructedPrompt`，`system` 也是）和限额（`PLUGIN_MODEL_LIMITS`，超出拒绝，不截断）；模型返回后同样的授权再问一遍才把结果交出去，所以动作返回之后（`actions.expired`）、取消、撤权、停用的调用拿不到结果。拒绝码都是 `plugin.model_*`，用 `defineErrorCodes("plugin", …)` 声明（`pluginModelErrors`）。端口（`PluginModelPort`）只由宿主实现；这个包不依赖 agent-host，JSON 解码也由端口的 `decodeJson` 给。作用域记录是模块级状态：一个测试进程里要从同一处加载这个包（源码和构建各一份，记录互不可见）。
  - 场景回调由 `scene-provider.ts` 放进同一执行作用域，记录真实场景声明及读写用途；`currentPluginInvocation` 供服务和嵌套调用保存原调用者，`currentPluginAction` 仍只返回动作。只读场景不能经存储、事件、成果或嵌套调用写入，写回调结束后也不能留后台写入（`tests/security-invariants-plugin-scenes.test.ts`）。
  - 模型选择（W5-01）：`availability(selection?)` 与请求的 `selection` 只接供应商/模型 ID；Runtime 在首次等待前校验并复制，Host 解析当前已配置模型。明确选择失败不改用默认；`plugin.model_selection_invalid` 表示缺少或无效的 ID 形状，配置不可用仍按 Host 原错误返回。
  - 安装信任与同意（ac-trust T1，[设计](../../specs/repository-anti-corruption/slices/ac-trust-install.md)）：`install` 必须带宿主给的 `trust`（`host`、`pinned`、`unsigned`；`HOST_BUILD_TRUST`、`UNSIGNED_TRUST` 是两个冻结的常量，形状由 `trust-rules.ts` 的 `assertPluginTrust` 查），等级写进安装记录的 `publisher_trust`（表里同名列），已装的插件不能换等级。Manifest 里要同意的声明（`always_on`、默认连线、默认输入组）不再让安装被拒：`install` 的 `consents` 写进同意账本（`consent-ledger.ts`，表 `plugin_consents`、`plugin_publishers` 是 Home 级，由宿主放进 Home Runtime 库、经构造选项 `consents` 给进来），`host` 信任由宿主代为同意（`host_build`），其余只认人给的同意（`user`）；撤回写 `revoked_at`，不改写不删除，宿主下一次启动不会让已撤回的同意复活。
  - `host` 信任只给宿主自己运行的代码（W3-06 D）：`install` 对 `host` 信任再加 `execution: "sandbox"` 一律以 `plugin.grant_denied` 拒绝，不论带不带 `grants`。沙箱插件的权限是人确认的那一份，不会因为启动名单误给 `trust: HOST_BUILD_TRUST` 就在全新安装时拿到 Manifest 声明的全部（`hostBuildGrants` 的前提）。
  - 卸载仅对当前进程的活实例执行 stop；冷安装无需加载代码。先撤销激活并保存卸载状态，再调用幂等的宿主清理；无论清理成功或抛错，都释放同插件 ID、同发布者签名下的已加载实现。清理失败仍原样抛出宿主错误，再次卸载继续实际清理，不重写卸载记录和数据保留选择、不恢复权限或再次 stop。记录已卸载、同安装的生命周期队列仍未结束时，同步 `install()` 在写入前以 `plugin.state_invalid` 拒绝重装；没有后续排队操作时，等待卸载结束后才可尝试重新安装同版本新实现，仍须通过数据清理。失败不阻断后续排队操作，旧操作完成只释放自己的队尾标记，后续队尾仍保护未结束的队列。运行中仍拒绝重复注册。回归见 `tests/plugin-methods-runtime.test.ts`（RAC-196-U1）、`tests/plugin-lifecycle-states.test.ts`（RAC-196-U2～U4、RAC-357-U1）与 `tests/security-invariants-sandbox-owner-files.test.ts`（RAC-357-U1，真实项目/Home 链接拒绝及重试）。
  - 已卸载且上次不留私有数据的安装，重装前同步重清：现有输入与 grant 清单合法性检查通过后，`keptDataDiscarded` 在注册定义、生成世代和保存新安装前完成主人文件及 KV owner 的清理。缺同步能力或 KV owner 端口以 `plugin.state_invalid` 拒绝，现有 `ActionError` 原样，普通宿主失败以 `plugin.executor_failed` 拒绝；原卸载记录不变，没有新安装行或注册定义。路径拒绝前文件/KV均不删；后一步故障可留下部分删除进度，重试幂等补完。Project 组合传入 `deleteInstallationData`，Home 复用已有 storage，Native 无外部清理 hook 时仍可重装。旧保留数据并明确 `discard_kept_data` 的通知仍在新安装保存后，外部 KV 处理与回滚不变。真实文件/KV、同对象/新对象、跨重启、缺端口与真实 KV 删除失败的回归均为上述两文件的 RAC-357-U1。
  - 条件写入是单 key CAS（`expected: null` 表示仅在不存在时创建），不是多 key 事务。
  - Host 不提供原子方法时，需要原子更新的插件必须明确拒绝，不能用先读后写冒充。
  - 路由器自己的拒绝答平台的码和动作层已有的句子（W3-02-C）：没有路由要的权限 `actions.forbidden`（403），本项目没有启用该插件 `actions.plugin_disabled`（403），插件未运行 `actions.plugin_unavailable`（503），声明了路由却没有处理器 `actions.execution_failed`（500，插件自身的错）；响应体是 `{ error, code }`。状态由 SDK 的 `actionErrorResponse` 按 kind 给，路由器不写状态数字。
  - 内部 route 可携带可信 `execution`（signal/beforeEffect）保留原调用控制；HTTP 适配器不得从参数或 JSON body 构造它，actor 名称不授予内部调用权。
  - 事件发布检查项目和当前安装，发布 client 绑定 activation，旧 client 在重启后仍失效。订阅游标绑定 install_id 与安装世代，重装不能继承旧订阅的进度；未绑定身份的旧游标只保留为历史，新订阅从当前日志尾开始。
  - 事件处理器收到自己的安装身份、signal 和 beforeEffect；异步等待后先检查再产生副作用。先持久写 delivering，确认时复查实例/版本/订阅；中断后的未知处理隔离，不自动重放，尚未派出的启动失败可以恢复。关闭数据库前 await events.close()。
  - 隔离事件由 Host 管理入口读取和明确 retry/skip，插件 clients 没有恢复方法。确认绑定所见事件、游标 revision、安装世代和代码版本；只推进当前事件，决定与 actor/依据历史同事务保存，重装和过期确认拒绝。恢复不授予权限，实际重试仍走原订阅检查。
  - 输入图仅投递可用且未归档的固定版本；`onUpstreamReady` 的 `beforeEffect` 在异步等待后复查输入和当前执行实例。输入通知用于刷新投影，不用于一次性业务命令。激活新实例时撤销旧上下文并重新计算当前输入；关闭时先取消并结束输入协调，再关闭数据库。
  - 固定成果输入优先于普通输出线；状态、引用和连线展示共用同一版的解析规则，缺失、不可读或归档时不改读最新版本。成果输入须在 Manifest 的 `artifacts.consumes` 声明；SDK 的输入状态、引用和正文每次检查当前读取授权，正文仍走成果 client 的权限与类型校验。回归见 [plugin-fixed-input-sdk.test.ts](../../tests/plugin-fixed-input-sdk.test.ts)。
- 改动后必跑：`node scripts/run-tests.mjs tests/security-invariants-plugin-materials.test.ts tests/plugin-runtime-integration.test.ts tests/plugin-private-storage.test.ts tests/plugin-upgrades.test.ts tests/plugin-host-executor.test.ts tests/plugin-events.test.ts tests/plugin-platform-composition.test.ts tests/plugin-event-recovery.test.ts tests/plugin-release-artifact.test.ts tests/plugin-lifecycle-states.test.ts tests/bundled-plugin-grants.test.ts tests/runtime-provider-identity.test.ts tests/plugin-declaration-rules.test.ts tests/action-artifact-references.test.ts tests/plugin-declarative-mounting.test.ts tests/plugin-model-service.test.ts tests/plugin-model-selection.test.ts tests/dual-instance-contribution.test.ts tests/security-invariants-plugin-background.test.ts tests/security-invariants-activation-jobs.test.ts` Home 装配/服务改动另跑：`node scripts/run-tests.mjs tests/home-plugin-platform.test.ts tests/home-plugin-private-store.test.ts tests/home-plugin-model-lifecycle.test.ts tests/home-store-baselines.test.ts tests/issue-home-runtime.test.ts tests/local-web-actions.test.ts`。
- 相关手册：[docs/platform/PLUGIN-PLATFORM.md](../../docs/platform/PLUGIN-PLATFORM.md)、[skills/molis-plugin-dev/host.md](../../skills/molis-plugin-dev/host.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

`services.background` 只在非沙箱定义声明 `background_job` 或 Manifest `background.jobs` 时由 Host 提供，与模型是否配置、平台是否有 Home 无关；只能由本安装仍活跃的并发 command 受理。捕获 Kernel 保留的原注册与权限后，使用既有 `createExecutionLifetime` 建立一次有限执行；模型通过 `runInPluginAction` 读到这个新控制，原处理器的控制仍按时结束。两个执行器先关闭所有后台执行，再等待插件清理；撤权后的成功、失败都不能写业务事实，停止后不重放。公开回归：`tests/security-invariants-plugin-background.test.ts`、`tests/plugin-model-service.test.ts`。

`keep(job, work)` 保留随激活存活的作业（PG-038，`docs/system/SECURITY-INVARIANTS.md` S-52）：只认 Manifest `background.jobs` 声明的作业，只在三处登记——本安装的命令通过了最后一次授权检查之后（`markPluginActionChecked`：动作自己的 `beforeEffect()` 返回、`assertPluginActionCurrent` 核过一次写入、宿主记下一个返回了的命令），登记时 `assertCapturedPluginActionCurrent` 再同步核一次原调用；激活的 `start()` 返回之前（Host 给的 `starting` 窗口）；同一激活的另一个作业里（`runInPluginJob` 的作用域，登记时同样核作业自己还在跑）。作业的调用者是安装自己（宿主给的 actor、`plugin` 受众、调用记录里自己的编号），不带原调用者；每次写与每个激活共用的 200 ms 定时器上同步重核运行状态、激活、Host 读到的安装记录与权限，停了就中止，之后经平台服务的写一律拒。`createPluginBackgroundClient` 的 `stopProject`（删项目）与 `stopProjectJobs`（关项目）停那个项目里的作业，`close()` 随激活停全部。公开回归：`tests/security-invariants-activation-jobs.test.ts`。

`createPluginOwnerFilesClient` 绑定现有安装 gate 与真实 `currentPluginAction`，不另建实例寿命或关闭协议。读取检查读权限；`write` 等待原 `beforeEffect()` 后，每个同步原语重查写权限、原 caller 与取消。返回、抛错和异步回调都会撤销 writer。初始化入口只由可信 Host 调用，沙箱、项目与升级预检不提供此服务；IO 端口没有授权判断。改动后运行 `tests/security-invariants-plugin-owner-files.test.ts`、`tests/security-invariants-plugin-owner-files-registration.test.ts`、`tests/security-invariants-plugin-owner-files-lifecycle.test.ts`。

## 进一步阅读

- [职责与接入说明](../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd3`, `goal-reorg-dv3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

模型原图服务在首次等待前检查并复制字节（50 张、单张 32 MiB、合计 128 MiB）。`validateResult()` 同步复核原动作 scope、存活授权、安装及 Host 的原模型快照；成功、普通推理失败与 JSON 解码失败都保留同次执行事实，取消、撤权或过期后不能据此记业务失败。只读 `choices()` 检查安装与模型 grant，不递归调用会重算可用性的完整动作授权。回归见 `tests/security-invariants-plugin-model-materials.test.ts`。

Home 的消费者设置与生图服务分别由 `model-configuration.ts`、`image-generation.ts` 核对可信声明、当前实例、动作权限与执行范围。只读 selection/inspect 供可用性判断，不递归进入完整动作可用性；真实模型/配置写入仍复查 beforeEffect 和同步授权。图片结果携带派出时的 revision，交付与业务写入按该版本复核。合同和恢复边界见 [插件开发手册](../../docs/platform/PLUGIN-DEVELOPMENT.md#home-消费者的模型配置生图与项目清理)；改这些路径加跑 `tests/plugin-model-configuration.test.ts`、`tests/plugin-image-generation.test.ts`、`tests/home-plugin-project-cleanup.test.ts`、`tests/home-plugin-project-routes.test.ts`。
