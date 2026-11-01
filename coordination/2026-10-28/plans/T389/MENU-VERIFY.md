# T-389 阶段 2 · 独立只读核验

结论：**受控实验在固定当前 main 输入上成立为第①类**：一次公开 Goal 写入引出真实 compact board refresh，Response 暂挂时用户原生打开的同一 Feed 来源菜单，在原样放行且页面完成可观察恢复后关闭。本结论仅证明该输入、该 390×640 受控交错可丢菜单打开状态；不证明旧 Linux `Hidden custom_rss` 的原因、自然频率、390 专属、chooser 被关闭或 add 的点击失败。未运行本线实验/构建/GitHub，也未改产品与共享 helper。

## 输入、前置修正和执行量

- 本线从 `/private/tmp/t389-menu-dev` 重读 Git HEAD=`15ad4f397018241c8b31625aff8014b89259f239`、tree=`eca97df70b0c53182d70b32ba184508ac1a4f996`，目前 clean。构建来源 `/private/tmp/t369-dev` 为 `89119b9c07c0910f39cfc42beb3fc729c6ee1808`，相对 M 只差 `tests/mcp-connection-change-refusal.test.ts`，不能称来源整树为 M。按 `fingerprint.ts` 的路径/模式/排序独立重算两树生产摘要，均为 `1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`，等于 manifest；两树所有 11,311 个 dist 文件相对路径和逐文件 SHA-256 完全一致。作者的 `prepare-result.json`、`business-M-result.json` 记录六个 public 包在本树 dist 的实际解析，build/browser holder 在对应完整子进程前后是同一 pid/since；`prepare.exit`、`business-M.exit` 均为 0。
- 首次启动 `attempt-1/` 的 `seedDemoBoard` 未建 Goals board，fixture 在首次 `boardSnapshot` 即报 `goals.board.not_found`；原测试 exit1、没有对照/Goal POST/响应暂挂，保留为前置失败。根在同一 WO 明确准用现有 `seedBoard` 后，`initialization-only.diff` 仅将 import 和 `openGoalBrowser` 参数各换一处。M 上该 fixture 的 `seedBoard` 初始化空 Goals board、不造样例 Goal；实际实验仍只有一次公开 Goal POST。保存的 `probe-corrected.ts` SHA-256=`80d48011a2313e84115890b3bcf4e09502268cd79750296d213f315ea1cd755c`，与 `corrected-binding.json` 一致；`probe-corrected.diff` 只新增临时 probe，原 journey、共享 helper 和生产源码未改。工作树已移除 probe。业务 `business-M.log` 的完整单文件为 1 pass/0 fail/skip、`--jobs 1 --retries 0`，没有第二轮业务实验。

## 原始链与菜单判据

- `experiment.json` 原始序列：无刷新对照时页面/公开 cursor C0=1，同一 Feed 根/菜单/rail add/dialog 引用，summary 和 rail add 的 `pointerdown/up/click` 均为 trusted；chooser 确实打开，原生 close 后回 messages，对照期间 `compactCount=0`。处理段仅一次公开 Goals HTTP POST，返回新 Goal id=`28f110e3-e18e-4e41-a3e3-98b8d0a1e583`，公开 cursor C1=3。
- 自然网络序列为本 project 的 attention GET `51301.42` → `boardCursor=3`、board cursor GET `51301.43` → observed=3、collection=current/无 goal_id 的 compact GET `51301.44`。Response 阶段唯一暂停 `interception-job-3.0` 与该 networkId 对应、HTTP 200；`Fetch.getResponseBody` 只提 project/cursor=3/新 Goal 存在，正文未落盘；暂停时页面仍 C0=1。暂停期间一次 trusted summary click 使当前菜单 `open=true`，释放前截图与同侧快照一致。仅一次 `Fetch.continueRequest` 原样放行，36.855ms 后回执；随后同一 compact 得 200。无第二份 compact/fallback、导航、成员变化、Fetch 错误或浏览器侧 refresh warn/Runtime 异常记录。网络事件和真实 response 字段支持“公开写→自然 attention→cursor→compact”，并非仅靠时间邻近推断。
- 放行后的同一 task 后快照为 cursor=3、新 Goal 出现在公开页面 state、同 body/Feed/menu/summary/add/dialog 引用均连接，当前 Feed tab、task=all、source 仍空、dialog 仍关、页面可见。workspaceMode 从 focus 到 graph，与 M 的 `applyUiState` 后置恢复路径吻合；graphLoaded=false，未走异步 graph 加载；`documentSyncing=false` 但它放行前也为 false，**不能单凭该项声称 rAF 收尾已发生**。M 代码的 marker 写入后同步调用 `applyUiState`、关系/事件绑定，捕获异常时会报 `Goal refresh failed`；本次观察窗口没有这条浏览器警告/Runtime 异常。上述组合支持正常恢复已越过菜单状态恢复位置，而不只凭 cursor marker 判提交。
- 释放前当前菜单 `open=true`；放行后**同一菜单引用** `open=false`，没有新的 trusted summary/close/choice 事件，且无菜单替换、导航或成员变更。M 的 `applyUiState → setFeedPreset → setFeedTask` 静态路径即使 task 仍为 all 也 `removeAttribute('open')`，与这次受控现象一致；未加内部 hook，故不冒称逐调用的动态 trace。两张 PNG 本线实际查看，均为 390×640：`before-release.png` 菜单展开并显示 rail add，`after-commit.png` 同页面菜单收起。`after` 的 `addVisible=true`、非零 rect 不能证明 rail add 可点击：关闭的 `<details>` 中该测量仍非零，截图显示菜单收起，probe 按合同没有在关闭后点 add。不能把本结果写成一次 add 点击失败。

## 警告、污染和清理边界

`business-M.log` 有一条 Host 侧 `workspace-settings/opened_announce_failed`、`ActionError actions.missing` 警告；这是**实际发生的警告**，不能写成全程无警告。它与浏览器侧 `Goal refresh failed`/Runtime 异常不同；原件没有证明它影响菜单，也没有证明完全无影响，保留为并存事实。`experiment.json` 的 `failures=[]` 与无 `pollution` 只覆盖探针所监听的浏览器/网络/页面边界；控制闸门和观测本身改变交错，不测自然出现率。

作者终态 `REPORT.md` 的“观察并等待既有生产收尾 rAF 移除 is-syncing / 已完成”表述超出单项原件：该 class 在放行前及放行后都为 false，等待条件本身不能证明 rAF 曾执行或收尾动作发生。应将它表述为“后态未处于 syncing”，以 cursor+新Goal、workspaceMode 的后置变化、同 task 后快照及无浏览器恢复 warn/异常共同支撑正常提交；无需因此否定本次菜单关闭结论。

`experiment.json` 的 finally 记录 `Fetch.disable`、页面监听移除、回调 settle 均成功，pending 无剩余项；`business-cleanup.json` 记 fixture Home/自有进程为空、九个 runtime 子目录删除、公共槽当时 free、无手动 kill。独立回读 fixture Home 和九目录均不存在，本树 Git clean，截图均非空。Foundation 原生临时路径未单独测量，隔离声明按作者限定。

当前可向根交付的是**菜单状态丢失的当前 main 受控证据**及清晰的产品修复候选方向，不是已授权产品修法或永久回归。旧 T385 Linux 首败及阶段 1 H/M 未复现仍分别保留；根若要修复，须先更新同一 WO，再由作者按新范围实施并独立验证。
