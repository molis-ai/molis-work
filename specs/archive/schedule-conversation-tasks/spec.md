# Schedule 对话态定时任务

状态：本切片已在本地 Web 验收。完成等级 **3：功能可用**。不提交、不发布。

## 背景目标

Schedule 现在只展示其他插件登记的闹钟。一骏要一条人手创建的入口：填标题、说明、每天几点；创建后是这条任务自己的对话，不是现有 Coding/Session。到点后 Agent 在这条对话里无人值守跑一轮（默认只读）；勾了「重要更新」且 Agent 认为值得看时，列表标出来。其他插件登记的 job 仍在同一工作面，闹钟层继续是 dumb one-shot。

## 当前行为与问题证据

- `plugins/native/schedule` 只有 list / pause；空态写「这里只负责闹钟」。
- `specs/archive/schedule-plugin/spec.md` 明确「不让用户在 UI 里手写任意任务」。
- 横向 Scheduler 只支持 `once` / `interval`，最短 5 秒；没有日历日、没有对话、没有 Agent。
- Inbox subject CHECK 只有 `feed_item|goal_decision|source_fault`，扩 subject 会改 Attention/Inbox 合同。

## 范围与非目标

做：

1. Schedule 工作面「新建定时任务」：居中 `mw-dialog--form`，字段为标题、说明、每天本地时间、重要更新开关。
2. 每条任务一张自己的对话（说明作为首条用户发言）；详情是对话，不是闹钟收据页。
3. 用 Scheduler `once` 登记下一拍本地 HH:MM；叫醒后按日历再挂明天同一时刻。
4. 到点 invoke Schedule 自己的 wakeup：跑注入的 `ScheduledTaskRunner`（测试用假实现；生产走 Agent Host 只读角色）。
5. 默认只读。写入仍走现有审核队列；无人值守遇到要人确认的停顿则取消本轮并在对话里说明。
6. 重要更新：Agent 回复第一行 `IMPORTANT: yes|no`；yes 且开关打开时列表标「有更新」，打开详情清除。
7. 其他插件的 job 仍可暂停/恢复，列表放在「其他插件的闹钟」分组，不跟对话任务混成同一行。

不做：

- 自然语言填完整张表、cron 编辑器、挂到已有 Coding/Session、Automation 模块、Feed 调度迁移。
- 本切片不扩 Inbox subject。开关先作用在 Schedule 列表；Inbox 引用 later。
- 不在对话里即时追问并立刻再跑一轮（later）。
- 不改 Settings 模型管理。

## 使用场景

1. 空列表点「新建定时任务」，填「每天 09:00 汇总未读」，创建后进入这条对话，能看到说明。
2. 把钟拨过点：handler 被调用；对话出现一轮助手回复；job 变成明天同一本地时刻。
3. 暂停后不再到点跑；恢复后按下一拍本地时间继续。
4. Agent 标 important：列表出现「有更新」；打开详情后标记消失。
5. 没有 Runtime / 没有工作区 / 跑失败：对话留下系统说明，收据为失败，明天仍会再响。
6. 其他插件登记的闹钟仍在列表里，点开仍是原来的收据页。

## 方案与关键决策

- 横向 Scheduler 仍是 one-shot。日历日由 Schedule 产品层计算 `nextDailyLocalDue`，叫醒后重新 `register` 同一把钥匙。
- 长任务执行前先把 job 推到下一拍或关掉 once，避免 30 秒租约过期后重叠叫醒。
- 对话和任务存在项目 sqlite：`schedule_conversation_tasks` / `schedule_conversation_turns`。job 的 `object_ref` 等于 `task_id`。
- 生产 runner 需要已注册 Runtime 且项目已绑定已校验工作区；缺一就写明原因，不假装跑过。
- UI 延续 Coss Operate：plugin-stage 列表 + 居中创建对话框 + 详情阅读列。不新做一套聊天气泡世界。

## 输入输出与依赖

创建输入：`title`、`instructions`、`hour`、`minute`、`notify_important`。

输出：任务记录、对话回合、绑定的 Scheduler job、wakeup 收据。

依赖：项目 sqlite、Web 进程内 timer、已注册 wakeup handler、Agent Host（生产）、现有 plugin-stage 与 `mw-dialog--form`。本地 Web 没开时闹钟不响。

## 文件 / 模块边界

允许：

- `specs/archive/schedule-conversation-tasks/spec.md`
- `specs/archive/schedule-plugin/spec.md`（指向本 spec，收回「不能手写任务」）
- `plugins/native/schedule/**`
- `horizontal/scheduler`：叫醒前推进 next_due，避免长 handler 重叠
- Host：local-host 装配 handler、HTTP、tick、Agent runner、web view fingerprint
- Workbench：catalog Agent 声明、page view、projection、stylesheet
- 对应测试、README、SSOT 一行

## 验收标准

1. 工作面有「新建定时任务」；提交后列表出现该任务，详情是对话且首条是说明。
2. 创建会登记 Schedule 自己的 once job，`due_at` 为下一个本地 HH:MM。
3. 拨钟过点后 runner 被调用一次；对话多一轮助手回复；再登记的下一拍是明天同一本地时刻。
4. 暂停后 tick 不再跑这条；恢复后继续。
5. `IMPORTANT: yes` 且开关打开 → 列表「有更新」；打开详情后消失。
6. runner 抛错 → 对话有系统说明，wakeup `failed`，任务仍启用并排到明天。
7. 其他插件 job 仍能列出、暂停；不会在对话任务行里重复出现。
8. 空态不再说「这里只负责闹钟」。
9. 创建对话框是居中 `mw-dialog--form`，控件用现有 `mw-*`。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-service-scheduler --filter @molis-ai/molis-work-plugin-schedule --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/scheduler.test.ts tests/schedule-plugin.test.ts tests/schedule-conversation-tasks.test.ts tests/schedule-task-runner.test.ts tests/i18n.test.ts
```

浏览器：打开已启用 Schedule 的项目，新建一条任务，看对话框、列表、对话详情；不要求真的等到明天 09:00。

## 假设与开放问题

- 本地时区以 Host 进程为准。
- 生产路径在无 Runtime 或无工作区时诚实失败，测试用假 runner 证明叫醒链。
- Inbox 引用 later；本切片通知停在 Schedule 列表。
- 自然语言填表 later。
