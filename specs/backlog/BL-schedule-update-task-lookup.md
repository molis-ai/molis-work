# BL-schedule-update-task-lookup

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-schedule-update-task-lookup | `schedule.tasks.update@1` 为了在改动没写 `repeat` 时保住原来的重复方式，用 `ports.listTasks().find(...)` 找这一条任务：读出全部任务，并为每条各查一次轮次（`plugins/native/schedule/src/actions.ts` 的 `updateTask`）。应给 Schedule 的端口加一个按 id 读一条的 `getTask`，只读这一条 | 第 17 批评审台复审（PR #2058，头 b58f377d6a，小修第 1 条） | 明确后续做 | 只影响编辑一次任务的那次调用，任务数量小；加端口要动宿主侧 Schedule 端口的实现与用例，不随本批做 | 无。执行批次 [96-1](../post-anticorruption-roadmap/reference/batches/96.md#batch-96-item-1)。 | 低 | C 轨（执行会话待分配） |

本项验收（2026-11-18）：编辑一个定时任务只读取该任务，验证没改重复规则时原规则保留。

<a id="pre-work-check"></a>

## 开工前检查（第 96 批，两项合写；2026-11-19，评审退回后按平台页面刷新改写）

两项都只动 Schedule 插件自己的任务与页面，开工前检查写在这一处，[BL-schedule-detail-refresh-after-failed-round](BL-schedule-detail-refresh-after-failed-round.md) 链到这里。

| # | 结论 |
| --- | --- |
| 1 事实主人 | 对话任务与它的每一轮归 Schedule（`schedule_conversation_tasks`／`_turns`），下次时间归平台调度服务、经 Schedule 的端口读。没有新事实、没有第二个主人。 |
| 2 插件同等待遇 | 只用 SDK 已有的能力：服务端 `services.ui.invalidate()`、页面 `scope.watchRevision`（PG-061，Files／Git／Coding 已在用）与 `readDocument`。宿主与外壳不改，第三方插件用同样的办法也做得到。 |
| 3 能力注册 | 不新增动作。96-1 只改 `schedule.tasks.update@1` 的处理器内部读法。 |
| 4 合同 | 动作合同与版本不变。Schedule 自己的端口接口 `ScheduleActionPorts` 加 `getTask`，仓库里所有实现与测试替身一并改。不改平台合同。公开的 `UiClientScope` 类型里没写 `watchRevision`（运行时有），Schedule 照 Git／Coding 的先例在自己的类型里补写，平台合同补齐另记 [BL-ui-client-scope-watch-revision](BL-ui-client-scope-watch-revision.md)。 |
| 5 放在哪个包 | 全在 `plugins/native/schedule`。 |
| 6 表与存储 | 不建表、不改表；`getTask` 用已有的按编号读取。 |
| 7 兼容与迁移 | 不涉及。 |
| 8 安全边界 | 不涉及：`invalidate()` 只让自己已打开的页面重读，不带内容；页面读的仍是带身份的页面文档。 |
| 9 调用次数 | 96-1：编辑一次从「读全部任务及其各自的轮次」降到「读这一项」。96-2：页面在屏幕上时每 2 秒核对一次不透明的页面版本（平台已有的轮询，不在屏幕上不读）；只在一轮落地、或后台把任务停下／改了下次时间时推动版本，页面才重读一次。 |
| 10 升级与数据 | 不涉及：数据形状不变。 |
| 11 成果与过程项 | 不涉及。 |
| 12 页面、外壳与文字 | 复用既有详情与失败那一轮（「到点了，但这一轮没跑成：原因」）；停下的任务改写「未排期」（已有的 `schedule.label.not-scheduled` 键，中文由「尚未排期」改为「未排期」）。没有新 DOM 事件；页面资源只有 Schedule 客户端脚本 +864 字节（`tooling/gates/page-asset-allowances/96-schedule-round.json`）。 |
| 13 错误 | 复用 `schedule.task_not_found`。 |
| 14 冲突面 | 只碰 Schedule 包。第 95 批也改 `runtime-reconcile.ts`（相邻一行），合并时手工合；其余文件不同。 |
| 15 全局最优 | 见下。 |

**五个场景与平台能力检查（第 4.1 节）。** 插件：「后台工作结束后，开着的页面跟着变」平台已有 PG-061（`services.ui.invalidate()` + `scope.watchRevision`），Files、Git、Coding 在用，Schedule 接上同一处。平台：不需要新能力；只发现公开类型少写了 `watchRevision`，另记一项。助理：不受影响。各类平台能力：观测采集已有 `io.molis.work.schedule.task_turn`，不重复。后续开发：55-1 的日历重复规则改的是到期计算，本批只在结果写回后推动页面版本，不受影响。结论：**用现成的**。

**比较过的做法（96-2）。** ① 到点后反复重读整页：每次读全部任务，违反第 9 项；② 页面按任务到点时间轮询一个新增的「读一项」动作（第一版做法）：自造了一条平台已有的刷新通道，评审退回；③ 选定的：一轮写回与后台改任务时 `services.ui.invalidate()`，页面用 `scope.watchRevision` 重读。
