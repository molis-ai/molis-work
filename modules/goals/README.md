# 目标、约定与工作事实

保存 Goal 意图、当前约定、要求和工作记录，判断正式收尾是否生效；同时提供关系图、项目指导、可选规划及历史事实读取。

包名：`@molis-ai/molis-work-module-goals`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Native Goals 通过 `GoalsModule.events` 创建意图、保存普通笔记、配置局部类型、上报事实并显式收尾。当前状态由事件事实统一计算，普通笔记无需配置类型。`commands` 负责实际 Goal/关系及项目指导写入，`lifecycle` 负责归档与回收站，`planning` 提供按需使用的方法。读取场景使用 `createGoalReadServices`；Host 装配数据库与跨模块端口。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | GoalsModule 与读取服务 |
| [src/goal-commands.ts](src/goal-commands.ts) | 目标写入 |
| [src/query.ts](src/query.ts) | 查询与策略解析 |
| [src/lifecycle-commands.ts](src/lifecycle-commands.ts) | 归档、回收站与恢复 |
| [src/planning](src/planning) | 规划与方法库 |
| [src/event-facts.ts](src/event-facts.ts) | Goal 局部事件配置、上报与读取 |
| [src/event-state.ts](src/event-state.ts) | 当前约定、状态、决定效果与收尾 |
| [src/event-workflow-migration.ts](src/event-workflow-migration.ts) | 既有 Goal 一次升级到事件状态，保留原始历史 |
| [src/planning/event-adoption.ts](src/planning/event-adoption.ts) | 规划来源版本解析、等价合并与 Goal 局部要求实例化 |

可对照现有调用方 [apps/local-host/src/goal-project-application.ts](../../apps/local-host/src/goal-project-application.ts) 阅读装配方式。

## 接入与边界

所有当前工作入口采用事件状态；旧 Claim/Run 完成协议已退役。历史策略、风险、覆盖和版本仍可查询，一次升级保留原始来源及完成记录。用户决定由 Governance 保存，实际 Session 与终端由 Host 管理。关系图合法性、当前约定版本、具体变化授权和事务仍由正式应用入口检查，页面和 MCP 只呈现其结果。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-goals typecheck
pnpm --filter @molis-ai/molis-work-module-goals build
```

已有行为示例与回归：[goals-command-module.test.ts](../../tests/goals-command-module.test.ts)、[goals-query-module.test.ts](../../tests/goals-query-module.test.ts)、[goal-events.test.ts](../../tests/goal-events.test.ts)、[goal-events-state.test.ts](../../tests/goal-events-state.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/goals-command-module.test.ts tests/goals-query-module.test.ts tests/goal-events.test.ts tests/goal-events-state.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/modules/goals.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/goals`
- Migration Goals: `goal-reorg-f2`, `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8`, `goal-reorg-gw1`, `goal-reorg-gw2`, `goal-reorg-gw3`, `goal-reorg-gw4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
