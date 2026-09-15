# 目标用例与原生界面

把 Goal 的当前约定、要求、工作记录和可信决定组合成可操作的工作流，提供目标目录、时间线、树结构和历史正文界面。

包名：`@molis-ai/molis-work-plugin-goals`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 注入各 Module 的公开端口。`GoalEventApplication` 连接创建、普通笔记、类型与要求、上报、决定、收尾和明确继续；`GoalReadApplication` 提供项目指导和历史读取。HTTP handler 与 UI contribution 将同一当前事实交给各 App，目录和正文无需重建旧 Claim/Run 动作状态。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/goal-event-application.ts](src/goal-event-application.ts) | 当前事件工作流与紧凑状态回执 |
| [src/goal-query-application.ts](src/goal-query-application.ts) | 目标读取 |
| [src/goal-tree-decision.ts](src/goal-tree-decision.ts) | 目标树确认 |
| [src/document-collection.ts](src/document-collection.ts) | 文档列表投影 |
| [src/http/index.ts](src/http/index.ts) | Web 操作入口 |

可对照现有调用方 [apps/local-host/src/goal-project-application.ts](../../../apps/local-host/src/goal-project-application.ts) 阅读装配方式。

## 接入与边界

这里拥有跨 Module 用例及呈现，当前 Goal 状态由 Goals 的事件事实决定。结构变更检查图合法性、基线与具体用户授权；正式收尾检查当前约定和要求。普通记录无需旧执行角色或 Run。历史 Claim/Run、Evidence、Review 和提案通过各自查询读取，保留原始正文、ID 与来源；当前入口不再执行旧协议。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-module-evidence-verification`、`@molis-ai/molis-work-module-execution`、`@molis-ai/molis-work-module-goals`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-goals typecheck
pnpm --filter @molis-ai/molis-work-plugin-goals build
```

当前事件入口、结构变更和界面可参考 [goal-event-http.test.ts](../../../tests/goal-event-http.test.ts)、[goal-tree-event-flow.test.ts](../../../tests/goal-tree-event-flow.test.ts)、[goals-document-ui.test.ts](../../../tests/goals-document-ui.test.ts)。完成仓库构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/goal-event-http.test.ts tests/goal-tree-event-flow.test.ts tests/goals-document-ui.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../../docs/modules/goals.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8`, `goal-reorg-gw4`, `goal-reorg-gw5`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
