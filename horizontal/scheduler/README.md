# 到点叫醒已登记的 Capability

保存闹钟、租约和叫醒收据。到点只打一枪；once / interval 由 Schedule 插件的 job 模型解释。它不执行业务。

包名：`@molis-ai/molis-work-service-scheduler`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

插件经 `services.scheduler` 挂一条 job（`registerAction`），唤醒就是它自己 Manifest `background.wakeups` 声明的一个动作；登记时记下安装、安装代次和动作版本（`schedule_action_bindings`）。激活经 `connectActionOwner` 接上这个安装的动作网关。Host timer 调用 `ScheduleService.tick`；到期后认领任务，重查这个安装还在不在、代次和授权变没变，再经网关调它的动作，写入收据，再计算下一次 `next_due_at`：动作回答之前到点那一刻一直留着，所以认领之后、动作登记自己的持久记录之前进程死了，也不会悄悄吃掉一次性任务。安装停了、重装了、撤权了，到点的任务原样留着不跑。漏打的 interval 合并成一次叫醒。调度器只有这一条登记路：没有安装的 `register()` 和进程内处理器 `PluginWakeupIndex` 已删（BL-481），库里遗留的没有绑定安装的行到点只记 `plugin_unavailable`，不调用任何东西；动作需要的“认领后先落地”写在插件自己的唤醒动作里（Schedule 的定时操作是 `prepareScheduledOperation`）。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | 表结构、ScheduleService（认领、续租、收据） |
| [src/action-wakeups.ts](src/action-wakeups.ts) | 安装绑定与动作拥有者：到点经安装的动作网关送达 |

可对照现有调用方 [apps/local-host/src/project-clock.ts](../../apps/local-host/src/project-clock.ts)。

## 接入与边界

不拥有 cron 表达式、Automation rule、Feed 来源意图或 Action 参数。插件不能替别人登记：`pluginSchedulerFor` 从激活使用的 Manifest 取 `plugin_id`，绑定当前安装、代次与声明的唤醒动作；写入器覆盖登记输入中的主人字段，调用方不能改用别人的身份。读取、写入和到点投递都复查安装与授权，已停止的安装拒绝。生产插件只用 `services.scheduler`；调度器只有带安装绑定的 `registerAction` 一条登记路，连不上该安装动作网关的登记被拒绝（`scheduler.handler_missing`），没有进程内 handler，测试也经 `tests/fixtures/scheduler-owner.ts` 接上安装的网关。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（只用它的执行生命周期）。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-scheduler typecheck
pnpm --filter @molis-ai/molis-work-service-scheduler build
```

已有行为示例与回归：[scheduler.test.ts](../../tests/scheduler.test.ts)、[schedule-plugin.test.ts](../../tests/schedule-plugin.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/scheduler.test.ts tests/schedule-plugin.test.ts
```

## 开发要求

- 负责：一次性叫醒、租约、错过后的补叫与投递回执。
- 不负责：cron 表达式、自动化规则、来源计划意图、动作参数。
- 公开入口：`@molis-ai/molis-work-service-scheduler`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/scheduler`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。方向：合同、公共执行生命周期（来自 plugin-sdk）与同目录适配端口；不决定业务状态（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 到点只叫一次；once 与 interval 由 Schedule 插件的 job 模型解释。
  - 插件通过公共 `services.scheduler` 与本插件数据库事务登记闹钟，安装身份和项目由 Runtime 绑定，输入不读取 `plugin_id`；结束的事务、另一插件与另一项目的句柄、停用的安装均拒绝。唤醒只走 Manifest 声明的动作与现行动作网关（`tests/security-invariants-plugin-scheduler.test.ts`、`tests/scheduler-plugin-identity.test.ts`）。
  - 不执行业务，只叫醒闹钟主人自己的能力。
- 改动后必跑：`node scripts/run-tests.mjs tests/scheduler.test.ts tests/scheduler-plugin-identity.test.ts tests/schedule-conversation-tasks.test.ts`
- 相关手册：[docs/horizontal/scheduler.md](../../docs/horizontal/scheduler.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)
- [Scheduler 服务说明](../../docs/horizontal/scheduler.md)
- [定时任务插件需求](../../specs/archive/schedule-plugin/spec.md)

- SSOT: `docs/SSOT-MATRIX.md`
- Contract: `@molis-ai/molis-work-contracts/services/scheduler`

执行期间通过 SDK 的执行生命周期独立续租，不依赖下一次 tick。唤醒处理器的第二个参数 `ScheduleWakeupControl` 提供 signal 和同步 `beforeEffect()`，等待后写入前必须复查；该控制对象不属于持久化任务输入。暂停、取消、重排或被接管会撤销原执行身份，迟到结果不能写成成功或普通业务失败。领域幂等和未知副作用的恢复仍由 owner 负责。

租约只可在到期前续期。到期即失去执行权，即使尚无人接管，原执行也不能续租或写入业务结果、成功或失败回执；休眠或长阻塞后必须遵守同一边界。`isExecuting()`、提交检查和续租使用相同的有效期判断。

关闭服务先撤销在途执行并等待其可取消等待收束，再释放自己的租约，之后宿主才关项目库。关闭不会把已派发任务倒回派发前：一次任务可能已经提交 owner 效果，调度器只放自己的租约、保留到点那一刻，重启后会把同一次再投给动作，动作靠自己的持久记录去重，未知结果仍由 owner 核对，调度器不替它判断。借用同一 live Host 的服务重新绑定可启动同一 facade；已释放项目则按新库实例装配。W2-18-SCHEDULE-02 的真实 SQLite 用例覆盖 owner 已提交但响应尚未返回的交错：再投一次时动作的账本让效果仍只有一份。
