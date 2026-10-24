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
| 13 | [#1119](https://github.com/molis-ai/molis-work/pull/1119) | BL-395 整片：沙箱项目库语句跑在宿主能杀的子进程里（时间、内存、结果、递归上限；S-59，改 S-46） | **#1117 先合**（S 号连续的门禁要 S-58 在 main 上） | `full` 非空（shared-core、spans-packages，219 文件），进下一批 | 作者ac-sandbox-sched已回复6379495572确认同步在途，新远端 `ae2b64cd9626d61f2f486db65b51c51035c7b529`；待最终交接/增量复核。原32项有效，batch13–19无本片有效full，后续明确集成批补齐；未开第二writer |
| 19 | [#1129](https://github.com/molis-ai/molis-work/pull/1129) | W5-03/04 Todo 片（样板）：客户端打包成 TS、稳定翻译键；`todo.js` 61,976→54,090 B | — | `full` 非空（assembly、deletes-code，102 文件），进下一批 | **已关闭**（10-24，统筹）：同步 main 后树与 main `1dedc1f5c` 相同、0 个文件；Todo 片内容随 #1132 合入，batch-17 已覆盖 |
| 20 | [#1130](https://github.com/molis-ai/molis-work/pull/1130) | SC-4：Sessions 下线（删 Work 包、Session 模块部分、首页「说一句」；PG-081、PG-082 收尾；D6 方案 A 用户 10-23 已确认） | **叠在 #1113 上**，#1113 先合 | `full` 非空（855 文件），进集成批 | 最新远端 `7d5e06b779219fb908aae21ab63c356edc3e167d`；78阶段机械同步与26项日志已独立核，最新同步待交付/增量核验；SC4等1157非空Dock补测和作者精确交付后单起batch21，Codex不重复起批 |
| 39 | [#1157](https://github.com/molis-ai/molis-work/pull/1157) | `ac-sc3` SC-4b：清 SC-4 三项残留（BL-485 Codex 会话适配器、BL-486 `session_id`、BL-488 依赖） | **叠在 #1130 上**（第二层），#1130 合入后改投 main | `full` 非空（shared-core），进下一批 | 候选 `e387dc98167679751288f8c8cf6d168abc625c7f` 已独立核双阶段断言及原补丁保留；评审6379709843发现Dock菜单检查可空过，统筹6379741863已派原ac-sc3补真实320px非空hidden/list/44px验证及同步SC4注释。暂不可合，等待新头及batch21 |
| 27 | [#1139](https://github.com/molis-ai/molis-work/pull/1139) | PG-017 P0：`sandboxServicesFor` 一张映射；不给的服务一声明就以 `sandbox.service_not_given` 拒绝（项目与 Home 执行器共用）；S-60 一行 | **叠在 #1119 上**；S 号连续要 #1117、#1119 先合；#1134 合入后作者把切片文件改动并进来 | `full` 为空 | 作者同步下层中，新远端 `9314fc7ba22410df66a2ce38ae27f0dccff3bfbd`，仍叠1119；旧5713头二轮6379124950有效范围保留，新头待回交和增量核验；依赖及Security门槛不变 |
| 28 | ~~#1140~~ | SC-4 残留：BL-485/486/488 | 作者已关闭（第三层）；分支 `migrate/sessions-sc4b-runtime-leftovers`（`259a5fc84`）留着，#1113 已合，作者改开 [#1157](https://github.com/molis-ai/molis-work/pull/1157)（叠在 #1130 上，第 39 行） | — | 最终候选 `e387dc98167679751288f8c8cf6d168abc625c7f`，作者6379640966交付：合下层78与b640，保留fb22双阶段断言；touch恢复原断言、真实pin配置增todo，报告4/4。已派独立最终review/raw核验，下一batch尚未启动 |
| 29 | [#1143](https://github.com/molis-ai/molis-work/pull/1143) | PG-017 P2a：连接经 broker 给沙箱插件 | 叠在 #1139→#1119（第三层）；已按用户要求转为非 Draft，保留 #1119 先合与 #1139 改投 main 的依赖 | 待重算 | 已转非 Draft；先等待下层依赖 |
| 30 | [#1144](https://github.com/molis-ai/molis-work/pull/1144) | PG-017 P2b：不联网的材料读取经 broker 给沙箱 | 叠在 #1143（第四层）；已按用户要求转为非 Draft，仍按层依赖合入 | 待重算 | 统筹转了已按用户要求转为非 Draft；评审要看 RAC-25 旧测试改写没放宽 |
| 34 | [#1148](https://github.com/molis-ai/molis-work/pull/1148) | R8 第 2 批（BL-364）：项目里的工作与会话状态 4 条 typed 改登记成只给插件的动作 | **叠在 #1121 上**（第二层），#1121 合入后改投 main | `full` 非空，进下一批 | 头 `2a8eec5d8`（squash 感知同步，只剩自己的 13 个文件）；二轮可合；在 **batch-1024-19**（统筹起，10-24 03:35，run [40054696653](https://github.com/molis-ai/molis-work/actions/runs/40054696653)：main `aa4de404f` + #1157 `782af05ed`（含 #1130 `f7fb96ed6`）+ #1148 `2a8eec5d8`）；绿后入队 |
| 新 | [#1161](https://github.com/molis-ai/molis-work/pull/1161) | #805非阻塞遗留：写后检查设置页路由注释规格错号 | — | 注释only，无full需求 | head `a6621a7ea817077b489c8e26648986568a9c02b2`；修复1交付/释放，1文件+1/-1，正式一轮6379702002可合，独立文档/secret检查通过；CI40061206220原生剪贴板测试间歇失败，独立诊断后待原run完成，统筹已成功单job重跑一次（6379912743），等原生/Verify结果 |
| 新 | [#1163](https://github.com/molis-ai/molis-work/pull/1163) | #1147非阻塞遗留：SDK instructions统一登记文案 | #1147已实际合入1756f9842 | 纯文档，无full需求 | head `fd7c64a0ee77e72642cd5d6cf3b6c2a1cc281896`；修复2已交付/释放，1行README，正式review6379896345及独立原始文档/secret核验通过；已转ready，当前CI40062592114待完成 |
| 新 | [#1164](https://github.com/molis-ai/molis-work/pull/1164) | `ac-sc3` BL-385（R-17）：删除项目时清该项目的 Characters 原生执行记录 | — | `full` 非空（shared-core、storage、spans-packages，137 文件），进批 | 10-24 05:10 开，头对 main 无冲突、未同步（落后不同步）；待 `ac-review` 一轮 |
| 最后 | [#784](https://github.com/molis-ai/molis-work/pull/784) | Codex 的 QA 与验收记录（文档） | 全部代码 PR | — | 已按用户要求转为非 Draft；收尾时合 main |

新开的开发片 PR 由统筹按依赖插进本表。

## 3. 已合

| PR | 合并提交 | 日期 |
| --- | --- | --- |
| #1126 | `89c9a71947f483cd429405574df7b2b916b36b8d` | 10-24 04:31:56 UTC（Codex已核实际合并；BL-540/541各已认领待串行实施） |
| #1147 | `1756f9842def9df6b1cb0ccebfa23b10af26ec76` | 10-24 04:28:30 UTC（Codex已核实际合并；SDKREADME非阻塞文案另派修复2） |
| #1125 | `de103e5fa421345101056c9fd9100b2144f710e6` | 10-24 04:08:27 UTC（Codex 已核实际合并；只完成文档登记） |
| #1141 | `04435950a05a3602d6408f31c51c5b3e66080f28` | 10-24 03:56:55 UTC（Codex 已核实际合并） |
| #1150 | `034af76c50a68151c39d62da13aa78d2a0bc0079` | 10-24 03:47:25 UTC（Codex 已核实际合并） |
| #1120 | `47c78064460dadd1890943c73e6af27e7347211c` | 10-24 03:50:00 UTC（Codex 已核实际合并） |
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


2026-10-23 20:24 洛杉矶，Codex 测试专职核 batch-1024-19（固定头 `ee4418881264683b357e3ee743ee48c006aa33c7`）：分片7的 `web-home-isolation.test.ts` 与分片5的 `home-offers.e2e.test.ts` 均重复失败。两项分别依赖已退役的 Sessions 新建与首页 Talk 入口，均归 #1130 的 RAC-212/214，已由同一修复1处理；不是已知 main 红，不能把旧批写成通过。保留其余作业继续运行、不取消，最终修复头与后续集成另核。

2026-10-23 20:36 洛杉矶：下一集成批预检版本原为 main `585b15979` + #1130 `fb22b7dc1` + #1157 `782af05ed` + #1148 `2a8eec5d8`。SC-4 spec 两处第4节追加应同时保留；#1157 的 ci-failure-owner 又认领同两测试，统筹已在[6379391764](https://github.com/molis-ai/molis-work/pull/1157#issuecomment-6379391764)说明下层#1130已完成并独立复核，要求确认沿用及当前精确头。新集成暂不启动、不取消旧批，避免重复补丁与验证错误版本；后续启动前须重取最新main/候选和其他批认领。

2026-10-23 20:50 洛杉矶（Claude 统筹）：batch-1024-19 还有第三个文件——分片13的 `tests/touch-targets.e2e.test.ts` 两个主题都在第 659 行失败（「390px holds the widest row with 项目首页 and the "+N" button」，`moreShown["390 the project's settings"]` 为 false），重试也红。#1130、#1157 都没改这个文件，main `e8e79e53e` 全量绿；`known-red-main.md` 里它只记过「重试才过」，这次两主题确定性失败，不按 flaky 处理。推测是 SC-4 拿掉 Sessions 后 Dock 一排不再折叠。已交 `ac-sc3`（#1130/#1157 作者）本机跑这一个文件定性：预期变化就改夹具保住断言原意，回归就修产品；同时把 main 合进 #1130、再合进 #1157。**下一批（batch-20）由 Claude 统筹起**，等 `ac-sc3` 回两个新头再起，Codex 不另起，避免两批测同一组。

2026-10-23 21:10 洛杉矶（Claude 统筹）：`ac-sc3` 定性 touch-targets——SC-4 拿掉 Sessions 钉住后默认 Dock 少一个按钮，390px 不再折叠、断言空转，不是产品回归；夹具改为多钉一个插件（todo），断言原样恢复（`b64058335` 把断言改成反值、删了「320 home」那条，已撤回）。#1130 `78dbe9ece`、#1157 `e387dc981`。但随后 main 进了 #1120、#1141，#1157 对 main `04435950a` 冲突 `CHECKLIST.md`、`project-deletion-owners.test.ts`、`baseline.json`，已请 `ac-sc3` 再同步一次，好了单起 batch-21。**batch-1024-20** 先起：main `04435950a` + #1148 `2a8eec5d8` + #1139 `9314fc7ba`（含 #1119 `ae2b64cd9`），头 `f5d2e8f69`，run [40061024962](https://github.com/molis-ai/molis-work/actions/runs/40061024962)。绿后按 #1119 → #1139（改投 main 后合一次）→ #1148 合；#1119、#1139 动了安全不变量，合前看 Security 作业。

2026-10-23 21:30 洛杉矶（Claude 统筹）：`ac-sc3` 再同步 main `04435950a`：#1130 `7d5e06b77`、#1157 `2d15c6d41`（baseline 用 `--update --base` 重生成）。**batch-1024-21** 起：main `de103e5fa` + #1157 `2d15c6d41`（含 #1130），头 `05b63880f`，run [40061758914](https://github.com/molis-ai/molis-work/actions/runs/40061758914)。绿后 #1130 → #1157（改投 main 后合一次）。作者不再推送，免得批作废。

后续更新：#1157已在6379484788确认不重复推两测试补丁，原重复认领等待已解除；现等待ac-sc3处理batch-19新增touch-targets移动端失败。测试专职只读核原始失败与产品契约，下一全量仍未启动。#1119需在后续明确集成批补全量，不能借用batch13–19。

20:57 洛杉矶接续：batch-19最终16分片13绿、5/7/13失败（home-offers、web-home-isolation、touch-targets），不是通过。#1157另线b640三测试已推但尚未合入下层已审更完整修复；统筹6379553963明确由ac-sc3统一收口，候选最终交付前不启动新全量。#1119作者已答复同步在途，不再等待归属决定。

20:59洛杉矶：#1157 b640候选预审确认必须补齐Dock +N菜单44px实际覆盖；新默认pin使390/360 Home无+N，原popovers分支直接continue。统筹已公开具体复现链和交付要求，ac-sc3同一writer处理；该候选尚未可合。

2026-10-23 21:17洛杉矶：用户点名#1121，已核该PR实际合并aa4de404fc847d99bf89842f446474ec41d7622a；原review6372440411建议1跨插件资源归属仍未完成，统筹6379753664明确派修复1接续，当前只读准备，待修复2SDK文案小修释放后实施。与BL-541结构化展示字段分别跟踪，不能用原PR已合入关闭遗留。其他未认领non-block按CODEX-SESSION-ROLES表持续认领、修复与独立验证。
