# 主线服务

按调用方自己的授权，现读一个项目里各提供方此刻说的后台任务，并在重新问过提供方之后执行任务自己给出的命令（[事项线](../../specs/work-line/spec.md) §5、§6）。它什么也不存，每次都重新问。

包名：`@molis-ai/molis-work-service-mainline`。工作区内部包，由 Host 装配成 `system.mainline` 的 `background.tasks.read@1` 与 `background.tasks.command@1`。

## 一次典型调用

本人打开后台任务面板：Host 的 `background.tasks.read@1` 把调用方和它自己的客户端交给 `readBackgroundTasks`。它 `discover` 一次，按输出类型（`BACKGROUND_TASKS_OUTPUT_TYPE`）和聚合查询的规则挑出任务提供方，并行各问一次（只读、各限 2 秒），逐行检查后按更新时间排好给出；读不到的提供方只留标题和错误码。本人点一行上的「停止」：`background.tasks.command@1` 交给 `runBackgroundTaskCommand`，它再问一遍那个提供方，命令与此刻给出的完全相同才以本人身份调用命令写明的动作。

## 从哪里读代码

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | `readBackgroundTasks`、`runBackgroundTaskCommand`，以及一行、一份回答的检查（`backgroundTaskRow`、`backgroundTaskRows`、`backgroundTaskOrigin`） |

合同在 `@molis-ai/molis-work-contracts/platform/actions`（任务行的形状、`defineBackgroundTasksAction`）和 `@molis-ai/molis-work-contracts/services/mainline`（两个系统动作、读到的行、拒绝的错误码）。Host 装配在 [apps/local-host/src/mainline-actions.ts](../../apps/local-host/src/mainline-actions.ts)，工作台的入口在 [apps/local-host/src/mainline-http.ts](../../apps/local-host/src/mainline-http.ts)；跨项目的聚合（[apps/local-host/src/home-background-tasks.ts](../../apps/local-host/src/home-background-tasks.ts)）用这里的同一份行检查。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。

```bash
pnpm --filter @molis-ai/molis-work-service-mainline typecheck
pnpm --filter @molis-ai/molis-work-service-mainline build
```

## 开发要求

- 负责：发现任务提供方、并行只读调用与限时、逐行检查、把读不到的提供方写进 `issues`；执行命令前重读提供方并核对命令。
- 不负责：任务本身、任务的状态和命令的效果（都归提供方：Coding、助理、平台调度等）、存储、动作的注册与授权（Host 装配，授权走动作网关）、任务面板的界面。
- 公开入口：`@molis-ai/molis-work-service-mainline`（`src/index.ts`，经 `dist` 导出）；合同 `@molis-ai/molis-work-contracts/services/mainline`、`@molis-ai/molis-work-contracts/platform/actions`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（执行生命周期、聚合查询的判定）。方向：只依赖合同与 SDK；不读任何主人的库与文件，不依赖宿主和插件（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 只用调用方自己的客户端：调用方读不到的提供方不问；提供方按合同类型发现，不维护名单。
  - 命令只认回答方自己的动作：行里写了别的提供方的动作，不给出；执行时用的动作与输入是这次调用里从提供方读到的，不是页面传来的（WLN-34）。
  - 提供方声明的对象种类之外的任务不给出。
  - 读取不写任何业务记录；读不到的提供方只留错误码，不带它说的话。
  - 不存任何东西，不缓存上一次的回答。
- 改动后必跑：`node scripts/run-tests.mjs tests/mainline-background-tasks.test.ts tests/coding-background-tasks.test.ts tests/home-aggregate.test.ts`；改了合同再跑 `pnpm api:update`、`pnpm actions:update`。
- 相关手册：[specs/work-line/contract-design.md](../../specs/work-line/contract-design.md) 第 4 节；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
