# T362 / #1694 当前冲突的最小同步方案

状态：**只读准备完成，未实施；最终M、资源窗口及唯一writer待根裁定。** 原实现负责人为开发线3（接DeepSeek设备A），本轮开发线1只准备同步方案，不接第二份实现。保留full=true、既有修复/独立验证/一审/二审结论；本轮不build/test、不改作者树/refs/索引、不GH或coord写入、不触真实Home/密钥。T351原作者树和task/T351-a明确保留，不作任何清理。

## 1. 准确对象与既有有效证据

- H=`8914e7034038117de07ead7687700e7a4ef03ba6`，tree=`09e448ed1298ace8f75e63dcff4d3cd63165ecb0`。PR #1694当前只读回读open、head=H、mergeable=false；原远端分支task/T362-a。原作者树仍95341a06c；既有修复树feature/T362-repair-ca在H。两树均未切换/修改。
- 本次指定M=`fa9b907c9c6a8243c9a9504cf6c4c8a90509965b`，现成本地origin/main同M；未fetch。H/M merge-base B=`2bd444b45e1809c4bad6776dfc62d96e049ad442`。本计划只绑定此M，不能默认套到未来main。
- [根执行裁定6549255118](https://github.com/molis-ai/molis-work/pull/1694#issuecomment-6549255118)：同一客户端工厂每次按当前导航dataset读取，不缓存；保留名只补实际embed；真实Shelf Manifest经公开parser赋回同registration，再动态加载catalog/sections，两个透传断点各有变异。#1672连接器断言和#1680路由合同未采用时不并入；原作者树保全，正常main merge/普通快进原远端，workbench必要增长严格<1KB且served实测。
- [修复6549579137](https://github.com/molis-ai/molis-work/pull/1694#issuecomment-6549579137)、[一审6549618333](https://github.com/molis-ai/molis-work/pull/1694#issuecomment-6549618333)、[二审6549618939](https://github.com/molis-ai/molis-work/pull/1694#issuecomment-6549618939)：原三必修及合法上界闭合，无当前必须返工项。作者四变异的不同首败、恢复后七完整147/147以及原48资产仅workbench +324B保留原执行来源，不重演、不倒签新组合。
- [独立验证6549699377](https://github.com/molis-ai/molis-work/pull/1694#issuecomment-6549699377)：准确H、自有匹配构建、四完整文件50/50、零fail/skip/cancel/retry：plugin-global-settings16、S47 Node28、S47 e2e5、Cognia e2e1。读取了`/private/tmp/t362-repair-verify/REPORT.md`原结论；作者147不改称独立147，独立50也不改称下一组合执行。
- 最新只读workflow metadata：H的CI41244406858已completed/success，更新了早期报告中queued的历史时点。但旧CI真实checkout为d6758e3d…（H与当时main合成），不是本M；未从metadata推出逐文件新覆盖或Full通过。准确最终候选CI/Full仍由根结算，full=true不变。

源索引：`/private/tmp/t362-current-sync/source-metadata.json`、原修复`/private/tmp/t362-repair/REPORT.md`、独立一审/二审`/private/tmp/t362-repair-first/REPORT.md`与`/private/tmp/t362-repair-second/REPORT.md`。

## 2. 隔离merge-tree的实际结果

以Git bare plumbing读取现有共同仓库，设置`GIT_OPTIONAL_LOCKS=0`，新对象只写`/private/tmp/t362-current-sync/objects`，原对象库仅作alternate。没有checkout、refs/index写入或实际merge；没有把临时对象放入作者/共同对象库。

`merge-tree --write-tree --messages H M`退出1；临时树`37910343ad449eb2bb781b3fcee18b4269358b23`。**唯一文本冲突为scripts/gates/page-assets.mjs**；tooling/gates/page-assets.json自动合并。这个临时树含冲突标记，只是只读分析原件，不是可运行候选。

| 路径/范围 | 实际差异与owner | 最小保留法 |
| --- | --- | --- |
| scripts/gates/page-assets.mjs | H的T362 workbench许可与M已采用T351 Alchemist许可在同一块冲突；窗口由根统筹，下一唯一writer负责 | 以最终M脚本为底，仅整理一次许可和专属说明；清已消费项，再加本单精确许可，不整块取任一旧头 |
| tooling/gates/page-assets.json | 自动合并保留M的Alchemist/Pages新预算及H的workbench增长，无冲突；同一资源writer负责核实 | 不因无冲突直接记绿；与最终M及真实served逐项核，非本单资源不回盖 |
| 其余13个T362路径 | H→临时树逐blob不变；M在B之后未动这些路径。含合同/SDK/4个workbench文件/3测试+child/文档/Skill/UI API快照 | 原样保留H修复与断言，不为资源同步重写合同/测试或重构 |
| H之外main自动合入 | H→临时树共40路径，除两资源外38项来自已采用main：T351业务/测试、T204/T249 Pages、Feed错误分类、T122文档及其它已采用断言 | 保留main所有变化，不误计为T362新增业务写范围；不要覆盖其文档状态、CI子集和既有断言 |

原件：`/private/tmp/t362-current-sync/merge-tree.log`、`/private/tmp/t362-current-sync/auto-merge-paths.json`、`/private/tmp/t362-current-sync/H-scoped.diff`、`/private/tmp/t362-current-sync/automatic-vs-H.diff`、`/private/tmp/t362-current-sync/all-automatic-vs-H.diff`。H相对B仍15路径；其中只有两资源路径也被M修改。当前M在B之后对整个workbench源码、contracts/UI、SDK、kernel、test-kit、runner和lock无新差异；这支持沿用相同逻辑输入，不代表整树/新产物已执行。

## 3. 本次M的资源精确解法

以下是**入库预算的静态比较**，本轮没有构建/served实测：

| 资源 | H预算 | M预算 | 自动合成预算/处理 |
| --- | ---: | ---: | --- |
| workbench.js | 1150396 | 1150072 | 1150396；本M下只有它比M+324B |
| Alchemist.js | 52556 | 52702 | 52702；沿M，不回盖旧值 |
| Pages editor.js | 707886 | 708426 | 708426；沿M的T204/T249结果 |
| Pages.js | 38946 | 39130 | 39130；沿M |
| Coding.js | 290029 | 290029 | 290029；不带回已消费许可 |
| 其余43项 | 各自原值 | main现值 | 全沿M，包含frame/三CSS等 |

M总48项/7,468,956B，自动账本48项/7,469,280B，差324B。这个总量是JSON算术，不是新产物测量，不能抄成测试结果。当前fa9不含T377新客户端输入。

当前M的APPROVED_CEILINGS只有Alchemist `[52556,52702]`，M预算已为52702，故下一次门禁变更应删除这条已消费许可及T351专属说明；不能为“保留main”继续留可重用旧额度。本M下换成T362精确workbench `[1150072,1150396]`，说明保当前行读取/过滤的必要+324B及移除旧缓存省97B。旧T354/T204/T249/frame/workbench batch许可不复活。

已经独立比较H和M脚本：一次许可说明块之前、approvedCeiling函数起之后完全相同。解决只能改该数据/说明块，不能改取base、增长/新资源/精确预算拒绝、update、路由发现、APPROVED_NEW_ASSETS等算法/规则。真正新组合以整体匹配build的served body为准，预算必须精确相等；若实际不是原324B则按实际差分核原因，仍严格<1KB，不留slack、不搬字节/新资源、不为通过改门禁。

原件：`/private/tmp/t362-current-sync/resource-budgets.json`、`/private/tmp/t362-current-sync/H-page-assets.mjs`、`/private/tmp/t362-current-sync/M-page-assets.mjs`、`/private/tmp/t362-current-sync/auto-page-assets.mjs`、`/private/tmp/t362-current-sync/static-checks.json`。后者auto文件含冲突，不能拿去执行。

## 4. 设置地址参数合同及T377的边界

T362精确合同保留H：可选`settings_address`，只限settings视图；query显式名字、最多8项/32字符，不重复且拒project/desktop/settings/settingsPath/embed；hash带#、按现行形状和数量校验。未声明沿原默认，内置extras不变。Manifest→同registration→catalog→sections→渲染行dataset→当前客户端过滤链不变；同factory导航替换/添加/移除/重现必须读现值、拒旧query/hash。不新增控制参数、通配、兼容层、事件或公共注入API。

本M及临时树的UI合同、SDK校验、UI API快照、真实透传child和三个修改测试均与H修复相同；自动合并没有“解”掉任何这类源码。API以后只能从实际合成树生成/核对，动作快照应unchanged；未采用#1680的UiView路由字段或#1672连接器断言绝不能抄进来。它们后续真合main时才作为main输入保留，再核准确增量。

T377 #1707只读metadata当前open/unmerged，head95ea9f1f6…；**未读/取其未合源码、未合它的分支**。三个相关主区客户端路径为：

- apps/workbench/src/scripts/client/deferred-plugin-client.ts
- apps/workbench/src/scripts/client/documents-state.ts
- apps/workbench/src/scripts/client/navigation-feed.ts

这三路径在本H、M和临时树的blob分别完全相同，说明本次fa9合成未混入T377。它们后续采用会改变共用workbench bundle的输入，即使不直接与settings-directory文本冲突，也会改变最终资源基点及客户端组合。只能等实际merged并核采用提交在最终M祖先中后，从**main**保留；不得从候选95ea/临时PR merge_commit字段拼入。

届时重算H/最终M/合成差分：保T362当前地址过滤与T377实际采用的三个客户端，不相互回退；不得沿用`[1150072,1150396]`当未来额度，也不得把双方增长简单相加当新served上限。先在最终M/合成输入实际构建测量，tuple起点=最终M准确预算，终点=新实测，T362新增delta仍须严格<1KB。若相关合同/透传/测试也发生新变化，给根具体hunk再定最小补验，不默认复审整单。

原件：`/private/tmp/t362-current-sync/T377-current-main-blobs.json`、`/private/tmp/t362-current-sync/lock-heads.json`。

## 5. fresh路径owner与资源窗建议

本轮GitHub只读搜索25个open PR，并逐PR跨全部files分页。以下是**在途交集，不是把其候选当main**；准确全头见lock-heads.json，保护PR只读metadata：

| 路径 | 在途owner/准确头摘要 | 根的串行要求 |
| --- | --- | --- |
| 两资源文件 | T377 #1707@95ea9f1f6；T208 #1562@3b1402546；T353B #1682@81955aa93；T121 #1677@c2502b62d；保护#1101@2b38b5f5f；其余预算还有T146 #1676@1507e2034、T065 #1669@94861f093、T066 #1672@ebcd6536c | 当前窗口不由本线领取；根选唯一writer/最终M，每个writer只处理自己的必要delta和已消费清理 |
| docs/platform/PLUGIN-DEVELOPMENT.md | T143 #1675@58a1713c6、保护#1101 | 只保H本单说明及main已采用内容，不顺手改其它文案；有新冲突交根串行 |
| tests/plugin-global-settings.test.ts | T066 #1672@ebcd6536c | 保H已批T362透传用例，未采用连接器断言不引入；实际main采用后保两方测试 |
| contracts/platform/ui.ts及其API快照 | T116 #1680@d37ec34c8 | 未采用路由合同冻结，不手拼快照；实际main变更后在最终树生成核对 |
| T362其余路径 | 本轮open文件集除自身外未命中 | 非永久无锁声明；writer派发前根fresh核 |

**建议资源顺序：优先等T377实际采用后，根冻结最终M，再把一次资源同步窗口交T362唯一writer。** 原因是同一workbench bundle基点已知将变，可省再次冲突/重称。T208等其它PR只按实际main状态沿用，不把所有open PR都变成T362前置。若根明确选择现在fa9先同步，也只能采用本M，不能顺带引入T377；后续T377再由后合writer按新基点结算。本方案本身不分配写锁、不解除保护或授实施权。

## 6. 根后续派唯一writer时的最小执行与验证

以下均是**未来步骤，本轮未运行**：

1. 回读PR/原远端准确H、现有修复树dirty/占用、最终M与前置采用，正常fetch后冻结输入；只正常merge实际main，不rebase/force。原作者953树保留，根可派原修复owner接续H，或明确另一独立承接树；不得在两树并写。
2. 只解上述资源数据/说明冲突；重核13个非资源H路径及所有main自动合入内容。最终M若已有合同/测试/客户端新交集，先给根准确hunk，不以原“仅一冲突”覆盖新情况。输出scoped/remerge和资源差集，不重开三项已闭合设计。
3. 有main源码/脚本输入变化，按独立验证已用的隔离路线：自有临时系统HOME/CFFIXED/XDG、file secret backend、首次构建即adhoc；浏览器只用专用Chrome/profile，公共槽先在共享TMPDIR取得再进入任务临时环境，不能另造私槽。做offline frozen安装及公共build槽整体匹配pnpm build、workspace build，不能借旧dist。随后实际served资源相对最终M逐项测量，必要tuple精确、其它资源沿main/真实下降；完整page-assets-budget文件按公共槽/jobs1/retries0运行，不因静态账本或旧171直接签新组合。
4. API/动作一致性、boundary、test-imports、merge-base health、diff及fetch后逐提交secrets按最终N核；API若生成意外差异先报根，不抄其它PR。原合同形状没有再次变化，不新增动作版本或测试矩阵。
5. 原H独立50、作者147/四变异/两端资源保持各自原头与来源；不为资源数据同步机械重做。若最终M仍本fa9，相关workbench/SDK/合同/四目标测试输入未变，先核匹配产物/依赖和已有CI原件再抵扣；不能把旧50改记N新跑。
6. 若T377三个主区客户端实际进入最终M，保其自身已采用readiness/恢复证据，不重演T377因果/变异；T362新组合最小关注是生产bundle中设置relay仍可用。优先由准确N的正常CI/Full核实际checkout/build及原完整文件结果；确有缺口时由原验证owner补**既有**S47 e2e与Cognia e2e两完整文件，Node的global-settings/S47及SDK parser三文件按未变输入/现有原件核抵，只有出现相关新差分/失败才扩大。这里不创建新测试、不本机重跑138建议、七文件或四变异大批。
7. full=true保留，由根安排最终准确候选/组合的CI与Full，不能借当前H的CI顶层success代签；实际checkout/tree、文件skip/retry与构建绑定分别结算。独立增量审验只核本次真正变化和资源，不循环总审。旧CI先终态、fetch/secrets后仅一次普通快进原远端task/T362-a；何时push/开评审仍由根该轮明确派发，本计划不执行。

## 7. 本轮产物及未做

仅本目录PLAN和只读metadata/diff/临时对象原件。没有新worktree/分支、作者源码/索引/refs变更，没有build/test/机器槽、GH或coord写入，无真实Home或密钥操作。隔离merge-tree生成的对象仅在本目录，用于阅读冲突，不是待合入提交；现有task/T362-a仍953、修复分支仍891、origin/main仍本M，见reference-snapshot.json/static-checks.json。

原一审/独立验证/二审结论不被本轮替代，Full/正式采用仍未由本计划签。T351保护对象保持原样；其审批拒绝不通过本任务绕开。根核最终M后才派唯一writer，本线等待该前置，不另造补验。
