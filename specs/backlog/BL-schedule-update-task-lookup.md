# BL-schedule-update-task-lookup

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-schedule-update-task-lookup | `schedule.tasks.update@1` 为了在改动没写 `repeat` 时保住原来的重复方式，用 `ports.listTasks().find(...)` 找这一条任务：读出全部任务，并为每条各查一次轮次（`plugins/native/schedule/src/actions.ts` 的 `updateTask`）。应给 Schedule 的端口加一个按 id 读一条的 `getTask`，只读这一条 | 第 17 批评审台复审（PR #2058，头 b58f377d6a，小修第 1 条） | 明确后续做 | 只影响编辑一次任务的那次调用，任务数量小；加端口要动宿主侧 Schedule 端口的实现与用例，不随本批做 | 无 | 低 | C 轨（执行会话待分配） |
