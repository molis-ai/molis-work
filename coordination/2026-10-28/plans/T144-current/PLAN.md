# T144 当前main可提前实施的有限接续结论

状态：只读准备，不改原PLAN/共账/源码/refs/GH，不build/test、不派单。**可以从已采用main完成T144，不需要消费PR1b未采用API；但需根明确交接下面的SDK/parser和受保护assistant末端hunk，不能无条件标READY。** 原owner仍开发线3，独立二审线1；没有把任务转派开发4。

唯一需求仍accepted `specs/repository-anti-corruption/slices/pg011-pg017-remaining.md` §7及原RAC2636～2643；[工程PLAN](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T144/PLAN.md)与[FINAL-REVIEW](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T144/FINAL-REVIEW.md)已把A–D闭合，不重写实现书/139矩阵。原精确允许集合为上限，不能借本报告扩大到新路径。

## 父合同：什么已经满足

- 当前M=`08642dcb92dbdad029d990813da56682d6864a23`。Git只读核db29→M仅EXTENSION-POINTS文档变化；15ad→db29仅T369新测试。T143已随T384实际采用15ad，不再保留“等T143采用”这一旧WAIT。
- 与工程书冻结T143 H=`58a1713c67833bba0ebea706a88e5476ed6499c2`直接比，sandbox-plugin-manifest、plugin-instructions、home-plugin-executor、plugin-builder/installed、installed-plugin-definition、contracts/platform/plugin-package、SDK manifest/index/agent-declarations这九个父接缝源码无差异。它们的真实发布/登记/解析基础可沿已采用T143合同，不以“原H非main祖先”否定squash采用，也不宣称T144所有允许文件与旧书基点相同。
- T144需要的是现有签包/资源验签、agent/method声明与Runtime/Assistant接口；新增签名正文声明/引用和末端复核由T144自己在原允许路径内补齐。PR1b的page_routes、StagePageModel.request、stage_data.input不参与本片，因此不是产品/类型前置。书内A–D缺口仍是未实现需求，不能把父等价写成它们已经通过。

## 本轮交集核对

只用根已保存 `/private/tmp/root-parallel-paths-0614.json` 和 `/private/tmp/root-open-0630.json`；后者20个准确PR head均以本地Git对象核其自有diff，未发GH/fetch，非当前远端fresh声明。允许表加明确现有测试建议共提取88条精确路径，不按整包名判断锁。保护分支只读，无改动或采用。

| 对象 | 实际交集与hunk | 接续裁定 |
| --- | --- | --- |
| PR1b / #1680 d37ec34c（当前dev3仍修） | SDK manifest.ts的pageRouteProblems import、assertNoV2Blocks的ui.page_routes、assertV2Blocks调用；SDK index.ts单行page-route导出。T144需要签名正文声明/派生与对应公开导出，属于**同parser函数/导出文件接缝**。另有两个共同生成快照platform/plugin与plugin-sdk/index，以及privileges文档 | 不必等PR1b API采用；但当前SDK独占窗口不能自动绕过。根可将PR1b上述hunk冻结后交T144在M上实现其独立改法，或先采用PR1b再接。两者同步修改assertV2Blocks不可并写；生成快照按最终各自源码生成、最后合成核双方，不能整文件选边或手拼 |
| T389 / T386冻结范围 | 根路径清单与T144精确允许路径**无交集**；前者四Feed/state客户端+新回归，后者原六路径 | 无源码父依赖、不等整单采用。构建/浏览器公共槽、资源统计仍串行；若先采用则核新main真实输入，不重演无关复现 |
| T390冻结范围 | 仅SECURITY-INVARIANTS同文件；T390只S103，T144只拟S105及对应测试指针 | 根串行给行级文档窗口；终端产品代码/回归无交集，不泛称整个Host锁 |
| #1101 @2b38b5f5（受保护） | 实际相交assistant-dispatch/http/inputs/round-materials/service-shared/service、contracts/services/assistant、assistant-executor测试；SDK index；若干共享文档/skills/API/actions | **存在具体C项末端guard同hunk风险，见下；不能仅凭“保护PR不是当前writer”忽略**。也不能把它当T144必须先采用的产品合同。需根明确冻结/交接及后续合成责任 |
| #1677 T121 | SI/BACKLOG/privileges文档与host-actions.tsv；无T144生产路径 | 对应T121行与动作条目保持冻结，T144只自己的正文/AgentDefinitions读取条目，不覆盖Feed/connector条目；根按最终生成表逐行动作核，不要求T121整单采用 |
| #1676 T146 | 仅privileges | 只改T144/BL493行，PG070行不动 |
| #1713 T385、#1664 T346 | 仅release CHECKLIST文档 | 保storage/维护行，根串行合T144必要说明，无业务依赖 |
| #1673/#1672/#1669 | SI/BACKLOG共享文档 | connector/安装安全行不动；T144仅S105/BL493及自己必要项 |
| #1059 @c886c603（受保护） | host-actions中memory.prefs版本条目、platform/plugin快照ActionCallContext.memory_read_mode | 与T144角色资料/方法schema条目不同；不取其未合Memory实现或回盖其未来条目，根最终生成快照/合成。#784仅BACKLOG历史项，同样不动非本单行 |

### 必须根裁的最小shared hunk，而非“全包锁”

1. **SDK parser/export窗口**：manifest.ts的assertV2Blocks及imports、index.ts公开导出；PR1b只page-route校验与导出，T144只signed-agent声明/空tools相关校验和新解析导出。根等PR1b作者把此处实际patch冻结并确认不再写，才能交后续writer；PR1b其余测试/叶子修复可继续，不能趁它仍写同hunk时并行。未采用API不被T144import，故可先在M上完整做自己的版本，再正常合成两份patch。
2. **#1101 assistant C项接缝**：该分支的dispatch修改executorOf控制口、startAuthority.beforeStart、lifecycle.assertStart/bindSession，并将roundMaterials返回的beforeDispatch/assertCurrent接入持续授权；round-materials引入KnowledgeMaterialGuard，service/shared/contract增量连接Memory/生命周期。T144工程书恰在chosenMethods→send→dispatch/inputs/executor加**本次handoff**的beforeStart/assertBeforeStart同步复查；两种guard生命周期不同，不能合成一个泛化持续取消。根必须允许T144只在当前main的这些函数接缝实施、指定#1101原作者保冻结并承担后续正常合成，或选择先采用#1101后重绑定。若该保护hunk不能交出，C项不能完整实施，不能把“先做A/B”报告为完整T144已解锁。
3. **其余#1101同文件可分hunk**：assistant-inputs新增checkArchiveFilter与T144补充材料最终send口不同；assistant-http的archive/lifecycle路由与T144精确material引用解析不同；contracts assistant的archive/Memory字段与T144method/default_ref/source_ref不同。可以根明确行级交接，保两方imports与真实调用签名。assistant-service/shared及executor测试实际函数接缝仍与上条一起核，不假定所有同文件都可分开。共享文档/skills和快照只保本单条目，由根串行合成。

## 建议执行/采用顺序

可提前开工的条件是**根对上述三组给出具体写入窗口**，不是等PR1b全部Full/采用。原owner开发3当前还在PR1b；根若想新增并行作者，必须明示交接owner与允许hunk，本稿不自动转派。

推荐PR1b parser/export实际patch先冻结→根交SDK与保护assistant接缝→T144从准确M独立完整实现A–D（不取未采用候选）→PR1b先实际采用→T144正常合已采用main，只核真实SDK/快照/父输入差量→T144准确审验/CI/必要Full后采用。T144源码实现与PR1b后段测试/审验可以并行，公共槽照排；#1101/#1059仍保护且不作为先合前置，后续采用必须正常组合T144的handoff语义与自身持续guard，不得覆盖。若根选择T144先采用，也可行，但PR1b必须正常吸收T144 parser/导出/快照；本稿推荐前者以减少当前PR1b返工，不把排序建议变成技术硬依赖。

## 最小新增验证与证据复用

不重复T143旧139矩阵。九个父接缝等价允许保原T143采用/模型权限/complete-override证据原来源；不能替代T144真实签包正文、生命周期登记、精确版本/覆盖、C项交付前反证和D项长标识端到端。按现有工程书的具名完整文件与A–D正反控实施，新材料/barrier只运行本片必需场景；本报告不加case。

PR1b合成后的最小增量：完整parse/签包声明测试（含合法签包、拒绝多余权限字段、合法page-route对照若实际已进入解析器）、实际SDK导出/API非丢失、C项dispatch/inputs/executor的完整材料测试、正常UI选择读取及page-route/owner接缝如真实diff所需。只要最终实际消费输入没变，已有有效本次T144执行可核抵；parser或assistant接缝改变则补受影响完整文件，不机械复跑整批。不把静态hunk分析冒作组合测试。

原书mandatory包/仓库门禁、整体build（新源码匹配）、API/actions更新、临时Home/browser隔离、公共槽、真实资源字节和full=true继续适用；Full由根排，本报告不启动。生成快照/资源不能拿兄弟差额抵销或先改额度。当前唯一缺的调度决定是具体SDK与保护assistant窗口及owner交接；需求/父产品合同已足够，不必另写一份T144方案。
