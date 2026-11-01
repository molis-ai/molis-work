# T143 / T065 下一次main同步差异补充（只读准备）

状态：**准备完成，不实施、不接两单writer。** 本文只补已有接受方案/修复报告的“当前main及T377采用后”差异，不重写两单产品方案、不开新编号或重复spec。T143负责人仍开发线2；T065保留Claude原实现及既有Codex同步归属，后续每单唯一writer由根明确派发。原T351树及task/T351-a保持原样。

## 1. 复用的既有计划与证据

### T143 #1675

沿用正式T143工单、`/private/tmp/t143-resume-plan/PLAN.md`及`/private/tmp/t143-resume/LIFETIME-PLAN.md`，实现/原件以`/private/tmp/t143-resume/REPORT.md`、FINAL-SECOND.md为准。本轮不再设计指令/模型/图片通路。

- H143=`58a1713c67833bba0ebea706a88e5476ed6499c2`，tree=`633471ca6066c6682d3b7d75dbf081cdc9299f97`，PR/原分支task/T143-ca均该头，当前open/mergeable=true。
- [根6549207475](https://github.com/molis-ai/molis-work/pull/1675#issuecomment-6549207475)、[生命周期裁定6549371378](https://github.com/molis-ai/molis-work/pull/1675#issuecomment-6549371378)：可信release instructions只给已验证Home app的definition与broker，使用原installId；model.complete relay持续至invoke最终finally，同步解绑后dispose，保caller/grant/active/held/beforeEffect。不扩project/trial/integration、SDK/公共lifetime、兼容或真实网络设置。
- [最终修复6549627059](https://github.com/molis-ai/molis-work/pull/1675#issuecomment-6549627059)：作者27完整文件327 pass/1既有默认关闭公网skip，三变异及恢复保原执行来源。最终58a相对实现014139只加两条精确giant元数据，Home163、Broker311行/9方法；不借此放松limits或重演原27文件。
- [独立验证6549731663](https://github.com/molis-ai/molis-work/pull/1675#issuecomment-6549731663)：准确H、匹配整体构建、两完整文件**16+20=36/36**，零fail/skip/cancel/retry。`/private/tmp/t143-independent-verify/REPORT.md`证明真实签包→Home Runtime/Seatbelt/broker/生产client，精确指令、override/启停/补偿、RPC后storage回读与取消/超时交错，以及真实Prologue→受控HTTPS的TLS三态。文本厂商仍是beforeDispatch接缝，图片厂商为本机HTTPS，不扩成公网质量/本人验收。
- [强二审6549732476](https://github.com/molis-ai/molis-work/pull/1675#issuecomment-6549732476)无必须返工。最新只读CI41245303410已completed/success；metadata不替逐文件/实际checkout核对或Full。full=true保留，准确新组合CI/Full由根收口。

### T065 #1669

已有等价“正常吸收main、只审真实增量”的采用/同步方案：`/private/tmp/t065-adoption-plan.md`，后续执行与核抵见`/private/tmp/t065-main-sync/REPORT.md`、`/private/tmp/t065-main-reuse/REPORT.md`；本文件只把旧717基点推进到本次M及T377条件，不复制OAuth总方案或旧测试矩阵。

- H065=`94861f093ab3971c6370b824cdd2bfcc30caf14d`，tree=`4cc8344d9c08535bd147059459f3bf5dc550add3`，原task/T065-ca，当前open/mergeable=true。
- [四必修裁定6540448952](https://github.com/molis-ai/molis-work/pull/1669#issuecomment-6540448952)及后续已闭合：同Home共享/跨Home同连接不共享、workspace仅在仍有等待者时写回、refresh token仍为发出值的复查、Notion别名host/loopback规则。旧Notion专路删除、通用流程、旧形状reauth拒绝与产品环境变量均按现行H保留，不重新实现。
- [旧独立验证6548449185](https://github.com/molis-ai/molis-work/pull/1669#issuecomment-6548449185)、[二审6548450221](https://github.com/molis-ai/molis-work/pull/1669#issuecomment-6548450221)、[948沿用6548917305](https://github.com/molis-ai/molis-work/pull/1669#issuecomment-6548917305)：旧093头同树CI41230106551的Notion19/19、shared-refresh69/69、callback17/17等归**该CI**；普通29/29、设置页localhost显示、作者66文件/9M分别保留原头/owner。948同步的35非交集同blob、SI/Backlog/资源及两个Alchemist文件1+5通过归原作者，不重署新组合执行。
- 最新只读CI41238820012已completed/success，更新了早期报告“运行中”的读取时点；本轮未取新逐文件日志/实际checkout，不能把旧093同树映射搬成948或下一头。T066 Full41227554410是另一父子组合，不签T065自身Full。
- full=true、既有HOLD不降级：notion-oauth、provider-contracts、shared-refresh、setup等已标整文件本机不跑；独立RAC旧首红/绿及M1/M3/M6的NOT RUN不改。不得筛case/换入口/另造probe绕过。T066三条旧建议继续归T066，Feed token_refs归Feed线，不倒灌父片。

## 2. 当前M与隔离合成结果

开始时现成本地main为M0=`fa9b907c9c6a8243c9a9504cf6c4c8a90509965b`；本轮对两H各做一次隔离merge-tree。读取中根/其它会话将main推进到M1=`b6f92222fce89dfba756a580768889292cfe9967`（T378，仅EXTENSION-POINTS/PARALLEL-DEVELOPMENT两文档），故又对M1补核；以下以M1为当前冻结快照，M0原件保留。**本线没有fetch或改ref**，最终执行M仍待T377采用后由根冻结。

两H与两M的merge-base均为`717d14f2ab8c9cb1b447003fabb120a70b6d9dd3`。使用bare Git plumbing、GIT_OPTIONAL_LOCKS=0、新对象只写本目录objects，原对象库仅作alternate；没有checkout/作者树/索引/refs写入。

| 对象 | 对M1实际merge-tree | 本单范围与交集 | 非交集/自动变化 |
| --- | --- | --- | --- |
| T143 H58a | exit0，**无文本冲突**；临时树225c80c3a7d48f9ec863f11d213304ce0ac2e942 | 本单40路径与M1后续改动交集0 | **40/40 blob原样保H**，含所有源码、合同/API、测试/fixture、SI、slice及giant；资源预算相对M1零delta |
| T065 H948 | exit0，**无文本冲突**；临时树5780449bdecbca3cdb9f13e2ad2a9a6515e93dfb | 本单38路径仅page-assets.json与M1交集 | **37/37非交集原样保H**，原删除继续删除；仅账本自动吸收main新增值，并保本单workbench−211B |

不能把旧T065的“35非交集”当本次计数，也不能因mergeable=true/no conflict就签新构建/业务通过。H之外main的Alchemist、Pages、Feed、Artifacts等源码/测试及T122/T378文档都按已采用main保留，不当作两单新增实现或回盖旧稿。

限定的关键依赖检查：base717→M0在plugin-sandbox/runtime/contracts、agent-host、Home/model/connector关键端口、runner/lock等指定路径无新源码差异；M0→M1仅两文档，故同样成立。这支持原核心行为证据按未变范围沿用，不声称整树/下一构建已经运行。两任务直接共有的本单写路径只有SECURITY-INVARIANTS.md和BACKLOG.md；本轮没把两个未合分支相互合成。

原件：[M1两合成汇总](/private/tmp/t143-t065-next-sync/M1/merge-summary.json)、[T143 blob](/private/tmp/t143-t065-next-sync/M1/T143/blob-map.json)、[T065 blob](/private/tmp/t143-t065-next-sync/M1/T065/blob-map.json)、各目录merge-tree.log/automatic-vs-H.diff；[M0原汇总](/private/tmp/t143-t065-next-sync/merge-summary.json)、[依赖/路径](/private/tmp/t143-t065-next-sync/dependency-and-path-summary.json)、[M0→M1](/private/tmp/t143-t065-next-sync/M0-to-M1.diff)。

## 3. T377尚未采用：条件差异，不能提前导入

当前PR #1707仍open/unmerged，head95ea9f1f6…；其临时merge_commit字段不是采用提交。本轮没有读/取其未合源码或分支，仅核metadata及当前main已存的三个路径：deferred-plugin-client.ts、documents-state.ts、navigation-feed.ts。这三路径在H143、H065和M1都同blob，说明本次合成**没有T377新行为**，见[T377-main-inputs.json](/private/tmp/t143-t065-next-sync/T377-main-inputs.json)。

后续仅在根确认T377实际merged、准确采用提交为最终M祖先后，从main吸收它及真实发生的其它采用；不得cherry-pick候选95ea、PR synthetic merge或把T065/T143/T066未合分支互相倒灌。M1的T378说明已明确本次本机/子代理不跑Full，根安排CI Full、只根加标签，本地只点名补证/复现；不能用旧历史成本表增加本机Full。

### T143后续预期

T377三个前端客户端不在T143当前40路径中，因此本次没有需要手修的生产hunk；但最终M仍须重新实际merge-tree，不能预保永远无冲突。保T143可信指令双接线、原installId、relay最终finally、权限/来源/字节上限与全部拒绝；不借同步重开原修复或扩project/trial/integration。

T143无本单页面资源增量；当前自动预算48项/7,468,956B全等M1。T377采用后应完整沿新M的workbench和其它资源，**不是沿本M数字**；若真实新构建出现T143意外资源delta，先给根准确owner/原因，不预加许可。原Home163/Broker311/9的giant精确登记保留，最终实际size不变就不再改；若别的已采用输入令size变动，按现行测量与根串行登记，不硬拆/放松gate。

### T065后续预期

T377与T065的连接器设置脚本都进入workbench bundle，但三个源文件与connectors-settings.ts不是同一个文本hunk。**资源账本的同一workbench行可能在T377采用后出现冲突**：T065当前1150072→1149861（−211），而新M会有T377实测值。这个是条件风险，不能写成本轮已经发生的冲突。

解决应以最终M完整账本为起点，保所有main增长/下降，在匹配构建后用标准page-assets --update --base落入T065实际下降；**不能取旧1149861，也不能把未来M简单减211当实测**。本次M1静态自动账本48项/7,468,745B，相对M1唯一workbench−211，Alchemist52702、Pages editor708426、Pages39130等沿main。只是在旧输入下核到的JSON差分，不是新served通过。

T065不需要新资源/新增长许可；page-assets脚本应沿最终M，当前自动脚本也与M1完全相同。不能为清理其它owner已消费许可顺手扩大到修改gate；仅当根另给明确资源脚本窗口才改那部分。若真实新组合不再下降或出现别的资源变化，停该资源给根实际diff，不抬预算/留slack。

## 4. shared owner与串行采用

| 共享处 | 保留法及owner边界 |
| --- | --- |
| SECURITY-INVARIANTS.md | T143只保其已审S60/66/91增量；T065保已审S37/95/101。两者若先后采用，后一个从真实main吸收另一方，不整表取旧H，也不把未合分支当base；若有新冲突由根串行核目标行 |
| BACKLOG.md | 各自既有BL后续行与main全部现行行都保留；不擅自销账BL916整行、PG045或其它项目，不让两个writer同时改共享状态 |
| T143 Home与模型链 | 原唯一owner开发线2；T141仍等实际T143采用/逐文件交接，T144与BL916 model前置也只有实际采用后才释放，36绿/mergeable不是采用 |
| T065 OAuth链 | 原作者/同步owner继续持有；T065实际main采用后才推进T066父子接续。T066的设备授权/auth_kind/三旧建议不反向写父片；T066采用后T141再依其registry锁安排，不越序 |
| 资源账本 | T143只吸收main预算，不主动写两资源；T065需要实际下降的预算写窗口，交根与既定T377→T208→T362资源次序协调，不能自行插队或把所有open PR都当新前置 |

两单可各自形成根指定的新H，但本只读准备不派同时writer、不修改任何作者树。根若让其中一单先采用，另一单的最终M将包含它，必须重核真实共享SI/Backlog及连接存储/合同依赖增量；不能把本次互不相交的源码结论扩成“互相采用后也无须检查”。本轮已有metadata/diff供根确定窗口，未刷新完整全仓写锁；真正派writer前仍需fresh核两单实际交集及其它owner，保护PR只读metadata。

## 5. 最小实际补验与原证据沿用

**公共工程部分（未来，均未执行）：** 根确认T377采用与最终M后，唯一writer先核远端H/dirty/占用/旧CI终态，再正常merge实际main，不rebase/force。有main源码/脚本输入则自有隔离系统HOME/CFFIXED/XDG、file secrets、首次adhoc、专用Chrome/profile及公共build/browser槽，offline frozen安装、整体匹配build；保留source/build绑定。两资源以最终M及served真实字节核，不用静态账本代实测。boundary、API/actions一致性、test-imports、merge-base health、diff、fetch后逐提交secrets按最终N核。所有Full仅根安排CI，不在本机执行。

### T143

- 先逐blob/调用链核最终N的Home装配、installed/prompts、broker/model-service/held-result及两core测试/fixture，核原giant与合同不被main自动回退。当前M1这40路径全同H，原36和327/1skip、三变异及强二审可保原范围，无需为“换阶段”重做27文件或三变异。
- 原真包正向要求不降级：complete/query/权限、指令/override/启停/补偿、relay最终guard与TLS三态继续必须由既有或新有效真包证据支持；不能用CI Linux skip、broker替身或UI通过冒充。原36只写H实跑，新N若依赖及相关dist等价可由原验证owner窄核抵，不改署为新跑。
- 最终M若确实改到这些行为输入或新构建/CI暴露相关疑点，最小实际补跑仍是**原两个核心完整文件**signed-model16、sandbox-model20中受影响者，按完整文件/jobs1/retries0；必要时两份36，不扩到27文件/新矩阵。不另造notes/TLS probe，不重复已有效变异。真实Mac输入缺口不能靠Linux Full填绿。
- T377只有三个前端客户端时，不据其采用自动要求重做T143受控模型/图片链；新组合CI/Full与必要Mac证据分层，由根核最终N原件。

### T065

- 保37非交集源码/测试/合同（含原删除），及S37/95/101、BL914/main其它行；原Notion/shared refresh、loopback别名、workspace/rotation条件写回不变就沿用旧独立/二审结论，不重新审完整OAuth实现。
- 真正本次新增关注是**新workbench组合与实际下降预算**。整体build后served --base通过，标准update只记实测下降；若预算文件实际改动，短门禁回归用现有完整page-assets-budget文件（目前171项，按实际结果记），公共槽/jobs1/retries0，已有同准确N有效CI原件先核抵。
- 当前无连接器语义/测试变化，不默认重跑旧普通29、作者66/9M，或上一同步的method-directory10、Alchemist1+5。T377引入新客户端后，只有真实shared-shell差分/CI失败显示连接器设置relay受影响，才由根点名既有非HOLD完整设置浏览器文件；正常CI/Full已有真实checkout/build/完整结果先沿用，不另开大批。
- notion-oauth/provider-contracts/shared-refresh/setup等既定本机HOLD和M1/M3/M6 NOT RUN保持；新增N的相关覆盖通过根授权CI/Full原完整文件日志核对，不能筛case、换设备/入口或借T122其它refresh文件绕过。T066的Full只保父子组合来源，不改称父片纯N同头Full。full=true持续。

两单准确H的现有普通CI已终态success，但只有metadata级更新；新N需要自己的准确CI/Full或经根认可的相同输入核抵，实际checkout/tree、build、完整文件skip/retry/quarantine/bail覆盖均另核。普通push、GH发布/Full控制与采用不由本计划执行；一轮一次普通push等后续根派单。原独立owner只需核真正增量，不循环三阶段总审。

## 6. 本轮原件与完成边界

- [source-metadata.json](/private/tmp/t143-t065-next-sync/source-metadata.json)：两PR准确H、最新CI metadata、关键根裁定与T377未采用快照。
- [M1/merge-summary.json](/private/tmp/t143-t065-next-sync/M1/merge-summary.json)：当前主结论；各任务目录内merge-tree.log、blob-map.json、automatic-vs-H.diff、resources.json可逐项审核。
- [merge-summary.json](/private/tmp/t143-t065-next-sync/merge-summary.json)：起初M0结果保留；[M0-to-M1.diff](/private/tmp/t143-t065-next-sync/M0-to-M1.diff)证明后续只有T378两文档，Full现行覆盖说明随main保留。
- [dependency-and-path-summary.json](/private/tmp/t143-t065-next-sync/dependency-and-path-summary.json)、[T377-main-inputs.json](/private/tmp/t143-t065-next-sync/T377-main-inputs.json)：限定输入与共同路径；objects仅存隔离分析对象，没有可派发实现提交。

无新worktree/branch/源码/索引/ref写入，无build/test/GH/coord/真实Home或密钥操作。T351原作者对象保全；T122自建树已按原授权清理，本任务不回动。当前两计划差异准备已完成；根确认T377真实采用与最终M后才派各单唯一writer，本线不因空闲另造补验。

## 根采用边界（2026-11-01 00:17Z）

此最小同步准备已核收，仍等T377实际采用后冻结M及逐单唯一writer。上文T065旧HOLD仅保留历史证据边界，不新建永久本机测试禁令；后续确有必要时，根按当前授权和独立隔离要求明确整文件范围，不能筛用例或把旧未运行改绿。原36/327与29/66文件等证据保持原头及owner，不为换头重做。
