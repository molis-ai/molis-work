# T392 / R-A4 独立加强二审准备

状态：准备完成，等待作者最终 H、实际 scoped diff/raw 和验证线3最终报告；尚无实现、测试或采用通过结论。负责人：Codex 加强二审线1；作者开发4、独立验证3，归属保持。T144书审成果保留，本线不作T144或T392 writer。

## 合同与准确输入

唯一 accepted WO 为 `/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-392.md`；已读同一协调目录的 `plans/T392/PLAN.md`、`REVIEW.md`（R1/R2）、`inventory.json`，及 `plans/T392-current/PLAN.md`、`REVIEW.md`、`plans/parallel-2026-11-01/NEXT-WINDOWS.md`。以当前工单和根窗口覆盖旧书的“待分配/WAIT #1654/19条”历史状态，不恢复旧等待、不重开已审A4方案或测试矩阵。

作者开工基点 M=`08642dcb92dbdad029d990813da56682d6864a23`；目标是功能行为不变的完整工程迁移。正式编号 RAC-2843～2847 对应 RA4-01～05，验收注释须保对应关系。full=true，由根安排；本线不运行本机Full或触发CI。

准备期只用M Git对象和已接受原件做窄核，不把主检出旧HEAD当实施基线，也不审作者未冻结中间树。本轮未build/test、未改源码/refs/GH/共账，唯一写入为此PLAN。无新任务派发、无保护分支操作。

## 已核迁移边界

直接核原inventory：37个tracked移动路径全部存在，分组为Module21、Workbench11、Host5；相对原书717d14f2，37个blob全同；37个目标在M无碰撞。当前同一inventory已包含23条活动dist映射，旧字面路径在M全部存在。无需另造第二份152文件矩阵。

终审按既有inventory的一对一映射核Git实际rename及所有消费者：

- `modules/functions/` → `modules/judgment-rules/`，私有包 `@molis-ai/molis-work-module-functions` → `@molis-ai/molis-work-module-judgment-rules`。
- Workbench `src/functions/` → `src/judgment-rules/`；Host functions-actions/host/http及两HTTP叶子换同一judgment-rules前缀/目录。
- 原19条dist加 `tests/functions-plugin.test.ts` 中 routes、route-handlers、ui、settings-ui四条，合计23条，同片切换；R1七个漏项不能丢。type-only导入也是活动消费者。新独立树和匹配构建不得带旧dist掩盖漏改。
- 原152候选是分类审阅材料，不是全文替换许可。`typesafe-connection.ts`仅源码说明括号路径更新；旧文件basename、导出函数名和fixture业务值保留。活文档引用按语义更新，固定SHA/历史材料不追改。

## 终审重点与拒绝边界

| 验收 | 要读取的实际证据 |
| --- | --- |
| RAC-2843 / RA4-01 | 37移动完整，无旧实现包解析入口、alias、桥接re-export或第二公开入口；根/Host依赖、模块package、lock importer/link、workspace registry的实现路径及extra dependency同片一致。离线frozen安装、matching整体build和boundary原件。 |
| RAC-2844 / RA4-02 | 移动源码除必要import/路径外行为保持；草稿/发布/试跑/授权/取消/项目删除/声明生命周期的既有完整文件真实通过。业务断言、fixture和测试basename未为迁移而弱化。 |
| RAC-2845 / RA4-03 | 公开contracts/modules/functions源文件/subpath、modulesFunctionsContract/descriptor、API/actions形状及版本、system.functions、functions.*、权限、provider、函数符号、DOM/CSS/URL保持。Home库path/DDL/baseline/版本、TypeSafe consumer/pluginId=functions及slotId/serviceId=typesafe不变。 |
| RAC-2846 / RA4-04 | 匹配新产物的Workbench编辑器、连接设置和浏览器路径有真实运行原件；不得以静态路径可解析或资源字节相等替代用户路径。公共专用测试浏览器、隔离profile/Home，无真模型/凭据。 |
| RAC-2847 / RA4-05 | registry/SSOT/包清单/归属/活引用、翻译路径、error-owner、merge-base health/imports/assets一致；没有门禁算法/限额/平台前缀放宽或未授权例外。 |

R2必须落在现有真实 `createHomeSnapshot` 用例：从实际manifest用独立字面量 `path === "functions"` 找store，先断言存在，再严格断言 `owner === "modules/functions"`。不得从homeStores/registry生成期望值；原实际库内容、SQLite integrity/foreign_key断言保留。已实读M的用例第33行仍是registry自比，不能核抵R2。已实读 `FUNCTIONS_HOME_STORE` 为ordinary library；`home-stores.ts` 的 `owned("modules/functions", FUNCTIONS_HOME_STORE)` 是稳定持久owner，不是待改源码路径。不宣称Functions专属sealed恢复已存在或已测。

error owner必须对37移动中的源码逐项比较M旧路径与H新路径的真实归属（包括原来为其它owner或无owner的情形），不能预设全部都是functions，更不能只凭health绿。`tooling/gates/error-owners.json` 的functions键保持，只替换module、Host glob、HTTP目录三个实现定位；contracts旧路径保持，匹配范围不扩。现有门禁对moved文件的归属宽松检查有例外，故需这份逐项实核；不另造生产manifest。translations只移动FUNCTIONS_DICTIONARY及目录归属定位，保留FUNCTIONS_EN和扫描/拒绝语义；两项原测试的路径期望同步而不删断言。

## 原子切换、共享窗口与保护路径图

遵循根NEXT-WINDOWS：开发4在独立树串行处理迁移/import/export、私有依赖、registry/lock及必要error-owner/翻译定位。SSOT、主spec包清单、privileges/GLOSSARY/CALL-CHAINS、README、生成owner等共享文档由根收准确old/new并串行应用；终审区分“候选patch已交”与“已进入最终树”，不能缺活引用仍签完整迁移。API/actions预期零差异，不能用重生成吞掉稳定合同变化。

#1101保护H=`2b38b5f5fef4bf70617c3c05b22b6d446771d693`，原merge-base=`b707895b45c20fcaa8727ae85c093bb5c04ee61b`；准备期已窄读其真正control链：

- 保护候选 `modules/functions/src/project-data.ts` 增加ProjectDeletionControl、逐步assertCurrent并传入clearInExistingHomeSqlite；T392只移动**已采用M**为 `modules/judgment-rules/src/project-data.ts`，保库名functions和相对store-schema，不先带入这些未合语义。
- `project-deleted-owners.ts` 的保护ownerOf向data.purge传control；本片只改functionsProjectData的私有包import。未来根/原owner普通merge时把整条control调用链接新路径，不因rename丢失保护增量。
- functions-authoring-actions/system-functions-actions两测试的保护项目库初始化/root写入和相关import，未来组合保两方正文；本片仅改包/dist位置。index/project-host/page-assets、registry/lock与共享表逐hunk合成，不拿保护候选SDK/integrity或样式减量。

本线不进入、修改、检出、cherry-pick或解除#1101及其它保护分支；旧→新路径图是根交原owner的接续材料，静态能映射不等于实际组合已验证。后继仅授权普通merge，不rebase/force。T353B/C的Knowledge/Artifacts entry、PR1b导出、T065设置/OAuth与T390安全脚本按根冻结窗口保留；若最终基点推进，只核采用delta，不拿旧整文件回盖已采用行为。

## 验证证据的接收口径

沿原合同，不新增测试矩阵：

- 模块README六完整文件：functions-authoring-actions、functions-system-capability、functions-draft-retention、project-deletion-owners、functions-plugin、functions-choice-validation。
- scene-default-rules、home-store-baselines、home-snapshot-content；完整package-owners、translation-check。
- R1五个本机完整文件：contextual-dock-parity、feed-capture-scenes、inbox-automatic-scenes、workflows-judgment-link、list-silent-refresh。
- R1两浏览器文件home-offers.e2e/inbox-current.e2e：公共browser槽本机执行，或根明确绑定最终准确输入的CI/Full原件。缺任一种保持NOT RUN/HOLD，不能用静态import销账。
- 原Workbench function-agent-authoring.e2e、capabilities-page及连接设置的connectors-settings-behaviors沿当前合同；实际采用#1677业务增量时，connector-consumer-usages完整文件进入组合证据。不因单个typesafe说明注释再造连接测试。
- 其余实际适用README要求按本轮/有效旧输入/准确CI原件列明，不把152引用候选数当执行测试数。固定boundary、health --base实际M、test-imports、diff、API/actions零差异、assets和affected原件；full=true仍由根结算。

作者交付时核完整M/H/tree、dirty、实际rename/scoped diff、构建source binding与测试blob、公共包/dist实际解析、命令/自然退出码、每文件pass/fail/skip/cancel/retry、首败和恢复。作者摘要只作索引；本线读取raw并与验证3的独立结论交叉核，子代理报告不自动签字。保留执行时真实输入，已有效证据不重复本地运行；缺口只定位对应验收/完整文件，不机械加H/M矩阵。

所有本机测试含非浏览器门禁用公共browser/test槽，build用公共build槽；先取得系统共享槽，再切隔离HOME/CFFIXED_USER_HOME/XDG/TMPDIR/Molis Home，file secrets/adhoc，jobs1/retries0。隔离局限、未运行项、环境失败如实记录。资源用实际采用M与H的匹配产物比较准确bytes；核采集是生产handler、真实HTTP还是浏览器，分清证据层级。不得借T389/T386/T065额度或未合差额，若增长按实测给根裁定，不自改预算。

## 最终交付边界

收到最终原件后写 `/private/tmp/t392-second/REPORT.md`：逐项裁定RAC-2843～2847、稳定身份/error-owner与保护路径图、完整验证归属、残余问题及CI/Full/采用边界。当前只完成准备，无运行证据、无最终签字。若出现必须改公开值/数据身份、门禁放宽或超窗口的实际差异，先指出精确差集并交根裁定，不能把迁移困难当作新增兼容授权。
