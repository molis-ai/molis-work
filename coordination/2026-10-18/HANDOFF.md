# 交接（2026-10-18）

用户 2026-10-18 的决定：防腐线和 Computer Use 线照常继续，其余五条线做完手上的这件就推送，然后暂停；推上来的 PR 由统筹合进 main，然后交给接手的人。

本文只在远端分支 `coordination/handoff-2026-10-14` 上，不开 PR，不合进 main。本机路径（`/Users/yijunwang/...`、`.claude/worktrees/...`、`~/code/prologue*`）只在原机器上有效。

## 0. 接手先读

1. 两个仓库的 `AGENTS.md`（Molis 的硬约束、门禁、构建与测试；Prologue 的 §7 live 规则）。
2. 本文。
3. 评审清单：[`coordination/2026-10-13/ANTI-CORRUPTION-REVIEW.md`](../2026-10-13/ANTI-CORRUPTION-REVIEW.md) §3。每个 PR 入队前都按它审 diff。
4. 流水记录：[`coordination/2026-10-14/README.md`](../2026-10-14/README.md)，每件事发生时的原话和理由都在里面，按日期往下看。
5. `docs/system/PARALLEL-DEVELOPMENT.md`（本机只有一个浏览器槽；全量交给 CI；第 5.1 节写了不跑全量、只按 pid 停进程）。

## 1. 现在停在哪

- Molis main：`f4207e064`（#730 合入之后）。Prologue main：`dd639069c`（#50 合入之后）。Molis vendored 的 SDK 还是 3adc5e87（`prologue-sdk-0.0.0-rc.1-after-write-check-key.tgz`），prologue#50 还没换进来（交采用线，和批 B 合成一次）。
- 10-18 合入 Molis main 的：#709、#711、#715、#661、#716、#712、#699、#717、#719、#722、#684、#718、#713、#724、#723、#714、#725、#703、#727、#720、#708、#726、#728、#721、#731、#730。合入 Prologue main 的：#48、#49、#50。五条暂停的线，推上来的 PR 已全部合入。
- main 上 `molis-work-workbench.js` 是 1,113,068 B，安全不变量编到 S-40，BACKLOG 编到 BL-176（BL-163 已按评测删行）。coding-base 是 v13。
- **全量**：用户 10-18 为提速定，交接前最后一批（#720、#708、#726、#728、#731、#730）不逐个跑全量，Verify 绿就入队；全部合入后在 main 上跑一次：run 39133836119（f4207e064），结果见下面 §1.2。#721 是从用户账号自己合的，也一起由这次全量覆盖。

### 1.1 还开着的 PR（都不是这五条线的）

| PR | 谁的 | 现在 | 接手要做的 |
| --- | --- | --- | --- |
| #729 | 防腐线 W5-01（Codex）：灵光改走 Plugin Runtime，删 `/api/lingguang` | 10-18 交接前才开、已标成待审；统筹没审 | 按 §3 审；它重写 `plugins/native/lingguang/src/actions.ts`，#730 已先合，要它解冲突（#730 加了 `lingguang.revert` 与 intake 声明） |
| #733 | 防腐线（Codex，草稿）：cognia 的知识改走 Home 插件运行时 | 10-18 13:10 新开 | 转成待审后按 §3 审 |
| #732 | jingxusandra-gif，产品运营文档对抗式审查（只改 `docs/product-operations/`） | 501cf1fa8 统筹审过、只改文档；统筹曾按 #722 先例入队，用户 10-18 把它移出了合并队列 | 交作者与用户定，不要自己再入队 |
| #734 | jingxusandra-gif（草稿）：Linux 探测补 uv 安装依赖（CI） | 10-18 新开 | 转成待审后按 §3 审；改的是 CI，看会不会放宽门禁 |
| #631 | jingxusandra-gif（草稿）：统一输入与本地语音 | 用户定留给作者 | 不处理；它会手动触发全量、占 runner |

这次处理过的存量 PR（用户 10-18：交接之前把存量 PR 都处理掉）：
- #156（jingxusandra-gif 的文档草稿，10-02 起没更新，和 main 冲突）：按用户决定关闭，并留言说明可以在 main 上重开。
- #703（防腐线 W5-01，Codex）：没经统筹、没跑全量就从本账号入队合入（63639a764）。统筹事后审过；main 上补跑的全量第 8 片 `coding-input-receipts` 两次红、单独重跑通过，判负载时序；#727 的全量（run 39127845026）作为它的全量证据，结论写在 #703 评论里。
- #727（防腐线 W5-01 材料服务）：用户定等它再合；审过、全量过，已合（74f39a47c）。
- #708：全量第 6 片 `context-landing-panes` PANE-LAND-02 红——多收到的是分屏窗格里真的 Pages 又报了一次落点，不是伪造的那条被放进来，判负载时序；之后按用户决定直接入队、已合。
- #731：#728 合入后在 BACKLOG 表尾撞行，统筹在 9aaa486ec 上 merge main（BL-171～173 排在 BL-175、BL-176 前）再入队、已合。
- #730：#727 合入后 merge main（S-39、S-40 两行都留），#720 合入后再 merge main、放行键重取为 [1111910, 1113068]（实测 +1,158），已合。
- #721（Computer Use 线，DeepSeek Harness）：10-18 13:46 从用户账号在 6a86d09cd 合入 main（7509b10ad），没等统筹要求的那处修改。**必须的后续，交 Computer Use 线**：`apps/local-host/src/computer/computer-act.ts` 的 `selector` 仍把模型给的 `/…/` 直接 `new RegExp(…, "iu")`，再对最多 600 个节点名 `test`；模型输入受页面内容影响，回溯型正则能卡住宿主的事件循环。改成按名字包含匹配（或有界、不回溯的匹配），配一条断言拒绝/不卡住的测试，补 `SECURITY-INVARIANTS.md` 的 S-25 行。PR 评论里有记录；统筹给用户留了一张起新会话做这件事的卡片。

### 1.2 main 的全量（交接时）

- run 39133836119（f4207e064）：进行中。结果补在这里；红的按 §2 的办法分清是谁的、是不是负载时序，交给对应的线或接手的统筹。

### 1.3 合入后要清的（删除要用户在各线自己的会话里弹窗确认）

- 回执线：#714、#726 都已合，工作树与分支见 [`lines/receipts.md`](lines/receipts.md)。
- 交互线：#708 已合，工作树 `line-interaction-ac08`、分支 `interaction/ac08-two-tabs`，另几个旧本地分支先 `git branch -d` 确认已合入再删（见 [`lines/interaction.md`](lines/interaction.md)）。
- 采用线：#725、#728 已合，工作树 `wt-a21` 与分支（见 [`lines/adoption.md`](lines/adoption.md)）。
- 情境线：#720、#730 已合，工作树 `.claude/worktrees/line-contextual` 与笔记里列的分支；`~/.codex/worktrees/context-w0` 不是情境线会话建的，删之前先问用户（见 [`lines/contextual.md`](lines/contextual.md)）。
- 手册线：#731 已合，分支 `ai/bl163-ack-eval`（远端在合并时已自动删）；评测用的临时 Home 按笔记清。
- 统筹自己的：scratchpad 里的 `integ` 工作树（detached，可删）。

### 1.4 各线

（每条线做完推送后补上自己的一节：还剩哪些需求、下一片原本打算做什么、已批的计划、共享笔记在哪、要注意的坑。）

**采用线（Prologue 完整采用）** — 需求书 `specs/prologue-adoption/spec.md`，手册 `specs/ai-development-handbook/spec.md` §9.5。全文：[`lines/adoption.md`](lines/adoption.md)；A2 的三片计划：[`lines/adoption-a2-plan.md`](lines/adoption-a2-plan.md)。
- 已合：#725（C4，ee78569fc）、#728（A2-1，a98967d7f）。没有在途的 PR。
- 剩下的需求，按顺序：
  1. **A2-2：执行器与时间线。**
     - 按配置取第一个适用的检查器（BL-171），运行时再核一次授权。
     - 记录按 (run, operationKey) 存，审查卡那一行用 `isAfterWriteCheckOperationKey` 认。
     - 安全不变量取开工时的下一个空号，用例放 `tests/security-invariants-checkers.test.ts`。
     - 用例：PA-26 撤权那一半、PA-27、PA-29～38。
     - 可以顺手做 BL-172。
  2. **A2-3：设置页。** A2-1 合入后可以和 A2-2 并行。
  3. **批 B：read 的窗口读带行号。** 已批，没开工，计划在 [`lines/adoption-batchB-plan.md`](lines/adoption-batchB-plan.md)。和 prologue#50 合成一次换包。
  4. 手册 §9.5 补一行「窗口读没有行号归 Prologue」。
- 坑：
  - 巨大单元 `registerAgentHostCapabilities` 363、`composeAgentHost` 245、`PrologueAgentAdapter` 602、`AgentHost` 381 不许变大；新能力写在新文件里，用 `register(definition, handler)`。
  - typed 计数 187 不许变大。
  - SSOT 里 agent-host 的例外只有三类。

**回执线（AI 输入回执）** — 需求书 `specs/ai-input-receipts/spec.md`。全文：[`lines/receipts.md`](lines/receipts.md)。
- 已合：#726（3e-0b，f28088b2b）、3e-0、3e-1、3d-5。没有在途的 PR。
- 剩下的需求：
  - 3e 的「交付说明」，原本是下一片，没写计划，也没批；
  - §20 的 RCPT-103～107（跨压缩、跨 Run、重启仍适用；按范围纠正；三个入口一致；超预算不静默截断；端到端）；
  - 阶段 4（Goals 层）、5、6；
  - BACKLOG 的 BL-144、148、161、162、163、164。
- #726 合入后要清：工作树 `line-receipts-3e1`、`-3e0`、`-3e0b`、`-base`，以及三个 `receipts/*` 分支。删工作树和分支要先弹窗请用户批。`line-receipts-1c` 里有别人没提交的改动，别动。

**交互线（跨插件 AI 交互）** — 需求书 `specs/ai-interaction-experience/spec.md`（§17 进度表）。全文：[`lines/interaction.md`](lines/interaction.md)。
- 已合：#708（AC-08，23946656c）。没有在途的 PR。
- 剩下的需求：§17 里「部分」的行，包括：
  - AC-01 的第二批入口 P5 与逐插件的证据；
  - AC-06 的结果卡与 Coding 操作卡 H4；
  - AC-09 的 S1；
  - AC-10 的宽度与深色截图（真实输入法和读屏只能用户做）；
  - AC-12 的 `generated-ai.md`（改了要跑真实模型冒烟）；
  - AC-11 的包来源还写着 `b541a8e6`，要更新。
  - AC-02 同排推荐归情境线。
- 原本的下一片（没批）：AC-10 的 Coding 问卷卡，三个宽度加深色，只跑 `coding-question-card.e2e`。
- `coding.js` 离预算只剩约 37 字节。
- #708 合入后要清：工作树 `line-interaction-ac08`、分支 `interaction/ac08-two-tabs`；另外几个旧本地分支先 `git branch -d` 确认已合入再删。

**情境线（情境动作）** — 总纲 `specs/context-program/spec.md`（§9 波次、§16 状态表、§21 是当前接续入口）。全文：[`lines/contextual.md`](lines/contextual.md)。工作树 `.claude/worktrees/line-contextual`。
- 已合：#720（W3-C2，b2336d5c4）、#730（W4-1，f4207e064）。没有在途的 PR。
- 剩下的需求：
  1. W4 余下：Pages、Inbox、Goals 的创建入口（Goals 用 `effect: "proposes"`，总出卡片）；F2 追加 `attach` 的 `find`（`search.references@1`，统筹 10-15 定）；F3 批量；插件页和右栏格的「✦ 一句话新建」（C9、C10）；覆盖率门禁 C13（插件声明 `intake` 之后）；内容站请求号泛化（8 个插件的 `receive` 升版本，先查存量工作流是否固定版本）。
  2. W5 拖放；W6 Shelf 动作进候选池、从左往右放、F8 材料篮、F12 讨论输入框作落点；W7 起 F4（先 G1）、F13，再 F6、F7、F10、F9。
  3. 收尾：真实 Home 全面验证（先弹窗问用户），三份子需求书归档。
  4. §16 状态表 R1、R6、R12、R14、R25 已做未更新，接手先按 §21.6 核对。
  5. BL-174（#730 里，原 BL-171）：没有模型时按内容挑去处，要 `intake` 声明收哪类内容，是改合同。
  6. PICK-05 放行判断之后的 500 ms，改成等「回复已作废」这个事实（统筹意见）。
- 合入后要清的分支与工作树列在 `lines/contextual.md`；其中 `~/.codex/worktrees/context-w0` 不是情境线会话建的，删之前先问用户。
- 坑：`provider_id` 只在 `view.provider.provider_id`（假目录测不出）；只有规则时一段文字的第三个推荐位是去处，找按钮把 `.mw-ctx-menu` 带上；慢机时序要复现就扣住 `/api/contextual/judge`；浏览器用例与别的全量同时跑会超时，比对时串行。

**手册线（AI 能力开发手册）** — `specs/ai-development-handbook/spec.md`。全文：[`lines/handbook.md`](lines/handbook.md)；BL-163 规则：[`lines/handbook-bl163-rule.md`](lines/handbook-bl163-rule.md)；评测脚本：[`lines/handbook-eval-163/`](lines/handbook-eval-163/)（密钥只从命令行的 `MINIMAX_API_KEY` 读）。
- prologue#50 已合进 Prologue main（dd639069c）。Molis 还没换这个包：交给采用线，和批 B 合成一次。
- 已合：#731（BL-163/T5 评测结果，09304a129）：BL-163 按 ① 删行（统筹 10-18 定），coding-base v13 删补充半句，BL-175（appRefs 解析器）、BL-176（ask-user 结果的 `pending` 键名，归 Prologue）。没有在途的 PR。
- 剩下的需求：
  1. Coding 小跑：规则已提交（spec 里「Coding 小跑」一段），#726 已合，可以跑了：用当时 main 的构建，16 次，和甲 A0-后按比例比。
  2. holdFinish：BL-163 的结果里「收工前没说明」三版依次 2、1、0 跑，要不要设另开一片定。
  2b. BL-176：ask-user 结果里已答的题键名叫 `pending`，模型读成「还在等」；改法归 Prologue，另开一片（Prologue PR 统筹审过即合）。
  3. 手册 §10 的正文（ADH-19～23）：一句没写。
  4. `default` 的措辞：`skills/molis-plugin-dev/elements.md:161` 和 `docs/platform/PROLOGUE-AI.md:206` 写得像宿主已经在开轮时选上了默认方法，其实宿主现在不读 `skills.default`。防腐 §10.16 把这件交给本线，要在 PR B 之前改。
  5. BL-145、146、149。
  6. 手册的用户验收。

## 2. 统筹怎么做

统筹不写功能，只做跨线的事：审 PR、排全量、合并、替用户按规则拍板、维护这份文档。

**审 PR**
- 每个 PR 都按 ANTI-CORRUPTION-REVIEW §3 审 diff，结论写在 PR 评论里（「统筹 MM-DD 审过 <head>：…」）。
- 新 head 只核增量：老 head 对它的 merge-base、新 head 对 `origin/main...H`，各取改动行（`grep -E '^[+-][^+-]' | sort`）后 diff，去掉 `tooling/gates`、`scripts/gates/page-assets.mjs`、`tests/page-assets-budget.test.ts`；再用 `git merge-tree --write-tree origin/main H` 看能不能干净合并。
- Prologue 的 PR 统筹严格审过就合（用户 10-17），代码质量要额外严格；换包交给采用线，几件合成一次。

**全量**
- `full-suite` 标签只由统筹加，同时最多两份。用 `tools/label-chain2.zsh <pr>:<完整 sha> ...`：有空位、合并预览是新的才加标签，然后用 `gate-and-queue.sh` 等结果，绿了自动入合并队列。
- 合并预览过期时 CI 跑的是旧 main 上的旧工作流，所以标签链会等 GitHub 重算合并预览。
- 全量从 #716 起快速失败：一个文件重试一次还失败就停下这个分片，其他分片取消。红的那次只报第一个失败的文件；`gate-and-queue.sh` 会把它报出来，凡有分片被取消一律不入队。
- 可以 merge-only（不跑全量，`gate-and-queue.sh <pr> <sha> merge-only`）的只有两种：
  - 只改测试、文档、门禁变严、CI 的 PR；
  - 已经跑过全量的 PR，新 head 只是 merge main、重新取键、改文档或注释、改那一个红的用例。
- main 上本来就红的用例：PR 只红在它上面时，等 main 修好、merge main 后走 merge-only（用户 10-18）。
- 10-18 交接前的最后一批，用户为提速定不逐个跑全量（Verify 绿就入队，合完 main 上跑一次）。这是那一批的一次性决定，接手后照常按上面的规则跑；要不要沿用，先问用户。

**页面资源**（用户 10-18，PR #705）
- 默认只许变小。必需的增长写进 PR，统筹审过后给一次性 `APPROVED_CEILINGS`，按合入时的 merge-base 取键 `[基线, 实测]`。
- 一个资源一次超过 10 KB，或者新增资源，才问用户。
- 别的 PR 先合进来改了同一个资源，后合的就要重新取键（只 merge main、改键，走 merge-only）。

**线的节奏**
- 每条线开一片之前先发一行计划给统筹，批了再写代码。每条线同时最多两片，PR 等着的时候可以开下一片。
- 本机只跑改到的文件（`node scripts/affected-tests.mjs`），全量交 CI。别人的进程只在用户同意后按 pid 停。

**拍板**
- 技术上的取舍按防腐的后果定；功能上的取舍按推荐定，写成「统筹 MM-DD 定」，并记进流水和对应的 spec。
- 这些先弹窗问用户（AskUserQuestion，推荐项放第一个）：发版、真实 Home（4207/4208/4173）、放松门禁、真实凭据、计划外的 PR、别人的分支或进程、Prologue 之外的 vendored 和上游合并、改外部 MCP 工具名。
- 不做：force push、裸 `git stash`、不按 pid 停进程、为模型能力的弱点加提示词补丁、兼容或兜底读取、替别的会话去拿它被拒的权限。

**MiniMax**
- 评测和隔离 Home 实走可以直接用，不用问（用户 10-16）。
- 密钥只内联读：`MINIMAX_API_KEY="$(security find-generic-password -a "$USER" -s minimax-api-key -w)" …`，不落盘、不进日志，不用浏览器输入。
- 只用一次性 Home，跑完即删。Home 主密钥的钥匙串条目所有 Home 共用（含真实 Home），永远别删。

## 3. 工具（`tools/`）

从原机器的会话草稿目录拷过来，路径改成相对脚本目录；仓库位置用 `MOLIS_REPO`（默认 `~/code/goalboard`）。都要用 zsh 跑。

| 脚本 | 用法 |
| --- | --- |
| `label-chain2.zsh 720:<sha> 708:<sha>` | 依次等空位、等合并预览更新，加 `full-suite` 标签，再在后台跑 gate，结果写进 `gate-<pr>.log` |
| `label-when-free2.zsh <pr>` | 只做「等空位、等合并预览、加标签」 |
| `gate-and-queue.sh <pr> <sha> [merge-only]` | 等这个 head 的检查跑完，全绿就 `gh pr merge --squash --auto` 入队。KNOWN 名单只放用户认过的偶发失败，别为变绿往里加 |
| `wait-merge.sh <pr>` | 已经入队的 PR 等到合入。没入队的会立刻报 LEFT QUEUE，改用 `until [[ $(gh pr view N --json state -q .state) == MERGED ]]` |
| `monitor.zsh` / `heads.zsh` | 配合 Claude Code 的 Monitor 用：前者报全量、合并和 gate 日志的新状态，后者报 PR 的 head 变化和新 PR。`monitor.zsh` 里合并的 PR 号范围写死在 611–760，过了要改 |

日志（`gate-<pr>.log`、`*-seen.txt`）写在脚本旁边，已在 `.gitignore` 里。

## 4. 已知的坑

- 作者自己去掉再加 `full-suite` 标签，或者手动 dispatch，会取消快跑完的全量、占掉 runner（10-18 #661、#631、#721 都发生过）。请他们把标签交给统筹。
- 两个标签链同时在等时，谁先加上标签是碰运气的，不保证顺序。
- 合并预览过期：GitHub 不一定按新 main 重算。标签链会等 10 分钟，之后只有 main 新增的改动和本 PR 没有文件重叠时才照常加标签。
- 安全编号容易撞：开 PR 前看 main 上最大的 S 号，被别人先占了就往后顺延，并在 PR 里写明。
- 本机只有一个浏览器槽。别的工具（DeepSeek Harness）在 computer-use 的工作树里跑过本机全量，把槽占了 30 多分钟，用户同意后统筹按 pid 停了它（10-18）。
- `tests/coding-input-receipts.e2e.test.ts`（RC-10/11/13/16）在 CI 负载下会停在「点发送方式触发器、菜单没打开」：#703 之后 main 上两次红、单独重跑第 8 片通过，本机 7.7 秒通过（10-18）。PR 全量只红它时，先 `gh run rerun <run> --failed` 重跑，不加进 KNOWN；#726 这类改 Coding 回执的 PR 红在这里要先看是不是自己的。根因（猜是状态刷新把触发器重画或藏起）留给回执线的接手人。
- `tests/context-landing-panes.e2e.test.ts`（PANE-LAND-02）在 CI 负载下会多收到一条落点：是分屏窗格里真的 Pages 又报了一次（带真实 pane_id、光标与上下文），不是伪造的那条被放进来（#708 的全量，10-18）。红在这里时先看 `detail.pane_id` 是不是空的，空的才是 S-30 的问题。
- `sleep` 在前台被 harness 拦着，要等就用后台 until 循环或 Monitor。
- 情境线 10-18 晚曾用 `pkill -f "check-health-gates.mjs --base"` 停自己的健康检查（没按 pid），可能顺带停了别的会话同一时刻的健康检查。哪个会话说那段时间 health 莫名中断，让它重跑。停进程一律按 pid。
- 草稿 PR 用 workflow_dispatch 手动触发的全量也占空位：`label-when-free2.zsh` 数的是全部在跑或排队的全量，所以统筹的标签链会排在它们后面。
- PR 里多一个工具，可能让测试里的会话历史到整理阈值，多出一个没有工具的「选择保留历史」请求。按轮数写的假模型会因此错位，要按事实等（#726）。
- product-subset 的作业名写着「not required yet」，但 `gate-and-queue.sh` 把它当失败，不入队。这是对的：它红了，多半是真问题（#726）。

## 5. 待定、留给接手的人

- Molis 要不要设 `inputReminders.holdFinish`：BL-163 的结果已出（收工前没说明 2、1、0 跑），手册线单开一片定。
- Coding 里写死的三个 SDK 资源种类，改用 SDK 导出的常量（采用线记在 BACKLOG）。
- 批 B 合入 Prologue 之后，由采用线把它和已合的 #50 合成一次换包。
