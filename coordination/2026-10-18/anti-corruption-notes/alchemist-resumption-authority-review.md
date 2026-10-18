# ALC-RES 后台恢复授权复核

2026-10-18；只读检查 `wt-alchemist-runtime` 的当前未提交实现及 `alchemist-next-implementation-plan.md` 末节；已与 images_runtime_dependencies 核对方案。未改源码、唯一 spec、门禁，未构建或跑测试。以下针对正在开发的候选，不是对已完成版本的验收。

## 结论

在保留一个 `runs.continue` 动作、按已存 job kind 决定权限的合同下，建议接受窄扩展 `retainBackgroundAuthority(requiredPermissions?)`。现接口不能正确表达此需求；只用一次前台检查不够，复用前台检查又会把已结束请求寿命带进后台。这个参数必须是**额外必需权限**，只增加检查，不能替换当前动作权限，更不能指定或放宽 action refs。

并非任何设计都必须扩接口：拆成两个静态声明权限的继续动作也能用现接口，但改变当前单动作合同、目录/UI/MCP，且增加重复入口。直接把 generate+collect 都写到一个动作会拒绝合法的单类别授权；捕获对应 start 动作会引入另一动作的授权与 availability，可能错误阻止安全 checkpoint 的零模型落库。因此当前窄扩展有明确、必要的消费方，并非预建通用恢复平台。

## 已有链路

1. Kernel `action-execution-context.ts` 的 `retainBackgroundAuthority()` 只捕获当前 reference。注册 token、可见性、availability、环境由 Kernel 保留。没有 entry-owned hook 时仍使用原 signal；有 hook 时可分离 transport，但由 hook 负责实际授权。
2. `retainAuthority(refs)` 没走 background 分支，仍绑定前台 signal；不能拿它冒充后台能力。`effectGuard.beforeEffect` 还检查 executing 寿命，结束后必须继续抛 `actions.expired`。
3. Alchemist `actionsInFlight.track` 当前透传无参方法，并在 retained guard 上只组合 studio stop；这条方向正确，不能换回原 control.beforeEffect/assert 的闭包。
4. `JobResumption` 从数据库读取 kind，在 start/continue 受理时捕获 guard；`LocalWorker` 在 claim、续租、handler commit 前复核 guard，迟到结果的失败记账也经过同样检查。这里需要固定该 job 类别权限，不能从输入的 kind/permissions 或历史 actorId 取授权。
5. MCP `authorizeMcpActions` 的前台 validate/assert 包含 transport 检查；后台必须经 `mcpBackgroundAuthority`。现后台 hook 只固定 refs，未接受额外 permissions。`resolveMcpActionContext` 会重新计算整个客户端当前授权集合，不能不加约束地把它当原已受理工作的权限来源。

## 最小接口与检查合同

公开方法：`retainBackgroundAuthority(additionalPermissions?: readonly string[]): RetainedActionAuthority`；可信入口 hook：`retain_background_authority(references, additionalPermissions?)`。名称可沿方案的 requiredPermissions，但文档必须明确 additive。默认省略保持现有行为。

- 仅活跃 handler 能捕获。复制并去重/冻结参数，不能保留调用者可变数组。Kernel 同步拒绝任何不属于原 context.permissions 的额外权限；原动作权限、reference/provider/version/token 不变。不能把传入数组当替代动作声明，也不能把额外权限变成新 allowed refs。
- 无独立入口 hook：异步复核原 validate_permissions（基础+额外）及原 validate_authority，最后同步 assert_authority_current(reference,基础+额外)，继续受原 signal 约束。
- 有入口 hook：基础动作 authority 和额外权限都由真实入口的脱离 transport guard 异步及同步复核；不能调用含旧请求 signal/handler lifetime 的前台闭包来补权限。Kernel 仍独立检查环境、注册、availability，不用 hook 取代它们。
- Alchemist 类别映射只在插件：Exploration/Lens→generate，Pulse→collect；安全 checkpoint 也保留类别权限，模型不可用不等于类别撤权。原 job kind 必须先验证支持，业务输入不能覆盖它。
- `actor-actions` 等同一调用的透传层传递参数。`bindActionClient` 的父/子身份不能混淆：父 guard 保留原父调用，子 bound caller 检查子动作和子额外权限；不能用子权限替换父 authority，也不应机械要求父调用具有子动作的所有额外权限。当前同身份 HTTP 路由可以直传，但通用嵌套绑定应保持两份检查各自归属。

### MCP 必须固定原 allowed refs

捕获时使用真正已授权 context 的 allowed_actions（精确 capability/version/provider）和权限集合，不使用未解析的 raw transport caller 来猜原范围。复制捕获允许的来源集合；后续追加权限检查从**该原集合与最新有效 grants 的交集**求得，且 latest declaration/grant 必须一致。新加的 grant、相同 id 的另一版本/provider、原不在 allowed refs 中的同权限动作，不能让已受理 job 获得或恢复权限。当前 continue 的 exact grant 必须始终有效，其他同权限动作不能替代它。

不必把所有来源动作作为真实依赖调用或检查其模型 availability。这里保留的是授权来源，不是执行 start；否则模型配置离线会错误阻止 ready_to_persist。若多个原已允许的来源都提供同一额外权限，可按既有权限并集语义保持可用；不能在后台扩大到受理后新增来源。不要为此新增持久授权记录。

## 当前必须处理的问题

**P1：现 continue 同时声明 generate+collect。** `studio/shared/contracts/actions.ts` 的 runContinue 在派发前就要求二者；只具 generate 的 Exploration/Lens 调用和只具 collect 的 Pulse 会被拒绝。改为基本 read/write 后，必须一起完成上述持续类别权限检查，不能只删声明。

**P1：HTTP parent 虽分离，bound caller 仍携带原 signal。** `web-request.ts` 当前调用 `userActions(ALCHEMIST_ACTION_PERMISSIONS, { signal }).invoke(..., control)`；`web-project-context.ts` 把 signal 放入 bound caller；`boundBackgroundAuthority` 的 own 缺失分支继续 `caller.signal?.throwIfAborted()`。`alchemist-native-plugin-http.ts` 正常 response close 就 abort。因此仅引入 pluginRouteControl 仍会使已受理任务在响应结束后失权。最小修正是在此可信入口让 signal 只归 route control，bound 身份提供独立 Host/project/权限检查；或为该 bound caller 提供真正 own hook。不能全局删除 bindActionClient 的 caller.signal 检查，否则破坏其他调用原取消边界。Host 只查 running 不足以替代 Kernel 的项目/注册/安装环境检查，须保留那些检查。

**P1（降基本权限后必现）：类别拒绝发生在 initializeCommand 之后。** `createAlchemistOperationExecutor` 当前先 await effect，再 `dependencies.initializeCommand()`，随后才调用 JobResumption.continue。当前双权限声明暂时挡住该场景；若只改为 read/write，并把额外权限放到 handler 内 capture，缺 generate/collect 的请求已经可能写 actor/default。必须先纯读取 job 并完成类别 authority 检查，再在有效提交点初始化；不要把初始化继续放在通用 command 前置、靠后续拒绝修补。无权限拒绝需验证零 seed/claim/业务失败记录。

**P1 风险：仅用最新 MCP 全权限并集会扩大原授权范围。** 新扩展如果只新增 `resolveMcpActionContext(...latest).permissions.includes(extra)`，会接受受理后新增、不属于原 allowed refs 的来源。原集合交集及 async 后同步读 preference 的最终检查不可省。此为建议实现的约束，当前尚无参数实现，不能描述为现已发生漏洞。

没有发现必须新增用户产品决定的 Blocker。共享 API 变化及必要安全测试/spec/API 快照由根统一纳入当前范围；不以本报告授权修改门禁。

## 验证建议

沿现 `tests/action-background-authority.test.ts` 补通用拒绝路径，沿真实 MCP gateway/HTTP 与 Alchemist job 测试补消费证据：

1. generate-only 可恢复 Exploration/Lens，collect-only 可恢复 Pulse；基本 read/write-only 缺类别权限在任何 seed/claim 前拒绝。job.kind 由存储读取，输入伪造权限/actor无效。
2. 捕获数组之后修改原数组无效；超出原 caller.permissions 同步拒绝；省略参数行为不变。原 handler 的 beforeEffect/capture 在返回后仍 expired。
3. 保留 continue grant，仅撤销实际类别来源，在 async 权限等待后、模型/搜索返回后、最终同步 commit 前分别拒绝；无 checkpoint/lease/failure/产物或外部 link 晚到写入。无需无关类别权限。
4. MCP 新授予同权限但原 allowed refs 之外的动作，或改 version/provider，不能救活旧 guard；删除 continue grant 后即使 peer 同权限仍拒绝。使用真实 preference 与 gateway，不能手造永远成功 guard。
5. HTTP 正常 response close 后已受理 job 完成；受理前断开拒绝；项目删除、Host 关闭、provider 重登记、studio stop 持续拒绝。无独立 hook 调用仍服从原取消。
6. 嵌套 bound 调用父撤权和子额外权限撤销分别失败，不能相互替代；同一调用透传不能丢参数。
7. ready_to_persist 模型离线仍可在类别权限有效时零模型落库；类别撤权仍拒绝。重复继续不重复产物，单 job guard 不让队列捡另一个旧 job。

本报告为静态证据。当前未提交代码还在变化，实施后以最终 diff 和以上真实交错结果裁决；不把计划、类型通过或 mock guard 测试当真实 HTTP/MCP 完成证明。
