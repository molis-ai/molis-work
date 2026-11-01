# T144 当前接续窄审

结论：**同意本准备稿的有条件接续判断，未发现必须等待 PR1b 未采用 API 的产品依赖。T143 父合同等待可解除；SDK/API 与受保护 Assistant 接缝仍未完成交接，不能据此标无条件 READY。** 原 owner 开发线3保留。本审查不派单、不替根放锁，不重开已通过的 A–D 工程书。

已读本目录 PLAN、原 `plans/T144/PLAN.md` 与 `FINAL-REVIEW.md` 的父输入/允许路径/C项/验证边界；只实核本次指定接缝。M=`08642dcb92dbdad029d990813da56682d6864a23`；在途 PR 使用根保存的 06:30 head 快照，不声称远端 fresh。未 fetch、改 refs/源码/保护分支/共账，未测试、build 或写 GitHub；仅落盘此 REVIEW。

## 父合同与 PR1b

九个父接缝逐一 Git blob 比对，T143 `58a1713c67833bba0ebea706a88e5476ed6499c2` 与 M 全同：sandbox-plugin-manifest、plugin-instructions、home-plugin-executor、plugin-builder/installed、installed-plugin-definition、contracts/platform/plugin-package，以及 SDK manifest/index/agent-declarations。另核15ad→db29只有T369测试，db29→M只有EXTENSION-POINTS文档。因此无需以T143旧SHA不是main祖先为由继续等待，也没有据此宣称T144 A–D已经实现。

现行 main 已有签包与资源验签、角色/方法声明、AgentDefinitions 和 Assistant 的 public 消费/ExecutorControl 接口。T144 的 wire 正文声明、精确引用和本次 handoff 检查是在原允许路径中补实现；不需要 page_routes、StagePageModel.request 或 stage_data.input。原 accepted C 项指出的实际缺口仍存在：dispatch 对 plugin 分支未转交 beforeStart/assertBeforeStart，inputs 的最终发送需要接本次检查；这些缺口属于 T144 自己的交付，不是等待 PR1b 的理由。

本轮另只读实际开发树 `/private/tmp/t116-pr1b-dev`：当前干净 H=`d5a1ee558a622aa264d19da42921b3ab8aaa2d32`，父为 db29 与旧 d37；SDK manifest/index 对 M 的实际改动仍与旧 d37 同样的4处接缝：pageRouteProblems import、assertNoV2Blocks 的 ui.page_routes、assertV2Blocks 的校验调用、index 的公开导出。此观察更新准备稿的旧published输入，但**干净提交和可分hunk都不是作者已释放窗口的证据**。根交接前需绑定届时作者实际最终H/blob及冻结确认，不直接把旧d37当仍在使用的唯一候选。

## 根可直接裁定的最小窗口

| 窗口 | 最小写入/保护范围 | 放行所需决定 |
| --- | --- | --- |
| SDK parser/export | manifest.ts 的 imports、assertNoV2Blocks、assertV2Blocks 接缝；index.ts；两方涉及的 platform/plugin 与 plugin-sdk/index 生成快照。T144 agent-declarations 与新 helper 仍限原允许路径 | 现行并行 PLAN 明写 PR1b SDK/API 独占、T144等待。根须明确替换这一窗口记录；开发3先冻结 PR1b 对应实际 patch，再切换T144写入。若PR1b后续失败要改同接缝，回根串行交接，不能一边测试冻结树一边修改输入。可先在M做T144，不import未采用API。 |
| Assistant C项真实交集 | dispatch 的 executorOf/control、startAuthority、startPlaced/host.start及其前后检查；round-materials 的返回/材料处理；service 的send及装配；service-shared 的RoundMaterials；对应executor测试 | 根须明确准许T144在main实现本次handoff接线，并保留#1101实际patch冻结、指定后续合成责任。保护分支原地不动；#1101不必先采用，但“暂时没有writer”不能替代交接。C项不交出时不能把只做A/B写成完整T144解锁。 |
| 可分但须交接的共享hunk | inputs的补充send与#1101 checkArchiveFilter；http的材料引用与archive/lifecycle入口；assistant合同；SDK不同导出；原精确表内文档、skills、actions/API | 根给对应函数/条目窗口，不发整包锁，也不允许整文件选边。S105与T390 S103独立，保护已有行。生成快照从真实合成源码生成，不能手拼或用一方覆盖另一方。 |

原 owner 开发3同时持有PR1b与T144，应由根明确其写入阶段切换；本审查不引入新作者或默认转派。PR1b已冻结后的独立测试/审验可与T144源码工作并行；公共build/browser仍按原规则串行。T389/T386保存窗口与T144精确表无交集，T390只有S103/S105同文档，均不构成等待整单采用的父依赖。

## #1101 的实际交集，及一处表述校正

准确保护H=`2b38b5f5fef4bf70617c3c05b22b6d446771d693`，自身merge-base=`b707895b45c20fcaa8727ae85c093bb5c04ee61b`。实际diff确认：

- dispatch 给 executor control 加 lifecycle.assertStart；改变 startAuthority 的 beforeStart/assertBeforeStart、session绑定，接入 roundMaterials.beforeDispatch/assertCurrent。T144恰好要贯通本次材料检查，属于同函数、部分同hunk的真实交集。
- round-materials 收集 KnowledgeMaterialGuard，返回持续派发用 beforeDispatch/assertCurrent；service-shared 加这两个字段；service装配lifecycle及dispatcher links，并在send检查启动资格。T144的来源检查只约束本次handoff，**不能并到持续beforeDispatch/action guard而产生整轮取消**；有效handoff后的历史边界保留。两方合成要同时保留原caller/生命周期检查与该边界，而非二选一。
- inputs只增加checkArchiveFilter，executor测试增加归档期间run.start/run.control迟到拒绝；这些可以分区编辑，后续完整文件验证仍须保留各自断言。
- 准备稿把 `contracts/services/assistant.ts` 概括为“archive/Memory字段”不够准确：这个准确保护head对该文件仅新增 `AssistantSessionPurgeSelection` 类型再导出。SDK index 则增加 subject-retention 导出。与T144新引用类型/解析导出可分，但仍是共享导出/快照窗口。此为事实校正，不扩大冻结范围或新增产品前置。

## 必要增量与证据复用

1. 根正式交接只需补准确M、PR1b最终patch冻结、上述SDK/Assistant窗口及开发3阶段；不另写一份A–D方案。当前M的accepted §7仍保留旧“skills/包版本映射/角色是否有用待核”文字，原工程书的获批精确§7 diff尚未在该M应用。实施时先把**已经裁定的同一§7修订**落入现行规范，再改行为；不是重问语义或重审全书。
2. PR1b正常采用后，T144只核实际parser/export/合同快照输入增量。复用原书已有具名完整文件：合法签包与非法权限字段、实际SDK导出、签包资料消费；若page-route已进入同一parser，保留其合法/拒绝对照。对应parser改变才补受影响完整文件，未变的有效T144证据不重跑。新增当前PR1b身份拒绝也不得在组合时丢失。
3. #1101将来采用时，合成责任须核上述末端调用链，同时保留T144原C项“未handoff拒绝/有效handoff后不新增整轮取消”与#1101持续授权/归档拒绝的已有完整用例。此处只要求对真实交集保既有合同，不新增横向矩阵；当前不把静态可组合当组合通过。
4. 原T144 schema/合同/SDK/Host装配范围、包要求、真实签包/UI/AI材料验收与 **full=true** 保持；Full由根排。不能挪用T390的full=false。T143父等价可保留原证据来源，不能替代T144正文全链路、覆盖持久化、末端反证和长标识验收。共享文档与API/actions/资源按最终源码生成及实际测量，保护其他任务条目。

建议根采用原稿顺序：PR1b接缝冻结→明确窗口交接→开发3在已采用M完整推进T144→PR1b先采用→T144吸收实际main并只补真实增量。该排序减少当前PR1b返工，属于调度建议，不是API硬依赖。没有窗口交接原件前，结论仍为“父合同满足、可有条件安排”，不是实施或采用放行。
