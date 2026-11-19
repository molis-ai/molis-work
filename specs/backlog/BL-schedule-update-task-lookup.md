# BL-schedule-update-task-lookup

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-schedule-update-task-lookup | `schedule.tasks.update@1` 为了在改动没写 `repeat` 时保住原来的重复方式，用 `ports.listTasks().find(...)` 找这一条任务：读出全部任务，并为每条各查一次轮次（`plugins/native/schedule/src/actions.ts` 的 `updateTask`）。应给 Schedule 的端口加一个按 id 读一条的 `getTask`，只读这一条 | 第 17 批评审台复审（PR #2058，头 b58f377d6a，小修第 1 条） | 明确后续做 | 只影响编辑一次任务的那次调用，任务数量小；加端口要动宿主侧 Schedule 端口的实现与用例，不随本批做 | 无。执行批次 [96-1](../post-anticorruption-roadmap/reference/batches/96.md#batch-96-item-1)。 | 低 | C 轨（执行会话待分配） |

本项验收（2026-11-18）：编辑一个定时任务只读取该任务，验证没改重复规则时原规则保留。

<a id="pre-work-check"></a>

## 开工前检查（第 96 批，两项合写；2026-11-19）

两项都只动 Schedule 插件自己的任务与页面，开工前检查写在这一处，[BL-schedule-detail-refresh-after-failed-round](BL-schedule-detail-refresh-after-failed-round.md) 链到这里。

| # | 结论 |
| --- | --- |
| 1 事实主人 | 对话任务与它的每一轮归 Schedule（`schedule_conversation_tasks`／`_turns`），下次时间归平台调度服务、经 Schedule 的端口读。没有新事实、没有第二个主人。 |
| 2 插件同等待遇 | 只用 SDK 已有的页面能力（`invokeAction`、`readDocument`），宿主与外壳不改，第三方插件用同样的办法也做得到。 |
| 3 能力注册 | 新增一个查询动作 `schedule.tasks.get@1`，在 Schedule 的动作声明里注册一次，页面、Agent、MCP 用同一份；身份取自调用上下文，项目不一致照旧 `actions.scope_mismatch`。只读本库，不等模型，不需要 `concurrent`。 |
| 4 合同 | 动作合同加一项（`tooling/gates/actions/actions.tsv` 由 `pnpm actions:update` 生成，`tooling/versions.json` 加 `action.schedule.tasks.get`）；端口接口 `ScheduleActionPorts` 加 `getTask`，仓库里所有实现与测试替身一并改。不改平台合同，不单开合同 PR。 |
| 5 放在哪个包 | 全在 `plugins/native/schedule`；页面和服务端共用的比较值放在不依赖 DOM 与数据库的 `src/round-stamp.ts`。 |
| 6 表与存储 | 不建表、不改表；`getTask` 用已有的按编号读取。 |
| 7 兼容与迁移 | 不涉及。 |
| 8 安全边界 | 不涉及：新动作与已有的 `tasks.list` 同权限（`schedule:read`）、同项目检查。 |
| 9 调用次数 | 96-1：编辑一次从「读全部任务及其各自的轮次」降到「读这一项」。96-2：只在详情开着、页面在屏幕上、到点之后才读，每次只读这一项（一次库读、一次调度读），间隔 2 秒起翻倍到 60 秒、最多半小时；轮次落地后重读页面一次（与编辑后一样），「能读的数据」区域不关不开，省掉一次平台区域的放置。页面在后台不读。 |
| 10 升级与数据 | 不涉及：数据形状不变。 |
| 11 成果与过程项 | 不涉及。 |
| 12 页面、外壳与文字 | 复用既有详情与失败那一轮（「到点了，但这一轮没跑成：原因」），不新增文字；停下的任务改用已有的「尚未排期」。没有新 DOM 事件；页面资源只有 Schedule 客户端脚本 +1,662 字节（`tooling/gates/page-asset-allowances/96-schedule-round.json`）。 |
| 13 错误 | 复用 `schedule.task_not_found`。 |
| 14 冲突面 | 只碰 Schedule 包与动作快照、`versions.json`。第 95 批改的是 `missed-runs.ts`、`index.ts`、`runtime-reconcile.ts`，不同文件；`versions.json` 的相邻行由合并驱动处理。 |
| 15 全局最优 | 见下。 |

**五个场景与平台能力检查（第 4.1 节）。** 插件：「后台工作结束后，开着的详情跟着变」别的插件也有（Todo 每分钟读提醒、Pages 在页面重新可见时重查），但现在各自的触发不同、没有第二个等「到点那一轮」的使用者。平台：没有现成的「插件数据变了」推送；为一项 4–8 工时的缺陷造推送通道不划算，[平台能力审查](../../docs/reviews/platform-capability-audit-2026-11-14.md)第 61–65 行排的「后台工作统一投影」落地后，Schedule 可改为读那一处，届时换掉 `browser/round.ts` 一个文件即可。助理：新增的 `schedule.tasks.get` 让 Agent 和 MCP 能按编号读一项任务及它没跑成的原因，不用拉整份清单。各类平台能力：观测采集已有 `io.molis.work.schedule.task_turn`，不重复。后续开发：55-1 的日历重复规则改的是到期计算，本批只读结果，不受影响。结论：**用现成的**（动作目录与页面的 `invokeAction`），推送通道**不收**，理由如上。

**比较过的做法（96-2）。** ① 到点后反复重读整页：每次读全部任务，违反第 9 项；② 新开推送通道：平台改动大、只有一个使用者；③ 选定的：到点后只读这一项，变了才重读整页一次。
