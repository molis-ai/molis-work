# T385 / T387：T389 实际采用后的最小普通合流准备

负责人：一审线2。状态：2026-11-01 PDT，只读准备完成；尚未得到 T389 实际采用 M，不开始合流。本稿供根在实际 M 到达后直接交原作者，沿用原任务书和已收审验，不新增承载体系、工作项或原任务设计。两份原 carrier 分别保持范围、PR 和 full=true。

## 1. 冻结输入与证据边界

| 对象 | 已读准确值与结论 |
| --- | --- |
| 共同原 M0 | `6729a2d4655caa603daa369f99884e09c4726bde` |
| T385 / #1713 | H=`44efe84d925b7f01e6f8f837c0bf284471ae7659`，tree=`908622b69189edcfed007efb26290d57a1c148c7`；T346+T347，原十路径 +386/-21 |
| T387 / #1714 | H=`3862de92dee5683543fef60d669750053562e330`，tree=`92a84c126f0f1b0c6ac4a04d65921f4d78e03fa3`；T299+T345+T373，原十路径 +148/-123 |
| 本轮本地已采用参考 M1 | `6cdb218302cdb924bd8770a8c2180f5407e30031`，tree=`ca87bd9ee5a14fd3e2fdfc1fab260310cf6c6f55`；与只读本地 origin/main 一致。coord T390 QUEUE 记录远端采用及队列来源；本线未联网复查，不把本地 ref 代称 fresh 远端。 |
| T390 | 原 H=`b7eee1b15353b74c586da601d45418c403e0ff5f`；M1 为其已采用结果。非法 session 写前拒绝及合法同值重新绑定保留。 |
| T389 / #1718 | H=`13767116bd339558596e13ad6b36a3a3ed19f3cc`，tree=`a418a6759f61743ad855c1969b5b9f1895e4cdef`；只读已存对象/coord 原件。未采用，不能当 M 或预取到产品树。 |

T389 首次 Full `41281594550` attempt1、16片及 aggregate success 是根来信并与已读 `plans/T389/FULL-FINAL.md` 一致的证据；实际 checkout 是 `9270a7c0ef31c11e106c52254eb38e9f87d98f9a`，parents=`08642dcb…`+T389 H，**不含后来采用的 T390**。menu 与原 journey 各首轮完整2/2；全 run 有两个其它文件 retry、49个 macOS 文件排除、15个非 pass 计数，不能称无重试/无跳过。此证据不代签两个后继 carrier 的组合 Full，也不证明已采用。

T385 旧 Full `41271185187`、shard11/job124744120267、checkout `6cceb92f4cd5101b3400819c4170d8f6ab1826c0`：原 journey 首轮及内部 retry 均1440通过、390在 custom_rss native click 报 Hidden；该片92/101文件通过、1失败、8未运行/bail，其它取消按原 fail-fast 来源保留。旧 Linux 因果 **UNKNOWN**。T389 Mac H/M 均2/2及后来证明的菜单 restore 缺陷不倒填旧失败原因。**T387 自身尚未跑 Full**；其原成员的历史失败/UNKNOWN保原出处，不写成 T387 有一次历史失败。

本轮直接从 Git 核两树仍 clean/准确 H，逐成员原 merge-base→原 H 与 M0→carrier 对应路径 binary patch 逐字节相同。原作者/验证/二审文件已读；不是仅按状态标签判断。

## 2. 最小合流方式和根串行窗口

根确认 T389 确已采用并给出完整 SHA 的 M 后，分别在现有 carrier 分支进行一次普通 `git merge <M>`；不 rebase、不 force、不重建两原 carrier、不把五原成员重新合一遍、不吸收未采用 T389/T386/T065/T141/T392 头。根交写权后由唯一 author 完成；本稿本身不授予写 refs/GH 权限。原成员 PR 继续只读。

M 若在准备期间进一步前进，只核 M1→M 的真实增量和下面交点，不重开所有在途 H/M 矩阵。T385、T387 没有彼此必须先采用的产品依赖；若根让一个先采用，另一个正常继承它作为主干输入，仍不把它算第二份自有补丁。

### 已确认交点

| carrier | 本地 M0→M1（以及 M0→T389 H）交点 | 合流须保留的两边 |
| --- | --- | --- |
| T385 | 原十路径仅 `tooling/gates/error-owners.json` 同文件 | 主干约71/120行删除 catalog 的 desktop panels 路径、旧 desktop launch owner；T346约308行增加 storage 的 sqlite-baseline 路径和说明。hunk 不重叠。根只交 storage 条目窗口；不得用旧整 JSON 回盖已采用删除。 |
| T387 | 原十路径仅 `apps/workbench/src/immersive-shell.ts` 同文件 | T299约91–114行移动同一JSDoc；主干约299行删除三个 Goal renderer。hunk 不重叠。根只交 JSDoc窗口；不得恢复 renderImmersiveGoalHeader/renderGoalDetailsAside/renderImmersiveWorkTabs。 |

因此当前未发现需产品裁定的文本冲突；这是实际 diff 的 hunk判断，**没有模拟 merge、没有最终合成 tree**。最终 Git 结果仍须核。合流后这两个文件不应再要求“整 blob 等旧 carrier”；应核相对新 M 的自有 patch 与原 patch 等价，其余九个自有文件预期仍可逐 blob 比旧 H（实际 M 无其它变化时）。

T389 自有七路径：documents-state.ts、navigation-feed-sources.ts、navigation-feed-stage.ts、navigation-feed.ts（均 workbench client）、新增 menu e2e、资源脚本和预算。T390 自有五路径：plugin-terminal-panels.ts、project-catalog.test.ts、package.json、SECURITY-INVARIANTS S-103、platform-terminal-launch slice。与两份 carrier 的自有路径均 **0交集**，不需复制或改写这些补丁。它们的主干内容须自然保留，尤其 test:security 末尾 project-catalog token、S-103和合法同值 alias/bind顺序。

根需串行处理：上述两个共享文件窗口；T385 CHECKLIST/CALL-CHAINS/storage README、T387 Feed slice若未来 M 或其它 writer 实际触及的具体 hunk；构建和测试公共槽；最终资源预算/许可及协调状态。资源实际顺序仍由根的 T389→T386→T065窗口管理，但零增长的两份 carrier 不要求自己写许可，也不因等资源 writer而另造承载分支。若新 M含T392路径移动等新差异，只按真实新增路径调整引用/证据，不能在本稿中提前采用它。

## 3. 可以核抵什么，哪些输入已变

原件位置：`/private/tmp/t385-evidence/`、`/private/tmp/t385-verify/REPORT.md`、`plans/T385/{AUTHOR,VERIFY,SECOND,README-NINE}.md`；T387对应 evidence/verify及`plans/T387/{AUTHOR,VERIFY,SECOND,EVIDENCE-MAP}.md`。原 WO分别为 coord `tasks/T-385.md`、`tasks/T-387.md`，原 PLAN/REVIEW 不重开。

- T385 已接受的只读 baseline/776/WAL边界、锁内坏封条拒写/删坏目标、原负控和独立强审沿原来源。当前 Git核 `packages/storage/`、home-plugin-store及15必跑测试文件，M0→M1全部未变；原记录的六个共同fixture和 lock也未变。可核抵未变 storage 拒绝语义和旧动态，不能把整个Host说成未变。
- 本线从T385原始日志重新合计：六完整文件47/47、另九完整文件69/69，fail/skip/cancel/todo均0。合计116来自这个15文件批，不能与旧T346十一文件每头116混账。新 M中的Host/desktop、Home装配/模型端口、项目删除与Goals实现已变化，旧15文件结果不能冒称新组合已全部跑过；这些消费者在新Full按完整文件核回。
- T387七个Feed文件及聚合两文件在M0→M1未变，Feed动作/registration/manifest/contract、直接聚合consumer、storage/plugin-runtime、lock在原reviewed输入表内保持；但该表中的contracts六处和SDK view-placement-declarations以及root package已经变，不能复用旧“全部直接输入未变”原句。三个核心测试与fixture仍未变，旧独立63/7、作者54/59/68及负控按原来源保留，不要求重演；新组合动态仍交自己的Full。
- root package M0→M1只改test:security末尾收录；lock未变。这不是依赖版本升级，但 whole-build/source digest会变，不能拿旧manifest冒新头。T390入口实际写顺序变化也要求后继Full读到当前catalog/MCP文件，不被旧T389 Full覆盖。

原构建：T385 source digest `f115740ff71b5f074c6ec6b9a70fcffb53b322db4c04dd3f7fad5da40856d2db`，T387 `ac7e726c1ba51c99c998b9f0fc71f69f8d682a1b2042663ab874ac1c97a2d7c7`；现存manifest及作者build原件绑定旧H。本轮未重新构建/重算全源码digest。它们证明旧候选工程，不可直接作为新合成构建。

本线重新解析两份candidate-assets和保留的准确6729基线捕获：各48项、7,469,195 B、bytes/hash逐项全等。基线原执行者T146、经T385保存，T387复用；是生产handler响应体捕获而非网络/浏览器验收。后续主干已有T362 +324及T389 +99：若新M只至T389+T390，已知预期总量7,469,618 B、workbench.js 1,150,714 B；这只是已存原件对应的预期，最终用实际M捕获，不能把总量算术作测量。若T386/T065先采用，以实际M为准，不能退回旧数字。

## 4. 精确的完整文件去向

默认不重跑旧H/M矩阵、不做新负控、不新增测试。所有未来本地测试是最终合流后匹配构建、完整文件、jobs1/retries0、公共browser槽，含非浏览器文件；不得用build槽代替。保留新失败原件，不能为绿改断言/筛case。

### T385

1. 新组合在本地补两份完整文件：
   - `tests/project-user-journey.e2e.test.ts`：上次自身Full真实失败文件；按协调§9承载再次推送前检查完整1440/390两路。仅新H一次、不再跑M对照/诊断observer/原矩阵，不宣称由此消除历史UNKNOWN。
   - `tests/secret-store-keychain-retry.test.ts`：原README要求，直接消费Host/desktop/functions装配；新主干这些输入已变。静态调用现有classifyFile（仅读测试/fixture）确认该旧H文件标darwin且非browser，会被Linux Full的--skip-macos-only排除；因此不能把后继Full当它的新组合覆盖。沿原fake security/私有HOME，不碰真实Keychain。旧9/9仍归原H，当前case数按实测。
2. 其余README14份不机械本地重复，在新准确Full逐文件核完成、计数和skip/retry：
   `tests/storage-baseline.test.ts`；`tests/home-store-baselines.test.ts`；`tests/secret-store-format.test.ts`；`tests/home-backup-recovery.test.ts`；`tests/plugin-private-storage.test.ts`；`tests/system-search.test.ts`；`tests/feed-local-history-delete.test.ts`；`tests/project-deletion-owners.test.ts`；`tests/project-deletion-studios.test.ts`；`tests/security-invariants-secret-snapshot.test.ts`；`tests/security-invariants-connector-private-state.test.ts`；`tests/security-invariants-home-payload-purpose.test.ts`；`tests/security-invariants-connector-private-state-limits.test.ts`；`tests/secret-store-missing-key.test.ts`。
   当前静态标记这14文件均无darwin排除，最终还须从真实runner清单确认。原115/116等数不固定为新运行期望。原6+9日志继续作为已核证据，不重开旧包矩阵。若新M改变了其中具体断言/夹具/直接拒绝路径，才把对应完整文件前移本地，不借此扩大整批。
3. 同一Full额外明确定位继承的 `tests/feed-source-menu-refresh.e2e.test.ts` 和上述 journey：新菜单回归和旧失败文件必须完整运行；不能只看16片总绿。

### T387

沿原约定，本地不新增业务矩阵。自身首次新Full明确核三核心完整文件：
- `tests/feed-content-ledger.test.ts`
- `tests/feed-runtime-plugin.test.ts`
- `tests/home-aggregate.test.ts`

它们在本轮静态分类均无darwin标记。T389进入后，另从同次Full定位完整 `tests/feed-source-menu-refresh.e2e.test.ts`、`tests/project-user-journey.e2e.test.ts`，核Feed端到端正常主干行为与新DDL同时存在。它们不是T387的“旧失败重跑”；不因此要求本机再跑一套宽度/菜单矩阵。若实际合流改了业务hunk，再只对改变部分裁定完整文件前移。

### 两份后继Full共享的继承核对（不增本地批）

因为实际M已包含T390而T389成功Full checkout不含它，在各自本来要跑的Full中定位 `tests/project-catalog.test.ts`、`tests/mcp-connection-change-refusal.test.ts`，保合法同值重新绑定/非法零副作用以及T369换连接拒绝。T390原独立红绿/65文件等不重演。继承S-103和test:security不等于carrier新修改安全登记；适用SI仍按相对最终M自有diff和原§8裁定，实际selector若跑/跳过，明确记录，不拿Full替SI，也不强制无关全SI本机批。

以上是派单建议的最小新增执行/原件收口；根在实际M交付时写回原WO的同步交接即可，不建立新spec或测试系统。

## 5. 新H必须具备的工程和Full原件

两份分别交付：实际M、合流前H、合流后N、parents/tree、clean状态、相对M自有diff；逐成员patch-id及完整diff核自有范围等价。若无自有语义变化，依coord§5沿用既有验证/二审，只做合流增量核收，不给甲档补FIRST。

工程原件必须绑定N/实际M：
- 公共build槽的整体 `pnpm build`（安装按offline frozen；已有同输入有效产物可严格核抵，但当前旧H产物不满足新M）；最终源码/build manifest、本树公开包解析，禁止拿其它树dist冒签。
- `pnpm boundary:check`；`node scripts/check-health-gates.mjs --base <M>`（含T385 error-owner、文档/API现行门禁）；`node scripts/test-imports.mjs --check --chains`；`git diff --check <M>...<N>`；`node scripts/affected-tests.mjs --base <M> --json`仅作为精确选择记录，两个任务既定full=true不降级。
- `node scripts/gates/page-assets.mjs --base <M>`及report；准确M和N的实际served各项bytes/hash/来源。两片均预计自有零delta，不改budget/APPROVED_CEILINGS，不重用T389消费前许可，不额外跑page-assets-budget 171例（没有改门禁）；若真实资源差异先定位新M/构建输入，交根再定，不自行调数字。
- 推前fresh main及 `pnpm secrets:check`归根/正式授权执行者；本轮不fetch。保持原API/动作/Manifest/schema版本，不无故刷新快照。

每份PR均要自己的最终N普通Verify及新Full；T385是后继输入新运行，T387是自身首次Full。排程只由根，普通16片/最多6runner及现行总预算，不建integration镜像、不取消CI、不在运行中推代码。Full原件至少含run/event/attempt/head、准确base、每片真实checkout C/parents/tree、匹配build、16片和aggregate终态、实际完整文件清单、首败和内部retry、skip/non-pass/macOS排除/bail/not-run/cancel。第4节点名文件逐一从完整原日志核实，不用event H或总绿代替；旧Full、T389 Full、另一个carrier Full都不能代签本N。

真实M若在排Full前变化，根只据最终diff/生成merge实际输入决定是否需最小再同步；不将“追main”设为无限循环。采用前按原§8核齐；队列/采用仍由根操作且遵守工具审批。实际main回读确认成员自有hunk及继承T389/T390未丢后，才结算原成员“由承载采用”，不称原成员PR自身merged。

## 6. 保持的范围与本轮动作

T385的DELETE/WAL/SHM及776恢复边界、vault锁库活动、原认证失败/前缀删除延期、home-backup不证明vault原key，均不扩。T387只面向新建干净现行v1 Home，不增迁移/compat；T373不关闭R63整项、不承诺两issue有两行Host日志。真实Home/产品/一骏验收均不由本稿背签。

本轮只读Git对象、作者树状态、coord和已有原件，做patch/资源/计数回算与现有分类函数的静态调用；只写本文件。未fetch/改refs/index/源码/GH/coord、未build/test/Full、未启动Host/browser或触真实Home/Keychain。一个临时Python摘要命令语法错误、一个zsh glob未匹配、一个基线JSON容器形状误读均在只读核查阶段修正，没有执行产品或测试，不计业务失败。Memory关键词无命中，未使用相关记忆材料。
