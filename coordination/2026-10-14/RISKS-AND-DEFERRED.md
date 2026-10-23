# 防腐加速期：高风险、潜在问题与延后事项

状态：2026-10-23 起生效，① 一人维护；每次改动都立即推送到 origin（最近更新 2026-10-23 18:50 本地时间）。
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
| R-04 | Characters 的库要从 v1 升到 v2（Sessions 清理 SC-2），新构建会拒绝旧库 | 用户的真实 Home 装新版之前必须先维护一次 | ③ 带演练测试和维护说明；在真实 Home 上执行归用户 | ③、用户 | 下一次真实 Home 维护 |
| R-05 | 真实 Home 维护在积压：BL-126（维护六收尾）、BL-413（项目库 v8 → v9）、Characters v2、Sessions 数据删除（SC-5，删之前弹窗问用户，用户 10-23 已同意方案 A）、Shelf 目录 `shelf/catalog.json` 1 → 2（#1076，工具 `tests/fixtures/shelf-catalog-maintenance.mjs`，只在临时 Home 演练过；记在 CHECKLIST 第 4.3 节维护八，发布说明的「兼容与升级」要写） | 装新版前要一起做；漏一项，新版就打不开库 | 在一个维护窗口里排完；这台 Mac 上没有真实 Home | 用户 | 发版前 |
| R-06 | Sessions 清理 SC-4 要动 120 到 160 个文件，和 Goals S7b/S4、SC-3 可能改到同一批文件 | 冲突；在集成批里难分清是谁的问题 | 排在 SC-1 到 SC-3 之后，单独进批 | ③ | 做 SC-4 时 |
| R-07 | 偶发的用例：`workbench-deferred-clients.e2e`、`busy-feedback`（batch-1023-4 里重试才过）；`coding-workbench.e2e`、`stream-text.e2e`（BL-412 记的重试才过）；`code-scale.e2e` 的帧耗时；batch-1023-4 里 `workspace-read-one-id` 是事先料到会红的，修在 #1068 的 571b4e807 | 集成批的结果有噪音 | ⑤ 维护已知红名单，现在是 0 个 | ⑤ | 统一窗口 |
| R-08 | #1051（Shelf S2） | Shelf | ⑩ 本机 26 个 Shelf 用例里失败的 3 个，以及拿基线的对比 | ⑤ 在 batch-1023-5 里解了和 main 的冲突，⑩ 核对解法无误（断言没放宽；baseline 333）；等批次结果 |
| R-09 | 叠着的 PR：#1068 叠在 #1066 上；#1063 刚从 #1048 上挪下来 | 改基线时会冲突 | 不叠第三层 | ⑤ | 持续 |
| R-10 | Alchemist 和插件创作台不迁移，防腐收尾后删掉重做，连同 studio replay 的 CI 作业 | 防腐期间改共享代码，还要顾着它们 | 备份分支 `backup/alchemist-plugin-builder-2026-10-21`；BL-376、BL-377 | ① | 防腐收尾 |
| R-11 | ② 的两张会话卡一直没开：C8-3（`task_3f6b811d`）、Goals S9（`task_96c0cd34`） | 这两片停着 | 等用户点开；不开，就由 ① 排进 ② 的队列 | 用户、① | 下次排队时 |
| R-12 | #1074（BL-411）留下的路由缺口，② 选了不改代码：插件自己写的路由如果先 await 别的、停止落在中间以后才调服务，这个 HTTP 请求一直不答（以前答 403）。SDK 的 `bindPluginActionRoute` 同步调服务，不受影响 | 插件自写的异步路由在停用、撤权时会挂住请求，客户端只能等超时 | 根治：把路由分派也记成一次「调用」，要改 plugin-runtime 的作用域。① 定为 BL-403，由 ② 在 #1074 里加 BACKLOG 行 | ② | S0b-2、W5-06 之后，排进 ② 的队列 |
| R-13 | #1074 之后，插件停止以后同步方法被拒，返回 `undefined`。残留回调如果接着用返回值，会在插件自己的代码里出 TypeError。PR 里列了 30 多个返回值有用的同步方法 | 停用时插件日志里出现看着像插件缺陷的 TypeError，可能误导排查 | 先接受；统一窗口里看停用、撤权那几路用例有没有这类报错。BL-403 做路由时一起评估要不要给同步方法一个明确的拒绝 | ② | 统一窗口、BL-403 |
| R-14 | 工具风险：在借用的工作树里，`mcp__ccd_host__sync_with_base_branch` 合进的是会话原来的工作树，不是当前所在的。② 10-23 碰上一次，在 `feat/project-library-l1b` 上留下 39 个冲突，已经 abort，分支回到 cdcda41b1，没有残留 | 合错分支；没注意到就会把冲突或别的改动推上去 | 在借用的工作树里不用这个工具，自己 `git merge origin/main`。① 已通知各开发和评审会话 | 全体 | 持续 |
| R-15 | 手写路由不 catch：#1018 写法的 Home 插件路由（`routes: … async handle(request)`，不经 SDK 的 `bindPluginActionRoute`）抛出不带错误码的错误时，落到宿主的通用句子「请求未能完成，请重试」，状态和错误码都丢了。Shelf 在 #1076 里已改成用 SDK 的 `actionErrorResponse` 自己答；别的插件还没查 | 用户只看到通用报错；调用方拿不到错误码，没法按类别处理 | 根治放在平台：Plugin Runtime 的路由分派统一 catch，交给 SDK 的 `actionErrorResponse` 答，插件不用各写 catch；顺带列一遍现存的手写路由。BL-404，和 BL-403 一起做 | ② | BL-403 一起 |

## 3. 延后的重活与测试（按 PR）

CI 状态是 10-23 17:40 的快照，以 PR 页面为准。

| PR / 片 | 线 | 延后了什么 | 状态 |
| --- | --- | --- | --- |
| #1063（Goals S6） | ③，⑤ 合 main | ⑤ 在本机合 #1048 和 main 之后的构建与相关用例 | batch-1023-4 过（除事先料到的 `workspace-read-one-id`）；⑤ 合了 main 重推，CI 12 过、产品子集在跑 |
| #1066（Git G5） | ③ | 同上 | batch-1023-4 过；⑤ 合了 main 重推，CI 12 过、产品子集在跑 |
| #1068（Git、Files 订阅 `host.workspace.changed@1`） | ③，叠在 #1066 上 | 本机相关用例 | CI 全过；等 #1066 合了再合 |
| #1067（PG-062 第 2 片） | PG-038 | ⑤ 在本机合 main 之后的验证 | CI 在跑（6 过、6 在跑） |
| #1071（PG-038 S3，SDK `/diff-view`） | PG-038 | 合 main 之后的本机验证 | CI 在跑 |
| #1051（Shelf S2） | Shelf | ⑩ 本机 26 个 Shelf 用例里失败的 3 个，以及拿基线的对比 | 和 main 冲突，CI 没跑；先 rebase（R-08） |
| #1074（BL-411、BL-368） | ② | rebase 之后最后一次本机构建、测试和门禁（bl411-final，已撤）；affected-tests 选中的 125 个用例。`full` 为空，不进批；不动合同、SDK、Manifest 和门禁，没有构建 | CI 在跑；已合过一次 main（没有 force push）。留下的缺口见 R-12、R-13 |
| #1075（Sessions 清理 SC-1，PG-081） | ③ | 本机相关用例的最后一轮 | CI 9 过、4 在跑 |
| #1076（Shelf S3，路由只由插件声明、删宿主 `/api/shelf`） | Shelf，⑩ 评审 | 本机 84 个选中文件只跑完 68 个（负载 221 时叫停）：11 个失败，其中 4 个已修但修后没重跑（`shelf-project-results-http`、`action-cross-entry` T5、`shelf-owner-files` PG-026-S2-2、`shelf-jelly-cognia-images-error-model`）；6 个原因不明，多半是高负载下超时（`shelf-ai-host`、`images-concurrency`、`images-mcp`、`coding-product-http`、`coding-material-consumption`、`security-invariants-plugin-pages` 的 ECONNRESET）；1 个环境问题（`shelf-material-extraction`，本机 Swift 编译 Vision 帮助程序失败）；16 个没跑（列表在 PR 正文）。另外没跑：`boundary:check`、健康门禁、`page-assets --base`（合 main 后没重建，workbench 的数是推算的）、`test:security`、浏览器用例与截图、`native-checks`（`shelf_http.rs` 改了） | 叠在 #1051 上；`full` 非空（shared-core、assembly、spans-packages、deletes-code，选中 518 个文件），等 #1051 合了进集成批。三个审批项 ① 10-23 已裁决（见 README） |

## 4. 要用户本人做的

- 发版和版本号。
- 真实 Home 的维护（R-04、R-05），包括 SC-5 删 Sessions 数据之前的弹窗。
- ② 的两张会话卡（R-11）。
