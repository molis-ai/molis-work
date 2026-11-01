# T384 四片承载独立二审

负责人：Codex 二审线1；本轮模型 gpt-6.1-sol。唯一需求书为 `coordination/2026-10-28/tasks/T-384.md`。

**状态：首评、T382合流及T383最后测试增量均已核收，无新增 Blocker/P1；前次两项 P1 的代码与证据已核实解决。最终候选 H=`4404e142662cbd7895f46c1c6df6e5efe5e6e135`；根的最终secrets证据已核收，正式签署只待独立验证线5的最终Pages/组合报告。本报告目前不是最终“二审可合”，不签新组合 CI/SI/Full 或采用。**

## 首版范围与当时现场

本次已核候选 P=`760c9b42ef6003ebeccf57f29e35630241bb6d52`，tree=`680c29507a517e6651aa9408094e37eab42d9c44`；基点 M=`328d5b612ef47214378ecd55e32a648228c120f3`。四片准确头均为 P 的祖先：

| 原片 | 冻结 H | 本线独立逐路径 blob 核对 P |
| --- | --- | --- |
| T362 #1694 | `64abea988ccd65416beb74bfc3d278e2afbff7bc` | 15 自有路径中14相同；开发文档合入 T143 的另一段 |
| T148 #1654 | `b35298d08d58cbfca089b8f928724558452460c8` | 72中65相同；七处不等为共享导出/README/SI/包登记/BACKLOG/giant及 documents 迁移 |
| T116 #1679 | `7977190e1889b8583310db2423788e88aff6be1d` | 58中53相同；README/包登记、迁移 documents 保留 T148 路由、允许的 ports 与独立 golden 修复 |
| T143 #1675 | `420e6c7c8534e6a5bed27ff9f01d755dc7832841` | 40中35相同；Host出口、开发文档、SI/BACKLOG/giant 合成各自条目 |

实际 merge 链为 M→`30c75e1b`（T362）→`0c5bb544`（T148）→`8cc2f804`（T116）→`51bb9cf5`（T143）→P（两项允许修复）；最后一步 diff **仅** `plugins/native/goals/src/page/ports.ts` 与 `tests/fixtures/goals-page-golden/golden.json`。四片自动合成 tree 与前次预测 `0aa887e7cff0718753a7277b633ff485b19190ff` 一致。没有把完整 patch-id 相等当成每条合成变化的证明；不等路径已按真实 diff 核，不是 blanket 等价。

首评读现场时，作者正在 P 上正常合入 T382 已采用的 main=`4b04947e7d17bbb046ca67e2ba0e2728fcd25ea6`：生产 hunk 自动合成，`specs/BACKLOG.md` 有相邻删除冲突，作者已交根缩定，仅拟同时保留 BL-695、BL-926 两项删除。当时索引有 `UU`，不能称干净或最终头；此冲突现已按根补充合同解决，见下文阶段增量。T383 的最小测试同步修复仍待采用并进入承载；不要求为此重做输入未变的全部首版验证。

## 两项 P1 与业务接缝

**RAC-2817 端口已补齐。** P 的 `GoalsTerminalPaneModel.terminalsRoute: string` 为必填；`renderTerminalPane: (model: GoalsTerminalPaneModel) => string` 保持函数属性，没有改为可选、方法或断言。迁移后的 `page/documents.ts` 保持 `/api/plugins/io.molis.work.goals/goals/:goalId/terminals`，生产 terminal pane 将其写进 `data-tui-terminals-route`。客户端从 pane 取模板，以编码后的 Goal ID 调 Goals 路由；Goals 的 HTTP 绑定调 `goals.terminal.open/list@2`、close@1，不另走旧宿主 panel 路由；页面 PTY 通道只附着由服务启动的终端。

Goals 动作限定 user/project，权限行仍区分读、开、关，平台终端服务从当前调用上下文取安装/项目/actor，要求当前实例的 user 动作及 `terminal:run`，写入前后复核授权/`beforeEffect`，目录继续受 workspace/owner 文件范围约束。新字段仅补齐页面模型，未改变这些权限语义。P 的整体 build 及真实 PTY/终端/路由完整文件原件支持该链，不只检查字段存在。

**RAC-2818 独立金样来源成立。** 参照 R=`26a184bd47e572b95b4e28e302dcd474e2c574e5`，tree=`104b1fd362d2f03e943e11d69cfa2e5a1b350804`。本线直接核 Git 祖先：R 包含准确 T362/T148/T143，不含 T116；仍有旧 workbench renderer，无已跟踪生产修改，仅未跟踪的冻结测试/view/录制结果。冻结测试 SHA-256 `0b5f631f6d84facb6508b2abf68ed324e6c82eb1760356eb4295f375f26f26b4`，view `1d2994e49f10bcaad4ab804bb159cc76b4b92199032a8811f72c2b4669656aa9`，T116、P 与 R 实际文件三者一致。原测试固定 Date.now 与 UTC，markup 过滤器未改。

R 的录制命令设 RECORD/DUMP，P 的消费命令只设 DUMP；执行器使用显式白名单环境，P 没有继承 RECORD。两树各有匹配整体 build 的绑定原件。P 的 golden.json 与 R 实际录制文件和保全副本逐字相同。本线两次直接读 HTML：先在清理前比对临时输出，后在保全目录 `golden-html/reference` 与 `golden-html/candidate` 再比对；各66个、无缺项，**66份完整HTML字节一致**，涵盖 scripts/styles/JSON，不只比较过滤后的 hash。再对 R HTML 按冻结过滤器重算：全部匹配新期望；只移除精确 `data-tui-terminals-route` 属性，即66项全部复原旧 hash/长度。实际变化是中英各四个 current page，共8项、各+84字符；其余58项未变，没有候选自录或掩盖额外差异。

## T143 安全沿用的实际边界

本线独立以 T143 H→P 比较作者列出的329个明确输入，唯一差异为 T362 的 `packages/plugin-sdk/src/view-placement-declarations.ts`：仅在 view 提供 `settings_address` 时增加有界 query/hash 校验及 reserved 参数拒绝。额外显式核 Home 安装/执行器、model/image服务、sandbox设置/图片服务、指令/启动边界及签名包/供应商夹具，无差异。相关四份合同变化来自 T148 终端模型/别名与 T362 UI声明，不是模型/图片 effects 或可信身份。S-60/S-66/S-91 行逐字同 T143 H。

Home executor 仍将 model、image、terminal 放入同一实例的服务对象，终端工厂在 Manifest 没有 terminal:run 时返回 undefined；T143 的签名 Home 模型包没有因此派生出终端权限。模型偏好仅接受 provider_id/model_id，安装身份来自 context；图片来源固定与调用生命周期检查不变。T362 设置地址是内置目录贡献的 UI 导航输入，不成为模型身份、供应商地址或图片固定来源的通道。未发现合成增加权限或清理交叉，也没有据此追加假想 UI 矩阵。

旧安全来源继续按 `/private/tmp/t143-current-verify/REPORT.md` 与 `/private/tmp/t143-current-second/FINAL-SECOND.md` 的已限定沿用：强二审原实现头为 `014139ef8bc4d2ae750a59e7201ba9735ccdc93b`，独立 Mac signed-model16 + model20 的执行头为 `58a1713c67833bba0ebea706a88e5476ed6499c2`；到原 T143 H 的同步已经独立核抵。它们不是 P 或未来最终 H 新实跑。签名包、Seatbelt、TLS三态及 held-result/取消/撤权证据保留原来源和受控服务限制；Linux skip 仍是 skip。旧 Full 的 goals-dialogs 首败、ui-client-lifecycle 900秒 TIMEOUT、retry-only 与 UNKNOWN 不因本次绿色定向文件改写。

## 已读动态原件与待定项

下表均是**作者在 P/R 的原件，本线未运行测试或构建**：

| 范围 | 原件结果及限制 |
| --- | --- |
| 两树整体 build | 两个 whole-build exit0；golden前各自构建 source_digest 与实际输入摘要相同；本线核绑定与日志，独立验证线另核最终构建输入 |
| R 录制 / P golden | R 68 pass；P 67 pass、1录制写入钩子正常skip；0失败/重试/取消 |
| P 六完整文件 | goals-dialogs3、goals-terminal4、desktop-tui35、web-route-table2、plugin-global-settings16、security-invariants-plugin-pages28，共88 pass；desktop-tui另1个未装Grok CLI skip；无失败/重试/取消 |
| P 门禁/合同 | boundary、准确 M merge-base health、0混用导入图、API及actions非update检查均exit0 |
| P 资源 | 原始served测量48项、7,469,519 B，无discovery miss；仅 workbench.js 1,150,291→1,150,615（+324 B），命中T362精确许可；page-assets检查exit0。是生产serve返回体测量，不是新网络/视觉验收 |
| 隔离/收尾 | 独立 HOME/CFFIXED/XDG、file后端/ad-hoc、公共固定槽/jobs1/retries0与专用浏览器有绑定；Foundation原生TMP限制如实保留。临时Home/profile清理后66份HTML已移入持久证据目录 |

## T382 合流阶段增量（已核收）

当前 M=`4b04947e7d17bbb046ca67e2ba0e2728fcd25ea6`；H=`d9291973f6a9a534afabfc3681991b9eb15183e2`，tree=`2adedf27a2b4ccf3a3d824c6e6c6540e3382513c`，双亲依次 P、M。参照 R1=`1a4966bd3d5c9fdccb2d10a11fcb8fa6b90daa02`，tree=`b2c880ef569072cc81aabb114acf62723bcf1105`，双亲依次原参照 R、同一 M。本线回读 H 工作树干净，R1 生产干净、仍仅保留三份未跟踪测试副本，未夹入 T116。

直接重算 P→H、R→R1、旧 M328→M4b 三份 diff：各26条 rename 口径记录；按文件逐项对比增删行，集合与实际改动行全部相同，未见额外产品变化。包括 artifact 模块改名、Host 三处导入/导出、翻译文件的来源注释、文档/门禁读取路径与相应用例引用。普通 patch-id 因共享文件上下文不同而不等，不把它写成原完整补丁相等；这里的结论有逐文件变化行对照支持。

任务书末尾根的准确补充授权已核：仅解 BACKLOG 相邻删除 hunk。P 已无 BL-695、仍有 BL-926；M 已无 BL-926、仍有 BL-695；H 两者都无。P→H 的该文件 diff 只有删除 BL-926，保留原 T148 删除 BL-695及全部邻接行；没有附带待办清理、编号挪用或新语义。

核两份 `T382-runtime-lineage.json` / `reference-T382-runtime-lineage.json` 及匹配构建绑定：两端各5个 emitted 模块只改变 artifact 模块路径、sourceMappingURL或来源注释标签。生产分支、参数顺序与返回行为未改；冻结 golden 测试/view/期望、Goals page/renderer、原接缝测试、lock及test-kit作用域无源码差异。两端都包含同一采用 main，故首版66完整HTML与接缝执行按原P/R来源沿用，不改称H/R1新录制或新实跑。前文329个明确安全输入的沿用范围也未因这26条改名变化扩大；不重开首版安全审查或补跑旧Mac文件。

作者 H 上新增完整 `artifact-consumes-file`4、`host-pages-error-model`17、`workbench-entry-exports`5、`builtin-plugin-assembly-gate`10，共36/36，无skip/retry/fail/cancel。原始 delta绑定头/树为H且状态为空，匹配整体build exit0；准确M的health、boundary、导入图、API/actions非update快照均exit0。H 的 served 原始JSON经本线重新解析，48项、7,469,519 B、无discovery miss，仅workbench.js 1,150,291→1,150,615（+324 B），未产生新许可需求。R1也有独立匹配整体build；没有借H的构建代签R1。

构建桥核对曾因source-map文件名、默认上下文patch-id、参照rerere已复用解而出现控制假设失败，原件和调整保留；实际变化已定位，不计作产品测试首败，也不删除原安全/Full失败账。以上是只读代码与执行原件核收，本线没有运行测试或构建。

## T383 最后测试增量（静态已核收）

最终候选 H2=`4404e142662cbd7895f46c1c6df6e5efe5e6e135`，tree=`ecf513543c29653e1be8eb44cf684efc14a3800d`，双亲为T382阶段H、实际新M=`6729a2d4655caa603daa369f99884e09c4726bde`。参照 R2=`8214e9126158db285136af58d283b5e89d44d691`，tree=`7dd31c5302603a5713fa8b9eda95d3ff975af730`，双亲为R1、同一新M。H2回读干净；R2仍仅三份测试副本未跟踪。

本线直接读取Git对象：两端本次merge和M4b→M672三份binary diff逐字相同，唯一文件 `tests/pages-actions.e2e.test.ts` 为+14/-1；H2、R2及已采用M的该测试blob均为`2edb63a08ad24d4b1a30c4ba8ceff56587e1a812`。在既有两宽度例中保留owner正文读回断言，取同一已保存页id/version，并在原reload之前等待真实父Pages root/context具有相同id/version、unsaved非真且无draft_text；没有把缺失root/context视作clean，没有放宽期限、改业务断言、sleep或伪造状态。不存在新产品改动或第三项自行合成修复。

另独立重算完整承载补丁：M4b→前H与M672→H2的binary diff **1083436字节逐字相同**。四原片及端口/golden修复的projection不因该测试采用而改变；不重评已完成的26条T382或329项安全输入。两端生产source_digest继续分别为`1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`、`8db8b26bcef29ed80ddaab64e8c49e870a6cc9e32af55c1659bfff29922041c7`，匹配构建按原来源沿用，作者没有重复build或录制金样。最终H2的health原件以准确M672为base、exit0；boundary及原资源/合同检查的输入未变，沿用T382阶段有效执行。本线未执行任何测试、build或门禁。

截至本次核对，作者尚未在H2运行Pages；独立验证线5的最终H2 Pages与组合结果在进行中，尚无最终REPORT。本报告不把正在进行的流水线摘要当作完整独立验证结论，也不把先前T383自身4/4倒签为承载H2执行。作者主REPORT现已更新为最终H2/R2/M672绑定，与FINAL-STATE、T383 merge/projection及本次Git回读一致。

根提供的 `/private/tmp/t384-root-secrets.log` 已回读，`pnpm secrets:check` 实际执行 `node scripts/check-secrets.mjs`，merge-base为准确M672，12898新增行扫描无secret；根报告此运行在fresh fetch后针对H2完成。本线另回读作者HEAD=H2、origin/main=M672、status为空。该日志自身不打印HEAD，准确头归属以根的执行交接和本次Git状态共同界定，不扩大为其他头的扫描证据。推送前secrets待项已结；未在本线重跑。

最终签署仅剩证据收口：

1. T382/BACKLOG及T383采用/测试准确投影均已核完。等独立验证线5对H2的Pages、组合与两端普通golden给最终报告；只核新原件和执行绑定，不重新展开首版评审。
2. 最终H2推前secrets已核收。生产输入未变则继续沿用匹配构建及未变安全来源；若H再改变，只核实际新增差异。CI/Full仍由根另账。
3. 本线核收上述证据后，将正式二审结论绑定准确H2。之后的普通PR Verify、适用SI及一次同头Full、main采用与四原PR关闭仍归根按§8，不在本报告预签。

本次只读作者树/Git对象/证据并写本 REPORT；未改源码、索引、refs、协调文件或 GitHub，未运行测试、build、CI/Full、模型或真实Home。与作者及验证线保持独立。当前没有要求返工的新增代码问题；只待最终独立验证报告收口。

## 最终本地二审签署（现行，前述待定项已结）

**【二审 T-384】@`4404e142662cbd7895f46c1c6df6e5efe5e6e135` 本地二审可合。无 Blocker/P1 或必须返工项；独立验证与secrets这两项待定证据均已核收。本节替代前文阶段性“待签署”状态，其他历史来源和限制保留。**

准确绑定：M=`6729a2d4655caa603daa369f99884e09c4726bde`；H=`4404e142662cbd7895f46c1c6df6e5efe5e6e135`，tree=`ecf513543c29653e1be8eb44cf684efc14a3800d`；R=`8214e9126158db285136af58d283b5e89d44d691`，tree=`7dd31c5302603a5713fa8b9eda95d3ff975af730`。最终回读作者HEAD/tree及origin/main准确、status为空。前次两项P1已解决，T382与T383最后增量均按前述准确差集核收，本次没有重扫已审26条或329项输入，也没有新实现差异。

已全文核 `/private/tmp/t384-verify/REPORT.md`，并对照既读执行绑定及本次读取的原始日志统计、完整HTML比较和清理原件：独立两端普通golden各67 pass/1录入钩子skip；具名66份完整HTML无缺失、额外或差异；六完整接缝88 pass/1未安装Grok CLI skip；**最终H独立Pages完整文件4/4、无skip/失败/重试**。普通golden与六接缝实际执行头仍为T382阶段H/R，最终只合入同一Pages测试，独立生产digest和完整承载diff核抵成立，不改署为最终H新实跑。最终Pages则实际从独立最终H检出执行，匹配构建复用有记录。清理原件记录27个本线临时目录、三棵独立工作树已移除、公共槽释放，HTML/日志保全；没有要求再跑一遍的未解问题。根的最终H secrets12898行扫描通过按前述来源核收。

RAC-2816～2818及RAC-2819的本地独立审验部分可核收；**本结论不代表现已具备仓库合入条件**。根仍须按§8在同一最终H结算普通PR `Verify`、适用 `security-invariants`、新组合 `Full suite`及无未答问题，采用后回读main并核四原片实际projection，再关闭原PR。T116/T143旧Full首败、retry-only、生命周期900秒TIMEOUT与历史UNKNOWN，以及旧Mac签名/Seatbelt/TLS执行归属和skip限制全部保留，不因本次本地通过改写。

— Codex 二审线1，gpt-6.1-sol。本次终签仅核最终独立证据并追加本段；无测试、构建、产品/索引/refs/GH写入或CI/Full操作。
