# T377 采用后的 Full 队列派单准备

负责人：一审线2。2026-10-31，只读工程清单；未派工、未同步或验证产品。

冻结 M=`8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987`（T377 #1707 实际 main 合入，本轮本地 origin/main 相同）。八个 PR 元数据、完整审验评论及准确头 workflow runs 均经 GitHub GET 回读。协调只读对象 `/Users/yijunwang/code/mw-coord` HEAD=`cbd32e43211b30e3e2efe7bba3d2c13c1fccfaeb`：读现存 T347/146/353/345/299/373 任务书及 README；该对象未找到 T148/T121 独立任务文件，其现行接续合同以各 PR 正式裁定/审验为据，不把缺文件当缺授权。另读现有临时 main-sync/二审报告，只做输入与沿用范围核对。

分析方法：两次 `git merge-tree --write-tree --name-only M H` 使用临时 GIT_OBJECT_DIRECTORY 与主对象库只读 alternates；临时对象退出后删除，无工作树/索引/refs 修改。分别比较 merge-base→H 与 M→预测合成树的逐文件自有增删行、路径 blob（含删除状态），没有应用补丁、构建或测试。预测冲突树不是可交付树。主仓库开始/收尾均干净。只输出本文件；未读保护 #1101 或真实 Home/Keychain/凭据，未触 T208/T143/T116/T065/T379 五树、GH/协调写入或 CI 控制。

## Full 的实际输入合同与结论

**撤回初稿“八项全部必须正常 merge main”的结论。** 八个分支 H 的 ancestry 均未包含 M，但这不是 Full 的普遍阻塞条件。现行协调 README §5 明确无冲突通常不追 main；§8要求同一个事件 H 的审验、Verify、Full等成立，没有要求 H ancestry 必须包含每个 main 修复。

已直接核 M 上 `.github/workflows/full-suite.yml`：`pull_request` 的 `labeled` 事件、label=full-suite 的条件、`actions/checkout@v6` 只设置 fetch-depth:0，没有 ref/head.sha 覆盖。因此 **PR标签 Full 的事件 head=H 与实际 checkout=PR merge commit/tree 是两层输入**，不能把实际合成 tree 称为 H tree。workflow_dispatch 指向分支的执行也不能自动套用该 PR merge-ref 前提。普通 CI 成功是另一个流程的证据，既不能当 Full，也不能替代新 Full checkout 取证。

必要条件修订为：根能证明新 Full 的准确 event head 仍为已审 H，且**实际 checkout 包含 T377 修复、仅为已核 main 与本 PR 补丁的合成，没有额外未审增量**，则可保持 H，通过当前 merge组合 Full结算§8，避免无意义 merge/build/push；现有审验与H的普通Verify仍按各自准确输入和已认可范围沿用。否则走根指定的正常同步路径，并按下面交集表补最小审验。对有真实冲突的 T121/T353B，仍需先解决可合成性及资源合同；不能用标签绕过冲突。

M 自身 Full 由根排，本文不预签成功。**新 label 是否会刷新仍旧的 merge ref，当前 UNKNOWN**：只读API/Git与工作流不足以证明，未启动CI作实验、未查外围机制资料；当前不能盲排“肯定已含M”的 Full。已派 writer 四项按原安排继续，本文不撤销或增派任何 writer。

### T148 #1654 的可复核实例

H=`4d6f5766dc1a7323433d104405591fb74cd1f3d2`，H tree=`81e85687f467f650c034b07d98a27a0d2ec072ec`。本轮两次直接 GET PR/commit API，远端 `refs/pull/1654/merge` 给出 C=`1b795344a491b8fe80e5547bb90744d6151d3383`，parents=`717d14f2ab8c9cb1b447003fabb120a70b6d9dd3` + H，tree=`b0f3e512b5c2816755c00c3c6fc32c6b5818e55c`；PR base.sha却仍报edb257e0，不能只信base字段。直接 GET main ref为M，而C的旧main父不含M。因此当前C不能作“已含T377”的候选Full输入，也与H tree不同。

隔离 merge-tree 重算 old-main717+H恰得上述远端 tree b0f3e512；M+H则无冲突，预测 tree=`591be0f06cba3ac5b0c213ac544ad363a06eb880`。后者的T377三份生产脚本和plugin-frame-readiness测试均与M同blob，72路径自有补丁逐行等价；H/M的full-suite.yml同blob。**这证明可安全合成的静态范围，不证明平台已刷新到该tree，更不是新运行。** 将来平台真实C'若有M祖先（或更晚main父），根再核其parent/tree及scoped差集，并从Full checkout日志确认实际C'/tree；若父为更晚main，必须按那个准确base重算，不能要求永远等于本文预测tree。

其余七个远端merge快照也未含M：T347 C=15f59915f170b93d0d5e7fd8d957a5ce0d9eb8a8（父edb+H）；T146 ea6f4c682017b7a701c469db97cbd64c62f2be48（717+H）；T353B 49c262b7c1340620b2bd12ab1cf107cc4b6468af（194431901+H）；T121 cae144fb1e909e6aef8eabec4ea72839e4842e56（c05698a13+H）；T345 d05c09129b28fac9dd8fc5ad0317e4395222eb1b（717+H）；T299 01bf538a3ef1c0a57256da04844cfd5221127024（717+H）；T373 fb624cad0abc07aa619e1aab6606974024783ea3（edb+H）。其中T121/B旧ref存在不证明它们当前可与M无冲突。快照均不构成刷新机制的因果证据。

## 顺序建议与需要显式同步时的派单输入

建议前三项依次准备/排准确头 Full：

1. **T347**：T377 正是其已定位 Full 阻塞的修复；本项两文件无交集，准备成本最低，优先取得包含修复的可靠 Full 组合。先按上述实际输入合同决定是否需同步，不因H ancestry单独增派writer。旧 Full failure 原样留存。
2. **T353B**：共享消费者迁移已完成加强审验，只需处理一个资源许可冲突；可避免共享 SDK 迁移线及后续消费者继续卡在旧失败/旧基点。资源窗口须由根释放后交一个 writer；不能抢占 T379。
3. **T148**：新 open/list@2 已独立核验；协调 README 明确 T369 WAIT #1654，故采用效益高。可并行作只读准备，实际同步由根指定唯一 writer，新增校验集中在合成后的 desktop-tui。

这是解除依赖效益的建议，不改变已有 writer 或 Full 容量安排。T345/T373/T299 可作为资源窗口未释放时的简短准备候补；T146须保留其浏览器/视觉结算合同；T121是唯一较重的旧 main 语义合成，先准备后排 Full，不把它按纯资源更新发出。下表“merge后/新H”的执行建议均**只在根选择显式同步路径时适用**；若走已核C'的PR标签Full，就保留事件H及旧审验来源，只核合成增量和实际Full，不凭下表机械要求本机再build/test/push。

## 准确头、预测交集与最小新增工作

| 项 / 当前准确 H / merge-base B | M 合成分析 | 可以沿用及最小新增校验 |
| --- | --- | --- |
| **T347 #1665** H=`a8608b3e6b72a871d11a1116c7268c690074b5cd`；B=`c6353876dec041a3c7bd3d2c62c7ec50154d5ef1` | 无冲突、无 scoped 路径交集；secret store/test 2/2 同 blob，自有 patch 全等 | 沿用 6548663957/6548665030 的独立10/10和封条修复增量一/二审；旧 M/35 不改署。正常 merge 后核两 blob、T377三生产文件/测试被保留，匹配 build/必要门禁、新 CI/SI、新 H Full；没有理由本机重演10例或旧M矩阵。T377完整 readiness 文件交 Full覆盖，不另为本单重跑旧失败头。 |
| **T148 #1654** H=`4d6f5766dc1a7323433d104405591fb74cd1f3d2`；B=`edb257e0bea26929e6e909360e05a49041d9b414` | 自动无冲突；72路径中69同 blob，变化仅 EXTENSION-POINTS.md、ci-product-subset.txt、desktop-tui.test.ts；72路径自有增删行全部等价。**直接 T377 交集是 desktop-tui**，不是预算冲突 | 沿用 6548919129/6549221088：open/list@2、close/prompt@1、独立 goals-terminal4/4+web-route-table2/2，作者其余39例及旧48/M各按原来源。增量核 product清单双边条目/文档；确认 desktop-tui 中 T377 四参数 `intent="open"` 断言和 T148 的面板/PTY变更同时保留；build 后新增跑**完整 desktop-tui.test.ts**。API/actions 做非update一致性核对，不为同步改动作。其余终端/删除矩阵不机械复跑。新 H CI/SI/Full仍必需。 |
| **T146 #1676** H=`1507e2034976650150e8994965db5612a7474727`；B=`194431901e2b24cc32ff2404c343bf0045b6aa1e` | 自动无冲突；六路径仅 page-assets.json 与 main 交集，其他5同 blob；自有 patch全等。T377的 JS 增长与本项 settings CSS删除不同资源，无生产语义交集 | 沿用 6548918185：去CODING_STYLES两处、Node14/14、served响应体只settings −77638B；不重跑67文件/3M/旧七浏览器。merge后匹配build、实测48资源，settings预期827276、workbench保M1150291，其余跟main，门禁实际通过才记账。新浏览器证据照6543667203取**准确头Linux Full**并核原七文件实际执行；视觉另结，不能用字节相等销UNKNOWN。 |
| **T353B #1682** H=`81955aa9303011ec0f38ecbdf2b507fc23824fe2`；B=`edb257e0bea26929e6e909360e05a49041d9b414` | **一个冲突：scripts/gates/page-assets.mjs**；另有page-assets.json交集自动合并。30路径中28非资源路径同blob；除冲突脚本，自有增删行全等。SDK helper/knowledge等无新语义交集 | 沿用6548916513的等价映射、旧8a926168独立238/238及K/P负控、作者新组合Alchemist6/6。资源脚本以M规则为底，仅重建本项仍需的Jelly `[76866,76899]`，清掉已消费Coding/T377许可，不复活旧放行；核 gate 算法主体不变。build+48资源实测/门禁、新CI/SI/Full；既有T366已在B链，本轮无需再跑两Alchemist或238例。 |
| **T121 #1677** H=`c2502b62dc2af4cb090ce740f12d394646e7bdeb`；B=`c05698a13f1c0f17c4eb7578d42fd77467fc57fb` | **五冲突**：CHANGELOG.md、page-assets.mjs、BACKLOG.md、privileges.md、page-assets.json；45路径有14交集、31同blob。其余9交集自动合并但含真实语义，见下段 | 沿用6541910390裁定/二审、6542343143独立Runtime57+sources11、权限拒绝补诊断及B单点M等，只支持原头原范围。先明确14交集合成，再匹配build，完整 feed-runtime-plugin、feed-sources、security-invariants-plugin-record-slots、security-invariants-plugin-connections、connector-cli、action-contract-snapshot；按实际差异补**必要**声明者拒绝覆盖，不重跑原15文件/全部M。main权限与T121 delete@1 connections:use双边保留，快照从合成源码生成并核差集。资源与状态文档由根串行结算，新审验仅合成增量，新CI/SI/Full。 |
| **T345 #1663** H=`ec0cc0a8ac1c6320c39e660395e3d6fcf10defd9`；B=`717d14f2ab8c9cb1b447003fabb120a70b6d9dd3` | 无冲突/交集；7/7路径同blob，自有patch全等 | 沿用6548957766/6548958522/6548959990：FI-C-07文书修订、旧63映射和本头组合runtime54/54核收。merge后核7blob/patch，build/必要门禁与新CI/SI/Full即可；没有新的runtime链交集，不重跑54/63或原M，不重开可选actions测试建议。 |
| **T299 #1671** H=`6e4cb0ac72b54f9d8f32ec6f21786c328fa7744e`；B=`717d14f2ab8c9cb1b447003fabb120a70b6d9dd3` | 无冲突/交集；唯一 immersive-shell.ts 同blob，自有JSDoc patch全等。T377外壳脚本改变不进入该注释差异 | 沿用6548960903及原四项文本检查；保持丙档无一审。正常merge核原注释迁位和main代码，必要门禁/匹配build、新CI与Full，不新增浏览器/Node35/M1M2二跑门。6548760051正式full=true不降级。 |
| **T373 #1700** H=`ba1a7aaedbbfca2ffb293632d4ec8b3000482824`；B=`0926d15a9eef9c1b6c066e676768d6e49d67c6a1` | 无冲突/交集；home-aggregate.ts/test 2/2同blob，自有patch全等；T377浏览器加载时序不改本项两阶段诊断代码 | 沿用6548735884/6548736679/6548738698：一审、独立完整7/7及closing负控、二审；作者68仍属作者。merge后核两blob与patch，build/必要门禁、新CI/SI/Full；不重演68文件/两负控，不追加“同轮两条Host日志”或关闭R63整项。 |

T121 的14交集为：`apps/local-host/src/connector-plugin-requests.ts`、`apps/local-host/src/index.ts`、`horizontal/connector-host/src/connection-store.ts`、`plugins/native/feed/src/ui.ts`、`tests/connector-cli.test.ts`、`docs/system/SECURITY-INVARIANTS.md`、`specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md`、`tooling/gates/actions/{actions,host-actions}.tsv`，加上表内五冲突。main 从旧B吸收了 T134 连接 declarer/安装钉、T336 删除 Feed-start、T356 CLI自有键拒绝、T340 MCP错误声明、T137/T401 Host装配等；不能因9处自动合并就宣称全语义不变。只核这些接缝，保T121按per_record列账号/绑定、删除释放、已删源拒绝、串行409及既批权限，不借同步实现BL921并发原子化、改错误优先级或旧Home迁移。该项比其它七项需要更明确的合成增量审验。

## 资源派单输入（预算预测，不是构建实测）

M当前预算48项合计 **7,469,175B**；workbench.js **1,150,291B**。T377的+219B已包含在该数字，不再叠一次，也不能把其旧 `[1150072,1150291]` 当当前main增长许可。

- T146：settings.css **904914→827276（−77638）**；预测48项总 **7,391,537B**。自动合并只需实测核对，不新增许可。
- T353B：Jelly **76866→76899（+33）**；预测总 **7,469,208B**，gate仅保留当前基点仍需的Jelly许可。main的T377已消费，旧Coding也已消费，不能整块取旧PR脚本。
- T121：旧已批workbench净增 **1483B**；若合成源码的尺寸仍线性相加，预测 **1150291→1151774**，总 **7,470,658B**。这是派单估计，不可用算式直接签入预算/ceiling；必须由合成构建实测，并据当前merge-base重绑定既批增幅。main已有Feed删除与新通知可能影响压缩结果；若实测不同先核来源，不自动放宽规则。脚本清旧 consumed 条目、保现行门禁算法，root按既有资源审核流程处理。
- 其余五项无自有资源预算差异，main48项仍应被完整保留。后排任务若main又前进，重取实际merge-base，勿把本文总字节当固定许可。

## Full 与旧证据的保留

本轮 GitHub head_sha 精确过滤得到：八个当前头普通CI均 completed/success（T347 **41236978711**、T148 **41239003651**、T146 **41238894874**、T353B **41237845572**、T121 **41189060585**、T345 **41239397507**、T299 **41239820933**、T373 **41236852972**）。这里只核 workflow终态，不另签每个job/skip或CI checkout与H同树。过滤同H的run列表，只有T347另有Full：**41240351080 failure**；其它七当前H列表未见Full，不写成已通过或断言整个历史从无Full。

旧失败/未知继续留账：T347 Full两次RAC1490首败、matrix取消片不算成功，T377采用不倒填旧run；更旧41212838587仍failure。T353B旧8a926168的 **41233823797 failure**、未证明唯一根因保持，原6/6/238不能替代。T148旧carrier **41189390168**只是原准确对象/未变范围，不能背签@2新头。T146旧纯头10/39、基线0/38、Chromium组合47/48与picker19/21分别保留，旧根因和视觉UNKNOWN、原EOF空行P2仍不清账。T121安装文件/HOLD、BL917/919/920/921及其他已批后续保持；T345新建v1 Home前提、T299历史轻核来源、T373日志范围与真实Home/产品/用户未验均保持。

实际调度通用合同：根fresh核PR事件H、main、在途锁、远端候选C'及实际Full checkout。**优先按输入证据判断，不把追main作为普遍前置**；若能核含M的C'与已审补丁、当前资格，就直接在同事件H结算其真实合成Full。刷新机制不明/实际checkout尚不含修复时不预签；必要时根选择已知可靠的正常同步路径，指定唯一writer，正常merge含M的main，范围只限合成与必要资源，不rebase、不夹带新功能，再按表列最小新增校验、必要门禁、新H增量审验/CI/SI和Full结算。两条路径都回读实际checkout与失败/跳过，并保留原Full失败/UNKNOWN。普通CI、作者证据、旧独立运行、预测树及Full各自分源；本文所有“同blob/同patch/无冲突”均为静态分析，新增动态运行0。
