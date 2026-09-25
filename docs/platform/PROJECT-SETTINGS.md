# 当前项目设置

项目设置管理当前项目共用的配置。工作目录在「项目设置 → 工作目录」中查看、关联和选择；Files 与 Git 使用当前浏览目录。Coding 和插件创作台从同一份已关联目录中另选执行目录。浏览选择不改写既有会话，也不授予执行权限。

## 插件读取

Contract：`@molis-ai/molis-work-contracts/modules/projects` 的 `projectSettingsCapabilities`。

| 设置项 | Capability ID | 返回 |
| --- | --- | --- |
| 已关联目录 | `projects.settings.workspaces.read.v1` | `readonly ProjectWorkspaceRef[]` |
| 当前浏览目录 | `projects.settings.browsing-workspace.read.v1` | `ProjectWorkspaceRef \| null` |

两个能力分别写入 Manifest `capabilities.consumes`。调用统一为 `context.services.capabilities.invoke(capability, [])`。未声明的项在 Plugin Runtime 拒绝；Host 未装配的项返回不可用。不存在全量设置读取、通配授权或任意 key 查询。调用不接受项目编号；Host 根据当前 runtime 的项目返回，显式只投影 `workspace_id / canonical_path / realpath_verified / display_name`，不返回 catalog 的其他项目关联。

```ts
import { projectSettingsCapabilities } from '@molis-ai/molis-work-contracts/modules/projects';
// Manifest 中：
capabilities: { provides: [], consumes: [projectSettingsCapabilities.workspaces.capability_id] }
// start(context) 或 route handler 中：
const candidates = await context.services!.capabilities!.invoke(projectSettingsCapabilities.workspaces, []);
```

只需要浏览目录的插件仅声明 `browsingWorkspace`。只需要候选目录的 Coding/创作台仅声明 `workspaces`。路径读取能力不等于文件读写授权；文件与 Git 操作仍经过各自 Host 能力并重新核对关联。项目说明不是此协议的一项。

## 数据、迁移和刷新

目录事实唯一来源仍是 catalog 的 `workspaces / workspace_project_memberships`，不复制目录到设置存储。Local Host 的项目数据库 `project_browsing_settings` 只保存 board 与所选 workspace ID；第一次读取时迁移旧 Workspace 插件的 `selected-workspace`。旧值仅在当前关联且可用时生效。无关联返回 null，只有一个关联且无历史选择时自动使用该目录，多目录未选择时返回 null。关联被移除或目录不可用后返回 null，用户重新选择。

受保护的项目 Web 页面使用 `/projects/<id>/api/project-settings/workspaces` GET 读取列表与选择、POST `{ workspace_id }` 切换；关联及目录选择器复用既有 `/api/workspaces`、`/api/workspaces/pick`。这些是可信 Host UI 路由，不是给插件绕过 Manifest 的 SDK。插件用 typed capability。读接口不提供写设置能力。

Workspace 不再进入产品 catalog 或启动图，也没有 navigator view。Files/Git 从设置读取；Workspace Artifact 连线不再控制它们。旧安装数据和历史 Artifact 保留以便迁移，不再更新。旧 `projects.workspaces.list.v1 / projects.workspace.read.v1` 为已有调用方保留兼容；后者仍是执行目录默认值语义，不等于浏览选择。新消费者使用设置能力。

Files/Git 每次读取检查当前浏览目录，异步读取后再次核对；Host 在伴随插件请求前同步 Files 的设置状态，使旧目录的当前快照输出失效，历史固定版本保留。工作面打开或点击刷新后重新读取当前选择。

## 设置归属清单

| 内容 | 归属与入口 | 本次处理 |
| --- | --- | --- |
| 项目名称、项目维护、本地数据位置 | 项目设置 → 常规 | 保留；名称属于项目记录 |
| 已关联目录、Files/Git 浏览选择 | 项目设置 → 工作目录 | 从 Workspace 迁入，消除重复选择入口 |
| 背景、共同要求、约束、协作方式、质量标准 | 项目设置 → 项目说明；Goals guidance | 保留原有长期说明契约，不纳入设置读取协议 |
| Goals 工作规则、项目规划方法 | 原有 `/settings/rules`、`/settings/planning` 页面及 Goals 管理路径 | 保留业务 owner 和原有入口，不因“设置”改成通用 KV |
| 外观、模型、Runtime、MCP、Connector、诊断 | 全局设置 | 属于本机/用户，继续共用；不复制到每个项目 |
| 插件专有长期偏好 | 插件 `settings` contribution / `storage:private` | 设置槽是呈现位置，私有存储不是跨插件配置接口 |
| Coding 执行目录、模型、材料、运行配置 | 会话 | 保留会话独立配置；候选目录改读项目设置 |
| Files 阅读位置、Git 当前差异、固定内容 | 插件私有状态 / Artifact | 不属于项目设置，继续由插件管理 |
| 插件启用、安装、权限、连接凭据 | 项目 catalog / Plugin Runtime / Connector owner | 保留管理契约，不暴露给全部插件 |

新增设置先明确范围（项目/个人/会话）、唯一 owner、读者和写入入口；有实际跨插件需求时添加具名、定型、单独授权的 capability。不要把所有页面字段自动变成可读项目设置。

验证入口：`tests/current-project-settings.test.ts`（权限、隔离、迁移），`tests/files-product-http.test.ts`、`tests/git-product-http.test.ts`（实际消费与恢复），`tests/project-workspaces-settings.e2e.test.ts`（真实设置操作）。
