# 分区归类表（第 106 批 片 A，spec §9.2）

> 状态：106 批交付的逐文件归类表，评审按表核对。随 107～111 批搬迁逐行改「批」列直到清零；109 批收尾时并入 spec 归档。

数法（2026-11-24，`batch/106` 头；2026-11-25 复核补录）：在 `apps`、`modules`、`packages`、`horizontal`、`plugins`、`server`、`scripts` 的非测试源码里，先按字面写法数 `project_id: null`、`project_id === null`、`projectId: null`、`projectId === null`、`project_id ?? null`、`project_id = ""`、`project_id ?? ""`、`project_id || null`、`projectId ?? null`（**359 处 / 180 个文件**），再补录三元置 `null`、`IS NULL`、`!== null`、`spec.md §9.2` 点名的非空/空串 DDL 约定与首页独立 Home 库 `#home-pages-owner`（**+57 处 / +42 个文件**）。spec 写的「约 660 处」把测试和生成物也算进去了；本表只数非测试源码，合计 **416 处 / 222 个文件**。

归类（spec §9.2）：
- **①** Home 系统作用域：包安装、账号、系统动作、Shelf、授权、MCP 设置。保留 `null`，字段名不变。
- **②** Home 级业务位置：一律改 `"personal"`（其中首页独立 Home 库 `home-pages/home-pages.db` 已按全部分区 `project_id` 隔离，无 `null` 语义）。
- **③** 平台记录里的可空项目：按含义拆开，「不属于任何分区」保留 `null`，「属于个人空间」改 `"personal"`。

合计：① 136 处（原 117 + 补 19），② 125 处（原 111 + 补 14，另含已分区化的 `horizontal/home/src/store.ts`），③ 155 处（原 131 + 补 24）。本批只加不删（V1），所以除了资料支撑表与首页独立 Home 库以外，②③ 都不在本批改；「批」列写的是哪一批负责清零。

## 1. `listProjects()` 与 `listPartitions()`

`listProjects()` 只给用户项目列表，`listPartitions()` 给个人空间加上所有项目，个人空间排第一，供平台遍历用。下表每一行都是改过之后的样子。

| 文件 | 用哪个 | 为什么 |
| --- | --- | --- |
| `apps/local-host/src/web-routing.ts` | `listPartitions` 给切换器；`listProjects().length` 给 `projectCount` | 切换器要列出个人空间；首次运行只数用户项目（X2 现存缺陷已修） |
| `apps/local-host/src/web-catalog-access.ts` | `listProjects` | 数用户项目 |
| `apps/local-host/src/web-request.ts`、`web-catalog-routes.ts`、`web-catalog-index-routes.ts`、`web-catalog.ts` | 改读 `projectCount` | 引导、项目设置、健康页、项目索引判断「有没有项目」时不算个人空间 |
| `apps/local-host/src/personal-project-copy.ts`、`web-project-recycle.ts` | `listProjects` | 整项目复制和回收站只对用户项目；原来各自写的个人空间过滤删掉了 |
| `apps/local-host/src/web-project-deletion.ts`、`cli-project-maintenance.ts` | `listProjects` | 删除和维护只对用户项目（个人空间另有守卫拒绝） |
| `apps/local-host/src/demo-project-lifecycle.ts`、`plugin-demo-seed.ts`、`examples/seed-demo.mts` | `listProjects` | 示例项目查找 |
| `apps/local-host/src/mcp-context-gateway.ts` | 两个都转发 | 网关原样转出目录 |
| `apps/local-host/src/project-catalog.ts` | 两个都提供；`ensurePersonalPartition` 读 `listPartitions` | 目录本身 |
| `apps/mcp/src/runtime-context-tools.ts` | `listProjects` | 外部工具绑到个人空间随 110 批的 `S-mcp-personal-binding` 一起放开，本批不变 |
| `apps/local-host/src/personal-project-provisioner.ts`、`managed-project-files.ts` | `listPartitions` | 建分区前查重 |
| `apps/local-host/src/runtime-sync-discovery.ts`、`personal-plugin-sync.ts`、`personal-catalog-sync.ts`、`personal-artifact-sync.ts`、`project-sync-catalog.ts` | `listPartitions` | 同步要遍历全部分区 |
| `apps/local-host/src/observation-host.ts` | `listPartitions` | 工作记录要遍历全部分区 |
| `apps/local-host/src/web-project-schedulers.ts` | `listPartitions` | 调度要遍历全部分区 |
| `apps/local-host/src/home-restore-projects.ts` | `listPartitions` | 恢复时核对目录里的每个分区库都在快照里 |
| `apps/local-host/src/project-deletion-service.ts`、`project-reach.ts`、`plugin-projects-service.ts`、`plugin-directory-http.ts`、`authorization-management-http.ts`、`management-action-client.ts`、`system-agent-service.ts`、`assistant/assistant-pages.ts`、`web-project-settings.ts` 的插件启用页、`project-host.ts` | `listPartitions` | 平台按 id 找分区、或遍历全部分区 |
| `apps/local-host/src/web-project-settings.ts` 的 `personProjects`（`GET /api/settings/projects`） | `listProjects` | 设置里的项目列表只对用户项目；个人空间不能改名、删除。`settingsProjects` 仍用 `listPartitions`：设置与能力页按 `?project=` 解析时个人空间也在；没点名也没打开过时，设置页落到第一个用户项目（`web-settings-arrival.ts`）；「设置 › 项目」的项目管理列表（`settings-project-manager.ts`）、授权管理/项目规则下拉（`settings-authorizations.ts`）、个人记忆「移入项目」列表（`settings-memory.ts`）与安装诊断的项目数均过滤掉 `personal`，其余设置与能力页的视图仍带全部分区，从个人空间点开时能解析、标注它 |
| `apps/local-host/src/sessions-ports.ts` | `listProjects` | 外部会话归入个人空间随 111 批的界面一起做，本批不变 |
| `modules/private-work-context/src/project-resolution.ts` | `listProjects` | 外部工具的项目建议与 MCP 项目列表一致，本批不建议个人空间；随 110 批 `S-mcp-personal-binding` 一起放开 |
| ~~开发金样填充脚本~~（已按[决定 68](../post-anticorruption-roadmap/reference/decisions.md#decision-68) 移除） | — | 开发前阶段不维护开发金样 |

## 2. `host.projects()`（打开着的分区实例）

`host.projects()` 返回的是已经打开的实例，不是目录。个人空间一旦打开也在里面，所以这 23 个文件（44 处）本来就是按「全部分区」在遍历，不用改。唯一带个人空间特判的是 `placement-actions.ts`：本批删掉了它的 `ensurePersonalSpace` 懒建口和 `record()` 里的个人捷径；`HOME` 标记留到 110 批再删。

`agent-definitions/skill-catalog-host.ts`、`agent-reference-kinds.ts`、`blueprint-host.ts`、`composer-sources-http.ts`、`home-aggregate.ts`、`local-host.ts`、`memory/memory-upkeep.ts`、`observation-host.ts`、`personal-project-sync.ts`、`placement-actions.ts`、`plugin-actions-client.ts`、`plugin-install-gateway.ts`、`plugin-installed-projects.ts`、`plugin-trust-actions.ts`、`project-deleted-runtime.ts`、`project-host.ts`、`project-plugin-ports.ts`、`project-reach.ts`、`runtime-overview-http.ts`、`scope-installations.ts`、`task-grant-actions.ts`、`web-project-schedulers.ts`、`web-request.ts`（均在 `apps/local-host/src/`）。

## 3. 直接列 `projects/` 目录或手拼分区路径

| 位置 | 改法 |
| --- | --- |
| `apps/local-host/src/artifact-row-storage-policy.ts` | 改用 `partitionRootsOnDisk()` |
| `apps/local-host/src/plugin-holders.ts` | 改用 `partitionDatabasePath()`，删掉 `projects/` 前缀判断 |
| `apps/local-host/src/local-uninstall.ts`、`modules/projects/src/installation-inspection.ts` | 经 `projectDatabasePath()` 推路径，它对 `personal` 给出 `personal-space/` |
| `apps/local-host/src/installer/uninstall.ts` | 用户项目不算个人空间；`personal-space/` 进保留路径 |
| `apps/local-host/src/home-restore-projects.ts`、`home-restore-inspection.ts`、`home-restore-finish.ts`、`home-unavailable-owners.ts`、`platform-upgrade-stores.ts` | 用 `<partition>` 通配（`matchesPartitionPattern` / `partitionOfRelativePath`），拒绝伪造 `projects/personal/*` 并将 `personal-space/libraries/*.db` 纳入目录对账 |
| `horizontal/home/src/store.ts`（`home-pages/home-pages.db`，`#home-pages-owner`） | 首页独立 Home 库：全部 6 张表以 `project_id TEXT NOT NULL` 按分区（`personal` 与各项目）隔离存储，删项目经 `apps/local-host/src/project-deleted-owners.ts` 仅清该项目行、保留个人空间首页选择与批准记录 |
| `apps/local-host/src/project-database.ts` | 用 `partitionOfDatabasePath()` / `partitionDatabasePath()` |
| `apps/local-host/src/home-stores.ts`、`home-store-snapshot.ts` | 登记 `personal-space` 存储和它的快照规则（与项目库同一套 `partitionDatabaseSnapshot`） |
| `apps/local-host/src/plugin-sandbox-owner-files.ts` | 项目级沙箱主人文件根改用 `partitionRoot()` |
| `apps/local-host/src/platform-upgrade-stores.ts` 里的 `partitionFiles` / `libraryDescriptor` | 仍按 `<store>/projects/*` 找，因为今天没有内置插件申报按分区的 Home 库；107 批落地 `databases.partition` 时改到分区根 |
| ~~原 schema 存储清单表键~~（已按[决定 68](../post-anticorruption-roadmap/reference/decisions.md#decision-68) 移除） | 开发前阶段改由 `scripts/gates/initial-versions.mjs` 统一守卫全量 v1 与零 `upgrades` |

## 4. `project_id: null` 逐文件

| 文件 | 处数 | 类 | 含义 | 改法 | 批 |
| --- | ---: | --- | --- | --- | --- |
| `apps/local-host/src/action-call-log.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/action-gateway-http.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/agent-definitions/prompt-overrides.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/agent-definitions/skill-catalog.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/assistant/assistant-action-delegation.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-action-policy.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-attachments.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-authority.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-followups.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-http.ts` | 6 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-memory-bridge.ts` | 4 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-memory-sources.ts` | 3 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-memory-tools.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-offers.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-outcomes.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-person-actions.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-present.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-project-purge.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-relations.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-send-materials.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-service-shared.ts` | 3 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-setup-material.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-task-reports.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-work-permission-http.ts` | 2 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/assistant/assistant-work-permissions.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/attention-changes.ts` | 4 | ② | 运行总览与提醒的 Home 汇总 | 改读总览索引 | 108 |
| `apps/local-host/src/authorization-action-owners.ts` | 6 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/authorization-management.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/blueprint-host.ts` | 1 | ③ | 判断规则、主线、蓝图的无项目写法 | 逐个归类为本人级或个人空间 | 110 |
| `apps/local-host/src/blueprint-http.ts` | 1 | ③ | 判断规则、主线、蓝图的无项目写法 | 逐个归类为本人级或个人空间 | 110 |
| `apps/local-host/src/computer/computer-desk.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/computer/computer-driver.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/computer/computer-record-source.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/connector-plugin-requests.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/connector-plugin-slot-actions.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/connector-source-pull.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/home-installed-plugins.ts` | 4 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/home-plugin-executor.ts` | 10 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/home-plugin-http.ts` | 4 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/home-plugins.ts` | 1 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/installed-action-registration.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/installed-plugin-catalog.ts` | 5 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/installed-plugin-exposed-actions.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/installed-plugin-exposure.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/installed-plugin-lifecycle.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/installed-plugin-sandbox-definition.ts` | 4 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/local-host-scenes.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/local-host.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/local-web-actions.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/material-attachments.ts` | 1 | ② | 资料支撑表的 Home 级位置 | 改全分区（含 `personal`），清零 `project_id = ""` | 106（本批） |
| `apps/local-host/src/material-original-files.ts` | 1 | ② | 资料支撑表的 Home 级位置 | 改全分区（含 `personal`），清零 `project_id = ""` | 106（本批） |
| `apps/local-host/src/mcp-action-grants.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/mcp-context-gateway.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/mcp-server.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/mcp-settings-store.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/memory/memory-host.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/memory/memory-runtime-policy.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/memory/memory-session-binding.ts` | 2 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/memory/memory-upkeep.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/observation-host.ts` | 3 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `apps/local-host/src/onboarding.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/personal-project-copy.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/placement-actions.ts` | 1 | ② | 放置的 `HOME` 标记 | 删 `HOME` 分支，改 `personal` | 110 |
| `apps/local-host/src/placement-http.ts` | 5 | ② | 放置的 `HOME` 标记 | 删 `HOME` 分支，改 `personal` | 110 |
| `apps/local-host/src/plugin-actions-client.ts` | 3 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/plugin-builder/agent-surface.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-builder/studio-preview.ts` | 3 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-callers.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-connection-slots-http.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-consent-settings-entry.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-data-export.ts` | 4 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-directory-http.ts` | 3 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-directory-service.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-directory-store.ts` | 3 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-evidence-collector.ts` | 1 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `apps/local-host/src/plugin-installation-cleanup.ts` | 6 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-installation-directory.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-page-actions.ts` | 1 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/plugin-page-authority.ts` | 4 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/plugin-page-http.ts` | 4 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/plugin-project-reach-subject.ts` | 1 | ② | 跨项目可达（`project_reach`） | 整套退役，由总览索引取代 | 108 |
| `apps/local-host/src/plugin-sandbox-owner-files.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/plugin-sync-database.ts` | 2 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/plugin-terminal-panels.ts` | 1 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/plugin-terminal-service.ts` | 1 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/project-action-availability.ts` | 1 | ② | 跨项目可达（`project_reach`） | 整套退役，由总览索引取代 | 108 |
| `apps/local-host/src/project-arrival.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/project-plugin-ports.ts` | 2 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/project-reach.ts` | 1 | ② | 跨项目可达（`project_reach`） | 整套退役，由总览索引取代 | 108 |
| `apps/local-host/src/pty-page-access.ts` | 2 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/runtime-overview-http.ts` | 1 | ② | 运行总览与提醒的 Home 汇总 | 改读总览索引 | 108 |
| `apps/local-host/src/runtime-overview.ts` | 4 | ② | 运行总览与提醒的 Home 汇总 | 改读总览索引 | 108 |
| `apps/local-host/src/sandbox-integration.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/search-actions.ts` | 1 | ② | 搜索的 `null = 个人` | 改明确分区标注 | 110 |
| `apps/local-host/src/surface-home-form-authority.ts` | 1 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/surface-installation.ts` | 1 | ② | Home 插件实例的业务位置 | 随普通插件改分区作用域归零（新每分区装配已在本批落地） | 108～109 |
| `apps/local-host/src/web-catalog-settings.ts` | 3 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/web-connector-methods.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/web-context-onboarding.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/web-entry-actions.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/web-mcp-action-settings.ts` | 3 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/web-project-platform-routes.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/local-host/src/web-request.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/workbench/src/arrival/chooser.ts` | 1 | ② | 切换器里的个人空间 | 切换器置顶，先定样 | 111 |
| `apps/workbench/src/browser/runtime-panel.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/workbench/src/browser/sessions/unfiled-view.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/workbench/src/home-plugin-page.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/workbench/src/mcp-access.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/workbench/src/scripts/client/placement.ts` | 4 | ② | 放置的 `HOME` 标记 | 删 `HOME` 分支，改 `personal` | 110 |
| `apps/workbench/src/settings-authorizations.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/workbench/src/settings-call-diagnostics.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/workbench/src/settings-renderer.ts` | 2 | ① | Home 系统作用域 | 保留 `null` | — |
| `apps/workbench/src/shell-page-renderer.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `horizontal/agent-host/src/adapters/prologue-work-delegation.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/agent-host/src/capability-registration.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/agent-host/src/character-import.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/agent-host/src/delegation-state.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/agent-host/src/run-start.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/blueprints/src/replication.ts` | 1 | ③ | 判断规则、主线、蓝图的无项目写法 | 逐个归类为本人级或个人空间 | 110 |
| `horizontal/evaluation/src/replay.ts` | 1 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/evaluation/src/run-executor.ts` | 1 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/evaluation/src/store.ts` | 5 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/knowledge/src/index.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/mainline/src/items.ts` | 1 | ③ | 判断规则、主线、蓝图的无项目写法 | 逐个归类为本人级或个人空间 | 110 |
| `horizontal/memory/src/candidates.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/memory/src/management-pages.ts` | 2 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/memory/src/service.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/observation/src/access.ts` | 6 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/observation/src/cleanup.ts` | 2 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/observation/src/holds.ts` | 4 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/observation/src/lifecycle.ts` | 1 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/observation/src/queries.ts` | 1 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/observation/src/read-actions.ts` | 1 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/observation/src/service.ts` | 2 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/observation/src/space.ts` | 1 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/placement/src/index.ts` | 16 | ② | 放置的 `HOME` 标记 | 删 `HOME` 分支，改 `personal` | 110 |
| `horizontal/search/src/index.ts` | 6 | ② | 搜索的 `null = 个人` | 改明确分区标注 | 110 |
| `horizontal/search/src/references.ts` | 1 | ② | 搜索的 `null = 个人` | 改明确分区标注 | 110 |
| `horizontal/sessions/src/attribution.ts` | 19 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/sessions/src/runtime-view.ts` | 2 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `modules/artifacts/src/artifact-subject-context.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `modules/context-ledger/src/materialization.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `modules/context-ledger/src/replication.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `modules/context-ledger/src/service.ts` | 1 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `modules/judgment-rules/src/declared-rules.ts` | 1 | ③ | 判断规则、主线、蓝图的无项目写法 | 逐个归类为本人级或个人空间 | 110 |
| `modules/judgment-rules/src/judgments.ts` | 2 | ③ | 判断规则、主线、蓝图的无项目写法 | 逐个归类为本人级或个人空间 | 110 |
| `modules/private-work-context/src/context-bindings.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `modules/private-work-context/src/project-binding-commands.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `modules/shelf/src/surface/browser/material.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `packages/contracts/src/services/evaluation.ts` | 5 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `packages/contracts/src/services/memory-session.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `packages/contracts/src/services/memory.ts` | 6 | ③ | 助理、记忆与上下文的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `packages/contracts/src/services/observation-holds.ts` | 2 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `packages/contracts/src/services/observation.ts` | 2 | ③ | 工作记录、评测与外部会话归属 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `packages/contracts/src/services/placement.ts` | 3 | ② | 放置的 `HOME` 标记 | 删 `HOME` 分支，改 `personal` | 110 |
| `packages/contracts/src/services/search.ts` | 2 | ② | 搜索的 `null = 个人` | 改明确分区标注 | 110 |
| `packages/kernel/src/action-registered-execution.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `packages/kernel/src/index.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `packages/plugin-runtime/src/activation-jobs.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `packages/plugin-sandbox/src/runner.ts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `packages/storage/src/adapters/text-search-index.ts` | 2 | ② | 搜索的 `null = 个人` | 改明确分区标注 | 110 |
| `plugins/native/coding/src/home-background.ts` | 1 | ③ | 主库插件的平台记录可空项目 | 按含义归类，随主库去 `project_id` | 109 |
| `plugins/native/coding/src/plugin.ts` | 2 | ③ | 主库插件的平台记录可空项目 | 按含义归类，随主库去 `project_id` | 109 |
| `plugins/native/coding/src/route-activation.ts` | 1 | ③ | 主库插件的平台记录可空项目 | 按含义归类，随主库去 `project_id` | 109 |
| `plugins/native/coding/src/work-events.ts` | 1 | ③ | 主库插件的平台记录可空项目 | 按含义归类，随主库去 `project_id` | 109 |
| `plugins/native/dataset/src/store.ts` | 1 | ② | 独立库插件的 Home 共用库位置 | 迁 `databases.partition` | 107 |
| `plugins/native/feed/src/out-rules.ts` | 1 | ③ | 主库插件的平台记录可空项目 | 按含义归类，随主库去 `project_id` | 109 |
| `plugins/native/form/src/store.ts` | 1 | ② | 独立库插件的 Home 共用库位置 | 迁 `databases.partition` | 107 |
| `plugins/native/images/src/browser/result.ts` | 2 | ② | 原 Home 插件的个人位置 | 改 `personal` 分区 | 108 |
| `plugins/native/pages/src/store.ts` | 1 | ② | 独立库插件的 Home 共用库位置 | 迁 `databases.partition` | 107 |
| `plugins/native/ppt/src/store.ts` | 1 | ② | 独立库插件的 Home 共用库位置 | 迁 `databases.partition` | 107 |
| `plugins/native/todo/src/actions.ts` | 2 | ② | 原 Home 插件的个人位置 | 改 `personal` 分区 | 108 |
| `plugins/native/todo/src/organize-actions.ts` | 1 | ② | 原 Home 插件的个人位置 | 改 `personal` 分区 | 108 |
| `plugins/native/todo/src/organize.ts` | 1 | ② | 原 Home 插件的个人位置 | 改 `personal` 分区 | 108 |
| `plugins/native/todo/src/store-support.ts` | 1 | ② | 原 Home 插件的个人位置 | 改 `personal` 分区 | 108 |
| `plugins/native/todo/src/store-writes.ts` | 3 | ② | 原 Home 插件的个人位置 | 改 `personal` 分区 | 108 |
| `scripts/preview-functions.mts` | 1 | ① | Home 系统作用域 | 保留 `null` | — |
| `server/src/im/reads.ts` | 1 | ③ | 项目讨论 IM 的存储 | 个人空间 IM 已与项目同构（R21），存储键归类 | 110 |

### 4.1 复核补录：首页独立 Home 库（`#home-pages-owner`）、`spec.md §9.2` 点名文件与三元/`IS NULL`/DDL 写法

| 文件 | 处数 | 类 | 含义 | 改法 | 批 |
| --- | ---: | --- | --- | --- | --- |
| `apps/local-host/src/activation-partition.ts` | 1 | ② | 资料支撑表的分区归属助手（将 `null` 归为 `personal`） | 106 已收口，随 Home 实例退役清理 | 106（本批） |
| `apps/local-host/src/agent-definitions/skill-catalog-host.ts` | 1 | ① | Home 系统作用域（未打开分区时传 `null` 查 Home 安装） | 保留 `null` | — |
| `apps/local-host/src/agent-host-composition.ts` | 1 | ② | 附件归属（非项目记录时传 `null`） | 随普通插件改分区作用域归零 | 108～109 |
| `apps/local-host/src/assistant/assistant-round-materials.ts` | 1 | ③ | 助理、记忆与上下文的可空项目（知识目录作用域） | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/context-onboarding-service.ts` | 1 | ① | 引导流程未绑定既有项目时的校验（`null`） | 保留 `null` | — |
| `apps/local-host/src/context-onboarding-store.ts` | 2 | ① | 引导流程存储的可空目标项目（新建项目前无 `project_id`） | 保留 `null` | — |
| `apps/local-host/src/home-unavailable-owners.ts` | 2 | ① | 升级不可用诊断（Home 级存储 `project_id: null`） | 保留 `null`（分区库经 `partitionOfRelativePath` 解析） | — |
| `apps/local-host/src/knowledge-actions.ts` | 1 | ③ | 知识检索源键的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/local-host/src/plugin-database-partitions.ts` | 1 | ② | 旧共用库按分区复用器的调用方作用域判断 | 107 随 6 个独立库迁 `databases.partition` 删除复用器 | 107 |
| `apps/local-host/src/uninstall-retained.ts` | 1 | ① | 卸载留存数据键（Home 级安装 `projectId === null`） | 保留 `null` | — |
| `apps/local-host/src/web-capabilities.ts` | 1 | ① | 能力页调用历史列表（未选项目时查 Home 级 `null`） | 保留 `null` | — |
| `apps/workbench/src/browser/appearance-sync.ts` | 2 | ① | 浏览器同源外观同步匹配（无项目页面用空串比较） | 保留 `null`/空 | — |
| `apps/workbench/src/browser/work-bar.ts` | 2 | ① | 浏览器本地缓存键（按页面 `dataset.projectId` 隔离） | 保留 | — |
| `apps/workbench/src/browser/work-event-card.ts` | 2 | ① | 浏览器事项卡片停靠缓存与链接拼装 | 保留 | — |
| `apps/workbench/src/scripts/client/assistant-choosers.ts` | 1 | ③ | 助理界面角色选择器的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `apps/workbench/src/scripts/client/context-bus.ts` | 1 | ② | 放置卡片上下文总线（无项目回落 `null`） | 随放置去 `HOME` 改明确分区 | 110 |
| `apps/workbench/src/scripts/client/initialization.ts` | 1 | ③ | 工作台初始化挂载技能挑选器（`project_id || null`） | 随工作台分区统一清理 | 111 |
| `apps/workbench/src/scripts/mcp-access.ts` | 1 | ① | MCP 授权设置页动作开关（Home 级传 `null`） | 保留 `null` | — |
| `apps/workbench/src/settings-kit.ts` | 1 | ① | 能力套件全局设置页（`data-project` 为空表示 Home 级） | 保留 `null` | — |
| `apps/workbench/src/settings-memory.ts` | 1 | ③ | 记忆设置页个人层（本人级，`data-project=""`） | 本人级保留 `null`（1.1），「移入项目」目标列表已排除 `personal` | — |
| `apps/workbench/src/side-view-document.ts` | 1 | ① | 侧边面板插件挂载（无项目时传 `null`） | 保留 `null` | — |
| `horizontal/agent-host/src/adapters/prologue-surfaces.ts` | 1 | ③ | 模型轮次描述中的可空项目 | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/blueprints/src/index.ts` | 2 | ③ | 蓝图采用目标的可空项目（`current_project` vs `personal`） | 逐个归类为本人级或个人空间 | 110 |
| `horizontal/blueprints/src/store.ts` | 2 | ③ | 蓝图预览存储中 `target.kind === "personal" ? null` | 逐个归类为本人级或个人空间 | 110 |
| `horizontal/home/src/store.ts` | 0 | ② | 首页独立 Home 库（`home-pages/home-pages.db`，`#home-pages-owner`），全部 6 张表按 `project_id TEXT NOT NULL`（含 `personal`）隔离、无 `null` 语义 | 已按分区隔离，删项目经 `project-deleted-owners.ts` 仅清该项目行 | 106（已达标） |
| `horizontal/mainline/src/store.ts` | 1 | ③ | 主线表无项目存储写法（`spec.md §9.2` L14-21） | 逐个归类为本人级或个人空间 | 110 |
| `horizontal/memory/src/scope-commands.ts` | 3 | ③ | 记忆作用域命令的可空项目（个人层/角色层/项目层） | 拆清本人级与个人空间（R15） | 110 |
| `horizontal/observation/src/records.ts` | 1 | ③ | 工作记录覆盖上报中的 `projectId ?? ""` | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/placement/src/project-copy-preview.ts` | 2 | ② | 放置复制预览中的 `projectId !== null` 判定 | 删 `HOME` 分支，改 `personal` | 110 |
| `horizontal/sessions/src/store-decisions.ts` | 3 | ③ | 外部会话归属决策表的可空 `project_id` | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/sessions/src/store.ts` | 2 | ③ | 外部会话记录的 `reported_project_id`/`derived_project_id` 可空列 | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `horizontal/sessions/src/suggest.ts` | 1 | ③ | 外部会话归属建议的可空 `project_id` | 「不属于任何分区」留 `null`，「属于个人空间」改 `personal` | 110 |
| `modules/characters/src/roles.ts` | 2 | ② | Characters 角色个人层特判（`spec.md §9.2` L29：`projectLayerOf` 将 `personal` 折为 `null`） | 个人层归本人级（1.1），清理 `personal → null` 特判 | 110 |
| `modules/context-ledger/src/history-replication.ts` | 1 | ③ | 上下文账本历史同步引用的可空 `project_id` | 拆清本人级与个人空间（R15） | 110 |
| `modules/judgment-rules/src/store-schema.ts` | 1 | ③ | 判断规则表用 `DEFAULT ''` 表示无项目（`spec.md §9.2` L40） | 逐个归类为本人级或个人空间 | 110 |
| `packages/kernel/src/action-service.ts` | 1 | ① | 场景键 `scopedSceneKey`（Home 级作用域 `projectId ?? null`） | 保留 `null` | — |
| `packages/storage/src/adapters/knowledge-cards.ts` | 1 | ③ | 知识卡片表非空 `project_id` 存储写法（`spec.md §9.2` L19-28） | 拆清本人级与个人空间（R15） | 110 |
| `plugins/native/todo/src/caller.ts` | 1 | ② | Todo 调用方将 `personal` 折为 `null` | 改 `personal` 分区，删折算 | 108 |
| `plugins/native/todo/src/search.ts` | 1 | ② | Todo 搜索结果将个人待办 `project_id` 置 `null` | 改 `personal` 分区 | 108 |
| `plugins/native/todo/src/store-base.ts` | 1 | ② | Todo 查询 `project_id IS NULL` | 改 `personal` 分区，清 `IS NULL` | 108 |
| `plugins/native/work-brief/src/store.ts` | 3 | ② | Work Brief 用 `scope === "personal" ? ""` 与 `projectId ?? ""` 存个人简报 | 迁分区库，清 `scope` 枚举与空串 | 108～109 |
| `server/src/identity.ts` | 1 | ① | 服务端成员/邀请码签发（无项目归属时 `projectId ?? null`） | 保留 `null` | — |

