# main 已知红名单

**维护人（统筹 10-27 定）：合批会话。** 它组批、跑全量，最先看到红；每跑完一次全量就更新本文件，并在 `LINES.md` 记一行。合批会话开出来之前，由统筹在收到全量结果时更新。下面「⑤ 维护」那一段是 10-24 的交接记录，保留不改。

⑤ 维护。每跑完一个集成批次就更新一次，不另行通知。最后更新：2026-10-24 01:16（东京）：**⑤ 收尾交接**。用户决定把防腐线交给 yijunw0212，⑤ 从这一刻起不再组批、不再合 PR，也不再更新这份文件，之后谁维护由 ① 定。交接时的状态：#1071 已合入 main → `2fa107bae`，删掉 `coding-change-html` 一行；#1103（R-26 的测试收严）在合并队列里自己走；[batch-1023-11 run 39982678940](https://github.com/molis-ai/molis-work/actions/runs/39982678940)（#1096 + #1093）01:15 时 4 片绿、9 片在跑、3 片排队，⑤ 不再盯，跑完由接手人把失败文件和下面的机读清单比。每个在途 PR 的卡点和下一步写在各 PR 的 ⑤ 交接评论里。2026-10-24 00:58：[batch-1023-10 run 39972250383](https://github.com/molis-ai/molis-work/actions/runs/39972250383) 跑完（`5013b77b6`：main `cdb47255d` + #1099 `af455c18e` + #1100 `babb48e55` + #1085 `d21a082c5` + #1087 `a14b95cbd`），16 片全绿，最终 0 个失败文件：R-25 的两份转绿（`write-checkers-settings.e2e` 3/3、`project-settings-navigation.e2e` 4/4，含 R-26 的 `:138`），`workbench-deferred-clients.e2e` 这批通过；重试才过 4 份，记进「偶发」。按顺序合 #1099 → #1100 → #1087：#1099 现在和 main 在 `page-assets.json` 相邻行冲突，又和 #1076 都动 workbench.js 的字节，先让 #1076 合入，再给 #1099 合 main、按实测写数。这段时间合入 main 的：#1085 → `288eb424c`、#1081 → `e0fe39027`、#1080 → `15a46ad56`。Codex 的三个修复已合进作者分支：#1104 → #1096（`5cf8033ce`）、#1105 → #1093（`d343b5cf5`）、#1106 → #1084（`fed6efec9`）。[batch-1023-11 run 39982678940](https://github.com/molis-ai/molis-work/actions/runs/39982678940) 已推：`b03c3da70` = main `15a46ad56` + #1096 `5cf8033ce` + #1093 `d343b5cf5`。2026-10-23 23:45：batch-1023-9 跑完，最终红 3 份：`workbench-deferred-clients.e2e` 是间歇红；`health-gates-api-snapshot`（#1096）、`goal-event-http`（#1093）记进「在途 PR 自带的红」，已在两个 PR 上留言、报 ①，两个 PR 修好前不排队。VUX-36（R-22，第一个含 `df7a3bdba` 的 Linux 批次）、`issue-capture-page.e2e`（R-23）这一批都过了，从间歇红删掉。batch-1023-10 已推（run 39972250383，`5013b77b6`：main `cdb47255d` + #1099 + #1100 + #1085 + #1087）；#1085 在合并队列。23:40（之前标的 23:55、23:40 两条时刻记晚了，实际都在这条之前）：#1079（`6d0f46b39`，S-56 的探针已由 #1094 修好）、#1097（`dd9ac5b6f`）、#1051（`cdb47255d`）已合入，`security-invariants-plugin-interaction` 一行删掉；#1076 已同步到 main（`f2ac4be6d`），等 CI。23:55：① 裁定 ② 的 #1100（R-25 同类三处，叠在 #1099 上）也进 batch-1023-10，这一批改为 main `d281cd207` + #1099（`af455c18e`）+ #1100（`babb48e55`）+ #1085（`d21a082c5`）+ #1087（`a14b95cbd`），已在本地组好，等 batch-1023-9 跑完再推；转绿后按 #1099 → #1100 → #1085 → #1087 → #1098 合。23:40：② 的 R-25 修复是 #1099（base main，① 已批），⑤ 已评审可合，等 batch-1023-9 跑完后与 #1087 组 batch-1023-10；同事的 #1090 已合入 main（`d281cd207`）。23:25：R-26（`project-settings-navigation.e2e:138`）记进「偶发」；Codex 的 #1097（R-19 的失败诊断）已评审，在排队。23:15：Codex 的 #1095（R-23 的 ISSUE-38/37 准备条件）已合入（`683fa5db5`）；`issue-capture-page.e2e` 留在「间歇红」，等一个批次转绿再删。23:10：R-25 定位到了（① 核定）：是 main 上的旧判断，被 #1087 暴露出来；两行改记在 #1087 名下，修复由 ② 从 main 开。23:00：#1075 已合入（`c815a6bd0`），`goals-mcp-actions`、`session-workspace` 两行删掉；batch-1023-8 的两个新红按 ① 记成 R-25（待 Codex 归属，合并不等它），R-25 的二分点（② 给的）贴在 #1087 的评论里给 Codex。[batch-1023-9 run 39964995417](https://github.com/molis-ai/molis-work/actions/runs/39964995417) 在跑：基底 main `c815a6bd0`，加 #1096（`4898e94ff`）、#1093（`5f4675143`）；这是第一个含 `df7a3bdba` 的 Linux 批次，看 VUX-36 转不转绿（R-22）。22:50：batch-1023-8（run 39953440918，基底 `1ded3c218`）跑完：#1041 那 4 份都过了，从已知红删掉，现在 main 没有已知红；新红 2 份（`write-checkers-settings.e2e`、`project-settings-navigation.e2e`，项目设置页的确认框按 Esc 关不掉），记进「在途 PR 自带的红」，带进来的 PR 待定，已报 ①；#1092 已合入（`15fc5d9ac`）。22:20：Codex 的 #1089 已合入 main（`62f76db72`），按 ① 的约定把 `coding-rich-html` 从已知红删掉；#1078 也已合入（`d7077301f`）。22:05：按 ① 的 R-22 约定，VUX-36 放回「间歇红」，等第一个含 #1086 的 Linux 批次（batch-1023-9 起）转绿再删；#1095（Codex，R-23 的 ISSUE-38/37 准备条件）已评审、等 CI。21:45：#1086 已合入（`df7a3bdba`）；Codex 的夹具修复 #1094 合进 #1079 的分支（`9acec8db2`，S-56）、#1091 合进 #1071 的分支（`4c2e5e716`，`coding-change-html`）。21:35：[batch-1023-7 run 39939445962](https://github.com/molis-ai/molis-work/actions/runs/39939445962) 最终失败只有 #1041 的 4 份（片 9/11/12，重试也红），#1051、#1076 没带进新的红；VUX-36、`code-scale.e2e`、`visual-review-consumers.e2e` 重试通过。#1068 → `01fe85340`、#1074 → `ef553a7b3` 已合。#1088 合进 #1075 的分支（`7a9d9e9cd`），`goals-mcp-actions`、`session-workspace` 在那里修掉。#1079 的 S-56 由 ① 裁定为测试缺陷（探针没有按 `refOf` 取引用）。[batch-1023-8 run 39953440918](https://github.com/molis-ai/molis-work/actions/runs/39953440918) 在跑：基底 main `1ded3c218`，加 #1079、#1081、#1080、#1084、#1085、#1087。21:30：#1082 已合入（`1ded3c218`），#1041 那 4 份等下一个批次过了再删；#1079 自带的 S-56 红记进「在途 PR 自带的红」。21:20：VUX-36 的修复是同事的 #1086（自动合并已开），合入后从「间歇红」删掉；按 ① 转来的 Codex 全量结果，补 `issue-capture-page.e2e`（R-23）进「间歇红」、`session-workspace` 进 #1075 的在途红。21:10：#1067 已合入 main（`f9321d257`），`coding-rich-html` 从「在途 PR 自带的红」挪进「当前已知红」。此前 20:30（东京）。最新依据是 [batch-1023-6 run 39935819703](https://github.com/molis-ai/molis-work/actions/runs/39935819703)：基底 main `a259350ac`，加 #1074（`0d32cff50`）、#1075（`917ff927b`）、#1071（`21faaf1ef`，叠在 #1067 上）。最终失败 8 个文件，重试也红：#1041 的 4 份照旧（见「当前已知红」）；3 份是批次里的 PR 自己带进来的，都已由 Codex 认领（见「在途 PR 自带的红」），不算 main 的红；1 份是 VUX-36（`assistant-repeat-no-accumulation.e2e`），批次里没有相关的 PR，记进「间歇红」。再往前是 [batch-1023-5 run 39933946226](https://github.com/molis-ai/molis-work/actions/runs/39933946226)：基底 main `a259350ac`，加 #1051（`3e7d4e6b3`）。最终失败 4 个文件，重试也红；#1051 没有碰这 4 份文件，它们都是 #1041（`a259350ac`）带进 main 的，见下面「当前已知红」，修复在 #1082。再往前，另有 [batch-1023-4 run 39921899175](https://github.com/molis-ai/molis-work/actions/runs/39921899175)：基底 `91c24d8f5`，加 #1048、#1063、#1066、#1068（`c131c79f7`）。最终失败只有 `workspace-read-one-id`，原因是 #1068 新加的订阅要 `workspace:read`、用例还原旧 Manifest 时没去掉，修复 `571b4e807` 已推到 #1068，不算 main 的红。依据是 [batch-1023-3 run 39920178443](https://github.com/molis-ai/molis-work/actions/runs/39920178443)：基底 main `91c24d8f5`，加 #1049（`1b08e686a`）、#1065（`65ccae063`）。第一次跑只有第 4 片红（`workbench-deferred-clients.e2e`，片内重试也红），重跑这一片后 83 个文件全过，整批绿。两个 PR 都已合入：#1049 → `603c755e9`（由 yijunw0212 账号经合并队列合入，多带两个文档提交），#1065 → `f8c9b4246`。再往前是 [batch-1023-2 run 39910907540](https://github.com/molis-ai/molis-work/actions/runs/39910907540)（基底 `0a714d688`，加 #1050、#1048；#1048 自己带进来的 4 个失败文件已在其分支修掉，#1048 → `a6be8a449`）和 [batch-1023-1 run 39871002072](https://github.com/molis-ai/molis-work/actions/runs/39871002072)。另外参照了 ⑩ 的对照表 `side-session-notes/…/10-known-red-mapping-2026-10-23.md`，即 Codex 第四轮 [run 39862775962](https://github.com/molis-ai/molis-work/actions/runs/39862775962)。

怎么用：批次或 PR 的全量跑完后，把失败文件列成一行一个（`tests/x.test.ts`），再和文末的「机读清单」比：`grep -vxFf known-red.txt fails.txt` 列出来的就是新红。重试才过的文件不算失败。

原因类别只用四种：断言过期、产品回归、测试缺陷、环境与时序。

2026-10-23 20:40 UTC：batch-1023-13（run40013259093，6cff3977e）16片1341/1341文件最终通过；3份重试通过记入偶发。Linux跳过的macOS C0仍未验证，保留当前已知红。

## 当前已知红（0 个文件）

2026-10-25 20:20 UTC：batch-39 全量 40227692337（carrier `8cf538f28`，含 main `fc1e03c3c`）16 片 14 绿；两个红文件都是 main 自己的红，由 #1304 的 BL-305（`f59f0e4fa`）带进来、#1304 没跑全量（R-57）。修复在 batch-39 `9652a4dcc`、`9b47fadc5`；#1307 已合入 main `b3bac731b`（10-25 20:40 UTC），两行已删。`code-scale.e2e` 首轮红、重跑过，原因 UNKNOWN（未查原件，不定性为计时）；batch-38 首轮红的 `cognia-actions.e2e`、`interaction-no-crosstalk.e2e` 这次首轮过。Linux probe 的覆盖缺口见 RISKS R-58。

| 文件 | 带进来的 PR | 原因类别 | 谁修 | 依据 |
| --- | --- | --- | --- | --- |

10-24 07:5x UTC：`tests/home-side-surfaces.e2e.test.ts` 由 #1174（main `4e17c3d1b`）修好，删行；以后的批里再红就按新失败查。

10-24：`tests/issue-home-locale.e2e.test.ts` 由 #1171（`d28794061`）修好，batch-1024-23 里已通过，删行。

| 文件 | 带进来的 PR | 原因类别 | 谁修 | 依据 |
| --- | --- | --- | --- | --- |


2026-10-23：[C0修复 #1136](https://github.com/molis-ai/molis-work/pull/1136) 已于21:33:38 UTC合入 main `15b6566486282aef7fa4543251f6555bcf139510`，Codex现场核对GitHub合并状态及main历史；按统筹CODEX-TASKS的已完成裁定移除两条macOS已知红及机读项。创建/G1/G2现共用完整SDK声明集合，解决checks与workflow的W2-18-BUILDER-LATE-01同一声明依赖缺失。作者报告macOS checks17/17、workflow42/42；Codex核过实际diff与全部CI，未独立读取作者本机原始日志，不把Linux跳过说成macOS实测。

#1041 那 4 份（`host-pages-error-model`、`fill-message`、`personal-plugins-review-fixes`、`plugin-project-database`）在 batch-1023-8（基底含 #1082 `1ded3c218`）都过了，22:50 删行。`coding-rich-html` 已由 #1089（`62f76db72`）修好，22:20 删行。

## 在途 PR 自带的红（不算 main 的红；按登记册 §0 由 Codex 修）

10-23 20:10 UTC 统筹删四行：R-25 的 `write-checkers-settings.e2e`、`project-settings-navigation.e2e`（修复 #1099、#1100 已合，#1087 已合 `327c7c201`；batch-1023-12 全绿）；`health-gates-api-snapshot`（#1096 带 #1104 的修复合入 `01a875af0`）；`goal-event-http`（#1093 带 #1105 的修复合入 `8b8ee3131`）。之后这份名单由 Codex 维护（登记册 §2.0 R-07）。

| 文件 | 带进来的 PR | 原因类别 | 谁修 | 依据 |
| --- | --- | --- | --- | --- |

#1071 已于 2026-10-24 01:10 合入 main（`2fa107bae`），`coding-change-html` 已删行。#1084 带着 #1071（#1067 已在 main），所以 batch-1023-8 预计也会红这几份，另加 #1084 自己的 `coding-interaction-html`（Codex 认领）。`coding-interaction-html` 已由 Codex 的 #1106（夹具补 `openProjectVersionStores`）修好，合进 `feat/pg062-s4b-coding-interaction`（`fed6efec9`）；#1084 合入后从机读清单删掉。

此前（batch-1023-4 之前）没有已知红。`code-scale.e2e` 在 batch-1023-2（重试通过）和 batch-1023-3（5/5）连续两批通过，按规则删掉。Codex 在 #1049 自己的完整回归里还见过它的两条着色帧耗时超 50 ms（84.0/100.4 ms），记在 BL-412，再红就按那一条查。

## 间歇红（最终失败过，但查明与所在批次无关）

| 文件 | 失败的用例 | 原因类别 | 依据 | 出现 |
| --- | --- | --- | --- | --- |
| `busy-feedback.e2e` | 「VUX-31: switching the Goal in the work view keeps the old document until the wait passes」：切换 Goal 后等待标记先出来、旧文档被隐藏（`mark: 1, opacity: 0`，期望 `mark: 0, opacity: 1`），重试也红 | 待查（统筹 10-28 记；归 `ac-lifecycle`，BL-806） | 两个不相干的 carrier 都重试后仍红：`integration/memory-p0-application-20261025`（run 40515916043，10-27）；`integration/carrier-1028-w511`（run 40538077218，#1322 只改 OAuth 合同与 SDK，不碰工作台）。同期 `integration/carrier-1028-1326`（run 40538409916）第 7 片过了，所以是时有时无。不挡合并 | 10-27、10-28 |
| `workbench-deferred-clients.e2e` | 2/3 通过。「registered clients mount on demand, retry resources and retain their original surfaces」：`Error: CDP timeout: Network.setBlockedURLs`（`:50`，测试端 CDP 命令 20 秒超时） | 环境与时序（待查） | 超时出在第一条 `Network.setBlockedURLs`，早于用例碰到伴随面板，#1049 的改动（删宿主的伙伴面板装饰）不在这条路径上；同一 run 片内重试也红，重跑这一片 3/3 通过。BL-412 已把它列为重试才过的三份文件之一，根因未定 | batch-1023-3 第一次跑；batch-1023-1、batch-1023-2 都通过；batch-1023-4 第一次 2/3、重试通过；batch-1023-9 最终红；batch-1023-10 通过。BL-412 修掉就删 |

## batch-1024-22/23 的判定（10-24 06:10 UTC）

- `tests/home-side-surfaces.e2e.test.ts` 在 batch-23（基底 `8aa62a65b` + #1171 + #1167）同样失败，同一断言：**进「当前已知红」**（见上表）。
- `tests/work-placement-journeys.e2e.test.ts` 在 batch-23 没红；`ac-sc3` 在 batch-22 批头 `e76380003` 与基线 `89c9a7194` 各单跑 3 次全过（删除那条动线 10.5–12.6 秒，两边一样），判**环境与时序**（负载）：留在偶发名单，batch-22 这次记一次「重试也失败」，不算 #1164 的红。

## 偶发（重试才过，不算红；记下来，看会不会变成稳定失败）

规则（① 10-23）：这里的文件以后再红一次（最终失败），就写进 `tests/quarantine.json`，带 owner 和到期日（最多 30 天、最多 10 条），不从清单里删行。

- `project-settings-navigation.e2e:138`（R-26，① 10-23 登记，登记册 `117ec154e`）：Codex 的 R-25 二分里红过一次。删除项目后读设置页，应该是 404，拿到 500，日志里有 `SQLITE_CANTOPEN`；另外两轮都过。Codex 在 main 上多跑几轮归因；⑤ 在 batch-1023-10（必看）和 batch-1023-9 里看这份文件有没有在 `:138` 红。和 R-25 的 `:83` 不是一处。batch-1023-9、batch-1023-10 都是第一次就过（4/4）。测试一半由 Codex 的 #1103 收严（在合并队列里），产品窗口照旧延后。
- `page-interaction-flow.e2e`：batch-1023-6 重试才过（第一次 1/2）；batch-1023-13第一次1/2，灵光展开断言失败，重试通过。
- `work-placement-journeys.e2e`：batch-1023-6、batch-1023-8 都是重试才过（第一次都是 2/3）。#1065 修过一次 `title()` 的等待，这次是另一处还是同一处没查。
- `cross-plugin-recovery.e2e`：batch-1023-10 重试才过（第一次 2/3）。
- `cognia-actions.e2e`：batch-1023-10 重试才过（第一次 3/4）。
- `resident-management-actions`：batch-1023-10 重试才过（第一次 3/4）。不是浏览器用例。
- `code-scale.e2e`：batch-1023-6、batch-1023-7、batch-1023-10 都是重试才过（batch-1023-10 第一次 4/5；batch-1023-6 第一次 3/5，「SYS-49/VUX-33: a large block reads at once and is coloured a slice a frame」）。按 BL-412 查。
- `visual-review-consumers.e2e`：batch-1023-7 重试才过。
- `busy-feedback.e2e`：batch-1023-4 重试才过（第一次 1/2）。
- `product-experience-polish.e2e`：batch-1023-3 重试才过（第一次 2/3）；batch-1023-13第一次2/3，搜索框打开等待超时，重试通过。
- `work-placement.e2e`：batch-1023-13第一次1/2，390px场景CDP目标导航或关闭，重试通过；与work-placement-journeys是不同文件。
- `work-placement-plugins.e2e`：batch-1023-3 重试才过（第一次 0/1）。
- `scroll-follow.e2e`：batch-1023-3、batch-1023-9 都是重试才过（第一次都是 0/1）。
- `project-home-start.e2e`：batch-1023-1 重试才过；batch-1023-2、batch-1023-3 通过。
- `interaction-no-crosstalk.e2e`：batch-1023-2、batch-1023-8 都是重试才过（batch-1023-8 第一次 3/4，AC-05）；batch-1023-3 通过。
- `touch-targets.e2e`：batch-1023-2 重试才过（第一次 3/4）；batch-1023-3 通过。
- `composer-steady.e2e`：batch-1022-7 和 Codex 第四轮都是重试才过。VUX-16：讨论框旁的状态变长时，发送键的位置变了。
- `context-card-in-work.e2e`：Codex 第四轮重试才过。
- `ui-client-lifecycle.e2e`：batch-1022-7 重试才过。
- `coding-input-receipts.e2e` 的 `:99`（模式菜单那一段）：batch-1021-7 第一次红在这一行，重试通过，原因没查。BL-410 管的 `:78` 在 batch-1023-3、batch-1023-4 都是第一次就过，按它的删除条件在 #1077 删行；`:99` 转记在这里，再出现就单独开 BL 查。

## batch-1023-3 确认已修，已从名单删掉

- `#1065`（`f8c9b4246`）：`work-placement-journeys.e2e`，`title()` 先等可见的标题框，3/3 通过。
- `code-scale.e2e`：连续两批通过（见上）。

## batch-1023-2 确认已修，已从名单删掉

- `#1045`（`9483928a8`）：`hover-actions.e2e`，基底含修复，2/2 通过。

## batch-1023-1 确认已修，已从名单删掉（修它的 PR 见 ⑩ 的对照表）

- `#1031`（`c75143750`）：`cognia-store`、`content-owner-regressions`、`shelf-jelly-cognia-images-error-model`、`companion-client-lifecycle.e2e`、`model-vision.e2e`、`plugin-tab-groups.e2e`、`workbench-current-tabs.e2e`
- `#1036`（`a16104c08`）：`context-pick-result.e2e`、`goals-planning.e2e`
- `#1027`（`0964ea25b`）：`desktop-tui`、`personal-plugins-review-fixes`
- `#1040`、`#1039`：`chinese-layers.e2e`
- `#1010`：`code-diff-scale.e2e`；`#1042`：`has-anchors.e2e`
- `#1033`：`coding-taskboard.e2e`；`#1037`：`cognia-actions.e2e`；`#1034`：`document-plugins-error-model`
- 推断是 `#1038`：`attention-journey.e2e`
- 没有查到是哪个 PR：`workbench-deferred-clients.e2e`（这一批与 Codex 第四轮都通过）

旧名单上 batch-1022-7 已经不红的 18 个文件，这一批仍然没有失败，也删掉了。

## 机读清单（当前已知红 + 间歇红）

```
tests/workbench-deferred-clients.e2e.test.ts
```

在途 PR 自带、已认领的：当前无。`coding-interaction-html` 的修复已随 #1084 于10-23合入 `3f715261f`，从这份旧机读项删除；历史证据保留在上文。

## 依据的 run

- [batch-1021-3](https://github.com/molis-ai/molis-work/actions/runs/39500500710)：0 个失败文件
- [batch-1021-4](https://github.com/molis-ai/molis-work/actions/runs/39513392083)：0 个失败文件
- [batch-1021-5](https://github.com/molis-ai/molis-work/actions/runs/39546974778)：7 个失败文件
- [main 10-21 05:28](https://github.com/molis-ai/molis-work/actions/runs/39549753102)：1 个失败文件
- [batch-1021-6](https://github.com/molis-ai/molis-work/actions/runs/39550428213)：8 个失败文件
- [batch-1021-7](https://github.com/molis-ai/molis-work/actions/runs/39556045283)：11 个失败文件
- [batch-1021-8](https://github.com/molis-ai/molis-work/actions/runs/39572019456)：14 个失败文件
- [batch-1021-9](https://github.com/molis-ai/molis-work/actions/runs/39582799104)：16 个失败文件
- [batch-1021-10](https://github.com/molis-ai/molis-work/actions/runs/39602341656)：17 个失败文件
- [main 10-21 13:23](https://github.com/molis-ai/molis-work/actions/runs/39607566082)：1 个失败文件
- [batch-1021-11](https://github.com/molis-ai/molis-work/actions/runs/39611329361)：18 个失败文件
- [batch-1021-12](https://github.com/molis-ai/molis-work/actions/runs/39613984388)：20 个失败文件
- [batch-1021-13](https://github.com/molis-ai/molis-work/actions/runs/39627462365)：19 个失败文件
- [main 10-21 20:26](https://github.com/molis-ai/molis-work/actions/runs/39670309365)：1 个失败文件
- [batch-1022-1](https://github.com/molis-ai/molis-work/actions/runs/39721556508)：27 个失败文件
- [batch-1022-2](https://github.com/molis-ai/molis-work/actions/runs/39734787252)：26 个失败文件
- [batch-1022-3](https://github.com/molis-ai/molis-work/actions/runs/39735993622)：25 个失败文件
- [batch-1022-4](https://github.com/molis-ai/molis-work/actions/runs/39758717406)：24 个失败文件
- [batch-1022-5](https://github.com/molis-ai/molis-work/actions/runs/39776679533)：23 个失败文件
- [batch-1022-6](https://github.com/molis-ai/molis-work/actions/runs/39783929583)：21 个失败文件
- [batch-1022-7](https://github.com/molis-ai/molis-work/actions/runs/39803949919)：21 个失败文件
- [batch-1023-1](https://github.com/molis-ai/molis-work/actions/runs/39871002072)：3 个失败文件
- [batch-1023-2](https://github.com/molis-ai/molis-work/actions/runs/39910907540)：4 个失败文件，都是 #1048 自己带进来的（已在其分支修掉）；main 的已知红 0 个最终失败
- [batch-1023-3](https://github.com/molis-ai/molis-work/actions/runs/39920178443)：第一次 1 个失败文件（`workbench-deferred-clients.e2e`，间歇红），重跑该片后 0 个
- [batch-1023-4](https://github.com/molis-ai/molis-work/actions/runs/39921899175)：1 个失败文件（`workspace-read-one-id`，#1068 自己带进来的，已在其分支修掉）；main 的已知红 0 个最终失败
- [batch-1023-5](https://github.com/molis-ai/molis-work/actions/runs/39933946226)：4 个失败文件，都是 main 上 #1041 的（修复 #1082）；#1051 没有带进新的红
- [batch-1023-6](https://github.com/molis-ai/molis-work/actions/runs/39935819703)：8 个失败文件：#1041 的 4 个；#1067、#1071、#1075 各自带进来的 3 个（Codex 认领）；VUX-36 1 个（间歇红，待查）
- [batch-1023-7](https://github.com/molis-ai/molis-work/actions/runs/39939445962)：4 个失败文件，都是 #1041 的（#1082 合入前的基底）；#1051、#1076 没有带进新的红；VUX-36、`code-scale.e2e`、`visual-review-consumers.e2e` 重试通过
- [batch-1023-8](https://github.com/molis-ai/molis-work/actions/runs/39953440918)：4 个失败文件（`coding-rich-html`、`coding-change-html` 预料内；`write-checkers-settings.e2e`、`project-settings-navigation.e2e` 新红）；重试才过 2 个（`interaction-no-crosstalk.e2e`、`work-placement-journeys.e2e`）
- [batch-1023-9](https://github.com/molis-ai/molis-work/actions/runs/39964995417)：基底 main `c815a6bd0`，加 #1096、#1093。3 个失败文件：`workbench-deferred-clients.e2e`（间歇红）；#1096 带进来的 `health-gates-api-snapshot`、#1093 带进来的 `goal-event-http`。VUX-36、`issue-capture-page.e2e` 通过，从间歇红删掉；`scroll-follow.e2e` 重试才过
- [batch-1024-20](https://github.com/molis-ai/molis-work/actions/runs/40061024962)：基底 main `04435950a`，加 #1148、#1119、#1139。1 个失败文件：`issue-home-locale.e2e`（main 上 #1127 的已知红）；三个 PR 没有带进新的红
- [batch-1023-10](https://github.com/molis-ai/molis-work/actions/runs/39972250383)：基底 main `cdb47255d`，加 #1099、#1100、#1085、#1087。0 个失败文件，R-25 两份转绿；重试才过 4 个（`code-scale.e2e`、`cross-plugin-recovery.e2e`、`cognia-actions.e2e`、`resident-management-actions`）
