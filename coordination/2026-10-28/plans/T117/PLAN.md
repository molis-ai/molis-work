# T117候选：工作台最后的插件实现类型依赖改走事实合同

状态：根已接受的既有T117工程书，WAIT，不另分号。执行负责人：Codex开发线2；起草线原稿，独立二审线1核收。依据为6541316193裁定、PG064及w5-08-workbench-exports现行片；它们是唯一需求来源，本稿不改产品规则。

工程书补齐绑定：本轮现存main为`b0567bf545a74b858e4fdeddd5e66432b1065b21`，只读核对，不动refs。原字段/定义证据及正式裁定沿用；本稿不是依父片WIP直接开发的授权。完整T116 PR1（包括1b必修和1c声明舞台/词典）与T402采用、单writer及准确共享锁释放三项缺一不可。原RAC映射不新占号。

## 1. 目标与前置

目标是行为不变的完整工程迁移：Goals/Feed/Inbox舞台与数据已回owner之后，工作台只消费确需的公开事实合同和平台模型，page-view等不再借插件包根取实现展示类型。等T116完整PR1及T402采用后才能冻结最终diff；#1679/#1680未合不能现在改这些共享文件。目标不包括T118的整线状态核收。

当前源证据：page-view.ts:1有BoardSnapshot及Goal展示状态/文档/输入/政策/事件类型，:2有FeedSnapshot/目录/FeedUiModel；:32～57仍有Goal数组/绑定/事件及Feed/Inbox字段。Schedule类型当前已无。BoardSnapshot是Goals /contract的公开事实；GoalPresentationState、GoalsDocumentView、GoalsInputBinding、GoalsPolicyBinding、GoalsDecisionEvent定义却在tree-order/document-view/policy-ui-model/decision-view实现文件，不能只将import路径全换/contract而假装都已导出。

## 2. 范围与不做

writer允许：`apps/workbench/src/page-view.ts`，前置最终剩余的`capsule-view.ts`、`capsule-*.ts`、`project-settings-pages.ts`等真实类型消费者（必须领单前列出精确文件，不以glob当无限授权）；`tests/workbench-goals-mentions.test.ts`（前置1b已有）、`tests/workbench-entry-exports.test.ts`；直接被类型形状删除影响的现有测试/夹具只改取型路径和最小输入类型。必要说明交根串行到w5-08片/PG064，不动共享状态行。

不改公开contracts或插件/contract schema、动作、provider、Manifest、存储、HTTP/DOM/CSS/运行数据；不新增兼容、桥接export或第二DTO/schema，不改插件运行实现。原裁定的goals-actions.ts当前不存在，找到真正活动caller才列写路径，不能复活该文件。若前置未把展示行为迁走，本单回父片缺口，不在类型迁移中补搬渲染或删功能。

## 3. 做法与切换

1. 在前置准确已采用main上，读取RAC2685冻结清单/现行AST引用，逐条列“文件、符号、实际使用字段、owner公开出口、去向”。仅查原T117范围及其直接编译消费者，不重复全仓审计。
2. 前置已移走的数据字段且无真实消费者：删除其page-view成员和无用import；不要只为保留旧大对象而建立本地完整复制类型。保留平台自身导航/请求/挂载字段。
3. 仍属Goals事实如BoardSnapshot，改从`@molis-ai/molis-work-plugin-goals/contract`现有出口取；Feed事实同理使用其已有/contract。仅需少数字段的外壳组件，用已有公开事实类型的Pick/返回类型表达所需字段，不复制字段全集。展示类型留在owner页，不能为了消除root import把它们加入公共contract。
4. 若剩余symbol没有现有公开事实对应且确有生产消费者，记录调用链和字段用途交根判别是否父片漏迁。不能as any/unknown强转、导出新共享类型或改语义凑编译。
5. 同片同步原冻结引用清单和入口白名单的真实减少项，保留生成builtin目录这类合法登记事实。只核已接受的Goals引用边界，不扩大成禁止所有插件公共合同。高相似度路径切换，不夹带重命名。

## 4. 验收

沿现有PG064/RAC710～714、RAC1115及前置RAC2685映射，在现有测试名/注释标T117；根需独立RAC时用原登记，不自行占号。

- 最终精确文件表中的活动root实现类型import全部消失或按公开事实合同解决；展示类型无新增公共导出，无镜像schema/新桥接。
- 现有页面数据字段只有在真实消费者已迁走时才删除；父片66完整HTML有效证据在输入/生产路径不变时可核抵，不能由“类型改动”直接宣布页面行为已验证。
- 工作台entry无多余转出，实际使用者构建能解析；RAC2685清单按真实AST减少，生成登记不当缺陷删掉。
- 公开API/动作快照、现有路由/资源/库版本无差异；身份、授权、显示/未启用插件边界不变。任何差异按实质扩范围回根，不刷新快照吞掉。

## 5. 验证与档位

工程跨工作台页面类型边界，候选乙档，`full=true`保守按工作台共用面交根准确头CI排；正式档位以最终affected-tests/项目规则收口，本机不Full。源码类型改动先整体pnpm build（公共build槽），完整workbench-entry-exports、workbench-goals-mentions、对应capsule/project-settings非浏览器原文件。公开事实/类型入口变化本身无需新增业务测试框架。

当前可点名的定向原文件为`tests/capsule.test.ts`、`tests/current-project-settings.test.ts`、`tests/project-settings-stage.test.ts`，加上上述两个入口/引用门禁文件；前置若删除某个旧文件则记录其替代生产路径，而不是重造旧用例。最终范围表须在开工前由根核准，包含源路径、符号/字段、公开owner出口、直接测试与共享锁；该表是本书短交接，不建第二份需求或进度系统。文档状态仍交根串行。

若确实仅import type和无消费者字段删除，父片已有效同输入浏览器/金样证据可核抵；若发现运行对象构造或行为必须变化，先回根扩范围，再跑原对应完整文件，不在本书静默实施。核type/import graph避免src/dist混载，boundary、merge-base health、API/actions零差异、必要page-assets及推前secrets，逐项pass/fail/HOLD。没有现成有效证据就保留未运行，不以CI绿倒签源码之外路径。

## 6. 锁、交接与停止

当前page-view被#1680占，外壳组合/renderer被#1679/#1680占；README和主spec等还与#1654/#1101等共享，文档状态由根串行，不进入保护分支。本目录locks.json仅作准确快照，开工根fresh核最终文件集合；不能因某个capsule文件当前无锁提前修改整个page-view。

满足父片采用、文件表冻结和单writer窗口后按原授权直接实施，不再问已定产品方向。交准确base/head/tree、符号去向表、实际diff、构建/门禁和核抵证据。父片缺渲染迁移、出现必须新合同/行为变更、或保护路径冲突时只暂停对应部分并给根具体差集。没有数据迁移或真实Home步骤。

所有构建/测试仍未执行；本稿未开新用户可见任务、未改coord/source/GH/refs。
