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

合入以后：在本表把那一行挪到 §3「已合」，写合并提交。`privileges.md`、spec 链接和登记册由统筹改。

## 2. 顺序与现状

「就绪」只在 1～5 条全满足时写「可合」。

| 序 | PR | 内容 | 依赖 | 批 | 现状（统筹最后核对 10-23 18:55 UTC） |
| --- | --- | --- | --- | --- | --- |
| 3 | [#1084](https://github.com/molis-ai/molis-work/pull/1084) | PG-062 S4b：Coding 卡片经 `services.interaction` | — | batch-1023-12 | DIRTY，Codex 在合 main；改了 S-56，看 Security invariants |
| 4 | [#1098](https://github.com/molis-ai/molis-work/pull/1098) | W5-06 第 2b 片：视图声明分组、新建、首页起点、设置图标 | #1087 | 下一批（和 #1107 同批） | 叠在 #1087 上 |
| 5 | [#1107](https://github.com/molis-ai/molis-work/pull/1107) | W5-06 第 3 片：项目级 Runtime 实例的舞台 | #1098 | 同 #1098 | 叠在 #1098 上；`ac-review` 一轮：**可合**（[评论](https://github.com/molis-ai/molis-work/pull/1107)） |
| 6 | [#1076](https://github.com/molis-ai/molis-work/pull/1076) | Shelf S3：路由只由插件声明 | #1099（放行键对它合入后的 main 重算） | 下一批（和 #1083、#1112） | Codex 在整理冲突 |
| 7 | [#1083](https://github.com/molis-ai/molis-work/pull/1083) | Shelf S4 | #1076 | 同 #1076 | 叠着 #1076；Verify 红的唯一原因是 `error-owners.json` 的 `apps/local-host/src/shelf-*` |
| 8 | [#1112](https://github.com/molis-ai/molis-work/pull/1112) | W5-06 余项第一片（草稿） | 排在 #1076、#1099 之后 | 同 #1076 | `ac-review` 一轮：修后可合，2 条交 Codex（[评论](https://github.com/molis-ai/molis-work/pull/1112#issuecomment-6370952389)）；统筹裁定规格板选 (b)、补 RAC-80～84（[裁定](https://github.com/molis-ai/molis-work/pull/1112#issuecomment-6371157480)）；Codex 合 main、重量 page-assets、转 ready |
| 9 | [#1113](https://github.com/molis-ai/molis-work/pull/1113) | Sessions 清理 SC-3（PG-082） | — | `full` 非空（assembly、spans-packages），和 #1076、#1083、#1112 同批或下一批 | 头 `a959f8469`，已合 main；`ac-review` 在审 |
| 10 | [#1115](https://github.com/molis-ai/molis-work/pull/1115) | privileges.md：PG-003、018、019、048、050 标已做（统筹的账） | — | `full` 为空 | 纯文档；Verify 绿就可合，不必等评审 |
| 11 | [#1117](https://github.com/molis-ai/molis-work/pull/1117) | R7：可信 `user_action` 来源（PG-029、PG-030、BL-374，S-58） | — | `full` 非空（shared-core、spans-packages），进下一批 | `ac-kernel` 开；`ac-review` 在审；改了安全不变量，合前看 Security invariants |
| 12 | [#1118](https://github.com/molis-ai/molis-work/pull/1118) | W5-09 余项：拆 `contracts/platform/plugin.ts`（纯移动） | — | `full` 非空（shared-core），进下一批 | `ac-kernel` 开；`ac-review` 在审 |
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
