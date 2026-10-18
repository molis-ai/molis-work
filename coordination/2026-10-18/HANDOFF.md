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

- Molis main：`e5adc24c2`（#714 合入之后）。Prologue main：`3adc5e87`。Molis vendored 的 SDK 就是 3adc5e87，包是 `prologue-sdk-0.0.0-rc.1-after-write-check-key.tgz`。
- 10-18 合入 Molis main 的：#709、#711、#715、#661、#716、#712、#699、#717、#719、#722、#684、#718、#713、#724、#723、#714。合入 Prologue main 的：#48、#49。
- main 上 `molis-work-workbench.js` 是 1,111,791 B，安全不变量编到 S-38。S-39 留给 #727（材料服务），S-40 留给情境线 W4-1。

### 1.1 在途 PR

| PR | 线 | 现在 | 合进去还差什么 |
| --- | --- | --- | --- |
| #725 | 采用（C4：coding-base v12，删三句工具自己已经说清的话） | 全量绿了，已在合并队列第 1 位 | 等队列合入 |
| #726 | 回执（3e-0b：7 个 Coding 角色列上 acknowledge-inputs，常量 WORKSPACE_PARENT_TOOLS） | 1152516e1 让 `tests/prologue-taskboard.test.ts` 稳定变红（interrupted 那段停下时是 ready，不是 running），已交回执线定性并修 | 新 head 核增量后重排全量 |
| #720 | 情境（W3-C2 + Esc 的修复 `bus.hush()`） | 50b018acc 审过；等作者 merge main，按 `[1111791, 1111910]` 重新取键 | 新 head 核对后加 full-suite |
| #708 | 交互（AC-08 两个页签答同一题） | 952e2628e 的产品修复审过；测试里的 1.5 秒等待要改成等「拒绝之后完成的那次会话读取」 | 新 head 核对后加 full-suite |
| prologue#50 | 手册（todo 只在这一轮收得下时才提） | 统筹严格审过；等作者回答 tool-runner 里退路的问题 | 回答（必要时补用例）后统筹合并 |
| #728 | 采用 A2-1（`agent.write_checkers.{list,save}.v1`） | 281028f12 审过，要改一处（`keptWriteCheckers` 插进了 `workspaceGrants` 的文档注释和函数之间） | 新 head 核增量后加 full-suite |
| 待开 | 情境 W4-1（选中的文字直接记成 Todo 或灵光，带撤销提示） | 在做 | 开 PR，审过跑全量 |
| 待开 | 手册 BL-163/T5 评测与处理 | 96+16 次 MiniMax 在跑 | 开 PR；只改文档和提示词的话按规则判断要不要跑全量 |

不在本交接里的：
- #703、#727：防腐线 W5-01，Codex 在做，两个 PR 叠在一起。#703 10-18 晚已转为待审。
- #721：Computer Use 线，DeepSeek Harness 在做。10-18 晚已转为待审；按「合并一律经统筹」要审 diff、跑全量再入队。
- #631、#156：jingxusandra-gif 的草稿。

防腐线和 Computer Use 线照常进行，由用户另行安排。#727、#631 都自己手动触发过全量，会占 runner。

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

**情境线（情境动作）** — 总纲 `specs/context-program/spec.md`（§21 是当前接续入口）。
- 待补。

**手册线（AI 能力开发手册）** — `specs/ai-development-handbook/spec.md`。
- 已批、没开工：#726 合入后，用 BL-163 同一套规则在 Coding 上小跑一次。
- 待补。

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
- `sleep` 在前台被 harness 拦着，要等就用后台 until 循环或 Monitor。

## 5. 待定、留给接手的人

- Molis 要不要设 `inputReminders.holdFinish`：等手册线 BL-163 的结果，单开一片定。
- Coding 里写死的三个 SDK 资源种类，改用 SDK 导出的常量（采用线记在 BACKLOG）。
- prologue#50 和批 B 合入 Prologue 之后，由采用线合成一次换包。
