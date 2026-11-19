# 22 条 Backlog 的正式排期与开工安排

2026-11-18 · 对象是上一轮在原 470 条里找到的 22 条「未排批、可独立实施」事项。包括原来直接可做的 18 条和拍板后可做的 4 条。逐项需求以 [Backlog](../../../BACKLOG.md) 为准。已按用户确认更新执行目录、批次交付行和对应 BL，实际认领看 [协调单 #1743](https://github.com/molis-ai/molis-work/issues/1743)。

**7 条已并进现有 6 个子批，另外 15 条已编为 92～99。合计 105.5–212 工时。** 估算按一位熟悉仓库的工程师完成实现、必要文档和定向验证计算，8 工时为 1 人日，约 13–27 人日。区间上沿主要来自存储升级、跨插件身份、旧记录和隔离实机复验。机器排队、全量回归、评审等待及本人验收另计。

优先安排知识卡恢复，避免索引尚未追齐时按不完整目录清理。第二条线可以做 Feed 睡眠后重复询问，第三条线可以收连接生命周期的回归。要先捡小活时，图片手册与数据库注释合计约半小时到一小时。

[复制第一轮三个会话的开工 Prompt](first-round.md) · [路线书执行目录](../../spec.md#execution-batches) · [决定 56](../decisions.md#decision-56)

## 逐条开工 Prompt

每个链接里有可单独复制的一段开工 Prompt，包含产品决定、代码入口、验收和在途冲突。表内顺序与上一轮清单一致。

| 序号 | 条目与开工 Prompt | 做完后有什么变化 | 工程师工时 | 正式执行项 |
| ---: | --- | --- | ---: | --- |
| 1 | [BL-959](prompts/BL-959.md) | 让步骤详情能读到「谁写了这份汇报」的类型 | 0.5–1 | [53-1](../batches/53.md#batch-53-item-1) |
| 2 | [BL-973](prompts/BL-973.md) | 把图片下载的漏测命令补进手册 | 0.25–0.5 | [92-1](../batches/92.md#batch-92-item-1) |
| 3 | [BL-980](prompts/BL-980.md) | 把「打开数据库会不会创建文件」写准确 | 0.25–0.5 | [92-2](../batches/92.md#batch-92-item-2) |
| 4 | [BL-1006](prompts/BL-1006.md) | 确认页面关掉时，两个正在做的请求各收到自己的取消原因 | 1.5–3 | [93-1](../batches/93.md#batch-93-item-1) |
| 5 | [BL-1017](prompts/BL-1017.md) | 让 Goals 测试即使报错也关干净 | 1.5–3 | [92-3](../batches/92.md#batch-92-item-3) |
| 6 | [BL-1062](prompts/BL-1062.md) | 给连接页的折叠动画补上中途检查 | 3–6 | [36A-5](../batches/36a.md#batch-36a-item-5) |
| 7 | [BL-attention-404-by-code](prompts/BL-attention-404-by-code.md) | 让宿主重启后，旧标签页自己恢复提醒 | 4–8 | [56-1](../batches/56.md#batch-56-item-1) |
| 8 | [BL-browser-socket-close-pending-bind](prompts/BL-browser-socket-close-pending-bind.md) | 关掉侧栏浏览器后，清掉还没挂好的监听 | 2–5 | [93-2](../batches/93.md#batch-93-item-2) |
| 9 | [BL-desktop-same-version-install](prompts/BL-desktop-same-version-install.md) | 重新安装同版本开发 App 后，用上刚编出来的版本 | 6–12 | [94-1](../batches/94.md#batch-94-item-1) |
| 10 | [BL-feed-run-now-missed-again](prompts/BL-feed-run-now-missed-again.md) | 资讯更新点过「现在做」，睡醒后直接做 | 3–6 | [95-2](../batches/95.md#batch-95-item-2) |
| 11 | [BL-feed-sql-driver-name](prompts/BL-feed-sql-driver-name.md) | 把 Feed 连数据库的旧函数名改准确 | 1.5–3 | [95-1](../batches/95.md#batch-95-item-1) |
| 12 | [BL-knowledge-restore-partial-catalog](prompts/BL-knowledge-restore-partial-catalog.md) | 恢复 Home 时，别把还没找到的知识卡删掉 | 8–16 | [73-3](../batches/73.md#batch-73-item-3) |
| 13 | [BL-plugin-cli-dev-uncoded-errors](prompts/BL-plugin-cli-dev-uncoded-errors.md) | 让插件试跑失败时说清楚到底错在哪 | 3–6 | [48-1](../batches/48.md#batch-48-item-1) |
| 14 | [BL-report-rounds-auto-cap](prompts/BL-report-rounds-auto-cap.md) | 助理只汇报结果时，别占用继续干活的次数 | 8–16 | [97-1](../batches/97.md#batch-97-item-1) |
| 15 | [BL-schedule-detail-refresh-after-failed-round](prompts/BL-schedule-detail-refresh-after-failed-round.md) | 定时任务失败时，开着的详情立刻显示原因 | 4–8 | [96-2](../batches/96.md#batch-96-item-2) |
| 16 | [BL-schedule-update-task-lookup](prompts/BL-schedule-update-task-lookup.md) | 编辑一项定时任务时，只查这一项 | 2–4 | [96-1](../batches/96.md#batch-96-item-1) |
| 17 | [BL-tests-umask](prompts/BL-tests-umask.md) | 让备份与恢复测试在两种常见文件权限设置下都测得准 | 3–6 | [73-3](../batches/73.md#batch-73-item-3) |
| 18 | [BL-work-line-report-batch](prompts/BL-work-line-report-batch.md) | 同一项目同时办完几件事，助理合起来报一次 | 8–16 | [97-2](../batches/97.md#batch-97-item-2) |
| 19 | [BL-375](prompts/BL-375.md) | 让两家插件都能提供同一种材料，还能按来源挑 | 12–24 | [98-1](../batches/98.md#batch-98-item-1) |
| 20 | [BL-586](prompts/BL-586.md) | 让两家同名、同编号的插件也能一起打开 | 12–24 | [47-1](../batches/47.md#batch-47-item-1) |
| 21 | [BL-missed-runs-never-expire](prompts/BL-missed-runs-never-expire.md) | 错过的任务统一留七天，到期一次说清跳过了几件 | 12–24 | [95-3](../batches/95.md#batch-95-item-3) |
| 22 | [BL-coding-changeset-deleted-kind](prompts/BL-coding-changeset-deleted-kind.md) | 在 Coding 的本轮变更里列出确实删掉的文件 | 10–20 | [99-1](../batches/99.md#batch-99-item-1) |

## 7 条并进现有 6 个子批

可以独立开始的代码或回归，和整批启动的前置条件分别看。已有人改同一文件时，先把验收样例给现任写手，或等合入后接续。批次文件已收录这些验收，各 BL 也已写回具体交付项。

| 现有子批 | 对应序号 | 合计工时 | 归入原因 |
| --- | --- | ---: | --- |
| [53-1](../batches/53.md#batch-53-item-1) | 1 | 0.5–1 | 步骤板和代写来源本来就在同一交付项，可以一起验收。 |
| [36A-5](../batches/36a.md#batch-36a-item-5) | 6 | 3–6 | 设置与连接折叠正在改同一个浏览器回归，沿在途写手收口。 |
| [56-1](../batches/56.md#batch-56-item-1) | 7 | 4–8 | 提醒唤醒要读到新状态。宿主重启后旧标签页也应恢复提醒。 |
| [73-3](../batches/73.md#batch-73-item-3) | 12、17 | 11–22 | 知识卡与权限样本都属于恢复验收。离线恢复可先修。73-3 再验跨版本、整份 Home 导入。 |
| [48-1](../batches/48.md#batch-48-item-1) | 13 | 3–6 | 作者的隔离试跑会遇到这些失败，可先修 CLI，批内复验作者旅程。 |
| [47-1](../batches/47.md#batch-47-item-1) | 20 | 12–24 | 普通插件和创作台插件共用 Runtime，安装、同时打开和单独停用适合在此验收。 |

## 其余 15 条分成 8 个小批

92～99 是正式批号。箭头表示同批的施工顺序。

| 新小批 | 序号／顺序 | 合计工时 | 如何派 |
| --- | --- | ---: | --- |
| [92 · 文档与测试小修](../batches/92.md) | 2、3、5 | 2–4 | 图片手册、数据库注释、Goals 夹具各有独立验收。同次安排可少开零散任务，仍沿用三个原维护人。 |
| [93 · 关闭页面与连接](../batches/93.md) | 4、8 | 3.5–8 | 都核对用户离开之后的清理。一个管在途请求，一个管断开的侧栏连接，各自复验。 |
| [94 · 桌面开发安装](../batches/94.md) | 9 | 6–12 | 需要 macOS 上两个同版本构建与隔离 Home。与正式桌面签名交付分开排。 |
| [95 · Feed 与错过任务](../batches/95.md) | 11 → 10 → 21 | 16.5–33 | 先做数据库函数改名，再修「现在做」遇休眠，最后接七天到期。共用 Feed 代码和状态，后两项采用同一套已处理语义。 |
| [96 · 定时任务编辑与刷新](../batches/96.md) | 16 → 15 | 6–12 | 一次改后台定位任务，一次改前台查看失败。建议先后台后页面，可各自验收。 |
| [97 · 助理后台汇报](../batches/97.md) | 14 → 18 | 16–32 | 先让只汇报有自己的轮次身份，再让同项目多件事合成一轮。两项共用汇报入口和测试。 |
| [98 · 多插件共用材料类型](../batches/98.md) | 19 | 12–24 | 过程项涉及生产、读取、来源与授权，需要跨两个生产插件验收。单列便于守住固定成果的原合同。 |
| [99 · Coding 删除清单](../batches/99.md) | 22 | 10–20 | 从执行证据到保存、重开和展示走一遍。等在途 Coding 界面落点明确再接显示。 |

## 怎么并行派

下面按独立的执行会话安排，每个会话一个写手。每一行是可以从头做到定向验收的范围，机器上的构建、全量回归与重浏览器测试仍按仓库槽位排队。

| 可同时推进的线 | 先派什么 | 同线后续与避让 |
| --- | --- | --- |
| 知识与恢复 | 12 知识卡恢复，优先验证原卡 ID 和正文 | 17 的前三份权限夹具可由工程流程线独立改，第四份等 #2138。两人各用隔离 Home。 |
| Feed 和定时任务 | Feed 写手做 11 → 10。Schedule 写手可同时做 16 → 15 | 21 的 Feed 部分接在 10 后。开始改 Schedule 的错过处理前，比对两条线的文件和存储版本。到期与「现在做」在同一份测试里验。 |
| 宿主连接与工程小修 | 4 与 8 各自可做。2、3、5 可由原维护人认领 | 4 处理页面请求，8 处理侧栏连接，2、3、5 的修改是独立文件。7 可由工作台线并行，核对宿主 Attention 和工作台读取入口。 |
| 桌面、CLI、Coding | 9 用 macOS 隔离环境。13 从 CLI 入口做。22 先验证后端删除证据 | 三项代码入口不同。22 的界面与逐屏统一 PR #2142 共文件，9 与正式签名工作区分。 |
| 公共合同与插件运行时 | 19 先梳理过程项读写，20 可同时从双插件安装与视图问题开始 | 核对 contracts／SDK 快照，撞到同一出口或快照时顺序提交。1 与 #2123 同文件。6 与逐屏统一 PR #2142 同测试，均沿现有写手。 |
| 助理汇报 | 14 先做计数和存储，再做 18 批量汇报 | 这两张单不能交给两个人同时改同一条汇报链。14 的存储文件先协调 #2138。 |

**如果只有三个执行会话**，第一轮给 73-3 的 12、95 全批（11 → 10 → 21）、93 全批（4＋8）。知识恢复优先级最高，另两条线与它的写入文件分开。后续把释放的会话给 9、19，或已可接手的在途余项。全量回归期间按仓库规矩冻结该工作树的源码和构建。

## 这次核对的依据

代码对照 `origin/main 27b46f17ab93`。工作量是估算。实施状态仍以各 BL、最新主线和认领板为准。

- 第 35 批正在改 `packages/contracts/src/services/agent-host.ts`，与第 1 项共文件。[PR #2123](https://github.com/molis-ai/molis-work/pull/2123)
- 逐屏统一 PR #2142 接续原 #2137，正在改 `tests/connections-page.e2e.test.ts`，与第 6 项共文件。[PR #2142](https://github.com/molis-ai/molis-work/pull/2142)
- 设置采用工作正在改第 17 项的 `tests/home-restore-content.test.ts` 及第 14 项需要核对的 `assistant-store.ts`。它还与 36A-5 共改设置页实现。[PR #2138](https://github.com/molis-ai/molis-work/pull/2138)
- 逐屏统一 PR #2142 接续原 #2139，正在改第 22 项的界面消费者 `plugins/native/coding/src/browser/changeset.ts`。[PR #2142](https://github.com/molis-ai/molis-work/pull/2142)
- 桌面签名另有在途工作，第 9 项的首个检查点是 Home 实际启动的运行程序。[PR #1818](https://github.com/molis-ai/molis-work/pull/1818)

- 92-1 图片手册、92-2 数据库注释、92-3 Goals 夹具已各有 PR。按合入结果核回，认领板保留原写手。[PR #2144](https://github.com/molis-ai/molis-work/pull/2144) · [PR #2145](https://github.com/molis-ai/molis-work/pull/2145) · [PR #2146](https://github.com/molis-ai/molis-work/pull/2146)
