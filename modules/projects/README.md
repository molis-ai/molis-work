# 项目与工作区事实

维护项目记录、工作区关联及相关查询，让桌面目录和 Runtime 项目选择使用同一套事实。

包名：`@molis-ai/molis-work-module-projects`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

ProjectsModule 用注入数据库在包内建立 repository 与 service，公开 query、commands 和供 Host 装配的 lifecycle；不公开 Repository 类或实例。Host 负责文件准备和跨资源操作，Desktop 负责项目目录呈现。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | ProjectsModule 公开接口 |
| [src/project-service.ts](src/project-service.ts) | 项目记录操作 |
| [src/workspace.ts](src/workspace.ts) | 工作区规则 |
| [src/installation-inspection.ts](src/installation-inspection.ts) | 卸载只读检查 |
| [src/project-root.ts](src/project-root.ts) | 项目库里的项目根行 `project_root` |

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
node scripts/run-tests.mjs tests/projects-module.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：项目身份、目录（Catalog）、工作目录关联与生命周期；项目库里代表项目本身的根行（`project_root`）。
- 不负责：Session、桌面面板、Goal、Artifact、Runtime 进程状态。
- 公开入口：`@molis-ai/molis-work-module-projects`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/projects`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 业务身份仍是 `project_id`：目录条目、项目数据库、库里的根行 `project_root` 与 Goals 的看板同值。根行的 `data_instance_id` 只标识这份项目数据实例，不替代业务身份。项目库正好有一行根行，项目库里引用项目的外键（插件声明的表也一样）指向它，不指向 Goals 的表；根行不存标题，显示名只在目录里（`specs/plugin-project-database` §2.4）。
  - 目录关联只由本模块管理，不建第二份目录库；按项读取当前项目，不返回其他项目的关联。
  - `query.projectPluginMembership` 在一次同步查询中共用当前常开判断，返回派生成员与过滤后的隐藏标记；先读取注册表，再查项目。结果不留在实例中，后续调用及等待后的写前检查仍须重新读取当前状态。`storedProjectPluginMembership` 只返回显示事实，不能代替它作可达性判断。
  - 卸载检查只提供目录事实，不删除用户文件。
  - 卸载检查只列 `projects` 表里的项目（`listCatalogProjectsForUninstall`）；`catalog_meta` 归 storage，目录是不是本产品的，由宿主用 `LocalCatalogMetadata` 判断后再问本模块。
  - 删除回执（`project_deletions`）带每个数据所有者的一步（`project_deletion_steps`：pending、complete），与无正文原恢复计划（`recovery_plan`）在同一个事务里写入；pending 项目从普通查询退出，原目录行与绑定保留到 Memory、Session 和业务 owner 都成功后才删除；回执只有目录暂存已删且每一步都是 complete 时才是 complete。一步的所有者不在收尾的进程里时，这一步保持 pending 并留着上次的错误，等有这个所有者的进程来做，不会被当作无事可做。所有者清什么不归本模块。
  - `lifecycle.retainedProject` 只给删除 owner 读保留的原目录行；同 ID 原删除仍 pending 时，实际 register 事务同步拒绝后继登记，即使原行已删。普通查询不能把隐藏等同不存在或据旧 complete 删除后继实例。
- 改动后必跑：`node scripts/run-tests.mjs tests/projects-module.test.ts tests/project-plugin-registry.test.ts tests/current-project-settings.test.ts tests/project-settings-deletion.test.ts tests/project-deletion-hooks.test.ts`
- 相关手册：[docs/modules/projects.md](../../docs/modules/projects.md)、[docs/platform/PROJECT-SETTINGS.md](../../docs/platform/PROJECT-SETTINGS.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 当前实例身份短合同

本片对应 [Memory 规格](../../specs/prologue-memory-strategy/spec.md)「系统资料来源的当前实例身份」，仅实现项目库 v11 的创建与读取。沿用 `project_root`，不新增表、服务或第二写主人。`writeProjectRoot(db, projectId, createdAt)` 在首次插入时生成随机持久的 `data_instance_id`；同项目重复写不改变该身份及原 `created_at`。`listProjectRoots` 公开投影该必需非空字段；关闭重开、整体移动或完整恢复同一份数据保留身份，同 `project_id` 的全新数据实例产生新身份。

硬边界是 owner 生成身份、现行 schema 无空值或默认补值、未知旧结构拒读；不提供调用方指定或插件替换身份的入口。App 仍传业务 `projectId` 与创建时间；终端用户操作、来源绑定、权限和生命周期复核不归本片。仅允许修改本模块根行实现、必要出口和 README、Host 基线版本 10 → 11 及直接根行行为测试；不做数据维护、旧库补值、其他 owner 或 UI 改动。失败不补写历史；取消、跨库恢复编排沿现 owner，不新增异步流程。

验收使用真实磁盘 SQLite，经包公开入口验证新身份、幂等写、关闭重开、同业务 ID 新库、原创建时间不变、缺失身份拒绝与 v10 原样拒绝。先完成仓库构建，再运行 `node scripts/run-tests.mjs tests/project-root.test.ts`，并保留上列必跑回归；构建和测试由集成根按机器槽位安排。上述工程证据不代替系统资料绑定闭环或用户验收。

## 进一步阅读

- [职责与接入说明](../../docs/modules/projects.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

`readProjectDeletionRecoveryPage` 是 Catalog 停写工作副本的内部只读来源口：按 deletion_id keyset 有界枚举 pending/complete，严格解码原身份、状态、连续且唯一的 owner 步骤与当前/retained 项目白名单。空步骤或 complete 与 pending 步骤矛盾拒绝；原计划 JSON 仅供 Catalog 唯一 decoder。调用方必须先核 Catalog owner/schema 并持有同一 read transaction；此口不证明删除完成或授权删除同 ID 后继。专项回归 `tests/project-deletion-recovery-inspection.test.ts`。

`readProjectDeletionCatalogIdentities` 是同一 Catalog 只读投影的全项目身份口：直接读取所有现存项目（含 pending），按 project_id 排序，仅交出 project_id/data_class/created_at，复用上述原严格身份 decoder。未知 data_class 或空身份字段拒绝，不使用普通展示列表的默认映射；调用方同样拥有短 read transaction 与 owner/schema/权限检查。专项回归 `tests/project-deletion-recovery-target.test.ts`。
