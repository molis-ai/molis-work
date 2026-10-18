# 情境线交接（specs/context-program，2026-10-18）

> **统筹交接后核对（2026-10-18 晚，以这一段为准）**
> - #720（W3-C2）、#730（W4-1）都已合入 main；两条远端分支随合并删了。#727（S-39）也已合入，S-39、S-40 已连续，下文「#727 合入之前 health 必红」不再适用。
> - 下面「合入后要清理」里的本地分支、工作树和 `~/.codex/worktrees/context-w0` 都只在原机器上，接手人不用管。
> - 下一片（W4 的 Pages、Inbox、Goals 创建入口，F2 的 `find`）照旧：先写计划交统筹。

总纲 `specs/context-program/spec.md`：第 9 节是波次，第 16 节是需求状态表，§21 是接续入口（21.4 各片、21.5 决策、21.6 进度与证据、21.8 W3-B 的设计记录）。子需求书：`specs/context-toolbar`、`specs/quick-create`、`specs/side-shelf`。

## 现状

- 已合 main：W3-A1 #536、W3-A2 #573、W3-A3a #664、W3-A3b #673、W3-A3c #691、W3-B1 #553、W3-B2 #618、W3-B3 #651、BL-150 #660、W2'-1 #701、W2'-3 #704、W3-C #712，以及修 flake 的 #594。
- 在途（本线最后两件，都别推，合并归统筹）。顺序是 #720 先合，#730 后合。
  - **#720 W3-C2**（分支 `context/w3c2-pane-hover-flash`，head 4dd4ac30b）
    - 已按 main 63639a764 取键 [1111791, 1111910]，+119：W3-C2 +81，Esc 的修正 +38。
    - 内容一：在分屏窗格或右栏格自己的浮条上悬停「放进去」时，左边落点会闪。
    - 内容二：Esc 用 `bus.hush()` 停掉在路上的判断（PICK-05 的根因）。
  - **#730 W4-1**（分支 `context/w4-1-intake-todo-lingguang`，head e757d682c）
    - 内容：「记成待办」「记下灵光」改成创建入口，直接建，撤销只经主人。
    - 编号：撤销令牌 S-40，按内容挑去处 BL-174。
    - 前置：#727（S-39）合入之前，health 的 security invariants 一项必红（编号断档）。
    - #720 合入后：merge main，键改成 [#720 合入后的大小, +1,158]，走 merge-only。

## 合入后要清理

- 远端分支：`context/w3c2-pane-hover-flash`、`context/w4-1-intake-todo-lingguang`。
- 本地分支，对应的 PR 都已合入或作废：
  - `context/assistant-flow`、`context/picker-close`、`context/w3a2-strip`、`context/w3b-landing`
  - `context/w3b2-landing-strip`、`context/w3b3-pane-landing`、`context/w3c-side-in-hand`、`context/w3c2-pane-hover-flash`、`context/w4-1-intake-todo-lingguang`
  - 它们多是 squash 合入的，要用 `-D` 删。
- 工作树 `.claude/worktrees/line-contextual`：本会话的 cwd，两个 PR 合入后可删。`w2p-baseline` 与 `line-contextual-w2p` 已经不在了。
- `~/.codex/worktrees/context-w0/goalboard`（`feature/handoff-contextual-actions`）是 Codex 早期 W0 的工作树，不是本会话建的，删之前先问。
- 删工作树和分支会被权限判成「Git Destructive」，要先弹窗请用户批准。

## 还剩的需求（第 9 节）

1. **W4 剩下的部分**：
   - 创建入口还差 Pages、Inbox、Goals。Goals 是 `effect: "proposes"`，总是出卡片。
   - F2 追加：`attach` 的 `find` 用 `search.references@1` 取候选（统筹 10-15 定，21.8 的 B-2）。
   - F3 批量：`multiple`，一张卡里逐条取消。
   - 插件页和右栏格的「✦ 一句话新建」（C9、C10）。
   - 覆盖率门禁 C13（§18.7 W1-8）：插件开始声明 `intake` 之后才能做。
   - 内容站请求号泛化（§18）：8 个插件的 `receive` 要升版本，动手前先查存量工作流有没有固定版本。
2. **W5** 拖放：浮条出现在松手的地方。
3. **W6**：
   - Shelf 的动作进候选池。
   - 从左往右放（Shelf、灵光的创建入口）。
   - F8 材料篮。
   - F12：讨论的输入框作为落点。
4. **W7 起**：先做 F4（先做 G1）和 F13，再做 F6、F7、F10、F9；各插件的专属动作按 context-toolbar §11.6。
5. **收尾**：在真实 Home 上全面验证，三份子需求书归档。
6. **BL-174**：没有模型时按内容挑去处（清单项记成待办、长段叙述记成灵光）。要 `intake` 声明它收哪类内容，是改合同。
7. **第 16 节状态表有几行是旧的**：R1、R6、R12、R14、R25 这些 W2' 已经做了，表没更新。接手时先按 §21.6 核对一遍再改表。

## 下一片原本打算做什么

#730 之后本来打算做 W4 的下一批创建入口（Pages、Inbox、Goals），以及 F2 的 `find`。这一片还没写计划，也没发统筹。

## 已批、还没做的

- **F2 追加的 `find`**：用 `search.references@1` 和宿主的 `confirmReferences`（`horizontal/search/src/references.ts`），不另写（统筹 10-15）。
- **#720 的一条小意见**：PICK-05 里放行判断之后等的那 500 ms，以后改成等「回复已作废」这个事实。
- **§21.5 里已定的规则，接手时照着做**：
  - 只有规则时只推一个去处：按目录顺序挑，不点名插件。
  - 直接建要同时满足：撤销此刻可用，不是 `proposes`，不是 `multiple`，没有缺的字段。
  - 撤销只经主人自己声明的 `undo`，令牌按 S-40。

## 要注意的坑

- **字节放行**：
  - `workbench.js` 只许变小。必须的增长要写进 PR，统筹审过后在 `APPROVED_CEILINGS` 加一次性放行。
  - 每次 merge main 都要按新的 merge-base 重新取键。用过的那一对移进 `tests/page-assets-budget.test.ts` 的已用名单，有界用例也换成新的。
  - 浏览器脚本里的注释发出去时会被去掉，挪注释省不出字节。
  - 超过 10 KB 或新增资源，要先问用户。
- **ActionView 的 provider_id**：真实目录里只在 `view.provider.provider_id`，视图顶层没有。假目录两处都写了，所以假目录测不出这个问题；W4-1 在真 Host 上撞过一次。
- **编号**：安全不变量必须连续，在途 PR 预占的号要等前面的合入。BL 号开 PR 前先查在途 PR 有没有占用：这次 BL-171～173 被 #728 占了。
- **合同里的空选项**：offers 查询可以没有自己的选项，前提是它是某个入口或追加的 `prepare`。这条检查在 Manifest 一级（`inspectContextDeclarations`），不在单个定义那一级。
- **只看浮条的断言**：只有规则时，一段文字的第三个推荐位是去处，原来的第三个动作挪进了「更多」。e2e 找按钮要把 `.mw-ctx-menu` 一起找。
- **时序**：
  - CI 绿、本机绿，不代表时序没问题，慢机上判断回来得晚。
  - 要复现，就在页面里扣住 `/api/contextual/judge`，过了关键一步再放行（PICK-05 就是这样复现的）。
  - 以后新加任何收起浮条的路径，都要调 `bus.hush()`。
- **浏览器用例**：本机有全量在跑时，几个用例一起跑会超时。比对时串行跑。
- **改了 `skills/` 或源码之后**：跑安装类测试前先整体 `pnpm build`，否则构建指纹对不上。
- **叠着的 PR**：下层被 squash 合入后，上层 merge main 时取本分支那一侧，只适用于 main 上只有那个下层 PR 动过的文件。先用 `git log <旧 merge-base>..origin/main -- <文件>` 查；`SECURITY-INVARIANTS.md` 差点因此丢了 S-27/36/37。
- **停进程只按 pid**：本线用 `pkill -f` 停健康检查时，可能误伤过别的会话。
- **`git checkout <文件>`** 会冲掉自己没提交的改动。做变异检查前先提交。
- **String.raw 页面程序**：注释里不能有反引号。
- **窗格消息**：e2e 里从顶层调 `pane.postMessage` 时，消息的 source 是顶层；要伪造窗格发来的消息，得在窗格里注入 script。
