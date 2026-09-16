# Task 工作对象

保存可独立于 Goal 存在的工作台对象，以及这块工作面上的构图引用。

包名：`@molis-ai/molis-work-module-task`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 打开项目库后调用 `createTask` 或 `openTaskForGoal`；构图用 `saveTaskFrame` 写回同一行。一条 Goal 最多关联一条 Task；没有 Goal 也可以创建。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/service.ts](src/service.ts) | 创建、复用、更新、构图 |
| [src/repository.ts](src/repository.ts) | SQLite 记录 |
| [src/migrations.ts](src/migrations.ts) | 项目库 schema |

## 接入与边界

不读 Goal 事件，不复制 Session / Feed 正文。删 Goal 时外键把 `goal_id` 置空，不删 Task。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-module-task typecheck
pnpm --filter @molis-ai/molis-work-module-task build
```

回归：`tests/task-module.test.ts`。
