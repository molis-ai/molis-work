# AP1 Projects Module 迁移验收记录

日期：2026-09-02  
Goal：`goal-reorg-ap1`  
完成等级：AP1 切片达到“内部完整”；整个架构重组仍在继续。

这次迁移只改变代码职责和包边界，不改变用户已经能用的 Project 行为。`project_id` 是正式身份；V1 数据库中的 `board_id` 只用于兼容旧数据。新建普通 Project 让两者取相同值，旧 Project 迁移时保留原 `board_id`。

<a id="ap1-boundary"></a>
## AP1 Boundary

### 已迁入正式 owner

- `packages/contracts/src/modules/projects.ts`：Project、workspace membership、删除记录及 Query / Command Contract。
- `modules/projects/src/repository.ts`：`projects`、`project_events`、`workspaces`、`workspace_project_memberships`、`project_deletions` 的 schema、SQL 和 row mapping。
- `modules/projects/src/project-service.ts`：Project identity、创建/重命名/事件、删除记录规则。
- `modules/projects/src/workspace.ts`：Project 与本地目录 membership 规则。
- `modules/projects/src/index.ts`：唯一 public entrypoint，以及给本地 composition root 使用的受控 lifecycle 端口。
- `tooling/migrations/audit-project-identity.mjs`：只读身份和 membership 对账。

### 依赖检查

- 生产 caller 只有 `src/projects/catalog.ts`，并且只导入 `@molis-ai/molis-work-module-projects` 公共入口。
- 没有 `@molis-ai/molis-work-module-projects/*` deep import。
- Projects package 只声明 `@molis-ai/molis-work-contracts` 依赖；不导入其他 Module implementation、旧 Store 或 Web/Desktop 实现。
- `pnpm workspace:check`：48 个 package、48 个唯一名称、30 个 Contract subpath，0 error。
- `pnpm boundary:check`：48 个 package、111 个 source file、195 个 import、54 个 package edge，0 error。

<a id="ap1-legacy-exit"></a>
## AP1 Legacy Exit

`src/projects/catalog.ts` 从 AP1 前的 2,955 行降到 2,392 行。它已不再定义或直接读写 Project-owned 表，也不再复制 Project identity、Event、workspace membership、删除记录和 migration 规则。

兼容 Catalog 目前只保留三类尚未轮到本 Goal 迁移的组合职责：

- 文件创建、复制、改名和删除的 staging：由 AP2 迁到 Local Host composition。
- Runtime Session 与 Project 的绑定：由 WK1 迁到 Private Work Context。
- Desktop panel 状态：由 AP4 迁到 Desktop/App Shell。

因此 AP1 没有把别的 owner 吸进 Projects Module，也没有为了降低行数搬走不属于本切片的职责。针对源码的边界测试和 `rg` 检查都确认 Catalog 中不存在对五张 Project-owned 表的直接 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 或建表语句。

<a id="ap1-result"></a>
## AP1 Result

### 行为验证

- `CI=true node --import tsx --test --test-concurrency=1 tests/projects-module.test.ts tests/project-catalog.test.ts`：20/20 通过。
  - 直接验证 public Projects Module 的正式身份与 workspace membership。
  - 验证 schema migration 失败时回滚，并可重复执行。
  - 固定兼容 Catalog 只能通过 public entrypoint 访问 Projects。
  - 继续覆盖原有创建、选择、重命名、目录关联/修复/解除、Demo、旧库迁移、删除记录与恢复路径。
- `CI=true pnpm typecheck`：通过。
- `CI=true pnpm test`：497/497 通过，覆盖 build、打包发布 E2E、Web、MCP、CLI、Desktop、旧 Catalog 和新 Projects Module。
- `git diff --check`：通过。

第一次在受限沙箱运行全量测试时出现 24 个环境失败，原因是监听端口、npm cache 和浏览器/原生子进程权限，不是 Project 断言失败。同一份代码在正常测试权限下重新运行后 497/497 全部通过。

### 数据迁移对账

在临时 Catalog 上运行：

```text
node tooling/migrations/audit-project-identity.mjs <catalog.db>
```

结果：Catalog owner 为 `molis-work-project-catalog-v1`，schema version 为 9；缺失表、重复 Project ID、重复数据库路径、新建 Project 的非标准 `board_id`、无效旧 Board mapping 和孤立 workspace membership 均为 0。

### 验收结论

- Project 的正式身份和持久化事实已有唯一 owner。
- 旧公开调用行为无损，前端和后端入口的全量回归均通过。
- `board_id` 只保留迁移兼容含义，没有继续成为第二套产品身份。
- AP1 范围内没有已知未完成项；AP2、WK1、AP4 继续退出兼容 Catalog 的剩余组合职责。
