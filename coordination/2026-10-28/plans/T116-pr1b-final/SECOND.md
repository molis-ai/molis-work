# T116 PR1b 独立加强二审

状态：**最终 H 二审通过，无 Blocker/P1、当前必修或补跑项。** 准确 H `3421e0e69645a7ac247672c590951bce3a9c5765`，tree `2bb1668425959a01907048e78837ba414af7845a`。原阶段的 10 份 README 条件集合缺口已用最终 H 的完整 43/43 关闭；非数组 views 回归以同头匹配 build 和 317/317 关闭。保父44+两叶子、三必修、四有效负例、66完整HTML及实际served frame改名证据沿用已审结论。以下保留阶段发现与原执行归属，最终收口见末节；本二审终态不代替独立验证线自己的终态或根的CI/Full/采用裁定。

## 阶段发现（已关闭，保留原记录）

**Goals README 页面绘制条件集合有 10 份文件尚未说明核抵依据。** 准确 d5 的 `plugins/native/goals/README.md` 明写“改页面绘制（src/page/）必跑”，本片修改 page/factories、frame-stage、routes、planning-request/index，因此适用。当前 README-CHECKS/mandatory-by-package 只列 Goals 无条件 26 文件；targeted、mandatory 与 mandatory-resume 原始完整文件列表中，下面 10 份均没有本轮结果，也没有指向旧有效结果的逐项核抵说明：

- `tests/goals-context-ui.test.ts`
- `tests/goals-dialogs-ui.test.ts`
- `tests/goals-document-ui.test.ts`
- `tests/goals-kanban-ui.test.ts`
- `tests/goals-momentum-ui.test.ts`
- `tests/goals-policy-ui.test.ts`
- `tests/goals-relation-ui.test.ts`
- `tests/goals-status-ui.test.ts`
- `tests/goals-tree-ui.test.ts`
- `tests/status-ring.test.ts`

这是当前 mandatory 记账缺口，**不要求机械重跑这 10 份或旧 19 文件矩阵**。按 accepted 合同补其原执行 H/完整结果原件、实际生产/夹具/构建输入变化及沿用理由；只有没有有效原件或输入已使原件失效的文件才需补验。相同条件集合里的 golden、document-routes、planning-ui、workbench-ui-platform、registration-boundaries 已有本轮 targeted；package-boundary-must-contain 已在 resumed 批通过，不重复要结果。139 个“无条件文件已核”本身不能代替这项条件集合的核抵。

## 准确范围与父贡献

- M `db29f18d4f602fa8d9efb689a6a766aa9b07625f`；旧 H1680 `d37ec34c8498ab755bf9e34ba430e5648dacb0a8`；自有 delta B `7f389082cc2440875d3a42376a03309efe2b043e`。
- d5 tree `05bc0fb17f116690fd96630f6e563dab4806367e`；其两个 parent 确为 M/旧H。真实共同祖先仍为 `31315ea6c7a12aec35cceb0b064cc0d649d53237`，没有改写为 B。
- 纯合流 tree `a6700e2521ddeed592f6267ee06d0efc7f196375`：本线独立 Git 对比，其 M→tree 的路径与逐条增删行等于 B→旧H，44 路径、827 加/148 删。不是只核 19 冲突。
- 纯合流→d5 只变 SDK page-routes、Goals factories/frame-stage、stage-data-input 测试、registration-boundaries 测试五文件；最终相对 M 共 46 路径，只多已批准两叶子。
- 父 Goals README、page/ports、page/documents、golden.json/view.json、T369 新测试、T388 stop-feedback 均直接逐 Git blob 与 M 比对相同。Home 导航、settings_address、T143 现行声明、T148 terminal 合同与 T382 Artifact 路径由准确 slice 投影保留，没有恢复旧父版本。
- SDK-WINDOW 四文件在 d5 的冻结仍成立；观察到的新 views 一行只改 page-routes，没有动 manifest/index 或两个共享 API 快照。未引入资源预算、APPROVED_CEILINGS、其它 gate 规则或后继销账。

## 三必修与四负例

**可信名拒绝成立。** SDK pageRouteProblems 在合法 path/query 参数名单和 stage_data.input 两处拒绝 actor_id/idempotency_key/control_token；公开 parsePluginManifest 汇入现有 plugin.declaration_invalid/invalid。stageRequestParams 自己先拒绝被选中的可信名，后读取值，即使对应值缺失也拒绝；它不依赖前置 Manifest 校验。Host 的 declaredStageRequests 调用该投影，仍按可见项目插件/匹配 owner/无 rejected 参数筛选，没有新身份通道。

新增测试逐三名×三位置经公开 parser 断言错误码、kind 和对应位置文字；stage_data.input fixture 同时声明同名 query，但断言特别要求 stage_data.input 错误文字，因此不能靠仅 query 报错冒充 input 拒绝。投影测试刻意绕 parser，matcher 确认可信字段确实到达 params 后，公开 Host 投影仍抛现有错误。普通参数经实际 Host projection→真实 stage model 保留，未声明 actor_id 被过滤。此证据证明页面数据拒绝，不证明历史上已发生 actor 身份覆盖或越权。

**L/icon 与叶子 import 成立。** frame-stage 只把两个 MethodSignature 改为函数属性；渲染正文未变。factories 的常量/renderer 来自原 owner 的 ui 叶子，primitives 来自实际定义的 ui-model（dialogs/factors/status 在 ui 本叶）；无新聚合桶。AST 用例读取实际 renderGoalFrameStage 参数类型及 factories imports，没有 mock 生产类型。

| 作者原始证据 | 已核结果与证明边界 |
| --- | --- |
| ast-negative-method.patch/log | 恢复原方法签名，完整 6 项中 5 通过、L 属性断言唯一失败。类型结构证据，不是动态安全证明。 |
| ast-negative-import.patch/log | 恢复原根 import，完整 6 项中 5 通过、owner leaf 断言唯一失败，actual 为 `../index.js`。 |
| mutation-declaration.patch/log + 匹配 build | 只移去两处可信名声明拒绝；完整 stage 文件 32 通过/9 声明断言失败，投影及普通对照仍过，失败是 Missing expected exception。 |
| mutation-projection-fixed.patch/log + 匹配 build | 只移去投影拒绝并移除因此无用的 pluginErrors import；完整 stage 文件 38 通过/3 投影断言失败，声明及普通对照仍过。失败发生在直接投影断言，不能说该 mutant 已走到同一用例后面的 Host 断言；正常恢复运行确实走完 Host 断言。 |
| restore-tests-final.log/build | 源码恢复、build digest 回到 `006e4a9e…b056`、Git clean；stage 41/41 + registration 6/6，合计 47/47，无 retry/skip/cancel。 |

第一次 projection mutant build 因 TS6133 未使用 import 失败，不是有效行为负例；保留 mutation-projection-build 原件及第一次 patch。修正后的编译与三项拒绝断言失败才是有效第四负例。两道拒绝分别移除，未互相掩盖。

## 动态证据、金样与实际资源

作者 d5 的七完整文件原始 targeted：stage 41、UiHost 9、registration routes 2、registration boundaries 6、golden 67 pass/2 明确生成钩子 skip、document routes 5、planning 5；合计 135 pass、0 fail/cancel。两个 Goals 路由文件均已实际完整运行。严格独立 stage 文件 typecheck 原件已读。此为作者证据，本线未运行产品测试。

targeted 环境明示 DUMP=1，RECORD/GOLDEN_VIEW 未设置。golden 的两个 skip 是记录/重新生成 view 的钩子，不能写成业务 golden 用例跳过。本线重新读取两个实际目录，**双方各 66 个相同文件名，全部完整字节相等，缺项/额外项为零**；没有只比较归一化哈希。保 scripts/styles/JSON/真实 ID，父 golden/view blob 未改。

参考保留原执行头 `760c9b42…`，通过 T382 runtime 路径/label 桥接、T384 最终生产 digest `1daeedd8…65a5` 到准确 M；已读 parent-reuse、T384 T382-runtime-lineage/current-checks。T384最终→M 只有两个无关测试的事实也已独立 Git 核实。未把父参考追记为在 M 上新跑；旧 28/9/101/HTTP5/view 和旧 golden 六红、record skip、额外探针红不转写为本候选结果。

资源证据调用真实编译的 createLocalWebAssets/serveWorkbenchAsset，使用内存 response 收取 body；是实际服务 handler 的响应字节，不是经网络浏览器取回，也不是未经 tightenServedJs 的原始 renderer 输出。48 个预算路径全部 handled/200，两边总量 7,469,519 B，大小逐项相同；**47 项 hash 相同，plugin-frame 一项不同**。

frame 原件本线独立重算：均 190,838 B；父 SHA256 `52b37b25609a2114c7f892b68a8bee80b933afaf4c6fa1df259d134e9cb850e3`，候选 `ddc035da9239c02371c7c1fd8226345e114cde298341c5977c716fba3b8424a8`。14 个单字节差异与报告偏移完全一致。另对留存的两份**实际 served** 文件做只读 TypeScript AST/符号核对：两侧各 59,464 AST 节点、20,600 个 identifier 节点、0 parse diagnostics；只有 14 个 identifier 出现位置改名（涉及 4 处局部声明及引用，不是 14 个独立变量），全部 identifier（包括未改名者）的声明 kind/start/end 对应相同，未见捕获或重绑。作者非 identifier leaves 同一的检查与原始字节差异相符。这支持本次 minifier 改名解释，不冒充浏览器运行时验收，也不把48项写为hash全同。

资源首轮 helper 把 warning stderr 混入 JSON 导致解析失败、随后识别 frame hash 差异的过程保留；诊断里的 pre-tightening hashes 不能与这两份 served hashes 混用。预算没有增长，也未申请/修改放行。

## mandatory 首败、当前一行修复与待终签

原始 mandatory 首批 plugin-sample 因 npm 把 /dev/null 双重加载为 user/global config 而 setup 失败；自己的 runner 47268 SIGINT 后仅有两个完整文件结果，request-failure-call-id 3/3 被沿用。修成两个独立空 npm config 后，剩余 140 文件自然结束139过/1败；sample 完整文件已通过。没有把首批中断写成整批通过。

唯一业务失败 plugin-declaration-rules 275/276：已有 “views that are not a list” 在新 pageRouteProblems 的 for-of 抛 TypeError，覆盖了既有 inspectViewDeclarations 所收集的声明错误。根 06:56 补足已经授权修复，本线不把报告旧“待授权”段落当当前阻塞。

审阅期间观察到 `3421e0e69645a7ac247672c590951bce3a9c5765`，与 d5 **准确只有 views 循环的一行 Array.isArray 限定**。已读 views-final-build-result（exit0）、views-final-tests-build（该H clean，digest `1b94d365d17b700e5de2bf8abf72fa3343a7e5722d0194eab535b97277d73432`）及完整结果：stage 41/41、plugin-declaration-rules 276/276。现有错误合同的回归已获得作者修复证据，首败仍保留。合法数组分支的三可信名逻辑、matcher/projection、类型/叶子导入不变；四有效负例与有效 HTML 的原执行头保留，可依实际输入沿用，不机械重演。

d5 health against准确M、boundary、API生成及非update核验、actions、assets预算、imports 原件已读：API 66快照/2794声明、actions 582+360、imports 0/1713混用。最终一行修复后的完整门禁、资源绑定、清理和作者最终报告仍待正式收齐，不把 d5 的结果自动写成最终 H 新跑。独立验证目录本轮仅见 PLAN，尚未收到验证线5最终报告。

作者运行脚本先取公共 machine-slot，再设独立 TMP/HOME/XDG；SDK/Contracts/UiHost/Host/Workbench/Goals依赖记录指向自树 dist。d5 cleanup记录临时Home/TMP无打开pid后移除；最后一行修复另有运行，必须由最终清理证据闭合。这里不对所有 Foundation 系统临时写入或 helper 身份作更强承诺。

后续只核：作者明确的最终H相对本次已审头之delta、最终绑定/门禁/清理、上述10文件核抵、验证线5报告及其新发现。**full=true、fresh secrets、远端/CI/Full/采用由根另结；本线未运行 build/test/Full，未写源/refs/GH/共账或真实 Home。**


## 最终冻结头收口

根正式交付最终 H 后，本线仅核新增差量与补齐原件，未重跑旧矩阵、金样、负例或任何产品测试。

1. **准确头与范围。** Git 实查 H/tree 与 final-binding 一致，H 的唯一父为已审 d5，唯一增量为 page-routes.ts 的 views 循环一行 Array.isArray 判断。声明/投影可信名拒绝、matcher、两叶子、测试断言和公开导出无另改。四份 SDK/API 冻结 blob 与 d5、final-binding 均一致；作者当前 HEAD/tree准确、工作树及index clean。相对M仍原44+两叶子46路径，不恢复历史父内容。
2. **匹配构建与回归。** views-final-build-build、views-final-tests-build、goals-conditional-build 均绑定准确 H、空status和 source digest `1b94d365d17b700e5de2bf8abf72fa3343a7e5722d0194eab535b97277d73432`，实际保留dist manifest同值。whole build exit0。完整原始 views-final-tests.log 为 stage-data-input 41/41、plugin-declaration-rules 276/276，合计317/317；命令无筛选、jobs1/retries0，零fail/skip/cancel。原非数组TypeError首败没有删除或改署。
3. **README 条件缺口已关闭。** 已读 GOALS-CONDITIONAL-CHECKS、输入差量及完整 goals-conditional.log。旧PR1a H7977190/实际CI checkout572e462的测试与owner叶子虽相同，factory加载链与host mount输入已变，作者因此没有硬核抵，而在最终H补跑全部缺失十文件。完整计数为2+2+8+5+4+5+3+2+7+5=43/43，零fail/skip/cancel/retry。该43项是作者最终H新执行，本线仅核原件。其余有效集合保原执行头；139无条件文件与本条件补足分别记账，不重新定义计数。
4. **最终门禁。** 已读准确M health成功原件、boundary errors[]、非update API匹配66快照/2794声明、action快照匹配582+360动作及场景、assets-budget成功、imports0/1713和diff-check记录。最终gates-results六项exit0；共享SDK冻结后没有再api:update或扩预算。补条件文件期间H与生产输入未变，这组门禁不因补证再跑。
5. **最终资源。** 本线重新解析 final actual serving日志，与已审d5测量逐行比较：同48路径，status全部200，所有48项bytes/hash均与d5精确一致，总7,469,519 B。因此已审frame AST绑定结论可直接按准确SHA沿用，无须重做AST或浏览器。相对M仍只有47项hash相同、frame一项hash不同，48项大小全部相同；不改写为与M的48哈希全同。仍是实际serveWorkbenchAsset handler响应体证据，不是监听端口HTTP/browser新执行。
6. **最终清理。** final-cleanup已覆盖43项补验之后：作者本次Home/TMP无打开handle后移除；本线独立查两根已不存在，作者tree/index仍clean。保留源码树/dist/依赖与HTML原件供后续使用。未作超出该证据的系统TMP或所有helper隔离承诺。

已读验证线5的阶段REPORT（独立纯合流/三必修/四负例/HTML/served AST结论与本线一致）及新 final-static-audit.json（准确H/tree/一行delta/46路径/48资源/317+43/四冻结blob/临时根缺失均吻合）。截至此次回读，其REPORT正文仍是阶段态；本线不替它宣布最终签字，由验证线5独立更新、根接收。二审本身的准确头审查已完成，无须因另一角色报告编辑时序重复已核工作。

最终裁定：**PASS，当前无必修、无补跑项。** 初次projection无用import编译失败、npm配置中断、资源解析首败、views-not-list产品失败及历史golden红例/Full UNKNOWN均保留原归属。四有效负例、66HTML、其它mandatory是d5/原父的有效核抵，不能冒称本线或最终H重新动态执行。full=true不变，推送/fresh secrets/CI/Full/采用由根另结；本线只写本报告，无源/refs/GH/共账/build/test/真实Home写入。
