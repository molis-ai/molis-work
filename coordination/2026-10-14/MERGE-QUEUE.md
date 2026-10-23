# 防腐线合并清单（给合并 Agent）

状态：2026-10-23 起生效。统筹（本机 Claude）维护顺序与就绪条件；合并由用户另派的合并 Agent 做（用户 10-23），统筹不再合 PR。

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

合入以后：在本表把那一行挪到 §3「已合」，写合并提交。`privileges.md`、spec 链接和登记册由统筹改。

## 2. 顺序与现状

「就绪」只在 1～5 条全满足时写「可合」。

| 序 | PR | 内容 | 依赖 | 批 | 现状（统筹最后核对 10-23 18:55 UTC） |
| --- | --- | --- | --- | --- | --- |
| 4 | [#1098](https://github.com/molis-ai/molis-work/pull/1098) | W5-06 第 2b 片：视图声明分组、新建、首页起点、设置图标 | #1087 | 下一批（和 #1107 同批） | 叠在 #1087 上 |
| 5 | [#1107](https://github.com/molis-ai/molis-work/pull/1107) | W5-06 第 3 片：项目级 Runtime 实例的舞台 | #1098 | 同 #1098 | 叠在 #1098 上；`ac-review` 一轮：**可合**（[评论](https://github.com/molis-ai/molis-work/pull/1107)） |
| 6 | [#1076](https://github.com/molis-ai/molis-work/pull/1076) | Shelf S3：路由只由插件声明 | #1099（放行键对它合入后的 main 重算） | 下一批（和 #1083、#1112） | Codex 在整理冲突 |
| 7 | [#1083](https://github.com/molis-ai/molis-work/pull/1083) | Shelf S4 | #1076 | 同 #1076 | 叠着 #1076；Verify 红的唯一原因是 `error-owners.json` 的 `apps/local-host/src/shelf-*` |
| 8 | [#1112](https://github.com/molis-ai/molis-work/pull/1112) | W5-06 余项第一片（草稿） | 排在 #1076、#1099 之后 | 同 #1076 | `ac-review` 一轮：修后可合，2 条交 Codex（[评论](https://github.com/molis-ai/molis-work/pull/1112#issuecomment-6370952389)）；统筹裁定规格板选 (b)、补 RAC-80～84（[裁定](https://github.com/molis-ai/molis-work/pull/1112#issuecomment-6371157480)）；Codex 合 main、重量 page-assets、转 ready |
| 9 | [#1113](https://github.com/molis-ai/molis-work/pull/1113) | Sessions 清理 SC-3（PG-082） | — | `full` 非空（assembly、spans-packages），和 #1076、#1083、#1112 同批或下一批 | 头 `a959f8469`，已合 main；`ac-review` 在审 |
| 11 | [#1117](https://github.com/molis-ai/molis-work/pull/1117) | R7：可信 `user_action` 来源（PG-029、PG-030、BL-374，S-58） | — | `full` 非空（shared-core、spans-packages），进下一批 | 头 `a1eae5555`：S-58 已补（`kernel.user_action_untrusted`），合了 main；`ac-review` 一轮待审；改了安全不变量，合前看 Security invariants |
| 12 | [#1118](https://github.com/molis-ai/molis-work/pull/1118) | W5-09 余项：拆 `contracts/platform/plugin.ts`（纯移动） | — | `full` 非空（shared-core），进下一批 | `ac-review` 一轮：**可合**，0 条挡合并（[评论](https://github.com/molis-ai/molis-work/pull/1118#issuecomment-6371982397)）；等集成批；19:30 CI 的 Rust and Swift checks 红在 `context_directory_files::tests::replacement_with_same_size_and_mtime_is_rejected`（本 PR 不碰 Rust，main 同作业绿，按时序抖动处理），统筹已排了失败作业重跑 |
| 13 | [#1119](https://github.com/molis-ai/molis-work/pull/1119) | BL-395 整片：沙箱项目库语句跑在宿主能杀的子进程里（时间、内存、结果、递归上限；S-59，改 S-46） | **#1117 先合**（S 号连续的门禁要 S-58 在 main 上） | `full` 非空（shared-core、spans-packages，219 文件），进下一批 | 头 `a699e421c`；子进程已补齐、BL-480 已删；`ac-review` 排队审；改了安全不变量，合前看 Security invariants |
| 14 | [#1120](https://github.com/molis-ai/molis-work/pull/1120) | R5：Feed/Functions 入口不再导出 Repository/Store、PG-010 首页规则目标按声明找、两包巨大单元 | — | `full` 非空（shared-core、storage、spans-packages、deletes-code，141 文件），进下一批 | 头 `c0356cd09`；`ac-review` 在审 |
| 15 | [#1121](https://github.com/molis-ai/molis-work/pull/1121) | R8 第 1 批：agent 宿主会话间消息与后台命令 7 条 typed 改成只给插件的动作（BL-365） | — | `full` 非空（shared core，205 文件），进下一批 | 头 `332cbac3e`；`ac-review` 排队审；改动作，合前确认动作快照已刷新 |
| 17 | [#1123](https://github.com/molis-ai/molis-work/pull/1123) | PG-039～042 核对；宿主项目时钟不再自带进程内唤醒处理器 | — | `full` 为空（103 文件） | 头 `71281ccb4`；`ac-review` 排队审 |
| 19 | [#1129](https://github.com/molis-ai/molis-work/pull/1129) | W5-03/04 Todo 片（样板）：客户端打包成 TS、稳定翻译键；`todo.js` 61,976→54,090 B | — | `full` 非空（assembly、deletes-code，102 文件），进下一批 | 头 `ed3b374f4`；`ac-review` 优先审（后面 5 片照它做） |
| 20 | [#1130](https://github.com/molis-ai/molis-work/pull/1130) | SC-4：Sessions 下线（删 Work 包、Session 模块部分、首页「说一句」；PG-081、PG-082 收尾；D6 方案 A 用户 10-23 已确认） | **叠在 #1113 上**，#1113 先合 | `full` 非空（855 文件），进集成批 | 头 `06600841f`；`ac-review` 排队审；作者在改「待用户确认」措辞，之后接 BL-485/486/488 |
| 21 | [#1131](https://github.com/molis-ai/molis-work/pull/1131) | BL-481：删 `PluginWakeupIndex` 与无安装的 `register()`，测试搬到按安装的拥有者 | **叠在 #1123 上**，#1123 先合 | `full` 为空 | `ac-review` 排队审 |
| 22 | [#1132](https://github.com/molis-ai/molis-work/pull/1132) | W5-03/04 Issues 片：客户端打包成 TS、稳定翻译键；`issues.js` +3,605 B（统筹已放行，`APPROVED_CEILINGS` 一条） | 和 #1129 的 `page-assets.mjs`/`page-assets.json` 会撞相邻行，后合的解 | `full` 非空（assembly、deletes-code，77 文件），进下一批 | 头 `6c5baf809`；`ac-review` 排队审 |
| 23 | [#1133](https://github.com/molis-ai/molis-work/pull/1133) | privileges.md 状态第 2 批：PG-027、PG-052 标已做，PG-012/022/088/089 写清剩下的（统筹的账） | — | `full` 为空 | 纯文档；Verify 绿就可合，不必等评审 |
| 24 | [#1126](https://github.com/molis-ai/molis-work/pull/1126) | 评审修复线（合并 Agent 派）：Coding 两条无人认领 P3——#955 首页后台时间界限、#928 英文持有人中文标签 | — | `full` 为空 | 头 `3283c106a`；`ac-review` 待审；Verify 绿；`page-assets` coding.js 375409→376282 一次性放行待评审认可（lead 派 coding-review-fixes） |
| 25 | [#1127](https://github.com/molis-ai/molis-work/pull/1127) | 评审修复线（合并 Agent 派）：隔离页 link 通道不再导航宿主文档（#1018）、SYS-15-U10 等回执修 flake（#1090） | — | `full` 为空 | 头 `6cdf4a15b`；`ac-review` 待审；Verify 绿；两片 Security invariants 绿（改了 S-47 与安全测试，条件 4 要看）；plugin-frame.js +263B 已按一次性放行 |
| 26 | [#1125](https://github.com/molis-ai/molis-work/pull/1125) | 评审修复线（合并 Agent 派）：复审报告剩余风险登记进防腐 spec（#1018 Todo 私路） | — | `full` 为空 | 草稿；头 `21d4b3719`；等 `ac-review` 一轮；负责人 review-fix-owner |
| 27 | [#1128](https://github.com/molis-ai/molis-work/pull/1128) | 评审修复线（合并 Agent 派）：翻译门禁盲区写进文档（#958） | — | `full` 为空 | 草稿；头 `f26d7f8b8`；等 `ac-review` 一轮；负责人 review-fix-owner |
| 24 | [#1134](https://github.com/molis-ai/molis-work/pull/1134) | PG-017 组设计稿：沙箱插件经 broker 拿宿主服务（只加 slices 文档） | — | `full` 为空 | 统筹已审定（[评论](https://github.com/molis-ai/molis-work/pull/1134)）；纯文档，Verify 绿即可合 |
| 25 | [#1137](https://github.com/molis-ai/molis-work/pull/1137) | W5-03/04 Images 片：客户端打包成 TS；`images.js` 21,670→19,915 B | 和 #1129、#1132 在 `page-assets.json` 撞相邻行，后合的解 | `full` 非空（deletes-code），进下一批 | 头 `c0d39defa`；`ac-review` 排队审（顺带改了错误模型测试的源码扫描范围，要看没放宽） |
| 26 | [#1138](https://github.com/molis-ai/molis-work/pull/1138) | PG-051 P2a：Agent 声明停用后按「未运行」保留、重启恢复、卸载才删（新 Home 库 `agent-declarations`） | #1124 已合 | `full` 非空（contracts），进下一批 | 头 `36c0771cb`；`ac-review` 排队审 |
| 27 | [#1139](https://github.com/molis-ai/molis-work/pull/1139) | PG-017 P0：`sandboxServicesFor` 一张映射；不给的服务一声明就以 `sandbox.service_not_given` 拒绝；S-60 一行 | **叠在 #1119 上**；S 号连续要 #1117、#1119 先合 | `full` 为空 | `ac-review` 排队审；改了安全不变量，合前看 Security invariants |
| 28 | [#1140](https://github.com/molis-ai/molis-work/pull/1140) | SC-4 残留：BL-485/486/488（Codex 会话适配器、合同里的 `session_id`、模块描述） | 叠在 #1130（第三层）；**草稿**，#1113 合入且 #1130 改投 main 后再转 ready | 待重算 | 统筹转了草稿，先不审 |
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
