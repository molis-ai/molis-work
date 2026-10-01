# Host 能力注册与调用

按明确的 capability 身份注册处理器，使 Host 能发现和调用功能而不把业务逻辑塞进分发器。

包名：`@molis-ai/molis-work-kernel`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

ActionService.registerProvider 注册同一提供方的合同、处理器与消费场景，并返回注销函数；discover 从底层唯一 CapabilityRegistry 派生授权目录。invoke 在实际派发前检查授权、提供方实例、可用性及输入输出合同。

事务内的插件数据接口使用 invokeSync，处理器必须由可信注册方显式声明 `execution: "sync"`，与异步调用复用原记录和校验。它不等待 Promise：异步授权、未声明同步的处理器和意外 Promise 返回均被拒绝。此声明是处理器实现合同，Kernel 不为违反合同的处理器回滚已发生的副作用。Local Host 的同步端口只接收 plugin audience 的私有 SDK 动作；公共动作仍走异步调度，不能借同步端口绕过队列或异步策略。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | CapabilityRegistry、错误与处理器类型 |

可对照现有调用方 [apps/local-host/src/local-host.ts](../../apps/local-host/src/local-host.ts) 阅读装配方式。

## 接入与边界

Registry 负责身份、重复注册、生命周期及派发；ActionService 负责声明合同、权限、消费场景和通用输入输出校验。Host 提供可信上下文与实时策略，实际 handler 继续拥有业务校验、事务和状态转换。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-kernel typecheck
pnpm --filter @molis-ai/molis-work-kernel build
```

已有行为示例与回归：[local-host.test.ts](../../tests/local-host.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/local-host.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：能力注册、发现、授予、动作服务调度（`ActionService`）与进程内执行生命周期。
- 不负责：业务状态机、提供方实现、界面。
- 公开入口：`@molis-ai/molis-work-kernel`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/kernel`。
- 依赖：`@molis-ai/molis-work-contracts`；第三方依赖见 `package.json`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 目录从唯一的 `CapabilityRegistry` 派生，不另存名单。
  - 输入与结果按合同校验：查询与判断不合合同报 `actions.output_invalid`；已提交的写动作报 `actions.output_invalid_after_effect`。
  - `action.execution` 明确声明的时限与调用频率由统一执行器落实；费用只作声明，未声明为未知。计数按 actor、项目、安装隔离且跨入口共享，注册退出时释放，不承担持久计费。超时转发 signal 并停止等待，迟到处理器必须经写入 fence，不能承诺抢占同步代码或撤销外部请求。
  - `beforeEffect` 每次复查注册版本、可用性、授权与权限；调用结束后不能再产生副作用。
  - `invokeSync` 只接受显式声明 `execution: "sync"` 的处理器，不等待 Promise，不能借它绕过异步策略。
  - 调用记录只写谁调了什么、怎样结束，不写输入与结果；业务校验与事务留在处理器里。
- 改动后必跑：`node scripts/run-tests.mjs tests/action-service.test.ts tests/action-sync.test.ts tests/action-schema-compiler.test.ts tests/action-dependencies.test.ts tests/action-call-log.test.ts tests/action-concurrency.test.ts tests/execution-lifetime.test.ts`
- 相关手册：[specs/action-architecture/spec.md](../../specs/action-architecture/spec.md)、[docs/platform/PLUGIN-PLATFORM.md](../../docs/platform/PLUGIN-PLATFORM.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/platform/LOCAL-HOST.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/kernel`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-f3`, `goal-reorg-ap2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

`createExecutionLifetime` 统一进程内取消、时限和同步周期监测。实现放在没有依赖的 `@molis-ai/molis-work-contracts/platform/execution-lifetime`，Kernel 与 Plugin SDK 都从那里转出同一份，公开的 Plugin SDK 因此不依赖私有的 Kernel。取消后停止监测，异步等待后调用 `assertActive()` 再进入原事务/版本校验；`dispose()` 在 finally 中释放资源并拒绝迟到回调。它不登记任务、不保存状态、不恢复或重试。Alchemist 用于租约续期，Images 用于持久取消检查及 180 秒时限。
