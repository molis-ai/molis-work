# T389 阶段3独立二审（静态及资源必要性先行）

**当前结论：四生产片段的实现及新回归原件无当前必须修正项；建议接受精确workbench.js资源tuple `[1150615,1150714]`（+99 B）。尚未终签最终H：作者37文件余批、最终gates/资源许可、提交绑定、清理及独立验证仍待核收。** 这份报告不是资源门禁已通过或许可已写入的声明，不预签Full/CI/采用，也不归因旧Linux Hidden custom_rss。

本线亲读同WO阶段3、最终PLAN/书审、当前四文件实际diff、新测试全文、baseline/new原始log与result、build绑定、资源前后measurement及真实affected输出；没有运行build、测试/浏览器、生产或门禁修改、refs/GH。作者运行与独立验证来源分开。

## 当前输入与实现

正式基点`db29f18d4f602fa8d9efb689a6a766aa9b07625f`，作者树`/private/tmp/t389-fix-dev`、feature/t389-feed-menu-restore。当前尚未提交最终H，不能把运行metadata里的HEAD/tree当作包含dirty候选的提交树。当前实际改动正好四片段及一个untracked新测试；candidate.diff只含四个tracked生产文件，我另读新测试全文，未把diff未列新文件当成没有测试。最终需将实际H与这些文件/匹配构建绑定后才签。

documents-state的applyUiState明确传restore到setFeedPreset；preset把intent传给内部setFeedTask和内层setDesktopWorkSurface；surface在sources映射、Feed分支再向setter传递intent，applyUiState末尾已有outer surface restore继续有效。因此同一次恢复里的重复setter不会在第一处保住后又默认open收回。setFeedTask的selectedSource更新仍无条件，仅railOpen/summary aria-expanded/details.open三项受`intent !== "restore" || changed`约束，changed后的collapseFeedStage/setFeedAddOpen、available归一化、过滤、记忆、持久化及广播保持。

默认open保显式重选当前all/同来源的收菜单意图；未批量将persist=false当restore，未改共享helper/tab/frame/列表refresh/member路径。既有restoreFeedPresetState预赋task的窄范围论证继续有效：本刷新commit前读取并remember当前task，非请求发起时旧task；invalid task归一化为all仍changed，未以guard吞掉fallback。此次没有改变这些既有语义。缩短邻近已有intent注释只改措辞，不改deferredClients失败重试条件。没有T121账号加载/新change/submit整段混入本片。

## 回归有效性与已到执行原件

旧版准确未修生产摘要`1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`，完整新文件jobs1/retries0：RAC-2840在可靠提交后`menuOpen===true`业务断言实际得到false而红；raw AggregateError只列这一AssertionError，RAC-2841显式选择case通过，1pass/1fail且无skip/cancel/todo。不是初始化、网络或预算红；setup-attempt-1的失效来源目录/runner前guard失败另外保留，不计业务红。

红后测试仅增加initializedAt/90秒整段预算检查，逐字diff没有改业务断言、native输入、gate或分阶段时限。旧版完整文件约23秒，强化总预算不可能解释目标红；不需要为了这个单调收紧再做一轮旧版。修后build-final匹配生产摘要`5f4f30ed302a7ae29449be747998e8221fc57d936d898266b4f61293f0a65d01`，六个实际入口为本树dist；new-result相同摘要、公共browser holder前后同pid/since，完整新文件2/2、无fail/skip/cancel/todo，原件支持作者执行，非本线另跑。

新测试只经一次公共Goal POST、自然attention/cursor变化及真实compact Response控制；getResponseBody只读原HTML的公开state，getBody完成后continue原响应，不fulfill、timer mock、内部setter或合成attention。回执不是完成证明：marker/cursor/newGoal、task后UI状态、同menu/root/body、未加载graph分支及无恢复warning/exception组合核提交。documentSyncing=false没有被当作已观测rAF。gate记录其它compact/fallback/导航/销毁/所需网络失败并硬失败，异步回调错误归集；catch保存失败证据后最终抛AggregateError，不再以category3成功返回。

原生point检查当前身份/连接、几何、hidden/inert、disabled及hit，随后仅发press/release，不走会自动reveal的公共click。提交后必须menu.open、railOpen、aria-expanded都true，再原生add→custom_rss→setup→cancel；第二case的all重选/S切换/S重选均实际收菜单并核选中及chooser hidden，能拦住“同值一律不关闭”的错误修法。S经公开Feed写入后正常导航加载，没有插DOM伪造来源。第二case主要是选择状态断言，并未装第一case的refreshGate/Runtime错误窗口；报告不要把第一case的浏览器异常拒绝外推成两个case都独立监听所有console。

正常关闭状态未被restore强制open的实现可直接核；初始menuClosed断言与同task保留分支相符，不扩称独立完成了第二次闭菜单刷新实验。gate.close逐项尝试pending continue、Fetch.disable、解绑、settle callback和移除页面监听，失败并入最终错误，原fixture承担Host/Chrome/Home teardown。实际正常清理原件及极端取消/断线边界最终再核，不以源码finally存在当作所有路径已实测。

Host opened_announce_failed/actions.missing与Node SQLite warning在baseline/new日志保留；未据此声称所有层零告警。本片通过不消除阶段1未复现、旧Linux首败/归属UNKNOWN。

## 资源必要性与准确tuple

独立比较assets-before-measurement和assets-final-measurement：两者mergeBase均为正式db29，measured集合均48路径、没有discovery miss；只有 `/assets/molis-work-workbench.js` 的原始字节由**1150615→1150714（+99）**，其余47项测得字节数相同。measurement不含逐资源内容hash，不把同长度写成独立逐字节/hash相同。gzip参考值325373→325395（+22），不参与Host原始体积许可。

现行baseBudget/currentBudget都为1150615，因此一次性许可建议仅是：

```text
asset = /assets/molis-work-workbench.js
base bytes = 1150615
ceiling = 1150714
delta = +99 bytes
```

增加内容对应新intent默认值/传递与同task恢复的条件，preset内外/surface重复调用都需要承接；删某个调用不能以“第一处已保留”为由省略。现实现只改必要参数/guard，作者在同范围缩短邻近注释后重新整体build及测量，资源未减少；它说明这次节省尝试未生效，不证明数学上不存在任何更短写法。当前+99规模及明确行为价值合理，无需为了抵掉这99字节扩大重构、改变默认意图、停止刷新或发明别的压缩机制。**本线认可必要性与该准确tuple，交根按现有规则办理，不修改算法、阈值或许可。** 非新资源且远低单项10KB；不是对后续增长的通用额度。

report --json的exit0是测量模式，不等于普通资源门通过；assets-check目前在公共槽排队，其最终退出及失败原件仍要保留。若根采用许可后最终实际构建大小或merge-base变动，应按新实际值重新核本tuple，不能沿用错误基数。health/boundary/资源登记按最后授权实际diff核收，不把待定许可当已签通过。

## 尚待最终核收

1. 作者最终H/完整scoped diff及构建绑定；包含新测试的真实提交树，不能只引用dirty时HEAD。
2. 37追加完整文件原件、逐项mandatory结算、所有首败及最终门禁/资源许可、secrets与清理。当前rest在跑，不预签结果。
3. 独立验证线1最终REPORT及其来源，不把作者日志冒署验证执行；据相同输入原件核收，不要求机械复制一套动态。
4. affected实际输出对当前五路径为full=[]，它只是不推荐Full的脚本事实；最终Full仍按同WO、实际diff与根裁定，当前不重开。后续若根批准资源许可/元数据进入最终diff，也须据其性质重核，不直接拿此前五路径结果覆盖新增路径。

本轮先行静态与资源必要性核到此，最终终签等待以上原件，不新增执行或生产改动。

## 最终增量二审终签

**准确H `13767116bd339558596e13ad6b36a3a3ed19f3cc`、tree `a418a6759f61743ad855c1969b5b9f1895e4cdef` 本地独立二审通过；RAC-2840～2842核收，无当前Blocker/P1、必修或必须本地补跑项。建议`full=true`作本修复首次Linux Full的人工升级，理由见末段。** 本段终签取代前文“等待最终H/门禁”的阶段性状态；先行已核有效证据继续沿用，没有重跑或重审一套动态。

### 最终H及新增两路径

已直接回读Git提交：单父为正式M `db29f18d4f602fa8d9efb689a6a766aa9b07625f`，HEAD/tree与final-binding一致、作者树clean。M→H正好七路径。最终四生产片段的Git diff与先行candidate.diff逐字相同，提交里的新测试与已审new-test-final.ts逐字相同；生产行为/测试无追加补偿改法。

新增配套仅scripts/gates/page-assets.mjs与tooling/gates/page-assets.json。前者把已消费T362 tuple和说明替换为T389理由及唯一`[1150615,1150714]`，后者只有workbench.js一项1150615→1150714；算法、通用阈值、其它许可未变。已回读同WO阶段3根资源裁定明确授权这两路径和精确tuple，不再是待批准建议。没有混入T386增长或T121账号逻辑。

### 完整文件原件、最终构建及门禁

业务证据来源仍是作者new/rest，而非本线执行：我从raw回算new为2/2、rest为37文件269/269，合计38唯一文件271/271；每文件fail/skip/cancel/todo均0，jobs1/retries0，test-results的38文件集合与test-plan.unique38严格一致，覆盖五定向、18必跑、10UI、6恢复条件的去重合同。原journey完整1440/390均实际通过，不能据此倒签旧Linux因果。有效旧版业务红继续保留；红后仅强化总预算的来源边界保持。

37批自然结束后才进行资源两路径变化，其它五路径不变；随后整体build成功，最终manifest与本树实际manifest/final-binding一致，源摘要`d2a85118f5e012b58282053db67d4c7b526abd0004b6a70c09fa5e655b3475fb`。它与业务绿时`5f4f30ed…`不同是门禁/预算输入所致，未冒称两次整树指纹相等。最终admitted各步独立重算与manifest匹配，实际local-host/desktop/workbench/test-kit/Feed/storage入口仍落本树dist。鉴于业务五路径逐字未变，不要求把38文件再跑一遍。

已亲读health-admitted、boundary-admitted、imports-admitted、assets-admitted及gate-tests原始输出/result：health按准确M通过、boundary errors=[]、0/1711测试进程混用source/build；实际48资源/7469618字节门禁通过；完整tests/page-assets-budget.test.ts为171/171、零fail/skip/cancel/todo。后者是门禁数据更新的回归，单列来源，不冒充新菜单业务case。总候选39完整文件442/442仅是38业务/README文件271加1门禁文件171之和。strict新文件typecheck、diff-check及final H的fresh fetch后secrets扫描213新增行无密钥的原件亦齐；fresh main文档增量不改本片消费输入，集成仍归根。

已读hash-assets.mjs：以真实built createLocalWebAssets.serveWorkbenchAsset处理48既有route，断言handled/status200/长度，再取响应body的SHA-256；这是生产处理器原样响应核对，**不是浏览器网络请求**。独立回算hashes-M/H：47个响应status/bytes/hash全等，仅workbench.js从1150615、`8995f239…`变为1150714、`cd1f2b0c…`；与已审+99必要性、最终tuple及普通资源门一致，先行只核长度的缺口据此补齐。

### 失败、清理及独立验证归属

setup-attempt-1的失效旧来源/runner前guard失败、有效基线业务红均保留；六个自有排队slot wrapper取消都有准确pid、无内层COMMAND启动、exit -15，不算业务测试取消或门禁通过。另一次build-admitted已完成budget update及build，但包装器open(x)撞到保留的旧hashes日志名而失败；admitted-resume明确只接续未启动的hash/check步骤，未概率重跑业务。最终成功的是admitted后缀原件，各项exit0；没有用旧取消日志覆盖失败。

cleanup.json记录task markers/进程参数及lsof cwd扫描无残留、九个runtime子目录移除、失败图移到证据目录；本线回读runtime已不存在、作者树clean，保留工作树/dist供核验。独立验证线1最终REPORT已完整读到：它在准确H核source/原件/48响应及清理，结论RAC-2840～2842本地核收，无Blocker/P1，没有再运行测试。本线确认其结论与实际diff、上述raw独立回算一致，既不冒署其执行，也不把报告本身代替raw。浏览器Runtime拒绝范围仍按各case实际代码结算，Host opened_announce_failed/actions.missing等warning和Foundation tmp限制保留。

### Full裁定建议与剩余结算

实际affected-admitted是最终七路径，`full=[]`，documents-state.ts仍列静态uncovered；本单已经用真实公共写/网络交错永久回归覆盖相关行为，并完成README合同。七路径未改共享核心/装配入口或存储；资源脚本仅精确数据许可且171门禁回归已核。因此脚本未强制Full的结论有依据，但**不限制根按新行为风险人工升级**。

根提出本修复`full=true`、准确Verify及本地审验后仅排本修复H一份首次Linux Full，我支持，没有需要先改产品、CI或本地补矩阵的具体必修风险。原因是本片有已证新交错与修复、旧版目标红/修后绿，而新永久回归不在现行CI product/SI子集；Mac本地证据尚不能替代Linux完整执行。此Full目标是验证**修复输入的首次全量**，不是重跑旧T385 H找概率绿，不能消除历史Hidden custom_rss的原因UNKNOWN。

已只读核现行Full workflow及runner：无参数发现tests目录所有`.test.ts/.test.mjs`，新e2e文件及原journey可自然进入Full，不需为本单修改CI名单。根执行时仍应绑定PR head为本H并保实际CI checkout SHA/tree；若是PR merge输入则明确与H/目标main的关系。按已有workflow首败/重试/停止规则，须从实际Linux完整文件原件确认新两case及原journey两宽度确实执行；若某片因首败停止未跑到它们，就标未运行，不能用workflow触发或其它片绿冒署覆盖，也不据本建议自动追加概率重跑。保留首败/内部retry/未跑文件，以root既有合同裁定下一步。

其它T146/T387/B/T386/PR1b Full继续等本修复实际采用后再作最小合main，符合根的串行输入安排；本线没有派发Full、改控制标签、取消任何CI或写GH。当前终签限准确H本地工程候选，Verify/Full/CI、main采用、真实Home/发布与用户验收仍由根分别结算，旧Linux失败/UNKNOWN不销。
