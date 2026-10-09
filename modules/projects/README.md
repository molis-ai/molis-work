# 项目与工作区事实

维护项目记录、工作区关联及相关查询，让桌面目录和 Runtime 项目选择使用同一套事实。

包名：`@molis-ai/molis-work-module-projects`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

ProjectsModule 用注入数据库建立 repository 与 service，公开 query、commands 和供 Host 装配的 lifecycle。Host 负责文件准备和跨资源操作，Desktop 负责项目目录呈现。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | ProjectsModule 公开接口 |
| [src/project-service.ts](src/project-service.ts) | 项目记录操作 |
| [src/workspace.ts](src/workspace.ts) | 工作区规则 |
| [src/installation-inspection.ts](src/installation-inspection.ts) | 卸载只读检查 |

可对照现有调用方 [apps/local-host/src/project-catalog.ts](../../apps/local-host/src/project-catalog.ts) 阅读装配方式。

## 接入与边界

项目身份和关联规则属于此处；Session 事实、Panel UI 和 Runtime 进程不属于此处。卸载检查只提供项目目录事实，不自行删除用户文件。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-projects typecheck
pnpm --filter @molis-ai/molis-work-module-projects build
```

已有行为示例与回归：[projects-module.test.ts](../../tests/projects-module.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/projects-module.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：项目身份、目录（Catalog）、工作目录关联与生命周期。
- 不负责：Session、桌面面板、Goal、Artifact、Runtime 进程状态。
- 公开入口：`@molis-ai/molis-work-module-projects`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/projects`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 身份只有 `project_id`：目录条目、项目数据库与库里 Goals 的根记录同值。
  - 目录关联只由本模块管理，不建第二份目录库；按项读取当前项目，不返回其他项目的关联。
  - 卸载检查只提供目录事实，不删除用户文件。
  - 删除回执（`project_deletions`）带每个数据所有者的一步（`project_deletion_steps`：pending、complete），与目录自己的清理在同一个事务里写入；回执只有目录暂存已删且每一步都是 complete 时才是 complete。一步的所有者不在收尾的进程里时，这一步保持 pending 并留着上次的错误，等有这个所有者的进程来做，不会被当作无事可做。所有者清什么不归本模块。
- 改动后必跑：`node scripts/run-tests.mjs tests/projects-module.test.ts tests/project-plugin-registry.test.ts tests/current-project-settings.test.ts tests/project-settings-deletion.test.ts tests/project-deletion-hooks.test.ts`
- 相关手册：[docs/modules/projects.md](../../docs/modules/projects.md)、[docs/platform/PROJECT-SETTINGS.md](../../docs/platform/PROJECT-SETTINGS.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/modules/projects.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/projects`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap1`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
