# Projects

**定位：** Project 身份、Catalog、workspace membership、生命周期与存储定位的唯一 owner。`project_id` 是唯一身份：目录条目、项目数据库和库里 Goals 的根记录（`boards` 表）都用它。

**当前已拥有：** Project metadata、workspace membership、数据库定位、创建/重命名/删除记录与 Project Event。未来 Personal/Team owner reference、archive/access mode 仍需独立功能 Spec，AP1 没有伪造当前不存在的能力。

**公开面：** `ProjectsModule.query` 提供列表、读取、选择、workspace 目录、项目的输入与输出（`projectDirectories`、`outputDirectory`）和删除记录；`ProjectsModule.commands` 提供重命名、加入输入目录（`addWorkspaceProject`）和项目目录的改动（`changeDirectories`，即 `projects.directories.*` 的六项）；本地 composition root 通过受控 `lifecycle` 端口完成文件落盘前后的注册、回滚、事件和删除收据。

**不负责：** 不拥有 Session、Desktop panel、Goal、Artifact 或 Runtime binding 的业务状态；workspace membership 只表达“这个 Project 与哪个本地目录关联，该目录对它是输入（只读，可多个）还是输出（唯一，可写）”，不把目录路径当成 Session ID。

**当前来源与 Goal：** AP1 已把 `projects`、`project_events`、`workspaces`、`workspace_project_memberships`（用 `role_input`、`role_output` 两列记角色）、`workspace_source_links`（另一台设备的目录对应到本机的哪个文件夹）、`project_deletions` 的 schema、Repository（按表族分三个类：项目记录、工作区、删除回执，`repository.ts` 只是把它们装在一起）和规则迁入本模块。旧 `src/projects/catalog.ts` 已删除；文件生命周期由 Local Host 装配，Runtime binding 归 Private Work Context，Desktop panel 归 Desktop。

## 当前项目设置读取

目录关系分本人建的和工具带进来的，输入、输出两种角色都一样：`ProjectWorkspaceDirectoryRecord.person_project_ids` 只列本人建的，`bound_by` 等于本人的 id 才算，别的值都不算；工具绑定（含本人打开的终端带的目录）写 `binding:<actor>`，覆盖不了本人的值，也解除不了本人建的关系。这项判断只在本模块，别的包不比 actor。

目录关联仍由本模块唯一管理。插件通过 `projects.directories.get`（`projectDirectoryActions.get`）读取当前项目的输入目录与输出目录，每项带 `roles`，Host 不返回其他项目关联；改目录是本人的六个动作 `projects.directories.{add_input,remove_input,set_output,repair,map_source,unmap_source}`，带 `expected_revision`。每个项目恰好有一个输出目录：没选过就是 Home `outputs/<项目>` 下的默认输出目录，建项目时写下那一行，文件夹第一次用到才建。项目不记「浏览目录」，页面看哪个目录是页面自己的状态。本模块还拥有「最近用过」`material_recent_uses`（项目库）和 `materials.recent`、`materials.recent.record`、`materials.origins` 三个动作。设置 UI、权限与归属细则见 [当前项目设置](../platform/PROJECT-SETTINGS.md)。
