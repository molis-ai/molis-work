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

- Molis main：`e5adc24c2`（#714 合入之后）。Prologue main：`dd639069c`（#50 合入之后）。Molis vendored 的 SDK 还是 3adc5e87（`prologue-sdk-0.0.0-rc.1-after-write-check-key.tgz`），#50 还没换进来。
- 10-18 合入 Molis main 的：#709、#711、#715、#661、#716、#712、#699、#717、#719、#722、#684、#718、#713、#724、#723、#714。合入 Prologue main 的：#48、#49、#50。
- main 上 `molis-work-workbench.js` 是 1,111,791 B，安全不变量编到 S-38。S-39 给 #727（材料服务），S-40 给情境线 W4-1（#730）。BL：BL-171～173 给 #728，BL-174 给 #730，BL-175 给手册线的 PR（appRefs 解析），BL-176 给手册线乙发现的 ask-user 结果键名 `pending` 误读（归 Prologue 设计，另开一片）。

### 1.1 在途 PR

| PR | 线 | 现在 | 合进去还差什么 |
| --- | --- | --- | --- |
| #725 | 采用（C4：coding-base v12，删三句工具自己已经说清的话） | 已合入 main（ee78569fc）；工作树和本地分支已清 | — |
| #726 | 回执（3e-0b：7 个 Coding 角色列上 acknowledge-inputs，常量 WORKSPACE_PARENT_TOOLS） | 3bf06ff60 审过：只改 `prologue-taskboard` 测试。原因是多一个工具让历史到了整理阈值，多出一个没有工具的请求；测试改成按事实停，断言没放宽。chain63 等空位 | 全量绿了自动入队 |
| #720 | 情境（W3-C2 + Esc 的修复 `bus.hush()`） | 4dd4ac30b 审过（与 50b018acc 改动行相同，键 `[1111791, 1111910]`）；chain66 排全量。统筹定 #720 先合、#730 后合 | 全量绿即入队 |
| #708 | 交互（AC-08 两个页签答同一题） | 952e2628e 的产品修复审过；测试里的 1.5 秒等待要改成等「拒绝之后完成的那次会话读取」 | 新 head 核对后加 full-suite |
| prologue#50 | 手册（todo 只在这一轮收得下时才提） | 已合进 Prologue main（dd639069c，10-18） | Molis 换包交给采用线，和批 B 合成一次 |
| #728 | 采用 A2-1（`agent.write_checkers.{list,save}.v1`） | 7cfb9f317 审过（只挪了 `keptWriteCheckers` 的位置），chain64 等空位 | 全量绿了自动入队 |
| #730 | 情境 W4-1（记成待办、记下灵光成为创建入口，立即建好，由主人自己的撤销收回） | e757d682c 审过：S-40、BL-174 都已改，正文有动作快照对调用方的影响。health 只剩安全不变量断档一项（S-38 后直接 S-40），要等 #727（S-39）合入 | #727、#720 合入后 merge main、重新取键 `[新起点, +1,158]`，再排全量（它自己还没跑过全量） |
| #731 | 手册线 BL-163/T5 评测结果（coding-base v13 删补充半句；BL-163 按 ① 删行；BL-175、BL-176） | 9a9de4bc9 审过 | 提示词改动，要全量；等 main 的红用例定了再排 |
| #732 | jingxusandra-gif，产品运营文档对抗式审查（只改 `docs/product-operations/`） | 501cf1fa8 审过，按 #722 先例 merge-only | gate-732 等 Verify 绿入队 |
| 待开 | 手册 BL-163/T5 评测与处理（分支 `ai/bl163-ack-eval`） | 乙重跑完：两版都没把补充当成回答，按规则删半句。甲约 37/96 | 开 PR 前要 merge main：#725 已把 coding-base 升到 v12，T5 要升 v13 |

用户 10-18 补充：交接之前把存量 PR 都处理掉。各 PR 的处理：
- #156（jingxusandra-gif 的文档草稿，10-02 起没更新，和 main 冲突）：按用户决定关闭，并留言说明可以在 main 上重开。
- #631（jingxusandra-gif，统一输入与本地语音，草稿）：用户定留给作者，这次不处理。它自己手动触发过全量，会占 runner。
- #703（防腐线 W5-01，Codex）：10-18 11:59 由本账号标成待审并直接入队，没经统筹、没跑全量。统筹已事后审，在 PR 评论里留了三条不挡合并的记录。10-18 已合入（63639a764），main 上补跑的全量是 run 39126488429，结果要写回 #703。
- #727（防腐线 W5-01 材料服务，Codex，草稿，叠在 #703 上）：用户定等它。#703 已合入，统筹已在 #727 上请 Codex merge main、改 base 为 main、转为待审；之后统筹审、跑全量、合入。
- #729（防腐线 W5-01 的下一片，Codex，草稿，叠在 #727 上，10-18 12:22 新开）：灵光改走 Plugin Runtime，删掉 `/api/lingguang`。用户说处理的是「现在存量的」，它是交接前才开的、仍在进行的线上的新片，留给接手的统筹。注意它重写了 `plugins/native/lingguang/src/actions.ts`，和 #730 撞同一个文件，后合的要解冲突。
- #721（Computer Use 线，DeepSeek Harness）：统筹审过 6a86d09cd，要改一处：模型给的 `/正则/` 会回溯卡死执行进程，统筹定换成「包含」匹配。改完核增量，跑全量，合入。真机验收（CU-G02–G04）用户决定晚点。

### 1.2 各线

（每条线做完推送后补上自己的一节：还剩哪些需求、下一片原本打算做什么、已批的计划、共享笔记在哪、要注意的坑。）

**采用线（Prologue 完整采用）** — 需求书 `specs/prologue-adoption/spec.md`，手册 `specs/ai-development-handbook/spec.md` §9.5。全文：[`lines/adoption.md`](lines/adoption.md)；A2 的三片计划：[`lines/adoption-a2-plan.md`](lines/adoption-a2-plan.md)。
- 在途：#725（C4）、#728（A2-1）。
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
- 在途只有 #726（3e-0b）。3e-0、3e-1、3d-5 已合。
- 剩下的需求：
  - 3e 的「交付说明」，原本是下一片，没写计划，也没批；
  - §20 的 RCPT-103～107（跨压缩、跨 Run、重启仍适用；按范围纠正；三个入口一致；超预算不静默截断；端到端）；
  - 阶段 4（Goals 层）、5、6；
  - BACKLOG 的 BL-144、148、161、162、163、164。
- #726 合入后要清：工作树 `line-receipts-3e1`、`-3e0`、`-3e0b`、`-base`，以及三个 `receipts/*` 分支。删工作树和分支要先弹窗请用户批。`line-receipts-1c` 里有别人没提交的改动，别动。

**交互线（跨插件 AI 交互）** — 需求书 `specs/ai-interaction-experience/spec.md`（§17 进度表）。全文：[`lines/interaction.md`](lines/interaction.md)。
- 在途只有 #708（AC-08，改了 Coding 产品代码，要跑全量）。
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
- 在途：#720（W3-C2）、#730（W4-1），见 §1.1。两个的放行键都从 1,111,791 取，后合的按新 merge-base 重新取键。
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
- 在途：分支 `ai/bl163-ack-eval`，BL-163/T5 评测。甲 96 跑、乙按映射 v2 重跑 16 跑，跑完开 PR。
- 剩下的需求：
  1. Coding 小跑：规则已提交，等 #726 合入后再跑。
  2. holdFinish：等 BL-163 的结果再定，另开一片。
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
- `sleep` 在前台被 harness 拦着，要等就用后台 until 循环或 Monitor。
- 情境线 10-18 晚曾用 `pkill -f "check-health-gates.mjs --base"` 停自己的健康检查（没按 pid），可能顺带停了别的会话同一时刻的健康检查。哪个会话说那段时间 health 莫名中断，让它重跑。停进程一律按 pid。
- 草稿 PR 用 workflow_dispatch 手动触发的全量也占空位：`label-when-free2.zsh` 数的是全部在跑或排队的全量，所以统筹的标签链会排在它们后面。
- PR 里多一个工具，可能让测试里的会话历史到整理阈值，多出一个没有工具的「选择保留历史」请求。按轮数写的假模型会因此错位，要按事实等（#726）。
- product-subset 的作业名写着「not required yet」，但 `gate-and-queue.sh` 把它当失败，不入队。这是对的：它红了，多半是真问题（#726）。

## 5. 待定、留给接手的人

- Molis 要不要设 `inputReminders.holdFinish`：等手册线 BL-163 的结果，单开一片定。
- Coding 里写死的三个 SDK 资源种类，改用 SDK 导出的常量（采用线记在 BACKLOG）。
- 批 B 合入 Prologue 之后，由采用线把它和已合的 #50 合成一次换包。
