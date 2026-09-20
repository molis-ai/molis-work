# 定时任务插件：只负责闹钟

状态：完成。完成等级 **3：功能可用**。不迁 Feed、不提交、不发布。

## 背景目标

一骏要一个定时任务插件：它自己不执行业务，只到点叫醒别人。其他插件登记任务，并提供执行用的 Capability；闹钟到点去 invoke 那个 Capability。插件之间交换的是事实（Artifact）和现场调用（Capability），不为此发明「函数 Artifact」。

## 当前行为与问题证据

- `docs/SSOT-MATRIX.md` 里 `horizontal/scheduler` 是 `absent`；`packages/contracts/src/services/scheduler.ts` 只有 contract stub。
- Feed 有自己的 `FeedSourceScheduler` 和 Web `setInterval`，不冒充通用闹钟。
- Kernel `CapabilityRegistry` 已实现，但生产路径几乎是 Host → 插件消费；没有「Host 按登记去叫醒插件提供的执行口」。
- 没有 Schedule 导航、列表或登记 API。

## 范围与非目标

做：

1. 横向 `horizontal/scheduler`：durable job、lease、漏打合并、Clock、叫醒收据。
2. 产品插件 `plugins/native/schedule`：plugin-stage 列表 + 详情，能看下次时间、上次收据、暂停/恢复。
3. Host Capability：`schedule.register` / `cancel` / `setEnabled` / `list`。登记必须指向已注册的唤醒 handler；从插件 invoke 时 Host 覆盖 `plugin_id` 为调用方，不能替别人挂闹钟。
4. 复发：`once` 与 `interval`（最短 5 秒）由 Schedule 插件的 job 模型拥有；底层每次只打一枪。漏打合并成一次叫醒，再跳到「现在之后」的下一拍。
5. Web timer 与 Feed timer 一起走；本地服务必须在跑，闹钟才响。

不做：

- 不迁 Feed 调度、不加 cron 表达式、不写 function Artifact、不做事件总线 Automation。
- 人手创建的对话态定时任务见 `specs/schedule-conversation-tasks/spec.md`。本文件仍描述闹钟层：其他插件登记、once/interval、列表收据。
- 不实现 Plugin Runtime `providedCapabilities` 通用反向注册（v1 用 Host 装配的 `PluginWakeupIndex`）。
- 不改 Settings 模型管理、不做 Files 产品插件。

## 使用场景

1. 测试插件登记「5 秒后叫醒我」；钟拨过点；handler 被调用一次；列表能看到收据。
2. interval 任务漏了几拍：只叫醒一次，下次时间跳到现在之后。
3. 同一 job 正在跑：重叠 tick 跳过。
4. 指向未注册 handler：登记被拒。tick 时 handler 已卸：写 `plugin_unavailable` 收据，不重试同一拍。
5. 打开 Schedule：没任务时诚实空态；有任务时点行看详情，可暂停。

## 方案与关键决策

- Artifact 是名词；叫醒是 Capability。job 是 sqlite 运行态，不是 Artifact 版本。
- 横向服务仍是 one-shot wakeup + lease；once/interval 是 Schedule job 的外观。
- 空列表直接进产品目录，不放进 demo withhold。
- 插件色用 yellow；导航 title 为 Schedule，图标 `timer`，order 35（Inbox 与 Feed 之间）。
- 最小间隔 5 秒，方便测试；生产业务自己选更长的间隔。

## 输入输出与依赖

登记输入：`plugin_id`、`capability_id`、`object_ref`、`title`、`due_at`、可选 `recurrence`。

`object_ref` 是不透明钥匙，拒绝绝对路径、`..`、空值和过长字符串。同一 `(plugin_id, capability_id, object_ref)` 再登记是改期，不建第二份。

输出：job 记录 + wakeup 收据。Host 不解释业务结果。

依赖：项目 sqlite、Web 进程内 timer、`CapabilityRegistry`、现有 plugin-stage。

## 文件 / 模块边界

允许：

- `specs/schedule-plugin/spec.md`
- `packages/contracts/src/services/scheduler.ts`
- `horizontal/scheduler/**`
- `plugins/native/schedule/**`
- `docs/horizontal/scheduler.md`、`docs/SSOT-MATRIX.md`
- Host：local-host 装配、HTTP、web view、web timer、plugin-executor 覆盖 caller
- Workbench：catalog、page renderer、ui-composition、i18n、rail 白名单、tab 标题/色
- 设计 token：`MW_PLUGINS` 增加 schedule
- 对应测试与 workspace package 登记

## 验收标准

1. 登记 → 拨钟 → owner handler 被 invoke，参数含 `object_ref` 与 `job_id`。
2. interval 漏打只 invoke 一次，并前进到现在之后的下一拍。
3. 重叠 tick 不重复 invoke。
4. 未注册 handler 不能登记；tick 时缺失 handler 留下 `plugin_unavailable`。
5. 绝对路径 / `..` 的 `object_ref` 被拒。
6. 插件 invoke `schedule.register` 时，即便输入里写了别人的 `plugin_id`，也绑到调用方。
7. Schedule 工作面能列出下次时间与上次收据；空态与人手创建入口见对话任务 spec。
8. 暂停后不再到点叫醒；恢复后按 `next_due_at` 继续。
9. 导航出现 Schedule，且没有第二列目录。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-service-scheduler --filter @molis-ai/molis-work-plugin-schedule --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-design-system build
node scripts/workspace-packages.mjs
node --import tsx --test --test-concurrency=1 tests/scheduler.test.ts tests/schedule-plugin.test.ts tests/plugin-declarative-mounting.test.ts tests/i18n.test.ts
```

## 假设与开放问题

- v1 没有真实业务消费者；测试 handler 证明叫醒链。Feed 迁到这套闹钟是 later。
- 本地 Web 没开时闹钟不响；UI 不假装在跑。
- Plugin Runtime 通用 `providedCapabilities` 是 later。
