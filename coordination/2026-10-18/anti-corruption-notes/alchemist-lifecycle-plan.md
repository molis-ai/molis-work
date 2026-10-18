# Alchemist 第一片：现行架构生命周期修复

状态：只读可实施提案；对象 wt-alchemist-runtime；未改源码/spec、未 build、未碰真实 Home。Root 写唯一 accepted spec。目标是现行专用 Host 下停止/删除正确且失败可重试，不提前宣称 Runtime 迁移完成。

## 本片最小完整结果

前台动作、后台 worker、搜索在关闭开始后不能再写业务（含失败记录）；关闭必须等待原始工作退出，再关连接；清理失败后 owner/entry/资源仍可找到，再次删除或公开 Host.close 能重试。禁止期间另开同项目 studio。保留原共享多 Host owner 语义。无 borrowedSql、PluginDatabase 改造、通用 manager 或持久授权平台。

## 根因与顺序

现 actionsInFlight 只有 count；runtime.close 只 await draining/worker.whenIdle，并在 finally 关 DB。conversation/plan/settings 的前台 await 尚未退出时会被关库；它们虽然检查原 caller authority，但 studio.close 不使这份 control 失效。只加 whenIdle 仍会允许 late write，必须同时给前台调用加入本 studio 的关闭 signal/control fence。

Host.evict 和 Host.close 在 runtime/search 失败的 finally 都 studios.delete；owners.entries 也提前移除，下一次删除会直接 rm。注册 hook alive= !closed，在 close 刚开始便掉到 offline owner，即使资源没关完。runtime.close、alchemist-search.shutdown、search-evidence-runtime.shutdown、project-host.close 都缓存失败 Promise；只改最内层不能实现公开入口重试。

完整链：停止接纳 → abort studio 前台与 worker → 等待原始 executor/worker Promise 全部退出 → studio DB.close 成功 → search runtime shutdown 成功 → search DB.close 成功 → studio registry/owner引用移除 → 才允许删除目录。任一步失败保留后续未释放资源，不在 finally 跨过依赖步骤。

## 插件内实现

1. `bootstrap/actor-actions.ts`：把 action lifetime tracking 收敛在现有本地 helper。追踪实际 invoke Promise（finally 从 set 删除），提供 revoke/whenIdle；whenIdle 应等待 allSettled，调用本身的业务拒绝不算资源关闭失败。revoke 同步关闭接纳并 abort，本次已接受调用传合并 caller.signal 与 studio signal。包装 control：beforeEffect 在 await 原 control 前后都检查 studio 状态、合并 signal 和原同步 authority；assert_authority_current 同步检查同样边界。无 control 的本地用例也得到 studio fence，不能将没有 caller 授权当真权限，但保留本地 runtime 现有测试入口。
2. `local-runtime.ts`：包装层要在实际 action executor 的共享边界上，覆盖 runtime.actions、actionsFor、内置 HTTP app 调用，不只在 actionsFor 计数。actor INSERT 本身也要受相同 fence，不能在 revoked 后排队写。避免两个追踪 wrapper 相互重复计数；可把 binding 后的 invoke 整体登记，但所有其他 exposed action 路径也必须经过同一 helper。使用现有 bind/track helper，必要时只加一个插件内模块，别扩公共 API。
3. close 开始先置“不接纳”、清 interval、revoke 前台、worker.stop；同时等待已有 draining、worker.whenIdle、actions.whenIdle 都退出，再数据库 close。draining 的拒绝不允许提前跳过其它等待；收集全部 settlement 后处理。数据库成功 close 记 finished；失败保留句柄与 revoked 状态。并发 close 共享 Promise，失败后清 pendingClosing 允许重试，成功后复用完成结果。不能把 closed 与 closingPromise 是否存在混成一个标志。
4. 防止自等待：close 不作为 studio action 被 tracker 包住；Host 管理入口调用 close，动作业务 handler 不在其自身 pending 内等待整个 studio.close。
5. worker 当前 runNext 直接 await handler；whenIdle 是 handler finally 才 resolve，因此可沿用，不引入新 worker 调度器。本片不改 recoverExpired/自动队列语义；那是下一恢复片已接受目标，分片最终验收不据本片假称已完成。
6. conversation-message 已在成功与 catch 失败写前执行 control/signal 检查；统一包装应让关闭后两条路都拒绝，不必在每个服务散落 studio.closed 判断。定向测试发现遗漏的真实写点再做必要调整，不预造全套 repository 间接层。

## Host 同片必须改

`alchemist-service-host.ts`：

- SharedStudio 保存 closing 状态与资源完成标志，关闭失败不再成为可用状态。get 检查 own 条目时也先查 draining，不能先返回 own.runtime 绕过 closing；原先全局 entry.closing 检查也保留。
- evict 的“停止再使用”与“删除 registry”分开。可保留各 owner.entries 直到收尾成功，get 因 draining 拒绝；否则若提前从 entries 去掉，必须仍有可重试 pending 集合，前者更简单。closing Promise 失败后清空，但 draining 标记仍 true，以便下一次 evict 重试、不允许 get reopen。
- 只在 runtime.close 成功后 shutdown search，二者成功才从 studios 与所有 owner.entries 删除。已成功资源不重复关闭；尚未成功的步骤下次继续。同步 throw 同样进入这套状态处理。
- close 是停止本 owner 接纳，释放自己的 owner membership。若其它活 owner 仍引用，保留 runtime 可由其它 Host 使用，不给它全局 revoke；最后 owner 才 drain。失败的 entry 留本 owner 的 pending 清理引用，重复 close 能继续；关闭期 hook 也能访问全局 studios 并等待同一 closing Promise。
- hook alive 不能是 !closed：接纳停止与资源清完是两个概念。最小用 service 的 cleanupComplete（包括本 owner待完成收尾）判定；也可显式保存 register disposer，只有所有本 owner资源释放成功才注销。期间 hook.clear 可调用 deleteProject，不因 assertOpen 拒绝。共享另一 owner还活时，该 owner接管 hook；检查 hook stack 的实际行为，不让已关 owner遮住活 owner。
- deleteProject 始终先从全局 studios 获取，await evict 成功再 rm。rm 失败后资源已关可不留假连接，但再次删除可再 rm；关闭失败时绝不 rm。连续删除共享 closing，成功后 force rm 幂等。
- idle sweep 的 fire-and-forget evict 必须观察失败，留下不可接纳且可重试 entry，不能产生 unhandled rejection。下一次 sweep 仅重试 idle 发起的未完成关闭，或由 close/delete 显式重试；用现有日志 owner报告，不能吞为成功。不要立即 tight-loop重试。

`alchemist-search.ts`：shutdown 开始禁止新 search，等待已有 search 原始 Promise（正常 Host 顺序应已 drain studio，但端口自身避免新进入）。runtime.shutdown 成功后才 storage.close，不在 finally 提前关库。分步成功标志、失败清 closing Promise，下一次只重试未成功部分。取消具体请求沿原 signal；不需要新增搜索平台生命周期协议。

`search-evidence-runtime.ts`：现 composition.shutdown 自己缓存 rejected Promise，单改外层无效。允许窄改：保留 intelligenceCollect/queryRuntime/source 三个子资源已成功 shutdown 标志；allSettled 后记录成功，失败项下一次重试，pending Promise 失败清空。不重新构造 runtime，不再次调用已完成子资源。需检查这些现行子资源 shutdown 是否也永久缓存失败；若某个真实内部错误无法重试，给出具体 source/调用证据再扩大最小范围，不能靠外层测试 stub 宣称整个链已可重试。

`project-host.ts`：公共 MolisWorkLocalHost.close 目前 this.closing 永久缓存失败，root公开第二次 close 不会再调用 alchemist.close。把 Alchemist 收尾作为独立可重试步骤与原 memoized其它 Host cleanup 分离；其它已完成关闭步骤不重跑，失败状态不让 Host重新接纳。第一次仍等待两部分完成；下一次重试 Alchemist 未完成步骤。不能简单 this.closing=undefined 导致 Connector/Sessions/Runtime/WebCatalog全体重新收尾；若不修这一层，只能声称 delete hook可重试，不能验收公开 Host.close可重试。

## 明确留到后片

HomePluginExecutor/HomePluginHost、PluginBackgroundClient、PluginDatabaseDeclaration/分区 manager、存储 opener 与 API 快照不在本片；Alchemist 仍未走这些生命周期，提前改它们不会证明本片用户路径。query 不写 actor/seed 的行为改造、停止自动恢复、continue action、UI、预算计数和 checkpoint 重试属于下一片完整迁移合同。现行 SQL/schema、job 状态/输入/actor/lease/恢复语义不在本生命周期片改。

## 允许文件

生产：`plugins/native/alchemist/src/studio/server/bootstrap/actor-actions.ts`、`local-runtime.ts`；`apps/local-host/src/alchemist-service-host.ts`、`alchemist-search.ts`、`search-evidence-runtime.ts`、`search-intelligence-client.ts`、`project-host.ts`。必要的一个本地 lifecycle helper 可放 Alchemist bootstrap，相同职责不另造跨包公共服务。只有真实回归证明现有服务漏掉effect fence才修改对应前台service。

测试：优先扩 `tests/alchemist-host-lifecycle.test.ts`、`tests/alchemist-studio-idle.test.ts`、`tests/alchemist-runtime.test.ts`、`tests/search-evidence-runtime.test.ts`，复用 fixtures/alchemist-actions 的 deferred AI 与既有 wrapStudio seam。README/spec由唯一writer按root spec同步；不通过新增 internal src import绕门禁。

## 必须能失败的真实交错验收

ALC-LIFE-01 前台：正式 Host conversation、researchPlan、settingsUpdate 各自在模型/metadata await 阻塞；调用 close 或删除。原 caller不撤权，用来证明是 studio生命周期本身拒绝。立刻断言合并signal已abort、新动作拒绝、close尚pending、DB/目录仍在；让不响应abort的模型晚返回，再等待真实 executor退出。assistant成功/失败消息0新增、research plan/MVP0新增、settings不变；已合法保存的user消息保留。DB才关闭/目录才删除。用deferred屏障，不靠固定sleep碰时序。

ALC-LIFE-02 worker：保留现有 close waits for cancelled in-flight work；模型故意忽略abort，close一直pending，释放后无结果/失败写。现有测试后半仍验证旧自动恢复失败行为，本片不改它来混入恢复功能；下一片更新为新手动继续合同。

ALC-LIFE-03 runtime.close失败重试：真实 runtime数据库close一次注入失败，第一次reject但不可重新invoke；第二次真实close成功，第三次幂等。确保所有pending原始work已退出才尝试DB close。

ALC-LIFE-04 Host delete：通过已有wrapStudio让第一次真实close完成前抛一次/或DBclose抛一次。第一次hook删除失败且目录存在、全局entry仍留；另一Host同项目新动作被closing拒绝且未构造第二studio；第二次同ProjectDeletionService receipt重试真正完成、目录才消失。另覆盖search.shutdown失败，不得把runtime close失败当成功跳到rm。

ALC-LIFE-05 public Host.close：第一次Alchemist收尾失败，第二次调用同MolisWorkLocalHost.close必须实际重新尝试未完成ALC步骤并成功；成功过的其它Host资源关闭次数不增加。别只调用private AlchemistHostService.close证明公开入口。

ALC-LIFE-06 alive/offline：Host.close卡在前台/资源释放期间，调用真实projectDeletedHooks.clear('alchemist',id)。断言走同一个live pending drain、目录存在，不能落到静态owner直接rm；释放后两条Promise均完成。另验证close失败后再clear仍可清理，close全部成功后offline owner才可接管。

ALC-LIFE-07 idle与共享：两个Host持有同studio，关闭第一个不取消第二个的调用；最后一个关闭才drain。idle eviction与get交错原测试保持；追加idle.close一次失败：无unhandled rejection、下次显式close/delete可重试、等待期间不会开第二studio。

ALC-LIFE-08 search组合：真实composition对子资源一次shutdown失败进行控制，另外两项成功；第二次只再调失败项，最终storage只在composition成功后关闭。真实source SDK若不可重试，测试必须暴露，不能模拟外层Promise绕过。未运行该深层验证，实施前需按失败实际producer补读。

测试可用 t.mock.method/已有wrapStudio注入一次close故障，但要执行生产清理链，不把整套清理换成测试实现。读持久化用独立readonly连接并在删除前关闭，避免测试自己占用DB；等待时观察已有runtime.database.isOpen或真实文件存在。新测试编号写入name/comment。

## 验证安排与决策

改动前包README/并行规则已由主链核对；writer先整体pnpm build，再用项目run-tests脚本跑上述定向与包必跑，运行期间不改src；不启动本机全量或Chrome批次抢占。共享search composition/project-host变更需root审scoped diff并排后续共享回归，不能仅ALC测试通过就算Host全验收。生命周期不改动作schema，API快照按实测，无故不升版本。

root最新恢复选择不引发新必须决策点：不自动续跑；沿原input_json/方向快照，Exploration继续展示并冻结本次model/taste、不承诺历史上下文逐字相同；Lens原plan/model/budget/callsUsed保持，未知调用只用剩余额度，耗尽等待审阅并明确另发新研究；interrupted+派生executionState足够。不加新持久JSON兼容、外部去重保证或持久授权。上述恢复选择属于后片spec，不改变本片“原始工作完全退出后才能关/删”的独立验收。

### 最后补核：search adapter 还存在一层真实资源遗忘

已读 `apps/local-host/src/search-intelligence-client.ts:125–134`：shutdown 先关闭接纳并abort，等待 active 全部settle；然后 `try { await ready; await state.foundation.shutdown(); } finally { ready=null; }`，同时永久缓存 closing。foundation.shutdown 失败时同时丢失唯一 ready/state 引用。因此本片必须窄改此文件，保留已bootstrap成功的foundation直到其shutdown成功，失败清pending closing，后续可重试；bootstrap自身失败且没有已产生资源另按原失败处理，不凭空生成新foundation。已有active原始Promise集合与abort机制可直接复用，无需另建通用manager。第三方SearchRuntime源码在此工作树未发现可读依赖路径，真实第三方shutdown是否可重复仍属实现时必要定向验证，不能宣称本报告已证明它。
