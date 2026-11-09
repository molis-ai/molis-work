# 项目与目录事实

维护项目记录、项目目录（输入与输出角色）及相关查询，让桌面目录、项目设置和 Runtime 项目选择使用同一套事实。

包名：`@molis-ai/molis-work-module-projects`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

ProjectsModule 用注入数据库在包内建立 repository 与 service，公开 query、commands 和供 Host 装配的 lifecycle；不公开 Repository 类或实例。Host 负责文件准备和跨资源操作，Desktop 负责项目目录呈现。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | ProjectsModule 公开接口与装配 |
| [src/project-service.ts](src/project-service.ts) | 项目记录操作 |
| [src/workspace.ts](src/workspace.ts) | 项目目录规则：输入/输出角色、默认输出目录、路径到行、来源对应 |
| [src/workspace-repository.ts](src/workspace-repository.ts) | 成员表（`role_input`、`role_output`）与 `workspace_source_links` |
| [src/catalog-upgrade.ts](src/catalog-upgrade.ts) | 目录库第 1 版到第 2 版的升级段 |
| [src/project-output.ts](src/project-output.ts) | 默认输出目录：id 推导、建行、碰磁盘前的检查与删除 |
| [src/material-recent.ts](src/material-recent.ts) | 项目库里的「最近用过」`material_recent_uses` |
| [src/project-paths.ts](src/project-paths.ts) | 项目库/暂存目录的路径推导 |
| [src/installation-inspection.ts](src/installation-inspection.ts) | 卸载只读检查 |
| [src/project-root.ts](src/project-root.ts) | 项目库里的项目根行 `project_root` |

可对照现有调用方 [apps/local-host/src/project-catalog.ts](../../apps/local-host/src/project-catalog.ts) 阅读装配方式。

## 接入与边界

Host 通过 `ProjectsModuleOptions` 注入数据库与目录：`projects_directory` 是项目库的位置（目录库不存项目库路径，由它和 `project_id` 推导），`outputs_directory` 是默认输出目录的根（`<Home>/outputs`，目录库同样不存它的路径），`root_home_directory` 供另一台设备的目录对应使用；目录 Store 的固定归属用 `spaceId` 注入，项目记录查询及创建返回同一个 `spaceId`，注册记录不得声明另一个空间。模块不读取其他 owner 的技术元数据表，也不决定登录身份、空间切换或云同步。

**项目目录。** 项目关联的每个本机文件夹是输入（只读，可以有多个）、输出（唯一，可写）或两者都是，记在目录库的 `workspaces`、`workspace_project_memberships`（`role_input`、`role_output` 两列）和 `workspace_source_links`（另一台设备的目录对应到本机的哪个文件夹，只在本机）。读是 `query.projectDirectories`（即 `projects.directories.get@1` 的形状），写是 `commands.changeDirectories`（对应 `projects.directories.{add_input,remove_input,set_output,repair,map_source,unmap_source}@1`，都带读到的 `expected_revision`）。没选过输出的项目，输出是默认输出目录 `<Home>/outputs/<project_id>/`：目录库里是真实的一行（`canonical_path` 记为 `project-output:<project_id>`，不存路径），文件夹第一次写或运行时才建；`query.defaultOutputDirectoryId`、`query.workspaceIdAt` 与 `query.outputDirectory` 给 Host 认这一行。项目不记「浏览目录」：页面看哪个文件夹是页面自己的状态。

**最近用过。** 项目库的 `material_recent_uses`（`src/material-recent.ts` 的 `MaterialRecentUses`）按调用方（本人或插件 id）记引用的 `MaterialRef`，不记正文；项目随库删除时一起清。`materials.recent`、`materials.recent.record`、`materials.origins` 三个动作由宿主装配，出处每次现读，不在本模块。

**升级。** 目录库与项目库都升到第 2 版：目录库 1→2 的段在本包 `catalog-upgrade.ts`（去掉方案 A 之前留下的写手工作树行、`is_default` 换成两个角色列、给每个没有输出的项目补默认输出目录；随 `CATALOG_UPGRADES` 登记在 `apps/local-host/src/project-catalog-contract.ts`）；项目库 1→2 的段在 `apps/local-host/src/project-database-schema.ts`（删 `project_browsing_settings`、加 `material_recent_uses`），其中的建表语句由本包 `material-recent.ts` 导出。低版本由启动升级过程升，较新的库拒绝。

项目身份和关联规则属于此处；Session 事实、Panel UI 和 Runtime 进程不属于此处。卸载检查只提供项目目录事实，不自行删除用户文件。

`projectReplicationOwner` 提供当前项目名称、时间和可携带插件清单；`validatePortableProject` 在准备目录前完整验证。`project_portable_plugins` 表示跨设备所需的插件，不等同于本机 `project_plugins` 启用状态。接收只保存清单，不安装、激活或授予权限；`projectPluginRequirements` 返回本机可用/启用投影，供入口呈现缺失插件。后续本机重命名不会丢失尚未安装插件的要求。本机添加/移除仍由同一 ProjectService 更新清单并在事务内记事件；被动准备项目不生成上传，路径、目录关联及执行状态不进入可携带内容。

项目资料当前拒绝直接接收空删除；完整删除/恢复仍须接入唯一 Host 删除服务，不能把资料同步通过记作项目生命周期已完成。错版的目录在打开可写连接前拒绝，不就地补表或改写真实 Home。

`commands.renameProject` 必须带编辑器最初观察到的 `expectedDisplayName`。Projects 在同一事务内重读并比较当前名称，过期观察先于同名空操作检查而拒绝，不写事件或同步队列；调用方不能在保存旧草稿前读取新名称来补观察值。HTTP 的 `expected_display_name` 来自渲染表单的初始值，冲突保留用户草稿并要求重新核对。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-projects typecheck
pnpm --filter @molis-ai/molis-work-module-projects build
```

已有行为示例与回归：[projects-module.test.ts](../../tests/projects-module.test.ts)、[project-directories.test.ts](../../tests/project-directories.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/projects-module.test.ts tests/project-directories.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：项目身份、目录（Catalog）、项目目录的输入/输出角色、默认输出目录与「最近用过」、生命周期；项目库里代表项目本身的根行（`project_root`）。
- 不负责：Session、桌面面板、Goal、Artifact、Runtime 进程状态；「最近用过」的出处读取（宿主装配 `materials.*`）。
- 公开入口：`@molis-ai/molis-work-module-projects`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/projects`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 目录库不保存项目库路径：由必填的 `projects_directory` 与单段 `project_id` 推导，合同的 `database_path` 是读出值。不是普通目录名的 id 在创建和读取时拒绝，项目库不由本模块移动（W5-17、S-102）。
  - 每个项目恰好一个输出目录，且每一项成员记录它的角色（`role_input`、`role_output`）：没选过输出的项目有默认输出目录那一行，`canonical_path` 是 `project-output:<project_id>`，路径由 `outputs_directory` 与 `project_id` 推导，第一次用到才建。默认输出目录的 id 以已写下的行为准（首个事件按 `created_at, rowid` 排，设备时钟回拨也不换 id）。
  - 目录事实只在本模块：一个文件夹的 id 在第一次关联时定下并跟路径走；写只经 `changeDirectories`，带读到的 revision；另一台设备来的引用只经 `workspace_source_links` 对应到本机文件夹，不按同名路径猜。
  - 身份只有 `project_id`：目录条目、项目数据库、库里的根行 `project_root` 与 Goals 的看板同值。项目库正好有一行根行，项目库里引用项目的外键（插件声明的表也一样）指向它，不指向 Goals 的表；根行不存标题，显示名只在目录里（`docs/platform/PLUGIN-DEVELOPMENT.md`「项目库里插件自己的表」）。
  - 目录关系的来源在 `bound_by`：等于本人的 id（`LOCAL_PERSON_ACTOR_ID`）才算本人建的，别的值一律不算，这是白名单，判法只在 `workspace-repository.ts`；输入、输出两种角色同样判。别的包读 `ProjectWorkspaceDirectoryRecord.person_project_ids`，不比 actor。`lifecycle.upsertWorkspaceMembership` 是工具绑定的入口，本人打开的终端也走它，新建的关系写 `binding:<actor>`，已有的关系和目录行（含 `realpath_verified`）一概不改（用户 2026-11-09 定 A）；`addWorkspaceProject` 与 `changeDirectories` 写调用者，都只给本人。重写不降级本人的值，本人再连一次就升为本人的；`lifecycle.unlinkWorkspaceMembership` 解除不了本人建的关系（`person_kept`），本人解除走 `remove_input`。
  - `query.projectPluginMembership` 在一次同步查询中共用当前常开判断，返回派生成员与过滤后的隐藏标记；先读取注册表，再查项目。结果不留在实例中，后续调用及等待后的写前检查仍须重新读取当前状态。`storedProjectPluginMembership` 只返回显示事实，不能代替它作可达性判断。
  - 卸载检查只提供目录事实，不删除用户文件。
  - `query.wasProjectPluginRemoved` 只读本项目的移除事实，供可信 Host 区分从未安装和用户主动移除；同步到达不能覆盖后者的本机选择。
  - 卸载检查只列 `projects` 表里的项目（`listCatalogProjectsForUninstall`）；`catalog_meta` 归 storage，目录是不是本产品的，由宿主用 `LocalCatalogMetadata` 判断后再问本模块。
  - 删除回执（`project_deletions`）带每个数据所有者的一步（`project_deletion_steps`：pending、complete），与目录自己的清理在同一个事务里写入；回执只有目录暂存已删且每一步都是 complete 时才是 complete。一步的所有者不在收尾的进程里时，这一步保持 pending 并留着上次的错误，等有这个所有者的进程来做，不会被当作无事可做。所有者清什么不归本模块。
  - 删除回执记下的暂存目录不可信（目录库可能被手改、恢复，或随 Home 一起拷走）：只认最后一段，且必须是这个项目的 `.deleting-<project_id>-<uuid>`，上层目录一律取本 Home 的 projects 目录（`recordedStagedProjectDirectoryPath`）。宿主在清理的第一步之前先推导；推不出来就拒绝（`catalog.project_storage_invalid`）：所有者不跑、步骤保持原样，不删文件，回执保持 pending 并留下错误（S-102）。
  - 目录库与项目库的结构改动都走升级段（`catalog-upgrade.ts`、`apps/local-host/src/project-database-schema.ts`）；低版本由启动升级过程升，较新的库拒绝，不在打开路径补表。
- 改动后必跑：`node scripts/run-tests.mjs tests/projects-module.test.ts tests/project-plugin-registry.test.ts tests/project-directories.test.ts tests/current-project-settings.test.ts tests/project-settings-deletion.test.ts tests/project-deletion-hooks.test.ts tests/project-recycle.test.ts tests/security-invariants-project-storage.test.ts`；目录与默认输出目录另跑 `node scripts/run-tests.mjs tests/default-output-first-use.test.ts tests/material-recent-uses.test.ts`。
- 个人资料同步另跑：`node scripts/run-tests.mjs tests/security-invariants-project-metadata-sync.test.ts tests/project-catalog.test.ts tests/personal-sync.test.ts`。
- 相关手册：[docs/modules/projects.md](../../docs/modules/projects.md)、[docs/platform/PROJECT-SETTINGS.md](../../docs/platform/PROJECT-SETTINGS.md)、[共同设计](../../specs/shared-sources-and-surfaces/spec.md) §3；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/modules/projects.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

`ProjectsModule.recycle` 保留原项目、插件与目录事实，以显式观察指纹和持久操作回执提交回收/恢复。回收项目从正常查询与选择中隐藏；普通同步准备不能复活它。状态世代阻止旧确认在恢复后重放。本机 observed_at 仅作诊断，不作为服务端 30 天期限。Host 的 `ProjectDeletionService.changeRecycled` 在运行环境释放后再提交；同步接收与 UI、服务端期限和各 owner GC 仍待连接，不能据此声称项目生命周期已交付。

回收状态独立保留未知项目的删除事实，不创建占位项目；正常回收列表只展示仍有项目原件的记录。`projectReplicationOwner` 仅在可信 `authorizeLifecycle` 许可下于接收事务写入删除/恢复状态，缺少许可仍拒绝；不写本机命令事件或回执，最终版本和幂等性由同事务同步日志维护。已回收项目的普通非空写入同样要求恢复许可。这是 Host 接线的 owner 能力，尚未代表生产入口已启用。
