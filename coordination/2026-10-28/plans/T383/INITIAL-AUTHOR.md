# T383 Pages reload 一次有界诊断

状态：**本地 E 上的完整文件 4/4 通过，两次 reload 均未复现历史超时；没有修复候选，历史首败因果仍 UNKNOWN。** 本轮执行有一项机器槽偏差，见下文；因此不能把这次执行签成 RAC-2814 的全部环境要求已满足。没有推送、GitHub 写入、Full 或真实 Home/模型操作。

## 输入与历史原件

- 已采用 main E=`328d5b612ef47214378ecd55e32a648228c120f3`，tree=`80719ba7dc19a4aa7b7b2b09f87229673a539d96`；开工 `git ls-remote origin refs/heads/main` 回读同 E。独立工作树 `/private/tmp/t383-dev`、分支 `feature/t383-pages-reload`，结束时 HEAD=E、工作树干净。E 与保留的 T381 H `469dafa192ac26e7894020958b75f61d20cd2eb2` 同树。
- 23 个 open PR 的完整文件锁清单 `/tmp/t383-locks.json`：Pages 测试无交集，#1101 仅在本任务相关路径中碰共享 `tests/fixtures/goal-browser.ts`。本轮只临时改 `tests/pages-actions.e2e.test.ts`；未碰 fixture、test-kit、生产代码。
- T377 Full41253219144/job124690868164：H `95ea9f1f6f0126fc81feea9c78dce4e1dbb54823`，实际 checkout 同树；[完整原件](/private/tmp/t377-verify/full/124690868164.log)、[核收](/private/tmp/t377-verify/PAGES-FIRST-FAILURE.md)。1440px 首轮失败，文件 3/4，`reloadPage` 等待 30 秒后页面诊断 `Runtime.evaluate` 又超时 15 秒；整文件 retry 4/4。
- T116 Full41260457165/job124712459625：H `7977190e1889b8583310db2423788e88aff6be1d`，实际 checkout 同树；[完整原件](/private/tmp/t116-current-verify/ci/full-124712459625.log)、[核收](/private/tmp/t116-current-verify/FIRST-FAILURES.md)。390px 首轮同一 reload 边界失败，文件 3/4，同类 30 秒等待与诊断 15 秒超时；整文件 retry 4/4。两次首败不能因 retry 或本轮本机通过而改签为首轮通过。
- E 源码摘要独立重算为 `c75b962c1bff4d1f6eccdb3e12e3c022e32b2c6e5523b22272f80631d83c11dd`，与复用构建的 `dist/.molis-work-build.json` 完全相等；构建来自同树 `/private/tmp/t381-verify/wt`。`binding.json` 留原 manifest、环境和命令。离线冻结安装成功。当前输入为 macOS Darwin 25.3.0 arm64、Node 24.14.0、pnpm 11.9.0、专用 Chrome for Testing 153.0.8010.12；旧 Linux Full 的浏览器具体版本未在本报告核到，不能按当前版本倒填。

## 当前真实时间线

临时监听仅在 Pages 测试本地。每个 reload 前先取 `Target.getTargetInfo`、`Page.getFrameTree`，顶层均为无 parent 的 page target/frame，并记其旧 loader、7 个子帧；订阅完成后，在顶层 session 上成功启用 `Page.setLifecycleEventsEnabled` 与 `Network.enable`，再进入原有 `navigate(() => command("Page.reload", {ignoreCache:true}, sessionId))` 等待路径。下表为各次观测起点起的单调毫秒及 raw 序号；Document/DCL 只认同顶层 session+frame+新 loader。`Page.domContentEventFired` 本身没有 frameId，不单独作为顶层 DCL 证据。

| 顶层事件 | 1440px | 390px |
| --- | ---: | ---: |
| Page.reload public `command` 调用 / 应答 | #51 20.927 / #54 22.518 ms | #51 4.856 / #54 5.763 ms |
| 新 loader Document 请求 / 200 响应 / loadingFinished | #55 24.854 / #56 183.055 / #99 232.599 ms | #55 7.701 / #56 190.984 / #99 827.306 ms |
| 新 loader、无 parent 的顶层 `frameNavigated` | #58 211.750 ms | #58 382.696 ms |
| 当前 session 的无 frameId `domContentEventFired` / 原 `navigate` 返回 | #148 873.809 / #149 873.825 ms | #148 830.055 / #149 830.071 ms |
| **同顶层 frame + 新 loader 的 lifecycle `DOMContentLoaded`** | #150 873.905 ms | #150 830.146 ms |
| 后续顶层 `getFrameTree` 成功，同一新 loader | #186 1012.687 ms | #186 956.874 ms |

1440px 绑定为 session `29BE24261CD603EC33FD11C5515563A9`、frame/target `C6509B9EBCD6549DDE70DD28160F7506`、旧 loader `C22802A672EA48BE780834C9E08DAA0D`、新 loader `BF6B2C920544E878423AF600F657852C`；390px 分别为 session `5793A4D06DC3A3318BEE4D6BBAB7D070`、frame/target `E1DCEF6BA5D877C71E7C1333C0C071C8`、旧 loader `7FC583B0254F54F7201253D9FEA45EDA`、新 loader `F175EDB834B4C9BA3CB703A903059215`。`timeline.json` 是从 raw 独立按此判据提取的摘要。

启用 lifecycle 时收到的旧 loader `commit`/`DOMContentLoaded`（两次均 #4/#5）属于快照回放，**未**计入 reload。两次还各有 13 个非顶层 frameNavigated 与 1 个子帧 Document 请求；它们与顶层分别记录，未借其 DCL 补顶层。观察窗内无 `Page.javascriptDialogOpening/Closed`、`Target.detachedFromTarget`、target crash 或 `Inspector.targetCrashed`；这一点只描述当前运行。顶层 `Page.getFrameTree` 在 reload 后正常应答，后续全部 Pages 恢复、命名、冲突保存断言通过，说明本轮 renderer 后续可操作。当前 public API 不暴露 CDP wire send/命令 id/socket close，三项仍 UNKNOWN。没有 target/session 换代的当前事件；若旧首败发生换代，本轮不能替它重建映射。

预读状态探针在顶层查 `[data-pages=workbench]`，它实际位于插件 iframe，因而 `unsaved:null/saveStatus:other` **没有有效归属，不能解释成已保存或未保存**。原测试在 reload 前通过插件 iframe 验过“已保存”，并从 Pages owner store 读回插入的正文；当前观测未额外证明顶层 `data-assistant-context.unsaved` 的当时值。测试日志有 `workspace-settings opened_announce_failed/actions.missing` 警告，与两次成功 reload 无已证因果，旧首败亦不能据邻接日志归因。

## 执行、偏差和清理

唯一一次完整文件执行：`node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/pages-actions.e2e.test.ts`，退出 0；PAGESCTX-05、1440px、390px、只读冲突例全部通过，4 pass/0 fail/0 skipped/0 cancelled/0 todo，32.105 秒。无筛选、无 retry、无 dialog 自动接受、无超时修改。原文 `test.log`、退出码 `test.exit`、全部 374 行 `events.jsonl`、提取 `timeline.json`、两张测试截图 `screenshots/` 与临时 `diagnostic.diff` 均保留。当前执行环境使用独立系统 HOME/CFFIXED/XDG、file secret backend、ad-hoc 签名、独立 Home/profile 与专用 Chrome。fixture 自然 teardown 后无本次残留 Home/profile；临时测试逐字还原，结束工作树 `git diff --exit-code` 通过；九个本任务系统环境目录已按准确路径清掉，截图由工作树忽略区移入证据目录，见 `cleanup.json`。没有按名称批量终止任何进程。

**机器槽偏差：** 实际完整启动命令含全部环境值见 `command.txt`；关键是 `TMPDIR=/private/tmp/t383-diagnosis/tmp/`，而没有 `MOLIS_WORK_SLOT_DIR`。`scripts/machine-slot.mjs` 默认槽为 `os.tmpdir()/molis-work-slots`，所以本次浏览器运行取得的是 `/private/tmp/t383-diagnosis/tmp/molis-work-slots` 私有槽，离线安装同样取得私有 build 槽；公共槽实际位于 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-work-slots`。这不符合指定公共槽约束。

`test.exit` 文件 mtime 及 TAP 32.105 秒时长推定测试约在 **2026-10-31 19:49:29.8–19:50:01.9 PDT** 执行；这是执行窗口估算，**不是**持槽精确起止。清理前实际见私有 `browser.queue` mtime 为 19:49:29。默认公共槽在开跑前和结束后交互读取均为 free；结束后默认 `browser.queue` mtime 仍为 19:29:23、`build.queue` 为 19:32:16。这支持“在可见的默认槽队列里没找到本次窗口的活动”，但不能排除其他进程绕过/另设槽。19:53:25 的 `ps` 只确认**结束后**无 T383 或 Chrome 测试进程，不能还原运行中的并发情况。可复核的有限核查写在 `slot-audit.json`；没有运行期间全机进程快照，**不能证明无并发**。结果仍可用于本轮事件事实，不能签公共槽约束已满足；未自行启动第二轮。今后若根另行授权自然执行，应同时设隔离 TMPDIR 和公共 `MOLIS_WORK_SLOT_DIR`（以当次宿主 `os.tmpdir()` 复核）。

RAC-2813：E/tree/build、两旧原件、本轮 public 调用/应答与顶层 frame/loader/Document/DCL 分层记录已交；旧失败命令应答、CDP socket 与旧 renderer 状态 UNKNOWN。RAC-2814：完整 4 例一次自然运行与 raw 已交，公共槽一项不合格。RAC-2815：临时观测已撤、证据与清理已交；**无已证根因或修复**。最小下一裁定由根决定：若要关闭历史 UNKNOWN，在下次本来就计划的 Linux 完整文件执行中带同等被动观测，且正确绑定公共槽/运行环境，优先取实际首败的命令应答与顶层 loader/renderer；本轮本机成功不足以选择产品或夹具修复点，不安排概率复跑。
