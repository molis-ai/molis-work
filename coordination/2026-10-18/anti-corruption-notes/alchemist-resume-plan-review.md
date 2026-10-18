# Alchemist 显式继续计划独立复核

2026-10-18。只读检查 `alchemist-next-implementation-plan.md` 与 `wt-alchemist-runtime` 当前源码；未改 A、未构建或测试，也未重复 ALC-LIFE 审查。主 Session 提供的 LIFE 验证结果作为既有证据。本报告审的是尚未接受的下一片计划。

结论：先在现 Store 完成指定 job 的显式继续，再切最终 Runtime/项目分库，方向可行且比同时迁移全部持久化更容易验证；不需要 borrowedSql 或持久授权系统。但有两项 P1 必须写入计划的实际调用链及允许路径，另有几个实施前应明确的状态合同。当前不能把“透传 retainBackgroundAuthority 即可”视为已证明可行。

## P1-1：HTTP 没有可脱离请求的原始授权，单纯透传会在 start 返回时取消后台

证据链：

- `apps/local-host/src/web-request.ts:218–220` 直接构造 `{actor_id, project_id, audience, permissions, signal}` 调 Kernel；没有 `retain_background_authority`，也没有接收并传入现有 route control。
- `apps/local-host/src/alchemist-native-plugin-http.ts:24–25` 在 response `close` 时 abort 这个 signal，正常短请求完成也会结束它。
- `packages/kernel/src/action-execution-context.ts:13–23` 只有存在 entry-owned `context.retain_background_authority` 才去掉传输 signal；没有 inherited authority 时保留 `context.signal` 并每次 `throwIfAborted`。所以 ActionExecutionContext 上“有此方法”并不代表获得了独立后台寿命。
- `AlchemistEffectControl` 的 Pick 与 `actor-actions.ts` 重建控制确实丢能力，但修这两处只修内层，不能修最外层 HTTP。

最小修正：在已认证的 Host Alchemist HTTP 入口，受理仍活跃的 command 时捕获可信的、可复核的 Host/project/provider 授权，复用已有 route control 语义；明确补 `web-request.ts`/Alchemist HTTP 接缝至本片允许路径，不能只写“Host 透传”。retain wrapper 捕获后用 studio stop + retained guard，不能继续调用原前台 `beforeEffect` 或闭包里带原请求 signal 的 assert。请求在受理之前结束必须拒绝，受理成功返回后后台则可继续；项目删除、provider 停用/重登记、Host 关闭仍须拒绝。Kernel 已有注册 token 与环境检查，应沿用，不制造另一套身份。

MCP 是另一条实际路径：`mcp-action-client.ts` 按 transport 提供的 backgroundHostCurrent 才接 `mcp-background-authority.ts`；应沿实际 MCP 入口验证，不从 HTTP 推断。其他没有可分离原始授权的调用保留原取消边界，不能为了让测试运行给所有 caller 去 signal。

必要测试：真实 HTTP start/continue 返回并关闭 response 后，已受理 job 仍运行；受理前断开不执行；随后停用/撤权/删除阻断下一次 dispatch 和提交。真实 MCP 做对应 transport 寿命用例，不能只用手造 caller 返回恒成功 guard。

## P1-2：Lens 仍有 worker commit 以外的业务写与外部作用，不能等 Runtime 片才处理

`jobs/lens-job-handler.ts` 在保存最终报告之后直接调用 `workReuse.reconcile(plan.id, control.signal)`，没有传 effect control；`work-reuse/service.ts` 的 reconcile 会 `linkConsumption`，随后直接 `UPDATE work_reuse_receipts`。它不经 `JobHandlerControl.commit`，只把 commit/saveCheckpoint 改为异步不会覆盖它。仅有 signal 也不能代替每次 await 后同步复核权限/lease。

最小修正：本恢复片就将 `plugins/native/alchemist/src/work-reuse/service.ts` 和相关 Host port 接缝列为允许范围。外部 link 前用本次真实 retained authority，并把必要的当前权限贯穿到接收方；本地 receipt UPDATE 必须通过同一 worker 的授权+lease提交。拒绝后 catch 可以保留原 pending receipt，但不能吞掉撤权后又执行写入。无需迁移整个 workReuse 架构。

另外 `HostResearchRuntimeAdapter.collect` 当前 `ai.search` 前仅检查 signal；模型虽有 beforeModelDispatch 字段，Lens `runtimeInput` 当前未填。计划已提出逐 dispatch 检查，这部分方向对，但应明确覆盖 search、格式纠正和 reconcile，而不是只在 beginCall 前检查一次。跨 actor 的继续还受 `WorkReuseService.validateSnapshot` 的 `snapshot.actorId !== actorId` 拒绝：保留这个现行归属限制并明确返回不可继续即可，不可悄悄切回 job.actorId 绕过它，也不可重写原 snapshot 来适配新操作者。

必要测试：等待 linkConsumption 时撤权，迟到返回后 receipt 不变；权限拒绝不能形成失败记账；source/model 验证完成后到 search/model 发出之前的交错也必须挡住。范围是新增后台授权链，非重跑整个 LIFE。

## 其余实施前应明确的合同

### 指定执行登记、单 worker 与 lease

当前 LocalWorker 只有一个 `active`，`runNext()` 在忙时直接 false。计划同时说“受理时 CAS running/lease”及“run(jobId)”但未交代 A 运行中受理 B：若立刻给 B lease 而不续租，B 等待期间会过期；若 run 返回 false 后丢登记，B 会永久无执行承诺。

最小可选实现是保留单 worker，只把具有当前内存授权的 job 放进内存 pending 队列，真正开始时才 claim lease，并在等待时复核/撤销登记；或者忙时在任何业务写之前明确拒绝本次受理。需要选定一种并使 UI 状态匹配。不要为此改成无限并发 worker。测试应包含 A 正在跑时新 start/continue B，以及 B 在等待中撤权/关闭。

同进程 job map 能阻止双击，不是跨进程排他证据。计划已承认不能偷活 lease，仍需指出生产实际 single-owner 的锁/宿主入口，以及 raw embedding 的边界；没有证据时保留未过期陌生 owner 的拒绝，不能用 map 空直接接管。重启立即可继续与不抢活 owner 必须同时有可解释的证据。

### 首次初始化与 query

去掉启动 seed、recoverExpired 和 query actor INSERT 是正确方向。空库 bootstrap 本来使用内存 workspace/actor 视图，settings 当前会因无 row 抛错，Pulse 无源行会显示空清单，因此 settings 与 Pulse 都需由同一默认定义生成纯视图。首次有效 command 先按外键依赖创建 workspace，再真实 actor、必要 settings/source defaults；不要只搬 actor INSERT 导致 workspace 外键失败。初始化必须有 command 授权，避免使用被篡改定义的 operation 标记；解析失败不能顺手初始化。默认值投影与首次持久值应一致，版本确认值不要取每次查询时变化的时间。

“query 零外部调用”应限于恢复/进度读取，不宜误伤现 models/settings 的 `ai.listModels` 或 reuse 材料读取等既有 query；准确验收是零业务写、零后台任务自动执行/付费 dispatch。结构 baseline 初始化仍是 Host 存储职责，和业务 seed 分开。现 `readEvents` 的只读 SELECT transaction 本身不是业务写；本片无需为了这个验收提前改成 PluginDatabase。

### Lens 事件可作累计预约事实，但不能笼统取 max 后不验一致性

当前 `beginCall` 每次调用前用 `saveCheckpoint` 同事务写 marker 与 `call_started`；`SqliteJobRunner.saveCheckpoint` 包含 withLease+appendEvent，事件按 job 序号单调增长，未找到业务删除 job_events 的路径。安全 checkpoint 会覆盖 marker，事件仍保留。因此现行事件足以作为累计“已预约/可能收费次数”的持久来源，无需新增预算表或修改所有 checkpoint JSON。

需区分预约数与真实收费数：crash 可能在 marker 写后、请求发前，仍保守占用一次预算；不得宣称它证明供应商已扣费。正常现行数据中的调用计数是 1、2、可选3、最后+1；新重试后改为严格 n+1。完整读取该 job 的事件，不用分页游标后的片段。marker/checkpoint 中计数只用于一致性校验或拒绝，不能一边把事件称唯一事实一边悄悄 fallback 到另一套。发现 gap/倒退/超预算/与 marker 矛盾应拒绝具体记录。

特别是现 `cross_checking_complete.callsUsed` schema 是 optional min2/max3。累计重试可超过3；实施必须明确继续以事件为累计唯一事实，并保持这个现有可选字段仅作旧阶段信息/省略它，或有意修合同，不能把全局累计4直接塞进现 schema 然后下一次恢复解析失败。“不把 max3 当总预算上限”尚不足以告诉实现该写哪种形状。

恢复后一旦剩余不足，保持待审阅、原预算不变符合裁定；ready_to_persist 允许零调用提交也正确。保留正常原 limit1/2 的 partial 政策与恢复耗尽状态的区别。collect 实际是搜索阶段，不全是模型调用，所以描述宜为外部调用预约，保持现 budget 的口径。

## 建议裁决

保留分片顺序与现 Store；把上述两项 P1 的真实入口和 workReuse 提交补入本片，明确单 worker 等待/拒绝策略、首次初始化默认视图、事件唯一计数的读写形状，再由主 Session 并入唯一 spec。无需新增产品决策或再问已裁定的恢复政策；这些是实现范围和验收的补全。此报告不授权实施，也没有认定最终 Runtime 已完成。
