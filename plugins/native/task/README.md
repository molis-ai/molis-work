# Task 工作台入口

把真正干活的 Frame 工作台做成独立插件：可以没有 Goal 就创建，也可以从 Goal 打开关联 Task。

包名：`@molis-ai/molis-work-plugin-task`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 把当前项目的 Task 列表交给 UI contribution；HTTP 路由表拥有 `/api/tasks`，Host 注入 Module 命令。构图保存在 Task 行上，拖入的 Session / Feed 仍是引用。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/ui.ts](src/ui.ts) | 目录、母页、Frame HTML |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |
| [src/route-handlers.ts](src/route-handlers.ts) | 创建、按 Goal 打开、保存构图 |

## 接入与边界

不拥有 Goal 事实，不复制资产身份。Goals 插件继续管画布、看板和记录页。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-plugin-task typecheck
pnpm --filter @molis-ai/molis-work-plugin-task build
```

回归：`tests/task-native-plugin.test.ts`。
