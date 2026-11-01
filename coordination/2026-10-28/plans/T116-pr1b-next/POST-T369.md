# PR1b #1680：T384/T369采用后的最小接续合同

状态：**父采用前置已解除，等待T389交回唯一writer及根fresh锁/准确执行头；未实施、不标工程READY。** 本文件仅收口 `/private/tmp/t116-pr1b-ready/PLAN.md` 与协调 `plans/T116-pr1b-next/PLAN.md`，不替代原accepted合同、不发新号、不新增任务或复现矩阵。

## 当前准确差量

- 实际已采用M=`db29f18d4f602fa8d9efb689a6a766aa9b07625f`。本轮Git只读核：15ad→M仅新增 `tests/mcp-connection-change-refusal.test.ts`；T384最终H4404→M仅该新测试及T388的 `tests/workbench-stop-feedback.e2e.test.ts` 等待修改。**相关生产/PR1b合流接缝未漂移**，旧两份计划的“等T384/PR1a/T148/T362实际采用”已满足，不继续等待被采用后关闭的原PR。
- 冻结PR1b H=`d37ec34c8498ab755bf9e34ba430e5648dacb0a8`，旧stacked base=`7f389082cc2440875d3a42376a03309efe2b043e`；本地task/T116-cb仍该H。旧合成44路径/全部自有增删行等价的准备原件仍可用，T384→M的两项测试不与这44路径相交；**不把旧预测tree 2d8c5c…冒充M组合tree**。本轮不再做一份重复merge-tree；writer正常合流时取得真实head/tree并核差集即可。
- 三必修均未被采用链解决：PR1b `pageRouteProblems`仍无三可信名拒绝，`stageRequestParams`仍按声明原样选值；M的frame-stage L/icon仍MethodSignature；factories仍从../index.js取11组。这不是只需同步main就能通过的片。

## 下一writer直接执行的最小合同

1. 根给窗口后先核实际M是否仍db29及#1680 head/base/旧CI终态；若变化只报告真实接缝增量，不重写方案。保持旧PR/作者树冻结，正常merge实际已采用main进入PR1b后继作者树，**不rebase/force、不整文件取一边**。原44路径及两条必修叶子边界沿ready PLAN；不重开PR1a/T148、不采用T121或保护分支候选。
2. 只补三必修：①SDK拒actor_id/idempotency_key/control_token的显式path/query/stage input声明，最终投影也独立拒绝三名；正常note_id/tab保留，不扩大身份系统或新增matcher错误分支。②frame-stage仅L/icon函数属性类型。③factories从原owner叶子取常量/renderer/primitives，不建聚合桶；dialogs/factors/status primitives在本ui.ts，其余按实际ui-model定义。
3. 保父接缝：T362 settings_address、T143现行声明、T148终端Manifest/动作、Home导航、T382 Artifact路径；`page/ports.ts`必填terminalsRoute及documents.ts真实终端路由传入原样；已采用golden.json/view.json不改录制。只从最终源码生成本片公开API差量，不手拼快照、不销PR1c/T402/T403/T117/T118后账。
4. 有效build后跑原计划的完整stage-data-input、workbench-ui-platform、goals-pages-through-registration、workbench-registration-boundaries以及普通golden；原计划两道拒绝分别移除的负例、恢复MethodSignature/根import的负例串行完成，消费匹配实际SDK/dist。相同有效输入原件可核抵，不重演旧19文件；但包README/仓库mandatory仍须按适用条款列出并核抵/执行，affected不能豁免它们。Goals路由文件按真实最终差集补验。
5. Golden关闭RECORD与GOLDEN_VIEW、开启DUMP，以正常模式消费最终父期望；66份具名完整HTML逐字节比准确父，保scripts/styles/JSON/ID及缺项/额外项拒绝。先核T384有效父DUMP是否匹配实际M/fixture/build；有效就复用，无效才补准确父普通运行，不能候选录制压红。旧六红、record skip、额外探针红按旧来源保持。
6. 整体构建、非update API/actions/边界health、test-imports、必要文档与served 48资源按最终头核；旧7469519B等仅历史输入，不能预签零增长。full=true保持，由根另结新head CI/Full与采用；当前Full暂停不因本准备解除。推前fresh fetch/secrets及发布仍归根授权，不由writer自行恢复调度。

## 证据沿用与仍需本地准备

旧28请求/9 UiHost/101所有权入口/Goals HTTP5及view209911B等只保原H及执行者；它们不证明三必修、新M合流或新Golden通过。原准备的scope/hunk映射与独立书审可沿用；无需再起一棵本地准备树、重复旧基线或读整批历史。真正缺的是**实施后的**三个修复、匹配build、有效负例/恢复及新组合必要验证，不能在本轮只读准备填成完成。

T369新测试不改生产，支持相关父构建/父DUMP按输入核抵；它自身必须留在合成结果，不能从“无生产漂移”推称整个tree相同或把其21/21变成PR1b动态证据。若排到writer时T389或其它片已实际采用，应先冻结新M并核其四client/脚本构建是否改变golden输入/完整HTML与served字节；不能套用此刻db29生产相同的结论。新父输入不匹配时只补必要父参考，不重跑整矩阵。

## 文件/hunk锁与冻结原PR

| 对象 | 此轮接续约束 |
| --- | --- |
| T389唯一writer | 正在写navigation-feed-sources、navigation-feed-stage、navigation-feed、documents-state及新feed-source-menu-refresh测试；不与PR1b原44路径直接相交，但全机writer/build/browser及资源证据仍串行。先等其交回writer；若其已采用再重绑定父输入，不能为了本片暂停或修改它。 |
| #1680自身 | 维持原H d37ec34c冻结直到根fresh回读并明确交接；原stacked代码必须正常同步到实际main并补三修复，不能直接排原H验证/Full。若原远端head已漂移，先核差量；不覆盖对方。冻结是作者/根控制，不是本线Git/GH操作。 |
| T144 / SDK、contracts/UI、API快照 | 原计划明确T144须等PR1b作者交接。领取前根确认manifest/index/page-routes、contracts plugin-manifest/ui和对应API条目的具体窗口；不按“父PR已关”推成全域无锁。 |
| T121 / 保护分支 | T121共享hunk与受保护分支保持冻结；可能涉及Host路由/页面及同文件接缝，根按fresh完整文件表给具体hunk交接。本线没有新的远端锁证据，不自行给T121放行或借同文件不同段并写。 |
| 共享文档/预算/后继 | privileges、边界脚本/API与资源数由根串行；PR1c/T402/T403/T117/T118仍等正式父序。不与新Functions、Feed创作或PG070后继合并扩大本片。 |

当前无需新的本地研究或用户产品决定。下一动作仅是根在T389返writer后fresh核锁/PR头并绑定执行M，交唯一writer按上述已有合同实施；本线只写本READY，未触源码、refs、GH、构建、测试、提交或writer占用。

当前[并行执行窗口](../parallel-2026-11-01/PLAN.md)解除旧唯一writer等待，原行为、证据和禁区保持。


## 当前真实合流裁定（2026-11-01 06:18Z）

根已核实际merge绑定与19冲突，全文读[作者合流计划](MERGE-PLAN.md)及[独立二审](MERGE-REVIEW.md)，接受继续解冲突。真实共同祖先31315不是slice基点7f；原预测只说明内容增量可合，不能当普通merge零冲突证据。保当前HEAD=M db29/MERGE_HEAD=原H d37的正常双亲关系；内容以准确M加7f→d37的44路径自有差量为期望，全部路径都检查，不只清19冲突。三条slice外README/ports/golden保准确M，非冲突区域亦不得带回旧父贡献。manifest相邻终端import与privileges相邻PG058按精确自有hunk投影，不模糊匹配或整文件取旧边。

纯合流scope/tree确认后，继续原三必修及两叶子扩展，golden/view/terminalsRoute/settings_address/现行Manifest与Artifact路径保父。最终两Goals路由完整文件按实际接缝补验或有明确相同输入核抵，不用旧跑过充数。四负例、66完整HTML、匹配build/48响应、README必要集合、full=true与全部禁区不变。此裁定不新增产品语义或新任务号，也不解除Full暂停。


### 根现行输入回归补足（2026-11-01 06:56Z）

已手读mandatory-resume完整文件原件：140文件自然结束139通过，plugin-declaration-rules的既有views-not-list唯一失败为pageRouteProblems在已记录原非数组错误后仍for-of导致TypeError。根把该既有错误合同回归纳入同一PR1b，不另开产品语义或任务号。只在packages/plugin-sdk/src/page-routes.ts把views循环限定为Array.isArray的列表，非数组继续由inspectViewDeclarations产生原plugin.declaration_invalid/invalid；不改错误、断言、matcher/投影、导出、Manifest共享四文件或新增兼容。待批次自然结束再应用（本次已结束）。最终匹配整体build、完整plugin-declaration-rules与stage-data-input、必要最终门禁/绑定；原四有效负例与正常66完整HTML/141文件已通过部分按实际生产输入影响核抵，不机械全批重跑。原失败和准备期npm配置中断保留。最终资源48项大小全同而plugin-frame仅14个minifier局部变量拼写变化的结论须由独立验证另核，不能写成48项hash全同。
