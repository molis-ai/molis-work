# T116 PR1b 独立验证终态｜验证线5

最终裁定：**约定本地候选的证据核验通过，无本线新增阻塞项**。准确最终 H `3421e0e69645a7ac247672c590951bce3a9c5765`，tree `2bb1668425959a01907048e78837ba414af7845a`。这是独立读取 Git/构建绑定/作者完整执行原件及留存产物后的结论，不是本线重新动态执行测试；远端 CI、准确头 Full、secrets、推送与采用仍归根另结。下文第 1–5 节保留原阶段判断及当时未完成状态；第 6 节是本次最终 delta 核验与终签，不将历史失败改成历史通过。

状态（历史阶段）：阶段证据可用；不终签 PR1b。范围是根要求的既有 pure-merge、三必修候选、四类负例、66 HTML 与资源差异的只读核验。未启动产品测试、构建、浏览器或服务；未改作者工作树、Git ref、真实 Home 或协调账。以下独立工作仅为读取冻结 Git 对象、作者原日志和留存产物，并静态比较。最后的一行 Array.isArray 修复及其最终 H/构建/两完整文件待下一次准确 delta 核验；本报告不将新增产物文件的出现视为冻结交付。

## 1. 输入与纯合流

- M：`db29f18d4f602fa8d9efb689a6a766aa9b07625f`。
- 原 PR1b H：`d37ec34c8498ab755bf9e34ba430e5648dacb0a8`；slice B：`7f389082cc2440875d3a42376a03309efe2b043e`。
- 实查共同祖先 A：`31315ea6c7a12aec35cceb0b064cc0d649d53237`，不把 B 当共同祖先。
- pure tree：`a6700e2521ddeed592f6267ee06d0efc7f196375`。
- 本阶段三必修候选 H：`d5a1ee558a622aa264d19da42921b3ab8aaa2d32`，tree `05bc0fb17f116690fd96630f6e563dab4806367e`，实际双亲准确为 M、原 H。

独立读取完整 ls-tree（含模式/blob）及全部 44 路径的逐行差量：M→pure 与 B→原 H 的每文件有序增删内容完全一致，共 827 加/148 删；反向核 B→M 与原 H→pure 的每文件有序增删内容也完全一致。pure 全部范围外路径/模式/blob 与 M 相同。不是仅凭 19U 清零、文件数或作者 binding 判断。

手动核五个父变更交叉处 web-goals-read、workbench/index、边界脚本、golden 测试、entry exports 的合流差异；原父更新保留。Goals README、ports、documents、golden.json、view.json 属范围外，整 blob 保 M；ports 的 terminalsRoute 仍必填，documents 仍给真实插件路由。Manifest 的相邻 GOALS_TERMINAL_ACTIONS import/action 保留；privileges 仅投影原 PG-060/PG-094 行，PG-058 与 M 原文相同。其余父模块由全树模式/blob 和双向差量核对覆盖。

候选总 46 路径，仅比原 slice 多 frame-stage.ts/factories.ts。pure→候选仅五路径：SDK page-routes、两个叶子、stage-data-input 与 registration-boundaries 测试。独立数据见 `static-tree-audit.json`。没有借此清掉 PR1c/T402/T403/T117/T118 的后续范围。

## 2. 三必修与四类负例

已读冻结候选的 SDK page-routes 全文、Host matcher、factories 全文、测试新增断言及四份实际 mutant patch。三个可信字段在 path/query/stage_data.input 声明均拒绝；投影先检查声明名，再看请求是否含值，因此缺值仍拒绝。Host declaredStageRequests 的正常候选断言实际经过匹配后再投影，普通 task_id/tab 正控到达真实 stage model。stage_data.input 声明断言要求对应错误消息，不仅依赖同一 query 的拒绝。错误模型保持 ActionError/plugin.declaration_invalid/invalid。

| 作者完整文件原执行 | 原件结果 | 独立判定 |
|---|---|---|
| MethodSignature mutant，registration-boundaries | 5 pass / 1 fail | 失败准确为 L must be a function property；可证明静态 guard 抓方法签名恢复 |
| 根 index import mutant，同文件 | 5 pass / 1 fail | 失败准确为 factory import must name its owner leaf，actual ../index.js |
| 删除两个声明拒绝分支，stage-data-input | 32 pass / 9 fail | 三字段×三个位置均 Missing expected exception；投影组仍通过 |
| 删除投影拒绝并去无用 import，stage-data-input | 38 pass / 3 fail | 三字段投影断言 Missing expected exception；声明组仍通过 |
| 全恢复后 stage-data-input + registration-boundaries | 41/41 + 6/6 pass | 零 fail/skip/cancel，完整两文件恢复通过 |

首次 projection mutant 因未用 pluginErrors import 出现 TS6133，**不是有效行为负例**；保留其失败，采用随后成功构建的 projection-fixed 原件。声明 mutant 的 manifest/actual source digest 同为 `14a86a6e4994b619f877ae80ece4172057a092ba796386841177653c522585ff`；有效投影 mutant 同为 `1b61c1aed6e3740e799eedb80e35c3fd300dc13ae67da233bf79c8430c3e517c`。恢复 manifest/actual 同为 `006e4a9ed83a0e1068b064067c57a9466c92d6d6ed91fe3c89fcc89568c4b056`，对应 d5a1 候选且当时 status 空。

边界：投影 mutant 每项在第一个直接 stageRequestParams 断言处失败，不能说这个负例执行到了后面的 Host 断言；Host seam 是恢复后正常完整文件的独立拒绝断言。两种证据共同支持当前实现和测试有效性，不宣称旧实现已造成身份覆盖或越权。Method/import 负例是静态架构证据，不是运行时安全测试。

已核作者 targeted 原始日志：七完整文件 135 pass、0 fail、2 skip；stage 41、UiHost 9、registration integration 2、静态 registration 6、golden 67/69、Goals document routes 5、Goals planning 5。golden 两 skip 是 view 再生成与 hash 录制钩子；环境仅 DUMP=1，RECORD/VIEW 未开启。无按名挑选或失败重试。这些是作者执行、验证线读原件，不冒称本线重跑。

## 3. 66 份完整 HTML

本线直接比较 `/private/tmp/t116-pr1b-evidence/golden-html/candidate` 与本线此前独立执行的 `/private/tmp/t384-verify/candidate/html`：集合均 66，缺项/额外项 0，逐文件完整字节相同，总计 31,396,720 bytes。没有去脚本/样式/JSON/ID/业务属性，没有归一化，没有录制新基线。结果逐文件见 `static-html-audit.json`。

父原执行头明确保留为 `d9291973f6a9a534afabfc3681991b9eb15183e2`，不改署 M。实查其到父最终 `4404e142662cbd7895f46c1c6df6e5efe5e6e135` 仅 Pages 测试变化；再到 M 仅 `mcp-connection-change-refusal.test.ts`、`workbench-stop-feedback.e2e.test.ts`。生产/fixture/golden 生成输入不变，父 source digest 仍 `1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`，因此可核抵父 HTML；并非父整 tree 相同。历史红例与 Full UNKNOWN 不由这次比较消除。

## 4. 48 资源与真实 serving-body 的 14 改名

独立重读 assets-parent.log/assets-candidate.log：同一 48 路径，均 status 200，逐项大小全部相同，总计各 7,469,519 bytes；**47 项哈希相同，frame 一项哈希不同**，不能写成 48 hash 相同。

采集脚本调用构建产物的 createLocalWebAssets/serveWorkbenchAsset，并捕获真实服务函数交给 response.end 的 bytes；属于生产 serving 函数响应体证据，**不是经过监听端口的 HTTP 网络端到端运行**。

实际 frame 两端各 190,838 bytes。留存文件独立 hash 与对应响应日志吻合：
- parent：`52b37b25609a2114c7f892b68a8bee80b933afaf4c6fa1df259d134e9cb850e3`
- candidate：`ddc035da9239c02371c7c1fd8226345e114cde298341c5977c716fba3b8424a8`

作者 frame-served-identifiers.mjs 已使用 TS type checker 将 14 个变化 Identifier 分别绑定到对应声明位置，并非仅 token 比较。本线再对实际上述两个文件做只读全 AST 核对：两端 0 parse diagnostics、各 100,123 节点且 kind/start/end 全同；非 Identifier 叶子文字无差异；20,600 个 Identifier 全部比较符号声明 kind/start/end，绑定差异为 0，包括未改名的引用。14 个改名均有明确本地声明，分别是两局部函数与两个局部变量的名字交换。6,978 个 Identifier 两端均无可解析声明（noLib/noResolve 的静态分析边界），这些名字和节点位置均未变化；不包装成完整 JS 语义等价或浏览器行为证明。

因此所要求的 **实际 served frame 的 AST 引用绑定证据已具备**，此处无额外待补 gap。全结果见 `static-frame-all-bindings.json`、`static-assets-audit.json`；不使用 raw/pre-tightening frame 的 hash 冒充实际响应。

## 5. 仍未终签的准确边界

141 批不能写全绿：原首批一个文件通过，npm 双配置同指 /dev/null 导致 plugin-sample setup 失败后中断；修正为两份独立配置的 resume 140 文件为 139 pass / 1 fail。净结果 140/141；唯一产品失败是 plugin-declaration-rules 的 views-not-list，275/276，pageRouteProblems 对非数组 views 迭代引出 TypeError。中断/环境失败的原件继续保留，不借 resume 抹去。

根 06:56 已授权仅一行 Array.isArray 修复，并保留 inspectViewDeclarations 原有错误。最终交付时仅需核准确新 H/tree/delta、source/dist 构建绑定、完整 plugin-declaration-rules 与 stage-data-input 两文件原件以及必要 gates/资源绑定核抵；若准确 delta 另变，再据实际变化扩大。现在不预签新 H，不重跑旧矩阵或 141 批。API/health/README 全清单最终核抵、准确 CI/Full、fresh secrets、GitHub 和采用仍按根既有分工办理；本阶段报告不放行 Full、不宣称 CI/发布/用户验收完成。


## 6. 最终 delta 核验与终签

根正式交付最终头后，只读核最终增量、matching build、317 原件、十完整条件文件 43 原件、最终 gates/assets/cleanup；没有重复旧矩阵、金样、变异测试，没有启动 build、测试或服务。

### 准确增量与错误语义

Git 对象实查最终 H/tree 如报告首部，唯一父为 d5a1；d5a1→3421 只有 `packages/plugin-sdk/src/page-routes.ts` 一文件 1 加/1 删：

```ts
for (const view of Array.isArray(manifest.ui.views) ? manifest.ui.views : []) {
```

数组/undefined 的迭代语义不变；非数组交回既有 inspectViewDeclarations 的 `ui.views 必须为数组`，随后既有 assertNoDeclarationProblems 抛 plugin.declaration_invalid。未修改测试、matcher、投影、导出或错误模型。实读既有 views-not-list 夹具、manifestProblems 与原件通过行：该 helper 仅接纳既有 ActionError/invalid，TypeError 会继续抛；因此本次 276/276 不是吞错误而通过。冻结的四份 SDK/API blob 均与 d5a1 及 final-binding 相同，整候选仍 46 路径。作者当前 HEAD 准确且 porcelain 空。

### 作者最终头执行原件与核抵

- 整体 `pnpm build` 原件 exit 0；manifest、作者重新计算的 actual digest、最终两文件与条件补验的 build binding 均为 `1b94d365d17b700e5de2bf8abf72fa3343a7e5722d0194eab535b97277d73432`，created_at `2026-11-01T06:53:54.559Z`。本线现场读取留存 dist manifest 仍相同，当前 source/index 无修改。构建原日志保留四条 xterm default-export 警告，不写成无警告构建。
- `views-final-tests.log`：完整 stage-data-input 41/41、plugin-declaration-rules 276/276，共 317/317；views-not-list 原断言通过，三可信字段声明/独立投影与普通参数正控通过。两完整文件零 fail/skip/cancel/todo；命令 retries=0，无按名称筛选。
- `goals-conditional.log`：十个完整文件共 43/43，逐项为 context 2、dialogs 2、document 8、kanban 5、momentum 4、policy 5、relation 3、status 2、tree 7、status-ring 5；每文件零 fail/skip/cancel/todo，命令 jobs=1/retries=0，准确最终 H、同一 matching build。
- 已读 GOALS-CONDITIONAL-CHECKS 与 README 新增索引。十文件的旧测试/fixture/owner 叶子即使相同，也不能覆盖本次改变的 factories 运行时导入链；作者实际补跑已消除此具体缺口。旧 PR1a 的执行 H/CI checkout 保留为来源，本线无需将旧 CI 冒记新头，也未重新审整个旧 CI。
- 先前 139 无条件 README 文件按既有核抵保来源；其中原失败的完整声明文件本次通过，故现有记录均有有效通过证据；十条件文件是另补，不改写 139 的含义。原 141 批的 140/141、resume139/140 依然是历史真实结果，不追记成当时全绿。
- 一行增量未改数组正常路径、trusted-field 分支、projection、两叶子、renderer/fixture；因此第 1–4 节纯合流、四负例、66 完整 HTML 与其它通过的完整文件保原头/原执行来源核抵。没有把旧执行重新标成 final H 动态执行。

### 最终门禁、资源及清理

原件 health 明确 against merge-base `db29f18d4f602fa8d9efb689a6a766aa9b07625f` 通过；boundary errors=[]；非 update API 66 snapshots/2794 declarations 匹配；actions 快照匹配；imports 1713 test processes 中 source/build 混用 0；资源预算使用准确 M，discoveryMisses=[]；diff whitespace 日志空且作者记录通过。最终 gates-results 各项 exit 0。没有新增预算放行或扩大门禁规则。未把 boundary 内部的 test-kit build 宣称为本线执行。

本线重新解析最终 `views-final-assets.log` 与已核 d5 的 `assets-candidate.log`：48 路径集合及每项 status/bytes/SHA256 全部一致，均 200，总量 7,469,519 bytes。这准确支持复用第 4 节实际 frame 的 AST 绑定证据；相对 M 仍是 **48 sizes 相同、47 hashes 相同、frame 一项 hash 不同**，没有新的 frame 差异。这里仍是生产 serving 函数响应体采集，不是网络 E2E。

final-cleanup 原件是条件补验之后的清理记录，homes/tmp 的 open_handles 均空；本线现场确认这两个任务私有目录已不存在、工作树 clean，作者 tree/dist/完整 HTML 留存。没有新启动进程，也未冒称独立重跑其 lsof 检查。四份共享 SDK/API 文件保持冻结，释放窗口的调度仍由根决定。

独立静态汇总：`final-static-audit.json` 记录准确 Git 增量、四 blob、当前 build manifest、317/43 每文件原日志计数、48 资源逐项比较、清理目录现场状态。

**终签范围**：本地候选满足本线约定证据核验；本次未发现需追加动态执行的实质缺口。工程候选通过不代表远端 CI/Full、真实用户验收、发布或采用完成。原阶段列出的历史失败、无效变异、环境中断和旧 Full UNKNOWN 全部继续保留；根可按自身裁定继续推送与准确头验证，本线不自行执行这些外部步骤。
