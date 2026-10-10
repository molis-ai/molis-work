# Scheduler

**白话：** 到指定时间，可靠地叫醒一个已注册 Capability；它不理解为什么要触发。

**提供：** durable one-shot wakeup、cancel/reschedule、lease、并发 claim、missed wakeup catch-up、Clock port 和 delivery Receipt。

**技术状态：** owner plugin + capability、opaque object ref、due time、lease 和 terminal technical status。Scheduler 合同拥有 once / interval；interval 按固定毫秒间隔计算，漏过多个周期只补一轮。Native Schedule 拥有对话任务的本地日历时间规则，通过再次登记 once job 排到下一天，不能把通用 interval 解释成日历日。

运行中的唤醒独立续租，不需要另一个 tick 才保持所有权。处理器接收单独的 `ScheduleWakeupControl`，用其 signal 取消外部等待，并在副作用前调用同步 `beforeEffect()`。暂停、取消、重排或被接管后旧控制对象失效。与任务同库的领域写入应在事务中复查并提交，回执不会替业务代码提供提交保护。`isExecuting(jobId)` 读取共享租约，防止对话产品层把还在执行的 once job 提前重新登记。

续租、提交与 `isExecuting()` 都要求租约尚未到期；到期时旧执行立即失去权限，即使无人接管也不能续租或提交成功/失败回执。续租及回执在取得数据库写锁后读取时钟复核，避免休眠、进程阻塞或数据库等待后复活旧租约。需要核对外部副作用的任务继续进入所属领域的明确恢复流程。

通用插件提醒由官方 Schedule 拥有，通过公共 `reminders.add/cancel` 调用；Host 从可信调用上下文取得项目、插件和安装身份，插件输入不能指定这些身份。提醒与 job 同事务保存，到点由 Host 将 Inbox 投递和一次性消费同事务提交，无须打开 Studio。旧 Builder job 保留原 id、时间与收据，通过兼容唤醒读取迁入的 Schedule 记录；无法证明原安装归属则保留并暂停。

对话任务能不能到点跑，创建前可以问 Schedule 的 `schedule.tasks.readiness`：Host 回答项目已核对的工作区（与到点执行的 runner 同一个核对）和是否配置了文字模型（读模型目录的元数据；runner 本身查的是 Prologue 运行时是否已登记，所以这一项是替身，不是保证）两样。创建不等它、也不被它拒绝，新建对话框只据此提示（W2-18 决定 3）。

定时运行插件 operation 使用 Schedule 的 `schedules.add/cancel`（系统提供方 `schedule.operations`），Host 只装配当前安装执行入口和单向旧数据迁移。Schedule 保存排期意图及每次 occurrence，Scheduler 不保存业务输入。可信 Host 可以在注册唤醒时提供同步 `prepare`，它在 lease claim 的同一事务内保存 pending；不能 await 或派出外部工作，失败回滚整个 claim。处理器可返回明确的 failed/plugin_unavailable 技术收据。

注册安装执行入口不会触发补跑。每次 tick 先核对共享 lease：未派出的 pending 可以用新 lease 等待执行；running 且 lease 已消失的任务转为 unknown，暂停后续排期。不能把未知结果当作普通失败重试。结果、Inbox 与 occurrence 终态同事务复查租约、安装世代和版本后提交；已提交结果即使还没写技术收据就退出，也不能重放。旧 Builder 队列完整迁移，没有 50 条丢弃上限；缺失定义的引用保留为不可执行历史。

`schedule.tasks.list` 返回定时操作的原功能、输入、排期、当前安装和执行历史；没有定义的历史等待项单列，不猜测执行内容。管理者经 `schedule.operations.recover` 决定 resume/retry/skip，普通启用不能绕过未知结果核对。Action 显式 `plugin: false`，Host 重读实际安装及版本，所见任务/历史 revision 防止过期决定；确认只恢复排期，不直接派出。未知结果重试可能重复外部作用，必须明确选择；跳过只处理最早的未知记录，其他未知仍需核对，一次性任务跳过后完成。决定及之前的未知说明随 occurrence 保留，HTTP、UI、授权 MCP 使用同一实现。

**不拥有：** cron 表达式、Automation rule、Source schedule intent、Action parameters 或 Attention 内容。

旧提醒的归属确认由 Schedule 的 `schedule.reminders.recover` Action 完成，HTTP/页面复用同一实现，MCP 仍需该具体动作的授权。先读取 `schedule.tasks.list` 中提醒内容及当前安装，再携带预期安装 ID/世代提交；这些值只是并发检查，Host 会重新解析目标，不接受输入冒充身份。界面展示内容、版本、发布方和过期补提醒语义，失败保留确认内容，刷新安装后须重新确认。恢复同事务更新提醒身份和启用原 job，保留间隔、收据和链接；普通闹钟启用不替代归属确认。

恢复动作显式声明 `plugin: false`：生成插件不能借默认的 Agent 能力暴露自行接管旧安装提醒，须由具有管理权限的调用方发起。

公共提醒以 `schedule.reminders` 系统提供方装配，产品实现归 Schedule；它不增加“先启用对话页面”的条件。Schedule 对话任务仍按项目插件启停，提醒自己的启停由对应 job 管理。

**当前来源与 Goal：** `horizontal/scheduler` + `plugins/native/schedule`；Web timer 与 Feed timer 并行。Feed 自有调度仍独立，迁入是 later。日历日对话任务由 Schedule 产品层在叫醒后重新登记 once job。见 `specs/archive/schedule-plugin/spec.md` 与 `specs/archive/schedule-conversation-tasks/spec.md`。
