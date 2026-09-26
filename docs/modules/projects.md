# Projects

**定位：** Project 身份、Catalog、workspace membership、生命周期与存储定位的唯一 owner。正式概念是 `project_id`，`board_id` 只作为旧 V1 数据库身份保留。

**当前已拥有：** Project metadata、workspace membership、数据库定位、创建/重命名/删除记录、Project Event 与 legacy `board_id` mapping。未来 Personal/Team owner reference、archive/access mode 仍需独立功能 Spec，AP1 没有伪造当前不存在的能力。

**公开面：** `ProjectsModule.query` 提供列表、读取、选择、workspace 目录和删除记录；`ProjectsModule.commands` 提供重命名与 workspace membership 操作；本地 composition root 通过受控 `lifecycle` 端口完成文件落盘前后的注册、回滚、事件和删除收据。

**不负责：** 不拥有 Session、Desktop panel、Goal、Artifact 或 Runtime binding 的业务状态；workspace membership 只表达“这个 Project 与哪个本地目录关联”，不把目录路径当成 Session ID。

**当前来源与 Goal：** AP1 已把 `projects`、`project_events`、`workspaces`、`workspace_project_memberships`、`project_deletions` 的 schema、Repository 和规则迁入本模块。旧 `src/projects/catalog.ts` 已删除；文件生命周期由 Local Host 装配，Runtime binding 归 Private Work Context，Desktop panel 归 Desktop。

## 当前项目设置读取

目录关联仍由本模块唯一管理。插件通过 `projectSettingsCapabilities.workspaces / browsingWorkspace` 按项读取当前项目，Host 不返回其他项目关联。浏览偏好仅存目录 ID，位于 Local Host 的项目数据库；迁移旧 Workspace 选择。设置 UI、权限、归属与兼容细则见 [当前项目设置](../platform/PROJECT-SETTINGS.md)。
