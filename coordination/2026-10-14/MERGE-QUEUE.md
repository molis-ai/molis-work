# 防腐线合并清单（给合并 Agent）

> **2026-10-23（洛杉矶）最新分工：** 一骏已指定 Codex 全线统筹承担防腐 PR 合并，并把评审、测试、修复分别派给专职会话。会话入口、职责及第一批派单见 [CODEX-SESSION-ROLES.md](CODEX-SESSION-ROLES.md)。旧的有效技术裁定与评审/验证证据保留；涉及本批 Draft 和执行分工的旧文字以这份最新授权为准。

状态：2026-10-23 起生效。统筹（本机 Claude）维护顺序与就绪条件；合并由用户另派的合并 Agent 做（用户 10-23）。**10-24 起统筹也合、也审**（用户 10-24：PR 积压，统筹协同处理合并与评审）：条件 1～5 满足的，谁先看到谁入队。**10-24 03:40 用户停了合并 Agent，它的活（入队、机械同步、CI 红的修复、起集成批、挪 §3）由 Codex 接**；统筹职责不变。下文的「合并 Agent」都读作 Codex。

读法：

```bash
git fetch origin coordination/handoff-2026-10-14 && git show origin/coordination/handoff-2026-10-14:coordination/2026-10-14/MERGE-QUEUE.md
```

## 1. 一个 PR 可以合的条件（全部满足）

1. CI 的 `Verify` 绿（分支保护只要求它，合并走 GitHub 合并队列：`gh pr merge <n>`，方法由队列定）。
2. 一轮评审（统筹的评审会话 `ac-review`）的评论结论是「可合」；或结论是「修后可合」，且 Codex 在 PR 上写了「二轮：可合」。合并前读一遍 PR 上的评审评论，答复或修完再合。
3. `node scripts/affected-tests.mjs --base origin/main --json` 的 `full` 非空的，要在集成批里过：失败文件和 `known-red-main.md` 的机读清单比，只剩已知红（重试才过的不算失败）。下表「批」一列写了它在哪一批。
4. 改了 `docs/system/SECURITY-INVARIANTS.md` 或 `tests/security-invariants-*` 的，合前人工看「Security invariants」两片作业，红了按挡合并处理（R-24）。
5. 叠放的 PR：下层合入、分支删除后，GitHub 自动改投 main；没改投就手动改，再按 squash 感知的方式合一次 main（做法见 #1100 上 ⑤ 的说明），确认 diff 只剩本 PR 自己的改动。
6. 不 force push，不取消任何 CI run（取消要用户本人同意），不绕分支保护。
7. **一个 PR 同一时间只有一个修复者**（用户 10-23：合并 Agent 也在修评审意见，Codex、作者会话也会修）。动手修评审意见或 CI 红之前，先看 PR 评论里有没有「修复认领」；没有就先留一条「修复认领：<谁>，修第几条 / 哪个红」再改，改完在同一条下写结果和新 head；已有别人认领的那几条不碰，要接手先在 PR 上问认领人或统筹。统筹把 PR 退回给作者会话修时，由统筹在 PR 上替作者留认领。认领超过 2 小时没有推送，统筹可以收回改派。
8. **合并认领**（10-24 起，统筹和合并 Agent 都在合）：入队前在 PR 上留一条「合并认领：<谁>」并写满足了哪几条；已有对方认领的不碰。从队里手动取出时，同时在 PR 上写原因（例如要等别的 PR 先合、批没过），对方据此处理，不再重复入队。
9. **评审分工**（10-24 起）：一轮、二轮除了 `ac-review`，统筹也做；只核挡合并的问题和会留下隐患的问题，细节不列。同步 main 的机械提交（只解冲突、重算生成物）不再要求二轮，统筹或 `ac-review` 用 `git show --remerge-diff` 核一眼即可。

合入以后：在本表把那一行挪到 §3「已合」，写合并提交。`privileges.md`、spec 链接和登记册由统筹改。

## 2. 顺序与现状

「就绪」只在 1～5 条全满足时写「可合」。

| 序 | PR | 内容 | 依赖 | 批 | 现状（统筹最后核对 10-23 18:55 UTC） |
| --- | --- | --- | --- | --- | --- |
| 4 | [#1098](https://github.com/molis-ai/molis-work/pull/1098) | W5-06 第 2b 片：视图声明分组、新建、首页起点、设置图标 | #1087 | 下一批（和 #1107 同批） | 头 `91e096524`；一轮可合；和 #1107、#1112 同一批。**batch-19 试合时 #1107 与 main（SC-4 等）冲突 3 个文件**（`web-goals-read.ts`、`renderer-gap-en.ts`、`baseline.json`），W5-06 链要先由作者合 main（按 #1098→#1107 的顺序），再进下一批 |
| 5 | [#1107](https://github.com/molis-ai/molis-work/pull/1107) | W5-06 第 3 片：项目级 Runtime 实例的舞台 | #1098 | 同 #1098 | 叠在 #1098 上；`ac-review` 一轮：**可合**（[评论](https://github.com/molis-ai/molis-work/pull/1107)） |
| 8 | [#1112](https://github.com/molis-ai/molis-work/pull/1112) | W5-06 余项第一片（草稿） | 排在 #1076、#1099 之后 | 同 #1076 | `ac-review` 一轮：修后可合，2 条交 Codex（[评论](https://github.com/molis-ai/molis-work/pull/1112#issuecomment-6370952389)）；统筹裁定规格板选 (b)、补 RAC-80～84（[裁定](https://github.com/molis-ai/molis-work/pull/1112#issuecomment-6371157480)）；Codex 合 main、重量 page-assets、转 ready |
| 13 | [#1119](https://github.com/molis-ai/molis-work/pull/1119) | BL-395 整片：沙箱项目库语句跑在宿主能杀的子进程里（时间、内存、结果、递归上限；S-59，改 S-46） | **#1117 先合**（S 号连续的门禁要 S-58 在 main 上） | `full` 非空（shared-core、spans-packages，219 文件），进下一批 | 头 `015f74a03b565c7b522b77a5d29a59caf434438d`；专职增量二轮6379124613可合，CI绿但最新main又DIRTY。统筹6379461748询问原作者是否有同步在途，未开第二writer；测试专职只读核已有全量与32项证据 |
| 14 | [#1120](https://github.com/molis-ai/molis-work/pull/1120) | R5：Feed/Functions 入口不再导出 Repository/Store、PG-010 首页规则目标按声明找、两包巨大单元 | — | `full` 非空（shared-core、storage、spans-packages、deletes-code，141 文件），进下一批 | 头 `273104b5703e34cb47aaa31f778153de51d1f15b`；最终评审6379125374、测试侧原集成等价与必要macOS补测、最终CI14项成功均满足门槛。统筹认领6379427181，已执行匹配head的正常入队；实际合入另核 |
| 19 | [#1129](https://github.com/molis-ai/molis-work/pull/1129) | W5-03/04 Todo 片（样板）：客户端打包成 TS、稳定翻译键；`todo.js` 61,976→54,090 B | — | `full` 非空（assembly、deletes-code，102 文件），进下一批 | **已关闭**（10-24，统筹）：同步 main 后树与 main `1dedc1f5c` 相同、0 个文件；Todo 片内容随 #1132 合入，batch-17 已覆盖 |
| 20 | [#1130](https://github.com/molis-ai/molis-work/pull/1130) | SC-4：Sessions 下线（删 Work 包、Session 模块部分、首页「说一句」；PG-081、PG-082 收尾；D6 方案 A 用户 10-23 已确认） | **叠在 #1113 上**，#1113 先合 | `full` 非空（855 文件），进集成批 | 最终头 `fb22b7dc17bbda430f4a447ea8147ad103e84d31`；专职最终增量可合，测试专职核两组红绿及19文件126项有效。新头CI未完；下一集成批因#1157相同两测试被另线认领而暂缓，已协调6379391764，避免重复补丁/换头，不把旧失败批当新头full通过 |
| 24 | [#1126](https://github.com/molis-ai/molis-work/pull/1126) | 评审修复线（合并 Agent 派）：Coding 两条无人认领 P3——#955 首页后台时间界限、#928 英文持有人中文标签 | — | `full` 为空 | 头 `34fb9eb99ddd335fd57aa07a8fe263d2a533916d`；最终CI已14项成功，但main推进后重新DIRTY。修复1已接下一次机械同步，为当前唯一writer；原评审/176项及+873B批准保留，新头再增量核验，暂不入队 |
| 26 | [#1125](https://github.com/molis-ai/molis-work/pull/1125) | 评审修复线（合并 Agent 派）：复审报告剩余风险登记进防腐 spec（#1018 Todo 私路） | — | `full` 为空 | 头 `1f0652e86cc5143d084f29c39473e1bf36496f0c`；文档事实补修后三行diff已通过专职二轮，本机文档检查/真实diff/secrets证据已核、full=[]；等待当前头CI，旧头绿不替代，未入队 |
| 27 | [#1139](https://github.com/molis-ai/molis-work/pull/1139) | PG-017 P0：`sandboxServicesFor` 一张映射；不给的服务一声明就以 `sandbox.service_not_given` 拒绝（项目与 Home 执行器共用）；S-60 一行 | **叠在 #1119 上**；S 号连续要 #1117、#1119 先合；#1134 合入后作者把切片文件改动并进来 | `full` 为空 | 头 `2a6d905c6`（并入切片文件改动）；`ac-review` **二轮：可合**；合前和 #1119 解 `SECURITY-INVARIANTS.md` 冲突；Security invariants 要看 |
| 28 | ~~#1140~~ | SC-4 残留：BL-485/486/488 | 作者已关闭（第三层）；分支 `migrate/sessions-sc4b-runtime-leftovers`（`259a5fc84`）留着，#1113 已合，作者改开 [#1157](https://github.com/molis-ai/molis-work/pull/1157)（叠在 #1130 上，第 39 行） | — | 不在队里 |
| 29 | [#1143](https://github.com/molis-ai/molis-work/pull/1143) | PG-017 P2a：连接经 broker 给沙箱插件 | 叠在 #1139→#1119（第三层）；已按用户要求转为非 Draft，保留 #1119 先合与 #1139 改投 main 的依赖 | 待重算 | 已转非 Draft；先等待下层依赖 |
| 30 | [#1144](https://github.com/molis-ai/molis-work/pull/1144) | PG-017 P2b：不联网的材料读取经 broker 给沙箱 | 叠在 #1143（第四层）；已按用户要求转为非 Draft，仍按层依赖合入 | 待重算 | 统筹转了已按用户要求转为非 Draft；评审要看 RAC-25 旧测试改写没放宽 |
| 33 | [#1147](https://github.com/molis-ai/molis-work/pull/1147) | PG-051 P2b：插件 Agent 定义只由运行中的定义登记，删目录那条、`BUILTIN_PLUGIN_AGENTS` 与 `startAuthority` 回落；创作台改为平台来源；`PluginRegistration` 去三字段 | #1138 已合（10-24），已改投 main | `full` 非空（contracts），和 #1138 同批 | 头 `36f137eaa6a14b272be9465a6f8634624e3bec48`；最终测试改编已审可合6378820054，batch18旧唯一失败已修、原统筹允许不重跑全量；最新main又DIRTY，待#1126 writer释放后串行派机械同步。测试专职先只读核batch18/修后证据 |
| 34 | [#1148](https://github.com/molis-ai/molis-work/pull/1148) | R8 第 2 批（BL-364）：项目里的工作与会话状态 4 条 typed 改登记成只给插件的动作 | **叠在 #1121 上**（第二层），#1121 合入后改投 main | `full` 非空，进下一批 | 头 `2a8eec5d8`（squash 感知同步，只剩自己的 13 个文件）；二轮可合；在 **batch-1024-19**（统筹起，10-24 03:35，run [40054696653](https://github.com/molis-ai/molis-work/actions/runs/40054696653)：main `aa4de404f` + #1157 `782af05ed`（含 #1130 `f7fb96ed6`）+ #1148 `2a8eec5d8`）；绿后入队 |
| 35 | [#1150](https://github.com/molis-ai/molis-work/pull/1150) | Codex：Shelf S3 合后 P2——桌面四个收集入口提示「原件登记部分成功」（PG-026-S1-S3-1～5） | #1076 已合 | `full` 为空 | 头 `31a7bbbf57861995037855cd90c8f05c5471174d`；增量评审、测试侧证据及最终头CI均通过（run40054783327，14成功）；full=[]。统筹[合并认领6379342328](https://github.com/molis-ai/molis-work/pull/1150#issuecomment-6379342328)，已正常入队，20:33洛杉矶 position3/AWAITING_CHECKS，尚未合入 |
| 29 | [#1141](https://github.com/molis-ai/molis-work/pull/1141) | 评审修复线（合并 Agent 派）：#902 Home 待办批量「移到」菜单补 menu 语义与单一 Tab 停点（只改 todo 插件 UI + 新 e2e） | — | `full` 为空 | 头 `034056a26efd65438f2023c2ff2705b1000f98b5`；专职一轮6379274929可合，测试证据/full=[]已核；最终CI run40056614086全部14项成功。统筹认领6379452498并正常匹配head入队，队列position3/QUEUED；实际合入另核。保留todo-from-inbox重试flake，不冒称全部首过 |
| 最后 | [#784](https://github.com/molis-ai/molis-work/pull/784) | Codex 的 QA 与验收记录（文档） | 全部代码 PR | — | 已按用户要求转为非 Draft；收尾时合 main |

新开的开发片 PR 由统筹按依赖插进本表。

## 3. 已合

| PR | 合并提交 | 日期 |
| --- | --- | --- |
| #1096 | `01a875af0` | 10-23 |
| #1099 | `5248af758` | 10-23 17:27 UTC |
| #1100 | `07a309317` | 10-23 |
| #1093 | `8b8ee3131` | 10-23 |
| #1087 | `327c7c201` | 10-23 18:17 UTC |
| #1084 | `3f715261f` | 10-23 18:19 UTC |
| #1115 | `acc71ae473` | 10-23 18:39 UTC |
| #1122 | `c68071cdc` | 10-23 19:46 UTC |
| #1124 | `e8e79e53e` | 10-23 20:07 UTC |
| #1076 | `38111ce61` | 10-23 20:30 UTC |
| #1118 | `f8d1e5ba9` | 10-23 20:40 UTC |
| #1136 | `15b656648` | 10-23 21:33 UTC |
| #1113 | `587a5ea58` | 10-23 21:34 UTC |
| #1123 | `b3f2f4b18` | 10-23 21:35 UTC |
| #1133 | `7ab72c3af` | 10-23 21:42 UTC |
| #1134 | `27bb3c212` | 10-23 21:42 UTC |
| #1149 | `afaa4fea3` | 10-23 22:58 UTC |
| #1131 | `abc052bcb` | 10-23 23:09 UTC |
| #1138 | `7b1819e44` | 10-24 00:20 UTC |
| #1152 | `53a8c464c` | 10-24 00:42 UTC |
| #1083 | `b30325bd5` | 10-24 01:08 UTC |
| #1121 | `aa4de404f` | 10-24 02:19 UTC（统筹二轮确认 final head 后，合并 Agent 入队） |
| #1117 | `acb8941b0` | 10-24 01:08 UTC |
| #1145 | `b1ab81518` | 10-24 01:27 UTC |
| #1146 | `fea1eb0ba` | 10-24 01:34 UTC |
| #1132 | `1dedc1f5c` | 10-24 01:42 UTC |
| #1158 | `8f3fa138c` | 10-24 02:44 UTC（统筹入队） |
| #1156 | `dd7df26e4` | 10-24 02:46 UTC（统筹入队） |
| #1137 | `4e5f91a19` | 10-24 02:48 UTC |
| #1142 | `1cc9cfee7` | 10-24 02:48 UTC（统筹入队） |
| #1116 | `585b15979` | 10-24 03:02 UTC（统筹入队；产品运营事实基线，非防腐线） |
| #1127 | `c0b48111b` | 10-24 03:33 UTC（Codex 入队） |
| #1159 | `f4df5b471` | 10-24 03:33 UTC（统筹入队；BL-540～542） |
| #1128 | `d7bf2b6690c3b8d247a11dae94729d14b7828c4b` | 10-24 03:41 UTC（Codex 已核 GitHub 实际合并） |
| #1151 | `ee2958d2acef18006eddc14ff0761a3fd3a39e99` | 10-24 03:42 UTC（Codex 已核实际合并；仅 C1 server+CLI 首片） |

| 39 | [#1157](https://github.com/molis-ai/molis-work/pull/1157) | `ac-sc3` SC-4b：清 SC-4 三项残留（BL-485 Codex 会话适配器、BL-486 `session_id`、BL-488 依赖） | **叠在 #1130 上**（第二层），#1130 合入后改投 main | `full` 非空（shared-core），进下一批 | 头 `782af05ed`；二轮可合；在 **batch-1024-19**（统筹起，10-24 03:35，run [40054696653](https://github.com/molis-ai/molis-work/actions/runs/40054696653)：main `aa4de404f` + #1157 `782af05ed`（含 #1130 `f7fb96ed6`）+ #1148 `2a8eec5d8`）；#1130 合入、改投 main 后合 |

2026-10-23 20:24 洛杉矶，Codex 测试专职核 batch-1024-19（固定头 `ee4418881264683b357e3ee743ee48c006aa33c7`）：分片7的 `web-home-isolation.test.ts` 与分片5的 `home-offers.e2e.test.ts` 均重复失败。两项分别依赖已退役的 Sessions 新建与首页 Talk 入口，均归 #1130 的 RAC-212/214，已由同一修复1处理；不是已知 main 红，不能把旧批写成通过。保留其余作业继续运行、不取消，最终修复头与后续集成另核。

2026-10-23 20:36 洛杉矶：下一集成批预检版本原为 main `585b15979` + #1130 `fb22b7dc1` + #1157 `782af05ed` + #1148 `2a8eec5d8`。SC-4 spec 两处第4节追加应同时保留；#1157 的 ci-failure-owner 又认领同两测试，统筹已在[6379391764](https://github.com/molis-ai/molis-work/pull/1157#issuecomment-6379391764)说明下层#1130已完成并独立复核，要求确认沿用及当前精确头。新集成暂不启动、不取消旧批，避免重复补丁与验证错误版本；后续启动前须重取最新main/候选和其他批认领。
