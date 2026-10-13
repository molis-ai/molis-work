# 协调板（统筹会话维护；各会话只改自己那一行）

统筹：主 session（Molis 四线接续）。资源规矩：`docs/system/PARALLEL-DEVELOPMENT.md` §5；锁：`.claude/locks/slot.sh`。

> **⏸ 2026-10-13 03:55（北京时间）用户：「先暂停一下」。** 全部会话停在安全点、提交本地 WIP、释放锁、不开新任务，等统筹恢复通知。统筹已停掉批量归因（集成工作树 batch1 与基线工作树 baseline-894b917a 保留，部分复跑日志在统筹 scratchpad），未合并 Prologue #10。

## 资源优先级

- **2026-10-12 18:20 起（用户：「优先开发，全量回归测试不用每次都触发，攒一波一起弄，除非必须」）**：
  - 平时只守「整机同时最多一个构建、一个浏览器用例批次」（build / browser 两把锁，跑完即放）。不再开静默时段（quiet）与侧道（lane）。
  - 每次改动跑定向用例：`node scripts/affected-tests.mjs` 选出的非浏览器 + 受影响的浏览器用例。**不自己跑全量**。
  - 全量只在必要时、批量跑：统筹把几个动共享核心（contracts、kernel、plugin-sdk、modules、local-host 装配、workbench 外壳）的 PR 合到一条集成分支（PARALLEL-DEVELOPMENT §7），跑一次全量，结果分给各 PR。时间由统筹排（这台 Intel Mac 全量约 4 小时，尽量放在大家空闲时段）。动共享核心的 PR 等这批全量过了再合；其他 PR 凭 CI + 定向用例合。
  - 18:20 停掉的那次全量（adoption，c5ddde8e，跑到 478/850 个文件，3060 过 18 败）作为部分证据保留；那 18 个失败由 adoption 定向复跑并与干净基线比对。
- 锁的持有人会话停了（额度用尽、网络中断）时，统筹查实没有进程在跑后代为释放，并通知持有人。
- **第一批批量全量：已开跑（2026-10-12 14:46Z，约 4.5 小时，统筹持 build+browser，owner `hub`）**。集成分支 `integration/batch1`（工作树 `.claude/worktrees/batch1`，e91d135f）= main 894b917a + #442（含 #408）+ #430→#434；冲突只有 `package.json` 的 test:security 与 `SECURITY-INVARIANTS.md` 的 S-13 行，按两边都留合并。期间其他会话：写代码、规划、跑不需要重新构建的非浏览器用例；构建与浏览器用例排队到它结束。原计划：：集成分支 = origin/main + #408（adoption）+ #430→#433（情境 W1-3/4/5/7）+ #434（文档）。开跑条件：#423 的 6 个与 #429 的 9 个定向浏览器用例跑完、adoption 的 18 个失败复跑完。跑时统筹持 build+browser 约 4 小时；其他线写代码与规划、排队等锁。结果按 PR 归因后依次合并。
- 「Molis Work issue 功能优化」会话（工作树 `.claude/worktrees/issue-experience`，预览端口 4317/4327）从 2026-10-12 约 14:20 起也用本锁（owner 名 `issue`）。在那之前约一小时它没走锁跑过一次 `pnpm build` 和两次 issue e2e：那段时间里出现的超时类失败，先单独重跑再定性，不算产品回归。
- 2026-10-12 修过 `slot.sh`：外部进程检测不再把 `sh -c` 等待循环算作占用。
- 真实 Home（4207/4173）不碰；一律临时/隔离 Home。

## 用户定的规则（2026-10-12）

- 拍板：技术决策按防腐线的后果判断；功能线按对用户 UI 交互与使用体验最好的推荐走。本线内的决定各会话自己定，写进 spec 决策记录并在汇报里列出；跨线或改目标/范围的找统筹。仍先问用户：合并 Molis/Prologue main、发布、真实 Home/安装版、放宽门禁、读真实凭据。拍板不等于用户验收。
- 推送：各会话可推自己的分支（先跑 secrets 检查，SSH 地址）。
- **开 PR（2026-10-13 02:10 起，用户原话：「不用单开PR，每个线都只在之前的交接PR里commit，因为有另外的防腐线在做代码质量和架构升级，所以单开PR的话，如果防腐有改动，容易导致架构问题」）**：Molis 侧每条线只往自己的交接分支提交——adoption → `feature/handoff-prologue-adoption`（#408）、receipts → `feature/handoff-ai-input-receipts`（#409）、interaction → `feature/handoff-ai-interaction`（#410）、contextual → `feature/handoff-contextual-actions`（#411）。不再开新的 Molis PR；已开的单独 PR（#429–#434、#438、#439、#442、#447）并入各自交接分支后关闭并留评论。Prologue 侧照旧每刀单独开 PR（用户选）。
- **跨线依赖经 main（用户原话：「先推进按照当前main的代码开发功能，如果几条线之前有依赖关系，从main拉取最新代码合并入各自分支之后按照防腐线防腐要求进行复查，确保需求迭代的同时不与防腐要求冲突，几条线的开发顺序由你统筹」）**：每次把 main 合进交接分支后，按 `.claude/locks/ANTI-CORRUPTION-REVIEW.md`（**已就绪**，2026-10-13，对照 main 1ec92c18：机器检查 16 条、人工检查 27 条、与防腐在途 16 片的交界表；注意 main 新增的错误模型门禁 `defineErrorCodes` 与浏览器请求统一走 `packages/ui-host/src/request-client.ts`）复查本线自己的 diff，结果写进本线 spec。合进 main 的顺序（统筹定）：① #408（D7 与交互 C1+H1 的前置；批量全量 + 防腐复查 + Verify 后合）→ ② #411（W1 合同等，批量全量已含）→ ③ #410（I1 等；C1+H1 等 #408 进 main 后再并入）→ ④ #409（R0；生产接入等 D7）。
- 合并：由统筹按条件合并（Molis：`Verify` 绿、与 main 同步、secrets 与 health `--base` 过、证据入 spec、统筹读过 diff；Prologue：**先重新 build dist**（packages/sdk/test/fixtures/*.mjs 子进程夹具加载 dist，vitest 不会重建；2026-10-13 因此漏过 P2d 的 5 条红）再跑 SDK 全量 + 打包消费者检查，都通过；Molis 还没在用的 SDK 切片（如 P2 各刀、S4）凭这两项即可合进 Prologue main，Molis 默认路径验证在「换包进 Molis」的那个 PR 里做，那个 PR 没验证不合）。各会话不自己合并。
- 模型：规划用 Opus 5.5（high/xhigh），执行用 Sonnet 5.5（xhigh/high）；会话切换阶段时找统筹切模型，自己派 subagent 也按此分配。

## 写入主人

| 范围 | 唯一 writer |
| --- | --- |
| Molis `feature/handoff-prologue-adoption`（`.claude/worktrees/prologue-adoption`） | adoption |
| Prologue `feature/handoff-molis-a0-s1`（`/Users/creamiex/molis-ai/prologue-wt/sdk-integration`）= 唯一 SDK 整合分支、合成包负责人 | adoption |
| Prologue `feature/input-receipts-s2`（`/Users/creamiex/molis-ai/prologue-wt/input-receipts-s2`） | receipts |
| Molis `feature/handoff-ai-input-receipts`（`.claude/worktrees/ai-input-receipts`） | receipts |
| Molis `feature/handoff-ai-interaction`（`.claude/worktrees/ai-interaction`） | interaction |
| Molis `feature/handoff-contextual-actions`（`.claude/worktrees/contextual-actions`） | contextual |
| Prologue `feature/handoff-ask-user-fields` | 只读来源；整合由 adoption 做 |

## 端口

| 线 | 端口 |
| --- | --- |
| contextual W0 人工预览 | 4290 |
| interaction I0 人工预览 | 4319 |
| adoption 隔离 Home 服务（若需要） | 4291 |
| receipts（若需要） | 4292 |

## 状态（各会话更新自己一行：日期时间 · 在做什么 · 卡在哪）

| 线 | 状态 |
| --- | --- |
| adoption | 2026-10-13 · **已暂停（用户）**。Prologue：P2a–P2f 已合（#7 #8 #9 #11 #12 #13 #14）；P2g 提交在本地分支 `feature/p2g-scope`（6b629bb9，未推送、全量未跑完、没开 PR）。Molis #408 在 9a7c9505（已推送，干净）。不持 build/browser 锁，没有后台进程。等恢复通知 |
| receipts | 2026-10-13 · S4 工程通过，Prologue PR #10（待合）；R0 已并入 #409、#438 已关；预览进程在 4292；R0 的 e2e 在交接分支上排队等 browser 锁（hub 持着），到了自动跑 · Molis 生产接入等 D7 |
| interaction | 2026-10-13 · 只在交接 PR #410 提交（a1981f8e 已推）：I1 已并入；预览已改用共享客户端（单测过，浏览器用例待 browser 锁）；C1+H1 在本地分支 feature/agent-typed-questions（c50a5534，未构建，等 #408 入 main 后并入）；发现 A1 字节预算净增约 10KB（见 spec §18），需先定办法 · 等锁：验证预览 e2e、interaction-client e2e，构建并验证 C1+H1 · #439/#447 待用户放行关闭 |
| contextual | 2026-10-13 03:02Z · 全部并入 #411（W1-1…8、W1-2、W1-6、W2-0、W2；原 #429–#434/#445 已被统筹关闭，#446 的提交已在 #411），已合 main 490251d1 并推送（be29dd53）；页面预算已降、健康门禁与边界检查通过、定向非浏览器用例 277/277。浏览器：新浮条 e2e 与重写的情境用例通过，窗格类 6 个用例两次都败（待与干净基线比对）。已排队等 browser 锁复跑一小批（不持锁）· 无阻塞
