# 防腐加速期：高风险、潜在问题与延后事项

状态：2026-10-23 起生效，① 一人维护；每次改动都立即推送到 origin（最近更新 2026-10-23 19:33 北京时间，11:33 UTC；18:40 以后几节日志的时间标签有更正，见 README 18:55 一节）。
- 用户 10-23 定：「优先完成防腐的工程开发，维护一个文档记录高风险和潜在问题，先完成工程开发，后续统一处理重度任务，测试任务」。
- 又补一句：在有限的槽位里优先开发，不要让 VPN 断掉，维持当前机器负载，剩余事项用文档记清楚。
- 各会话不直接改这份文件。要记的事，要么发给 ①，要么写在 PR 正文的「本机延后验证」一节，由 ① 收进来。

## 0. 接手说明（给 Codex 或别的接手者）

**在哪里读**
- 远端分支 `coordination/handoff-2026-10-14`，路径 `coordination/2026-10-14/RISKS-AND-DEFERRED.md`。
- 读最新版：
  ```bash
  git fetch origin coordination/handoff-2026-10-14 && git show origin/coordination/handoff-2026-10-14:coordination/2026-10-14/RISKS-AND-DEFERRED.md
  ```
- 同目录的 `README.md` 是协调日志，按时间记每一次裁决、合并和异常；这份文件只记现状，旧的不留在这里。

**怎么更新**
- 这份文件和 `README.md` 只由 ① 改，一改就提交并推送到上面的分支，不攒着。提交说明写改了哪一节。这个分支上不改代码。
- 在别的机器上做验证的接手者（用户 10-23 定：Codex 在另一台机器上跑统一验证）不改这两个文件。结果写进同目录自己的文件 `VERIFY-<日期>.md`，写完一段就提交推送；推之前 `git pull --rebase` 这个分支，只变基自己还没推的提交，不 force push。
- ① 每次动这份文件之前先 fetch 这个分支，看到新的或改过的 `VERIFY-*.md`，就把结果并进 §3（每个 PR 的「状态」列）和 §2（新风险），在 `README.md` 记一笔，注明来自哪份 `VERIFY` 文件。`VERIFY` 文件留着不删，作原始记录。

**统一验证发现的失败由谁修（用户 10-23 18:40 前后定，北京时间）**
- **PR 自己的改动引起的失败**：交给 Codex 修。它从作者分支开一个叠加 PR，目标就是作者分支，不推作者分支。这期间作者线不动同一处，也不 rebase、不 force push 作者分支；作者线自己的其他改动照常推。叠加 PR 由 ⑤（或 ⑩）审，审过由 ⑤ 合进作者分支，然后作者 PR 照常走合并。作者 PR 要是先合进了 main，叠加 PR 改投 main（合并时删分支，GitHub 会自动改投；没改投就由 ⑤ 手动改）。
- **main 本身的红**：Codex 动手前先查在途 PR（含 ⑤ 的修复 PR）和 ⑤ 的已知红名单，没人在修才从 main 开 PR。这台机器上的会话碰到 main 的红，也要先看 `VERIFY-*.md` 和 PR 留言里有没有 Codex 的认领，有就不修。
- **认领**：Codex 认领一处，就在对应 PR 上留言写明，同时写进 `VERIFY` 文件；开了修复 PR，就在原 PR 上贴链接。① 把认领并进 §3 对应行，写「Codex 修」。
- 作者在验证之前自己发现、Codex 还没认领的毛病，二选一：作者自己在 PR 里修，正文写一句；或者在 PR 上写明位置交给 Codex 认领，作者不再动。① 在 §3 对应行记清楚是哪一种，免得两边都修或都不修。
- Codex 仍然不合 PR，不推别人的分支。修的只是简单问题；要改产品行为、合同或门禁的，写进 `VERIFY` 交 ① 裁决。

**统一验证窗口怎么跑（§1 的触发条件满足时）**
1. 从 main 开一个集成分支和工作树，把 §3 里还没合的 PR 按顺序合进去：
   ```bash
   git fetch origin main && git worktree add -b integration/window-<日期> ../window-<日期> origin/main
   ```
2. 在那个工作树里安装、构建（这台 Mac 上一律经 `heavy.sh` 排队）：
   ```bash
   pnpm install --frozen-lockfile --offline
   ```
   ```bash
   HEAVY_CLASS=dev zsh /Users/creamiex/molis-ai/molis-work/.claude/coord-shared/tools/heavy.sh "window build" -- pnpm build
   ```
3. 选用例：`node scripts/affected-tests.mjs --base origin/main --json`，再并上 §3 各行列出的文件，跑：
   ```bash
   zsh /Users/creamiex/molis-ai/molis-work/.claude/coord-shared/tools/heavy.sh "window tests" -- node scripts/run-tests.mjs <文件…> --jobs 3
   ```
4. 失败的文件用干净的基线工作树（`git worktree add --detach ../window-base origin/main`，同样安装、构建）跑同一批，分清是谁引入的。
5. 健康门禁只在 1 号槽位跑（`heavy.sh` 自己会排）：
   ```bash
   zsh /Users/creamiex/molis-ai/molis-work/.claude/coord-shared/tools/heavy.sh "window health" -- node scripts/check-health-gates.mjs --base origin/main
   ```
6. 结果逐行写回 §3（过、红、红的原因、谁修），推送；用完删工作树和本机分支。

**不能碰的红线**
- 真实 Home 和真实数据不碰（含日常用的那个）；测试和实走只用一次性 Home，用完即删。Home 的主密钥钥匙串条目所有 Home 共用，永远不删。
- 发版、版本号、真实 Home 的维护、真实凭据、删真实 Home 的数据：都归用户本人（§4）。
- 不 force push；不用裸 `git stash`；停进程只按 pid 停；别的项目的进程（molis-club 的开发服务器、wrangler 部署、Chrome）不动。
- 这台 Mac 不跑全量，浏览器用例暂停；重活一律经 `heavy.sh`。槽位数（2）和负载线（36）不改。
- 别的会话被权限拦住，由它在自己的会话里问用户，不代办。

## 1. 现在怎么用这台机器

**槽位**
- 仍是 2 个；1 分钟负载在 36 以上就不开新任务；健康门禁只在 1 号槽位跑。三项都不放宽。
- `coord-shared/tools/heavy.sh` 10-23 版把任务分成两类：

| 类 | 怎么标 | 包括 | 规则 |
| --- | --- | --- | --- |
| 开发 | `HEAVY_CLASS=dev` | 一片推送前必须做的：构建、`pnpm api:update`、`pnpm actions:update`、类型检查 | 排队时优先；有开发任务在等，验证任务就不启动 |
| 验证（默认） | 不标 | 测试、健康与边界门禁、基线对比，以及其他一切 | 同一时间最多 1 个（数字在 `coord-shared/heavy-verify-slots`），另一个槽位总给开发留着 |

- 槽位里跑测试，默认同时 3 个文件。以前是 6 个：10-23 两个槽位各跑 6 个时，负载在 70 到 137 之间。调用方不要再传大于 3 的 `--jobs`。
- 槽位里构建，默认同时 2 个包（`pnpm_config_workspace_concurrency=2`，pnpm 11 认这个前缀）。10-23 一个 4 包并行的构建叠在一个测试上，负载冲到 314。
- `heavy.sh --status` 能看到每个槽位的类别和在等的任务。

**开发会话（②、③ 和 ③ 的子会话）**
- 一片写完，只做推送必需的几步：
  - 合同或动作变了，才构建并刷新快照，按开发类排队；
  - 跑 `pnpm secrets:check`（不占槽位）。
- 然后推送、开 PR。PR 正文写一节「本机延后验证」：`node scripts/affected-tests.mjs --base origin/main --json` 选出的用例、`full` 字段、命中的规则，以及本机没跑的检查。
- 交给评审后马上做下一片。不在本机跑相关用例、健康门禁和基线对比，这些交给 CI 和统一验证窗口。

**评审会话（⑤、⑩）**
- 照旧读代码评审。验证靠 PR 上的 CI 和 CI 上的集成批，这两样都不占本机。
- 合并标准不变：CI 必过项全绿、评审通过、命中全量条件的进集成批。
- 只有同时满足三条才在本机复现：CI 红了；看日志定不了原因；它挡着别人的开发。复现按验证类排队。

**统一验证窗口（① 定时间）**
- 触发条件，满足任一即可：
  - 这一轮防腐开发片做完；
  - §3 的延后清单超过 10 个 PR；
  - 某个 CI 红挡住了后面的开发。
- 窗口里依次做：
  1. 开一个集成分支，构建一次；
  2. 把 §3 各 PR 的相关用例并起来跑；
  3. 失败的用干净的基线工作树对比；
  4. 修。
- 窗口期间 ① 可以把验证类放到 2 个；负载线不动。

## 2. 高风险与潜在问题

| 编号 | 风险 | 影响 | 现状与缓解 | 谁跟 | 何时处理 |
| --- | --- | --- | --- | --- | --- |
| R-01 | 延后了本机验证：合并只靠 CI 和 CI 集成批，本机的相关用例不跑，浏览器用例本来就暂停着 | 回归晚发现；统一窗口里一次冒出几个失败，难分清是谁的 | 每个 PR 在 §3 记一行延后清单；窗口里按 PR 分组跑，再拿基线比 | ① ⑤ | 统一窗口 |
| R-02 | yijunw0212 账号在协调之外开 PR、自己合（它合过我们的 #1049，10-23 又合了 #1069、#1070 换 vendored Prologue）。用户 10-23 确认：是认识的同事，在并行开发 | 共享核心会在我们的批之外变；BL 号可能撞（它占了 BL-412、BL-413） | 不另做处理，只做两件事：取号前查 main 和在途 PR；⑤ 每次合并前看一眼 main 新进的提交 | ① ⑤ | 持续（已定） |
| R-03 | 机器负载和代理。10-23 上午负载 68 → 137（两个测试槽位各跑 6 个文件，加上 Chrome 的 72 个进程、别的项目的开发服务器和部署）；下午 17 点前后一个开发构建（4 个并行 tsc）叠在一个 6 并发的测试上，负载冲到 215、314。代理（127.0.0.1:17890）10-23 断过两次，每次所有会话都停在报错上 | 所有线一起停；负载再高可能像 10-19 一样整机重启 | `heavy.sh` 里测试默认 3 并发、构建默认同时 2 个包（`pnpm_config_workspace_concurrency=2`），验证类只占 1 个槽位；17:40 负载已回到 61、两个槽位都空。断线后由 ① 逐个恢复。别的项目的进程不归我们管，不动 | ① | 持续 |
| R-04 | Characters 的库 `characters/characters.sqlite` 从 v1 升到 v2（Sessions 清理 SC-2，#1080），新构建拒绝 v1 的库；`characters.runs`、`characters.launch` 升到 v2，输出里没有旧的 `session_id` 和 `output` 了 | 用户的真实 Home 装新版之前必须先维护一次；动作只给 user，唯一调用方是「设置 › 角色」页面，没有工作流、MCP 或 Skill 引用 | 维护脚本 `tests/fixtures/characters-maintenance-v2.sql`，演练用例 `tests/characters-maintenance-v2.test.ts`，防腐 spec §4.1 和 CHECKLIST 第 3 节的表已改到 2；CHECKLIST 第 4.3 节维护八下的子项也已加（#1080 `fcec150fb`）。和装新构建同一步做，动真实 Home 之前问用户 | ③、用户 | 下一次真实 Home 维护 |
| R-05 | 真实 Home 维护在积压：BL-126（维护六收尾）、BL-413（项目库 v8 → v9）、Characters v2、Sessions 数据删除（SC-5，删之前弹窗问用户，用户 10-23 已同意方案 A；会话库 `sessions.db` 里以前的角色运行记录不迁到新库——跨库迁移要走保留机制、经用户确认——并进 SC-5，D6 列清单时一起列给用户），以及可清除的角色包目录 `characters/runs/character-*/`（HOME-DATA 已登记为 purge）、Characters v2（R-04）、Shelf 目录 `shelf/catalog.json` 1 → 2（#1076，工具 `tests/fixtures/shelf-catalog-maintenance.mjs`，只在临时 Home 演练过；记在 CHECKLIST 第 4.3 节维护八，发布说明的「兼容与升级」要写） | 装新版前要一起做；漏一项，新版就打不开库 | 在一个维护窗口里排完；这台 Mac 上没有真实 Home | 用户 | 发版前 |
| R-06 | Sessions 清理 SC-4 要动 120 到 160 个文件，和 Goals S7b/S4、SC-3 可能改到同一批文件 | 冲突；在集成批里难分清是谁的问题 | 排在 SC-1 到 SC-3 之后，单独进批 | ③ | 做 SC-4 时 |
| R-07 | 偶发的用例：`workbench-deferred-clients.e2e`、`busy-feedback`（batch-1023-4 里重试才过）；`coding-workbench.e2e`、`stream-text.e2e`（BL-412 记的重试才过）；`code-scale.e2e` 的帧耗时；batch-1023-4 里 `workspace-read-one-id` 是事先料到会红的，修在 #1068 的 571b4e807 | 集成批的结果有噪音 | ⑤ 维护已知红名单，现在是 0 个 | ⑤ | 统一窗口 |
| R-08 | #1051（Shelf S2） | Shelf | ⑩ 本机 26 个 Shelf 用例里失败的 3 个，以及拿基线的对比 | 已合 main（head `3e7d4e6b3`，含 `a259350ac`），对 main 不冲突，PR 的 CI 全过（含 Verify）；⑩ 核对过 batch-1023-5 里的冲突解法。和 #1066、#1068 仍互相冲突（R-16），排在它们后面合；验证：被 Codex 这一批排除，等它们合了再验 |
| R-09 | 叠着的 PR：#1068 叠在 #1066 上；#1083（Shelf S4）叠在 #1076 上，#1076 又叠在 #1051 上，是第三层；#1084（PG-062 S4b）带着 #1067、#1071、#1079 的提交，是第四层（#1063 已合） | 改基线时会冲突 | 不叠第三层。#1083 是 ① 10-23 认可的例外：下面两层都已到合并阶段（#1051 批过，#1076 ⑩ 审过、进了 batch-1023-7）。它们合进 main 之前，#1083 不再推新提交；合了以后在 #1083 上合进 main（不 force push），让 diff 只剩 S4，再交 ⑤ 组批。#1084 同样处理：按 #1067 → #1071 → #1079 → #1084 的顺序合，前面几层合完之前它不推新提交，评审只看 S4b 自己的部分（`--base 7c0b311cf`）。「不推新提交」指不加新内容。把下层的新提交合上来的纯同步合并，推不推由合并人 ⑤ 定；下层还在合并队列里时默认不推，由 ⑤ 组批时合（① 10-23 19:00 先说可以推，⑤、⑩ 已叫停在先，19:03 改照 ⑤ 的分工）。要推的话，本层自身 diff 必须不变（对新的下层 head 比，与评审时一致），并在 PR 上记一句 | ⑤ | 持续 |
| R-10 | Alchemist 和插件创作台不迁移，防腐收尾后删掉重做，连同 studio replay 的 CI 作业 | 防腐期间改共享代码，还要顾着它们 | 备份分支 `backup/alchemist-plugin-builder-2026-10-21`；BL-376、BL-377 | ① | 防腐收尾 |
| R-11 | ② 的两张会话卡一直没开：C8-3（`task_3f6b811d`）、Goals S9（`task_96c0cd34`） | 这两片停着 | 等用户点开；不开，就由 ① 排进 ② 的队列 | 用户、① | 下次排队时 |
| R-12 | #1074（BL-411）留下的路由缺口，② 选了不改代码：插件自己写的路由如果先 await 别的、停止落在中间以后才调服务，这个 HTTP 请求一直不答（以前答 403）。SDK 的 `bindPluginActionRoute` 同步调服务，不受影响 | 插件自写的异步路由在停用、撤权时会挂住请求，客户端只能等超时 | 根治：把路由分派也记成一次「调用」，要改 plugin-runtime 的作用域。① 定为 BL-403，由 ② 在 #1074 里加 BACKLOG 行 | ② | S0b-2、W5-06 之后，排进 ② 的队列 |
| R-13 | #1074 之后，插件停止以后同步方法被拒，返回 `undefined`。残留回调如果接着用返回值，会在插件自己的代码里出 TypeError。PR 里列了 30 多个返回值有用的同步方法 | 停用时插件日志里出现看着像插件缺陷的 TypeError，可能误导排查 | 先接受；统一窗口里看停用、撤权那几路用例有没有这类报错。BL-403 做路由时一起评估要不要给同步方法一个明确的拒绝 | ② | 统一窗口、BL-403 |
| R-14 | 工具风险：在借用的工作树里，`mcp__ccd_host__sync_with_base_branch` 合进的是会话原来的工作树，不是当前所在的。② 10-23 碰上一次，在 `feat/project-library-l1b` 上留下 39 个冲突，已经 abort，分支回到 cdcda41b1，没有残留 | 合错分支；没注意到就会把冲突或别的改动推上去 | 在借用的工作树里不用这个工具，自己 `git merge origin/main`。① 已通知各开发和评审会话 | 全体 | 持续 |
| R-15 | 手写路由不 catch：#1018 写法的 Home 插件路由（`routes: … async handle(request)`，不经 SDK 的 `bindPluginActionRoute`）抛出不带错误码的错误时，落到宿主的通用句子「请求未能完成，请重试」，状态和错误码都丢了。Shelf 在 #1076 里已改成用 SDK 的 `actionErrorResponse` 自己答；别的插件还没查 | 用户只看到通用报错；调用方拿不到错误码，没法按类别处理 | 根治放在平台：Plugin Runtime 的路由分派统一 catch，交给 SDK 的 `actionErrorResponse` 答，插件不用各写 catch；顺带列一遍现存的手写路由。BL-404，和 BL-403 一起做 | ② | BL-403 一起 |
| R-16 | 候选 PR 之间在枢纽文件上互相冲突（`VERIFY-2026-10-23` 用 `git merge-tree` 逐对核对）：#1071 和 #1067 冲在 `apps/local-host/src/coding-surface.ts`，和 #1066、#1068 冲在 `specs/repository-anti-corruption/privileges.md`；#1051 和 #1066、#1068 冲在 `privileges.md`、`tests/builtin-plugin-assembly-gate.test.ts`、`tooling/gates/baseline.json`，和 #1068 冲在 `specs/BACKLOG.md`。每个单独对 main 都不冲突 | 这两个 PR（以及叠在 #1051 上的 #1076）进不了同一个验证批；合并顺序不对会一串返工 | 按顺序合：#1066 → #1068，#1067 → #1071；#1051、#1076 在 #1066、#1068 之后合 main 再进批。被排除的 PR 合完 main 后，由 Codex 在下一批验证 | ⑤ | 合并时 |
| R-17 | 删除项目时不清 `character_runs`（#1080 之后角色运行记在角色库里）。旧行为也没清，因为会话记录没有 `project_id` | 删掉的项目在角色库里留下运行记录 | 以后让 Characters 在 `ProjectDeletionService` 里声明自己要清的数据，单开一片，BL-385（③ 取号，行在 #1080 的 `fcec150fb`） | ③ | SC 系列之后 |
| R-18 | main 上 #1041（yijunw0212，VUX 第 101 片）留下几处本地红，CI 产品子集不含这几个文件，所以 main 的 CI 是绿的（`VERIFY-2026-10-23` `0bf6f3502`）。① `tests/host-pages-error-model.test.ts`：`DOCUMENT_STATUS` 精确状态表缺 `original_not_offered: 400`；`apps/local-host/src/artifact-document-import.ts:120` 的 `new Error("not a file")` 被「入口不抛裸 Error」扫描命中。下一行的 catch 已经转成现有错误码，不是已证实的 500 泄漏。② `tests/personal-plugins-review-fixes.test.ts`、`tests/plugin-project-database.test.ts`：Home 存储的精确清单多出 `artifacts`，已核实（`7c6b0657e`）是测试漏项。`artifacts` 是原文件目录，由 Manifest 声明、owner 是 `io.molis.work.artifacts`，生产登记是对的 | 本地跑全量或这几个文件时 main 本身就红，容易被算到在途 PR 头上 | ⑤ 在 batch-1023-5 里也碰上了，多一处 `fill-message`（VUX-40：三句新英文的 "batches" 不跟数字变单复数），已开 [#1082](https://github.com/molis-ai/molis-work/pull/1082)（`fix/main-red-1041`，6 个文件，`full` 为空，CI 绿了就合）。这 4 份已记进 ⑤ 的已知红名单。Codex 在它那台机器上备的同类修复 `feature/host-pages-error-model` 是重复的，① 已在 [#1041](https://github.com/molis-ai/molis-work/pull/1041#issuecomment-6362965357) 请它停掉、下一批直接验 #1082；它多出来的「原件已删或变成目录时拒绝」用例，等 #1082 合了再从 main 单开一个小 PR | ⑤ 修和合；Codex 验 | #1082 合入 |
| R-19 | 两个安全用例在 Codex 的定向批里红了，还没分类（`7c6b0657e`）。`tests/security-invariants-connector-intent.test.ts`：3 秒内没看到假 gh 的启动标记，可能是连接请求提前失败，也可能是还没起来。`tests/security-invariants-cli-install.test.ts`：第一次安装在 `--version` 探测上就报 `connector.install.failed`，15 秒的探测期限和 16.1 秒的耗时很接近；包装器把超时、spawn 失败和非零退出合成同一个码，分不出是哪一种 | 如果是产品问题，就是安全边界的回归；如果是时序问题，会在别的机器上偶发 | Codex 在干净的 main 基线上跑同一批文件对比，再分类；分不出来就是测试缺陷，要让包装器把三种失败分开报 | Codex | 本批结束前 |
| R-20 | S0b-2（#1081，`services.connections`）留下的四处，② 报：① 卸载不删 `connector_bindings` 里这个安装的绑定，`install_id` 不变，重装以后沿用原来的账号；② 绑定动作不核这个安装在不在、有没有声明这个槽。没声明的槽发请求时还会按 Manifest 再核一次，所以用不上，但会留下记录；③ 令牌过期的 401 不强制刷新重试，原样交回给插件；④ 让人选账号的界面（S0b-2b）还没做，现在只能经 user 动作绑定 | ① 是卸载以后留着的授权，重装时用户没再确认就接上了原来的账号；②③ 不会越权，但留下死记录，插件得自己处理过期 | ① 和 BL-356（卸载或丢弃数据时清原文件登记）一起做，在卸载那条路上一并清掉；②③ 在 S0b-2b 里收紧：绑定时核安装和槽，过期 401 刷新后重试一次。S0b-2b 取号 **BL-350**（② 查过 main、在途 PR 和 git 历史，都没用过）。BL-350 一行，以及 BL-356 并进「卸载时清 `connector_bindings` 里这个安装的绑定，补一条断言删干净的测试」、优先级提到「中」并写明不排在 S0b-2b 之后，两处都写进 W5-06 那个 PR 的 BACKLOG 改动 | ② | W5-06 之后 |
| R-21 | CI 拥堵。仓库一共 20 个 runner，一个 Full suite 占 16 片。10-23 傍晚同时排着三个：batch-1023-6、batch-1023-7，还有同事在 #1073 上贴 label 触发的那个。合并队列的 Verify 排了 60 分钟没轮上，#1067 在 11:04 UTC 以 checks_timed_out 被踢出队列，⑤ 已重排。另有 4 个已作废的旧队列 run（分支已不存在）还排着：#1066、#1067、#1077 各一个是我们的，#1078 那个是同事的。用户 19:14 放行后，① 已取消我们那 3 个：普通 cancel 对其中两个不起作用（返回成功，但一直停在 queued），用 `force-cancel` 才清掉；同事那个没动 | 合并变慢，队列里每一项都可能再超时 | ⑤：集成分支的 Full suite 在 CI 上一次只跑一个（6 → 7 → 8）。batch-1023-7 的 run 已先停下，完成的两片保留，6 跑完后只重跑没完成的片。被踢的 PR 由 ⑤ 重排。各线（19:10 起，②、③、⑩ 都已通知）：提交攒到一片做完再推；队列里和批次里的 PR 不推；不贴 full-suite label，不手动跑 Full suite。可以考虑的后续：给 Full suite 加并发组和 max-parallel，给 Verify 留出 runner（改 CI，要另开 PR） | ① ⑤ | 进行中 |
| R-22 | VUX-36 `assistant-repeat-no-accumulation.e2e` 在 batch-1023-6 和另一批里都红，数组从 480 涨到 724；两批里都没有相关的 PR，⑤ 记成 main 上的间歇红（类别暂定产品回归，待查）。另有 3 份重试才过的偶发：`page-interaction-flow`、`work-placement-journeys`、`code-scale` | 如果是真的累积（重复操作时数组一直涨），就是性能回归，会被当成偶发放过去 | **Codex 先查**（按 §0 处理 main 上的红：先看在途 PR 和 ⑤ 的已知红名单）：拿 main 和批次对比，分清是产品回归、测试缺陷还是时序问题，结论写进 VERIFY。3 份偶发先记在 ⑤ 的已知红名单，同一个文件再红一次就进 `tests/quarantine.json`（写上 owner 和到期日） | Codex，⑤ | 待查 |

## 3. 延后的重活与测试（按 PR）

CI 状态是 10-23 17:40 的快照，以 PR 页面为准。「验证」写的是另一台机器上 Codex 的统一验证结果，原始记录在同目录的 `VERIFY-<日期>.md`（现在是 `VERIFY-2026-10-23.md`：集成分支 `integration/window-2026-10-23`，基于 main `a259350ac`；19:20 时完整构建已过，选中 610 个文件——574 个非浏览器、36 个浏览器——在那台机器上排队，跑完再跑一次全量）。19:20 main 仍是 `a259350ac`：⑤ 的合并队列里 #1063、#1067 在等 CI 机器，batch-1023-5、batch-1023-6 在排队。

| PR / 片 | 线 | 延后了什么 | 状态 |
| --- | --- | --- | --- |
| #1063（Goals S6）——已合 main `24156e6b8` | ③，⑤ 合 main | ⑤ 在本机合 #1048 和 main 之后的构建与相关用例 | batch-1023-4 过（除事先料到的 `workspace-read-one-id`）；⑤ 合了 main 重推，CI 12 过、产品子集在跑；验证：非浏览器定向过（`7c6b0657e`：打开项目时补对、被拒的库），`workspace-read-one-id` 4/4；浏览器、全量和门禁还没跑完 |
| #1066（Git G5） | ③ | 同上 | batch-1023-4 过；⑤ 合了 main 重推，CI 12 过、产品子集在跑；验证：非浏览器定向过（`7c6b0657e`：工作区操作和工作树）；浏览器、全量和门禁还没跑完 |
| #1068（Git、Files 订阅 `host.workspace.changed@1`） | ③，叠在 #1066 上 | 本机相关用例 | CI 全过；等 #1066 合了再合；验证：非浏览器定向过（`7c6b0657e`：生产事件和权限边界）；浏览器、全量和门禁还没跑完 |
| #1067（PG-062 第 2 片） | PG-038 | ⑤ 在本机合 main 之后的验证 | CI 在跑（6 过、6 在跑）；验证：红（定向，`VERIFY-2026-10-23` `0bf6f3502`）：`tests/coding-rich-html.test.ts` 的 PG062-05/06 读 `/runs/talk/report` 得 400。Codex 归为测试夹具缺陷：#1048 之后成果、过程项端口必填，新测试没像旧报告测试那样传 `openProjectVersionStores(store)`，生产入口两项都传了。修法是补夹具，HTML、语言、指纹和动作直调的断言都保留。Codex 已在 PR 上认领。18:39（原记 21:15）#1067 排在合并队列第一位，① 定不拉出队列：合进 main 以后这个文件就在 main 上，由 Codex 照它认领的从 main 单开 PR 修；⑤ 把它记进已知红名单，修复合入后划掉；作者线和 ⑤ 都不修这一处 |
| #1071（PG-038 S3，SDK `/diff-view`） | PG-038 | 合 main 之后的本机验证 | CI 在跑；验证：被排除，和 #1067、#1066/#1068 冲突（R-16），等 #1067 合了合 main 再验 作者 18:43（原记 21:50）自己发现 `tests/coding-change-html.test.ts` 也漏了 `openProjectVersionStores(store)`（和 #1067 的 `coding-rich-html` 同一类），作者在 PR 上标出位置（第 66 行）交给 **Codex 修**，作者合 main 时只解冲突 |
| #1051（Shelf S2） | Shelf | ⑩ 本机 26 个 Shelf 用例里失败的 3 个，以及拿基线的对比 | 和 main 冲突，CI 没跑；先 rebase（R-08）；验证：被排除，和 #1066/#1068 冲突（R-16），等它们合了再验 |
| #1074（BL-411、BL-368） | ② | rebase 之后最后一次本机构建、测试和门禁（bl411-final，已撤）；affected-tests 选中的 125 个用例。`full` 为空，不进批；不动合同、SDK、Manifest 和门禁，没有构建 | CI 在跑；已合过一次 main（没有 force push）。留下的缺口见 R-12、R-13；验证：`plugin-stopped-services` 5/5、双实例与生命周期的定向文件都过了，只读评审没找到 R-12、R-13 之外的 P1。`tests/plugin-project-database.test.ts` 红在「已装插件的 Home 库」清单多出 `artifacts`，停止后的拒绝与零写入用例过了，不是 BL-411 的问题，见 R-18。R-12、R-13 单独看 |
| #1075（Sessions 清理 SC-1，PG-081） | ③ | 本机相关用例的最后一轮 | CI 9 过、4 在跑；验证：两处红，都是 SC-1 的预期变化没同步进用例，按 §0 由 **Codex 修**：它开目标是 `migrate/sessions-sc1-stop-writes` 的叠加 PR，③ 不动这两处。① `tests/goals-mcp-actions.test.ts:133`（定向，`0bf6f3502`）：还在断言 MCP 写 Goal 时把 Session 的 `current_goal_id` 改掉，下一行还在等旧的会话活动事件。修法是断言 Session 和事件前后都没变；Goal 原事件、审计作者、幂等、权限和撤权的检查一条不放宽。② `tests/session-workspace.e2e.test.ts:413`（浏览器，`f0500dc81`）：修复目录关系以后，Session 原样存着 `/var/folders/...`，新断言却拿目录登记里的规范路径 `/private/var/folders/...` 去比，在 macOS 上红。修法是 repair 之前读回完整的 Session 和事件快照，操作之后和原值比，不用 realpath 抹平可能的改写 |
| #1076（Shelf S3，路由只由插件声明、删宿主 `/api/shelf`） | Shelf，⑩ 评审 | 本机 84 个选中文件只跑完 68 个（负载 221 时叫停）：11 个失败，其中 4 个已修但修后没重跑（`shelf-project-results-http`、`action-cross-entry` T5、`shelf-owner-files` PG-026-S2-2、`shelf-jelly-cognia-images-error-model`）；6 个原因不明，多半是高负载下超时（`shelf-ai-host`、`images-concurrency`、`images-mcp`、`coding-product-http`、`coding-material-consumption`、`security-invariants-plugin-pages` 的 ECONNRESET）；1 个环境问题（`shelf-material-extraction`，本机 Swift 编译 Vision 帮助程序失败）；16 个没跑（列表在 PR 正文）。另外没跑：`boundary:check`、健康门禁、`page-assets --base`（合 main 后没重建，workbench 的数是推算的）、`test:security`、浏览器用例与截图、`native-checks`（`shelf_http.rs` 改了） | 叠在 #1051 上；`full` 非空（shared-core、assembly、spans-packages、deletes-code，选中 518 个文件），等 #1051 合了进集成批。三个审批项 ① 10-23 已裁决（见 README）；验证：没进批（Codex 拿到的登记册版本里它还没编号；又叠在被排除的 #1051 上），等 #1051 再验；⑩ 评审过了，交 ⑤ 组批，评审时在 `e854df567` 修了 CI 的 rustfmt 和巨大单元两处红，并把两条被放宽的断言恢复原样 |
| #1080（Sessions 清理 SC-2：角色运行记进角色库，库 v1 → v2） | ③，⑩ 评审 | 本机只构建和刷新快照。没跑：affected-tests 选中的 149 个文件，其中直接相关的 `characters-native-execution`、`characters-maintenance-v2`（新增）、`characters-schema`、`home-store-baselines`、`characters-actions`、`action-contract-snapshot`，以及浏览器用例 `security-invariants-plugin-terminals.e2e`；`boundary:check`、健康门禁（含 store-versions、table-owners）、`verify-release-versions`、截图 | `full` 非空（shared-core、storage、spans-packages），进集成批；没进 Codex 这一批（开 PR 晚于它固定代码）。留下的事见 R-04、R-05、R-17 |
| #1079（PG-062 S4a，插件交互渲染服务 `services.interaction`，S-56） | PG-038 | 选中的 300 个文件（284 个非浏览器、16 个浏览器，含新的 `tests/security-invariants-plugin-interaction.test.ts`）；`health:check --base`、`boundary:check`、`page-assets:check`、`test:contracts`、`test:security`。`full` 命中 shared-core、spans-packages，进集成批。`home-plugin-executor.ts`、`plugin-sandbox` 的 `worker.ts` 没有测试经导入图到达；沙箱用例只在 macOS 跑 | 新开；本机只跑了构建、`api:update`、`secrets:check`。不含 #1067、#1071，文件不重叠；S4b 在它之后另开。① 19:00 批 S-56（读过表行和 4 条带 S-56 的用例，都断言拒绝）；broker 那条只在 macOS 跑，Linux CI 跳过，同 R-03 一类，记着不挡合并。和 #1081 同批、先合。验证：Codex 下一批 |
| #1081（S0b-2，`services.connections`：插件经平台用本人的服务账号发请求，S-57） | ② | 选中的 529 个文件，`--wide` 另多出 94 个；网关错误类用例（`platform-action-errors`、`action-availability-kind`、`action-gateway`）；`health:check --base`（起跑后按 pid 停了）、`boundary:check`、`verify-release-versions`、`test:security` 全集；创作台网络门回归 `tests/agent-built-plugins-network.test.ts`，用来证明改成共用 `public-https.ts` 以后行为不变。`full` 命中 shared-core、spans-packages，进集成批。有 4 个新文件，导入图上没有测试到达 | 新开；本机构建、`api:update`、`actions:update`、`secrets:check` 都跑了，新安全用例 6/6 通过（之后只把 S-56 改名为 S-57，没重跑）。Gates 现在红在 S 编号不连续（缺 S-56，job 120374622878），#1079 先合后自然转绿，本 PR 不用改。**P1，先不合**：Codex 只读评审（11:25 UTC，评论 6363784929）指出 `public-https.ts` 只在 DNS lookup 里调 `beforeEffect()`，而全局 Agent 默认 keep-alive，复用连接时跳过发送前复核。① 对着 `c59a65b71` 的源码核实过，本机 Node 实读 keepAlive 也是 true；文件是本 PR 新加的。① 19:31 裁：**② 在本 PR 里修**，做法是每次发送新开连接（照 `anysearch-transport.ts` 的 `agent: false`），并补一条 S-57 拒绝用例（复用连接、等待期间失权、服务端请求数不增加）。Codex 不开叠加 PR，只做复验；合并前要等 Codex 复验通过。CI 拥堵期间本 PR 可以推这一次。batch-1023-8 推送时修复还没上来，就把 #1081 拿出来。验证：Codex 下一批 + 这条的复验 |
| #1077（删 BL-410，BL-412、BL-413 接回表格） | ⑤ | 纯文档；门禁交 PR CI | 新开，不进批 |
| #1082（修 #1041 带进 main 的 4 份红，R-18） | ⑤ | `full` 为空，不进批；靠 PR CI | 新开，CI 绿了 ⑤ 就合；Codex 下一批验 |
| #1083（Shelf S4：演示种子走 `shelf.sample.seed`，删 `shelf-actions.ts`，Shelf 移出混合名单，PG-026-S1、PG-090 标已做） | Shelf，⑩ 评审 | 本机只跑了 `secrets:check`。只看 S4，`full` 命中 assembly；整条叠放命中 shared-core、assembly、spans-packages、deletes-code，等 #1051、#1076 合了由 ⑤ 组批 | 新开，head `564c6395a`，叠在 #1076 上（R-09 的例外）。Shelf 留下的两处不算新风险：Manifest 的 `kind: "native"` 和 `always_on` 归 PG-004、PG-007 阶段 4（②）；宿主替 Shelf 拼设置节（`web-catalog.ts` 的 `renderCatalogPluginSettings`）已在 PG-072 里。Shelf S2～S4 到这里都交出去了。⑩ 审过「可合」，往本分支推了测试夹具 `42aebcbfd`（没动产品代码）；同步合并 `67d1dd96b`（S3 `af7544506` 合进来）留在 Shelf 本地不推（照 ⑤ 的分工）：#1051、#1076 合进 main 以后，⑤ 在本分支上合 #1076 的最终 head 和 main，再组批；在那之前 S3、S4 都不再推。验证：等下面两层合了再进 Codex 的批，以最新 head 为准 |
| #1084（PG-062 S4b：Coding 用 `actionCardView` 和 `services.interaction` 自己画卡片和下一步，删宿主的 `decorateCodingResult`、`codingNextSteps`、`codingRouteHooks.afterDispatch`） | PG-038，⑩ 评审 | 只算本片（`--base 7c0b311cf`）：选出 522 个文件，其中 47 个浏览器用例，含新的 `tests/coding-interaction-html.test.ts` 和改写的 `tests/coding-next-steps.test.ts`；`full` 命中 spans-packages（local-host、workbench、coding）。整条分支对 main：652 个文件，命中 shared-core、spans-packages、deletes-code，进集成批 | 新开，head `63c848e97`，带着 #1067、#1071、#1079 的提交（R-09 的例外）。给 S4a 的服务补了一处语言取法：路由不在调用里时，取页面请求的语言 `pageLocale`，S-56 的说明同步改了；#1079 单独先合也没问题，因为 #1084 之前没有路由用这项服务。验证：等前面几层合了再进 Codex 的批 作者自己发现 `tests/coding-interaction-html.test.ts` 漏了同一个夹具，第 52 行；作者撤回了本地补丁 `9f8e03650`（没推过），交给 **Codex 修**，等前几层合完再开叠加 PR |
| #1085（W5-06 第 1 片：UiHost 按贡献声明的 slot 挂（`mountDeclared`），删 11 个 Goals 挂载转接文件和 9 张 surface→slot 表；`goals-page-renderer.ts` 改名 `shell-page-renderer.ts`；BL-350、BL-356 写进 BACKLOG） | ② | `full` 命中 assembly、spans-packages、deletes-code，进 ⑤ 的批次。改了门禁 `check-package-boundaries.mjs` 的提案检查：旧的只看子串 `host.mount(`，新的钉住 `ui-composition.ts` 里 `createSurfaceRenderers<…>(workbenchUiHost, GOALS_PROPOSAL_UI_CONTRIBUTION_ID, GOALS_PROPOSAL_UI_SURFACES)` 那一行，反例测试照样断言拒绝。① 19:21 审过，不算放宽。改名的相似度是 98%，health 门禁按 git 的改名带过两个巨大函数的记录 | 新开，head `a483bb7c9`；本机跑了构建和快照刷新（Swift 原生构建用 ④ 记的 `swiftc` 包装绕过 CLT 16.2 的问题，只加在命令的 PATH 上）。没跑 `boundary:check` 和 `health:check --base`，以 CI 的 Gates 和批次为准。新正则要求这个调用写在一行里，格式化折行会误报（只会挡住、不会放过）。验证：Codex 下一批 |

## 4. 要用户本人做的

- 发版和版本号。
- 真实 Home 的维护（R-04、R-05），包括 SC-5 删 Sessions 数据之前的弹窗。
- ② 的两张会话卡（R-11）。
