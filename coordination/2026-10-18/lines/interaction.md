# 交互线交接（2026-10-18）

> **统筹交接后核对（2026-10-18 晚，以这一段为准）**
> - #708 已合入 main；远端分支 `interaction/ac08-two-tabs` 随合并删了。下面「#708 合入以后要清的」只在原机器上，接手人不用管。
> - BL-156（重启前提的问题重启后回答）已由 #695 做完，不在本线待办里。
> - 下一片按交接文档第 3 节④的顺序，从 AC-10 的 Coding 问卷卡开始；计划照旧先发统筹。
> - AC-11 行的包来源：现在 main 用的是 Prologue `3adc5e87`，批 B 换包后还会变，改 spec 时按那时的包写。

需求是 `specs/ai-interaction-experience`，进度表在 spec 的 §17（AC 各行），进展记录在 §18。

## 在途

- **PR #708**：AC-08 两个页签（助理与 Coding）的用例、AC-11 行，加上这个用例查出来的两处 Coding 缺陷。
  - head 是 c4e6d38e0，分支 `interaction/ac08-two-tabs`，工作树 `.claude/worktrees/line-interaction-ac08`。
  - 改了产品代码（Coding 的 `routes-sessions.ts`、`client.ts`），所以要跑全量，不能走 merge-only。
- **#708 合入以后要清的**：
  - 工作树 `line-interaction-ac08`；
  - 本地分支 `interaction/ac08-two-tabs`；
  - 下面四个旧本地分支——合入前先用 `git branch -d` 确认是否都已合入：`interaction/ac07-ac08-recovery`、`interaction/ac12-docs-examples`、`interaction/t2-references`，以及记忆里写着待删的 `ac05-red-fix`。
  - 主工作树 `line-interaction` 现在是 detached HEAD，停在 8fcff0442，可以保留，也可以一起删掉。

## 剩下的需求（spec §17 里「部分」的行）

- **AC-01 范围**：§14.3 只做了首轮分组，逐插件的证据没补；第二批入口（P5）还没开始。
- **AC-02 与 AC-12 示例 2**：「与输入框平齐、横向展开」的同排推荐没做，这件归情境线的助理面板布局（跨线）。Coding 一侧也没有下一步（H4）。
- **AC-03**：输入框目标芯片，助理一侧「写进问卷」已经做了，其余见 spec 原行。
- **AC-06 预览与结果**：结果只有一行文字；下一步只有「打开结果 / 再试一次」。Coding 没有操作卡（H4）。
- **AC-09**：非 Agent 插件没有结构化接续（S1）。
- **AC-10 UI**：
  - Coding 问卷卡的三个宽度和深色模式没有评审记录。
  - 真实中文输入法和读屏没有验证，这部分只能用户做（BL-016）。
- **AC-12**：`generated-ai.md` 没改。它挂在创作台的 Skill 里，改它要跑真实模型冒烟。
- **AC-11 行**：包来源还写着 `b541a8e6`，下次改 spec 时更新成现用的包（统筹提过，不挡合并）。

## 下一片

统筹还没批下一片。我原本想做的是 **AC-10 的 Coding 问卷卡**：补三个宽度和深色模式的评审截图，改到的地方补上，只跑 `coding-question-card.e2e`。这一片小，只动视觉，不碰合同。比它大的是 AC-06 的结果卡，以及 Coding 的操作卡 H4。

## 坑

1. **`run-tests.mjs` 只传文件路径。** 按用例名过滤写 `--test-name-pattern=…`。直接写 `AC-08` 会被当成文件参数，曾经跑了约 1,100 个用例。
2. **CI 上的后台页签不可见。**
   - Coding 只在可见的页面里读取和跟随会话（`lifetime.visible`）。
   - 在 Linux headless 上，`Target.activateTarget` 不能让后台页签变成可见。
   - 第二个页签要用 `Target.createTarget({url, newWindow:true})` 开。
3. **Coding 的状态行不能放原因。**
   - 只要这一轮的状态变化，状态行就会被清掉（`client.ts` 的 `statusKey`）。
   - `readCurrent` 在 `loading && !fresh` 时直接返回，所以 `readCurrent().finally(...)` 也补不上。
   - 被拒的原因放在卡片的 note 里：卡片关着，带 `data-refused`，`renderQuestions` 不会移除它；正在发送的卡片（`data-busy`）也不会被移除。
4. **测试要等事实，不按时间等。**
   - #708 的做法：fetch 包装把拒绝之后发出的全部会话 GET（包括 `/live` 长轮询）先扣住；断言卡片状态之后再放行；然后数「已经画完的读取」次数（`__readsAfter`）。
   - 只扣 `?window=` 不够，因为 live 那条读取也会重画卡片。
   - 做变异检查时要确认红在预期的那句断言上，而不只是看红没红。
5. **页面资源门禁比的是 merge-base 的预算。**
   - 合并 main 之后要重新测：先 `git checkout <merge-base> -- tooling/gates/page-assets.json`，再跑 `node scripts/gates/page-assets.mjs --update --base origin/main`。
   - 别拿较新的 `origin/main` 版本的 json，它会顺带抬高别的资源的预算。
   - `coding.js` 现在离预算只有约 37 字节，Coding 页面再加任何代码都得先在别处省下来。
6. **CPU 跑满时的超时是环境问题。** CPU 满载时 `interaction-no-crosstalk` 的每个用例都会在导航或清理时超时，AC-05 也一样。负载正常时它们是稳的。
7. **zsh 下 `kill $pids`** 会把 pid 字符串当成一个参数，要用数组。
8. **错误码**：
   - Coding 的错误码用 `defineErrorCodes("coding", …)` 声明，状态码由 SDK 的种类表决定。
   - 页面按 `error.code` 判断，不按文字判断。
   - 被拒时卡片说原话，不说「已由另一处回答」，理由写在 spec 的 AC-08 行。
