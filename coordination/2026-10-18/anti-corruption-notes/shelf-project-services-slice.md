# D：Home 调用中的项目服务最小切片（负责人：主会话；执行待分配）

状态：设计交付，未实现。基线 S `dfc21df3b`；承接 `shelf-storage-project-services-plan.md` §3。本文供并入唯一 accepted spec，不修改生产、测试或 spec；未构建。C OwnerFiles 独立推进，本片不改其工作树与接口。目标是前置功能可用：真实单一 Home fixture 在两个真实项目访问原固定版本和连线；不提前迁移正式 Shelf/Pages。

## 收敛结论

保留 artifacts/processItems/inputs/outputs 原 owner 与项目图，增加按真实 invocation 绑定的 Home 门面。无需新项目实例、项目身份缓存、持久 generation 表或每次请求注册 provider。`LocalHost.executionScope` 已保存 `{entry,runtime,active,holdsQueue}`，调用结束撤销 active；应公开受控的 Host 内部捕获方法，不能再次按 project_id 查找/打开运行环境替代原 scope。

原方案有三处须具体化：

- sync publish/record/select 无法自己 await caller.beforeEffect。必须有一个明确异步进入、同步提交的 gate，不能靠“父 action 已检查过”或隐式记住最近一次 beforeEffect。
- 现 Artifact SDK 的 head/readOwn 仅检查 producer_plugin_id，未检查 signature；把它直接复制给 process own API 不满足本片合同。签名与个人归属校验应由 owner 的同一实现完成，不在 Host 再补一套。
- 当前图的 `resolvePortInput` 只查输出行和固定内容，不检查 source 当前是否仍参与图。仅把 Home manifest 加到 enabled 列表不能证明隐藏/停用撤销旧连线；需要在同一个解析入口校验选中 producer 的参与状态，并统一 reference/status/view/delivery。

## 1. 一个可信项目作用域与一次同步写段

Home start 只创建稳定门面，不捕获项目、不访问业务库。方法调用必须位于本 install 的 currentPluginAction，调用尚未结束，且有真实 caller.project_id。Host 从当前 executionScope 捕获实际 entry/runtime 对象及其 active/closing 检查，验证其 project 与 caller 一致；禁止输入 project_id、控制对象字段或同 id 最新 runtime 代替它。内部 API 建议 `captureProjectInvocation()` 返回窄 owner APIs、当前 graph 和 `assertCurrent()`，不返回 DB/路径给插件。入口没有 scope 时明确拒绝；不可为成功自行 withProject/open。

每次读取检查 action scope、install generation、Home runtime、原 caller signal/最终同步 authority、项目 entry、插件项目可见性、manifest 权限与实时 grant。使用 currentPluginAction 是为了身份，不能只因存在 scope 就认定授权。对 query_only/原 action operation 的写限制必须在写入口拒绝，不能由 callback 自觉遵守。

新增最小作者合同建议 `services.project.write<T>(callback: () => T): Promise<T>`，仅 Home invocation 项目写路径需要；名字并入主 spec 后固定。它不接 projectId/control：

1. 进入时捕获原 action scope 与真实项目 entry。
2. await 原 caller.beforeEffect。
3. 检查原 scope、原 entry、install、可见性及 caller.assert_authority_current；在同一同步调用栈开放 publish/record/select/invalidate/retain。
4. 每个写原语再次同步检查；callback 返回即撤销 gate，返回 Promise/thenable 拒绝。服务门面本身可长期保存，但不得缓存一次调用获得的项目/权限；从旧 callback 保存的提交句柄不能用于新 action。

读方法保持同步；写方法保持既有 sync 返回值，但 Home 下必须在此 gate 内使用。项目实例现有 SDK action wrapper仍存在，其 owner规则与 Home共享。gate 不是任意 SQL 事务，也不承诺跨 C 文件与 D 项目库原子提交；publish 后 select 失败应保留固定版本，重试按原版本幂等/CAS恢复，不引入 WAL。若主 spec 已有等价同步提交服务可复用，直接沿用，勿再新增第二gate。

同 id 重建：检查捕获的 entry 对象及 scope.active/entry.state；旧 entry 已关闭即拒绝，绝不重新解析同 id。ProjectDeletionService 的 close 顺序保持，删除项目不触及个人 Shelf 副本。读/写发生在 action 所持 runtime lifetime 内，停止/删除不能提前关其数据库。

## 2. Artifacts owner 公共 API（必须新增，规则只有一份）

提取 `plugins/native/artifacts/src/plugin-client.ts` 内 operations 为 owner 包公开的**不注册 provider**工厂，例如 `createPluginArtifactOperations`。输入为 Host绑定的 project、Home person、当前 author、manifest、现 artifacts/process APIs 与同步 requirePermission/authority guard；作者拿不到工厂。现 `createPluginArtifactClient` 继续一次安装注册 SDK provider，但 handler委托该工厂；Home门面按当前 invocation 使用同一工厂，不 registerProvider。参数按现 schema复用解析/字段挑选，不能因绕过 action wrapper 丢掉输入校验。不要将整份 SDK action registry搬入Home。

必须补的作者接口：

| 接口 | 合同 |
|---|---|
| processItems.head(id) | 过程表最新版本，null或小 `{version}`；不伪造 artifact pin source_revision。校验 producer id、binding signature、个人owner；归档版本也可用于自身恢复。 |
| processItems.readOwn(ref) | 只读自身过程固定版本，归档可读作恢复；不经 consumes，不因此成为可消费来源；同样校验producer/signature/owner。 |
| artifacts.listConsumable() | 从两 owner API.listArtifacts 的固定版本候选派生，不限端口；以与 read 相同的 consumes/可用性/归属判断过滤。返回 ref/type/schema/title与明确成果/过程 kind；正文仍用 read(ref)。不接受 project、producer或任意where。 |

现 `FixedVersionQueryApi` 已有 get/latest/listArtifacts/listArtifactVersions/consumptionCompatibility，无需新仓库、SQL或跨包内部 import。list应对候选使用共同 read-policy函数，不能调用会抛错的read后忽略所有异常；只跳过明确不可消费候选，真正库错误不吞。

保留事实语义：个人成果 owner 是 Home person，`created_by` 才是本轮 MCP/Agent/workflow实际 actor。`modules/artifacts/src/registration.ts` 已约束个人成果 owner，不把原计划“owner取真实caller”照字面实现。过程项沿现 owner合同检查，不因为caller是Agent就默默改变个人数据归属。Host传作者，producer id/version/signature由manifest，插件输入不可覆盖。成果/过程 ID互斥、immutable version、metadata、supersedes、可用性规则复用现owner逻辑。

既有 artifacts.head/readOwn 的签名加严若纳入提取需明确列为合同修正并更新相关测试，不悄悄改变其它既有入口；最低要求新process own接口严格，shared policy不对不同接口假装相同现状。

## 3. 图：最小 participant port，不引入第二监督器

图实际依赖只有 `manifest`、`generation`、`enabledPluginIds`、`ensureStarted`（其返回instance.active及onUpstreamReady/onUpstreamUnavailable）；不需要 events.contract、installation持久身份等整个 PluginHostLifecycle。抽为 `PluginWiringParticipants`，供 wiring.ts与wiring-view.ts共同使用；项目默认adapter直接委托现supervisor。

Host组合参与者只做派发：项目插件→现supervisor；已启用且当前项目可见的Home插件→同一Home运行实例。manifest来自Home监督器，generation取其现有enablement epoch，active同时检查Home实例、项目entry及可见性。不能按 project_id新建Home安装或调用第二次start。与项目现有同plugin_id重复声明直接拒绝配置，不按顺序覆盖。

Home本片只支持pull inputs与outputs；Shelf没有onUpstreamReady。不要把Home callback伪装成项目action，也不建立跨项目异步回调授权。Home contribution若声明onUpstreamReady/onUpstreamUnavailable，应在本片明确拒绝，而非静默忽略；后续真正需要时另定callback身份合同。图对无订阅callback的Home参与者只解析/展示/供读取，不排队ensureStarted、不产生假delivery状态。项目消费者（例如Coding）的原ensureStarted与回调路径不变。

必要的生命周期通知使用现Home supervisor activation/revoke与项目显隐通知：针对已有、打开的项目图执行revoke/evaluateAll，close时取消订阅。暴露窄observe入口即可，不维护项目→Home实例registry。不能只轮询generation：已进入callback的源失效应通过现graph controller立即撤销，再由最终beforeEffect复核。

`resolvePortInput`增加选中source参与校验，项目/Home一致走此函数：绑定来源不再可参与时reference/status/view/未来delivery均不返回可消费记录。不能删既存binding/output记录来假装拒绝；重新启用后的恢复沿既有规则。已冻结的Coding session输入不回写，已获得的在途callback则按原graph lifetime拒绝迟到effect。手动固定成果绑定与端口生产者绑定的规则分开：固定成果由其归档/可用性/consumes约束，不因为产物作者插件停用就任意删除。

默认连接继续 `apps/local-host/src/plugin-default-bindings.ts::bindDeclaredDefaults`；其输入使用同一participant目录，不再把Home Shelf塞进项目supervisor。默认不覆盖用户binding/CAS，图数据库仍原项目库。

## 4. 三个串行可验证步骤

**D1 owner提取与读能力**：先提取共同operations、增加process own/listConsumable；现project SDK切换使用它，删除原内联重复规则。只做owner定向用例，Home尚不开放声明。没有两套启用的policy。

**D2 participant适配**：让现图接受窄port，project adapter行为不变；真实Home fixture参与同一图，限制无Home回调。更新source有效性与变更通知，验证默认bind/输出CAS/停用；正式Shelf依旧不切换。不能新建“Home图”。

**D3 invocation门面与原子启用**：Host公开原scope捕获，Home executor注入动态服务及write gate；仅此时移除 artifacts/process/ports的一刀切拒绝，events仍拒绝。真实两项目fixture完成actor、原entry、前后授权、图行为闭环。D2未完成前不得开放可写outputs；无暂时fallback到旧Shelf host服务。正式Shelf/Pages各自迁移随后另片一次替换装配。

## 5. 文件边界与测试

允许范围（由root串行确认共享文件）：

- contracts/platform/plugin-artifacts.ts、plugin服务导出及project write小合同；必要process head/summary类型。owner `plugins/native/artifacts/src/plugin-client.ts`、新operations文件、index.ts及现schemas。
- Runtime `lifecycle.ts`或独立wiring-participants.ts、wiring.ts、wiring-view.ts、wiring-input.ts、services.ts；现supervisor规则不另复制。events.ts与event lifecycle不扩Home支持。
- Host `local-host.ts`窄capture接缝、`project-host.ts`/现项目platform owner装配、`plugin-platform.ts`、`home-plugins.ts`、`home-plugin-executor.ts`、新plugin-project-services.ts与participant adapter、`plugin-default-bindings.ts`调用处。不得拿owner Store/SQL，不改C文件服务。
- 对应包README、唯一spec/API/security/action快照由root收口。是否更新actions快照取决于新增SDK动作，不能省略其实际合同变化。

必须真实fixture拒绝测试：

- 单Home start计数=1，两真实项目执行同名artifact_id版本分别落原库；无project/伪project/错install/无action/query写拒绝且所有相关表不变。
- HTTP真实bindPluginActionRoute、真实MCP caller、workflow action各验证可信project与created_by；无control own不能借owner。读也不能绕安装grant与原caller权限。
- 卡在beforeEffect/上游读取后撤caller权限、隐藏插件、stop/upgrade Home、删除并同id重建；旧callback继续时旧/新项目固定版本表、图表、事件均零新增。保留项目entry而不是只比id的测试须制造真正新runtime。
- owner producer、signature、个人owner、type/schema、双store同ID冲突、归档和不可用拒绝；list包含未连端口固定版本且不泄露别人的过程项。processOwn恢复可读但不能令普通read可消费。
- Home Shelf形fixture→真实Coding形消费者共享默认连接；record不自动select，select旧expected CAS拒绝；选新版本只影响未来输入，不改已冻结session。隐藏/停用producer在持有callback时撤销最终effect；重新启用不重复start Home。
- write callback等待后引用、返回thenable、异步泄漏写句柄、跨action重用均拒绝。publish成功而select失败保留可恢复固定版本，不宣称事务回滚。

先build再按改动跑owner client、plugin-host-services、plugin-wiring/default-bindings与新增Home project services/security fixture；共享核心全量/Chrome排队由root安排。本文件未运行这些验证。

## 开放点及阻塞判定

没有证据需要新权限系统或注册表。必须在accepted spec里固定两项合同表述：project.write的名字/回调边界，以及Home暂不支持upstream callbacks（Shelf现不需要，Pages本片也仅pull）。个人owner与author已由现owner规则决定，不是新产品问题。

实际实现可能暴露当前Home action进入project Host executionScope的遗漏：若可信project路由仅传project_id而未进入真正scope，本片应修入口接续原项目client，而非按id新开runtime。必须用D3真实fixture证明这一点，不能以当前静态project_id字段冒充已可用。

## 接线复核补充（2026-10-18，root要求的第二轮窄核）

以下以真实代码收窄上文，涉及source失效语义之处以本节为准。

### A. 三种入口确实进入原项目 executionScope

**Home项目HTTP**：`home-plugin-http.ts` 先 `routeProject` 从可信路径和catalog解析project；为 `projectRouteControl` 传入 `host.actionClient(project)` 与 `localWebActionContext`。SDK `routes.ts::bindPluginActionRoute` 原样传 request.execution；`plugin-actions-client.ts::callScope/routedActions`命中WeakMap后用scope.client。此处直接走路由保存的project client，**并不必经 homePluginActions 再选一次**。高层 `MolisWorkLocalHost.actionClient`（project-host.ts:321）只prepare后转发底层 `LocalHost.actionClient`。底层local-host.ts:367–391 snapshotCaller、校验project一致、找到真实descriptor后调用enqueue；enqueue:525–533取得同一entry.runtime，在executionScope.run内执行action，finally删除invocationRuntimes并scope.active=false。Home provider注册在全局registry不影响此project enqueue。已有可信路径有scope，不需要额外进入withProject或再按id打开。

`homePluginActions(this.host)` 在project-host.ts:207交给Home executor，是Home services的默认adapter；当需要该adapter且caller.project_id存在，它从已打开Host.status找到reference后使用底层project actionClient，也进入上述enqueue。HTTP own route命中routed caller时优先使用route自己的client，不应把两段误画成必经串联。

**MCP**：mcp-action-client.ts::authorizeMcpActions返回有reference时 `host.actionClient(reference)`；每次保留其真实授权context，再走同一project enqueue。无reference的Home MCP调用走homeActionClient，不能使用D项目服务，不补project。

**工作流**：project-host.ts创建workflowsActionProvider时传该project actionClient；workflows-actions.ts的content/action ports将当前caller交给这份client。station调用Home action仍走project enqueue；nested enqueue复用同entry且按holdsQueue/step处理，不新建项目。若其他未来workflow入口直接调裸ActionService，它不是本次已证明路径，应拒绝缺scope，不在D里为其兜底。

**必要最小变化**：在LocalHost增加仅Host装配可用的同步capture方法，读当前executionScope并要求active、entry未closing、Host running、caller.project_id与entry.reference一致；返回原runtime及闭包guard。不要以invocationRuntimes.get(currentPluginAction.caller)作为唯一查找：Kernel构造ActionExecutionContext会复制context，WeakMap键是enqueue的bound caller，未必对象相等。scope来自Host ALS，currentPluginAction只补同安装、原action生命周期与权限检查。捕获的guard一直绑定entry对象，不按id重新resolve；raw runtime不泄露作者服务。

### B. generation/通知的现状，不再假定完整观察机制已有

`PluginSupervisor`确有：

- `#generations: Map<string,number>`、`#generation`，`generation(id)`在enabled时惰性分配；restart保持enablement generation，revoke删除它并推进计数，enable建立新值。
- `#tokens`及`#epochs`；ensureStarted返回active闭包，检查token、enabled、实际contribution对象与running state。它证明当前实例，不能用静态manifest替代。
- `installation(id)`给install_id、installation_generation、version、running；running要求runtime record.running且真实contribution存在。HomePluginHost.manifest会fallback到静态entries，因此**不能**拿manifest有值证明Home已启用/运行。
- 仅 `observeActivation`，通知只在 `#running` 调用。`revoke`、restart开始/stop、失败不通知该observer；没有可直接订阅的通用“失效”事件。上文“复用activation/revoke通知”只对前者成立。

HomePluginHost.ready返回的platform有真实supervisor可用于接adapter；start末尾运行supervisor.start，release先stop runtime再supervisor.revoke。当前HomePluginHost未暴露用于同步失效观察的公共封装。最小增量是在现supervisor提供窄的失效通知（或在现activation观察协议增加显式失效种类），在撤销token/开始替换实例/失败/显式revoke同步触发；保留generation本来的“restart不改enablement epoch”语义。Host组合adapter订阅现activation与新增失效，关闭项目graph时退订；不新建generation表。直接runtime.stop路径也必须覆盖：Home executor.revoke或Runtime统一stop通知可作为真实失效点，不能只监听HTTP disable。

**项目显隐目前没有可直接复用的同步observer**。modules/projects/src/project-service.ts的addPlugin/removePlugin在同一事务追加 `project.plugin_added` / `project.plugin_removed`，个人插件通过show/hideProjectPlugin维护hidden表。Host `project-catalog.ts`仅转发commands；`web-project-settings.ts`提交后发响应，未通知graph。其他写入口还有web-project-platform-routes、context-onboarding、demo seed，故只在DELETE HTTP后加通知不完整。

最小需要在catalog owner的统一成功提交边界对现有membership事件通知宿主（post-commit，rollback不能发），由宿主只通知现有打开项目的graph；复用事件事实，不复制一份成员名单。若已有journal可用观察实现能在commit同步送达则直接接；本轮未找到这样的现成catalog观察接口，不能把它写成已具备。最终读/提交仍读取owner当前membership；通知用于及时abort与重评，不作为权限事实缓存。隐藏后立即重显示也要已撤销旧controller，不能凭当前visible=true复活旧任务。

### C. D2 source参与检查确实是行为变化，不能整体顺手加严

当前resolvePortInput对端口绑定不看source的enabled/running，只看output行、invalidated_reason与固定版本可用性；producer停用以后保留的固定输出仍可能读到。因此把所有project source都改成“必须当前active”会改变既有语义，且和固定版本在生产者session结束后保留的设计有关。上文要求project/Home一致加source检查过宽，**不作为本切片默认改动**。

本片必须先保证：Home自身的D读写/选择在隐藏、停用、换代后拒绝；Home participant目录只暴露真实可参与实例；Home无callback，不制造后台授权。既有project producer的历史output可读语义保持，固定artifact binding继续只按固定版本/归档/consumes判断，与producer运行无关。

若主spec要求“Home源隐藏/停用立即撤销下游当前port消费”（上文D2所提出），这是Home新参与者的显式新增合同，需要单列接受，再在同一resolvePortInput接窄 `sourceAvailability(binding)` port；project adapter沿原策略，Home adapter检查真实实例及membership，不复制解析算法。同时在显隐/失效通知中撤销受影响消费者controller。不能只检查当前active：重启/隐藏后重显应保持旧controller已撤销。没有该明确合同前，本片只拒绝失效Home的新增发布/select与其自身读写，不宣称已经改变下游历史固定输出。此点是剩余真实语义决定，不是缺工具造成的阻塞。

### D. write gate能复用什么

已有同步提交接口是 `PluginDatabase.transaction(beforeEffect, write)`；实现plugin-database.ts等待beforeEffect后在**该插件Home私有库**BEGIN IMMEDIATE，回调拿受限SQL事务。它并非项目artifacts/graph gate，拿它包另一数据库会虚报跨库原子性、额外要求storage:private，且现接口接受插件提供beforeEffect，不证明原invocation身份。不能直接复用其API充当D授权。

SHM model.validateResult只有“本次模型结果最终检查”，materials也没有通用同步commit；catalog.commit是catalog owner自己的事务队列，不应包项目库；C OwnerFiles writer是文件树专用且另writer施工，D不借其私有状态。可以复用已有 `requireSynchronous`、currentPluginAction、caller.beforeEffect/assert_authority_current 和局部active闭包模式；未找到适用的作者级通用同步提交接缝，因此前述小 `project.write` 仍有必要。它只是一段调用栈内授权有效期，不保存token/权限余额/授权记录，不新建授权簿，不承诺事务。
