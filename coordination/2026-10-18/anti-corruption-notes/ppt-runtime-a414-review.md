# PPT Runtime 迁移只读评审（负责人：runtime_project_cleanup_plan）

状态：2026-10-18，需修复 1 项 P1。最终目标 `595784b5d8481884e9aa3b9e258688412cb5681d`，纯 PPT 基线 `dfc21df3ba0bf835e39935885488065873fd9888`。按 root 更新，复核 a414→595 的 spec 和 10 行路由测试；两者生产源码相同，所以 a414 的生产分析仍有效。文件名按原委派保留。

只读检查了唯一 spec 的 W5-01-PPT-01～08、PPT 包开发要求、相关 Host/Runtime/Kernel/SDK 实现、PPT diff 与交付日志。没有修改源码/测试、运行测试或构建、操作 Chrome/Claude/真实 Home；仅写本报告。以下文件行号是目标固定提交，避免随工作树后续变化解释。

## P1：发布三个副作用阶段没有各自复核原调用，取消/撤权后仍可能继续落业务记录

**主定位：`plugins/native/ppt/src/plugin.ts:48–56`，尤其 52–53；中间成果副作用：同文件 70–83，`plugins/native/ppt/src/promote.ts:54–66`。**

`promote` 只在入口（49）等待一次 `caller.beforeEffect()`。其 facade 的 beginPublication 与 completePublication 都调用 `database.transaction(async () => {}, ...)`。实际数据库服务 `apps/local-host/src/plugin-database.ts:29–38` 会 await 这个回调，再只检查插件实例与安装 grants；它不持原 caller，不会检查原调用 signal、原 MCP/Agent 精确授权或原动作注册。因此新增异步事务在原授权检查后提供了真实微任务间隙，授权在这个间隙失效，仍可写 publication_pending_json 或更新 artifact_id/artifact_version 并清 pending。

中间成果也不能依赖 SDK 自动补原调用控制：`promote.ts:54` await begin 后，56–63 立即调用 publishArtifact；PPT adapter（plugin.ts:70–83）没有 caller 同步检查。`plugins/native/artifacts/src/plugin-client.ts:117–118` 创建的是静态 plugin caller，只含安装身份/manifest 权限与 allowed_actions；132–135 的 invokeSync 只查 requirePermission。`apps/local-host/src/local-host.ts:336–363` 同步入口检查项目、SDK 身份与当前 SDK action；Kernel 查的是这份静态 caller，未从 currentPluginAction 补父调用 signal/authority。Host 的 author 回调仅用原 caller.actor_id 写 created_by，不是授权复核。故在 begin 成功后、publish 执行前取消原请求或撤销其精确授权，固定成果仍可能新增；publish 已成功后到 complete 的等待间隙失效，则仍可能把 pending 清掉。实例自身停止有原 requireGrant/active 防护，这里不把“调用方撤权”和“插件停用”混称同一缺口。

**影响**：违背仓库“被取消、撤权的调用不再写任何业务记录”与本片原调用授权合同；可能留下用户已经取消/撤权后新建的 pending、固定成果或完成关联。两段发布的恢复设计本身正确，不应把三段包成一个外层事务来遮掉缺口。

**最小修复方向**：两次事务都使用原 caller.beforeEffect，且在其同步业务回调首条 SQL 前检查原 caller.signal 与 assert_authority_current；在 await begin 之后、实际 artifacts.publish 之前同步检查同一原 caller（若增加异步 beforeEffect，等待结束后仍须最终同步检查）。complete 同样检查，已有固定成果保留、pending 留待恢复。检查必须守住每个真正副作用位置，不能仅给 promote 开头再加一次检查，也不能只换两个空回调而漏掉中间 SDK publish。继续用原 caller 控制，不新建 token 或持久授权表。

**必须补的证明**：在真实 Runtime/Host PPT 发布链制造三个交错点——最终入口检查后到 begin SQL 前；begin 已提交到 artifact publish 前；artifact 已提交到 complete SQL 前。分别取消原 signal、撤销原调用的精确授权；查真实 PPT 行、固定版本和事件结果：后续阶段零新增，已经合法完成的阶段保留并可重试恢复；另验未失效对照。现 `tests/ppt-actions.test.ts:70–91` 的 SQL trigger 证明完成写失败、actor 隔离和重启恢复，但没有取消/撤权交错，不能证明此 P1 已被覆盖。无需改共享 SDK 的自主 plugin caller 语义解决 PPT 的缺检查。

## 已确认、未发现本轮必修问题的部分

- Runtime 装配：project-plugins.ts:260 附近加入可信 definition、PPT_DATABASE 与 release 工厂；只在有 Home 时装配，与现项目监督器一致。services.database 由原 HostSession 持有并随 stop revoke/dispose，不是 PPT 自行保留裸连接；Store 只包装同步窄端口。原 ppt/ppt.db、version 1、两表及 project_id 分区保持，PptStore 默认事务边界在 Runtime 的 database.transaction 内，维护适配器仍有自己的 immediate。
- 11 条路由逐条有 Manifest 声明与 bindPluginActionRoute；request.execution 由 binder 原样向动作 client 传递。POST 上限 1,000,000；输入 project_id 与 context.project_id 比较后移除，id 由路径参数覆盖。旧 Host provider/native HTTP/短路径接线已移除，客户端改正式插件路径并经 host.route。
- Pages 调用通过 services.actions.invokeQuery 的两个声明 consumes；没有自主 owner fallback、没有复制 execution 或无条件 required_actions。text-only 不调用 Pages。已接受 AQD 公共链负责原 caller/audience/allowlist，PPT 入口使用正确接缝。
- AI 路径 actions.ts:182 保留 PluginModelResult，187 在 stores.write 的同步回调里首先 validateResult，才进入 applyOutline 的首条 SELECT/UPDATE；beforeEffect 仍由 stores.write→database.transaction 等待。没有失败记账写入。模型最终检查的接线正确；报告不把现 mock validateResult 空函数测试视为完整真实失效验证。
- intent→artifact→complete 没有外层大事务，完成 SQL 失败保留先前 intent 与 artifact，retry 用 readOwn 回读并检查 type/schema/signature/inline 内容、pending actor、固定引用与快照一致性，后续编辑可保留。这里的正确恢复行为与上述授权缺口是两件事。

## 验证证据核读与缺口

通道目录 `agent-channel/to-codex/logs/` 中实际核到：

- `ppt-runtime-build-final2.log` 有构建完整尾段；交付说明声明整体成功，未见附带该命令 exit/head metadata。未重复跑。
- `ppt-runtime-tests3.log` 6/6 文件通过：web-route 1、MCP 1、assembly 6、error-model 16、action-contract 25、plugin-client-served 3。
- `ppt-runtime-tests1.log` 中 Store 3/3、artifact-compare 4/4、content-owner 11/11、creative-tools 8/8、subject-kind 1/1、creative-promote 2/2、project-deletion 12/12 通过；同批 ppt-actions 与 document-limits 是失败终态，不能拿该日志支持交付说明中的后续 5/5、9/9。
- `ppt-runtime-e2e2.log` 明确 2/2，1440/390 桌面/手机的编辑、下载、冲突与恢复；此前 e2e.log 0/2 被此轮取代。
- `ppt-runtime-health-a414e93cd.meta` 明确 exit=0、head=a414、base=7faaa027，日志通过且公共 API 变化列为既有 AQD/SHM。最终 595 的 health 日志也存在，但不以存在文件替代读取到的 exit 证明。
- 595 新增 10 行测试确验超 1MB →413、坏 JSON→400、普通合法创建→200。root 转达最终 error-model 17/17；当前通道日志 tests3 仍是16/16，最终17/17及 ppt-actions/limits 的补跑原日志需在主验收记录补引用。这是证据收口事项，不以缺日志另造一个生产 P1。

现包 README 必跑中的 document-pin-after-move、content-editing-regressions.e2e、界面改动的 model-ready-surfaces.e2e 未在这份交付日志看到对应结果；由 root 核是否已有仍适用的有效批次，避免重复跑。没有本机全量不单独算缺陷；共享核心全量由集成队列安排。

## 非阻塞 P2

595 新路由测试标题声称“reads up to 1 MB”，但正例只有很小的 title；若 Runtime 误退回默认约 256KB，当前超1MB、坏JSON和小请求三断言仍可通过。宜补一个 256KB～1MB 的有效业务输入（例如合法 slides/notes 内容）并断言业务成功，证明声明上限实际生效。当前 Manifest 与 Host 接线本身未发现相应实现错误，不把这一测试不足升级为 P1。

## 窄补核：outline 不必因 invokeQuery 改 concurrent

结论：保留 595 唯一 spec 的 scheduling 不变。`to-dsh/w5-ppt.md:14` 的“outline 等待 Pages 应 concurrent”是过宽的历史措辞，应由 root 修正为“outline_ai 维持 concurrent；普通 outline 的本机 Pages 查询沿现串行嵌套调用”。没有发现这条实际链的 serial 自等待死锁，也不应为满足该措辞人为改动作合同。

证据：`apps/local-host/src/plugin-action-query.ts:15–44` 只要求当前真实安装动作、项目、consumes、原授权及 query_only，没有要求父动作 concurrent。第43行调用原 options.client.invoke，仍在同一个 Host ALS 执行 scope 内。`local-host.ts:543–549` 明确检查 parent.active、同 entry 且 parent.holdsQueue，然后直接 run(parent.holdsQueue)，不把子 query 排在父动作尾后。`pages.content.read/list → pages.get/list`（pages/src/content-actions.ts:14–17）继续使用同项目 action client，适用同一嵌套规则。这里虽然采用异步 Action API，实际来源是本机 Pages Store，没有模型/外部服务等待；不是“凡 await 都 concurrent”。

真实生产路径覆盖已存在：`tests/ppt-actions.test.ts:11–18` 建临时 Home 与 MolisWorkLocalHost、用 host.actionClient(ref)；114–132 建真实 Pages，调用未标 concurrent 的 PPT outline(page_id)，断言实际 title/slides/bullets 与缺 Pages 权限拒绝。这不是裸 handler/假 readPage fixture。其最终整体5/5原日志的传递缺口仍按上节单列，不影响源码明确覆盖该串行链的事实。另 `tests/local-host-queue-scope.test.ts:49–69` 钉住 serial-in-serial 及经 concurrent 中间步骤的同队列嵌套（本轮未跑）。

补充已核原日志：`ppt-runtime-tests1.log:80–86` 的 Pages outline 用例失败是缺授权错误码 actual `actions.dependency_missing`、expected `actions.forbidden`，发生在正向生成断言之后；不是超时或队列自等待。其正向真实串行 Pages→outline 已执行完。最终 plugin.ts:42–43 已显式把该依赖拒绝映射到原 forbidden，此处只说明调度证据，不用首轮失败替代最终全用例通过证明。

## 窄复审 9198c2d3c（源修复 0a9237ced）：成果写入前仍有一个 P1 窗口

状态：只读核对 595→919 的 plugin.ts、promote.ts 和新 ppt-promote-authority.test.ts；没有运行构建/测试或修改树。两次 SQL 事务的新同步 current 检查（plugin.ts:53–57）位于实际 write 回调内，已经补上原问题的数据库部分。**成果发布部分还未完全修好。**

`plugin.ts:62` 的 beforePublish 是 async：await caller.beforeEffect 后 current()，返回 Promise。`promote.ts:56` 又 await 这份 Promise，57 才同步调用 publishArtifact。current() 通过到外层 await continuation 恢复之间，事件循环仍允许一个已排队的微任务取消 signal 或撤销原授权。实际 publishArtifact 仍无同步原调用检查；原静态 artifacts SDK caller 不会自动补这个检查（前文已沿生产链确认）。所以存在“最终检查当时合法→微任务撤销→成果仍写→complete 的 beforeEffect 拒绝”的真实 JS 调度顺序，留下取消后才新增的固定成果。它不是要求在无 await 的同步代码之间防止不可能的并发。

**最小修正**：保留 beforePublish 的异步 beforeEffect；在 plugin.ts:60 给 promotePpt 的第四参数传一个同步 guarded publisher：`value => { current(); return publishArtifact(value); }`，或在等价真正同步 publish 调用点做同样检查。不要把 guard 只放回 async beforePublish 中，也不要新增异步层；保持现两段事务与已合法提交部分的恢复。现有 current() 可以复用，不需要扩共享合同/SDK。

**确定性可复现实例（可加进现测试，无需计时器或运行全量）**：

1. 用现 createPptPlugin 的真实 handler 与真实 PPT SQLite；database.transaction 测试端口在第一次 write 返回后设 `beginCommitted=true`，此时 pending 已落库；不立即 fail。
2. 原 caller.assert_authority_current 先检查合法性。当 `beginCommitted && !armed` 时置 armed，并 `queueMicrotask(fail)`；fail 分别做 controller.abort() 或 revoked=true。该同步检查本次仍合法返回。retainActionAuthority 会调用断言不止一次，armed 保证只排一次，后续同栈检查仍合法。
3. 此时本次断言是 beforePublish 内的 current（begin 的 current 在 beginCommitted=false 时已结束）。排入的 fail 微任务必在 beforePublish Promise 的 await continuation 之前执行；因此 919 的 promote.ts:57 仍调用 artifacts.publish，published 变1，随后 complete.beforeEffect 才拒绝。
4. 期望：原调用拒绝、真实 pending.version=1、artifact_version=0、**published=0**。919 会在 published=0 这一断言失败；给实际 publisher 加同步 guard 后应通过。若 artifacts 使用真实 owner API，则再断言固定版本与事件零新增，避免只测计数；同步计数 port 已足以抓这次边界漏检，不能声称它是完整 Host 集成。

新测试现有 after-begin 分支（ppt-promote-authority.test.ts:35）在 beforePublish 的 beforeEffect 之前立即 fail，所以在更早检查就拒绝，不覆盖上述“最后一次有效检查以后”的间隙；after-artifact 分支只证明完成 SQL 拒绝，也不会发现成果是在失效前还是失效后发布。保留原三阶段用例，补这一精确微任务交错即可。新测试的 transaction 端口用真实 SQL 但没有 BEGIN/COMMIT，artifact 是计数假实现：可作为 production plugin handler 授权接线回归，不应在交接里冒称真实 Host/完整跨库事务验证。
