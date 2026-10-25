# 交给 Codex 的独立开发片

> **2026-10-23 23:26（洛杉矶）最新分工：** 一骏明确整条防腐线听Claude总统筹：范围、优先级、跨线依赖和全量排期由Claude决定。Codex侧「专职｜防腐流水线与合并执行 · Codex」（`01a16c88-7956-7e10-a5f4-5baf476c3634`，用户最新指定gpt-6.1-sol/max，06:45:56UTC实际回合已核；root/REVIEW保留gpt-6-astra/xhigh）从Claude当前共享派单或明确回执领取独立任务，组织专职实现/评审/测试/修复，按Claude顺序核证据并执行正常合并；Root负责唯一定时巡检；原五类职责和交付驱动接续保持。原主chat保留完整目标、用户沟通并建立1–2个实现入口后交Codex侧接续，不重复建chat。独立树允许多writer，真实同文件/合同/候选重叠串行，公共build/browser槽保持；四专职入口及所有有效block/non-block闭环见[CODEX-SESSION-ROLES.md](CODEX-SESSION-ROLES.md)。DeepSeek历史贡献、Claude开发owner及唯一full组批职责分别保留；review-pr-fixer旧认领已由Claude6381877118明确释放并交FIX2接续；Codex侧协调不替代Claude总统筹。

状态：2026-10-23 起生效。用户 10-23 定：独立的开发任务可以派给 Codex，不必都在 Claude 子会话里做。统筹（本机 Claude）在这里派片、排序；Codex 做完一片在本表写 PR 号，再接下一片。

读法：

```bash
git fetch origin coordination/handoff-2026-10-14 && git show origin/coordination/handoff-2026-10-14:coordination/2026-10-14/CODEX-TASKS.md
```

## 0a. 现行模式（用户 2026-10-24 晚；最高优先，覆盖本文以下所有不一致的旧说法）

**多writer现行规则（Root转达人类最新明确：“可以提升writer数量，不局限1个，不影响速度”）**：不同独立工作树、不同明确问题/实现项、真实依赖已满足且无重复owner时可以同时写，不设整个Codex协作组只有1人的上限。同一文件/合同、同一候选及有真实代码依赖的部分仍串行；公共冲突/生成物由当前carrier owner统一。每个FIX仍一次专注一个问题、gpt-6.1-sol/max，未收尾不塞无关任务。公共build一个、browser批一个、full仅Claude唯一排期不变，等资源不等于停止独立编码；只有Root周期巡检，原交付直接接续与现有角色不变。此条覆盖以下旧“单writer/唯一writer/串行轮换”上限，仅改变并行数量，不凭共享一处文字取消已有授权或在途owner。


全文见 `MERGE-QUEUE.md` §0。用户原话：「在 claude：组织好合并顺序，进行开发和 review。在 codex：review 问题修复，修复后的二轮 review，以及有独立任务可以交付 Codex 执行」。

Codex 做的：

1. **修复**：`ac-review` 一轮评审里的全部有效意见（挡合并的和不挡合并的），在原 PR 分支上修；先留「修复认领」，一轮的修复攒齐一次推送（每推一次跑一次 CI）。Claude 开发线不再修评审意见。
2. **二轮评审**：只看修复的增量，结论写「二轮：可合」加固定 head；没过就回修复。
3. **独立片**：下表。Codex 自己的片也是一个完整功能或 slice 开一个 PR，一轮评审同样由 `ac-review` 做。
4. 测试专职照旧：红用例归因、偶发失败、`known-red-main.md`。

Codex 不再做的：一轮评审（统一由 `ac-review` 做）；组批、起 full、批 PR 入队（统筹做）。

优先级：下一批要进的 PR 的修复 → 其余 PR 的修复 → C1 → C2 → C3 → C4；不同独立工作树/问题在依赖满足后可并行，此顺序不再表示全组只有一个writer。

PR 粒度：没做完只推分支（只推分支不跑 CI），不开草稿 PR 占位（草稿也跑 CI）。落后 main 不同步，共用文件冲突统筹在批分支里解。

评论写法：第一行写结论（可合 / 要修 N 项 / 已修到 `<head>`），带固定 head，正文十行以内；长证据写日志路径，不贴进评论。

### 2026-10-25 当前交付接续（PIPE）

本节记精确候选与实际阶段，覆盖下方旧快照；不把源码释放、双核、入批和actual混为完成。Root唯一巡检/新独立单派发；交付后REVIEW、TEST、PIPE直接接续；独立writer并行，仅实际同hunk/合同串行，Claude唯一组批/full/批PR队列与来源关闭。

**当前35实际落地**：#1258@aab81d922ef07e21bdc21f8b65e87bb3b4525277已于2026-10-25T06:25:57Z实际merge，SHA3817f8757abd9e60baaa825af7048cdac060479e，API main同SHA。Claude6394016865选75d/66de/f23cf2226/ce90f795c；组合REVIEW6394179117与新full TEST6394361864双核齐。run40166367597 attempt1 completed/success，16worker均准确checkout及70/70 cold whole build；1393/1393首轮唯一覆盖、0漏重/首败/retry，8文件14子项未运行与29Mac边界保留。本机16文件69项仅Host单包build，全局manifest旧，不冒整体build。Root因Claude无可达执行通道将仅七源close-only窄移交PIPE，PIPE已06:39:40–06:40:06Z逐一关闭#1239/#1240/#1242/#1243/#1247/#1249/#1250并fresh回读准确头、state=closed/merged=false；每项写#1258包含/actual说明，PIPE close-only未删分支/未另merge；随后Root鲜核1239/1240/1242/1243/1247/1249与1258 headRef已null，1250原T1 ref仍在供1259，不能再写所有分支现存。整线后续原owner保留。原位闭环6393246436含逐项closed_at，不重复关闭/排队。

| 实施owner | 当前单与固定基线 | 实际状态、真实依赖与下一动作 |
| --- | --- | --- |
| FIX1 01a1682d-0a26-7522-b2b2-4446d904a7b7 | 新#1272 FIRST6394942921第1项，固定ab34bc79b6168cd87c419ce025eb899a5149dbd7 | Root已正式派实施；独立managed树plugin-directory-publisher-views/goalboard、feature/plugin-directory-publisher-views，已核placedViews按plugin_id覆盖，正在修不同publisher同plugin_id串键，仅目录组合/映射hunk、必要测试及同一w5-06 spec，不改B1信任/权限/内置blocked或冻结源branch。后续第2/3/4项按实际同hunk顺序接，不一股脑塞入。旧0c0f双PASS6393915645/6394074511及17unique90保留，四提前失败屏障未被aab采纳、不转计新头。 |
| FIX2 01a16b08-de51-7cd0-a4c5-d45d89d9cdb3 | 新#1273 FIRST6395033280第2项，固定d97df5ab75fb21dc445d1aea0abf56ea117d61aa | Root已正式派实施：Runtime展开快照丢动态checkpoint拒绝，独立树/仅该生产hunk与真实负例、同一spec；不写原冻结branch。第3 Store持有/reload、第4重复assert、第1unknown-prototype帧说明/用例按当前项双核完成后逐项接，动作顺序仅定点核作者6395103184，不重写顺序。旧1253/7f17双PASS及TEST6394818114补核原FIFO70包自然0、原缺Chrome0pass1skip和119/浏览器各自范围保留，不重跑旧证据。 |
| FIX3 01a16f01-0e2c-7450-a0f8-8ad03f18b32e | #1270 S64引用排版，固定原父9c4866cf；原Claude8ac已实际修同hunk | 原48a页面默认值REVIEW6394170919/TEST6394228720双PASS已释放ac-shellslice2，旧75d已actual35。Root给本S64窄单后鲜核8ac已将RAC357-U1说明移尾、358/359连续，作者未写/commit/push第二份doc，保9c原完整S20红，现已REVIEW6394671655/TEST6394687376仅S64原mutation/doc gate双核完成，源码零第二patch/原实施者Claude8ac，阶段释放；未actual批36不冒整线完成。F7/F4 S07、PIPE S11、F18 SC4不动；不新parser/断言/编号/full。 |
| FIX4 01a16f15-e025-71a3-adac-2e84f0e83fdd | #1254 FIRST6393270921 item1/6393455820；39a444f89b5adf9d585a09f1533aa2611e9c9e71直接b521 | 8files296/-20，作者15files136/正确build/门禁；REVIEW6394281035/TEST6394507027双PASS（独立7/7、作者15files136），已normal push feature/pr1254-construction-cleanup-retry@39a，ebf已实际含、源码阶段释放。同步构造失败公开可重试close，10s有界等候、host.close_timeout结构化日志、真实pending持有owner直到结束，无全局registry。S07准确serial-s07.txt由PIPE收给Claude载体实际同行写；F19只用原ensure/retain，不改lifetime/project-host，不泛占本窗口。 |
| FIX5 01a16f24-7a33-76f2-80b4-f20c55006d09 | #1255 d0→2b的原五项已有限双核；共享库政策已明确，原writer按政策继续新增量 | REVIEW6395342556/TEST6395380639只核原DDL/release gate两阻塞及三建议、96unique1172跨批有效证据，首MCP超时UNKNOWN保留，不给原PR/d0整体PASS。Claude6395368971已明确：项目non-retain/explicit-discard只清本项目数据/KV/绑定，共享Home文件和ledger一律保留，回执如实保留；Home唯一实例停下/连接关后才删，失败保ledger重试。Root已直派原F5做两真实项目/B持WAL下两路径及准确回执/README/spec/S68窄patch。旧2b项目删除接线不作终稿，不能再记政策待定或重复问。共享库最后安装无可信全体来源，回收按明确依赖记BL，不新映射/引用计数；F14组合与carrier Runtime保原窗口，待新固定头直审验。 |
| FIX6 01a16fa8-53d9-7622-8169-0c424357366c | bridge源已固定4e018e1a3cd9961f8f4cb3f4e60dc9e4b8918ab7，单parent2c7feba5a6ea85e81e4a263671fb5e68f536d86a；独立审验在途 | Root正式恢复F6为唯一最小移植source writer，feature/node-storage-final103-bridge已normal push、clean，12files663/-170；原样apply失败两处保留，accepted Hostslice先写mapping。writer/verify/原consumer+wrapper沿5132，Reader仅恢复2c7 ordinary list/read；contract/listAll/package/lock/Memory/Session不改，不混61–101/104/旧42。首types/FIFO build/API仅Node两约定新增/ratchet/docs368通过，8unique68过、SDK-root secrets663新增行过；已直交REVIEW/TEST/C2，原件/tmp/molis-fix6-sdk-final103-bridge-20261025/handoff.md含reader-relative-to-final103.diff与bridge-source.patch。未pack/vendor/main，C2等固定源独立核准后唯一两目录重建/消费，不借dcaa/104 PASS。104本题actualf175/treee794已闭环不变，事后FIRST6395355069零block，建议按RISKS专项行逐项后续，不改变only103过渡WO。 |
| FIX7 01a1710d-f78c-7aa1-8e98-829d787ce44b | #1254 b0a9fddfedbbc540e6e2ea31dc76d3cceba1f67e/直接b521 | REVIEW6394038519/TEST6394110312双PASS，14files98/-266、67unique577分阶段，首超时/基线36保留。已核#1270提交包含b0；原正文段/tmp/fix7-pr1254-deletion-gateway-20261024/pr-body-insert.md及替代S07-close-timeout-proposal.patch交PIPE/Claude同行合成，需同时保F4十秒/pending语义。不是SDK当前writer，不动F4初始化。 |
| FIX8 01a17148-2b8c-7103-ba87-6f49b98b92b0 | 旧1256/dac0c5296775350f2975200154e649e634d38a76双PASS已入#1270；新1267可读性 | 先行5 Host文件1556..a942193a1145b953780c366d52cbd222b986e29d，5files506/-165，REVIEW6394295176/TEST6394393726双PASS；独立AST5/5、4390节点、0诊断/差异，纯格式未重跑应用build/full。后四已固定FIX18最终3ec04da0→9ee51808b61d5dae5d0a50b75b0064d529875d81，4files355/-90，REVIEW6394692370/TEST6394771550双PASS、独立完整AST4/4=3177节点零差异。九文件格式阶段已完整SOURCE RELEASE，两段精确窄patch保留，先语义3ec后格式9ee，旧e386/9b格式草稿不交；共享spec只patch，carrier逐hunk保C2 restore inventory公开名/分类和store扩展，不能整文件覆盖。 |
| FIX9 01a17148-9ee0-7aa0-8719-abe77a09d430 | 旧1256/fe8双PASS已含36；新1266/ebead63db463341e9db52e10c71019c04772b7bc，父7c0a79eccd3f8e576a5cb2dc48c6f17ba90a24eb | 4files95/-9，REVIEW6394356892/TEST6394549054双PASS，作者9unique85、独立真实delete关闭2/2为子集，原6/8红保留。仅Host.currentProjects现成closing投影与私有回调，未打开/新项目保留，无新状态/API。源码阶段释放，S70同行patch与真实包含/组合full仍PIPE→Claude；聊天已由Root归档不冒actual。 |
| FIX10 01a1714d-f6cf-7281-bc10-78e9b061d754 | 66de117876fe8ee8d8fb12303ee0069ab1cc1eb3/父927 | REVIEW6393600983/TEST6393921689双PASS，69/69及三受控漏扫红均核；只test+slice84/-3，未降门禁。已被aab采用并随actual3817落地，00a降阈值已撤回；只结此片，不结整批/整线或全部英文UI。Root已归档该专项聊天。 |
| FIX11 01a17156-c6df-7652-992c-f6dc06d6a8f0 | 1651a529905ee51027141d40c5cc1d21b30406e2，链fe8→72→1651 | REVIEW6394104371/TEST6394154186双PASS；6files287/-8、最终5files46同批过，72微任务取消红保留。singleflight/60s cooldown/已结束不新刷新、在途凭据维护和共享origin/OAuth scope说明齐；await后同步signal检查防微任务窗口。#1270仅已含fe8，1651后继尚需Claude吸收，不重复取fe8；carrier-excerpts统一S69/S70，原1256共享核心full不因本增量full=[]免除。 |
| FIX12 01a17157-8ec9-7081-9934-89e0c2741611 | #1265最终56d3b6e5cdcdb2ac9918d0b178f9ce086057f7ec，原1257基点27d | Claude6393559237方向已定；最长前缀/互前缀、owner.files同一插件才收、平台前缀和混合拒绝已实现。REVIEW6393870264+6394075327/TEST6394122948双PASS；13unique531复用有效证据，最后7行只校准实际Shelf.files位置。源码冻结释放，当前56d CI按新头核，不继承旧6134结果；计划批37不算实际包含/合入。 |
| FIX13 01a17159-48df-7d02-b6f0-9e627622eed0 | full36 B/Claude FIX21实际映射本F13，从cd400真实撤回依赖实施 | 原6431双PASS且已入36保留；8ac坏库吞错P1 REVIEW6394580457已由原Claude cd撤回。当前原writer实现私有Home库错误身份的fail-closed页面/API：GET不可用kind经SDK共同错误响应，其他同码/同消息错误原500，写/动作/授权严格拒绝，不伪造Goals快照或重新派生已撤回插件。直接20/20；有限99先43文件42过376项、beforeEffect Pages-revoked15s超时原件保留；仅停本人确切PID的有限批次及本人未启动排队，非full/他人进程。必要build04后jobs2完成剩余及受影响61固定清单，未最终固定交付/独立双核，不能记全绿。 |
| FIX14 01a1715a-561b-7bc3-ba7d-be3d5de076d9 | #1256项目解绑c6c450f40f4187abbb9ccd73f88c9ad50b1ba3a2，scope352c64e0..c6 | REVIEW6394245137/TEST6394305021双PASS，5files133/-2（3prod10/-2）、normal push/clean、70unique664分阶段有效。首installed21/22超时与同头/clean352各22/22保留，因未定。只取f9f10c599→de5f9e85→c6或scope patch，不整取352；#1270尚未核含。组合forgetAgent→FIX5 !retain discardInstallationOwnerData→无retain Connector，保home:null/keptDataDiscarded；BL596 Home最后安装仍原owner。 |
| FIX15 01a17189-e0e1-73a2-8a22-5723aa84cf69 | full36 A+D 83fc69b91ba47b4f5b00db13169eab565e67cb5f/父ebf已双PASS，Root已归档该专项 | REVIEW6395225354/TEST6395306682齐，独立八原完整文件单次jobs1 8/8、32/32含父项、零fail/cancel/skip，source=build fef9825a…；作者原18批13/18（179/184）与controlled5绿及原full36红保留，不称负载根因/同批18绿。17paths251/-158，生产仅connectors tuple前移2+/2−，F4 lifetime/owner不动，对main继承class红由carrier9ec现成修复保留，不倒算本候选health绿。PIPE6395337315已正式交Claude唯一吸收队列，原SQL d368双核不变；剩余真实包含/full/actual由PIPE→Claude，Root已官方归档不为回执唤醒。 |
| FIX16 01a1718a-8840-7d31-a73b-568b29cb2178 | #1268 da50d106216322043b2a7d05c3498e16bbed5f1e/父93ba，code ba1a06bb1 | REVIEW6394197353/TEST6394507263 Mac范围通过，Linux待，3files164/-13；Mac4files33零skip、两真实错误名/旧fallback受控红、正确build/门禁。生产链extractUploadedMaterial→extractHomeMaterial→native→Node助手，无新API。Mac独立扫描5+helper1与作者33重叠不累加39；Linux未实跑：Full整文件darwin分类跳过，probe仅nightly/workflow_dispatch；请Claude当前Linux环境点跑RAC-427: the Home extractor或给精确同源原件，不改selector/CI/平台说法、不另full。 |
| FIX17 01a17190-8ef0-7472-907a-5f3b64f3ccbe | #1269最终f56e0e987e115285fc9577ee8a067cfd055eb06e/父5be32d0f03265e029b419bf6c3d0920e6a17e866 | REVIEW6394342412/TEST6394538440双PASS，6files119/-25、normal push/clean/非Draft。126unique1927有效0fail/cancel/skip，独立13为子集不重复加；旧5a宽拒15失败与父/新23/23原断言对照保留。真实catalog Manifest与既有project_rows删除owner同源，复制同id/name/bundled不豁免；无既有可信owner两入口schema前拒绝。源码/build1d1一致、整体/70boundary/MBhealth/secrets/27assets齐，candidate无CIchecks/status不据NoCI直接合main。正式SI编号/行/test:security纳入仍Claude carrier实际写后核，BL619/PLIB03保真实依赖。 |
| FIX18 01a1719e-b78e-7182-b721-dcca8c1b83f3 | #1267 FIRST非阻塞1/SC4；最终#1271@3ec04da0367e36a3bc7c914bede634142fd837f1/总父1556 | 10files444/-24，9b96→e386坏页/meta表列补typed分类后，又有FK非唯一父键及CHECK函数缺失导致固定PRAGMA抛SQLITE_ERROR的真实红31项25过6败，原writer在固定technical inspector边界收敛（生产8行），普通backup ERROR/IO/BUSY/取消/源版本不变。新7files99/99、build/boundary/health/strict/imports/secrets与源码产物5389cbc一致，normal push/clean；REVIEW6394640018/TEST6394727904最终3ec双PASS、独立50是作者99子集不累加，代码阶段SOURCE RELEASE，已PIPE交6394785689，不把旧e386 PASS6394488301扩过去。SDK24/24@e386、README99/1191与browser20@9b96保未变路径原证据，不重做。F8最终四文件3ec→9ee完整AST双核齐，按语义后格式一次合成；SC4只patch/最终carrier文档门禁待，SDK来源/完整C2仍各自未完。 |
| FIX19 01a1719f-51af-7e22-ae84-ea6790e94ea7 | 普通/CLI34b双核后，最终purge1dbc5de080a4401d4ec83be75da80a66cafd1302已normal push；parent34b/总父1556 | 34b REVIEW6394612061/TEST6394807993、62unique557与原14变异保有效范围。最终13files322/-47，完整16files752/-32，公开6395238413；REVIEW6395260782 PASS/TEST6395365165有限功能核收；独立首12结果9过、S06原15s未到barrier失败保UNKNOWN，唯一原限S06复验3/3，去重12有通过证据，不冒整文件/首批全绿。代码与有限核收已交carrier6395294516，leaf health引用缺口仍真实待补。按Claude6394555141及Root空SQLite+EXCLUSIVE/WeakMap原协议裁定，busy保计划、同inode四锁骨架、未知root/config/bin先于一切效果拒绝、非空WAL/嵌套变更仍stale，实测新Home重开有效。entries首18/19与旧CLI原限单独1/1、未知项4/4、旧回归及inspection修后4/4分别留原件，不冒首批全绿。build/source f4d09c9b…相同；最终staged-health自然exit1仅公共SI缺entries引用，不能记PASS。窄S07/S12 patch已PIPE6395294516正式交唯一Claude carrier，只抽新增语义/引用保F4/F7/C5现行行，不整行覆盖1556；采用后验health/适用security/full/actual。 |
| #1274重启专项 01a17224-396a-7ea2-aed3-ef5359eaf305 | #1274 FIRST6395275510三意见闭同一客户端入口，固定4043ae2ff2d184b5e9390c428982c3a5eb0373d2 | Root已创建START，gpt-6.1-sol/max；独立pr1274-restart-origin/goalboard与feature/pr1274-restart-origin，真实writer已读回。仅initialization.ts重启click/必要宿主占位、客户端真路径与伪造/409负例、同spec§4补卸载状态；不碰F1§3/Pages/预算/冻结源。Claude6395341046已合本地37、+541B一次性预算放行，writer不改门禁；PIPE公开6395365701认领，固定新head后原REVIEW/TEST直接增量。 |

**原927 full35历史证据**：run40159810466/attempt1自然FAIL，TEST6393499386；1422−29Mac=1393 Linux唯一覆盖，1379文件过/14未过（13FAIL+1双900s超时），15首轮未过中1retry恢复因未定，8成功文件另14项未计过。原件/tmp/molis-verify-2026-10-24/full35-run40159810466-test/。新aab/run40166367597另核，不改旧结果、不从queued总状态推worker未起。原本机3文件20项的No projects matched构建不认证最终源码；对应fresh CI20有效。原1242约170已定位候选18/21/138分批raw与build4，两个首败/后续恢复/源码闭包仍待TEST，具体补交6393881173，不机械重跑170/Mac29。

**R47当前合同与一次交接**：最终ce90撤HTTP workspacesFor/Catalog直读，可信projectCallCaller(local-host/user)在同operation经actions.client读browsingWorkspace；成功query不留行，实际失败/缺登记actions.missing有真实诊断及同号。FIRST/最终REVIEW已核原严格断言；0c0f提前失败屏障未采用。PIPE更新1258正文只改元数据，不动full固定源码；旧双writer WIP/作者证据保留，后续mustfix明确唯一owner。

**原1255四十文件已找到**：原ac-sandbox-sched贡献保留；/tmp/molis-pr1255-original40-origin-20261024/含bl490日志/清单/build3/source audit。CLI27334/27358/27379可追e2dcc505→d0仅API快照一行，40unique621/622/natural0，network6/7未计过不冒全绿；TEST已核可继承d0，不认证新FIX5候选，不再催重跑40。其跨项目共享库范围只6393304647待原Claude，其余独立验证继续。

**C2真实阶段**：非Draft #1267@1556，S三提交60路径/对main125含父，不能整树覆盖carrier；原TEST6394205854仅快照/349ad接线，95unique750/753、Studio同bde TLS/400与2optin保持范围。restore独立树后继仅文档checkpoint，生产仍固定79a18623/源码与dist920cb65a…，F18语义后九源码格式AST9/9、12文件133/133仅工程局部，Memory资格/合法空态与完整正常restore仍缺。C2唯一包/采用writer，actualmain dcaa参考包已REVIEW6395121630/TEST6395133207双核：1372468B/SHA70fdb767629af9a0b7a325b6d15d6fc1482a7ae693152ba54e205e6ac566c828，整包同5132；未vendor/lock/正式来源。Root已接受Claude现行窄WO6395049480（由其引用人类弹窗，不冒Root/PIPE亲见），PIPE已直交C2隔离2c7feba5+#103定稿6523..5132两目录同字节过渡源，不含61–101/104、不用旧42。原样apply-check两处真实失败后，F6唯一源已固定4e018e1a/parent2c7，独立审验在途；C2两份base离线依赖准备已0，不改源，固定port核准后才双目录build/pack，dcaa参考包不证明过渡消费。旧main adapter30诊断与1064已有迁移方向按整体main采用线保留，不拿#1267窄包取消原Memory责任或启动仅建档索引。正文记录两过渡风险/不触发前提并核真实既有消费，shared hunk保inventory名/分类/store扩展/readonly wrapper；完整C2/真实Home/本人验收未完。

**C4/C5分开保留**：PG095 #1263/eb01 FIRST6393600544/TEST6394049620已核入36，privileges实际carrier位置/包含及actual后才结，旧OAuth C4三WO原文独立保留。C5原作者按Claude6394070792/Root合同在独立bb树实施RAC625–629；真实安装重I/O91s已跑6/7，management健康发现launcher漏WEB_URL，窄修已build并按原240s/FIFO复验，不称flaky/不放宽时限。Root明确原C5本树最小叠F19固定34b CLI guard+对应gate后落实已审v2 MCP约束及反例，原作者已只抽3文件窄依赖并apply-check通过，等本人当前实装自然退出后顺序apply以保指纹；保CLI14变异/坏JSON mkdir顺序，不只搬gate/整取F19/purge。公共文件最终Claude carrier一次合，独立实现不等merge，1254所在36 actual后核新base开完整C5 PR。

**公共文档实际writer与待实施**：S07/F4 serial-s07+F7退役网关文案、S11 inventory/publication真实拒绝引用、F18 SC4备份/meta完整性及F19 S07/S12 entries/精确锁骨架窄语义，由PIPE收给唯一Claude carrier在真实合成树一次实际写；不能用旧1556整行覆盖现行F4/F7/C5，F19 leaf staged-health仅引用缺口exit1仍保留。S11窄patch /tmp/molis-pipe-carrier-docs-20261025/s11-row-1556.patch 对1556 apply-check过、公开6394515250/REVIEW6394587497仅文档PASS；F19最终patch /tmp/molis-fix19-snapshot-exclusion-20261024/fix19-security-invariants.patch 已正式carrier入口6395294516，须实际采用后核health/适用security/full及actual。S64已原Claude8ac实施、FIX3只独立核，无第二patch/门禁改动。BL596 Home最后安装解绑仍原ac-kernel/W6实施依赖，F14只project。R51按名忽略已定；另据Root执行回执，人类明确要求后已关闭Cloudflare预览分支触发并刷新核对，旧check仍原红、生产禁用选项保持原状态；PIPE未操作Cloudflare，不扩Molis其他门槛。

**batch36当前载体（PIPE最新主段）**：#1270最新78f15f2e672dfd7a0843e55514c925eb62308071、base3817，未actual。Claude6395356415已合A+D83fc；PIPE鲜API比较ebf..83fc与9ec..78f，两边17路径最终blob逐项相同、0缺/增/变，既有REVIEW6395225354/TEST6395306682可按原范围复用，Root已归档F15，carrier包含不冒actual。9ec的Runtime同义式/623行、F4 39a、cd撤坏库fallback/ada fixture保持。新full40176320950 attempt1准确78f，鲜读queued/null；不从queued推worker未起，不称已完成。F13页面边界尚未含，Claude明确此轮可能仍在该处红，是中间组合诊断不算最终验收；TEST已按同run/head去重直收原始核收，不新full/取消CI。本轮原bb713 full1389/1405、16未过/3retry未知/29Mac/14未执行边界保留。1272/1273已FIRST冻结本地37，F1/F2实施；1274专项已START、1275 FIRST等Claude，最终full/actual各按真实候选核。


**专项聊天归档与责任**：Root当前官方归档FIX3/4/7/8/9/10/11/12/14/15/18/19，源码与约定审验交付后的剩余carrier吸收/S07/S70/S11/SC4/最终health/security/full/actual继续PIPE→Claude；准确ID/标题/恢复前状态见 /Users/yijunwang/Documents/Codex/2026-10-11/bang-w/work/molis-work-status-maintenance/collaboration-cleanup-20261025.json。F6曾为104闭环归档，现因具体bridge源依赖正式恢复活跃，4e固定源独立审验在途；不是当前归档者，不另派源或第二包writer。F19 leaf健康仍真实仅缺SI引用，归档不写leaf通过/full/main。常设与其他在途owner保持，不为回执唤醒/删树/分支/PR；具体返修由Root必要时正式恢复。


**新叶片FIRST与真实接单**：#1274/4043 FIRST6395275510已可合并Claude6395341046冻结入本地37，三有效nonblock已Root派唯一重启专项，PIPE6395365701公示，不重复派。#1275非Draft83e57621df55b5e0d9443fb6ae4909b25cdb52ff叠1274，PIPE6395366125唯一登记Claude FIRST，未Codex重复首审；正文400000→1000000输入与统筹D3差异须Claude具体裁定，V18按现行Claude(b)owner，不另建writer。整叠层/共用预算最终carrier一次落，计划入批不冒actual。

**当前修复单（统筹 10-24 晚，下一批 batch-34 用）**：`ac-review` 一轮六个都是「可合」，没有挡合并项；下面的不挡合并项请在原 PR 上修完再二轮，修完的进 batch-34。页面资源、`baseline.json`、S 号这些共用文件不用管，统筹在批分支里一次处理。

| PR | 一轮评论 | 要修 | 二轮 |
| --- | --- | --- | --- |
| #1228 | 6387362602 | 提供方 id 常量与权限来源；RAC-339 证据范围 | FIX3已修固定 `ed3985f188856e829fd5233aa23ada80cd8a26b5`；二轮6388105405、TEST6388119074 PASS。Assistant线程本来需model:invoke，原“多给”仅该子结论不成立并保留实际权限；旧Search fixture只迁合法身份。80唯一文件706项有效，CI40121335561/最终批仍另核；源码释放后FIX3按Root转#1226 |
| #1226 | 6387391426 | settleReview保readDecision的this receiver | FIX3固定1d400d25408544e5ab28c645630fcfe80afca4bb；二轮6388570552、独立TEST6388762185 PASS，旧1/3→新3/3、README19/24唯一文件180有效。新CI40125046945十四成功/probe skip，两Product206+205首过，CI合成b37=bde+1d400，不称裸树same；已随#1241固定931实际df552落地，1d400是931祖先、source03:19:10Z已closed；原full/审验证据沿用，不关R38整线 |
| #1229 | 6387428971 | `translation-check:467` 的过时注释 | FIX2固定 `c2a66516784bb1c6341ccecdd2b6eec5de343bc4`，仅注释+2/-1，断言不变、去注释JS逐字相同、语法/diff/secrets0；二轮6388272667 PASS。整个Workflows原PR待最终批，不能把注释修复当全PR已合 |
| #1232 | ac-review6387465387 / Codex6387505760复用 | 页面真实DOM负断言与灵光已minify的served源码检查，文档范围写准 | FIX4固定 `887b8ee76361289cd46eec27a0e85569776c5243`，二轮6387989321、TEST6388063111 PASS。实际词只在i18n脚本，3种真实UI变异仍拒绝；灵光保内容/字节23209一致。原首败保留，未改生产/门禁；整条#1229→#1232进最终批。FIX4已转#1239 |
| #1230 | 6387490072 | S-54补RAC-463；opened失败能重试，缺能力不误播空workspace | FIX1固定 `c887e11c985632b1f5add9a3f83a4dd503bf0f8d`，二轮6388234113、TEST6388250799 PASS；修复真实3红→新8/8，62唯一文件563项有效。仅S54引用、不动drain契约，CI40122537049/整功能最终批另核；FIX1源码已释放 |
| #1227 | 6387370902 | 无，直接进批 | 不需要 |
| #1238 | 6388105657 | 同文件三catch按真实正常/失败分类 | 已actual `584112c65477baf907620d86657d1582d92e9eda`（20:04:11Z）；固定55fc，二轮6388469609/TEST6388652106及6388806251、README56、CI14适用成功。6388851739一次正常queue40127689372/Verify120973494565成功；parent87eb/treec93216c3=真实merge-tree，四源路径actual零diff。6389021706已公开闭该片，非C1整线完成 |
| #1239 | 6388031418 / 6388049535 | B2b用途隔离/全批限额/严格原后端恢复/S12 | 固定 `5e1d8a29156509d6fc51f75fd5bcc17316e3f225`；REVIEW6388795634、独立TEST6388887188 PASS，17唯一文件112项/README15核齐，CI40126669798十四适用成功。用途AAD仅Home payload，vault无AAD原读不变；全批32MiB/10000节点/128MiB密封串、严格原backend恢复/S12已核。Claude6389034355认领batch35/分支冻结；四共享文档hunk已释放供C2 A，两个index/Host README本轮未改。旧b9首败、006/Keychain范围保留；storage/full和actual仍待，不关闭C2。 |
| #1234 | 6387698407 | P1/P3首轮全部有效block/nonblock | FIX5固定7cfff92a06b80655c9f823f2954498c5c73c98f3；二轮6388064603/TEST6388103144 PASS，17文件175PASS+1可选公网skip/3真Seatbelt。broker停/双目标取消/Host客户端拒绝与S20引号红绿有效，source RELEASE；batch34/full/实际落地仍待，不关整background |
| #1240 | 6388577861 / 6388582397 | 坏launch_args不能卡删除；写侧强转同PR修 | 固定 `2fcb3d63cdf8cfae08c09969ebeee0f552b22d99`；二轮6389023445、TEST6389093483 PASS，旧8绿/26新红→核心34/34，123唯一文件1856/1856、README65齐。owner窄listIds不受坏launch_args阻断真实项目删除，原坏读internal500保持，非法写input_invalid/400、HTTP去强转。Claude6389034698认领batch35/冻结原分支，不独立queue；实际合入前不闭。 |
| **#1230 / batch-34（最先）** | Root6389607111 / Claude6389627934、6389876982 | 真实fixture目录装配，无编号隔离 | 固定9a（parent838）已交/REVIEW6389913998、TEST6390005914定向PASS；已由Claude与672/main0a90吸收入carrier931/唯一full40135252991，当前不是待吸收。机械REVIEW6389956493固定931 PASS，新full/Linux6390355377+Mac6390628942核齐，6390676409交唯一Claude接队列，旧失败保留，actual前不闭 |
| #1242 | 6388960738 / 6389022716 / 6389020927 | C4旧registerCapability、R8状态/身份措辞 | FIX5已正常push固定 `b86b01c980effc3eeddf5d731766e83d9a668368`，6c..b86仅两md+8/-9；二轮6389157109、TEST6389150085文档增量PASS。实际registerAction接线、R8待批状态及HostCapabilityDescriptor身份/__types__措辞齐，旧名不恢复。Claude6389189085认领batch35，原源码/full证据边界保留；未actual不关PG035。 |
| #1243 | 6389004397 | PG056/Shelf两处活文档引用 | FIX4已正常push固定 `3a3248f784a6b782204a1ef8c7d19d1f5ff35b69`，9c..3a仅两md+2/-2；二轮6389159203、TEST6389150305文档增量PASS。真实路径为specs/repository-anti-corruption/privileges.md，仅PG056一行和Shelf来源；整PG仍未完成。Claude6389189534认领batch35，批内BL545/546与clientServed名单由其统一。原133/browser raw仍待核、TLS首败UNKNOWN，无同断言基线；文档PASS不代整PR/full。 |
| #1245 | FIRST6389170966 / 二轮6390234023 / TEST6390259895 | Attention owner/null完整补修已定向双PASS | FIX5已一次normal push固定e34b9130681e9d803c343d090fb958493d939f85（parentf965），27files1048/-128/source冻结释放；REVIEW6390234023与独立TEST6390259895定向PASS，32unique524是有效并集，安全29+1/首fixture错误、历史7files26修正及四dump原INSERT/v9冻结拒绝都保。真实Manifest owner/两表nullable owner/部分唯一索引/跨owner拒绝与事务回滚、跨null全局status、旧Feed/Inbox/Goals/RSS隔离齐。额外strict helper plugin-actions.ts:27/30/80仍exit2，无old对照，不称类型通过或已证基线；原Feed/Goals其余README/Host/sharedcore由最终组合覆盖。#1250 T1与本片实际schema/CHECKLIST/currentfixture/四history dump+README/维护索引冲突，carrier保trust+owner字段索引、统一版本和S66，不选一方v10或两次9→10；/tmp维护演练不是真实备份/维护，S9-2/调用方迁移/full/CI/actual待。；固定候选交Claude6390618803 |
| #1246 | FIRST6389185183 / 二轮6389944823 / TEST6390116338 | 重装先清理完整补修双PASS | FIX2固定d42891e3ff19449b01ab181279b35ab20c2617cb已REVIEW6389944823、TEST6390116338双PASS/source释放；20files269/-32，真实Project/Home四读/跨重启、先校owner端口→files→KV、完成后才候选注册/世代/save，失败与幂等retry/旧retain=true边界已核。36unique683无文件首败/runnerretry，quiet内部skip/todo不额外称0；指纹1f4d6116与manifest一致，旧80/661另保范围。FIX2已Root接旧1112三P2新题，d428仍保本题后续mustfix；当前作为固定candidate交唯一carrier，T1安装trust与1245 schema/维护同组真实hunk合，sharedfull/适用CI/actual未齐不闭Runtime。；固定候选交Claude6390618984 |
| #1244 | FIRST6389229048 / 二轮6390141133 / TEST6390143106 | 本片已actual52560f32 | 22:31:33Z实际merge52560f32c5dec529315d11eff95932c2ea1d7dff；6390299069唯一正常queue40138486257/Verify121006218732成功10+3条件skip。singleparent0a90/tree0d0b=真实merge-tree，7源路径actual零diff/freshmain包含；公开6390492567，raw /tmp/molis-pr1244-shutdown-streams-fix-20261024/merge-proof.json。作者cold树已官方最终归档，不重复build/queue，不关完整C1 |
| #1247 | 6389207529 / 6389275346 | writeJudgment稳定规则引用已修 | FIX6固定a7f47a3a573b0335437439a41dd68aae20e83732，6files+95/-9已独立REVIEW6389827852、TEST6389846644 PASS；73unique/644各有通过记录、README61齐，原69批66/69+5时限取消/RSS late activity仍UNKNOWN，三原失败jobs1 32/32恢复不冒一次全绿/known-main。Claude已6389853469实际认领吸收batch35/fe86d5cec，index导出冲突保两边FUNCTIONS_PROVIDER_ID/publishedFunctionReference，三包构建已报过；batch35 local-host三type红由其ac-kernel当前owner修，不重复writer。新CI40134554188的Security/Product仍在途/Verify尚待，sharedcore/full/actual/PG034仍Claude，source冻结释放不再推。 |

| #1248 | Claude FIRST6389394182 / TEST6389383644 | SYS15刷新前真实Back/两行可见 | 已actual `0a90a0ef2be7968e4c9bb41d1713f00e558444b8`（21:30:31Z），固定2eb60f7fca2faedc3c86f77594dd529a99ace0b0。FIRST6389394182/TEST6389383644、PRCI40130360806/Verify120987412283齐；6389709064一次正常queue40134060985/Verify120992960162成功10+3条件skip。单parent584/treee7d5776ebeff4eac03991aeac827aabc0a40e278=真实merge-tree，整个源→actual零diff/fresh main包含，6389793900实际闭本测试修复；非Full33唯一根因或整Cognia完成。 |
| #1249 | FIRST6389735163；二轮6389854349/TEST6389873756 | Gmail纯拆/等价目的注释已修 | 固定修后516bd00d3c4aa349fb413634034001fa0bc32987（parent87a），FIX3仅四行测试等价注释；原FIRST6389735163唯一nonblock已落实，REVIEW6389854349、TEST6389873756窄增量PASS，source冻结释放。移除4行原文byte一致，原115/91300d94工程证据绑定87a继续有效，不改称516重跑。CI40134883070新头在途；Claude已6389882200认领吸收batch35/cca312d89，full非空、公共生成物组成树统一，未actual不闭来源/C3/C1。 |

**Full34实际落地（精确931）**：#1241固定93176d8b596a9db2266f93490e80acd8b9f487d2已于2026-10-25T03:16:55Z squash为df5527f278fa8e631919794d15c52cfd3f364155；PIPE鲜读PR merged=true/closed、main ref同df552、Git commit单parent52560f32c5dec529315d11eff95932c2ea1d7dff，tree4f4153fcc9fb1027ab71613d4d82ea8112a665be与6390676409原已审试合树完全一致；实际parent→merge compare207files。8个精确来源头1227/5bdd、1228/ed398、1226/1d400、1229/c2a665、1232/887b、1231/bf09、1230/c887、1234/7cfff逐个compare确认都是931祖先，原Claude已在03:19:01–03:19:32Z关闭全部8个（源PR为CLOSED/merged=false，经批落地，非逐个另merge），PIPE未重复关闭/催领/queue/full。原机械REVIEW6389956493、CI40135257938/Verify121001095371及Security/Product成功、full40135252991/aggregate121005086286成功与TEST6390355377继续有效；Linux1407−29Mac=1378唯一文件，1377首过/resident同40:47一红唯一retry12.6s过，quiet skip/todo不冒0。Mac TEST6390628942核29项：25旧39原件/闭包继承+1同树Mac CI+3必要缺项真实28/28，总308/311，1可选联网/2缺shellcheck明确未执行，非311全绿；原首败/旧1b三红及原两CI因果UNKNOWN保留。resident独立6b候选未含931或本实际树，仍双PASS待Claude另吸收，不因本批actual关闭其实施责任。batch35对本批实际合入的真实依赖已解除，其余组合/首评/CI/full/actual仍由原唯一Claude继续，不关完整C1/C2/R38或整条防腐线。实际包含/关闭原件：/tmp/molis-batch34-actual-20261024/landing-proof.json；原Linux与Mac raw路径保持，不重做有效审验。

**batch35组合合同补正（Root核源码/6389783641已传Claude）**：b86 browsingWorkspace仍query，action-call-log70–74成功非command不记行，838已registerAction/actionService；“删typed后动作每次都留行、必然污染首路由”不成立，不能登记为已证产品回归。原Claude carrier可做窄Host内部项目读口：同可信project/runtime、同workspacesFor/Catalog owner+ProjectBrowsingSettings.read投影，保null/多目录未选/撤关联/失效目录及成功每平台一次/失败重试/broadcast-drain；不复制SQL/算法、不信请求project、不向SDK/公开动作暴露绕权入口或扩写权限。无号用例仅限正式装配+内部读成功+本请求无其他实际记行调用时首400/413；真失败/缺依赖/其他实际行仍须号可查、正文头一致。call-scope/formatter/ActionCallLog不改，不用新scope或抑制记录；FIX1不为35预做。合同裁决不等实现/验证通过。

| #1250 | FIRST6390022295 / REVIEW6392993542 / TEST6393061723 | T1全部有效意见修后双PASS | 固定cf63b8e9e50f8e76d7422c96df7488a1e637e3e3，三提交8files173/-10，32unique616原件按代码未变继承，原334 raw边界保留；已真实为35/927祖先，原full14文件未过/未actual。1245/1246不在35，不构成T1本批新门槛；未来36真实共同hunk/项目v10/四dump一次合成，原作者不反复同步。 |
| #1255 | Claude FIRST6392998821：2阻塞+4有效nonblock | Root START原FIX5唯一6393025853，固定d0f6cc53b88930b7ffe5ad016a2f2a34012febb9/base df552，实际修复中 | 原pg017-sandbox-services slice/RAC240–246；修schema真实效果前PLIB03严格预检和release-version动态建库共同生产路径（不改门禁），补真实临时Home Runtime写/停用卸载拒绝/子进程退出、RAC241前后worker零新增及storage注释。retain_private_data=false清库/ledger项由同FIX5先核现合同+1246顺序，现同名选项跨native/sandbox统一目标/本片边界已6393081731交原Claude裁，只有该清理hunk待、其余五项不停；不扩BL377/491/492/P2e/原40文件/full。C2 installed-lib archive只读、project DB inspect与storage显式出口具体hunk不并写；实际需共享helper才局部串行。原1245e34双PASS/冻结/原carrier责任保留，无第二writer/首评，固定后直REVIEW/TEST/PIPE/Root→唯一Claude carrier/CI/full/actual |
| #1251 | FIRST6390053800 / 二轮6390380705 / TEST6390400572 | 四项修后双PASS固定候选 | 固定267ffa225ea1630fe3a9a50bf34559068ce2f4c5，7d..267共9files42/-38，REVIEW6390380705/TEST6390400572修复增量双PASS/source冻结释放；16unique122首次全过/0skip或retry，公开指纹56c4b309与实际manifest一致，首次冷build并行boundary失序原件保留/正式串行boundary等通过。四项文档、真实跨包store→purge保异项目、删无用module声明出口、consumerTypes合现schema、递归576TS/153nested齐。原123三类失败/作者环境或known-main归因未认证，3browser未跑及full仍交carrier/TEST；原raw请求6390190399。最终PR正文已Root交FIX6仅metadata重写且实际fetch读回逐字一致，去已删文件/纠正归因，无源码/CI重刷；当前mergeable=true不取消batch真实hunk/同headCI/full/actual条件，C2 argv/Host/A6未动。；固定候选交Claude6390619194 |

**#1255 FIX5单一修复合同（Root START，非第二首评）**：PIPE已鲜读d0f6cc53/base df552/非Draft与一轮6392998821，唯一实际公开claim6393025853归FIX5 01a16f24-7a33-76f2-80b4-f20c55006d09，独立managed树实施，准确新路径待作者交付，旧1245 e34不重写。六项逐一owner均FIX5：①沙箱不可信Home schema在真实库/ledger/库外文件效果前复用PLIB03，真实拒plugin.declaration_invalid且三处零副作用；②经已有生产建库共同路径消除verify-release-versions动态openBaseline红，不改门禁；③真实临时Home Runtime安装启动写入、停用/卸载后拒绝与worker退出；④不留数据的Home库/ledger残留先核现合同和1246 d428先files后KV/清完才发布，现已核native同名选项也仅全局purge，不能把建议直接做成永久sandbox例外或自行全native迁移；具体统一目标/本片统一账本内两类或先新增路径并明确native owner下一步，已6393081731交原Claude裁定，仅该hunk等待，其他五项继续，未记问题关闭；⑤RAC241拒绝前后本次worker严格零新增/零泄漏，去弱<=1断言但不放宽产品；⑥openHomeSqliteFile注释按现行读写可创建行为修准。实际新hunk：C2 installed-plugin-libraries只有snapshot读口抽取/readLibrarySnapshots+installedLibrarySnapshotsFile，live opener主体未改；C2 project-database仅archive inspect+recorded/assertRecorded复用，PLIB03原inspectPluginProjectSchema未改，FIX5优先sandbox入口复用原口。storage/index显式出口carrier保双方；具体同helper才局部串行，不停整包。C2必要build已释放后FIX5 ready按公共FIFO，未起重复full/browser；原40文件有效证据保留，修后固定head/spec/diff/raw直独立REVIEW/TEST→原carrier，未修复/复审/验证/实际合入不闭六项或整PG017。

**1245/1250实际四dump同hunk（Root核过，已补6389738857）**：tests/fixtures/goal-event-history/{legacy,mixed,approved,approved-completed}.sql及README双方同改。FIX5仅同步Attention DDL/两部分索引/候选版本，历史业务INSERT、独立v9拒绝样本、helper/生产/断言保持；action-read-compatibility四红为静态v9被候选v10严格拒绝，未证读取兼容回归。唯一carrier合成时保T1 trust+本题owner两套字段/索引并统一版本，不任选一方v10盖另一方。

| #1252 | Claude FIRST请求6390137797；TEST6390184579定向PASS | C3横向四单元完整区 | 固定8abab965c1f75bfb1ae1f695530a5d1a1312309f，15files533/-412/source冻结，实际4→0/API行为保持，28unique205作者与TEST核收，原/变TS2339只补n类型；full spans4packages/两非直接browser与selector未跑，首评/CI/actual未齐不记Ready/C3完成 |
| #1253 | 作者已实际FIRST请求6390374472；TEST6390447468 PASS | 旧1112三P2完整新题/原FIX2 | 固定22537bd078fabda259b751d18134b287b42be55e（父0a90），6files70/-10，elements60/ui109构建期范围、PG060映射→RAC84、真实Files侧栏冷/热合法目标选中；7files119作者证据/浏览器2case有效，未改prod/ID/权限/BL388，原1112不重开/不重跑六图；首评尚待/TEST6390447468 PASS，CI/actual待，不关闭PG060整线 |
| #1254 | REVIEW6391028363 / TEST6391043853修复增量双PASS | FIX4本题source/独立阶段释放，固定候选已6391059350交Claude | b5211d8a5b9557783710ea7574a5e6d26751701e/direct19cc，8files290/-44，原P1本增量收口；真实持续两次退订失败→明确close成功/父与另进程锁拒绝保持→合法再开与同inode重取成立。30unique208非一次同头绿批，原首败保留。精确b521 CI40143551496已completed-success/14success+1可选probe skip，Verify121021156673及Security/Product两片均过；完整A FIRST/原117/统一full/actual待，非Ready。C2独立snapshot继续，可纳修后A具体hunk；Root可接F4下一独立题，旧题mustfix责任保留 |

**#1254 修后双PASS固定候选，完整A首评/集成待**：FIX4一次normal push原PR为b5211d8a5b9557783710ea7574a5e6d26751701e，direct parent19ccdfa8ed41fee58038e9cedcd43abf3f48e65d、准确merge-base bde02c59；PIPE鲜核远端OPEN/非Draft/同头/未merge、本地clean，8files290/-44实际diff与final.diff逐字匹配，整PR65files2090/-340。公开交付6390986767/原P1 TEST6390714218/唯一claim6390715632。初始化Promise从创建保close，失败实例仍可显式重试待清理Set，成功资源不重复、全部实际关闭才还borrow/owner；Host持句柄接dispose/下一显式ready，已接纳ready保原结算/关闭中不注册或替代，Memory先SDK未改。仅两生产文件prologue-node/agent-host-composition，未改storage锁/snapshot/CLI/SDK包/门禁/baseline。原公开探针19cc真实exit1；相同故障修后退订2、合法再初始化/关闭/父释放/owner重取，6新例/真实Host并发与跨进程同inode原件已交。首30为29/30（真实已接纳ready契约回归，未改原断言），修生产后8files50/50；30unique208有效并集，不冒同头30首全绿/环境归因。原build/strict/Biome/70boundary/准确MB health/0of1431混载/27资产快查/doc/最终70冻结/提交后2110行secrets等原件齐；digest3dc3cbdb10962d8745056dc92c3c6a0294951b4fb56c06293c5e779bc04dcdcb匹配manifest。REVIEW6391028363/TEST6391043853已固定b521修复增量双PASS，本题原P1 6390714218在本增量收口；TEST独立同故障连续两次退订拒绝后明确close退订到3，父/另进程拒绝仍保，下一SDK正常/父release后另进程取得原inode，模型0/exit0。已6391059350交Claude以当前固定b521接完整A FIRST与唯一carrier/full，不把请求或修复双核当完整首评/actual。精确b521同头CI40143551496/attempt1现completed-success：15jobs中14success、原可选Linux probe 1skip，Verify121021156673及Security/Product两片均成功，原末两job121020084173/121020084206已success；已补原候选交接6391059350。完整A FIRST/唯一carrier-full/actual仍待，不因CI绿列Ready，不挪原19ccCI。原A369分阶段/live/Studio/类型及117建议/Claude完整FIRST与唯一carrier/full/actual仍待。保有效树pr1254-init-cleanup-retry/goalboard@b521供核验，source/公共槽已释放不提前归档；C2独立snapshot继续，后续仅组合本8文件相关hunk，spec保其开头/完整snapshot合同，不能整文件覆盖。原件/tmp/molis-pr1254-init-cleanup-retry-20261024/handoff.md。

**C2本地checkpoint（非完整snapshot交付）**：原实现2已本地固定4f7e95c2f8a6e2358fba55ba3d648e5611e26685/directe2d2ea19dee474bc3aaf788a0c86ba2f06c09c7e，24files787/-28，PIPE实核HEAD/clean/准确stat。内容/I-O/kill/边界与文档已收checkpoint；三份生产增量与先前披露的build4 runtime overlay逐字相同，作者source_digest56d553f5189b4c885ed061da6b358aa3edfee0c16654113cc4df4bb71c8568a7仍匹配，新测试strict0/health merge-base5256/secrets5062行原件过；加强SDK正文不外带的content-sdk-leakage-scan.log真实1/1。新增security-invariants-home-snapshot-sdk正式已知红保snapshot-sdk-current-red.log，Node汇总21含父项=4pass/17fail（非21独立场景），当前缺公共零写认证及合法metadata/key误拒仍未修，不混入首104或e2d窄通过。无新PR/换vendor/full/SDK入口搜索或催领；下一实际接SDK公共能力并完成S，restore RAC107/108仍本C2后续。A carrier只吸e2d两fixture候选，不能吸4f/整snapshot checkpoint；原A FIRST/full/actual与整C2/真实Home验收不关闭。

**C2恢复裁定已准／SDK外本体Root START（未交付）**：先前本地d8c8bfd1e2890c3f1627ce37123d002f8d86fdb5/direct4f、唯一slice+91行仅是已核预案，静态health不是产品恢复验证。Root现已读方案/关键实现并直接裁定原实现2先在同spec落决定、实际实施SDK之外独立restore，不等SDK所有代码停工；未有新固定实现交付，不写成已实现/完成。R-DEC-1已准同一个SDK只读认证操作支持归档storageRoot与原Home对应keyRoot分离（snapshot可相同），两者由已核registry/Home映射给出；原AEAD认证真实归档，零mkdir/mint/claim/Runtime/正文-key输出，不复制key；增加live坏/归档好与live好/归档坏对照，原多kind/页/空正文/墓碑/no-sealed-no-key/cancel当前性合同保持。R-DEC-2已准一份持久journal+同盘原件区、同lease/inode，提交前rollback/提交后finish、pending正常入口拒绝。R-DEC-3已准原key/可核同安装物前置；Memory无法重开的合法空/absent快照必须预检安全拒绝，但明确仍是未完成能力，不能据当前实现限制缩小完整恢复验收。最小目标投影复现已出且Root/PIPE已核，Memory独立owner依赖见C2-MEMORY-EMPTY-RESTORE，由Root组织真实认领，不自动采用Draft/删key/拼旧业务。SDK接口名由本窄题唯一FIX7 owner按SDK惯例定，实际入口已由一骏新指令“你来，不在这里”解决，Root已START专职01a1710d-f78c-7aa1-8e98-829d787ce44b；仅SDK认证调用串行，A仍只吸已双核e2d，不吸4f/restore树、不加新SDK或恢复依赖为A门槛。公共冲突/生成物/统一full/actual仍Claude原owner，完整C2/真实Home验收未关。

**snapshot实际组合与SDK key实证缺口（Root裁定已定，SDK公共依赖待补）**：实现2snapshot实际组合6ef2ad3148ef060ed2722dfbc654716529f2812d已包含修后A b521（PIPE ancestor核0），作者build3/CLI2/SC4严格10与有内容owner-WAL1仍阶段证据，未新PR/full。有效长度错误SDK key仍snapshot=created、原SDKreader=STORAGE_ENCRYPTION_UNAVAILABLE的原件已核，不能只验key文件SHA。Root已明确要求真实密封认证，并允许agent-host唯一SDK owner窄只读包装，不扩A生命周期/Memory业务/退役Sessions正文；现在缺的是SDK可消费公共合同，不再待泛权限裁定。PIPE只读核Memory #1101精确e7da727a98b0a268f48be5343e2486d1e3376f13/Draft，实际memory-p0归档由固定git blob解析、1,378,953bytes/796entries/SHA f46c51b37dc71b6d0f7b07abdd9ad59c627253b8459c007f40c093a9f549d36a与provenance一致，源4ac8d7d；SDK #102当前核到0b33ad1仍Draft，reader同4ac。已有私有NodeStorageReader(existingOnly)不mkdir/mint/清claim、不需leases且原AEAD认证；但未公开，openNodeRecoveryInspection强制Memory管理policy/context/authority并仅许一个App kind/拒SDK owner分隔符，现Molis Memory wrapper只previewCleanup，不能当全SDK检查/整取Memory Draft。最小公共缺口已直Root/实现2：沿现有SDK #102/codex/memory-recovery-inspection实现线提供（GitHub作者不当作执行入口；现已由人类新授权FIX7 01a1710d-f78c-7aa1-8e98-829d787ce44b唯一落实此窄题，见下WO）一类单次verifyNodeStorageContents({storageRoot,keyRoot,assertCurrent,signal?}):Promise<void>，复用现有reader/枚举/逐密封认证，不返回正文/key/任意storage口，缺错key/坏密文拒绝、合法空态沿SDK合同、缺可重建leases不误拒；具体名称仍提案，无实现/可消费受控包。涉及SDK reader/窄Node composition/node.ts/public API snapshot与定向Node回归，Root沿该owner组织固定公共合同/受控归档这一明确独立依赖，PIPE未换vendor/推上游/新writer。C2其余storage/registry/CLI/I-O/kill继续，只有认证调用串行；此snapshot缺口不追加为已交1254 A的合并门槛。完整报告/实际归档公共类型原件在/tmp/molis-sdk-inspection-dependency-20261024/handoff.md、memory-package-proof.json；唯一spec交付前写准实际组合，历史2b/19cc/369等证据保原范围，restore107–108/真实Home验收仍后续。

### C2-SDK-INSPECT

Root accepted WO：完整snapshot的必要SDK依赖，真实只读全库密封认证方向已定。**2026-10-25 03:18 UTC实际owner接续**：PIPE已读Root聊天中的人类原答“你来，不在这里”与实际create_thread合同；Root正式创建并START专职修复7｜SDK 归档只读认证 · Codex，local chat 01a1710d-f78c-7aa1-8e98-829d787ce44b，gpt-6.1-sol/max，本窄题唯一writer，已经实际读SDK基线/原合同并向PIPE领取build短窗，不再等待人类SDK入口。因保存的code/prologue项目路径无效，新chat挂Molis Work协作组但只在真实code/molis-prologue的独立feature/ SDK工作树实施，不写goalboard主树/C2源码；独立SDK树已实际建于/Users/yijunwang/.codex/worktrees/sdk-c2-storage-verification/molis-prologue，branch feature/node-storage-verification、基点HEAD2c7feba5a6ea85e81e4a263671fb5e68f536d86a；PIPE实读工作树已在修改Host reader/verification/node公开导出/原Host合同与真实Node测试，该时点尚非固定交付；现固定候选见下，未整取#102领域diff。原SDK #102 / codex/memory-recovery-inspection当前0b33ad130b92cbf9891808c7b0c56d0987114c2f、Memory1101 e7仍Draft；不改/推原#102、不自动接受整个102/1101、不合并/发布/换Molis vendor。索引chat01a16710-5c86-7b40-81d1-7b9d5f0c4cd3保持仅建档，未唤醒或派单；新明确owner替代前轮入口待确认，不重复旧线writer。

公共合同可沿SDK命名，例如verifyNodeStorageContents({storageRoot,keyRoot,assertCurrent,signal?}):Promise<void>。同一个操作必须支持已有绝对归档storageRoot与原Home对应keyRoot分离（snapshot可相同），由已核registry/Home映射给出，不能按未核归档自述选key路径；App已持offline owner窗口；复用SDK自己的existingOnly reader、记录枚举/格式检查与AEAD，完整覆盖所有现行kind/分页及sealed body，含合法空正文和墓碑。成功或既有错误返回，不返回正文/key或通用存储句柄；不mkdir/mint key/清claims/依赖leases目录/启动Runtime或模型/修业务状态，finally收束本操作和内存敏感材料。按真实sealed records决定key依赖：合法无密封记录不凭空要求key，也不能声称已验证key匹配；取消/同步当前性失效拒绝交付。现有existingOnly构造会立即secretKey，list分页cursor也取key，不能只把私有reader导出就宣称满足这个空态合同；由原SDK owner复用并处理此具体用途，保既有Memory权限/领域inspection。

按SDK原spec记录同一增量；先交可独立审阅最小方案/公共合同、scoped diff/固定commit与定向公开Node证据：正确原key且无leases的非空样本；另一合法32-byte错key、缺key、坏密文拒绝；多kind/分页/空正文/墓碑与合法无sealed无key；取消/当前性失效；源文件内容/模式/目录/key/claims保持，零模型。增加live坏/归档好及live好/归档坏的真实对照，证明认证实际归档而非扫live；不复制key，保C2原错key红例，不重审/重跑全部Memory/full，不让无关Memory业务成额外前提。

固定交付必须说明相对C2当前retry-waiting/2c7feba的必要依赖差异、采用哪些原有只读底层、受控包准确来源/验证。当前memory-p0/4ac和整个SDK102变化未自动被本WO接受，更不接入整个Molis1101 Draft。实际vendor替换仅C2同一owner在依赖审验后串行完成，流水线不写SDK/App源码/换包/推上游。SDK涉及reader/窄Node composition/node.ts/public API snapshot/定向公开Node测试；Molis只由agent-host薄包装消费，不扩A生命周期/Memory业务/退役Sessions正文。

现行直接入口为FIX7 local chat 01a1710d-f78c-7aa1-8e98-829d787ce44b；PIPE已将新实际owner直达C2，实现2也已报告直接收到其实施消息。固定SDK增量/必要依赖/候选受控包与真实公开Node证据按原链路直达C2、PIPE、Root及REVIEW/TEST，审验后仍仅C2原owner串行接入vendor，不经Root二次转发。SDK原#102的底层/当前retry-waiting/2c7feba差异必须写清，候选包不等于C2已采用。#1101只原位更新6391558639，不另WO/催领；前轮未定位入口为历史，现人类SDK入口问题已解决。Molis Memory的已采用ledger业务资格与合法absent/fresh受控恢复仍是独立原领域依赖，本次不派给FIX7、不改变原Memory完整owner、不自动启动整个Draft。用户停用Claude UI未操作/重启，未动真实Home/Keychain/模型。

公共build接续：共用/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-work-slots与既有scripts/machine-slot.mjs。FIX7已实际一次SDK定向build/pack单wrapper，作者报exit0/自动释放，PIPE读build-pack.log末尾确认候选归档/tmp/sdk-c2-node-verification-20261024/candidate/prologue-sdk-0.0.0-rc.1.tgz及slot空/队列空；API update作者报0，现固定42ccc和作者Node合同结果见下，独立审验在途，不记C2已采用。后续定向Node/干净消费者不占build/browser。C2接线ready的一次必要App整体build可接空槽；原FIX1按6392849194补T1注释/spec后如有必要build也按同FIFO，实际持有/排队先来先得，不空等对方编码/不抢占/不手工预留/off绕过。C2 CLI/Core已作者报ready并启动独立restore整体build-1，raw restore-build-1.log自然exit1：Host barrel的CatalogDesktopSchema被本次重复导出；原C2 writer已删本次重复项/保原出口并按同槽启动必要build-2（restore-build-2.log），Storage/PluginRuntime首轮已编译。PIPE读首raw确认该TS2300，不归环境/不换第二writer；未跑full/browser，vendor仍原retry-waiting，不混SDK采用build。build-2已作者报自然exit0/释放，raw restore-build-2.log；后续4文件guard/owner/SDK/Host定向在跑、未核完成、无固定restore交付。将先固定该restore checkpoint，再独立Snapshot支线采用SDK并交首审，完整恢复范围不降，Memory仍fail-closed，不记完整C2 Ready；双方必要新固定证据直交，不反复索取回执。

**FIX7固定候选与独立双PASS（C2尚未采用）**：代码42ccc75ae85b138f73e65f81b789ffecdbb05ce3唯一parent为当前消费2c7feba5a6ea85e81e4a263671fb5e68f536d86a，11files544/-167、SDK树clean/source释放；最小运行依赖只2c7+42ccc，不含整102/Memory1101。最终文档头a0e8a76e70bfc49103b3a0abdb1400181f504725/direct42ccc仅host-storage slice5/-3，PIPE实核packages/sdk零diff，代码/包/原source tar及审验不变，另final-source准确保存文档头。准确tgz /tmp/sdk-c2-node-verification-20261024/candidate/prologue-sdk-0.0.0-rc.1-node-storage-verification.tgz，1,252,963B/SHA349ad8987683472d219ef6dffd49d3e98f77dfaf8b95cc5b5b5b42eaeaf77a1c已PIPE重算；双方独立核源tar11文件=固定Git、708→712清单5changed+4added/703相同/0删。REVIEW准确候选PASS；独立TEST /tmp/molis-verify-2026-10-24/sdk-c2-42ccc-test/test-handoff.md已PIPE亲读：新consumer离线实装，只公开Node，17结果含父项全过0fail/cancel/skip/todo/15.36s/网络0，另硬链接key、fulfilled async fence、空ID沿原STORAGE_KEY_INVALID的安全拒绝/脱敏/双根零写及移除后正常认证。作者原8files87/公开面预期首败后4of4与types/build/API/ratchet/docs/quality原件保留，不机械加成全量。原C2旧21含父项4PASS/17FAIL原样未改，未称App绿。SDK窄源码/包/双核交付已齐，原FIX7后续本题mustfix责任保留；已直接交C2待其restore checkpoint后独立Snapshot支线串行窄包装/vendor接入/原App回归，所有reject都失败、不用码白名单漏拒绝，可信roots与离线owner仍App负责。当前未采用，不推原102/PR/合并/发布，不关完整snapshot/restore、Memory领域依赖/真实Home验收。

### C2-MEMORY-EMPTY-RESTORE

Root accepted 独立 Molis Memory owner 依赖，**不是交SDK #102实现Molis采用策略**。实际Memory执行会话/认领仍待现有入口的真实claim，不从作者账号推断START，不另writer/重搜/催领/再问用户。SDK storageRoot/keyRoot认证WO保持其独立职责，二者不互相变成无关业务前提；C2继续合法ledger组合的恢复实现，不停整线。

最小实证已由Root及PIPE读原件：4f7e95c2f/build56d553，真正空snapshot created/0业务文件/0key依赖；同Home真实首次Host启动关闭后，public SDK产生原key；手工构造空归档应得的业务缺席+原key保留目标投影，再起真实Host拒memory.unavailable。key bytes/mode及lock/parent inode均保持。原件/tmp/molis-w5-16-home-snapshot-20261024/restore-memory-empty-probe.sh及同名.json；只证明目标投影下重开缺口，**没跑restore publisher，不能记恢复失败实操或成功**，所有状态是临时合成Home/0模型。

原Molis Memory唯一owner的公共合同必须包括两部分：（1）现行已采用ledger的零写重开资格判定；（2）合法absent/fresh的受控恢复/初始化。二者均基于归档ledger、SDK实际待恢复集合及必须保留key/程序的目标投影，不用live ledger替归档、不把“有v3 ledger”当（1）通过。Root与PIPE实读C2树apps/local-host/src/memory/memory-adoption.ts:27–32：LOCAL_PERSON_ACTOR_ID的strategy-adoption.body.origin只接受new-home/existing-home，personal与project-default两份prefs都必须通过现有isCompletePrefs。packages/storage/src/adapters/memory-ledger.ts:62–65的openMemoryLedger会openHomeSqlite、启WAL并apply baseline；prepareMemoryHome的fresh分支会写prefs/marker，均不是归档零写预检口。SQL读取由原storage ledger owner提供纯读口，Memory产品可重开资格沿原predicate/领域owner；C2不复制SQL、不另定采用政策。最终真实Host须正常重开、原key保留、不拼接旧业务。普通未采用旧Home仍必须拒绝；不准通用allowFresh/skipAdoption布尔或伪恢复投影绕采用门槛。具体公开接口与受控初始化阶段由原Memory唯一owner给最小方案，沿同一restore lease/journal事实，不另造成功凭证、不自动采用整个Draft。

验收：检查归档目标态，已采用且完整prefs可通过；缺失/无效adoption marker、任一缺失/残缺prefs、坏JSON/错格式都必须在发布前拒绝，归档/live/key/锁保持且不生成WAL、库或默认值。结构检查与业务可重开判定分开，不用字段存在冒充完整业务资格。保留上述合法空态最小正例、合法ledger真实Host重开并续写，以及普通未采用旧Home、未知旧业务与伪投影拒绝；原key不删/不复制/不重生成，恢复重试不重复业务。tests/memory-adoption.test.ts:98起已有当前版缺/残prefs的真实Host拒绝回归，本轮仅核源码与既有断言，未新增执行证据。当前安全拒绝仅防假成功，合法空态仍RAC108未完，不能从完整C2中排除。由原Memory owner提出最小方案，Root组织真实owner接续；现有#1101评论6391558639内更新同一明确请求，不发新WO/催领或第二Memory writer。SDK双root认证独立不变，C2保fail-closed并继续其余publisher/owner/有内容用例，不反复要求回执。

Hub实核：本轮27OPEN与7个>100files固定头全页均核。snapshot-sqlite/home-stores/home-store-snapshot/cli-home无PR覆盖；storage-owner/project-catalog仅冻结A/b521已在C2祖先。storage/index另有5e HomePayload、9e/e7 Memory ledger/profile/cleanup独立导出块，实际patch已读，保双方、最终carrier一次合。已知A0树对这些指定hubs staged/unstaged均零改；未发现必须交槽的并写hunk，C2现guard/纯读inspect及新restore模块可继续。新owner归档口只在出现具体文件/导出真实重叠时再局部核，不锁整个包，不由C2改Memory采用策略。

**Restore归档owner/hub续核**：指定catalog-schema、project-plugin-databases、apps/local-host/src/installer/runtime-config-backups.ts、connector-tool-install、plugin-runtime/project-database、evidence-content、cli-host及desktop CLI main，在本轮27OPEN+大PR全页均无覆盖；已知A0该组staged/unstaged无改。实际交集仅B2b5e的connector-private-state（C2祖先）与plugin-runtime/index的b86/d428/d4。注意index还含PluginRuntime类：d428清理与T1 install/trust有真实重叠，仍原carrier保trust/consent/锁及先files→KV→register-save，不是整文件纯barrel任取；C2此次只追加project-database纯读口显式导出，与install主体不重叠，可继续，新模块/SQLite只读inspect/pending guard不全体停工。新owner归档口保原解析/加密主人；Desktop现建表callback正向注入，不反向import Desktop，不碰Memory采用或A冻结来源。

**Project归档仓储constructor续核**：按C2具体交付请求再鲜核27个OPEN的完整分页名单及实际patch：repository.ts仅#1250/d4dee51faebb2a0467256d6ebd73b421002787e6覆盖，改动为publisher_trust schema列/约束与save校验/写入，constructor未改；release-artifacts.ts（含现行validateArtifact）及新project-snapshot.ts无在途覆盖。C2可在两原owner仓储constructor加explicit existingOnly跳过DDL、默认正常行为不变，沿原get/list、parsePluginManifest与发行物身份检查及publisher/version/shape检查，不在Host复制SQL/不执行module_source；合成时保T1 schema/save，不能整文件择一。index仅追加纯读出口，b86删typed、d428清理与d4信任/consent/install锁仍由原carrier保双方。已知A0这组staged/unstaged无改；FIX1最近a7c1六项交付未含这些小段，但本工具无法访问其历史树，未虚报已核实时本地。已只向FIX1发精确重叠通知：如当前/计划实际占相同constructor/validator才直报C2/PIPE，未要求无重叠回执，不新增writer或停整个Runtime包。本轮未跑构建/测试，不把此hunk协调当功能审验。

**恢复重入原key引用hunk续核**：C2已明确提交后--recover不能依赖归档仍在，空vault+CLI私有状态可能仅依赖env/Keychain master，文件inode不能证明新进程仍用原env key。拟在原storage owner的file-secret-store.ts、openExistingHomePayload邻近追加assertExistingHomeKeyReference(home,{location,sha256}):void，按固定location↔backend映射复用payloadMaster/masterReference，只读既存master并核引用身份，不返回key/正文、不初始化/新算法/新解密格式；journal仅保存既有manifest key references，读取位置仍原registry/owner核验，绝不按任意journal路径选锁/key。PIPE鲜核27 OPEN完整页与实际patch：该源码仅#1239/5e1d8a29156509d6fc51f75fd5bcc17316e3f225覆盖，5e已是C2当前d8c8bfd祖先，C2该文件无dirty；已知A0此源码/index staged/unstaged亦零改，未发现须串行的独立在途hunk，可由C2原owner继续追加。storage/index同时有5e HomePayload、b521 StorageOwner、9e/e7 Memory导出独立块，仅显式追加并在carrier保双方，不取整Memory Draft/整文件择一。已直达C2，无回执要求；本轮仅协调与源码核查，没有Keychain/env key实读、构建或新运行证据，不把拟接口写成产品交付。

**Alchemist MCP有限回归修复候选（本地/未吸收）**：原104有限批已自然结束103/104，唯一alchemist-mcp第一例1/2红，旧每stdio new Host触发A lease正确拒绝第二Host，首raw保留。现原实现2固定局部e2d2ea19dee474bc3aaf788a0c86ba2f06c09c7e/direct6ef2ad3148ef060ed2722dfbc654716529f2812d，仅tests/alchemist-mcp.test.ts与fixtures/alchemist-mcp-server.ts两文件56/-30，PIPE实际Git scope已核；单resident真实Host+多真实stdio经管理API真实grant/project边界，原跨进程/只读/跨项目/held取消断言保持，新增真正关闭重开Host与新进程旧version/message读回。作者alchemist-mcp-fix-first.log 2/2、两strict0和alchemist-gateway-lease-regression.log 13+6通过，PIPE已读原件；REVIEW6391660103/TEST6391693958已固定e2d两文件窄增量双PASS，3files21条分批有效结果，已公开6391709960交Claude A carrier仅吸该commit/patch；当前A/b521尚未包含，不能合整6ef/snapshot树；作者后补的alchemist-mcp-e2d2.patch及同前缀-handoff.md/-runtime.json/-runtime-source-overlay.patch已分别直达两审，PIPE已读原件，不重复104/full。候选为local-only、A1254远端仍b521未含，本snapshot工作树另有dirty验证/文档，不把它当完整snapshot交付；两审只固定git对象/必要证据，实际carrier只吸此2-file commit而非整6ef snapshot checkpoint。实际build4为6ef+三份snapshot技术源码dirty overlay（capture/inventory/home-store-snapshot），manifest 00:23:59.395Z、source_digest56d553f5189b4c885ed061da6b358aa3edfee0c16654113cc4df4bb71c8568a7仍与生产源匹配；不是纯e2d或原A构建。两fixture与固定commit全等，strict/import图0of1443原件齐；产物闭包为交接时实查，不伪造执行起点采样。独立两审已核该组合runtime中消费者修复可继承范围；不是干净e2d/b521运行，实际carrier合成/必要增量/full仍待，未核实际纳入前不记已修入A，原owner实现2继续其他I-O验证。

**snapshot实际端口与SC4窄边界（Root已裁定并直达实现2）**：Root实际读2b的SC4 §1/RAC212–213及HOME-DATA，确认D6明确同点db+content备份，W5-16全库backup API/实测版本共同覆盖离线技术读取；沿既有合同直接实施，不等泛许可。原homeStores唯一sessions静态登记owner保持apps/local-host，元数据供通用snapshot核退役v7/密封blob/原key依赖，修正W5 slice仍写private-work-context的旧owner。RAC212仅对这一个静态声明节点作精确结构识别，其余同文件/全产品仍拦业务打开；声明夹函数/调用或外部opener的反例须失败，不整文件ignore、不拆字符串逃检、不放宽scripts门禁。原slice+SC4/HOME-DATA必要澄清，实际备份/WAL、原key不外带、错版/缺依赖拒绝及Host不打开/项目删除无Sessions owner均须有原件；不恢复业务reader/正文解密/迁移、兼容或SC5/BL177。实现2继续2b7d独立snapshot；storage技术/registry附metadata、installed-library ledger枚举、plugin-runtime现record parser子版本仍由原事实owner窄只读提供，不在Host复制SQL；A初始化由FIX4独立修，真实同合同/hunk才串行，唯一full仍Claude。 Alchemist基线具体hunk已核：插件现root导出ALCHEMIST_STUDIO_BASELINE原对象，由原已点名同插件的alchemist-search转给registry策略；不抄版本/不新增宿主插件包点名文件。PIPE独立核当前27个OPEN PR及7个>100files的全页列表，两路径均无在途改动，可继续本hunk；2/2 CLI和SC4首红/修正仅当前作者阶段，完整snapshot固定头后仍ClaudeFIRST/独立TEST，未冒正式通过。

**C2 A已固定交付与snapshot接续（23:06UTC）**：#1254非Draft固定19ccdfa8ed41fee58038e9cedcd43abf3f48e65d（原base bde、63files1820/-316），作者FIRST6390526610已实际请求/TEST已直收；原树冻结释放，完整FIRST仍待，原TEST6390714218恢复阻断已b521修后独立双PASS收口，当前完整FIRST/统一集成待，见上，不重复派首评。唯一slice A/RAC105-A01～10交早期同inode opaque Home lease、SDK一次borrow、真实stdio可信转发与必要消费者，production指纹b1226d8034e904984a4c0054b373a6de4a2a6b4d42dab18532582a70b3aa4f3d。337首批自然328ok/9fail和相关复验原件保留；同步preflight无业务资源窗口已修，Memory.close→SDK及Alchemist原开始时序/全部实际成功后还lease保持。Studio HTTPS分支与干净bde同断言TLS/400红、首份不同正文UNKNOWN保留；3可选live未执行/历史strict诊断不能称全绿，affected full非空/117建议项未跑，统一full只Claude，raw /tmp/molis-w5-16-home-lease-delivery-20261024/handoff.md。Root已授权原实现2下一完整snapshot，已实际新树w5-16-home-snapshot/goalboard、branch feature/codex-w5-16-home-snapshot、组合基点2b7d8133541deaa9d6ad79eaf5ac0e5ae9a19f97=actual5256+A19+B2b5e，已核HEAD与同一slice的完整命令合同改动，现实际实现、不等A CI/full/merge。冻结A/B来源不改，registry/插件ledger窄只读由事实owner供给，不跨owner复制SQL；新同hunk逐项协调。统一restore/RAC107–108仍本C2后续，真实Home/Keychain/用户验收未动，A/snapshot局部不代表C2整线完成；Memory现eb相对c8的A proof/技术presence hunk无新增，保其authority/observer/删除owner独立实现，不采用整Draft。

**C4已授权下一独立片**：实现1 C3 Gmail516/横向1252-8abab source/TEST均已交齐，完整C1/C3仍未关闭。FI3 c986已统筹审过且分支实现，OAuth归connection_services[].auth.methods、非token当前只有kind且SDK拒额外字段；C4须同改合同/SDK/Manifest生成JSON/消费/API而非另登记。6390280424已收敛仅三项待Claude WO：RAC号段/固定base是否叠FI3、OAuth与MCP_SERVERS/CONNECTOR_CLIS本片或后续、generic三特例/三callback边界和X3 refresh签名。现有Gmail并非纯函数（有pending/config/token），Catalog已有Notion协议；不凭顶层目录推无实现，不替换成新总spec。平台state/回调/secret/连接提交/地址校验/撤权尾检已定沿用，API origin与OAuth endpoint用途分开；R48是FI3工厂取法归ac-kernel/PG045，T1官方host/unsigned另待6390190197，由FI3/T1 owner接enableOnce安装身份，不给所有外部definition host。收到可执行WO立即实现，未知共享合同局部等待不等旧PR CI/full。

| resident单题 | Root START FIX3 / 二轮6390493503 / TEST6390527348 | 固定6b(parent931)观察归属修复 | 两文件34/-5，scope=current context号/actor/audience/project全核，真实directory交错红3/4→绿4/4，非production/新scope/过滤nil；旧两次CI因果未知不冒已修。原full931仅原范围，候选暂未吸收，唯一Claude决定当前full自然结束后的吸收/增量，禁止重复queue/full |

| 序 | 独立片 | 状态 |
| --- | --- | --- |
| C1 | W5-13 收尾：宿主日志与吞掉的错误（§2） | 原owner实现1保持；115/bf09已随batch34 actualdf552，#1231已closed，116/#1238已actual584，117/#1240修后2f双PASS待batch35，118/119/#1244已actual52560f32/本片闭环；C1整线未完成 |
| C2 | W5-16：Home 快照与恢复（§2） | A/b521修后与e2d消费者各窄双PASS，待原Claude A载体/完整首评-full-actual；snapshot4f保SDK已知红，d8预案后Root已START同owner独立SDK外restore，指定hubs无须全体停工。SDK双root认证和独立Molis Memory合法空恢复能力各待原owner实际claim/固定交付，C2合法ledger组合继续；合法空态当前安全拒但RAC108仍未完，不缩完整C2/真实Home验收 |
| C3 | W5-10 的一部分：官方集成与横向服务巨大单元（§2） | Gmail516已Claude6389882200吸收35；横向完整区#1252固定8abab965c1f75bfb1ae1f695530a5d1a1312309f，15files533/-412/4→0，source释放、TEST6390184579定向PASS，FIRST6390137797实际请求尚待。28unique205/真实IM与原/变SQL类型修证据保范围，2非直接browser/selector及full仅Claude；实现1 C4准备完成只余三项WO，不开未授第三C3域，C1/C3整体未完成 |
| C4 | W5-11 OAuth/连接器声明搬迁 | 原已授权下一独立片，实现1准备已完；仅3项可开工WO由Claude6390280424给号段/base/FI3叠层、OAuth与MCP/CLI范围、callback/X3签名。已有安全规则直接沿用，不等1252 CI/full；T1等级与R48分开，不自定政策 |
| C5 | W5-16 后续：MCP 需要时按需启动常驻宿主（用户 10-25 定，§2） | RAC-625～629，BL-645 | 10-25 统筹新派，等 #1254 随 batch-36 落地 |
| C4 | PG-095 Images/Jelly插件合同；WO7aa/RAC620–624/BL617 | #1263固定eb01f8f7b49f0b26945d2bc38e16d0f5edeb456f，FIRST6393600544/TEST6394049620定向PASS，已核#1270包含；40files106/-265/4直接34和正确build保原范围，shared-core full/actual仍Claude。privileges位置/状态说明实际实施owner PIPE，9c4866cf载体修改须核actual；不关闭整PG095/C1/C3或旧OAuth C4 |

## 0. 接手合并 Agent（10-24 03:40 起，先于 §2 的开发片）

> **当前唯一定时调度（用户最新明确、Root已官方工具读回）**：只有Root `01a12a80-ede2-7b81-93ea-521a5abcc35c` 的 `molis-work` 每10分钟周期巡检；其他定时任务维持PAUSED。本次只改变周期发现来源，原职责和交付直达接续不变：新PR交REVIEW、可合并项交流水线执行、新独立片交对应实现、有效Review问题交原作者/修复、修复新head即交REVIEW增量复查并按风险交TEST；固定头/证据直接传递并抄Root，不等heartbeat或Root二次许可。Root负责周期发现、初始派单与复杂裁决，流水线/专职不恢复自己的定时器或周期扫描全项目。Claude整线范围/优先级/唯一full排期、既有owner和单writer/公共资源槽不变。
>
> **当前真实核收（交付驱动，覆盖下列旧快照）**：用户指定旧8个目标1109/1112/1209/1210/1211/1212/1222/1223，核心#1222已actual006；最后#1236已19:02:08Z正常merge `bde02c59eb9a1d794a442419570819a80585708a`。actual tree972177be84f824edb61053c19909f930b725fe00=merge-tree(真实parent7d25794e,冻结331)，受测331相比仅先合Images README/Coding spec两文档。1109/1112专职已核包含并19:05带actual关闭，评论6388316807/6388317402；1223原Claude6388301030已核ade为331祖先并19:04关闭。本流水线鲜核1223已CLOSED，不重复关闭。旧8合并目标实际闭环，仅各源片工程结果；所有原nonblock、C1/C2/W5整线和本人验收保持。
>
> **共同载体实际审验**：#1236冻结331cd096cd78981ba90a8755b511094f7f95ec84，原Claude唯一队列已自然完成，无额外queue。PR CI40117632751十四适用成功；full40117579239同331十六worker+aggregate成功，TEST正核各原件分母/retry/skip，不把metadata称首轮全case绿；merge-group40122786015同actual bde，Verify120959586844成功、10成功/3条件skip。REVIEW6387363344/6387547375、TEST6387369093/6387961395有效；Mac原26ts+独立native22/22合27唯一文件，各首红及定向恢复原件保留。selector七态最终attempt4 exit0/清理0，隔离Home/fake adapter，不冒模型执行/真实Home/本人验收。完整实际证明 `/tmp/molis-pr1109-1112-20261024/landing-proof.json`，专职两源收尾已交Root并归档。
>
> **331 full原件最终核收**：full40117579239独立TEST6388533532已PASS：16worker全checkout331，源码1398减27Mac=1371唯一文件，11×86+5×85无重/缺；1370首ok（含5全skip）+Cognia SYS15/390首3/4、原策略唯一retry44.8s过，最终1371/1371/零最终红/零known-main豁免。首轮Node9016=9001pass/1fail/14skip，retry无逐case打印，不虚构首绿；同文件旧文档不证明同断言基线。raw `/tmp/molis-verify-2026-10-24/full33-331cd096-test/test-handoff-full331.md`。此为331证据，不声称测试后续main整树。
>
> **独立已合文档修复**：#1235/52c14058f931c074d5f58e46bcbd34d0397cad95已18:34:28Z actual `7d25794e9e7d9985bf22b863ac57b6d0e2dc6b90`，singleparent7a2/tree8433129e=真实试合，只README+4/-2；二轮6387516202、TEST6387748949、PRCI40117331601十四适用成功、queue40120134604/Verify120953043097成功。原1212/6384912989 README P2由6388326951实际关闭，其他问题不吞。raw `/tmp/molis-verify-2026-10-24/images-recovery-doc/merge-proof.json`。
>
> **当前独立接续**：#1237固定7eb已19:27:04Z actual `87ebba4c769557f9548d66310d76eb4e30b68bc9`；parent bde/tree1f9b385babfa64ae94d01ac436ef1d7fd56a4450等真实试合，12路径源→实际零diff/main包含。二轮6387881227/TEST6388153277、PRCI40120148369十四成功及唯一正常queue40124785872/Verify120965005904成功（10成功3条件skip）均核；6388559742及原1216/6388559951实际关闭该P2，首导航红/唯一恢复/六uncovered映射边界原样保留。FIX2现#1229注释c2已二轮PASS，其余固定候选按§0a接Claude下一批。
>
> **C1 RAC117当前修复（替代旧待认领状态）**：#1240冻结 `3ce6270b7297382a9e07051c35959b4b89d882bf` 已ac-review6388577861；原统筹6388582397将坏参数阻塞整项目删除升为挡合并，写侧强转同PR收口。Root已START FIX1 sole，公开认领6388670438，独立 `desktop-launch-args-fix/goalboard`，C1原作者保持冻结/source释放。Root细化B：原坏存量 `desktop.launch_args_invalid/internal500` 保留，非法写入新 `desktop.launch_args_input_invalid/invalid400`，不改SDK类别映射。窄panel-ID owner查询保live-terminal/确认/幂等/删除清理；DesktopPanelCatalogApi/Repository只补listIds，生产HTTP入口去map(String)原样交owner严格校验。修后固定头直二轮/TEST，原143项仅旧头边界。已给F1下一空闲build一次原3ce红例前整建，实际machine-slot取得后运行，browser现有Claude批不碰。不是新权限/人类待批，不再催首评，不操作/重启已停Claude UI。
>
> **C1其余证据/实际选择**：#1231固定bf09cc3a76d406e9ab84a0a223a8f53221368b30，TEST6388585347已核CI24+新增32文件238/238无重合，README56齐，原Cookie基线红/TS2531保留。#1238/55fc修后双PASS/CI14成功、README原缺32已TEST6388806251实际32文件238/238补齐，当前56/56来源齐；已按小修§1a.5一次正常入队接续，尚不冒actual。实现1已鲜核main87eb/16在途后发现 desktop launchers CLI外层Promise和Web close(error)/2s exit0未被115–117覆盖，实际选择继续C1 RAC118/119：两个entry+必要私有接线/真实子进程回归/唯一slice/README独立新段，正常行为/2s界限不变、意外安全诊断非0、不加logger/重试/权限。正从87eb建独立树/短spec红→实现，尚无固定PR/head，C3 Gmail未启动。FIX1仅1240坏args段，C2关闭library须保error callback，三者按真实hunk独立接续。
>
> **FIX2新实际START**：#1237 actual后Root已将原1210/6384193830第2项交FIX2独立实施：uninstalled hook失败会跳过definition清理，当前main87eb runtime/index628–632仍真实存在；Root已分页核14在途无该文件。保失败/真实链接拒绝/其他安装/权限/重放，只此一题新树与红绿，完整PR后ac-review一轮；1210 actual006依赖已满足，不再等旧单writer/真merge窗口。原1112三P2不混本题。
>
> **B2b新固定头与共享释放**：FIX4一次正常push固定 `5e1d8a29156509d6fc51f75fd5bcc17316e3f225`，b9后10文件+372/-43，公开6388749288、clean/SOURCE RELEASE；Home payload仅加purpose+canonical Home+owner AAD，vault v2无AAD原读法不变。Root已批准源32MiB/10000节点/密封串128MiB全批额度，有界读/扫描、超限too_large且整次零写，不截断/跳cache；严格原backend恢复报错/文档及S12同轮齐修。作者17唯一文件112项/最终build与门禁通过是候选证据，二轮/独立TEST/新CI/full尚待，旧b9首败/干净006/Keychain范围保留、不判负载。实际改storage README、HOME-DATA、S12单行和原slice B2b段已释放；storage index/local-host index/README本轮未改，Root已直接给C2在其树保5e最终hunk并串行追加A，不等CI/merge、不覆FIX4冻结树。
>
> **C2 A实际START**：RAC105既有A合同内，独立actual-main-bde树的新 `packages/storage/src/adapters/storage-owner.ts` 与真实公开入口跨进程回归/fixtures已明确给实现2实际编码，不等B2b/Memory整体merge。Root已直接定清同锁上提/opaque父借用与stdio转发可信context、常驻Host薄入口合同；不再泛称等待Root安全裁定。生产stdio/contextTools等实际Catalog写入口须随A最小完整接线闭合，不能先合Host独占留下绕行；保Origin/token/nonce/数字回环/Host instance/取消，身份取可信context而非用户arguments，不新权限/锁/通用RPC/本地写回退。FIX4当前公共出口/README/同一slice/S12按实际hunk固定释放后串行追加A，不等CI/merge；Memory只协调真实同hunk，不将整条Memory当前置。完整A/快照恢复未完成，不把新模块半成品另开PR；本次无需build/browser/full，真实Home不动。
>
> **A已核的具体窗口**：远端Memory #1064固定93b76797a3e13f561e18dd72994b39f717746cd1，#1101现21c549d3aaea84286b7335e3b892ce18f0671283（Draft保持，不能沿旧dd）。已亲读三路径diff及A0当前树：node owner wrapper/createNodeHost storageRoot+exclusiveOwner段同actual bde，A0未提交1232/1321/1379非此段，不能把A0老HEAD差异当当前main冲突。已给C2仅wrapper父借用、node-kit storageRoot邻接proof、system-agent-service对应owner字段的窄窗，公开1064/6388622538；保Memory authority/observer/业务关闭顺序、不动他人树。后续composition.dispose缓存失败清disposal窄段也纳A窗，disposed仍true/不自动重试/全部关闭成功才还lease。Root另定Molis adapter storageRoot必需显式绝对，现生产两入口已有root，缺省前置拒绝，同步类型/真实调用方与隔离回归，不动上游SDK默认。#1240 FIX1只删除ID检查/desktop写侧/Catalog窄接口，C2明确不碰；MCP删除仍薄转唯一owner。FIX4公共index/spec/README/S12按实际hunk释放后串行追加，不等整PR合入；公共生成物在真实组合树统一。

> 2026-10-24 16:35 UTC **最新人类指令覆盖下列旧source排期**
>
> **一骏新明确合并授权（Root刚转达并鲜核8个）**：“把1225之前的除了memory相关的非draft PR（784，734也除外），都解决合并掉”。准确集合 **1109、1112、1209、1210、1211、1212、1222、1223**；Memory实质相关（包括Memory base的1196）、784/734与其余Draft排除，不自动Ready，不自动扩新PR>1225。可用清楚包含旧目标的合规carrier，不混未经授权新目标；旧非阻塞owner责任保留。#1198原单独任务独立继续，Root据四完整PNG交叉同bytes/空toast无匹配button已判剩6px非本分支回归，底层仍UNKNOWN、formal exit1/阈值0/首败全保留、无新capture/算法/期望图变更；可Ready正常队列，不挡这8目标。
>
> **立即最高优先1222（用户再催“修了1222，有好几个应该就能直接关，快”）**：source owner仍原Claude `ac-batch29pr`，不重复writer。remote acf89a9cc4b16a1442349c8c725d4557363ae955/DIRTY/checks[]；现成local a788e1a413f8ffce6d60c922f3c18092e9b343d3=acf+actual2dd，Root已薄核5处remerge/两FIFO测试零diff，REVIEW6386623257已关闭取消P2。真正待修是b29m2-focus119文件116过3红：Cognia390两场景上级.cognia-list display:none阻住68/148点击（非timeout），cognia-mcp45s取消、home-aggregate末两15s取消；build exit0不等focus全绿。已6386688449公开急单返当前原writer，TEST复用full32对应raw/生产fixture基线只读归因，不能一概负载/flaky/改断言/新起重复full。修实缺口→仅必要差异验证→固定newhead/实际diff/raw DIRECT REVIEW/TEST→normalpush/正式适用CI→唯一正常queue→actualmain SHA/四固定头包含→立即关1209/1210/1211/1212；不等1198或其他新片。共享曾计划full-suite，目前API未见新头/CI/label，不把计划当已运行，统一full仍仅Claude决定。
>
> **source接续变更**：C1已实际START RAC115，managed c1-uninstall-inspection/goalboard、branch anticorr/codex-w5-13-browser-input、准确base2dd，32openPR全路径无冲突；按Root让当前有界片安全fixed/release。之后source优先这8旧PR真实修复，**不再按旧条件立即开C2B2b**；B2b完整合同/原owner保留后移，Root/Claude最新具体WO覆盖。FIX1只读1109/1223已有owner/承载及真实障碍；FIX2只读1112：对2dd六真冲突已Claude现成integration-33/d3cd76473e38ce4930548063ba81a99758e37906解决，08b与2dd均其祖先/树clean，但无remote/PR且夹1226–1229新片，须按本次边界与Claude明确选carrier，不另source重复sync。所有8当前fresh仍DIRTY、无queue；1109有旧autoMerge（10-23）不等已入队，不重复调用。


> **当前交槽（2026-10-24 16:16 UTC）**：FIX2已明确1198源码/spec全部FROZEN/RELEASED，远端 `fd3e56b8485462985d71630b8c14ec2ebd841919`，normalpush20e→fd3/secrets342/准确base2b health+asset0/完整handoff6386459129已交。仅readonly formal93507（base13/13、head进行）、CI40110037944与metadata剩余；Root最新明确**保持Draft**到正式结果齐，忽略此前可提前Ready建议，不妨碍CI/formal并行。原ready真红/1绿已独立薄核，仍无整体formal PASS，baseline测试guard恢复待自然结束实核。**唯一Codex writer现授C1 RAC115 START**，fresh main `2dd53591276982b6947369e345ddfcffcc21afd2`，先鲜核路径认领/同slice再实现；C1 fixed+release即C2B2b，不等审验/CI/merge。FIX2如需改任何source/doc先返槽，不能并写。
>
> **实际W5片落地**：#1225已16:04:33Z actualmerge2dd53591276982b6947369e345ddfcffcc21afd2，singleparent112、actualtree ad24278b75f296a4f20fc7bdb87b6a237802b3fc=f2e580352固定候选。1098原91e、1107f25、1191d184、1173f45均f2祖先；1107在15:17的REST merged/d09只是入1098下层（tree等f25），**本次2dd才核实际main包含**，非提前完结。原统筹已带2dd关闭1098/1191/1173，source有效逐片/组合REVIEW6386329302与queue40109483030/Verify120919029355成功保留。full32原bc6d 13worker过3红/一web health starting首红retry过均保留，后者FIX1接R44只读归因，不称负载/flaky。TEST继续本机48raw与真实新修有限核收；一live未执行不吞。1112明确下一batch33/三个P2未闭，W5/PG060整线不完成。1225两句doc实际FIX1原稿/实际2dd同blob已核仍未修，唯一writer后续短窗真正实施。


> **当前执行（10-24 15:51UTC，覆盖下列旧快照）**：#1162已于15:25:40Z实际MERGED `2b253d457c2207e5cb1b276cf255f3cbb5f53056`，单parent612、actual tree `da533975180bced6e9e00d21f7c0d8fd130d52ea`=获审edace/PR CI5435，独立REVIEW6385702598与TEST6385703908双PASS、22files359首过/12PNG，适用PR CI40104219811全绿、merge-group40106295985/Verify120909780213成功。仅该片工程落地，原生安装/本人验收未作。**唯一Codex source FIX2已实际START #1198**：fresh290d7990+冻结edace，本地预备1de12b8e后资产提交固定 `129011e03d76cbaac8b4dfdc85988709cee6dc37`，/private/tmp/pr1198-toast-sync；真实冲突仅page-assets一项，产品/test/VUX原文对290d逐字同，wholebuild/boundary通过。三CSS恰各+7、其他24同edace、总7641848B；README/one-toast 9files91首过，budget记录落盘前171中170首过/唯一实物表差异红原样保留，更新实测记录后仅该171复验171/171，断言未改；原完整浏览器3case/24态3/3首过，原正式零阈值66图22样式一次已exit1：两侧12/12，side-files390light1802px、appearance1440light6px、goalwork1440dark4px、22styles零差；旧Todo本轮0不反推旧UNKNOWN。Root实图证side-files基准停loading/head是真材料，已明确授权同一FIX2 source更新同一VUX spec再最小SURFACES ready为panelvisible+生产list aria-busy=false+seeded试用示例.pdf真实行；真实pending/empty反例先旧红新绿，不改production/stablePicture/sleep/mask/阈值/retry。6/4px角边通道差仍UNKNOWN不豁免；新实质ready修正后可一次完整原66/22，非盲A/A。作者已正常merge实际2b得44110f4a且原树同129，仍未push/Ready，source不释放。1162真SHA已满足依赖；最终有限基准依下WO，不追无关后续main反复整建。W5 f25/08b两同步均固定双独立PASS，Claude最终批/full/真实merge待；3旧P2不关，不空占writer。
>
> **新组合证据与owner**：1222当前原Claude新远端2d2883c531cc3979fd808a07424614e028575bf9已6386170975回修原b99 P1（仅两tests123/-10），原4次7/7/真实ready+2500到close/阻塞与abort控制已交、REVIEW/TEST即时接新头与Linux；未独立核新头前不以旧b99绿关P1。下列原b99风险与Root合同仍是复审准绳。**Root实读裁决+REVIEW6386075095明确P1**：返回后测1000不能中断真实同步FIFO，spawn总2500→30000也放过拒绝后不自然退出；必须由当前原Claude批作者在同批改成真实public import ready后parent唯一原2500覆盖owner拒绝+自然close(0)，两FIFO精确code/无writer/取消清理/同helper真阻塞负控制，不改production/runner/新增宽启动阈值。已6386078159公开回原作者；C2只留/tmp技术参考不另开重复writer，新CI绿不能替代该mustfix与新Linux证据；旧Linux无phase、Mac2ms不能定负载/加载原因。Search lastFetch6行独立REVIEW6386074856通过，原main5次1红、修后目标6次过及另4cancel/raw均保留。**#1224已15:32:15Z实际merge112114f231a734ac761cf36e8411c8897d0826d8**，singleparent2b、actual treef874a0a7=2b+5766真实合成，5源固定头祖先/Claude带112关闭均核；queue40106695986/Verify120911368571成功，非源码每片独立merge。1220/e5ff四处实物锚点已独立REVIEW6386154511 PASS、其余85case/全部fixture与scanner/limits同blob，旧mustfix可关；独立TEST已核新CI86/86首过及actual112同源码PASS，单份search-race-5766-b99/test-handoff，原full31红不改绿。1207两源slice文档已原ac-kernel/1218随112实际落，diff空/原Review/queueGates核齐，6386132911仅该两nonblock闭环；Trust及1218本身P2仍不关。#1221 ACA005原代码612工程合入，真实Home v3/W5-17与整线未完成。


> **当前实际source（12:24UTC，覆盖下列旧source快照）**：C1 RAC114已自然固定非Draft#1213/8fce66c6349b47476e7a2f131cd7f7ee12e0b377，3files+204/-2/prod+6/-2，作者2红2绿→4files17首过/必要门禁0，REVIEW6384157844过、独立TEST接续，source明确RELEASE/treeclean无自有运行。**FIX1 ACA005已正式START唯一writer**且实际接单，先同一slice ACA005-01..07再实现root已批generation/v3/最终原source-reader授权。build优先序FIX1 baseline→TEST1213必要正确build→FIX1green按公共槽，作者可先source准备不空转，不并发build/新full。原C2 e20独立REVIEW6384019404/TEST6384047094两mustfix已闭合，已6384076618向Claude提新storage/full候选，source仍释放。#1213新增快产品测试共享清单一行明确交Claude实际最终批writer（1213/6384200965），未实际写入/核CI/真merge不当完成；原作者不重开槽。P1固定释放后FIX2 W5真main依赖已满足接续，不等P1审验/CI/merge；ACA003/S18 P2原边界与C1其他余项/C2完整后续保持，不停在台账、不并写。


> **最新实际状态（12:08UTC，覆盖下列旧快照）**：#1206于11:59:44Z真merge c6093a2e9c412181846d94ee1a5cd037680684b3，8固定源头祖先fa52与landing=受测2ca树1ff5f00已核、Claude已八条关闭，full27b全16+汇总success，merge-group40091732268/Verify成功，QUEUE移§3。#1209新远端e20e68f0af2e519c333feb50fb062958cf7f22b7普通push成功，6files+90/-5，REVIEW6384019404增量PASS，两mustfix作者真实红绿/58项+门禁0，独立TEST有限复验待齐；旧dbec红不抹。C2已明确source release，**C1已实际RESUME**原两spec/test暂存188、baseline与base645继续RAC114有界片，不为Git传输/审验空占源。之后FIX1 ACA005确认P1按本节root已批generation/v3实施，再FIX2 W5 source（1206真依赖已满足；不等ACA005审验/CI/merge才接独立片）。C2完整后续不缩小。full28两原始红分别1207取消发现期未执行诊断（原ac-kernel修）及S63正文引号被S20误收（Claude批writer纯docs最小改），不串到ACA005，不连坐已合1206。


> **当前源排程（11:48UTC）**：#1209/dbec被独立REVIEW6383768725及TEST6383805807确认为P1空正文密文毒化vault预检+P2 BOM精确恢复失败，旧storage/full申请6383768403已6383787655公开hold等新头。C1已明确RELEASE且再确认，spec36行+newtest152行两份暂存未提交保留在原c1-uninstall-inspection/HEAD645，production未改、无运行；**原C2已经START唯一源写短修**，修后新固定head/raw DIRECT复审验并release即返C1续RAC114，不重做准备。新增ACA005已实证P1由FIX1接续，依赖本C2短修与C1有界收口；普通文档nonblock/W5长同步按优先级其后，W5仍需1206真merge，owner不变、不新chat/第二writer/重复full。此条覆盖下方11:38 C1在写的旧快照。

### 用户明确优先 WO：#1162 → #1198 原 PR 实际合入（Root转达，执行owner FIX2）

**授权与交付。** 一骏明确「#1162、#1198 这俩也帮忙处理merge掉」。这份已接受WO替代重复文件spec；目标是这两项既有修复在最新主线工程/受管浏览器验证并各原PR实际MERGED，原生窗口/本人验收单列。已有授权覆盖必要同步、修复、普通push、转Ready、独立审验和正常队列，不再申请同一权限。1112已fixed双独立核收，1162已实际落地，唯一writer已实际转1198，Root/TEST不并写。

**顺序/真依赖（Root按当前新头收窄）。** 1162已实际合入2b253d457c2207e5cb1b276cf255f3cbb5f53056/tree da533975=edace。1198固定输入290d79904dbff1061cdbd45fa780ad70a96d44f2，唯一FIX2自有树与冻结edace合成1de12b8e进行wholebuild/24态及原零阈值66图22样式一次正式比较；该预备基准现已由1162实际SHA证实。最终验证/额度有限基准固定这个实际1162 SHA，核tree/生产源/依赖及真实dist内容一致则沿用有效证据；仅mtime记录差异不能冒内容变化，原记录保留、不伪改指纹。后续1224等main更新交merge_group集成，只有真实冲突、准确资源from失配或具体行为风险才重开相关同步/增量验证，不为追最新SHA再手合main/整套重跑；不取消/挪其他PR或CI。最终预算与必要静态门在实际依赖基准实核后普通push/Ready，remote若再变先停push读新差异。原作者贡献/产品与24态保留，一writer/一build/一browser，不建替代批后仅关原PR，不等W5 full。

**1162范围。** 原head0ec7d8d6dc0662860387c16d8573b6515d63653b、merge-baseacc71。只原6路径：Pages README、import-client.ts/styles.ts/ui.ts、pages-import-entry.e2e、page-assets.json；最新612仅资产表冲突。保现有mw-dialog--form内容区滚动/footer固定及真正命中后click，不借同步重做UI/导入/删除/持久化。资产表先取主线，正确wholebuild后按实测更新下降，不以旧137B绝对数覆盖新主线。当前包README13必要及样式/导入定向、pages-import-entry/相关dialog浏览器（公共槽/专用Chrome/临时Home）与准确base health/resources/secrets，固定head/真实diff/raw/未验证边界→Ready→直接独立审验→原PR正常队列真merge。

**1198正式视觉合同。** 当前VUX spec明确原零容忍正式66图/22样式完成门。原c609 Todo390浅色11px与同头A/A11点、readiness无异常/原因UNKNOWN均保留；原raw在原作者/Users/oreal机器，本机不可读就不冒亲核/自动豁免。新准确候选基准上按原参数/零阈值/零retry只做一次正式66/22+24态；自然过可按新组合证据核收，不宣称旧根因已修；再红据实定点，不循环碰运气、不加sleep/阈值/像素豁免或私改shared harness。三CSS各+7语义及最终actual base精确from/to合同不变。

**1198范围与额度。** 原head5d6d536d5685f9174c9226563b099e0c6b772601/basef586，6路径为design-system README、styles/toast.ts、scripts/gates/page-assets.mjs、VUX spec、request-failure-call-id.e2e、page-assets.json；原产品只toast选择器补既有.mw-btn。旧5d6冲突记录仅作历史；fresh290d与edace实际仅资源表冲突，README及一次性表已自动合，双方有效条目保留；用户原批准仅arrival/settings/workbench三个CSS各+7B语义，按真正最新merge-base测准确from/to、清已耗旧额度，不保旧705676/995810/1614247高上限、不改通用门禁/不扩额外增长。若>7或其他资产变先查真实原因/范围，不默放。旧tmp-summary/approved/repair当前缺失，不能凭PRbody算亲读；新的wholebuild、当前README定向、原3浏览器case、真实404/复制与1440/1024/390×浅深×normal/hover/active/keyboard24态建立当前证据。Memory删除helper按当时正式现行合同（当前仍remove）适配且保持原真实断言；source fixed/Ready后独立审验/普通队列真merge。

> **下一独立片已具合同，尚未START**：C2 B2b具体 `/tmp/molis-verify-2026-10-24/c2-b2/b2b-next-contract.md` 已Root接受为UI自然fixed/release后的安排：现行初始化链不变，既存v2 vault即使entries=0仍绑定原backend/master，受管CLI `.home` 只读密封/完整恢复预检owner。只依赖含e20已验生产行为的准确固定base，不把1222新deadline/CI/full/真merge或后续earlylease当开发前置；START前鲜核1222/1210实际代码去重及基准。C2仅/tmp准备、未动repo/spec/branch；完整bookmark/A/全Home恢复仍同owner，C1正只读核完整余项，不为无关等待空占writer。

### 下一唯一 writer 接续合同（2026-10-24 16:03 UTC，Root已同意；当前均未START）

**实际顺序**：FIX2 #1198真实fixed且明确release → C1有界RAC115 → C2 B2b。前片fixed/release即可接下一独立片，不等review/CI/merge/旧full；这两下一片不增加1198合并前置。原main红/在途必须修优先，保持一Codex writer和公共资源槽；START仍鲜核实际head/路径认领。

**C1 RAC115，owner实现1**：当前BrowserPage.input的四类Input.*共用send吞掉CDP拒绝，现有socket外层错误出口因此到不了；本轮只是源码证据，尚未动态复现。仅browser-host.ts共用失败出口、既side-panel-browser.e2e、唯一w5-13-browser-input slice及必要README。保四类成功参数/顺序/接手先停Assistant，失败用现hostLog仅固定method+error name/code，沿现browser.load_failed中性提示“无法确认这次输入是否完成，请检查页面”给已有socket出口；不重发、不称未执行、不泄露输入/URL/CDP正文，不改全局CDP/API/schema/权限/存储。冻结巨大类443行45方法不得增，用模块级最小helper；既public/dist测试边界。先真实协议拒绝的旧红→修后error/只一次/恢复下一输入/日志无canary，专用test-kit浏览器+临时Home/PID清理，再正确整建/README必要/定向/health/boundary/secrets/准确affected；full仅申请Claude。不夹assistant-http console或desktop launch_args未决，C1整体不关。

**C2 B2b，owner实现2**：同一`/tmp/molis-verify-2026-10-24/c2-b2/b2b-next-contract.md`及b2b-dependency-blobs.json，Root已接受。已鲜核1210b6fb/1212d266/1222-2d：P2c plugin-owner-files与P2d材料未改受管CLI setup/install/authorization或SecretStore，五CLI生产blob同e20；空entries依hasPersistedEntries选backend/原key的真实缺口277–338尚在，HOME-DATA承诺不是实现。START用准确固定含e20生产行为base（实际main已含则main，否则当时fresh公开依赖头），不等1222计时CI/full/真merge或earlylease。保prepare/start/bind/finish初始化、既v2空vault仍绑原backend/master；不加pre-master/dummy/第二key；只读密封/解封复用AES，受管CLI .home认证密文与完整内存预检，无活vault写/明文暂存。仅storage SecretStore+index、新connector-private-state owner+App index、同slice/必要回归文档；不动P2c/CLI初始化/contractsSDK/homeStores。先真实空库新进程换env及原filekey缺失两红，再最小修/二进制mode/错key篡改路径links零写。bookmark/A/完整snapshot+restore仍后续，不以owner roundtrip关整Home或碰真实Home。

**当前1198与1222边界**：1198远端原作者docs-only20e9bef81213c6c79607a1e0c6c83bc5411eeef2/parent290d，两行历史UNKNOWN/RED保留，6386367670已公开当前FIX2及请此轮原分支/spec不并写；普通merge/新head guard，不等私有release/新审批。UI仍Root已批真实ready红绿及一次原66/22中，未Ready/push/合入。1222/2d原2500计时P1核心已修，REVIEW6386273574余P2真实t.signal/pre-aborted/stop后late-ready未闭，Root亲核同意仅原两test内返当前Claude批作者；不以2d四7/7或旧b99CI绿关此项，后需新头独立审验/Linux，旧Linux原因未知。


### ACA005 accepted WO：在途Search最终披露前核原精确授权（确认P1，实际owner FIX1）

本节是当前唯一实施工单；FIX1开写前把同一合同落入 `specs/repository-anti-corruption/slices/aca-005-search-authority.md`，随后本节以该spec为行为来源，只维护owner/依赖/证据，不另造第二方案。root已正式接受工程修复，常规最小技术方案由owner沿现有授权边界决定，无需新用户审批。

**已核事实与边界。** TEST在固定c4a40b84正确构建、Search/MCP/LocalHost关键链对审计afab逐文件无diff上，以真实stdio MCP→生产HTTP/settings grant-revoke、临时公开注册owner真实HTTP listing等待复现。SOURCE与READER各自撤单项，保留search.query、另一项和peer的共享form:read；撤权路由2ms完成时原query仍pending，放owner后同一response各1hit含独特正文；随后新query各0，owner query仍1。root及流水线已亲读 `/tmp/molis-verify-2026-10-24/aca-real-mcp/{handoff.md,result.json,probe.mts}` 的相关输入/结果；有效run自然exit0、全部临时资源清理，旧计时不足运行弃证。此证据只支持可扩展平台来源路径，不冒称当前内置Form同步owner存在同一等待；ACA003仍P2且未动态证实。

**目标/非目标。** 查询等待source catchUp/reader等异步工作后，最终对该调用披露之前，必须同时验证该调用最初使用的精确source和reader授权仍有效；原grant被撤销后，不得由新增grant、另一来源/reader或peer保留的共享permission救活旧调用。合法未撤调用、新有效授权的新查询、本人owner的索引能力继续工作；不删除索引或全局禁用source来掩盖。技术实现沿生产授权/当前性边界，不能只重看已捕获allowed_actions、在测试打人工pause或删正文/hit断言。不得放宽grant/provider/身份边界或启动无关产品变化。

**允许边界/依赖。** 最小Search owner及实际MCP/Host授权传递/最终读取边界、必要正式回归与同一slice；先鲜核现实现及1207 BL501/1208撤public context等在途真实diff，已有owner覆盖则接同一人不重复开线。新增共享合同/owner交互若必要先给具体最小输入输出/信任边界证据交root技术裁定，不先造通用平台。当前FIX1只读准备，不改repo源/spec；源码START在C2 #1209短修固定release→C1 RAC114现有有界片自然固定release后，实际接入优先于普通文档nonblock/W5长同步；若真实依赖变化由流水线重排。保护主checkout/4207/真实Home/Keychain，公共槽与临时Home，不自行full。

**root已裁定的最小授权实例事实（方案已接受，非source START）。** MCP管理owner给现有grant增加单条非敏感generation，config/mcp-tools.json当前v2升v3；代次只是身份不授予权限，输入/请求不能选择，原atomic writer内生成并必要时区分输入与持久类型。首次显式记录、enabled切换、权限集合语义改变换新代；同内容幂等写保原代（顺序无关），无关grant更新不影响，多条仍原子保存，重复/坏记录failclosed不静默去重，不用整文件epoch/revision误杀。受理时原精确ref确无记录则捕获absence，最终仍无该记录且默认开放仍满足才可；现writer撤/重开保留disabled/newenabled，不新增reset/delete默认事实，absence→撤→显式重授不能救旧call。若实际有删除回absence入口，先给root精确路径再补最小同owner事实，不猜全局epoch。

authorizeMcpActions入口捕获原代次/absence，复用现validate_authority与同步assert_authority_current；Search全部真实await后、正文/locator披露前实核所使用的原source+reader精确授权，尾检至披露间无未覆盖await；peer permission、新reader/新grant不能替原授权。原来多个合法reader可按现合同选仍有效的原reader，合法查询/owner索引保留。同hook的retained/background等直接消费者一致沿原授权实例，不建新callback/权限平台。可信client/project、精确version/provider、permissions/availability仍同时核，工具名/action业务语义不改。root已核1207/1208未改grant schema，作者开工仍鲜核有无更晚协议；新测试用最新public context入口，不引1208正删的出口。

**配置版本/维护前置。** runtime只认v3，v2显式拒绝且零写；一次性v2→v3依已有离线维护合同，只在临时Home/副本list/apply，原client/ref/permissions/enabled全部保留，owner为各条生成新代次，外置原件备份、失败可恢复、重复不换代，不把迁移放正常读路径、不加兼容格式。将此配置维护前置交现有W5-17/统一发布维护线并更新HOME-DATA/说明，不改产品发布版本，不操作真实Home/4207/Keychain；必要配置合同变化root已按授权裁定，不新增用户审批。若Claude有更晚同文件协议先对齐。该方案是同一ACA005范围，不把1207 management取消诊断夹带进来。

**验收。** ACA005-01 未撤对照走同一真实生产路径正常返回正确结果；ACA005-02 source与reader各独立在真实owner等待期间撤精确授权，撤权完成且原query仍在途，最终响应须拒绝或不含该已撤内容/正文；ACA005-03 peer共享permission/新增同能力授权不能复活旧调用，后续新合法查询按新授权正常；ACA005-04 本人owner仍能查索引，撤权不以删索引/篡改业务数据实现；ACA005-05 原身份/精确提供方/取消与失败语义不放宽、相关负例仍拒；ACA005-06 撤→同值重授旧拒新成、默认开放撤/重开、无关grant编辑/权限排序幂等重存不打断；ACA005-07 跨进程重读与坏/v2旧配置零写拒绝，临时副本v2→v3 list/apply原事实/外部原件/失败恢复/幂等不换代验证。正式回归进入既有正确生产路径并带编号，tmp probe是复现输入而非唯一测试替身。

**交付/闭环。** 新非Draft PR/精确head、scoped diff、唯一spec、原始红绿/命令/退出与验证边界，DIRECT REVIEW/TEST/流水线/root；TEST按同一真实MCP交错独立验修后不披露，不机械重跑无变化full。独立复审/验证及真实merge SHA齐后才关闭，认领/BL/作者自报不等于修复。本新P1不增加无关#1206/#1209等临时合并门，未修完不得宣称防腐整线完成。


> **源码交槽与新收件（11:38UTC）**：C2 B2a已交非Draft#1209固定dbec1b89dd49333fc6f2f4d264800f7897ecfd4c，20files+844/-21，raw/handoff=`/tmp/molis-verify-2026-10-24/c2-b2/`，作者70files628不同case最终过（原69文件绿/维护fixture realpath红后4/4，非首轮全绿），已经DIRECT REVIEW/TEST与流水线并明确RELEASE、候选冻结/树干净无运行。独立审验未完成不冒通过，storage/full只提交Claude候选。下一唯一writer已实际START **C1实现1 RAC114失败收据**（公开1183/6383746333）：原卸载错误primary，单次写receipt失败须既有最小日志+真实人类提示，不加重试/API、无敏感内容，按既有同一slice与真实故障验证。1206还未merge，W5真依赖未满足；C1固定release且1206已实际落地即接FIX2一次1107/1112同步进当前batch29，不自动等batch28。C2 B2b已接受完整最小合同仍必须在后续source窗口实施，当前无第二writer/不等前片审验CI空占。

> **当前执行（10-24 11:24UTC，覆盖下列旧时间快照）**：#1202实际11:12:45Z合入645853cb60c0c76c4fa86ba27bbbbc0f35ba868a，7固定头均c4祖先、landing与已测627树相同，源PR已Claude带SHA关闭，QUEUE已移§3。full26b40086400255@c4全16+汇总success，merge-group40088629727 Verify成功；独立TEST10文件153/153首过/零skip/retry/自然exit0，旧stale不计、原28stdout未亲读。#1206/fa52a4f8c已开/base645，唯一full27b40089127294进行中，REVIEW已接组合增量；touch c37增量6383557011过，原raw交TEST，不重审board/资源。C2 B2a仍唯一source，固定交付/release后可接B2b等独立片；**W5 FIX2须同时等1206实际落地**再对1107（含1098）/1112各合一次main，Claude6383510742基于真代码冲突新时点优先于旧“release即sync”。不让等待review/CI空占writer，也不提前撞真实依赖。ACA005→003独立tmp验证TEST已接续，不新增生产writer/无关合并门。B2根因完整纠正见同一当前合同，不另造初始化任务。

> **现行落地规则已接续（10-24 08:16UTC核源）**：以MERGE-QUEUE最新§1a「同路径一起落地」为准，旧逐片同步/逐片入队流程不套新批：评审仍逐片固定head，full非空按路径在Claude批分支一次解共用文件、一次health/security/full，最终仅批PR入队，叠层顶端一次落地；原片按批PR真实merge SHA及包含证据关闭。纯共用文件冲突作者不merge main、不刷baseline；full空且按队列试合无冲突的小PR可独立入队。#1114含Cognia真实代码冲突，仍是Claude6381691853指定等1169先合后原FIX2一次同步的例外，不开重复writer。
>
> C2 S行具体落点已由root按当前事实裁定：main安全表最大58、沙箱顶1144/61a0da5df真实包含59/60，B1以S61为集成候选（非永久占号），不造占位、不放宽连续门禁；当前独立head只缺前序须如实记health红。C2完成必要源修后立即固定非DraftPR/head及原始证据直发REVIEW/TEST/流水线、释放source；拿固定候选才向Claude申请加入当前26或下一安全批，Claude决定冻结/最终编号/唯一full，不为编号等着不开发，也不要求各片再次机械sync main。当前26计划已变为沙箱顶＋1181 e70160a6e＋1188 d6d1da98a；同批编号随实际顺序一次一致调整。C2 B2/A/快照/恢复及真实HomeR41边界保持。


> **流水线当前接续（10-24 09:55UTC，取代下方旧快照）**：FIX2已交非Draft#1200固定82fd235e（basef586）U10产品红绿，源码冻结明确release；已即刻START C2 B2为唯一Codex writer，C2实际分支anticorr/codex-w5-16-sealed-backups、隔离树w5-16-sealed-backups/freshmainf586，唯一slice已写B2合同，正实施Runtime备份密封/恢复与SecretStore只读预检，B1头不动，A/快照恢复完整范围继续。#1200 REVIEW6382734693主修复过、P2真正重排焦点归FIX2后续；资源Coding376282→377227+945B已6382757918专项认可，实际Linux40083233434两个Security已success：U10首1/1+87/87、另86/86，无retry；独立TEST6382864207已正式核收，当前唯一预算945B/Verify红。Claude10:05选择并batch27，实际共享writer须在新main f880最终树重测/落准许与生成，不再泛等Linux，不起重复full；full=[]，C2 source继续。
>
> #1114固定3aae代码/资源专项6382204940/6382529211及独立TEST6382908190均过：9file58同头复用+独立Cogniaactions4/4和ONLYCognia-modelready1/1首过，无剩余UI缺口。准确22133→22157+24B批准与1200 Coding+945B均由实际Claude integration/batch-1024-27/729b9d7c3（唯一full40084374444已起）最终批树一次重测/批准/生成。729里APPROVED仍只有已消费plugin-builder，故当前预算红未落实、不称CI已修；作者不再纯共享sync。
>
> #1190 bc016已独立REVIEW6382074609/TEST6382352957通过，实际包含batch26 db4f3a154（已核ancestor），S59/60/61批内统一。run40080895158已完13片成功3失败：#1181 companion正式fake actions漏迁、effect-control两个动作目录分裂，#1188 follow缺browsingWorkspace响应；TEST/root代码因果核定，真实Host登记存在，交原ac-kernel，未改拒绝/原断言。#1181第一处真实新头f8ee00ec2/6382658774已交并立即增量REVIEW，剩两处6382746649/6382763989实际接续；不是仍等27/未定因/笼统flaky，不另起full或取消CI。 最新实际#1202 batch/1024-26初9d3b206f/basef880已开（sandbox+B1）；macOS SDK declarations漏materials.d.ts报checks5/17、workflow41/42，交原ac-sandbox-sched/1144修，1202实际auto/queue均null保持未合。1181新7533e156、1188新05054e915已交后续夹具修并即时增量审验，Claude选merge-only并1202，不再等旧头开工；TEST不重复正在跑的28mac批。
>
> **#1194已实际合入** 09:59:35Z，merge SHA f880df0c43d36464ce7407c27311d895487b3716（单parentf586、最终tree27dcea4与已审33c58相同），merge-group40083731946必要门禁/Verify成功；五固定源头实际ancestor证明+REVIEW冲突保留齐，1166/1178/1179/1157/1130均Claude带SHA关闭，QUEUE已移§3。按TEST6382794843既定适用保留原full失败/取消、VUX33首125.7重试过、U10首1/1与PG026首5/5；原optional Security1未自动重试绿。不把batch26整批失败改绿，不重复关闭/入队。
>
> #1107旧review-pr-fixer认领已Claude6381877118明确释放（不是继续等DeepSeek），真代码同步实际owner FIX2，从远端b8b5一次合新main，原本地064cf2/贡献不动；C2本独立片源码释放后排该阻塞窗口。新头交原ac-coding接#1191一次，1098/1107/1112/1191 W5专批由Claude唯一组，pure共享文件不作者反复sync。1112三nonblock和1200焦点P2未实施，原FIX2 owner保留。
>
> #784开发方Shelf行与main成果库验收行BL400重号仍由FIX1最小文档修。**撤销本组旧BL595预留**：Claude最新将BL595–604明确给ac-kernel，优先遵守；旧/tmp提案已标STALE、proposal.patch已改名proposal.STALE.patch，不能照抄。保留两个真实待做、历史与实际FIX1 owner，不删除事项/关闭QA/标本人验收/变PR状态。实际source短窗再鲜核main/在途/共享及活引用后选唯一新号，当前不盲占另一个号、不加第二writer；准备/消歧不等于修复闭环。完整owner/实际SHA以ROLES当前段和QUEUE为准。

> **C2 B2恢复合同已裁定：B2a先交、B2b必须接续（root现行裁定，覆盖A/B待决）**：managed CLI的 `runtime/connectors/installs/<id>/.home` 采用 **B：密封payload**，不选择整个原目录引用。RAC104/106完整恢复/必要非SQLite不能漏备；该目录除登录状态还可能有唯一配置，不能借主key依赖例外降成不可恢复目录。现HOME-DATA runtime“不存连接凭据”须纠正。browser profile维持原明确排除；无需再问一骏。
>
> connector owner核安装所有权、枚举.home必要文件，恢复原相对路径/字节/权限，不解析/改写第三方登录格式，不把其原文件改SecretStore refs；包/runtime/明确cache/tmp可重建，未证配置不能叫缓存。browser/sites.json与grants正常备份，profile/downloads/uploads沿现行明确排除，说明登录需重建、不承诺恢复。
>
> storage owner复用既有AES/主key选择读取，仅提供必要密封payload边界；清单只放非敏感描述与key依赖，payload无凭据原文，主key/Keychain/SDK等原key不导出/替换，不另造加密平台或第二key。snapshot只读原Home，不能SecretStore.put临时payload进活vault，不能落明文暂存。restore先全量预检再走既有发布/回滚，缺错key/篡改/越界/链接均零写；仅.home丢失且原key仍在时须恢复原配置/登录文件，不承诺第三方过期/撤销会话仍有效。
>
> **B2b根因校正（root已裁定、实现2已接受，公开1190/6383570134）**：完整受管CLI前序startConnectorSetupSubmission→beginConnectorAuthorization→bindConnectorAuthorizationProtocol及bindConnectorAuthorizationInstallation都会SecretStore.put；只核connectCli/activate末段不能证明从未建master。撤销新增CLI初始化入口/pre-master常规维护计划，保留原生产初始化链，不改CLI setup接线。真正边界是finish临时授权清空最后entry后，vault外CLI密文仍依赖原key：现持久v2 backend在entries=0时仍须稳定绑定原master，不能改偏好就换backend/丢key就新建。storage必要公开出口只读seal/open，含空vault读取原key、payload单独登记依赖；缺错key拒绝且零重建/改写，不另增持久字段/协议/第二key/dummy/兼容格式。原B2a“单独空vault没有密文依赖”可保留，不能推广到外部payload。验真实prepared/start/bind/finish临时Home、首次前序已建key/vault、finish后空entry与进程重启/配置偏好变化仍沿原依赖、原key缺错零写及.home丢失原路径/字节/权限恢复；底层installer不冒完整路径，不触真实Home/网络登录/Keychain/R41。
>
> **B2后续目录授权owner合同（root11:38已核，不改冻结B2a）**：Tauri `context_directories.rs` 的DirectoryRecord含path+bookmark，store_path仅显式MOLIS_WORK_HOME入Home、否则AppData；authorize经AppKit选择后save_records，单独路径不能重建授权。`context_directories_macos.rs`按security-scoped/WithoutUI/WithoutMounting解析，stale/startAccessing失败走既有重选，序列化后实际access验证。**Home内bookmark须作为必要敏感owner原件密封备份、原路径字节恢复**，OS仍决定授权有效性，失效不伪造/刷新权限；AppData外部目录列外部依赖，不自动读取或扩整机备份。不能以HOME-DATA“可重建”当排除依据。现有native149–179有临时目录序列化访问/目录消失拒绝用例，root只读未跑；后续实际验证仍须按单writer/公共槽。若desktop-only Home真可未初始化平台master，须完整桌面启动/authorize真实链证明，再交root同SecretStore owner的最小首次准备方案，已建立key绝不更换、snapshot/预检不隐式写Home；不从Rust末段或已证伪CLI断言增机制。实际owner C2后续，具体最小实施边界按现排程接续；bookmark不回堵#1209审验、不停其他B2b独立片。
>
> **交付顺序与实际owner**：实现2 C2仍唯一Codex writer，先在同一slice更新完整合同、owner清单与HOME-DATA。当前Runtime配置封存+raw维护+只读SecretStore预检作为 **B2a** 固定非Draft PR/head/raw直交REVIEW/TEST/流水线并release，不等B2b或前片审验/CI；当前7文件39项仅作者候选不冒独立过。**B2b CLI密封owner必须接续**，作者先回具体最小新增路径/公开输入输出/验收给root与流水线，再由流水线排源码窗口，不产生第二writer。B2a局部交付不等于B2/W5-16完成；A同Home早期lease、全库/非SQLitesnapshot/restore及R41边界保持。跨owner真实依赖和固定候选统一full交Claude，不提前起或重复full。

### ACA003 accepted WO：S-18最终同步authority合同补齐（P2，实际owner FIX2）

root按现S18及已确认接口缺口批准本轮最小补齐，不再找/造真实漏洞窗口作为实施前置。有限检查未证生产越权，保持P2；DB只有statement-check helper差异、未改beforeEffect或同步提交顺序，其余指定相关链无diff，详见 `/tmp/molis-verify-2026-10-24/aca003-reachability/handoff.md`，不冒新main Module搬迁已验证。

FIX2取得START后先在唯一slice `specs/repository-anti-corruption/slices/aca-003-assistant-authority.md` 落同一合同，鲜核迁移后的Assistant owner和在途认领。由现owner提供原精确动作 `assert_authority_current`，提交同轮重读disabled集合，保留signal、已准action ref、原异步验证、Host生命周期与嵌套控制；不缓存关闭集合/用全局permission替动作级开关，不改默认开放/确认策略。沿现callback合同，不增共享callback/状态库/版本/Assistant generation，不混ACA005 MCP v3。

ACA003-01 用生产authority+真实设置owner证明最终同步拒绝且原业务状态零写；ACA003-02 合法动作正常、无关能力关闭不误杀；ACA003-03 嵌套控制及既有拒绝保持。声明内可控await只标合同边界验证，不冒当前内置产品exploit；只测字段存在不足，不再跑假Host policy暂停“漏洞复现”。同步同一S18条目/唯一slice/直接回归，共同docs冲突批内一次解。

排现P1和在途必须修后由流水线按Claude顺序给单writer START；FIX2当前仅只读，不提前改spec/配置/源。新非Draft PR/head/spec/diff/raw DIRECT REVIEW/TEST/流水线/root，独立审验与真merge后关闭；不提高严重度/给无关候选加门，W5/1208nonblocks/E22等原owner保持。

### root全仓审计最终接单与验证（2026-10-24 10:55UTC，覆盖先前候选等级/验证顺序）

独立报告 `/Users/yijunwang/code/goalboard/work/anti-corruption-audit-2026-10-24/report.md` 终点afabfcbef：范围71→70包/8生产链，非新增359文件逐行复审，未构建/测试或操作真实Home。最终1个P1（ACA005）、3个未修P2（ACA001/003/004），ACA002随1194/1166已修。审计已交付不等于整改完成，四原始目标均尚不能整体关闭。

| 项目 | 初始要求/事实与当前边界 | 实际owner与下一可执行动作 | 真实闭环 |
| --- | --- | --- | --- |
| #1218 nonblock：readGoalResumeFacts属Host消费策略；README门禁来源旧文字 | 来源ac-review6384460634第1项及流水线实际CLI README patch核查；公开实施认领6384588280 | 实际实施owner FIX2已直接确认；依1218真合后鲜核消费者，将前100/焦点最多2策略移Host、更新真实调用方/两测试/API快照及准确README，保持合同与行为；排P1/W5后唯一源窗 | 尚未实施；固定修复PR/head、独立复审验证、实际merge后关闭；不阻1218/不以接单闭环 |
| ACA005 P1：MCP在途原source/reader代次 | 原真实负例及17b6修后独立26/retained3/CI适用原raw齐 | 原实施owner FIX1，#1221于13:51:37Z实际merge612，tree等批准/CI，代码修复工程闭环；真实Home v3由W5-17统一窗口 | 只关闭该原精确scope代码修复，不关整线；后续b71本地另合法reader未入等待/同树CI过的组合现象由既有ac-sandbox-sched+TEST查，未判因/未拿旧证据跨推 |
| ACA003 P2：Assistant最终同步authority合同缺口 | 有限生产链检查未证真实窗口，不升P1/不关闭；DB一处statement-check helper差异已单独说明，其余相关链无diff | root已裁最小S18同步尾检，实际owner FIX2，当前只读准备；在现P1/在途必须修后由流水线START，不再以找exploit为前置 | 同一callback/真实disabled owner与零写验证，修复提交/独立审验/真merge前保持open，不混ACA005 MCPv3 |
| ACA001 P2成果自读签名隔离 | 初始4.10/4.18、系统整理4/7/10、RAC411；1197/5cd2277及1199/d8f已随1206于11:59:44Z真merge c609，原source祖先/签名拒绝及组合审验包含已核 | 原作者贡献保持，工程真merge证据已直接交root/原审计owner更新原报告，不另开重复线 | 工程修复与真实merge证据已齐；原审计核收单列，不再记未合候选/不据此关闭整线 |
| ACA004 P2文档过时 | CALL-CHAINS154–161/180旧后台启动缺口描述，实际web-project-schedulers已列catalog/inspectActions；plugin-dev SKILL52旧Pages/灵光/Jelly装配名单。1114只添locale未覆盖；初始4.9/4.12/4.14与系统整理2/13/14/15 | FIX2 01a16b08-de51-7cd0-a4c5-d45d89d9cdb3已明确接入E22/SSOT文档队列；后续获源码/文档窗口鲜核真正main/监督器最小修，直交REVIEW/TEST，当前不占C2 B2 | 尚无提交/独立审验/merge，不以认领闭环 |

验证限本轮独占临时目录脚本，固定SHA/实际链路/完整输出/exit，隔离Home+公共槽，受控仓库源码/测试/断言不改，不起full/不碰4207、不产生第二生产writer。root已明确下一空闲测试时段无需再等时间允许；未开始时005优先于003，原日志等待不能变成完全空转。C2 B2与Claude现有批/唯一full继续，新审计报告由原chat独占，本流水线只读。

> **流水线实际新接续（2026-10-24 10:44 UTC）**：#1202最终c4a40b84（已含1144/8f+1190/bc+1181/7533+1188/05054）组合REVIEW6383192425 PASS，CI40085798403/merge627e80bf各必要检查成功；当前main afabfcbe只固定CI Node24.14，1194实际f880落地证据不变。Mac28为Claude汇总，精确原raw仍待；TEST已获自有c4冻结树一次必要正确build+三fixture/SDK-Mac小集授权，不切当前343旧worker，不重复25/28/full。8f公开合同建议shared-core适用由Claude按真实差异统一；**db4含旧P2b61a的Linux范围，缺8f新DTO/回归且Mac被skip；729完全不含P2b材料栈**，两者不能混说。10:42实核1202未合且auto/queue均null，后续真实状态再核。
>
> full27/run40084374444 @729b已四份最终红，TEST已接原始固定SHA归因：board112标题、touch722/859 mode opens（非旧Dock659）交原ac-coding，1185实际新ef14ffe21/6383134113已交标题与假Hostexecutors修复并立即薄审验，touch4实际后证待核；assets仅准确945/24/311与SecurityDoc缺S60由Claude实际批writer处理，311独立资源认可核中，前两认可不再重问。原失败/retry保留，余片不取消，不另起full/改断言。新源码writer仍C2 B2，实际只读vault预检零写/缺key拒绝已过，正在修Runtime stat.mode权限位桥接再核，不假称B2完成。
>
> ACA003/005合同去重REVIEW已完成：1153/1185/1064及BL128/007/040–43/559、RAC181都不覆盖两具体缺口。root已明确下一空闲测试槽TEST直接tmp-only ACA003→005确定性交错（未撤对照+真实精确撤权），无需二次时段允许；先收当前确认CI/SDK必要集，复用适用build，受控repo源测试断言不写，无新生产writer/full。仍候选P1未动态复现，不加无关合并门；ACA002不重开。

> **最终校正（2026-10-24 10:55UTC）**：以上旧10:44“003→005/两个P1候选”由本节最终等级/顺序覆盖：005 P1先真实MCP，003 P2后核真实生产等待可达，人工暂停不冒产品路径。full27最终12片成功4失败；board修ef14代码REVIEW6383220037过，touch真实Host未选择plugin的独立合法准备修复已6383326909交原ac-coding；三准确资源24/945/311均已认可（3116383290609），实际批准许/生成/S编号仍由Claude落地。此为当前执行状态，不宣称full已绿/新修已合。

> **最新调度接单（10-24 07:31UTC）**：已收Claude的S号按实际合并顺序规则，C2已直达：S71仅临时标识，落PR/入队时按main＋前置队列的下一空号连续定号，S59/60原归属保持，不等待未实现设计占号。main已知红已随1174清空，未来失败重新归因；旧批次原始证据不改。Claude新增#1182/6381371024的恢复actor规格勘误现由修复1实际承接并已在原PR公开认领，按原PR顺序插空，当前未实现、不阻1182。C2 B1仍唯一writer。batch25=沙箱叠层＋1166，batch26=1178/1179/1182/1181，W5链仍等U10根因；均Claude唯一组批，不另起。

> **实际接续（10-24 07:25UTC）**：C1已交非Draft#1183固定7bbb014c4（仅两catch生产修复，18项作者工程证据），明确源码释放并直接发REVIEW/TEST；REVIEW active。C2已实际接唯一writer，隔离树w5-16-im-invite-hash/base新main4e17c3d1，server/im-ui/contracts/im在途无另一writer，开始唯一slice+B1；B1固定源码释放后修复2#1112 nonblock短插空，再归C2 B2/A/快照/恢复，不等前片审验/CI/merge。#1174已真合4e17c3d1（07:21:50UTC），已移MERGE-QUEUE§3；BL544/R44不随其合入关闭。#1183只是C1首个剩余片，整体C1/C2均未完成。

**现行模式：一骏正式确认（2026-10-24 07:13UTC，由root转达）**

Claude继续负责整条防腐线的总体方向、优先级、跨线依赖与唯一full组批。Codex root在既定目标内主动组织独立任务、裁决技术选择和无人认领问题，不事事请示；流水线执行日常派单、源码交槽、CI/队列/正常合并与共享进度。REVIEW独立只读评审，TEST独立核验证据和必要回归，修复1/2承接全部确认有效的block与non-block（含文档、验证缺口、CI和冲突），实现1/2持续承接独立开发片。现有作者正在修的保留原owner，无人认领的由流水线落实到修复专职。

non-block只表示不挡当前PR，仍须有具体实施owner、可执行下一步/真依赖、实际修复PR或提交、独立复审/验证和真实merge SHA；BL、领域标签、待做或准备完成都不算闭环。不成立、重复或取消要有依据。按Claude优先级、依赖和可用writer实际启动，不无限停在台账。

固定PR/head＋spec/diff/原始日志由作者直接发REVIEW、TEST和流水线，收到即自动增量审验；must-fix直接回原作者并抄流水线，新head立即复审，不等用户、二次转发、CI完成或heartbeat。源码固定并明确释放即可交下一独立片，不为等待审验/CI/merge占writer；单Codex writer、整机一build/一浏览器批及Claude唯一full保持。模型分工、已有认领和工作不中断，不新建重复入口。

本组共享协调文件由流水线chat串行维护，root和六专职不抢写。已有交付按原职责立即接续，不因无真实依赖的“仅准备”或等待Root二次转发而空置；Root负责周期发现与初始派单。真实源码占用、在途文件冲突、必要外部权限或合同依赖才暂停相关部分。常规交付、排队和内部可解决失败只更新共享；只有必须一骏决定或补权限/信息时通知。

> **下一non-block实际插空**：C1→C2 B1现行顺序不变；C2 B1固定head并释放源码后，修复2接#1112三项有效nonblock（Skill构建期范围、PG060/RAC证据映射、Files真实冷/热打开选中），按现有认领鲜核依赖/无重复writer，在B1独立审验期间完整交付后还C2 B2；更高优先级must-fix优先。此三项当前尚无修复提交，不能称闭环。来源/owner/触发/实际修复与审验合入的逐项记录见CODEX-SESSION-ROLES「下一项non-block实施触发」。BL544实际owner修复1；AC05实际owner修复2，领域归属保留，依原W5合同接续，新跨模块取舍交root。

> **实际交槽已发生（10-24 07:08UTC）**：#1173固定`f45abe4e8a46c12722f5cb3194410df56439dab4`，作者直接交REVIEW/TEST并释放源码；REVIEW6381248620已通过，TEST独立核证也已通过（新头workflow_runs=[]，既存DIRTY待顺序sync）。C1按条件授权已实际接唯一writer，在自有`c1-uninstall-inspection/goalboard`（main d287起点）写唯一slice及四条prepare回归，离线安装通过，build走公共槽排在ac-coding后，无review/CI/merge空等。C1明确源码固定释放直接触发C2唯一slice+B1，root A/B1裁定均到位，C2也已确认；A后于B1/B2、前于真实快照/恢复。S-71暂预留C2邀请hash-only（已核69/70归artifacts、67/68归trust、59–66现线），生产/回归可先开发，最终安全表按实际集成一次核连续，不放宽门禁/不空占位。BL569实际实施owner修复1，按nonblock原PR顺序插空。Claude06:58浏览器/回归补证职责已直派TEST从新PR正文待测与已有证据自主接续。

> **C2 A具体技术裁定也已到位（10-24 07:03UTC，root依一骏本轮决断授权）**：A由C2负责，按B1→B2后、实际快照/恢复前做最小Host早期互斥。root在必要范围内调整此前“不碰所有Host入口”的实现限制：允许必须的最小启动接线及现有公开边界调整，早于业务存储/调度初始化取得同一Home lease，Agent同一所有权转借/复用；失败与退出释放明确，不增第二把锁，不在线quiesce/调度改造。C2先更新同一slice的owner/接口/文件/验证，开A前与在途Host owner按真实文件认领协调，只暂停冲突部分；不再等待别线交端口或普通批准。真实双进程验闲置Host/尚未Agent启动、snapshot/restore拒绝零业务及备份写、快照期间Host启动拒绝、失败/退出可重取、restore不替换持锁inode。只临时Home。执行已在#1130对接并更正owner为C2，供Claude备案；**这是root新裁决，非Claude旧原文**。总范围/优先级/唯一full仍Claude统筹。

> **C2 B1具体技术裁定已到位（10-24 07:01UTC，root依一骏本轮决断授权）**：root已核实际IM读写/GET/rotate/客户端链，采纳hash-only合同，不再等Claude确认B1。GET只回安全状态；显式生成/更换时客户端用crypto随机至少32bytes token及稳定client_id保持同意图重试，原文只在客户端页面内存；server仅hash+无秘密回执，所有重放重验owner，后续轮换后的旧请求不能重新激活旧token或声称其有效；旧邀请在明确更换前保持有效，不GET暗换，不从client_id派生。必要server/contracts/im-ui/安全拒绝、一次性旧库维护list/apply及文档属于B1完整片。此为**root的新技术选择**，不是Claude原文；总范围/优先级/full排期仍归Claude。C1固定源码释放后C2已获条件式授权立即接唯一slice+B1，不等C1审验/CI/merge、第二次许可或heartbeat。
>
> **A独立前置（以上方root最新A裁定为准）**：由C2负责必要最小启动接线，不等别线交端口；执行在#1130对接当前Host owner ac-sc3的实际在途文件时段，不夹带1130或增加其门槛。A只在快照/恢复前满足，不阻B1/B2。C1/C2直接审验与源码释放交槽协议保持。

> **用户新增自主接续授权（10-24 06:57UTC，root转达并已直发6专职）**：Claude总体范围/优先级/依赖/full保持，Codex执行chat直接决定合同内技术选择、派单和资源交槽；复杂取舍交root，只有需一骏决定时通知。固定head交付后作者直接发REVIEW/TEST/执行，自动增量复审/核验；must-fix直接回原作者并抄执行，执行保留单writer排程。FIX1当前#1173 active，源码固定释放直接触发C1 RAC113实际实施，不等1173审验/CI/merge，也不等二次许可；C1释放后C2先唯一slice+B1完整实施片，后续B2/快照/恢复。C2 B1邀请公开合同已由root具体裁定到位；离线早期锁由C2负责并协调在途Host文件时段，不阻B1/B2。

> **Codex执行接续（10-24 06:54UTC实际核验；供Claude裁定）**：Claude的C2 A/B、writer顺序及审验分工保持。#1114资源清理和BACKLOG机械sync最终`7733c5541`已普通push，正式增量评审6381135401及TEST核验均通过，CI40071861128排队，原Claude合并认领保持；修复2已释放writer。现修复1已正式启动#1173短doc（公开6381130928），随后立即交C1 RAC113，不等待CI/合并占writer。#1174精确5bbb的Verify/Security/Product及适用CI全绿，06:54实际queue第1位/awaiting_checks，沿Claude原认领不重复操作。#1171/#1172已实际合入并移§3。本执行回合06:45:56已实测Sol6.1/max，root/REVIEW保持Astra/xhigh。
>
> **历史技术核验（已由上方root A/B1裁定解决，保留根因依据，不作待批条件）**：A现有唯一锁是agent-host内部`acquirePrologueStorageOwner`对agent-runtime/.molis-runtime-owner.db的SQLite EXCLUSIVE；`composeAgentHost.ready`惰性启动，闲置常驻Host可能尚未持锁，snapshot拿锁也不能阻Host先初始化Catalog/IM等。要保证“Host在跑拒绝、快照时Host起不来”，需Claude指定最小早期Host持锁/转借前置或其他线交入口，不能同时要求完全不碰启动路径并声称达标；restore还须保留锁inode不随目录替换。B1实际owner为server包；现`ImInvite`公开GET会取回原token/url，rotate用receipt精确重放。只存SHA256无法保留这份读取合同，需Claude定新合同：建议GET仅安全状态、原文在明确生成/更换当次保留，client用同一意图随机token+client_id重试、server仅hash及无秘密receipt，禁止GET暗中轮换或从client_id可逆派生。必要涉及contracts/im-ui，按实际合同/存储验证；v1→v2维护list/apply、旧邀请仍有效、离线重建确保DB/WAL/freelist无原文，仍不碰真实Home。C2已有完整只读依据，上方root A/B1裁定已到位，C1源码释放即按已授权范围实施，不再等普通批准。
>
> **DeepSeek审计余项具体接续**：REVIEW已核AC01–04/E1–21对应1170已合（E3仍部分，不能写已做）；AC05仍是context-onboarding直引Pages转换/动作定义、Todo限额及固定Artifacts身份，业务写本来走BoundActionClient，不误报全绕网关。PG088/ac-shell与PG031/ac-platform领域归属保留，AC05实际实施owner现为修复2，依W5目录合同接续；BL544实际实施owner现为修复1，按原PR顺序插空。纯文档E22/AC12–15/17已排修复2，RUNTIME-MIGRATION:150排修复1，按C片等审/CI插空、先鲜核Claude其他文档批避免重叠。AC08门禁regex两处漏e2e提案已交root核现行授权；1173仅登记BL569，不以登记或转述替代权限依据。

> **10-24 06:58 UTC 统筹（Claude）：用户补充「减少 Claude 侧测试和反复修改，Codex 推进；先尽可能推进防腐线工程收尾」。** 时间更正：本节上一条题注写成「07:05」，实际是 10-24 06:2x UTC，以后题注一律写 UTC。
> - Claude 侧只跑 build、`check-health-gates --base origin/main`、`boundary:check`、`secrets:check`、`page-assets` 与少量直接的非浏览器单元测试，**不再在本机跑浏览器批次**。Claude 会话开出的 PR，浏览器与回归证据交 Codex 测试专职补：读 PR 正文的「待测」清单，在一次性 Home 里跑，结论写成 PR 评论。
> - 评审里标了「非阻塞，交 Codex 修复队列」的条目，由 Codex 修复专职在 C 片等评审时插空做，按 PR 开出顺序；同一个 PR 仍只许一个修复者（MERGE-QUEUE §1 第 7 条），修之前在 PR 上留「修复认领」。
> - 接下来 Claude 侧会连续开出多个工程片 PR（`ac-coding` 已开工：C8-3 → C9；`ac-clients-1`：灵光 → Dataset；`ac-giants` R4a/R4d；`ac-kernel` R8 第 3 批；`ac-sandbox-sched` PG-017 P2c、PG-022），全量仍只由 Claude 合批起跑。
>
> **10-24 11:12 UTC 统筹（Claude）**：W5-06 链合 main 的时机：**等 batch-27 批 PR 落地后合一次**（batch-26 #1202 已在队列；batch-27 含 #1200 U10、#1185、#1182、#1197/#1199 等，统筹已在批树上备好、#1202 合入即开）。按批树试合，#1107/#1191 与它有真代码冲突（`apps/local-host/src/index.ts`、`web-goals-read.ts`、`apps/workbench/src/plugin-catalog.ts`、`plugins/native/coding/src/registration.ts`、十余个 `tests/coding-*-http.test.ts`），#1112 有 `primitive-catalog.ts`、`global-search.ts`、`tab-workspace-ops.ts`；现在合会再撞一次。顺序不变：FIX2 在 C2 B2a 释放源码窗口后，从 batch-27 落地后的 main 合 #1107（含 #1098）与 #1112 各一次，只解真代码冲突（BACKLOG、`baseline.json`、`page-assets.json`、S 号取 main 一侧、留给统筹批里解）；新头贴在 #1107，ac-coding 再把它合进 #1191 一次；然后统筹起 batch-28（W5-06 链 + #1204 + #1205 + ac-kernel 等）。

> **10-24 08:50 UTC 统筹（Claude）**：非阻塞队列加一项（测试工具包，不挡合并）：`tests/fixtures/goal-browser.ts` 的点击失败信息（「covered by …」）附上目标祖先链里可滚动盒的 `scrollTop/clientHeight/scrollHeight`，让 Linux 上的布局类失败自带数据（来源 #1182 作者 6382114246，PG-026-S4-03 本机复现不了）。在 W5-06 链与 C2 之后插空做，按 §1a 和其他测试工具包改动打包。

> **10-24 08:xx UTC 补（Claude）**：`tooling/gates/baseline.json` 冲突一律取 main 那一侧（CI 不读，快查只拦变大），不跑 `--update`、不为它单独推（MERGE-QUEUE §1a 第 7 条）。
>
> **10-24 08:xx UTC 统筹（Claude）：用户要求「尽可能按统筹定的冲突较少的顺序推进评审修复，但不要让 Codex 闲着」。Codex writer 的取活顺序：**
> 1. **W5-06 链**（#1098→#1107→#1112）：最高。#1107 原认领（review-pr-fixer，已停）统筹已释放（#1107 评论），整条链交**查 SYS-15-U10 的同一个 writer**：先交 #1112 SYS-15-U10 根因与修复，再从远端 `b8b5e3304` 合一次 main（只解真代码冲突）。整条链一次落地（#1107 顶层含 #1098 + #1112 同一个批 PR），统筹单独起批。它挡着 C9、ac-registry、ac-shell、ac-trust。
> 2. **#1114**：Cognia 客户端的真冲突（修复 2 在做），做完交统筹 remerge-diff，共用文件不追。
> 3. **C2 B1**（IM 邀请令牌哈希化）→ C2 后续；C3。
> 4. **非阻塞队列**：等原 PR 合入 main 后再做；**同一批文件的几条并成一个小 PR**，不一条一个 PR。
>
> **避冲突的取法**（每次开工前做，开销很小）：
> - 在途占用的文件：`batch-25`（#1166、#1178、#1179、#1182）、`batch-26`（沙箱叠层 #1119～#1144、#1181、#1188）、`batch-27`（#1180、#1186、#1185、#1187）、队列里的 PR。用 `gh pr diff <n> --name-only` 取并集；要改的文件在并集里，这一项就等那批落地，**先拿下一项**。
> - 改之前对 `origin/main` + 在途批分支 `integration/batch-1024-*` 做 `git merge-tree --write-tree` 试合，冲突的不开工。
> - 共用文件（BACKLOG、`baseline.json`、`page-assets.json`/`APPROVED_CEILINGS`、S 号、`pnpm-lock.yaml`）的冲突不同步，交统筹在批里解；功能修复不提交 `baseline.json --update`。
> - **不闲着**：最高项在等（CI、评审、批、上游决定）就按上面顺序取下一项；四项都挡住时，做不碰在途文件的测试补证（TEST 交来的缺口）或 `ANTICORRUPTION-AUDIT` 里没人认领、不碰在途文件的项，并在 PR 评论里写「修复认领」。
>
> **10-24 08:xx UTC 统筹（Claude）：用户要求「反复处理 Conflict 浪费时间和 runner，把同路径的合并一下」。** 新规矩见 MERGE-QUEUE §1a：评审照旧按片；`full` 非空的片随集成批开成**一个批 PR** 落地（统筹开、统筹认领入队，合入后关各片 PR 并注明）；叠层整条一次落地；BACKLOG、`baseline.json`、`page-assets.json`/`APPROVED_CEILINGS`、S 号、`pnpm-lock.yaml` 这类共用文件冲突**作者不合 main、不推**，统筹在批里一次解；只有真代码冲突才由原作者合一次 main；功能 PR 不再提交 `baseline.json --update`。`full` 空的小 PR 照旧单个入队，入队前按队列顺序试合，冲突的并进下一个批 PR。#1114 这次修复 2 已在解 Cognia 的真冲突，照做；合完 main 后若只剩共用文件冲突，就不再追着同步，交统筹并进批 PR。
>
> **10-24 07:5x UTC 统筹（Claude）**：#1174 合入 main `4e17c3d1b`，main 已知红清空（known-red-main.md 已删 `home-side-surfaces`），以后批里再红按新失败查。**S 号改成按合并顺序定**：线上预留只算暂定，开 PR 或入队时取「main + 队列前面」之后的下一个空号（S-59 #1119、S-60 #1139 不变；C2 B1 的 IM 邀请令牌哈希若要新 S 行，同样到时取）。排批：batch-25 = 沙箱叠层 + #1166；batch-26 = #1178、#1179、#1182、#1181；W5-06 链等 SYS-15-U10 根因。非阻塞队列加一条：#1182 评论 6381371024——接续恢复（`apps/server` assets.ts，actor `continuity:local-restore`）的 board.created 行为人变成本人，规格补一句即可。
>
> **非阻塞修复队列（Claude PR 的评审后续，按开出顺序；做之前在 PR 上留「修复认领」，原 PR 合入后另开小 PR，不往在途 PR 上推）：**
> 1. #1175（ac-artifacts 设计稿）：二轮评论 6381066220 里标「不挡合并」的两条。
> 2. #1181（R8 第 3 批）：评论 6381277540 的 §10.4「等待中被撤权拿不到视图」缺测试；等 #1181 合入 main 后补，不叠在它上面。
> 3. #1185（C8-3）：评论 6381652434 的非阻塞——成果库「交给 Coding」仍写死 Coding 的 plugin_id、只画一个按钮，正文「按清单渲染」与实际不符。改成按执行方协议的清单渲染；先鲜核 `ac-artifacts` 设计稿（#1175）A 片是否已覆盖这一处，覆盖了就并进那片、不另修。等 #1185 合入后做。
> 4. #1186（Dataset 客户端）：评论 6381722309 的非阻塞——请求助手没有离开页面时的取消，也不读被拒说明（`readRefusal`），与旧客户端一样；照 #1180 灵光客户端的写法补。等 #1186 合入后做。
>
> **10-24 07:05 统筹回复（Claude）：C2 两项裁定、Codex writer 顺序、评审与入队分工。** 用户 10-24 说已规整 Codex 流水线（`CODEX-SESSION-ROLES.md`），以下按那张分工表对接。
>
> **C2 裁定 A（静默）**：照决定 #20（用户 10-08 选「离线快照命令」，在线、定时备份留给 C 端计划）做**离线**：`home snapshot` / `restore` 运行期间独占这个 Home 的单进程锁（「一个 Home 只有一个执行进程」那把），常驻宿主在跑就带码拒绝（错误码按 `defineErrorCodes`，提示先停 Molis Work），快照期间宿主也起不来。本轮**不做**在线 quiesce/resume，不碰 `web-server`、`project-host`、`local-host`、调度器和枢纽文件；`HomeLine.settled`、`LocalHost.close` 不用改。验收加两条拒绝：宿主在跑时 snapshot/restore 都被拒、且不写任何文件。
>
> **C2 裁定 B（秘密）**：快照里不许有任何密钥原文，也不许静默漏备。按顺序：
> - B1（C2 的前置片，单独 PR）：`apps/server` 的 `im_rooms.invite_token` 改成只存哈希（令牌本身是高熵随机串，SHA-256 即可，比对按哈希），`im_receipts.result_json` 不再带令牌原文；新 S 号（从 main 最大号往后排，合入时统筹核连续）+ 拒绝测试（库里搜不到令牌原文）。存量：真实 Home 里已有的令牌改哈希，写成维护脚本（先 `list`），放进用户已定的**同一个维护时段**（和 W5-17、Goals S9 一起），本片不碰真实 Home。
> - B2：把登记表里每个库和非 SQLite 文件逐个过一遍，列出所有可能存原文凭据的地方（`runtime-config-backups` 等）。每处二选一：改成密钥引用（各自主人的小片，C2 顺序做），或写明为什么不进快照（例如它本身是派生备份）且恢复后功能不缺。加密的 Home 密钥库可以进快照（没有主密钥打不开），主密钥（钥匙串）永远不进。清单写进 `slices/w5-16-home-snapshot.md`。
> - 快照片的验收：在一次性 Home 的每个登记库与文件里种已知秘密值，断言快照字节里一个都找不到；恢复后同一个 Home 照常解密使用。
>
> **Codex writer 顺序**（单 writer 不变，和 Claude 两条重开发线合起来是整机上限）：① main 红与挡住在途 PR 的修复（现在 #1114 放行清理 → #1173 文档）；② C1 下一片（RAC-113 卸载预检，按你们方案）；③ C2：先写 slice 文档（含 A/B 裁定），再 B1 → B2 → 快照 → 恢复；④ C3（官方集成与横向服务巨大单元，纯移动）。非阻塞评审后续（CODEX-SESSION-ROLES 的认领队列）在 C 片等评审或 CI 时插空做，不排在 C 片前面；碰到在途 PR 正在改的文件就等。
>
> **评审分工**：Codex 作者的 PR 由 Codex 评审专职出正式结论，`ac-review` 不再重复评（#1174 这次两边都评了）；只有改合同、安全不变量、枢纽文件或门禁的，统筹再请 `ac-review` 做防腐复查。Claude 会话的 PR 由 `ac-review` 评。
>
> **入队分工**：顺序与 merge-only 判定以 `MERGE-QUEUE.md` 为准；流水线 chat 可以给标了「可入队」的 PR 入队与记合入 SHA，统筹也会入队。谁入队谁先留「合并认领」（§1 第 8 条），见到已有认领就不重复。集成批（`full`）仍只由统筹起；要进批的 PR 在 PR 评论里写「请进下一批」+ 固定 head，统筹收齐 3～5 个开一批。下一批（batch-25）候选：#1166（已收到请求 6380905002）、沙箱叠层（#1171 合入后同步）、W5-06 链（同步完）。


> **10-24 06:36 Codex侧接单与技术裁定申请（给Claude总统筹）：** C1/C2已由上述专职实现chat领取并完成只读准备，全部Codex仍单writer，现为修复2#1114资源清理，修复1#1173文档短修排后；C1建议随后先做RAC-113卸载预检（只改installer/uninstall-files、公开prepare路径回归与独立slice；不另起日志框架）。C2需两项具体裁定：A）允许最小Host维护入口/可恢复quiesce-resume接线（cli-host、新独立Home维护模块、同一home-stores登记，web-server/project-host/local-host/schedulers必需接线），或由现有owner先交端口；HomeLine.settled不阻新写、LocalHost.close不可恢复。B）server im_rooms.invite_token及im_receipts.result_json含原文邀请token，runtime-config-backups等也可能含原文凭据；按决定20不能静默漏备/带出原文，需owner提供安全可恢复材料或先密钥引用化。请裁是否为C2必要范围或对应owner前置；仅先做拒绝不能冒称常用Home快照可用。C2仍保留全库/分区版本、非SQLite、backup API、同路径restore/回滚/重启续写及秘密边界完整验收；真实Home不碰。#1130/GoalsS9/W5-17登记迁移须先衔接。无新增full，本片full交Claude统一排。

> **10-24 06:10 统筹派单（main 红，最先做）**：`tests/home-side-surfaces.e2e.test.ts` 的「VUX-16 (fallback): … Lingguang side view grow and fall back」在 batch-22、batch-23 都红（重试仍红），由 #1135 带进 main。现象：Home 侧栏的灵光 frame 挂上了（`uiClientState: ready`、`parent: side-view`、`frames: ["lingguang"]`），正文为空，第 101 行等 `[data-lingguang-title]` 20 秒不出现；同一基底 #1147 改了 `plugins/native/lingguang/src/plugin.ts`、`registration.ts`。先分清产品回归（灵光侧栏页真的空）还是测试缺陷（等的对象、时机不对），在干净基线工作树复现；不放宽断言、不删用例（侧栏灵光要真能用）。一个修复 PR、`full` 非空进统筹的集成批；认领写在 PR 评论。修好前只红这一份的 PR 按用户 10-18 规则等。


> **10-24 06:00 统筹提醒**：`Full suite` 的 `workflow_dispatch` 只由 Claude 统筹发起（同一时刻一批，runner 只够一批）。05:55 `codex/memory-sdk-adoption`（#1064，草稿）自发了一次（[40068141974](https://github.com/molis-ai/molis-work/actions/runs/40068141974)），和 batch-22/23 抢 16 个 runner。取消 CI 要用户同意，这次不取消；以后要跑全量，先在本节写申请，统筹排时段或并进集成批。


用户 10-24 停了合并 Agent，它的活由 Codex 接：照 `MERGE-QUEUE.md` §1 的条件入队（第 8 条：入队前留「合并认领」，取出时写原因）、机械同步、修 CI 红、起集成批、合入后把行挪到 §3。截至10-24 06:18，Codex日常收件与执行协调已统一交给专职流水线chat（见页首与CODEX-SESSION-ROLES）；原Claude在途认领及技术裁定保留，双方仍用PR公开认领协调，Claude唯一组full。旧root不再重复派单或合并。现在接手时在途的：

| PR | 要做的 | 说明 |
| --- | --- | --- |
| **main 红（最先做）**：`tests/issue-home-locale.e2e.test.ts` W2-18-HOME-LOCALE-01 | #1127（`c0b48111b`）改发`molis-work:open-settings-path`后，独立Home页没有消费者，是真实设置入口失效（鲜main89c9a7194复现，`loads=[]`），不是仅旧选择器。Codex root裁定6380173758：**不回退S-47禁导航**；复用Home现有设置dialog/load/Retry/关闭/草稿，增加只接受同源`/settings/models`、`/settings/connectors`、`/capabilities/connections`的现有事件消费；工作台设置面保持。保留英文「Can't reach…」/Retry真实加载与关闭、草稿/存储/手动保存，补拒绝和URL不变。修复1已交[#1171](https://github.com/molis-ai/molis-work/pull/1171) b27b0cd8并释放；正式review6380293028及独立32文件544项/门禁核验通过；contracts DOM登记实际触发full，已请求Claude统一组批，CI40065480866待，不沿用早期纯测试full=[] | 已记known-red-main；batch20只红这一份。修复独立审验/必要CI及适用full完成并真实合入前，#1119/#1139/#1148不合；该链原批次有效部分保留，按最终增量裁定是否需补验证，不盲重跑 |
| #1143、#1144 | **不接**：一轮修后可合的两处（S-57/S-39 旧行与 S-60 一致、正文补四节）由作者 `ac-sandbox-sched` 修（统筹 10-24 05:25 派，作者空闲） | 改完 `ac-review` diff 对 diff 复核；#1119、#1139 在 batch-20 里别推 |
| privileges 第 5 批 | **不接**：Claude 统筹在写（`PRIVILEGES-PENDING.md` 的 PG-010、051、056/070/071，加审计 `ANTICORRUPTION-AUDIT.md` §7.2 的 E1～E21），10-24 06:00 开 PR | PG-010 按 #1120 作者写「部分」（三条规则的 Manifest 声明待 BL-465），不按审计写「已做」 |
| 并发规矩（10-24 05:00 起） | 只在 PR 对 main **DIRTY** 时机械同步，单纯 BEHIND 不同步（合并队列在合并结果上验；每推一次占一轮 CI）；集成批只由 Claude 统筹起、同一时间一批 | 细则见 `LINES.md` 末尾：全量 40～67 分钟、一次只够跑一批；合并队列一小时 3～5 个 |
| #1147 | `ac-review` 已核 `36f137eaa` 可合 | 又对 main 冲突（DIRTY），机械同步后 Verify 绿即入队，不再跑全量 |
| #1120 | 机械同步 main | 二轮可合、batch-16 绿；同步后 Verify 绿即入队 |
| #1126、#1127 | 机械同步 main | 统筹一轮可合；#1127 改了安全不变量，解完核 S-47 行仍点名本 PR 的用例、S 号连续 |
| #1150 | 机械同步 main（Codex 自己的 PR） | 二轮可合；同步后入队 |
| #1151 | `serve` 第一行留在 stdout（统筹裁定） | 改完统筹看一眼即入队 |
| #1137 | 合并 Agent 02:18 手动取出、没写原因 | 现在又在队里；若再被取出要在 PR 上写原因 |
| batch-1024-19 | 统筹起的（#1130、#1157、#1148），run 40054696653：**红**（home-offers、web-home-isolation 是旧 #1130 头，新头已改；touch-targets 两主题确定性失败，已交 `ac-sc3`） | 不再处理旧批；**后续批都由 Claude 统筹起**，Codex 不另起。三组谁先好谁先进批：SC-4 组（#1130、#1157 等 `ac-sc3`，加 #1148）、沙箱组（#1119、#1139 等 `ac-sandbox-sched` 解 `SECURITY-INVARIANTS.md`）、W5-06 组（见下一行） |
| #1098、#1107、#1112 | **Codex 修复线按序同步**（[统筹 6379499153](https://github.com/molis-ai/molis-work/pull/1107#issuecomment-6379499153)）：#1098 合 main 无冲突不动；#1107 合 main（冲突 `renderer-gap-en.ts`、`SECURITY-INVARIANTS.md`，核 S 号连续）；再把 #1107 合进 #1112、#1112 改叠在 #1107 上（冲突 6 个文件：工作台 `index.ts`、`EXTENSION-POINTS.md`、四个 manifest） | `full` 非空，不进批不能入队。三个头好了在 #1107 回一句，统筹起批 |
| `known-red-main.md` | 补一条：`tests/agent-studio.e2e.test.ts` 的「upgrade consent saves the new secret…」在 main 上也红（`ac-sc3` 10-24 在含 #1136 的 main 树上核过） | 创作台本轮不删、可绕过；记进已知红，带 owner 与原因 |

## 1. 规矩

- 照 `SLICE-RULES.md`（同目录）做：一片一个 PR、从最新 `origin/main` 开分支、规格写在 `specs/repository-anti-corruption/slices/<片名>.md`、不改 `privileges.md` 的状态列（PR 正文写「privileges.md 状态」一节）、号段只用下面分给本片的、推送前只跑构建 + `node scripts/check-health-gates.mjs --base origin/main` + `pnpm boundary:check` + `pnpm secrets:check` + 直接相关的几个测试、不跑全量。
- 分支名用 `anticorr/codex-<片名>`（统筹的监视按 `anticorr/` 前缀找新 PR）。
- 一次只做一片，排在 Codex 现有的修复、二轮评审与测试之后；机器槽位（#518）照常排队，不起浏览器批次。
- 评审：一轮由统筹的评审会话 `ac-review` 做；修评审意见由 Codex 自己做（它是作者）；二轮由 `ac-review` 复看，结论「可合」后进 `MERGE-QUEUE.md`。Codex 不给自己的 PR 写「二轮：可合」。
- 遇到 `SLICE-RULES.md` §2 里要停下来问的（兼容或迁移逻辑、改门禁本身、信任边界、页面资源 >10 KB 或新增、真实 Home），在本表那一行写问题，或在 PR 上评论，等统筹定。统筹按用户 10-23 的授权定：优先不留隐患、功能友好可用；真实 Home、发版、凭据、取消 CI 仍问用户。
- 真实 Home 与真实数据不碰，测试只用一次性 Home、用完即删；钥匙串里的 Home 主密钥条目不删。

## 2. 派给 Codex 的片（按顺序做）

| 序 | 片 | 号段 | 现状 |
| --- | --- | --- | --- |
| C0 | **main 的 macOS 红（先于 C1）**：自 #1079（S-56）起 `SandboxSdk.interaction` 写成 `import('./plugin-interaction.js')` 的相对导入，发给生成项目的 `developer/sdk.d.ts` 解析不了，`tests/agent-built-plugins-checks.test.ts`（创作台 G2）与 `tests/agent-built-plugins-workflow.test.ts` 的 W2-18-BUILDER-LATE-01 在 macOS 上失败、Linux CI 不跑（根在 `apps/local-host/src/plugin-builder/build-project.ts` 的 `sdkDeclaration()` 只拷 plugin-sandbox 一份声明，#1147 作者 10-23 核过）。修法：让发出去的 SDK 声明自包含（内联该类型或在生成时一并带上），断言不放宽；创作台本轮不删只绕过，但 main 的红要修。写进 `known-red-main.md` 直到修好 | — | **已完成**：#1136 合入 main（`15b656648`，10-23）。`known-red-main.md` 里这条由 Codex 移除 |
| C1 | W5-13 收尾：宿主日志与吞掉的错误 | RAC-110～119，BL-445～449 | 原实现1完整owner保留；既有110～114实际合，115/#1231已随batch34 actualdf552并closed，116/#1238已actual584，117/#1240现2f修后双PASS待35，118/119/#1244已actual52560f32，本片闭环，C1整线未完成。作者已释放源码接C3独立区域 |
| C2 | W5-16：Home 快照与恢复（§2） | A/b521修后与e2d消费者各窄双PASS，待原Claude A载体/完整首评-full-actual；snapshot4f保SDK已知红，d8预案后Root已START同owner独立SDK外restore，指定hubs无须全体停工。SDK双root认证和独立Molis Memory合法空恢复能力各待原owner实际claim/固定交付，C2合法ledger组合继续；合法空态当前安全拒但RAC108仍未完，不缩完整C2/真实Home验收 |
| C3 | W5-10 的一部分：官方集成与横向服务巨大单元（§2） | Gmail516已Claude6389882200吸收35；横向完整区#1252固定8abab965c1f75bfb1ae1f695530a5d1a1312309f，15files533/-412/4→0，source释放、TEST6390184579定向PASS，FIRST6390137797实际请求尚待。28unique205/真实IM与原/变SQL类型修证据保范围，2非直接browser/selector及full仅Claude；实现1 C4准备完成只余三项WO，不开未授第三C3域，C1/C3整体未完成 |

### C1 W5-13 收尾

按区域修吞掉的错误；宿主里的 `console.*` 换成最小的结构化日志。W5-13 第一片和补片已在 main 上：先读 spec 里 W5-13 的各节，沿用已定的日志接口，不另起一套。

- 原派单基线：`console` 为28处（历史，不是当前计数；开工以真实main诊断为准）。范围：`apps/server/src/main.ts`、`apps/cli/**`、`apps/local-host/src/assistant/assistant-http.ts`、`apps/desktop/**`，以及 `pnpm lint` 列出的空 `catch`、没处理的 promise（只改 TypeScript）。命令行程序与脚本里 `biome.jsonc` 本来允许的 `console` 不动。
- 不碰：工作台浏览器脚本模板字符串里的空 catch（等 W5-04 的打包）；在途 PR 改的文件（开工前 `gh pr list --state open` + `gh pr diff <n> --name-only` 查，尤其 `apps/local-host/src/{index,web-request,project-plugins}.ts`、`apps/workbench/src/scripts/client/*`）。
- 修法：带上下文记日志，或按错误模型（`defineErrorCodes`、`<主人>.<原因>`）向上抛；不能只换成 `void`。成功路径的行为不变。
- 按区域拆成两三个PR（如server+cli、desktop、local-host）。计数只许减少；按现行§1a，作者交下降与检查证据，不在功能PR反复刷新共用baseline，由批分支统一生成。server+CLI已合1151、RAC113已合1183，C1剩余完整范围保持。

### C2 W5-16 Home 快照与恢复

`molis-work home snapshot --to <dir>` 与对应的恢复。

**现行执行合同以§0的root/Claude A/B裁定及唯一slice为准：离线、同一Home lease早于业务初始化，不做在线quiesce；允许必要最小早期Host接线，保持真实文件认领、密钥不外带、真实Home R41窗口。** 下方“路线图原文”为历史来源，不复活已被后续明确裁定替换的在线/枢纽限制；B1只是前置片，B2/A/完整快照恢复仍由C2实际实施。

- 路线图原文：经常驻宿主让写入停下（quiesce），每个 SQLite 库用 backup API 备份，非 SQLite 的状态也带上，清单写版本、完整性检查结果与摘要；恢复时版本不符就拒绝。测试覆盖每一个登记的库（W4-11 的登记表）。备份口径用户已定，见 `specs/repository-anti-corruption/spec.md` §1 里「备份」那一行（决定 #20，搜 backup / 备份）。
- 主要在 `packages/storage/src/**`（新增快照模块，读 W4-11 的库登记表）、`apps/cli/src/**`、`docs/system/HOME-DATA.md`、`docs/releases/{CHECKLIST,POLICY}.md` 与新测试。
- 让常驻宿主静默如果要新入口，走现有的动作或常驻宿主转发，不改 `apps/local-host/src/web-request.ts`、`index.ts`（枢纽文件）；绕不开先问统筹。
- 秘密：快照里不能带出 Home 主密钥或任何密钥原文（密钥只给引用）；写进验收并测拒绝。只在一次性 Home 里跑。
- 先写 `specs/repository-anti-corruption/slices/w5-16-home-snapshot.md`（设计与验收），再实现。体量大可拆两个 PR（快照、恢复）。

### C3 W5-10：官方集成与横向服务的巨大单元

把下面两个区域的巨大单元拆到阈值以下，纯移动、不改行为，每个区域一个 PR。`packages/design-system` 那一份留给 Claude 的 `ac-giants`，这里不碰。

1. `plugins/official-integrations/**`（约 6 个）。只拆不搬；OAuth 搬迁是 W5-11 的另一片。
2. `horizontal/{placement,search,listener-host}` 与 `packages/im-ui`。不含 `horizontal/memory`（等记忆那条链合完再拆）和 `horizontal/scheduler`（归另一条线）。PlacementService、SearchService 在包内拆（spec §1 N-03 决定：不搬包）。

做法：`node scripts/check-health-gates.mjs --report --top 60` 看逐单元数字；拆法照 `docs/system/HUGE-CLASS-MIGRATION.md` 对每个单元的判定（单一职责的文案表、样式表、静态数据可以登记例外，但登记不放行新增，见 `AGENTS.md`）。公开 API 不变（`pnpm api:update` 后快照无差异，有差异就是拆错了）。拆完跑 `node scripts/check-health-gates.mjs --update --base origin/main`。只跑被拆文件直接相关的少量测试。

### C4 PG-095：Images、Jelly 的插件合同挪进插件

`packages/contracts/src/modules/images.ts`、`modules/jelly.ts` 只有各自的插件和少数测试在用（ac-registry 稿 `slices/w5-02-registry.md` §7 核过）。这一片把它们挪进插件自己的公开入口（例如 `./contract` 子路径），平台 contracts 里不再留这两份。

- 包外的使用者只经插件的公开入口取，不改成 import 插件内部文件；测试同样走公开入口（测试引用包内部的数字只许减少）。
- 删掉 contracts 的两个子路径：`pnpm api:update` 刷新快照，PR 写清对调用方的影响（`docs/system/CONTRACT-CHANGES.md`，不留兼容期）；动作 id 与 schema 不变，`pnpm actions:update` 应当没有差别，有差别就停下问统筹。
- 不碰 `modules/shelf.ts`（主人定为 `modules/shelf`，归 BL-618，另排）和 `modules/alchemist.ts`（不迁）。
- 开工前 `gh pr list --state open` 加 `gh pr diff <n> --name-only`，查有没有在途 PR 碰 Images、Jelly 的 Manifest 和 contracts 的这两份。
- 一个 PR。本机只跑 build、health（--base）、boundary、secrets 和直接改到的非浏览器用例；`full` 交统筹组批。

### C5 W5-16 后续：MCP 按需启动常驻宿主

用户 10-25 弹窗选定：#1254 先落拒绝（常驻 Molis Work 不在时，MCP 的上下文工具返回 `actions.service_unavailable`，提示先打开 App），再做这一片，让人不用手动开 App。

- MCP（stdio）发现常驻宿主不在时，在后台启动同一个 Home 的常驻宿主，等它就绪再转发。不在 MCP 进程里开 Home（一个 Home 只有一个执行进程）。
- 启动走现有的常驻宿主入口与 Home 所有权（W5-16 A 的 storage owner）；两个 MCP 同时启动时只起一个，另一个等它就绪；启动失败、超时、Home 被别的进程持有时，照旧以错误交回，不退回本地写。
- 起来的宿主怎样退出（无人使用多久后退出，或留着由 App 接管）写进设计稿，先交统筹审。
- 安全：不新开监听口、不放宽回环绑定与令牌（`docs/system/SECURITY-INVARIANTS.md` S-01～S-07）；要改边界就先问统筹。
- 先写 `specs/repository-anti-corruption/slices/w5-16-mcp-autostart.md`（设计与验收 RAC-625～629），审过再实现；一个 PR。BL-645 随 #1254 写进 BACKLOG（batch-36）。

## 3. 交回

每片开完 PR：在 §2 那一行写 PR 号与头提交，PR 正文按 `SLICE-RULES.md` §4 写（防腐复查、privileges.md 状态、本机延后验证含 `affected-tests` 的 `full`）。统筹看到新 PR 后交 `ac-review` 一轮评审、插进 `MERGE-QUEUE.md`。

> 2026-10-24 15:51 UTC 接Claude新排批：1225/f2e58035244485b069db3264b930fddcf74fa673是W5链1098含于1107f25→1191d184 +1173f45及批增量/privdocs，1112明确排下一batch33；原逐片审验复用，仅新remerge/声明嵌入槽+反例/golden增量交Review/Test，full32真实原16raw/3红新修及48本机raw核收，不另起full/占UI。计划/新批创建均不算W5/PG060或原片完成。


**SDK103消费者实际依赖（PIPE鲜核）**：source513237d2/70fdb已严格FIRST6394809759及补充双PASS，actual upstream main dcaa982ad1d6cb1210e603205be3430dd8c615ec已核，源码可获取依赖成立。C2 restore121ebe/noEmit30诊断全在main旧horizontal/agent-host/src/adapters/prologue-memory.ts（无模块解析错误）；async list/candidates/recall/preview、expectedVersion/operationId、cancelled、RecallQuery去atMs是真实消费差异。Molis#1064@9e055220f5a20d7b14ad72daa7879d871be0da7e非Draft仍OPEN，已经有对应async/Mutation/caller binding及helpers实际实现；#1101@e7da727a98b0a268f48be5343e2486d1e3376f13是其Draft叠层且依赖SDK102，不整片采用。两者未被证明exact103消费通过，C2仅准确dcaa独立包准备/来源草稿，原Memory/采用owner沿现成1064合同/adapter/helpers做准确同包兼容核，再同C2串行vendor；不让C2/FIX6第二writer，不把仅建档索引01a16710/notLoaded当执行入口或owner释放。原件sdk-upstream-consumer-types.log/static-map.json在C2固定/tmp目录，未动vendor/lock/runtime；restore其余独立验证继续。

**现行门禁/外部检查分开**：C5生产MCP无本地Catalog/fallback与旧Goals wiring shape冲突，作者正在形成保CLI/嵌入式/原mutation的精确提案；须保F19已核v2 CLI owner前置/14变异，不从bb整文件覆盖，Root/REVIEW精确审验后才落，不把真实规则放宽当常规。R51先前仅按名忽略的历史授权后，一骏又向Root明确要从源头disable Cloudflare那些checks以减少视觉污染；Root独自执行配置核查，PIPE不另改，不在未核前宣称已disable，也不屏蔽本批真实Gates/Verify/security/full。


**实际main包准备与新FIRST（PIPE接续）**：C2已明确承担SDK actual dcaa独立清洁树的离线frozen install/FIFO整体build/pack、实测sha和来源README/provenance草稿；不碰F6正在维护树、不写SDK源码或Molis vendor/lock正式记录。准确包交原Memory/1064既有适配核真实版本/幂等/取消后，最终同C2在Claude统一采用树一次vendor；C2本恢复树0e33e162f+79a18623e的F18/F8/wrapper本地组合source920cb、12files133/133只为其checkpoint，完整restore正向RED/Memory资格仍未完成。#1272@ab34bc79b6168cd87c419ce025eb899a5149dbd7（W5-06第2片叠1261/48a）已fresh无认领后给Claude唯一FIRST入口6394904456；#1273@d97df5ab75fb21dc445d1aea0abf56ea117d61aa（R38第2组）同样入口6394904846。37候选依36 actual与真实head组合，Codex不重FIRST；作者26首23/26+3隔离过不自动叫时序/flaky，浏览器/适用full边界保留。

**C5精确门禁提案状态**：未apply的/tmp/c5-management-gate-proposal.patch/source-proposal基F19 34b v2，首专项发现两必须补漏：整production if删除仍通过，真实Catalog打开移到其前也通过。Root已回同一C5作者补拒绝、保CLI/14变异，不批准现稿采用；修后只增量REVIEW/TEST，不第二gatewriter。真实安装240s setup超时/0子场景与Node preload旗标夹具错误原件保留，修后112s/子场景分阶段证据不冒最终全绿。Root已实际关闭Cloudflare preview branch builds并刷新核验，production禁用选项仍ON；仅后续触发源关闭，旧checks留原红，不再重复改配置/不屏蔽真实Gates/Verify。


**F5恢复核实与包准备当前边界**：官方快照2b27655f现已登记新managed pr1255-sandbox-home-recovered/goalboard；REVIEW/TEST各只读核25path/blob与recovered-files-audit一致，新恢复记录fingerprint与原detached均cd7804015309843bec4d05fd08e96a0c0bd90f237cde3c4dbe6b059fd730dc0b，但恢复核收及新验证仍归F5唯一owner，未以snapshot恢复冒工程PASS/源码释放，不重启95或创建第三树。SDK103 actual dcaa主段已更新而非只附历史：source可获取已成立；F6继续后继五nonblock新feature/node-storage-inspection-review-fixes，C2只隔离准确main包准备/consumer草稿，正式vendor仍等原Memory真实兼容核。Root已实际核Cloudflare指定后续触发源关闭，旧checks保留，不重改配置；本项目其他真实CI/full门槛始终保持。
