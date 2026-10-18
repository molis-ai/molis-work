# 交接（2026-10-18）

本文是这次交接的唯一入口。它在远端分支 `coordination/handoff-2026-10-14` 上，不进 main。**接手人在另一台电脑上。** 文中出现的本机路径（`/Users/yijunwang/...`、`~/code/...`、`.claude/worktrees/...`、`/private/tmp/...`、scratchpad、`$S`）和端口 4207/4208/4173 都只在原机器上，接手人拿不到也不用管；要的东西都按文中的远端分支、提交号和 PR 号取。换机器开工的步骤见第 0.1 节。

给接手人看的短版（Claude Docs，用户分享后别人才能打开）：「Molis Work 交接说明 2026-10-18」 https://claude.ai/code/artifact/4b29e264-5328-4329-99be-b9b49cbdc8bd

## 0. 一段话

用户 10-18 的要求：这一轮**一起收口、按标准走、不留尾巴**。防腐路线图全部做完；各需求线做到验收和归档；所有插件不分官方、个人、生成还是第三方，待遇一样，缺的平台能力补进平台。接手后开 4 个会话同时做：①统筹、②平台、③迁移、④需求（第 3 节）。统筹开工第一件事，是按防腐线最初的要求，对接手时的 main 做一次防腐审查（第 2 节）；另外三个会话同时开工，不用等审查做完。合并的规则是：每个 PR 跑过 Verify 就可以合，全量按批跑（第 4 节）。

接手先读：两个仓库的 `AGENTS.md`（10-18 新加了一条「插件待遇一样」的硬约束）、本文、`coordination/2026-10-13/ANTI-CORRUPTION-REVIEW.md` §3（每个 PR 都按它审）、`docs/system/PARALLEL-DEVELOPMENT.md`、流水 `coordination/2026-10-14/README.md`。

### 0.1 在另一台电脑上开工

- GitHub 账号要有 `molis-ai/molis-work` 与 `molis-ai/prologue` 的写和合并权限（合并队列、加标签、重跑 CI），`gh auth status` 确认。没有就请用户加。
- 克隆 `molis-ai/molis-work`，自己的目录随意。第一次装依赖要联网：`pnpm install --frozen-lockfile`（`AGENTS.md` 里的 `--offline` 要本机已有 pnpm 缓存才行）；然后 `pnpm build`。浏览器用例要本机装 Chrome。
- 换 Prologue 包（④）要另外克隆 `molis-ai/prologue`，按 `vendor/prologue-sdk/README.md` 重建。
- 交接文件：`git fetch origin coordination/handoff-2026-10-14`，在一个单独的工作树里看，不要合进 main。
- 第 4.2 节的脚本默认在 `$HOME/code/goalboard` 里跑，换了目录就设 `MOLIS_REPO=<你的克隆>`；日志写在脚本所在目录（`S=${0:A:h}`），建议把 `tools/` 拷到自己的临时目录再用。
- MiniMax：用户同意评测和隔离 Home 实走直接用、不用每次问。密钥向用户要，存进你自己机器的钥匙串（服务名沿用 `minimax-api-key`），只内联读，不贴进聊天、文件和日志。
- 真实 Home：你机器上日常在用的那个 Home 也算，测试和实走一律用一次性 Home。用户原机器上的 Home 和数据，接手人碰不到，也不要去碰。
- 原机器上的工作树、scratchpad、本地分支（第 6.3 节）由原机器那边清，接手人不用管；接手人只处理远端分支和 PR。

## 1. 用户 10-18 定的事（都要照做）

全文在 `specs/repository-anti-corruption/spec.md` §1 末尾 13 行，由 PR #737 写入 main（`5972daefd`）。#737 还在仍描述旧规则的文档处标了「2026-10-18 改」：代码没改之前照旧，改完同步删掉这个标记。

| 事项 | 决定 |
| --- | --- |
| 收口范围 | 防腐路线图全做完：W5-01 剩下的各族，含 Feed、Alchemist、Shelf 收尾、Characters 并进 Module；W5-02～W5-17；W6-01～W6-06。需求线把 spec 剩下的验收项做完并归档；挂在名下的 BL，要么做掉，要么写清不做的理由。动真实 Home 的步骤，到时仍弹窗问 |
| 插件待遇 | 官方、个人、生成、第三方插件：同一套 SDK 与合同、同样的 Manifest 声明、都由 Runtime 装配，平台服务、生命周期和授权规则也都一样。只有安装信任按来源区分：发布者签名决定要不要首次确认、跑不跑沙箱、动作提供方身份归谁 |
| 四个构建期例外 | 取消。Goals 是普通插件，按标准迁；插件创作台不算插件，是平台能力；成果库（Artifacts）和 Sessions 是平台事实。Sessions 这一轮清理掉、文档留记录，以后重做（BL-177，先写需求书给用户审） |
| 内置插件的授权 | 和其他插件同一规则：按清单的必需与可选给权限，可选的都能关；内置插件装上时可选项默认勾上（改 10-10 W3-06 B） |
| 其余内置特权 | 一律改成按声明与授权：`always_on`、端口默认连线、Goals 信任内置调用者、native 动作自动算本机所有者权限、工作台手写名单。名单由 W5-02 从声明生成；改信任边界的（S-34、默认连线的同意流程），先设计再弹窗问 |
| 项目库 | 做项目库服务：插件自己的项目库表（Schedule 三张、Feed 出口规则、Coding）由插件声明，宿主基线不再点名插件；Module 的表照旧归 Module |
| 放置 | 按今天的登记方式：Form、Dataset、PPT、Pages、灵光、Workflows、Inbox、Schedule、Feed 每个项目一个实例；Todo、Issues、Jelly、Cognia、Images、Alchemist 在 Home 级实例 |
| 删项目清数据 | 沿用目录条目上的 `project_data`（已覆盖 8 个插件），W5-02 把它挪进各插件包，不另加 Runtime 钩子 |
| 目录条目 | 保留到 W5-02 生成后一次删 |
| Characters | 并进 `modules/characters`；路由路径不变，成果类型由 Module 声明 |
| 合并与全量 | Verify 过即可合；全量按批跑，一批是同时待合的 3～6 个 PR，先合成集成分支跑一次（第 4 节） |
| Computer Use 的打开/保存面板 | 选 A：先拿真机事实；独立进程的面板继续拒绝，交给用户自己点 |

之前给过、仍然有效的授权：推送、开 PR 不用问；CI 过了、统筹审过就可以合并（用户自己的 PR 和 Codex 的也要先经统筹）；Prologue 的 PR 统筹严格审过就合；MiniMax 在一次性隔离 Home 里随便用（密钥只能内联读，第 9 节）；页面资源确实需要时可以变大（第 4.3 节）；只因负载超时而红的，重跑通过就算过。

## 2. 第一步：接手时的防腐审查（统筹做，不挡别人开工）

**要求从哪来**：防腐线最初的六份原文，`docs/prompts/repository-anti-corruption.md`、`docs/prompts/repository-systematic-review.md`（15 节）、`docs/prompts/code-health-report-2026-09-30.md`（R-01～R-14）、`docs/prompts/post-merge-functional-review.md`、`specs/archive/post-merge-review/spec.md`、`specs/archive/repository-systematic-review/spec.md`（F-01～F-35）；外加 10-18 的新规则（第 1 节）。口径和 §10.11～§10.26 一样：CI 通过、已经合入、自查过，都不能单独证明合规；要分清已批准的预期变化和没有依据的行为回退；授权内能修的就修；原文之间有冲突的，指出来交用户定，不自己改目标；不靠放宽断言、删约束或改记录来过关。

**范围**：
1. §10.26（main `4b063bf98`）之后合入的 56 个 PR（到 #729），加上交接时合入的 #735、#736、#737，和还是草稿的 #733。每个按**合入时的 head** 审（`git show --remerge-diff <合并提交>`）。
2. 交接时的整个 main 再看一遍，专门找三类东西：只有内置插件才有的特权；宿主替某个插件开的私路；平台缺、插件只好绕过去的能力。
3. Codex 防腐线的候选（第 5.2 节），在它们开 PR 的时候审。

**交付**：
- 防腐 spec 新开一节 §10.27：每个 PR 的结论，以及发现的问题、归属和修法。
- 「内置特权与平台缺口」清单：每一项写上代码位置、受影响的插件、补什么平台能力、归哪个会话、先后顺序。②③两个会话的排期以它为准。
- 发现的问题派给对应的会话，排在它们下一片之前。

**已经知道的**：
- P1：`apps/local-host/src/placement-call.ts` 的 revert，在等 scope 之后、同步提交之前，没有再查服务还活着，关闭以后可能继续把东西移回去（Codex 交接里写的，已在隔离副本复现，最小修正后四条用例通过，main 上没修）。归②。
- 第 1 节列的那些内置特权。
- main 全量的结果见 §6.1。

## 3. 四个会话怎么分工

原则：每个会话只改自己的那些文件。要别人那块的东西，就请对方做，或者交统筹协调，不在自己的 PR 里顺手改。每个会话同时最多两个 PR 在等合并；等的时候在本地做下一片，必要时叠在自己的分支上。

### ① 统筹

- 开工先做第 2 节的审查。
- 之后的日常：按 ANTI-CORRUPTION-REVIEW §3 加第 1 节的新规则审每个 PR，结论写在 PR 评论里；组批、跑集成全量、按依赖合并（第 4 节）；盯每晚 main 的全量；维护本文和流水；能按规则定的替用户定，不能定的弹窗问。
- 机械性的跟进统筹可以自己做，省得来回等：给别人的 PR merge main、重取页面资源的放行键、顺延撞了的编号。做之前在 PR 评论里说一声，只做这几样，不碰业务改动。
- 统筹不写功能。只改文档、记录、门禁说明。

### ② 平台（补平台能力、去掉内置特权）

负责的文件：`packages/contracts`、`packages/plugin-sdk`、`packages/plugin-runtime`、`packages/kernel`、`packages/storage`、`packages/ui-host`；`apps/local-host` 里的平台服务，包括 `plugin-platform.ts`、`home-plugins.ts`、`project-plugins.ts` 里平台那部分、`local-owner-permissions.ts`、`builtin-plugin-callers.ts`、`plugin-default-bindings.ts`、`placement-call.ts`；W5-02 之后，还有生成工作台名单的代码。

建议顺序（第 2 节的清单出来后按它调整）：
1. 修 `placement-call.ts` 的 P1。
2. 内置插件的授权改成同一规则：`bundledGrants`、POLICY 7.8、设置里可选权限的开关、相关测试。
3. 项目库服务，排在③迁 Schedule、Inbox、Feed 之前。
4. 去特权：Goals 改用授权，不再信任内置调用者；native 动作的本机所有者权限改成按声明；`always_on` 和端口默认连线改成按声明加安装同意。后两项要先补「安装时的同意」这一项平台能力，设计好先弹窗问用户（S-34 是安全不变量）。
5. W5-02 声明式注册（3 个 PR）：工作台的目录和设置节、搜索页签、翻译词典归属、页面资源包、设计系统名单、home-sqlite 名单、`project_data`、X-1 依赖清单，都改成从各包的声明生成。它会和③每次迁移改的 `builtin-plugins.ts` 撞车：先和③约好一个时间点，那之前的迁移先合，那之后③只写自己包里的声明。
6. 插件创作台并进平台：删掉它的插件目录条目，代码进平台的模块；生成的插件照旧走 Runtime 和沙箱。
7. W5-06 通用挂载器；W5-03 按主人分翻译；W5-08、W5-09、W5-11、W5-13～W5-16。W5-17（catalog 路径与真实 Home 维护）要先弹窗问用户。

### ③ 迁移（插件迁到 Runtime，加上清理）

负责的文件：`plugins/native/*`，以及删掉 `apps/local-host/src/<插件>-*.ts`、`project-host.ts` 里的 `registerProvider`、`web-request.ts` 路由表里的行。`project-plugins.ts` 里的监督器条目，W5-02 之前也归它。

顺序：
1. **先把 Codex 已经做完的候选落进 main**（第 5.2 节，一共 18 片左右）。这是最快的进度。按 Codex 表里的顺序组批：集成分支已经有了，先修好它全量里那一处红（`tests/personal-plugins-review-fixes.test.ts` 的 Dataset 和 PPT 断言，修法和 #736 一样），重跑全量，过了就按依赖一片一片开 PR、各自过 Verify、逐个合。
2. 不需要新平台能力的几族：Workflows 的 Runtime 接线、Pages、Jelly、Images（在 model-selection 之后）、Shelf 的 D2/D3、Characters 并进 `modules/characters`。
3. Goals（被宿主点名最多，单独写计划，交统筹审）。
4. Schedule、Inbox、Feed：等②的项目库服务。Feed 要单独写计划。
5. Alchemist：先补 Runtime 的项目分区、关闭与排空合同（Codex 的只读方案在 `alchemist-partition-next-plan.md`、`alchemist-partition-prerequisite-review.md`），这个合同由②做，或者③做、②来审。
6. Sessions 清理：先查清谁在用，包括工作区动作、Coding、`sessionsProjectData`、真实 Home 里的存量。别人在用的能力先挪走，再删；删真实 Home 的数据先弹窗问。清理的经过写进文档，重做记在 BL-177。
7. W6-01：删 `native-plugin-api` 别名和 `/api/<短名>` 路由，冻结名单清空，改写 AGENTS.md 那条硬约束。W6-02：给真实的生产者补生命周期测试。
8. 最后由统筹做 W6-04～W6-06：重量、终回归、交付物。

### ④ 需求（两组轮流做）

④一个会话管两组。一组的 PR 在等的时候，就做另一组。统筹派来的防腐问题先做。需要平台能力时找②，不在宿主里另开一条路。

**助理与 AI 组**，按顺序（详细在 `lines/` 各文件）：
1. 采用线：A2-2 执行器与时间线；A2-3 设置页，可以和 A2-2 并行；批 B，read 的窗口读带上行号，和已合的 prologue#50 一起，**只换一次 vendored 包**；BL-172。换包由这一组独占，别的会话要换包，交给它一起换。
2. 回执线：3e 的交付说明（先写计划交统筹）；§20 的 RCPT-103～107；阶段 4～6；BL-144、148、161、162、164。
3. 手册线：Coding 小跑；`inputReminders.holdFinish` 要不要设；BL-176，ask-user 结果里的 `pending` 键名，开一个 Prologue PR；手册 §10 正文；`skills.default` 的措辞；BL-145、146、149；用户验收。
4. Computer Use：CU-G13（非浏览器全量和 `test:security` 全量交 CI）；CU-G14（索引和归档）；CU-G06、G08、G10 的真机数据，以及 CU-G02～G04 的二十步真机验收，要用户的 Mac 空出来，先和用户约时间，按 `specs/computer-use/acceptance-runbook.md` 做；打开/保存面板按 A 补同进程 sheet 的真机用例；CU-G15 可选。

**界面组**，按顺序：
1. 情境线：W4 剩下的 Pages、Inbox、Goals 创建入口（Goals 用 `effect: "proposes"`）、F2、F3、C9、C10、C13；内容站请求号泛化；W5 拖放；W6、W7；BL-174；PICK-05 改成等事实；§16 状态表核对；最后真实 Home 的全面验证（先弹窗问），三份子需求书归档。
2. 交互线：AC-10 的 Coding 问卷卡（三个宽度加深色）；AC-06 的结果卡与 H4；AC-01 的 P5；AC-09 的 S1；AC-12；AC-11 的包来源；最后验收、归档。

④两组都做完了，就转去③帮忙迁移。

### 3.1 会撞车的东西，怎么避开

| 东西 | 规矩 |
| --- | --- |
| 枢纽文件（`project-plugins.ts`、`builtin-plugins.ts`、`project-host.ts`、`web-request.ts`、`dom-events.ts`、`assistant-island.ts`、`SECURITY-INVARIANTS.md`、防腐 spec） | 动之前先看在途的 PR 改了哪几行（`gh pr diff <n> \| grep '^@@'`），在 PR 正文写清楚会和谁冲突；后合的那个负责解冲突。防腐 spec 的状态句和 §10 只由统筹改；各片的记录写在 PR 正文里，加 spec 里自己那一节，不往文件开头堆段落 |
| BACKLOG 编号 | 预先分好号段，不用再等：统筹 BL-177～179（177 已用）、② BL-180～199、③ BL-200～219、④ BL-220～249 |
| 安全不变量编号 | 号必须连续，没法预分。开 PR 时取 main 上下一个空号；撞了，后合的顺延，只改编号，走 merge-only |
| 页面资源放行键 | 按合入时的 merge-base 取键，一次有效；别的 PR 先合、改了同一个资源，后合的就重新取键（可以交给统筹做）。同一批里的 PR 在集成分支上一起量 |
| vendored Prologue 包 | 只由④的助理与 AI 组换，同一时间只换一次 |
| 本机构建和浏览器 | 整台机器同一时间只跑一个构建、一个浏览器批次（`node scripts/machine-slot.mjs`）；浏览器用例只跑改到的文件，全量交给 CI |
| 合同（API 快照、动作快照） | 改了就跑 `pnpm api:update` / `pnpm actions:update`，PR 里写清对调用方的影响；不留兼容期，形状变了就升版本 |

## 4. 合并与全量

### 4.1 规则（用户 10-18 定）

- **单个 PR**：统筹按 §3 审过、Verify 绿了，就可以入合并队列，不用单独跑全量。
- **按批跑全量**：统筹把同时待合的 3～6 个 PR 合成一个分支 `integration/batch-MMDD-N`，基于最新的 main，按依赖顺序 merge 进去。推上去后 `full-suite.yml` 会对 `integration/**` 自动跑全量。全量过了，这几个 PR 按依赖逐个合，每个还是要 Verify 绿；在每个 PR 的评论里写上「批 <分支> 全量 <run> 过」。
- **批红了**：先判断是负载时序，还是谁引入的。时序问题：`gh run rerun <run> --failed`。真失败：把引入它的 PR 拆出这一批，交回作者；其余的重新组批，或者如果它们和失败的那个没有任何文件重叠，直接合。
- **共享核心**（contracts、SDK、kernel、plugin-runtime、换 Prologue 包）的 PR 必须在批里，不能单独合。
- **批跑过之后 head 又变了**：只是 merge main、重取放行键、顺延编号、改文档的，不用再跑；改了业务代码的，进下一批。
- **main**：每晚 17:00 UTC 有定时全量。红了，当天由引入它的会话修。只红 main 上已经红着的那个用例的 PR，等 main 修好、merge main 之后再合，不用重跑。
- **merge-only**（`gate-and-queue.sh <pr> <sha> merge-only`）照旧可以用于只改文档、测试、门禁变严或 CI 的 PR。

### 4.2 工具（`tools/`，都用 zsh 跑）

| 脚本 | 用途 |
| --- | --- |
| `gate-and-queue.sh <pr> <sha> [merge-only]` | 等这个 head 的检查跑完，全绿就 `gh pr merge --squash --auto` 入队。KNOWN 名单只放用户认过的偶发失败，不为变绿往里加。按批的做法下，单个 PR 一律用 `merge-only` |
| `label-chain2.zsh`、`label-when-free2.zsh` | 旧做法（逐个 PR 加 `full-suite` 标签）的工具，只在用户要求某个 PR 单独跑全量时用 |
| `wait-merge.sh <pr>` | 已入队的 PR 等到合入 |
| `monitor.zsh` / `heads.zsh` | 配合 Monitor 用：报全量、合并、gate 日志，以及 PR 的 head 变化。`monitor.zsh` 里写死的 PR 号范围是 611–760，超了要改 |

### 4.3 页面资源（用户 10-18，#705）

默认只许变小。确实需要变大的，在 PR 里写明理由、字节数和试过的省法，统筹审过后在 `APPROVED_CEILINGS` 里一次性放行，键是 `[merge-base 的字节数, 实测]`。一次超过 10 KB 或者新增资源，才弹窗问用户。

## 5. 防腐线现状（Codex 交来的部分）

防腐线 10-17 起由 Codex 负责。Codex 的交接草稿在原机器的本地文件里，接手人拿不到，要点已经摘在下面；Codex 收尾后如果把它的交接推到远端，以那份为准。唯一的记录是 `specs/repository-anti-corruption/spec.md`，计划是 `roadmap-2026-10-07.md` 与 `docs/system/RUNTIME-MIGRATION.md`。

### 5.1 已合与在途

- 已合：#679（Home 路由按项目路径跑）、#677（W5-05）、#686（§10.26）、#684（Todo 迁到 Runtime）、#703（流式路由）、#727（材料服务）、#729（灵光迁到 Runtime）、#735（Computer Use 选择器不再编译成正则，S-25）、#736（`7d0e7b09b`，修 #729 之后灵光那条 `personal-plugins-review-fixes` 断言，收紧不是放宽）。
- #733（Codex，草稿）：Cognia 迁到 Home Runtime。原来的 base 是灵光分支，#729 合入后要改成接 main、转正，再审。
- #737（统筹）：把 10-18 的决定写进文档，已合（`5972daefd`）。

### 5.2 Codex 本地做完、还没开 PR 的候选

它们都在远端集成分支 `integration/anti-corruption-closeout-20261018`（头 `c34b65e4e`，比 main 多 371 个提交、430 个文件）上，一片叠一片地 merge 进去。单片的分支多数没推到远端，但每片的 head 都在这个集成分支的历史里，可以用 `git branch <名字> <sha>` 取出来。Codex 定的顺序：

| 内容 | head | 状态 |
| --- | --- | --- |
| Cognia Runtime | `6f57c2b2d` | 本地已接上新前置；#733 还停在旧 head |
| 插件私有文件 | `70d77c06e` | 等前置 |
| 后台授权 | `402d7fcc4` | 重复的 CI 选择已修 |
| 模型端口、Images 与 Jelly | `41fe68f0c` | 存储声明的回归已修（`wt-images-runtime`、`wt-jelly-runtime` 是旧树，不要合） |
| 模型回执与 query 委托 | `f3cdd1724` | 公共前置；Shelf 本身还没迁 |
| Home owner 文件服务 | `0725712ec` | 公共前置；业务接线没做 |
| 项目成果 D1 | `bebc037a8` | 安全 CI 的选择已补 |
| Alchemist 生命周期与恢复 | `36b2ac2c9` | Runtime 和 WorkReuse 没做 |
| PPT Runtime | `ea0c78ed6` | 含同步 publish 的尾检 |
| Dataset Runtime | `3cb2a9fcc` | 组合通过 |
| Workflows Store | `7cf7795cf` | 只做了 Store 端口，Runtime 接线没做 |
| Images 稳定翻译键 | `d60ac2b24` | 组合通过 |
| Module 公开边界 | `4decd87da` | 组合通过 |
| Pages 编辑职责拆分 | `858411ab7` | 组合通过，44 个文件 |
| Job 授权读取 | `36bc503b3` | 组合通过，3 个文件 |
| 独立复查记录 | `2dc1973dd` | 文档 |

- 这个集成分支的全量 39135082261 红在 `tests/personal-plugins-review-fixes.test.ts`：Dataset 的客户端断言还要求旧的短路径；fail-fast 取消了其他分片，所以其他文件都没验证。Codex 的修法是在灵光、PPT、Dataset 各自那一片里，把断言改成 Manifest 路径（灵光的那条就是 #736）。PPT、Dataset 的修完后重跑全量。
- 灵光已用掉 +2,231 B 的放行；Alchemist 的 +1,754 B 还没用，按实际 main 核对。Pages 比 main 小 79 B。
- 各片的 PR 正文草稿只在原机器上，接手人拿不到：开 PR 时按这一片的 diff、防腐 spec 里它那一节和实际的 CI 结果重写。
- Codex 自己的规矩里有「不跑本机全量、不加标签、最多两个在途 PR」。按 10-18 的新规则，这些候选按第 4 节组批合入，不用一个一个排全量。

### 5.3 还没开始的

路线图里 W5/W6 剩下的（第 3 节②③已排）：Shelf 的 D2 图参与者与 D3 Home 调用门面；Alchemist 的分区合同；Workflows 的 Manifest、路由与动作切换；Goals、Schedule、Inbox、Feed；W5-02、W5-03、W5-04、W5-06、W5-08、W5-10 剩下的、W5-11、W5-14～W5-17；W6 全部。还有 10-18 新加的：项目库服务、去特权、插件创作台并进平台、Sessions 清理、Characters 并进 Module。

## 6. 交接时的状态

### 6.1 main

- main 在 `5972daefd`（#729、#735、#736、#737 都已合入）。Prologue main 在 `dd639069c`。Molis vendored 的 SDK 还是 3adc5e87，prologue#50 还没换进来（交给④，和批 B 一起换）。
- 安全不变量编到 S-40，BACKLOG 编到 BL-177（#737）。coding-base 是 v13。
- **main 全量**（run 39133836119，`f4207e064`）：第 13 片的 `tests/side-shelf-in-hand.e2e.test.ts` AC-S04 两次红，Shelf 侧栏里选中一段文字后浮条没出现；第 14～16 片被 fail-fast 取消。同一份 main 在本机跑这个文件 2/2 通过（AC-S04 7.6 秒）；`gh run rerun --failed` 重跑那 4 片后整次运行成功。判负载时序，`f4207e064` 的全量算通过（#721、#730 等最后一批由它覆盖）。#735、#729 之后的 main 由下一次批全量或每晚的定时全量覆盖。
- #729 合入后 main 上 `personal-plugins-review-fixes` 的红已由 #736 修掉。#729～#737 这几个合入之后的 main 还没跑过全量：由第一个批全量或当晚的定时全量覆盖，统筹开工先看那一次。

### 6.2 还开着的别人的 PR

| PR | 谁的 | 怎么办 |
| --- | --- | --- |
| #732 | jingxusandra-gif，产品运营文档 | 统筹审过；用户 10-18 把它移出了合并队列。交作者和用户定，不要再入队 |
| #734 | jingxusandra-gif（草稿），Linux 探测补 uv | 转正后按 §3 审；它改 CI，注意有没有放宽门禁 |
| #631 | jingxusandra-gif（草稿），统一输入与本地语音 | 用户定留给作者；它会手动触发全量、占 runner |

### 6.3 要清的（删工作树和分支会被权限判成「Git Destructive」，要先弹窗请用户批）

下面除了远端分支，都在原机器上，由原机器那边清，接手人不用管。


- 回执线：工作树 `line-receipts-3e1`、`-3e0`、`-3e0b`、`-base`，三个 `receipts/*` 分支。`line-receipts-1c` 里有别人没提交的改动，别动。
- 交互线：工作树 `line-interaction-ac08`、分支 `interaction/ac08-two-tabs`；几个旧本地分支先 `git branch -d` 确认已合入再删。
- 采用线：工作树 `wt-a21` 和它的分支。
- 情境线：`.claude/worktrees/line-contextual` 和 `lines/contextual.md` 里列的分支；`~/.codex/worktrees/context-w0` 不是这个会话建的，删前先问用户。
- 手册线：分支 `ai/bl163-ack-eval`，评测用的临时 Home。
- Codex：`~/code/molis-anti-corruption-20261017/` 下的各工作树，等候选全部合入、证据核对完再清，由用户决定。
- 统筹：scratchpad 里的 `integ` 工作树。
- 主检出 `/Users/yijunwang/code/goalboard` 上有一堆没提交的文档改动，不知道是谁的。它常被真实 Home（4207）用着，不碰。

## 7. 需求线跟着防腐规范走（不制造新的技术债）

每个 PR 正文都带一节「防腐复查」，按 ANTI-CORRUPTION-REVIEW §3 逐项写，统筹审的时候核对。最常见的几条：
- 插件待遇一样（第 1 节）：不给某个插件在宿主里开私路，不新加「只给内置」的判断。缺能力就找②补到平台。
- 能力注册一次，动作走统一目录；不新加 typed 能力；插件之间只走公开合同。
- 不留兼容和兜底读取；合同只认现行取值；形状变了就升版本，不留兼容期。
- 门禁的数字对照 merge-base 只许降：巨大单元不能再长，新东西放新的小文件；测试不引用包内部；不新增空 `catch`、`as unknown as`、`any`。
- 新错误码用 `defineErrorCodes("<主人>", …)`，不新写 Error 子类。
- 页面里跨模块的事件要在 `dom-events.ts` 登记；界面文字要有英文。
- 安全边界变了，同步改 `SECURITY-INVARIANTS.md` 和断言拒绝的测试。
- 不为变绿而跳过、放宽或删除断言；时限可以按慢机放宽（例如 30 秒放到 90 秒，用户 10-15 认可）。
- 模型能力弱造成的坏效果不打补丁：不加措辞禁令、正则、特例开关，后果严重的靠工程层的事实核对兜住。
- 「不留尾巴」：PR 里不留 TODO。确实要以后做的，写进 BACKLOG（用自己的号段），写明为什么现在不做、等什么。

## 8. 各需求线的详细交接

各线的全文在 `lines/` 下：[`adoption.md`](lines/adoption.md)（附 [`adoption-a2-plan.md`](lines/adoption-a2-plan.md)、[`adoption-batchB-plan.md`](lines/adoption-batchB-plan.md)）、[`receipts.md`](lines/receipts.md)、[`interaction.md`](lines/interaction.md)、[`contextual.md`](lines/contextual.md)、[`handbook.md`](lines/handbook.md)（附 [`handbook-bl163-rule.md`](lines/handbook-bl163-rule.md)、评测脚本 [`handbook-eval-163/`](lines/handbook-eval-163/)）。第 3 节④的顺序就取自这些文件；文件里写的「统筹批了再开工」「每线最多两片」照旧，但全量按第 4 节跑。

各线的坑，挑最要紧的：
- 采用线：`registerAgentHostCapabilities` 363 行、`composeAgentHost` 245 行、`PrologueAgentAdapter` 602 行、`AgentHost` 381 行，都不许变大；typed 计数 187 不许变大。
- 交互线：`coding.js` 离预算只剩约 37 字节。
- 情境线：`provider_id` 只在 `view.provider.provider_id` 里（用假目录测不出来）；只有规则时，一段文字的第三个推荐位是去处，找按钮时要把 `.mw-ctx-menu` 带上；慢机上的时序要复现，就扣住 `/api/contextual/judge`。
- 手册线：评测只用一次性 Home；Coding 评测的 `write` 要先 `read`，`ask-user` 必须给 `why`。

## 9. 已知的坑与安全事项

- **MiniMax**：密钥只内联读：`MINIMAX_API_KEY="$(security find-generic-password -a "$USER" -s minimax-api-key -w)" …`（密钥怎么拿见第 0.1 节）。不落盘，不进日志，不用浏览器输入。只用一次性 Home，跑完就删。Home 主密钥的钥匙串条目是所有 Home 共用的，包括真实 Home，永远别删。
- **真实 Home**（原机器上是 4207、4208、4173；你机器上日常用的那个也算）不读也不写；要用的话，先弹窗问用户。
- 别的会话被 auto mode 拦下来的操作，要它在自己的会话里问用户；不要替它去做，也不要把权限转手。
- 不做：force push、裸 `git stash`、不按 pid 停进程（情境线 10-18 用 `pkill -f` 停过健康检查，可能连带停了别人的）、兼容或兜底读取、为模型能力的弱点加提示词补丁。
- 偶发的 CI 失败（用户认过可以重跑）：`coding-input-receipts.e2e` 的 RC-10/11/13/16，菜单没打开；`context-landing-panes.e2e` 的 PANE-LAND-02（先看 `detail.pane_id` 是不是空的，空的才是 S-30 的问题）；`side-shelf-in-hand.e2e` 的 AC-S04（第 6.1 节）。红在这些上面先重跑，不加进 KNOWN。
- fail-fast（#716）：一个分片失败，其他分片会被取消，被取消的文件不算验证过。
- 作者自己去掉又加上 `full-suite` 标签，或者手动 dispatch，会取消快跑完的全量、占掉 runner。
- 合并预览过期时，CI 跑的是旧 main 上的旧工作流。
- `product-subset` 作业名写着「not required yet」，红了多半是真问题，`gate-and-queue.sh` 不放行。
- 测试里的会话历史到了整理阈值，会多出一个「选择保留历史」的请求；按轮数写的假模型会因此错位，要按事实等。
- `sleep` 在前台会被拦，要等就用后台循环或 Monitor。

## 10. 需要用户的事

- 发版、真实 Home 的任何操作（W5-16、W5-17 的维护，Characters 和 Sessions 的存量数据），先弹窗问。
- 改信任边界的设计（S-34 `always_on`、默认连线的安装同意），先弹窗问。
- Sessions 重做的需求书（BL-177），给用户审。
- Computer Use 的真机验收（CU-G02～G04 等）要在 macOS 上做，用哪台机器、什么时间，先和用户约。
- 发布签名与公证（BL-021），还没定。
- 远端分支的删除，一项一项弹窗批（原机器上的工作树由原机器那边清）。
- #732、#631 交给作者和用户。
- 这份文档和 Claude Docs 的交接说明，用户分享后接手的人才能打开。
