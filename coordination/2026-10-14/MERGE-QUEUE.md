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
| 13 | [#1119](https://github.com/molis-ai/molis-work/pull/1119) | BL-395 整片：沙箱项目库语句跑在宿主能杀的子进程里（时间、内存、结果、递归上限；S-59，改 S-46） | **#1117 先合**（S 号连续的门禁要 S-58 在 main 上） | `full` 非空（shared-core、spans-packages，219 文件），进下一批 | 头 `a699e421c`；子进程已补齐、BL-480 已删；`ac-review` 排队审；改了安全不变量，合前看 Security invariants |
| 14 | [#1120](https://github.com/molis-ai/molis-work/pull/1120) | R5：Feed/Functions 入口不再导出 Repository/Store、PG-010 首页规则目标按声明找、两包巨大单元 | — | `full` 非空（shared-core、storage、spans-packages、deletes-code，141 文件），进下一批 | 头 `9ebc262d6`；`ac-review` **二轮：可合**（[评论](https://github.com/molis-ai/molis-work/pull/1120#issuecomment-6378687795)）；batch-16 绿；又对 main 冲突，[请合并 Agent 机械同步](https://github.com/molis-ai/molis-work/pull/1120#issuecomment-6378710660)后入队 |
| 19 | [#1129](https://github.com/molis-ai/molis-work/pull/1129) | W5-03/04 Todo 片（样板）：客户端打包成 TS、稳定翻译键；`todo.js` 61,976→54,090 B | — | `full` 非空（assembly、deletes-code，102 文件），进下一批 | **已关闭**（10-24，统筹）：同步 main 后树与 main `1dedc1f5c` 相同、0 个文件；Todo 片内容随 #1132 合入，batch-17 已覆盖 |
| 20 | [#1130](https://github.com/molis-ai/molis-work/pull/1130) | SC-4：Sessions 下线（删 Work 包、Session 模块部分、首页「说一句」；PG-081、PG-082 收尾；D6 方案 A 用户 10-23 已确认） | **叠在 #1113 上**，#1113 先合 | `full` 非空（855 文件），进集成批 | 头 `f7fb96ed6`；`ac-review` 合 main 后仍可合（[评论](https://github.com/molis-ai/molis-work/pull/1130#issuecomment-6378746824)）；在 **batch-1024-19**（统筹起，10-24 03:35，run [40054696653](https://github.com/molis-ai/molis-work/actions/runs/40054696653)：main `aa4de404f` + #1157 `782af05ed`（含 #1130 `f7fb96ed6`）+ #1148 `2a8eec5d8`）；绿后先合 #1130，再按第 5 条合 #1157 |
| 24 | [#1126](https://github.com/molis-ai/molis-work/pull/1126) | 评审修复线（合并 Agent 派）：Coding 两条无人认领 P3——#955 首页后台时间界限、#928 英文持有人中文标签 | — | `full` 为空 | 头 `bcbc30c2e`；统筹一轮**可合**，0 条挡合并（[评论](https://github.com/molis-ai/molis-work/pull/1126#issuecomment-6378655719)；两处隐患另登记 BL-540、BL-541）；对 main 冲突，合并 Agent 机械同步后、Verify 绿即可入队 |
| 25 | [#1127](https://github.com/molis-ai/molis-work/pull/1127) | 评审修复线（合并 Agent 派）：隔离页 link 通道不再导航宿主文档（#1018）、SYS-15-U10 等回执修 flake（#1090） | — | `full` 为空 | 头 `6cdf4a15b`；统筹一轮**可合**，0 条挡合并（[评论](https://github.com/molis-ai/molis-work/pull/1127#issuecomment-6378661297)）；改了安全不变量，合前看 Security 两片作业；对 main 冲突，合并 Agent 机械同步（S-47 行仍点名本 PR 的用例、S 号连续）后入队 |
| 26 | [#1125](https://github.com/molis-ai/molis-work/pull/1125) | 评审修复线（合并 Agent 派）：复审报告剩余风险登记进防腐 spec（#1018 Todo 私路） | — | `full` 为空 | 草稿；头 `21d4b3719`；等 `ac-review` 一轮；负责人 review-fix-owner |
| 27 | [#1128](https://github.com/molis-ai/molis-work/pull/1128) | 评审修复线（合并 Agent 派）：翻译门禁盲区写进文档（#958） | — | `full` 为空 | 草稿；头 `f26d7f8b8`；等 `ac-review` 一轮；负责人 review-fix-owner |
| 25 | [#1137](https://github.com/molis-ai/molis-work/pull/1137) | W5-03/04 Images 片：客户端打包成 TS；`images.js` 21,670→19,915 B | 和 #1129、#1132 在 `page-assets.json` 撞相邻行，后合的解 | `full` 非空（deletes-code），进下一批 | 头 `6849fb942`（机械同步，二轮可合 `728a80dbb`，batch-17 绿）；10-24 02:15 统筹入队，02:18 合并 Agent 手动取出、未写原因，[已在 PR 上问](https://github.com/molis-ai/molis-work/pull/1137#issuecomment-6378675610)；等回复 |
| 27 | [#1139](https://github.com/molis-ai/molis-work/pull/1139) | PG-017 P0：`sandboxServicesFor` 一张映射；不给的服务一声明就以 `sandbox.service_not_given` 拒绝（项目与 Home 执行器共用）；S-60 一行 | **叠在 #1119 上**；S 号连续要 #1117、#1119 先合；#1134 合入后作者把切片文件改动并进来 | `full` 为空 | 头 `2a6d905c6`（并入切片文件改动）；`ac-review` **二轮：可合**；合前和 #1119 解 `SECURITY-INVARIANTS.md` 冲突；Security invariants 要看 |
| 28 | ~~#1140~~ | SC-4 残留：BL-485/486/488 | 作者已关闭（第三层）；分支 `migrate/sessions-sc4b-runtime-leftovers`（`259a5fc84`）留着，#1113 已合，作者改开 [#1157](https://github.com/molis-ai/molis-work/pull/1157)（叠在 #1130 上，第 39 行） | — | 不在队里 |
| 29 | [#1143](https://github.com/molis-ai/molis-work/pull/1143) | PG-017 P2a：连接经 broker 给沙箱插件 | 叠在 #1139→#1119（第三层）；**草稿**，#1119 合入、#1139 改投 main 后再转 ready | 待重算 | 统筹转了草稿，先不审 |
| 30 | [#1144](https://github.com/molis-ai/molis-work/pull/1144) | PG-017 P2b：不联网的材料读取经 broker 给沙箱 | 叠在 #1143（第四层）；**草稿**，按层合入后再转 ready | 待重算 | 统筹转了草稿；评审要看 RAC-25 旧测试改写没放宽 |
| 33 | [#1147](https://github.com/molis-ai/molis-work/pull/1147) | PG-051 P2b：插件 Agent 定义只由运行中的定义登记，删目录那条、`BUILTIN_PLUGIN_AGENTS` 与 `startAuthority` 回落；创作台改为平台来源；`PluginRegistration` 去三字段 | #1138 已合（10-24），已改投 main | `full` 非空（contracts），和 #1138 同批 | 头 `10d814fda`；`ac-review` **合 main 后仍可合**（[评论](https://github.com/molis-ai/molis-work/pull/1147#issuecomment-6377646076)，改动与二轮逐行一致）；`full` 非空进下一批 |
| 34 | [#1148](https://github.com/molis-ai/molis-work/pull/1148) | R8 第 2 批（BL-364）：项目里的工作与会话状态 4 条 typed 改登记成只给插件的动作 | **叠在 #1121 上**（第二层），#1121 合入后改投 main | `full` 非空，进下一批 | 头 `2a8eec5d8`（squash 感知同步，只剩自己的 13 个文件）；二轮可合；在 **batch-1024-19**（统筹起，10-24 03:35，run [40054696653](https://github.com/molis-ai/molis-work/actions/runs/40054696653)：main `aa4de404f` + #1157 `782af05ed`（含 #1130 `f7fb96ed6`）+ #1148 `2a8eec5d8`）；绿后入队 |
| 35 | [#1150](https://github.com/molis-ai/molis-work/pull/1150) | Codex：Shelf S3 合后 P2——桌面四个收集入口提示「原件登记部分成功」（PG-026-S1-S3-1～5） | #1076 已合 | `full` 为空 | 头 `04e51af7e`；`ac-review` **二轮：可合**；但对 main 冲突（DIRTY，#1083 合入后），先由作者 Codex 合 main（先留修复认领），机械同步后不必再审；`full` 为空 |
| 36 | [#1151](https://github.com/molis-ai/molis-work/pull/1151) | Codex C1 第 1 片：W5-13 server+cli 关闭失败与异步命令错误（RAC-110～112） | — | `full` 为空 | 头 `152682d1a`；`ac-review` 二轮可合（EPIPE、第二次信号 130/143 都过）；统筹裁定 1 处挡合并：`serve` 第一行的入口地址留在 stdout，不改成 debug（[评论](https://github.com/molis-ai/molis-work/pull/1151)），Codex 修；修完看一眼、Verify 绿即入队，`full` 为空 |
| 29 | [#1141](https://github.com/molis-ai/molis-work/pull/1141) | 评审修复线（合并 Agent 派）：#902 Home 待办批量「移到」菜单补 menu 语义与单一 Tab 停点（只改 todo 插件 UI + 新 e2e） | — | `full` 为空 | 草稿；头 `ab8a43768`；等 `ac-review` 一轮；负责人 review-fix-owner |
| 最后 | [#784](https://github.com/molis-ai/molis-work/pull/784) | Codex 的 QA 与验收记录（文档） | 全部代码 PR | — | 收尾时合 main、转 ready |

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

| 38 | [#1156](https://github.com/molis-ai/molis-work/pull/1156) | `ac-kernel` 平台片 BL-394：`releaseArtifact` 恢复出的定义在 start 时补 remember（RAC-330） | — | `full` 为空 | 头 `ed27d0413`；一轮可合；统筹 10-24 02:20 入队（唯一红的是非必需 Security 2/2 的 SYS-15-U10 flake，#1127 修） |
| 39 | [#1157](https://github.com/molis-ai/molis-work/pull/1157) | `ac-sc3` SC-4b：清 SC-4 三项残留（BL-485 Codex 会话适配器、BL-486 `session_id`、BL-488 依赖） | **叠在 #1130 上**（第二层），#1130 合入后改投 main | `full` 非空（shared-core），进下一批 | 头 `782af05ed`；二轮可合；在 **batch-1024-19**（统筹起，10-24 03:35，run [40054696653](https://github.com/molis-ai/molis-work/actions/runs/40054696653)：main `aa4de404f` + #1157 `782af05ed`（含 #1130 `f7fb96ed6`）+ #1148 `2a8eec5d8`）；#1130 合入、改投 main 后合 |
| 40 | [#1158](https://github.com/molis-ai/molis-work/pull/1158) | 统筹：privileges.md 状态第 4 批（PG-026-S1、030、090 已做；012、026、029、031、056、070、071、094 进度） | — | `full` 为空 | 头 `dd69fff8a`；一轮可合；统筹 10-24 02:15 入队 |
