# C 独立有限验证准备

状态：**按用户明确暂停要求（统筹转达）停在只读安全点。** C有限只读计划和局部复用核查已保存，新增独立测试/构建/浏览器为0；未改源码/原测试。已核准备截止2b8，新收到009b仅记未核作者线索。最终C有限选择与独立执行未完成，交接后停止，等待后续指令。

## 当前输入与目标

- C01检查点：`028a952e68eda35cdd6d7fa8817dc7c3663d4bc0` / tree `a813d9fb0749e7403e2aa6718bff41d7f998cc4d`，见14供包（原件 `14-binding-checkpoint.json`）。解决绑定控制、三处unused imports及Inbox接线；build12只证组合可编译，author13只证其实际控制范围。
- C02后续检查点：`1dad39c1efb00ddfee64e4c3c0b4e54dde84c9dd` / tree `3a7c43cf135fee3548c3dd054a495195fa86e5eb`，见21供包（原件 `21-call-control-checkpoint.json`），绑定build18及author19/20，17原首败保留。
- 消费方测试适配：`2b8c8ccc3e3f7a2f5e3b824afa584099fb3288a0` / tree `48a380d5b0989f5439fbbe30880fa72a270bb943`，见25供包（原件 `25-consumer-adaptation-checkpoint.json`）。相对1dad只有三测试路径变化，生产输入未变；其中包含共享`tests/fixtures/feed-library.ts`，复用不能只看测试文件自己的blob。已只读核实采用main `9efbf8d044b580c054b93229f9d99264383ea476`与AB63严格同树，C已包含该main，ancestry-only合并7f与1dad同树。
- 需求事实源：FI-PLAN（原件 `FI-PLAN.md`）、平台2个P1（原件 `fi-platform-REVIEW-0ea746bc.md`）、业务4个P1（原件 `fi-business-REVIEW-0ea-wip.md`）、connector修复合同（原件 `FI-CONNECTOR-FIX-PLAN.md`）、批次计划C段（原件 `post1295-batch-plan.md`）。旧0ea/WIP静态问题是验收来源，不自动说成当前新头仍有六个已执行失败。

后续有限执行的目标是：在临时真实Host/Runtime和受控HTTP中证明现行FI主链、授权和恢复；不把编译、离线数据库夹具或作者数量当成这些链已可用。真实Home4207、维护/六个目录连接器、发布及用户本人验收继续单列。

## 现有证据怎样去重

| 原件 | 可支持的准确范围 | 当前不能据此声称 |
| --- | --- | --- |
| AB63正式Full（原件 `独立测试-Full-63d7b896.md`），统筹已全文核收 | 1542首过+SYS52仅retry文件过1=1543最终文件过；旧九适配、RAC790及a3三红有本轮Linux原件；保42macOS-only和14case差额 | 不能覆盖C新增控制/业务；不能把SYS52生产机制说成已修。C仅复用未触及的实际输入链，不重做已有效A/B组 |
| 12/13/14：source-connector整33/33，0skip/cancel/retry | Runtime客户端拒绝、真实Host port/连接owner、registry bind/final beforeEffect两处发送前变更、ABA及同账号旁槽；`hostRig`用自制provider，另有实际platform客户端 | 不证明真实Gmail多请求、OAuth刷新副作用、sandbox 401或业务落库零写；旧RAC1021的stub自查beforeEffect尤其不能代替生产链 |
| 18/19/21：Gmail Runtime整5/5、OAuth整20/20、factory整5/5 | 源码已核：受控测试插件的实际Runtime→sourcePull→默认registry→SDK→生产Gmail，只替最末HTTP响应；profile后取消/撤权、实际双在途ABA/旁槽、tokenRefs刷新；等待实际SDK poll settle后看请求/secret。通用OAuth另验protocol/凭据/refusal保留与既有队列取消零dispatch，保ASC19/35账号revision反例 | 不把自制provider证据混进这组；它不是实际外部Google访问，也不代替真实Feed两半/Inbox路由和业务最终提交 |
| 20原件（原件 `20-sandbox-oauth-and-dns-author.log`）：call-connections整7/7 | 真实sandbox进程/SDK proxy/broker/Host TLS401/生产OAuth，原调用撤销后待真实Host request settle，zero token/protocol写回与zero重发；最后DNS授权等待后的同步current拒绝，signal未abort仍zero发送 | sandbox 401用例有darwin限定；只证明实际Mac执行。C Linux Full的整文件排除或case skip均不补PASS，不能外推Linux sandbox通过 |
| 17原批natural1；19只复验三红自然0；22原14文件批8绿6红natural1；24六红整文件11/11、17/17、13/13、9/9、4/4、7/7自然0 | 原首败及适配后结果分别保留；25只三测试路径变化，18生产输入仍同。22已再次给source-connector33/33、runtime integration11/11、connection services7/7、sandbox-home6/6等有效作者候选 | 不写17/22全绿；不把19/20/22/24或父子test数字相加。共享feed-library改了adapter.account接线，22的绿逐实际fixture/调用链判等价，不能笼统说14个文件都在最终头重跑过 |
| 既有FI6/FI7/4b/4c1/4c2/4e1正式评审、RAC807/808等老查询用例 | 保原评审边界及query/归档声明的局部约束；源码显示现行Inbox `listInbox/getInbox`已接`inboxDeclarationsOf` | 离线`recordInstallation/createLocalFeedApplication`不证运行中Inbox插件、精确归档digest/owner变更或status最后事务重核；旧9/14与未知5失败不造当前PASS/bug名 |

以上是复用候选，最终必须核本头测试/fixture/生产入口/依赖及构建绑定。已经有同链、同输入、有效自然结果的场景直接复用；只有实际新变动、未覆盖边界或证据不能判等价才增加独立执行。当前不要求重跑13、19/20、22/24整组。

## 最小补集按真实缺口确定

| 需求/实际入口 | 最少必须观察到什么 | 具名入口及选择边界 |
| --- | --- | --- |
| 平台P1-1，C01发送前/ABA | bind等待和最后beforeEffect后解绑/换B时zero进入旧provider；A→B→A/解绑回A旧调用永久拒绝，新调用可用，同账号另一槽不误杀 | `security-invariants-plugin-source-connector.test.ts`两条`S-97 FI-C-01`；优先复用13或更近22的33/33。仅最终owner/控制实际delta不等价时补受影响子场景，不再铺全组合 |
| 平台P1-2，C02生产请求/刷新 | 原Runtime调用取消/撤权而账号不变，profile返回后无list/history/detail、传入HTTP signal中止、无events/cursor；刷新待决后合法token返回仍不写access/refresh/expiry/protocol/refusal、不重发；旧账号revision防线、正常刷新、排队项取消和跨槽并发都成立 | 已有`connector-call-control`三顶层FI-C-02、`connector-api-oauth`withdrawn/queued两顶层、call-connections真实sandbox401与DNS两条，优先复用19/20。最终核health/preview、超时/Host close的真实控制分支；已有20/20、9/9或同一实际链足够则不新增。合法过期OAuth正向可合并到下方真实闭环；不stub provider/resolver/port来证明HTTP副作用 |
| 业务P1-1：evidence正文与动作权限 | 实际Runtime同步获得`molis-work-feed/sha256/...`非空正文，再走`feed.items.promote`、`feed.goals.context`、`feed.rules.recommendations`；正向读到原文/产生正确结果。缺原调用者evidence:read在入口拒绝，未读正文且无Goal/建议副作用；不删除三重检查或用手改required grant造撤权 | 现有`feed-runtime-plugin` RAC518/1030相关、`feed-goal-promotion`/query及scene/recommendation链，按新增修复具名选择。直接ingest/content.receive不带证据引用的旧绿不能代替；三动作可共用一次同步样本 |
| 业务P1-2：research owner | 真实Runtime同步研究库，保`research:<id>`与provenance，随后get、含正文snapshot、content/subject及匹配判断能读原文；不得把research引用送evidence库，不吞取消/撤权 | `feed-runtime-plugin`研究库组、`feed-research-authority`与实际content/subject/判断入口。原离线snapshot和仅同步行数/去重不足。可共用下方Runtime闭环准备 |
| 业务P1-3：最后业务事务版本 | 已通过早期guard，最终commit的beforeEffect尚待时，由另一合法动作改配置/暂停/删除来源；原调用授权保持有效，恢复后旧items/signals/cursor/成功或失败终态、journal/delivery均不新增或覆盖。connector adapter异步等待也覆盖；合法自身中间写与scheduler后续提交不被误杀 | 现有`feed-runtime-plugin`/`feed-sync-authority`/connector接收路径；屏障必须落在**最后await→真实事务body**，不能只挂fetch或再加一个异步guard。按最终公共/研究/connector/listener/scheduler实际共享提交链去重；独立提交实现各补一个代表，不预设全矩阵 |
| 业务P1-4：失败清理与可重试 | 真实Home release失败、forget失败后，refs/operation ids与恢复入口仍可用；服务恢复重试完成合法清理，重复无额外事件。超过既有限额按批调用（1000 operations/5000 refs不提高），其他项目/本来源仍引用的正文保留；无complete_since的保守保留与真实异常分开 | `feed-local-history-delete`、`feed-content-ledger`、`feed-runtime-plugin`删除组及公开source remove/retry。仅2正文/1运行成功例不够；不要求跨Home/项目伪原子回滚。reclaim旧非阻塞项只在当前接线触及处核，不展开新机制 |
| Inbox实际Runtime投影与最后tx | 真安装running+其**精确plugin/publisher/version/manifest_digest归档**声明才展示owned kind；非空own/foreign/未声明/unassigned数据验list/get/status同规则。停用/卸载/无归档/错误digest/换owner后旧项不可见/不可写、历史不删。status最末beforeEffect等待期间移走owner，事务内entry重查拒绝，Attention行/revision/events原样 | 基础复用`security-invariants-attention-inbox` RAC807/808；新增实际Inbox插件的Host HTTP或公共action路径，覆盖`PluginAttentionClient.listInbox/getInbox`→`inboxDeclarationsOf`→Inbox `entryOf`→transaction内重查。不能用静态Manifest、空库或离线Feed application冒充Runtime证明 |
| 新collector拒绝与引用完整性 | 若最终作者未覆盖，实际Home collector遇取消/撤权/read-only/scene/job须拒绝且正文文件/账不删；真实source仍引用的正文不可被reclaim误删 | 优先用`dual-instance-services`、`security-invariants-plugin-source-pull`及已实现Home hold/collect用例；不重复旧正例。早期platform报告明确这几条仅有源码拒绝，不能自动记已验；P2启动补hold只有实际delta触及时收窄核，其他保原后续级别 |
| 两半Runtime/新入口最短闭环 | 一次临时Home：真实Feed Home半与project半running→user-only slot.bind@2（record=来源号）→受控来源同步→run先点名ref/hold再正文→Inbox→Pages/Goal→规则保存/下一次读→排程→停用/重启，内容/绑定/引用保持。测一个授权不足/取消恢复；只用当前调用者，不伪装workflow/user提权 | 一条独立浏览器路径，优先沿`inbox-current.e2e`、`feed-capture.e2e`/相关实际Runtime入口收敛，统筹选一个可组合最短链；用新插件路由与通用stage，旧Host私路拒绝。业务P1的正向样本尽量共用，不逐页重复测试 |
| SYS52生产修复 | 保留同一真实title/result Text与非空Range经过**实际生产drawFrame同值更新**；真实内容变化仍能更新。生产旧写法能被该回归发现，作者若已有正反原件直接复用；原SYS52 selector/10s超时/业务断言不变 | 实现方已获准在C实现同值不替换与确定性DOM回归；当前63只有失败快照和retry通过。新回归文件/精确case待C实际供包，不造已实现名称，不用加等待/反复刷原5case证明稳定；最后C Linux Full仍由统筹裁决 |

## 执行与交付合同

1. **本轮到计划为止。** 恢复后继续完成业务4P1、Inbox运行证明、SYS52及最终元数据/门禁；后续准确C head/tree/clean、允许scope与scoped diff供出后，独立测试把上表缩成明确文件+完整case名。作者已经覆盖的场景逐条去重，不冻结虚构总数，不立即执行任何示例命令。
2. **同一当前产物。** 最终整体build与公开`computeBuildSourceDigest`/正式manifest绑定，含实际fixtures与normal package解析；12、18是各自检查点构建，不可直接冒充业务/UI新源码的最终C供包。已有对应API/actions/assembly/inventory/README必跑结果按实际输入复用；资源按最终组合实测，不沿用Inbox旧+35B或A旧预算。
3. **只开一次有限批。** 统筹排资源后，在独立物理布局、测试临时Home、专用测试浏览器（`MOLIS_WORK_TEST_CHROME`）、公共machine-slot队列执行；原runner `--jobs 1 --browser-jobs 1 --retries 0 --verbose`，必要时按已冻结完整case名筛选。非浏览器和浏览器可按实际依赖串行，不占作者在途槽，不新建另一个Source/Provider、不改原测试/断言。不会独立跑无文件参数的全量，C正式CI/Full由统筹最终仅触发一次。
4. **看实际后果。** HTTP用生产provider/SDK/resolver/transport，只在既有末端测试transport或本地测试服务代替外网；等真实SDK poll/Host请求settle后记录实际请求、signal和真实secret/protocol/store状态。业务看输入、返回、持久化、事件/下一次读取及重试；拒绝必须断言零副作用本身，不只看外层Promise拒绝。
5. **保原件与边界。** 保17/22及后续所有首红、错误层、自然退出、修复后选择/重跑和skip。33、5、20、7均为原Node计数（含参数化父/子），不做业务唯一数相加。未运行、平台跳过、仅编译、离线fixture、实际Runtime、真实受控HTTP、原作者复用和独立新增分别标；C整个工程/真实Home/部署/用户验收不因当前小组绿改变状态。

本计划依据已足够按最终delta收敛，未等待用户补充决定，也未要求第二份实现。当前没有测试进程/占用槽；按用户暂停要求停止，等待后续明确指令。

## 暂停交接

用户明确要求暂停正在进行的会话并由统筹推送最新工作。本独立测试只保存现有材料，不补跑或取消任何运行，不写实现方的C树及共享文档。当前没有本独立测试在途本机测试或持有槽；所有已派Full均已自然结束并关闭。

已完成：AB63工程Full已由统筹全文核收。正式报告在`独立测试-Full-63d7b896.md`，同目录final-summary.json/global-file-reconciliation.json及17份raw均可读，root_full_read_accepted=true。准确head63d7b896e8e50f08db6d2810ab8a5cc59a09903c；1542首过+SYS52仅retry过1=1543最终文件过，持久失败0，42macOS-only与14case差额不补PASS。SYS52原失败快照保留，不把retry成功标为生产修复。WK实窗原1场景/9检查仍归原1c7/c9输入。

C只读已核：028a952e68eda35cdd6d7fa8817dc7c3663d4bc0、1dad39c1efb00ddfee64e4c3c0b4e54dde84c9dd、2b8c8ccc3e3f7a2f5e3b824afa584099fb3288a0（准确tree见本文件输入段）。已读14/21/25供包，12/13/17/19/20/22/24原件及有限对应源码。13真实owner/Host port+自制provider33项不当HTTP刷新证明；19/20的生产Runtime/Gmail/OAuth/TLS是作者复用候选，Darwin边界明确。feed-library共享fixture变了，不能只比测试自身blob就把22八绿当最终C全绿。没有独立C测试执行。

最新收到但尚未核查：作者报告parent2b8 → 009b773f060ac61ceaa041b68d7681e075709b0a，tree0d716a408bb6de3f8ff1303c3050c66af2377678，Notion P1-C02-1仅三个路径。作者称共享刷新按调用参与者控制、单方退出不误杀另一方、全退出无access/workspace落盘；27为setup失败，28为旧生产取消反例，29整体build，30两整文件9/9+11/11自然0。位置`31-notion-shared-checkpoint.json`及同前缀patch。**本独立测试未打开31/27–30原件或核其源码，不能据此关闭P1或扩展复用结论。** 后续须把参与者并发/每方最终控制与前述C02证据重新对账。

尚未完成：业务四P1的真实证据正文与动作声明、research引用owner、最后beforeEffect后事务版本、release/forget失败恢复；Inbox实际running/精确归档digest与owner的list/get/status及末tx重查；SYS52同值生产DOM修复/确定性回归；Home/project Runtime与新HTTP/UI最短闭环；009b及后续最终准确delta、共享fixture影响、具名有限选择和独立执行。最终C Source、门禁、统筹唯一C Full/CI、真实Home/维护/用户本人验收均不由当前材料完成，不扩六连接器或新需求。

本文件是当前暂停交接主入口。统筹可连同已有作者原件索引纳入协调分支；本独立测试交付后停止，等待明确接续指令。

可在线读取的代码与修复合同见 [C 分支 spec §13](https://github.com/molis-ai/molis-work/blob/fe93d322ff52813224e1e281816f237263b6fa04/specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md)。以上原件编号和文件名用于追溯，本文保存已核结果与边界，不表示临时日志已上传。
