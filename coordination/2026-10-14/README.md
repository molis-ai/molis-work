# 四线交接（2026-10-14）

Molis Work 四条并行开发线的交接：Prologue 完整采用、AI 输入回执、跨插件 AI 交互、情境动作。上一份交接是 [`coordination/2026-10-13/README.md`](../2026-10-13/README.md)（同一分支，规则原话、X1–X6 跨线约定、合并条件都在那里，仍然有效）；这一份只写 10-13 之后变了什么、现在停在哪、下一步谁做什么。

本目录只在远端分支 `coordination/handoff-2026-10-14` 上，不开 PR、不合进 main。本机路径（`/Users/yijunwang/...`、`~/code/prologue-*`、`.claude/worktrees/...`）只在原机器上有效。

## 0. 接手方式：一个主会话，几条线各一个会话

用户的安排（2026-10-14）：之后交给不同的会话做，但有一个**主会话**。

**主会话（统筹）**：

- 不写功能，只做跨线的事：
  - 排合并顺序、合 PR（Molis 与 Prologue）；
  - 管整机的构建与浏览器时段；
  - 把共享核心的改动凑成集成分支跑全量；
  - 判断跨线依赖，替用户按 §4 的两条规则拍板。
- 维护本文 §2「现在的状态」，有变化就改这份文档、推送这个分支。

**线会话**：

- 每条线一个会话，按 §3 自己那一节往下做。
- 本线内的决定自己定，写进本线需求书的决策记录，汇报给主会话。
- 跨线的、改目标或范围的，交主会话。
- 每条线开工先读：
  1. 本文 §2、§4、§5；
  2. 本线需求书最新的进度节；
  3. 两个仓库的 `AGENTS.md`。

采用线工作量最大、在关键路径上（P3 是好几条线的前置），建议给它一个专门会话；W4-06 可以单独再给一个会话。

## 1. 四条线

| 线 | 需求书（main 上） | 现在的进度节 |
| --- | --- | --- |
| Prologue 完整采用（采用线） | `specs/prologue-adoption/spec.md`；SDK 合同在 Prologue `docs/slices/taskboard-collaboration.md` | Molis spec 开头状态句；Prologue 合同「P2 进度」节 |
| AI 输入回执（回执线） | `specs/ai-input-receipts/spec.md` | §16「进度」、§19「接续入口」 |
| 跨插件 AI 交互（交互线） | `specs/ai-interaction-experience/spec.md` | §17 分片表、§20.13（A1+H2）、§20.14（A2） |
| 情境动作（情境线） | `specs/context-program/spec.md`（总纲） | §16.4、§20（当前接续入口）、§20.11（W2 用例） |

## 2. 现在的状态（2026-10-14 17:00 UTC 写）

**Molis main = `774acaf5`。**

10-13 以来四线合进 main 的 PR：

- #408：采用线对账，过渡 SDK 包进 main。
- #409：回执阶段 1 第一片。
- #410：交互 C1+H1。
- #411：情境 W1/W2。
- #487：settings-assistant 的 fetch 修复。
- #491：采用 A1 核对。
- #492：交互 A1+H2，合并提交 `34d0d1fc`。
- #494：情境 W2-02/05/08 用例与浮条章节，合并提交 `5ba2fa92`。
- #496：交互 A2，合并提交 `774acaf5`。

别人同期合进来、和这几条线有交集的：

- #488：状态环。A2 并 main 时，把它放到了共享问卷卡上。
- 窗口图过渡包：现在 vendored 的是 `prologue-sdk-0.0.0-rc.1-interim-p1-cu-image.tgz`。

**Prologue main = `c5d35d7f`**，P2a–P2h、S1–S4、Computer Use、H16、窗口图都在。最近合的：

- #16 P2g；
- #17 H16；
- #18 窗口图；
- #19 P2h（等待：条件组、四态、`board-wait`）。

**在途（都已推送，没有只在本机的东西）**：

| 线 | 仓库 / 分支 | head | 状态 | 本机工作树 |
| --- | --- | --- | --- | --- |
| 采用 P2i | Prologue `feature/p2i-continuation` | `5cad14e6` | 实现与用例完成；定向用例、13 个变异都过。**完整验证未跑**（等整机构建时段），没开 PR | `~/code/prologue-p2i` |
| 采用 P2j | Prologue `feature/p2j-checkers`（叠在 P2i 上） | `e8c1881d` | 同上（14 个变异全红）；没开 PR | `~/code/prologue-p2j` |
| 采用 W4-06 | Molis `refactor/w4-06-prologue-node` | `4c44afaf0` | **WIP**：代码已拆完，**还没构建、没类型检查、没跑用例、没过门禁** | `.claude/worktrees/line-adoption-w406` |

- 上表写于暂停前。若之后 P2i/P2j 的验证在本会话跑完、PR 已开或已合，以 Prologue 远端为准。
- 查法：`gh pr list --repo molis-ai/prologue`，以及 `git log origin/main` 有没有带 `p2i` / `p2j` 的合并。

**已知的既有失败（不是四线引入）**：

- Molis main：`touch-targets.e2e` 两条（亮、暗各一）。
- Prologue：`desktop-computer-use.live.test.ts` 会真的操作这台电脑的桌面，**不要跑**。
- Prologue 的 `workspace-watch.live` 在 10-13 那台机器上是环境性失败，这台机器上是过的。

## 3. 各线下一步

### 3.1 采用线（关键路径）

1. **P2i 收尾**（Prologue）：
   - 在 `~/code/prologue-p2i` 跑 `coordination/2026-10-14/tools/prologue-verify.sh ~/code/prologue-p2i p2i-1 <P2h 的包>`。要放在 `build-lock.sh` 下：用法见 §5。
   - 包是验证脚本打的 `prologue-sdk-0.0.0-rc.1.tgz`。没有就先对 Prologue main 跑一遍脚本，得到它。
   - 过了：
     - 把结果写进合同「P2i」进度条的「验证」行（现在是「跑完补」）；
     - 开 PR，PR 正文照 #19 的写法：内容、不含、对消费方的影响、验证、变异；
     - 合并（用户授权：Prologue PR 验证过即由我们合，merge commit）。
   - 全量里若只有公开面快照不同：对照 P2i 加的三个类型核一遍，再 `-u` 更新。
2. **P2j 收尾**：
   - P2i 合进 Prologue main 之后，在 `~/code/prologue-p2j` 合 `origin/main`；
   - 跑验证（上一个包用 P2i 的），补「验证」行；
   - 开 PR、合并。
   - P2j 合完，**P2 全部完成**，P3 可以换包。
3. **W4-06**（Molis，P3 的硬前置，也是回执线「会话条目端口」的前置）：
   - **做了什么**：把 1,551 行的 `prologue-node.ts`（`initializePrologueNodeAdapter` 1,281 行，内嵌 `startAgentRun` 406 行）拆成：
     - `prologue-node-kit.ts`：选项、各轮内存状态、共用工具；
     - `prologue-session-index.ts`；
     - `prologue-schedule.ts`；
     - `prologue-review-documents.ts`：审查卡按种类拆成小函数，批准桥、审查历史；
     - `prologue-recovery.ts`；
     - `prologue-run.ts`：`startAgentRun` 拆成十来个阶段函数；
     - `prologue-node-port.ts`：Runtime 构造与端口；
     - `prologue-node-parts.ts`：项目工作、会话消息、等待、步骤图、推理与构建 Agent。
     - `prologue-node.ts` 只剩组合。
   - **行为应当不变**：代码基本是原样搬移，只把闭包里的共享状态改成显式参数。
   - **还要做的**：
     1. 整体构建：`pnpm build`，在构建时段里做。
     2. `pnpm --filter @molis-ai/molis-work-service-agent-host run typecheck`，或整体 `tsc`。修类型错：写的时候没编译过，按经验会有几处。
     3. 跑 agent-host README「改动后必跑」那组，加上 `node scripts/affected-tests.mjs` 选出的用例：`prologue-*`、`agent-*`、Coding 与助理的浏览器用例。
     4. `node scripts/check-health-gates.mjs --base origin/main`：每个新单元都必须低于阈值（函数 150 行、文件 800 行、类 300 行/25 个方法），被拆掉的巨大单元从基准里消失。`--update --base` 更新本地快查。
     5. 在 `docs/system/HUGE-CLASS-MIGRATION.md` 把 `prologue-node.ts` 那一行改成已拆，在防腐 spec 里把 W4-06 记为完成，注明经采用线做。
     6. 动的是共享核心，按规矩要跑全量，由主会话排进集成分支。
     7. 开 PR；正文写清「搬移、行为不变」，并列出逐文件对应。
   - 若类型错太多、搬移出了偏差：以 `origin/main` 的 `prologue-node.ts` 为准逐段对照。拆分方案本身不用重想。
4. **P3：Molis 第二次换包**。范围见采用 spec §4.6：
   - **换包**：从 Prologue main 的具名提交重新打包，替换 `vendor/prologue-sdk/` 里的过渡包；`.sha256`、`.provenance.json`、`patch-history.json` 一起改，`pnpm health:check` 会核。
   - **新合同子路径**：`services/agent-collaboration`，与第一个使用者同批建。
   - **Host 侧两个新文件**：
     - `prologue-collaboration.ts`：协作口、视图投影；
     - `prologue-checkers.ts`：检查器登记表。
   - **SDK 公共行为变了，Molis 要跟着改的地方**：
     - **等待**：`runtime.waits` 没有了 `park`、`resume`、`flush`，没有 `fired` 状态，条件 `board-node` 改名 `node`；登记改用 `arm`，必须挂在一个步骤上。改的是 `horizontal/agent-host/src/adapters/prologue-waits.ts`（「等某一步做完」与 `parkOnWork`）。
     - **让出**：`dispatch-subagent` 的 `yield` 现在是「派出 + 这一步等孩子那一步结束 + 收工」。SDK 不再自己叫醒父亲：删了 `onWake`、`onYieldSettled`、`SubagentHandle.wake`。要接着做，Molis 有两条路：
       - 在 `createRuntime` 的 `collaborationHost` 里实现 `startContinuation`；
       - 或者看图事件（接续 `eligible`），自己用接续的请求键 `startAgentRun`。
       否则让出之后停在 `eligible`。Coding 与助理的「交回与续做」（#472 带来的）要改到这条路上，`subagentYieldGuard` 一起删。
     - **调用顺序**：没绑步骤的跑不能协作（P2d）；`session-send` 要求绑定和相邻（P2g）；派出前多一步 `admitDispatch`（P2e）。
     - **板的写法**：一次改图在落盘之后才在内存里看得见（P2h）。Runtime 内部记账的改图可以不带版本（P2i）。
     - **请求键**：接续的请求键是 `板.等待`，能直接当开跑幂等键。
     - **外部条件**（P2j）：`createRuntime({ conditionCheckers })`，配置在 `config.waits.external`。
     - **S4**：`board-plan`/`board-revise`/`board-report` 的 `forInputs`/`inputs`、`acknowledge-inputs` 的新目标、`ask-user` 的 `about`。回执线阶段 3 用得到。
   - P3 的「默认路径验证」在换包那次改动里做，不验证不合。
5. **P4**（助理那一半按 W5-10 形状由功能线做，用户 10-13 定）、**P5–P6**、**A2–A5**：按采用 spec §5.2，在 P3 之后。

### 3.2 回执线

阶段 1 第一片已合（#409）。阶段 1 还剩下面这些（spec §11 阶段 1、§6.2a 落点表、§7 失败与恢复表）：

- **1a 抽取**：`assistant-inputs.ts`（助理的发送路由与回执，W4-05 形状），`input-receipts-client.ts`（Coding 的回执渲染）。先抽取，后加功能。
- **1c agent-host**：
  - 补充带键；同键重发去重；
  - `RUN_NOT_RUNNING` 竞态改为用同一个键 `session.queueInput`，回执写「这一轮刚结束 · 已排到下一轮」；
  - `runViewVersion` 纳入输入状态；
  - 恢复报告加「输入」一类。
  - 落点：`apps/local-host/src/assistant/assistant-service.ts` 里 `adapter.control(..., { kind: "steer" })` 的几处、Coding `run-inputs.ts` 的 `runControl`、`horizontal/agent-host/src/adapters/prologue.ts` 的 `control()`。
  - 会话条目端口要等 W4-06 拆完再接。
- **1d Coding**：
  - 发送方式菜单：补充 / 打断 / 下一轮；
  - 「发送中」气泡与同键重发；
  - 宿主说明不显示成你的话；
  - 「核对并继续」带上没读到的输入；
  - 计划轮次不再未经核实就写「已体现」。
- **1e 助理**：工作视图显示每条输入的回执，用删掉的重复渲染抵消资源字节；回答与补充由用户点选；重试键跨刷新保存。
- **R0 现场投影（D19）**：换包那次把预览改成现场调用 `projectInputReceipts`，同一个改动里删掉录好的投影文件。

注意：

- 这些单元（`assistant-service.ts`、`assistant-island.ts`、`prologue-stream.ts`、合同 `agent-host.ts`）都是基线里的巨大单元，只许缩。
- 资源字节只许减少。
- 阶段 3 依赖 P3 换包（S4 进 Molis）。
- 工作树 `.claude/worktrees/line-receipts` 在 main `774acaf5`，干净，可以直接用。

### 3.3 交互线

已合：C1+H1（#410）、A1+H2（#492）、A2（#496）。决定记在 spec D13–D20。

剩下的（spec §17 分片表与 §20 末尾）：

- **H3 对象引用**：
  - 只读动作 `interaction.references.search`，按种类与范围，从对象主人读当前有权限的候选；
  - 提交前 Host 逐个再读；
  - `pnpm actions:update`；
  - `docs/system/SECURITY-INVARIANTS.md` 的「对象引用由宿主复核」加拒绝用例，过 `pnpm test:security`。
  - 情境线的落点读取要和它共用对象主人的读法。
- **H4 Coding 的操作卡**：
  - Coding 的 Run 也能 `suggest-action`，记录走 H2 的协作者 `apps/local-host/src/assistant/assistant-offers.ts`；
  - Coding 的专业后续（查看变更、核对并继续）进同排下一步；
  - 以 #408 合入后的 `suggest-action` 形状为准（`mutate-external`、`HOST_GOVERNED_TOOLS`）。
- **S1 单次接续**：
  - 题型校验纯函数放 `packages/plugin-sdk`（A2 已在那里放了 `questionAnswer`）；
  - 与 Prologue `validateQuestionnaireAnswer` 做一致性用例，并进 `tests/ci-product-subset.txt`；
  - Form「AI 生成表单」缺信息返回 `needs_input` → 同一问卷卡 → 接续生成。这是 Form 的**新功能**。
- **题型**：现在宿主题型交集 `hostQuestionTypes()` 是 `["choice"]`。日期、数字、对象引用要等每个显示问题的界面都画得出来才放开（`agent-question-surfaces.ts`）。
- **另外**：
  - `assistant-base` 提示词里关于对象引用题的那一句，等 H3 时补；
  - 用户验收（助理与 Coding 的问卷卡、操作卡）未做。

### 3.4 情境线

已合 #411（W0、W1、W2：浮条取代底栏、Pages 迁到浮条）与 #494（W2-02/05/08 用例、`skills/molis-plugin-dev/contextual.md` 浮条章节）。W1-9 原以为要一个门禁 PR，核下来不需要：快照工具已覆盖 SDK 导出，已告诉用户。

剩下的：

- **W3 起**：按总纲第 9 节分期——中枢接右栏、助理与落点、Pages 的落点、右栏改版。每步先对照 §18.2、§19.5 的门禁。
- **要先问用户的**：
  - 两组真实 Jev 评估、桌面原生拖出（要真实凭据或真实环境）。
- **别人的**：
  - 右栏「电脑」那一格归 Computer Use 原负责人，本线只留位置。
- **用户验收**：未做（一骏本人）。

## 4. 规则（10-13 交接 §3 全部仍有效，下面是之后新增或改动的）

- **拍板**：
  - 技术决定按防腐后果，功能决定按用户的使用体验、按推荐走。
  - 仍先问用户（弹窗，带推荐）：发布与改版本号；动真实 Home（4207/4208/4173）或安装版；放宽门禁、`limits.json`、`biome.jsonc`、门禁脚本、例外文件；读真实凭据；计划外的 PR。
- **合并**：
  - Molis：CI 的 `Verify` 等必需检查绿、分支与 main 同步，就可以合（merge commit）。`Linux probe` 不是必需检查。
  - Prologue PR：按合并条件验证过即合。
- **推送、开 PR**：不用再问。推送前 `pnpm secrets:check`，先 `git fetch origin main`。
- **提交身份**：照 10-13 交接 §3 第 9 条。
- **只在自己的路径提交**：
  - 不裸用 `git stash`，不强推；
  - 不碰别的会话的工作树与未提交改动；
  - **不要对有未提交工作的文件用 `git checkout <文件>` 去撤销调试改动**——这次就这样丢过一个文件的全部改动，靠重做补回。
  - 调试改动先备份到别处，再改回。
- **Prologue 仓库**：
  - 不用 `git add -A`，逐个路径加；
  - `Archive/` 只读；
  - 每一刀一个 PR。
- **少用子代理**：用户 10-13 说「尽量不要用 subagent，就在主 Session 来」。现在换成多会话，各会话内部仍然照这条。
- **门禁与断言**：不为变绿放宽或删除。先分清产品回归、预期变化、测试缺陷、环境时序。
  - 预期变化改断言时，在 PR 里逐条写理由。例：P2h 的两条，见 Prologue #19。

## 5. 机器、锁与验证

**整机一次一个构建、浏览器用例最多三批。** 锁是这台机器上的目录，用 `coordination/2026-10-14/tools/build-lock.sh`（原件在主检出 `.claude/handoff/tools/`，不入库）。和防腐那边的 codex 会话共用，它跑全量时会长时间占着构建锁。

```bash
L=/Users/yijunwang/code/goalboard/.claude/handoff/tools/build-lock.sh
B=/private/tmp/claude-501/-Users-yijunwang-code-goalboard/f09f1cf5-06fd-4140-bead-c6dba6a4d675/scratchpad/browser.lock
$L <标签> pnpm build                                              # 构建
LOCK_DIR=$B $L <标签> node scripts/run-tests.mjs <浏览器用例…>      # 浏览器用例
$L <标签> env LOCK_DIR=$B $L <标签>-browser node scripts/run-tests.mjs > 日志   # 全量（两把锁都拿）
```

谁占着锁：`cat <锁目录>/info`。

**Molis**：

- 全量约 110 分钟。
- 跑之前先整体 `pnpm build`；全量期间不改源码、脚本、`package.json`、`skills/`。
- 失败用干净基线工作树（`git worktree add --detach <基线>`）跑同一批文件对比。

**Prologue**：`coordination/2026-10-14/tools/prologue-verify.sh <工作树> <标签> [上一刀的 tgz]`，在构建锁下跑。它依次做：

1. build dist；
2. `tsc`；
3. SDK 全量（两个 worker，排除 `desktop-computer-use.live`）；
4. 干净 `git archive` → pack；
5. 在空目录里跑全部 `*-consumer.mjs`；
6. 对上一刀的包再跑一遍（新加的消费者脚本应当失败）。

结果在 `$PROLOGUE_VERIFY_OUT/<标签>/summary.txt`，默认 `/tmp/prologue-verify`。

- **先 build dist**：`*.live.test.ts` 的子进程夹具读 `packages/sdk/dist`。新工作树没 dist 时会出现十几条「Producer exited before boundary」，不是产品问题。
- **变异检查的做法**：一次改坏一处关键实现，跑对应用例确认变红，再还原、确认没残留。脚本形态见 P2h/P2i/P2j 的 PR 与合同进度条。

## 6. 这次踩过、下一位要记住的

- **钟停着时不能原地打转**：Prologue 的内存 Host 时钟不走，只有 `clock.advance()` 才动。凡是「按下一次时刻排队」的逻辑，要从「现在」与「这一回到期时刻」中较晚的那个往后排；P2j 曾因此在测试里一秒几千次地打转。
- **改图先落盘再换进内存（P2h）的连带影响**：
  - 先读版本、再排队写的调用会撞 `TASKBOARD_CONFLICT`。Runtime 自己记账的写入不要带「刚读到的版本」。
  - 没 await 的改图，在下一行还看不见。
- **开跑键的字符集**：只能是 `[A-Za-z0-9._~-]`。步骤编号是自由文本，不能拼进键。
- **用例必须走过真的跑**：P2h 的 `canPark` 在执行器建好时就算定了，所以绑定的跑永远让不出；只靠单元测试抓不到，跑级用例才抓到。
- **Molis 门禁是对照 merge-base 量的**：
  - 新文件里的长函数算新增的巨大单元，搬家也算。所以 W4-06 必须拆到阈值以下，不能整段搬。
  - 页面资源字节只许减少，预算等于实测。
