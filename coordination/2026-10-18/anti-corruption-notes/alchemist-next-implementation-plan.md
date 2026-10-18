# Alchemist 下一片实施计划（负责人：主会话；实施待分配）

状态：只读设计，未实现、未构建或测试。2026-10-18，核对 A=`wt-alchemist-runtime` 当前生产实现（任务给定 HEAD f26f8216e），保留根正在修改的文档、安全测试改名与baseline。唯一合同为 `specs/repository-anti-corruption/spec.md` 开头 ALC-LIFE 与“Alchemist 后续恢复裁定”；本文是实施定位，需由根并入该合同，不是另一套需求。

已读外部 alchemist-storage-plan.md / alchemist-storage-review.md / 既有生命周期复查结论。旧 storage-plan 的 borrowedSql、自动恢复队列、启动seed建议已被后续裁定取代，不实施。生命周期补修和根报告的41针对/81包测试是已有证据，本轮未重跑；以下只报告源码证据。

## 1. 推荐顺序与完成边界

下一片推荐先把**现行单一Store上的显式继续恢复闭环**做成真实可用：重启只读展示已保存进度，用户点继续受理指定原job，使用本次真实调用授权，执行到完成/暂停；同时让新任务也走同一按job授权路径，关闭旧无授权队列自动消费。它无需先换数据库，不复制Repository/Store，不搬baseline，不加持久授权系统。继续动作不是“把状态改queued然后让现worker随便捡”，也不是重建一个新plan。

可行性的已有基础是公共 `ActionExecutionContext.retainBackgroundAuthority()` 和 `RetainedActionAuthority`（contracts/platform/actions.ts），当前createAlchemistActionHandlers已把真实caller传入invoker；但 AlchemistEffectControl 的Pick以及 actionsInFlight.track 重建control会丢弃这个能力，必须明确透传并组合当前studio停止边界。只复用现有能力，不复制PluginBackgroundClient通用实现，也不构造fake caller或无条件authority。但这不是单纯透传：HTTP真实entry目前没有可脱离response的原始authority，必须补第8节接线与实测。每次接受的job关联一个**内存中的实际执行登记**，持有本次权限guard和结束承诺，关闭后不可恢复；数据库中的actorId/lease只保留归属和并发信息。最终Runtime接线时由已有 `context.services.background.start` 提供同一类执行边界；不要为此先做第二个长期后台协议。

若根希望避免任何现Host接缝调整，也可将恢复和最终Runtime合成一片，但它会同时包含项目分库、所有SQL写边界、model/search/workReuse适配与UI；不能把直接分库描述成两构造函数改动。推荐分片的恢复逻辑、checkpoint与UI是最终Runtime仍会使用的同一实现，暂不动driver协议，因此不会制造两份Store。

## 2. 已核实的缺口与定位

| 位置（均相对A） | 当前行为 | 本片修改目标 |
|---|---|---|
| `bootstrap/local-runtime.ts:85–117` | 开库后seed身份、settings/pulse defaults、recoverExpired | 仅开库/结构baseline；领域seed/default首次有权command提交，query返回默认视图而不写 |
| `bootstrap/actor-actions.ts:39` | 所有invoke先INSERT actor，含query | query只设置内存身份上下文；command在有效提交内登记actor/必要默认值 |
| `bootstrap/studio-lifecycle.ts:12–28` | start与interval反复recoverExpired/runNext | start不消费持久队列；idle按真实活执行判断，等待继续的旧job不永久阻止idle回收 |
| `jobs/sqlite-job-runner.ts:135/200` | claimNext全库取最早queued；过期running写interrupted再queued | 接受指定job的CAS；无当前执行登记的queued/running/interrupted只派生“等待继续”，查询不改库 |
| `jobs/local-worker.ts:39–91` | lease/stop控制提交，未携带原调用权限 | 按指定job执行，模型/搜索发出前、续租/checkpoint/成功/失败记账前检查这次权限；无效后零业务写 |
| `local-runtime.ts:159–165` | job.input.actorId进入ALS（缺省actor-local） | 留作作者历史不授予权限；本次继续的真实caller决定执行授权及本次操作者审计 |
| `jobs/job-handlers.ts:111/142` | generating立即失败；模型/taste运行时现读 | 用户明确继续才允许从未完成生成重新做；原方向快照不变，本次模型/taste固定 |
| `jobs/lens-job-handler.ts:76/187` | call_dispatched立即失败；callsUsed用阶段硬编码1/2/3 | 从marker.previous恢复，保留累计预约数；每次新增调用先持久计数，再发出 |
| `services/get-research-workspace.ts:65` | interrupted显示queued | 显示等待继续/预算耗尽原因，不假装后台已运行 |
| `shared/contracts/actions.ts`、`client-flows.ts`/`client-views.ts` | 无继续命令/确认信息；lensWorkspace状态不含interrupted | 一份继续动作及派生resume信息，HTTP/MCP/UI均消费同一合同 |

表里的bootstrap/jobs/services路径前缀均为 `plugins/native/alchemist/src/studio/server/`。现动作start仍立即返回后台引用（actions.ts:193/207），继续保持这种用户行为，不把页面请求改成等待整场模型调用。

## 3. 最小状态与授权流

1. **打开/重启**：读取现jobs、checkpoint及领域run；当前实例执行登记为空。旧queued/running可派生等待继续；陌生owner且未到期的lease拒绝接管，UI显示稍后可继续。过期后仍须用户新command CAS，不自动恢复。原持久status可保持，派生视图不是写修复。当前源码只证明studio map的同进程排他和CLI/MCP转发约定，未证明所有raw embedding跨进程独占；不能以本内存map为空抢活lease，不新增锁平台。
2. **查看继续信息**：新query或现workspace/run结果增加resume描述：原job/方向或plan、是否仍在执行、checkpoint阶段、Lens已预约/剩余预算与重复计费提示；Exploration展示这次将采用的当前model/taste摘要。空库query不seed、不登记actor、不自动恢复。设置查询须有纯默认值，不因未初始化抛“settings不存在”。
3. **点击继续**：command只输入jobId及必要的所见上下文确认值，不接受actor/project/lease/预算覆盖。项目来自caller；查原job与关联run并拒绝终态成功/取消、无关项目或不可恢复错误。兼容已因旧中断逻辑落failed的job，只按现有明确中断错误码和实际checkpoint判定可继续，不将所有failed都重试。
4. **先固定本次输入，再等待**：原input/方向快照继续来自job；Exploration从当前设置/taste捕获确定值，模型auto必须最终固定具体modelId而不是运行时再选first。查询展示到点击间若配置变化，command应返回更新的确认信息或以版本确认拒绝，不能展示A实际跑B。模型列表查询可能await：冻结选择政策/taste在首次等待前，列表返回后选定并校验；随后正式发出前再验证绑定可用，拒绝静默换模型。Lens始终原plan.modelId/budget、原版本材料。
5. **受理**：在真实动作仍活跃且权限通过时取得现有retained authority；按jobId在内存登记pending（同步保留位置防双击），不立即claim running/lease。现单worker忙时B留在有当前权限的内存pending队列，UI显示本次已受理等待；无后台持久授权。新start在有效command事务创建job后进入相同队列。等待期间检查当前authority，撤权/关闭清本次登记且零业务写。worker空闲后仅从该内存队列取下一项，重新await授权并同步复核，再对指定job状态与lease做CAS并开跑；未过期陌生lease拒绝，不能全库claimNext。CAS/初始化失败释放登记，不丢失持久job、不增加worker并发。
6. **执行**：指定job的worker只消费自己登记的授权和快照；每次外部dispatch前await authority，随后同步assertCurrent；每次本地提交await authority后同步检查studio/lease/版本并事务写。无await跨SQLite事务。pending不提前占lease；真正开跑后的续租也是写，也受同一权限；撤权或stop后不能记失败、续租或写interrupted。旧running记录通过派生视图展示等待继续即可。权限失效先abort，实际Promise忽略abort仍须由现生命周期drain等到退出，不能只等一个提前reject的等待包装。
7. **完成/等待**：成功checkpoint到最终报告/卡片保存的既有幂等规则保留。只有本次权限仍有效时写合法业务失败；普通权限拒绝不伪装模型失败。释放执行登记后原checkpoint仍可查询。继续A绝不运行B；取消走新授权command取消指定job并停止其活执行。

最低内部接口变化：JobRunner用 `claim(jobId)` 代替全局claimNext；Worker用 `run(jobId, control, acceptedContext)` 代替无参runNext（具体类型只覆盖现字段，不通用Data协议）；JobHandlerControl的 `commit`、`saveCheckpoint` 变成可await，以便每次先检查权限后同步提交，所有handler包含Pulse调用点一起await；generation/search输入组合beforeModelDispatch与signal。control可直接沿用现执行控制/RetainedActionAuthority类型，不暴露恢复授权JSON。

## 4. Checkpoint与预算必须实际改对

Exploration原job.input已有directionTitle/Description，继续不得重新读已编辑方向替换它。已有ready_to_persist携固定card ids，继续直接保存且不调用模型；generating表示未知结果，明确确认后重新生成。model/taste是本次执行快照，不声称原历史逐字相同，也不向旧input追加读取兼容猜测。安全checkpoint可持久保留原形状。

Lens `call_dispatched` 已包含operation/callsUsed/previous，正好支持未知调用回到previous，但**不能把checkpoint简单换回previous后继续现算法**：它会重新把计数设成1/2，丢失原调用预约。需要贯穿恢复流程的累计**外部调用预约数**；唯一持久事实来源是该job完整的现`call_started`事件序列，必须从起点完整读取，不用分页尾段或marker fallback。按现合法调用顺序验证预约值严格1、2、…、n且不超原budget；发现gap/倒退/超预算/marker与最后预约矛盾，明确拒绝该记录，不粗取max、不猜历史费用。后续每次dispatch预约n+1，marker及事件仍同事务保存。marker可能保存后尚未真正发出，故预约保守占预算、可能收费，不能说供应商已扣费。

旧`cross_checking_complete.callsUsed`仅保留现阶段含义（2或3），新的checkpoint可依现有optional schema省略它；累计重试数绝不塞进max3字段。synthesize和纠正额度判断改读事件累计值，不能再用checkpoint.callsUsed+1作为全局次数。没有call_started的初始planning是零预约；如checkpoint阶段与空事件不相容须拒绝，不能fallback估算。

预算是否足够按“下一次外部调用需1份”判断，不以阶段名称决定固定序号。重做collect/crossCheck/格式纠正/synthesize都占原剩余份数；调用前checkpoint+call_started要在同一事务里保存，避免两个记录不一致。跨check结果未知、纠正结果未知时都从最近有安全完整输出的checkpoint重做，不能发明缺失的半份模型输出。Lens安全ready_to_persist即使预算用完也可零模型提交；尚需模型而remaining=0则保持待审阅，UI说明另开新研究，原budget原样，不自动生成新plan。现createPartialReport的limit1/2既有政策只适用于已有正常路径，不能把多次中断后耗尽包装成该正常成功解释。

Pulse也使用同一LocalWorker。它不能被遗忘：重启停止自动收集，继续仍需新真实授权，source checkpoint按现有completedSourceIds恢复；网络发出和保存前检查authority。无需为Pulse发明模型预算政策。若本片只支持Exploration/Lens，Pulse必须明确显示待继续且不自动跑，但这不满足“所有原任务可点继续”的完整等级；推荐一起沿同一继续动作支持现三种job。

## 5. 数据库分区与Runtime：后续真实依赖

现project executor虽有databaseFor，但 `plugin-host-services.ts:85–88` 仍调用Home的openPluginDatabase；后者只接受store_name并由Home library登记定位单库。Alchemist是 `alchemist/projects/<encoded-project-id>/studio.sqlite`，search.sqlite/search-content另归Host搜索。不能直接声明store_name=alchemist把所有项目塞一个新Home库。

最终迁移需可信数据库owner登记支持既有项目分区：从Host project context取项目id，既有alchemistProjectDirectory编码规则只在Host storage定位处使用；manifest/action不能传path或owner。声明baseline由插件给，Host负责开库/只读连接/关闭；PluginDatabase公开get/all/transaction合同保持。扩展可信登记和project session装配，不新增Alchemist专用borrowedSql。关闭顺序沿本次已补的拒绝接纳→撤销权限→等待实际工作/搜索退出→关闭库→删除目录，不能让generic dispose提前关闭。

业务随后一次沿最终PluginDatabase提交边界迁移：Repository读用Reader，写显式收同一个Transaction；start/enqueue/run/event共享同tx；worker lease+业务写同tx。现readEvents可改单SELECT LEFT JOIN得一致快照，避免新增公共readTransaction。null与undefined、changes number/bigint精确处理。不要半数prepare/半数新client同时写同库。无需因为分区迁移改变schema/version或读取旧形状。

Runtime正式接线另需：项目监督器条目/真实definition替换现builtin构建期provider；现AlchemistAiPort接既有services.model并保留prompt/schema/格式纠正预算规则；搜索、workReuse、Pulse GitHub的可信项目/外部动作通过各自公开服务，不能用job.actorId恢复授权。当前Alchemist Prologue专用Host代码的model列表与generate直通及search惰性owner要在此切换片一起裁撤/接管，不能仅库迁好就宣布Runtime完成。启动只做服务装配，领域默认值延后command；新数据库结构初始化归Host，不等于query能写业务seed。

## 6. 必须验证与允许边界

建议验收编号由根加入唯一spec为ALC-RES：

- RES01：真实进程重启，queued/running且lease尚未过期、interrupted、未知调用marker和安全checkpoint均保留；多次query零INSERT/UPDATE、无自动job或付费dispatch，等待继续展示正确；保留既有listModels等合法只读query。空库workspace/settings/Pulse均有纯默认投影且不seed。
- RES02：真实继续A+B队列，只A运行；同job并发两次请求只一份登记/lease/dispatch/卡片/报告；A运行中B进入单worker内存pending，未开跑不占lease，等待时撤权无业务写；旧已完成/取消和跨项目job拒绝。新start也不消费其它旧job。
- RES03：等待授权/模型/搜索/提交时分别撤权、禁用、关闭/删除，迟到成功与失败均零新增业务写/续租/费用请求；实际executor未settle不能关库。复用已审生命周期证据，新增仅涉及的新交错。
- RES04：Exploration在点击前后改方向/model/taste，方向仍原job值、本次所示model/taste固定；不可用模型明确拒绝；ready_to_persist无模型且重复继续无重复card。
- RES05：Lens call_dispatched(collect/crossCheck/correction/synthesize)恢复，计数累计而不归零；每次未知调用已有保守预约占预算，但不声称已扣费；remaining0无dispatch、不加budget、有可读待审阅进度；safe checkpoint不重复调用已完成阶段，ready_to_persist可直接落库。
- RES06：解析通过且有权command首次按workspace→真实actor→必要settings/source defaults外键顺序初始化一次；query默认值与持久默认一致、确认版本不取每次变动时间；query无actor/seed，坏DB状态明确错误；继续操作者来自caller，修改job.actorId不能获得权限；保留创建人历史。
- RES07：Pulse相同授权规则，checkpoint已完成来源不重复消费；取消、权限拒绝后不写失败。
- RES08：真实UI从重启视图点继续，展示模型/taste或预算/未知费用提示、双击忙状态、耗尽提示与原任务链接；HTTP/MCP同动作/事件结果，没有前端私自新建研究替代继续。

允许代码边界：插件bootstrap、jobs、相关services/runtime、shared/contracts、manifest、现client交互/视图及其测试；现Host Alchemist接缝含web-request.ts、alchemist-native-plugin-http.ts及其personal route端口、plugin-route-control.ts必要复用，MCP真实entry/背景授权接线的必要修改；插件work-reuse/service.ts和linkConsumption实际接收端授权接缝属于本片，不推迟到Runtime。保持一个Store与现物理库。根串行维护唯一spec、README、安全表、动作/API快照、门禁数字；不修改门禁规则、不写真实Home、不改vendor、不建新恢复平台。最终数据库/Runtime片才允许storage可信分区登记、plugin-host-services/executor、project-plugins/builtin-plugins、旧Host路径删改和公开API快照；不能夹入本恢复片。

实施后先按包README与受影响链路安排整体build，再跑Alchemist runtime/worker/recovery/authority/host生命周期与包单测；动作合同/边界/健康/资源体积按改动校验。真实浏览器由根排唯一时段；本轮没有运行任何命令验证结果。

## 7. 用户待决

没有发现需要重新询问的产品政策：原任务继续、新授权、固定原输入、Exploration当前模型/taste、Lens原计划与预算、未知调用可能重复收费、预算耗尽不扩额均已裁定。精确字段名、继续按钮文案、复用既有事件计数、一个job的CAS实现是实施选择。若实测已有持久数据缺少可确定的预算历史，应按现行形状明确拒绝该记录并报告具体证据；不要预先增加兼容平台或以假想缺失再次阻塞所有工作。跨项目分区接线是工程前置，不是新的用户授权问题。


## 8. 独立复核后的必需补充（以本节及已修正文为准）

已读`alchemist-resume-plan-review.md`并核当前HTTP、MCP、route control、reconcile。以下补齐两项P1与状态精度，无新增产品待决。

**HTTP真实entry**：`web-request.ts:218–220`目前直接构造只有signal的caller；`alchemist-native-plugin-http.ts:24`正常response close也abort。Kernel retained方法在没有entry-owned authority时仍受原signal约束，故仅透传方法会导致start返回后后台立即失权。复用`plugin-route-control.ts`已有语义：受理前仍检查请求signal和真实Host/project/provider权限，只有请求仍活跃时捕获可复核的entry-owned guard；通过既有action caller的retain_background_authority接Kernel捕获注册token。受理后control使用studio停止边界+retained guard，不再调用含原HTTP signal/前台handler寿命的beforeEffect或assert闭包。正常response结束不撤已受理工作；受理前断开必须拒绝；项目删除、Host关闭、provider停用/重登记、授权变化继续阻断。不能为了实现后台把所有caller signal无条件去掉。

**MCP**：`mcp-action-client.ts`仅有transport提供backgroundHostCurrent时组合`mcp-background-authority.ts`；要沿真实MCP调用入口验证。正常返回后的后台寿命和真实Host关闭/撤权拒绝分别测；没有分离authority的其他调用保留原取消边界。测试不能以手造always-success retained guard替代HTTP/MCP。

**Lens全部外部效果**：`lens-job-handler.ts`末尾reconcile目前只传signal，`work-reuse/service.ts:206–215`会先linkConsumption再直接UPDATE receipt。本片将reconcile的本次guard贯穿外部link接收者，并令本地receipt UPDATE走同worker授权+lease提交；外部等待后必须同步复核。无需整个workReuse重构，但禁止权限拒绝被catch吞掉后继续写。已有pending receipt可保留用于以后合法恢复。测试在linkConsumption等待中撤权，迟到返回不得更新receipt或记失败。保留WorkReuse现snapshot.actorId归属校验，换操作者继续若不匹配则明确拒绝，不切回job.actorId或改旧snapshot绕过。

搜索collect、格式纠正和最终模型dispatch分别检查本次guard，不能只在beginCall预约时检查一次；现runtimeInput要真正填beforeModelDispatch，search也要在它实际请求前复核。所有本地提交继续同lease验证。RES03补这些真实等待交错；RES08补HTTP response正常结束后继续、受理前断开、MCP真实入口。

**跨进程边界证据**：alchemist-service-host.ts的studios Map确保同一进程按home/project共用资源；resident-host-request.ts解释CLI/MCP向常驻Host转发，但该约定不证明raw createLocalRuntime嵌入进程互斥。此次未找到足以允许无条件抢未过期陌生lease的证据。因此固定保守行为：未过期陌生lease拒绝并显示等待到期；过期后仅用户新授权command的条件UPDATE可接管。用户没有要求重启立刻抢lease，本片不加持久授权、文件锁平台或新worker并发。

## ALC-RES 实施中确认的窄共享前置（2026-10-18）

`runs.continue` 的执行类别来自已存在的 job，但授权必须来自本次 caller。共用继续动作只声明 `alchemist:read/write`；Exploration/Lens 额外需要 `alchemist:generate`，Pulse 额外需要 `alchemist:collect`，安全 checkpoint 同样保留所属类别的权限检查，不因不派模型而免权限。

当前链路不能只在 handler 开始查一次权限：

- `packages/contracts/src/platform/actions.ts` 的 `ActionExecutionContext.retainBackgroundAuthority` 无参数；`ActionCallContext.retain_background_authority` 只收 references。
- `packages/kernel/src/action-execution-context.ts` 的 `retain` / `check` / `guard` 仅保存 references 中动作声明的 permissions；`retainBackgroundAuthority: () => retain([reference], true)` 只能覆盖 continue 的基本权限。
- 同文件 `retainAuthority(references)` 没有 background 分支，保留原 `context.signal`，正常 HTTP response close 后会取消，不能用它捕获 start 动作来绕过缺口；start 的 availability 还会误挡零模型的安全 checkpoint。
- `apps/local-host/src/mcp-action-client.ts` 的 `validate_permissions` 和 `assert_authority_current` 有 transport 检查；完成 handler 后不能拿它们替代后台 guard。`apps/local-host/src/mcp-background-authority.ts` 才是真实 MCP 后台入口，当前只逐 reference 做权限检查。
- `bindActionClient` / `boundBackgroundAuthority`（contracts/actions.ts 末尾）与 `apps/local-host/src/plugin-route-control.ts` 是 HTTP 从 entry-owned authority 到 Kernel 的现有接缝。

建议最小 API：`retainBackgroundAuthority(requiredPermissions?: readonly string[])` 与底层 `retain_background_authority(references, requiredPermissions?)`。这里只允许把原 caller 已有权限纳入持续复核，不产生权限；捕获时先验证每项存在于当前 caller.permissions（无 wildcard 补猜），复制冻结所需权限；每次异步 guard 与最终 assert 都检查相同权限、原注册和环境。默认无参数行为保持。Kernel 不新增类别表，插件按真实 job kind 给出一项权限。带 entry-owned guard 时把额外权限沿原 callback 交到真实入口，不调用已结束 foreground 的检查。

最小允许文件：`packages/contracts/src/platform/actions.ts`、`packages/kernel/src/action-execution-context.ts`、`apps/local-host/src/mcp-background-authority.ts`、必要时 `apps/local-host/src/plugin-route-control.ts`；契约调用传递点 `bindActionClient/boundBackgroundAuthority`、Alchemist `bootstrap/actor-actions.ts`（必须原样转交可选参数），其它无参消费者保持原行为。共享 spec/API 快照由 root 串行更新。MCP 的当前 permissions 必须由现 `resolveMcpActionContext` 与最新配置/目录得出；同步阶段用已有 sync preference 读和缓存目录，不重新授权。HTTP 是固定本地 owner 权限，但仍验证 requested permission 在绑定 caller.permissions 中，并保留 Host/项目/注册生命周期。

拒绝测试：1）仅 generate 授权可继续 Exploration/Lens，缺 collect 不阻塞；仅 collect 可继续 Pulse，缺 generate 不阻塞；2）起始没有所需权限在任何 seed/claim 前拒绝；3）后台已受理后单独撤销所需 generate/collect，while basic continue grant remains，最终 assert、异步 guard 都拒绝，后续 dispatch/checkpoint/lease/failure/产物零写；4）正常 HTTP response close 不撤已受理任务，受理前断开拒绝；5）MCP 真实 gateway 授权（不能手造永远成功 guard）仍覆盖 provider 换代、项目删除、Host close；6）安全 checkpoint 模型不可用仍可在有效所属权限下落库，缺所属权限仍拒绝；7）没有单独 entry-owned authority 的调用继续沿原 signal 取消。

另一个当前事实：此 A 工作树全仓 `linkConsumption` 仅有 Alchemist WorkReuseHostPort 声明、service 调用和 `plugins/native/alchemist/tests/work-reuse/fixture.ts` 接收实现，生产 Host 没有注入 workReuse。恢复片将当前 port caller 上组合原后台授权、让 receipt UPDATE 经过 worker lease，并在现 receiver 测试迟到外部写拒绝；不另建生产成果复用 Host 接线，最终明确此原有未接线限制。

## ALC-RES 实测进度与 SEL 最终效果边界（2026-10-18 03:02 PDT）

A 工作树 `wt-alchemist-runtime` 仍为未提交候选。宿主窄构建已通过；最新插件初始化 helper/旧中断 failed 可继续两处修改正在 machine-slot 排队构建，日志 `/tmp/alchemist-resumption-build.log`。真实 UI 重启测试正在 browser 槽队列，日志 `/tmp/alchemist-resumption-ui.log`，首次测试夹具误用了 job_events sequence=1（enqueue 已占用），已改为 MAX+1；没有放宽产品断言。

已实际通过的完整命令（早先终端输出未重定向到文件；下面是结果记录，不冒充原始日志；最终增量后将保存一次聚合日志）：
- `node scripts/run-tests.mjs --jobs 1 tests/action-background-authority.test.ts tests/alchemist-actions.test.ts`：2文件、6+5测试。
- `node scripts/run-tests.mjs --jobs 1 tests/alchemist-runtime.test.ts`：13/13（最初一次12/13为旧dist尚未包含已修复的无模型start行为；重建后全过）。
- `node scripts/run-tests.mjs --jobs 1 tests/alchemist-worker-process.test.ts`：真实两进程1/1；SIGKILL后过期与查询零重放，新确认继续恰好一次模型调用。
- `pnpm --filter @molis-ai/molis-work-plugin-alchemist exec vitest run tests/work-reuse --maxWorkers=1`：2文件16/16，真实 ActionService fixture 与接收端最终 guard。
- `pnpm --filter @molis-ai/molis-work-plugin-alchemist exec vitest run tests/jobs/lens-budget-history.test.ts --maxWorkers=1`：6/6，生产readLensProgress，四类未知调用累计/耗尽/完整ledger/超过3次预约。
- `node scripts/run-tests.mjs --jobs 1 tests/alchemist-resumption.test.ts`：6/6，query零初始化、当前actor且伪job.actor无效、Taste/模型确认变化拒绝、双击单受理、无模型ready幂等落库、缺类别零seed、collect不要求generate。
- `node scripts/run-tests.mjs --jobs 1 tests/security-invariants-alchemist-resumption.test.ts`：4/4。真实 openTestHome正式服务器正常HTTP close后继续、受理前disconnect零job；真实gateway与设置授权，正常MCP回复后继续并保留继续actor；撤掉原generate来源再授另一同权限action仍拒绝，晚结果/failure/checkpoint/events/续租零变更。

客户端当前factory 52,909 B，对原50,619 B +2,290 B。root已明确：不为门禁批量缩短标识符，不改压缩器/额度；仅消除实际重复，最终以UI证据及精确差值交root申请。尚未执行任何批量命名压缩。

### 尚未覆盖的实际 SEL 调用链与最小方案（待 root 读后更新同一 spec 放行）

事实链：`HostResearchRuntime.collect` → `AlchemistAiPort.search.beforeDispatch` → `apps/local-host/src/alchemist-search.ts` → `createSearchEvidenceRuntime` → `search-intelligence-client.ts.executeExact`（await `bootstrapReady`）→ SEL intent runtime（opaque operation/content store）→ `anysearch-transport.ts.execute`（await DNS，再https.request；搜索/逐网页extract都会进此端口）→ `createSearchContentPort.write` → `EvidenceContentStore.write`（同步key与atomicWriteFileSync）。当前入口guard仅在executeExact前；DNS后仅signal；SEL操作库可以在异步阶段后记录结果/失败。每秒worker撤权轮询不能保证这条最终边界。

最小接口采用已有本次control的两个函数，不建授权平台、不持久化authority：
1. 插件 `host-port.ts` search输入增加 `assertCurrent?:()=>void`，`HostResearchRuntime.collect` 将 RuntimeInput 上的本次同步assert传入；`runtimeInput`由worker提供。保留已有beforeDispatch异步函数与signal。
2. `alchemist-search.ts` 为此search资源使用一个 AsyncLocalStorage 保存每次input的这两个函数；`search`在run中执行。配置给底层的闭包每次取当前调用，不把第一次调用的guard固化到共享runtime。配置了有界调用的Alchemist场景缺少current scope应拒绝业务写；其它既有Feed调用无此可选配置，语义不变。保留active真实promise直到退出。
3. `search-evidence-runtime.ts` 可选接收 `beforeDispatch`/`assertCurrent` composition hooks。交给 `createAnySearchTransport`，并在 `createSearchContentPort` 的同步 `store.write` 前调用assertCurrent：它之后无await，整个EvidenceContentStore写入同步，无需改evidence-content owner。queryTransport测试缝同样在入口check，但正式DNS最终check仍在transport owner。
4. `anysearch-transport.ts` create函数接收可选两个hooks，execute在DNS返回并通过地址校验后，await beforeDispatch、同步assertCurrent、signal.throwIfAborted，然后立即https.request；每次search/batch/extract均走此边界。保留所有SSRF/TLS/尺寸约束。拒绝后零请求，不以signal轮询替代。
5. `search-intelligence-client.ts` 将composition的同步assert传给bootstrapReady；ensureReady后、client.executeExact前也复核。`packages/storage/src/adapters/search-storage.ts` 的 `createSearchOpaqueBlobStore(db, assertCurrent?)` 在所有同步SQL变更前调用同一assert（createIfAbsent/CAS/CASBefore/delete/collect）。这些async方法自身无await，最终检查与SQL间无异步空隙；不Proxy DB、不越owner直接SQL。`createSearchSecretStore(backend, assertCurrent?)` 的同步create/delete同样守卫，避免初始化等待回来继续写key。Foundation仍使用同一owner端口，密文/namespace/schema不变。

测试拒绝必须落在实际效果：
- 真Alchemist search + 真AnySearch transport，DNS promise挂起后撤权，在DNS结果返回时（不等1s轮询）请求计数仍0；包括extract第二次调用撤权后不新增请求。
- 用现有secretStore注入/SEL实runtime制造bootstrap与late provider结果等待：撤权后比对临时search.sqlite的opaque rows和content目录、Studio jobs/checkpoint/events，禁止结果与失败记账；先前合法预约可保留。
- Blob owner单测在每个写方法前撤权拒绝，并验证原行未改变（同步guard不是永真测试替身，集成测试接真实retained guard）。
- Feed既有search-evidence-runtime/AnySearch/security相关测试不变通过，证明未配置hooks的既有owner路径不被改变；无vendor修改。

此段尚未实现，不能用上面传输4/4代表SEL最终边界通过。允许新增文件范围仅上述5类及对应测试，公开storage导出函数签名变化需要root的API/安全表整合；该前置属于已定RES03，不新增产品决策。

## RES08 继续确认框补齐预算事实（2026-10-18 03:24 PDT，待 root 核后实施）

root 核最终截图发现：当前 Lens 确认只给泛化预算提示，没有可决策的数字与重复收费风险。这是现 RES08 缺口。保留当前后端预算累计、拒绝耗尽及零自动恢复机制，补同一个 ResumeView/确认框，不新建研究或预算。

拟加只读字段：`budget?: { limit: number; reserved: number; remaining: number }`；`unknownCall?: { operation: "collecting" | "cross_checking" | "cross_checking_format_correction" | "synthesizing" }`。Lens 的 `modelId` 返回原计划 modelId；Exploration 仍是本次确认选择。limit 来自绑定原 plan.budget.limit；reserved 来自完整有效 call_started ledger 长度（含未知预约）；remaining = limit - reserved（有效历史已拒绝 reserved>limit）。unknownCall 仅在当前合法 call_dispatched marker 时返回 operation，不宣称其它已完成调用的实际费用已知。

唯一预算解析继续放 lens-progress.ts：将现逻辑的“解析/验证/统计”抽为 inspectLensProgress，返回现 checkpoint/callsUsed/interrupted + exhausted 判断；readLensProgress 保留现执行合同，调用该函数并在 exhausted 时按现错误拒绝。查询摘要使用同一 inspect 结果，即使预算耗尽也能展示数字；无新schema/存储/兼容逻辑。resumption-validation 复用相同 job→run→plan 绑定校验给摘要，JobResumption.view 只读投影；继续执行仍走原 validate/authority/lease。未知或损坏ledger仍拒绝，绝不猜0。

确认框显示原计划模型；“原预算：8 次 · 已预约：3 次 · 剩余：5 次”。有unknownCall时显示“上次调用的结果未知，可能已收费；继续可能重复收费。该次已预约计入原预算，不会增加预算。”无unknownCall时不显示重复收费警告。耗尽框保留不能提交，并显示相同预算摘要。字段是计数不是费用金额。

验证：原四类unknown动作测试加摘要值断言；耗尽查询返回0 remaining并继续拒绝；真实UI新增可继续Lens（原预算8、已预约3、余5、未知cross_checking）打开确认框断言数字/风险/原模型并截图，保留既有耗尽/双击/正常HTTP返回路径。更新同一D最终字节差与desktop/mobile图后再交root裁定资源额度。

## RES03 当前候选与原始证据交接（2026-10-18 03:25 PDT）

SEL窄前置经root写入唯一spec（5fcd5e052）后已实现：Alchemist per-call AsyncLocalStorage；worker async/sync authority贯穿SEL；DNS后/https.request前检查，合法TLS peer后/req.end(body)紧前同步检查（异常进finish）；content.write、opaque全部mutation、secret创建删除最终同步检查；bootstrap等待后再检查。无vendor/schema/密文变更。blob巨大factory的只读scan分页提为helper，未改标识符/额度。无call scope时拒绝业务写，shutdown仍实测完成。

当前客户端53,171 B，冻结50,619 B，差2,552 B；这不是最终申请值，上一节RES08补齐后重报。截图在A `.impeccable/qa/review/alchemist-resumption/desktop.png`、`mobile.png`；主内容已显示等待确认继续，Idea列表的“研究中”仍是原Idea生命周期标签。

原始聚合日志位于`/Users/yijunwang/code/molis-anti-corruption-20261017/alchemist-resumption-verification.log`，以下/tmp原始文件逐段复制，未补造日志：
- `/tmp/alchemist-search-build.log`：Host依赖链构建退出0；`/tmp/alchemist-resumption-build.log`：最终等待状态UI插件构建退出0。
- `/tmp/alchemist-search-authority-tests.log`：真实HTTP/MCP/SEL **8/8**。正常HTTP结束保留后台；受理前断开零job；MCP当前actor与原授权来源。新增四个完整正式执行链交错：DNS撤权0连接、TLS撤权0正文、extract前撤权无extract、extract迟到结果Studio/opaque/content零改变；撤权后立即release，未等待worker轮询。仅网络/模型结果受控，非手造retained guard。
- `/tmp/search-effect-authority.log`：storage最终SQL及secret边界 **2/2**。含collect predicate同步撤权仍拒绝删除。
- `/tmp/alchemist-resumption-integration.log`：恢复动作 **10/10**。四种unknown marker实际继续完成，完整reservation序列累计、原预算8未变、安全阶段不重跑；还有query零seed、当前Taste/model确认、双击、trusted actor、ready幂等与类别权限。
- `/tmp/alchemist-resumption-unit.log`：jobs/services/work-reuse **12文件47/47**。linkConsumption等待中撤销真实Kernel provider，外部ledger与原pending receipt/jobs/events/reports不变。
- `/tmp/alchemist-pulse-authority.log`：Pulse **3/3**，已完成source不重抓、late success/failure撤权零Pulse/Job/Event写且不抓下个来源。后两项为真实handler+测试authority，未冒充真实外网。
- `/tmp/alchemist-resumption-ui.log`：真实browser **1/1**，重启原任务、等待状态、确认正常返回、忙态双击仅1POST、预算耗尽无提交、desktop/mobile无横溢出。
- `/tmp/alchemist-resumption-health.log`：基于origin/main的health完成，只有PulseRepository类381→382与两份已知contracts API快照需更新；没有其它增大/静态问题。Pulse+1待窄整理，API归root。

Feed/shared既有8/8此前通过（search-evidence-runtime与anysearch-single-owner各4/4），该临时聚合日志后被安全组重跑覆盖，历史工具输出可核，不再为日志重跑。先前runtime13/13、真实两进程SIGKILL1/1、actions/background authority11/11同样已有有效输出。`git diff --check`通过。

未验证/整合范围：未跑全仓回归/发布；storage README广回归与共享合同影响整合由root统一排一次。真实商业模型和外网付费搜索未运行；UI不是一骏本人验收。WorkReuse生产Host原本没有注入port，本片只保证已有测试receiver的真实authority最终检查，不声称生产跨模块接线已完成。唯一spec/API/actions快照/README/安全表/资源额度由root维护。根正安排只读review；本片完成后仍要继续数据库与Plugin Runtime最终迁移，不能缩小整个任务目标。

### RES08 实施与冻结（2026-10-18 03:29 PDT）

经root接受并更新唯一spec（eddebfe92），前节预算字段/未知调用/原计划modelId已按同一parser实现。现全部A生产源码再次冻结。新增确认文字明确未知调用可能已收费、继续可能重复收费；原预算/预约/剩余三数在允许继续与耗尽拒绝两种视图均显示。不是预算放宽。Pulse默认源只读方法改为普通prepare链与rows.map，类比原基线净减4行。

最终插件构建退出0（`/tmp/alchemist-resume-budget-build.log`），包含四类unknown摘要断言及耗尽/safe-zero区别的动作集成 **11/11**（`/tmp/alchemist-resume-budget-tests.log`），原parser回归 **6/6**（`/tmp/alchemist-resume-budget-parser.log`）；三份原日志已追加同聚合。当前factory实测 **53,507 B**，比50,619增加 **2,888 B（约5.71%）**。未改额度。

最终Chrome `alchemist-resume-budget` 已按machine-slot排队（`/tmp/alchemist-resume-budget-ui.log`），被另一工作树1103文件全量批次占槽；未抢占或停止其他进程。此前截图仍证明上一轮等待/耗尽路径，最新预算截图必须等这次真实UI完成后替换，不提前声称完成。独立health复查在`/tmp/alchemist-resume-budget-health.log`，执行中尚未写结果。

health复查已结束并追加聚合：只剩平台contracts/actions与contracts/plugin两份已知API快照差异（额外权限参数），Pulse巨大类问题已消除，没有其它增长/静态问题。root负责同步这两份快照。

### 最终 RES08 浏览器证据

共享槽释放后同一排队命令已实际运行，`/tmp/alchemist-resume-budget-ui.log` **1/1通过**（6.35s用例、9.73s总进程），原日志已追加聚合。最终desktop/mobile两张图均已实际查看：原预算8、已预约3、剩余5；未知可能已收费/继续可能重复收费；原计划模型；明确确认按钮。exhausted-mobile已实际查看为1/1/0、保留风险文案且没有提交按钮。手机宽度390无横向溢出。最终客户端再实测仍为 **53,507 B**，原50,619 B，增加2,888 B；未动资源额度。

最终截图完整路径：
- `/Users/yijunwang/code/molis-anti-corruption-20261017/wt-alchemist-runtime/.impeccable/qa/review/alchemist-resumption/desktop.png`
- `/Users/yijunwang/code/molis-anti-corruption-20261017/wt-alchemist-runtime/.impeccable/qa/review/alchemist-resumption/mobile.png`
- `/Users/yijunwang/code/molis-anti-corruption-20261017/wt-alchemist-runtime/.impeccable/qa/review/alchemist-resumption/exhausted-desktop.png`
- `/Users/yijunwang/code/molis-anti-corruption-20261017/wt-alchemist-runtime/.impeccable/qa/review/alchemist-resumption/exhausted-mobile.png`

本writer所有构建/测试/浏览器进程均已结束；代码继续冻结交root串行整合。此证据完成当前恢复确认UI路径，不改变整项Runtime迁移与WorkReuse生产接线未完成的范围判断。
