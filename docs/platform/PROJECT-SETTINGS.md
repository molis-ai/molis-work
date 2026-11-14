# 当前项目设置

项目设置管理当前项目共用的配置。项目的文件夹分两种角色：**输入**（界面上叫「参考」）只读，可以有多个；**输出**只有一个，是 Agent、Coding、Git 和终端读写、运行的地方。没选过输出的项目，输出就是它的默认输出目录 `<Home>/outputs/<项目>`，第一次在里面写或运行时才建。目录在「项目设置 → 输入与输出」里查看和改；平台资料服务与 Git 不指定目录时看输出目录。页面在几个目录里看哪一个，是页面自己的状态，项目不记「浏览目录」，所以也没有浏览选择、没有「首选工作区」。

## 插件读取

Contract：`@molis-ai/molis-work-contracts/modules/projects` 的 `projectDirectoryActions`（项目的输入与输出）和 `projectSettingsCapabilities`（项目的 Agent 运行时）。

| 设置项 | Capability ID | 返回 |
| --- | --- | --- |
| 项目的输入与输出 | `projects.directories.get` | `ProjectDirectories`：`directories`（每项是 `ProjectWorkspaceRef` 加 `roles` 与 `state`）、`source_links`、`revision` |
| 项目的 Agent 运行时 | `projects.settings.runtime.read` | `string \| null`（运行时标识，`null` 是 Home 默认） |

`directories` 里每个文件夹只出现一次：既是输入又是输出时 `roles` 是 `["input", "output"]`；恰好一项带 `output`，没有本机输入的项目也有（默认输出目录）。`state` 是 `ok` 或 `missing`（路径核实不了）；默认输出目录文件夹还没建时是 `ok`，列出来是空的。`source_links` 只有 id，没有路径：另一台设备上的目录在这台设备上对应哪个文件夹，只存在本机、不同步。`revision` 是读到的版本，改目录时作 `expected_revision`。

读取的动作写入 Manifest `capabilities.consumes`。`projects.directories.get` 的输入是空对象，运行时读取的输入是 `[]`：`context.services.actions.invoke(定义, 输入, control)`，事先可用 `context.services.actions.availability(定义)` 只读检查。未声明的项在 Plugin Runtime 拒绝；Host 未装配的项返回不可用。不存在全量设置读取、通配授权或任意 key 查询。调用不接受项目编号；Host 根据当前 runtime 的项目返回，不返回其他项目的目录。

```ts
import { projectDirectoryActions } from '@molis-ai/molis-work-contracts/modules/projects';
// Manifest 中：
capabilities: { provides: [], consumes: [projectDirectoryActions.get.capability_id] }
// start(context) 或 route handler 中：
const { directories } = await context.services!.actions!.invoke(projectDirectoryActions.get, {});
const output = directories.find(item => item.roles.includes('output'));
```

读目录不等于文件读写授权：读文件、Git 和运行都仍经各自的 Host 动作，并在碰磁盘前重新按项目查目录和角色。**输入目录谁都只能读**：Git 的写、终端、Agent 的会话和轮次、原生 Character、本机进程的 MCP 在只作输入的目录里开会被拒（`projects.directory_input_only`），本人把它设为输出之后再开；Skill 照样能读输入目录。不指定目录的读写和运行都落在输出目录；插件的 Agent（`services.agents.run`）没传 `workspace_id` 时同样在输出目录里跑。Coding 并行写手的独立工作树由宿主建、按 `worktree_id` 认，不是项目的目录。项目说明不是此协议的一项。

资料的最近使用和出处与目录同属一个提供方（`system.project-workspaces`）：`materials.recent@1`、`materials.recent.record@1`、`materials.origins@1`，合同在 `platform/project-materials`，规则见 `specs/shared-sources-and-surfaces/spec.md` §2。

## 改目录

改目录是本人在项目设置里做的事，只给 `user`，权限 `projects:settings`，每个都带读到的 `expected_revision`（版本已被别的改动推进就以 `actions.conflict` 拒绝，重读再改）；插件、Agent 与 MCP 调不到。

| 动作 | 做什么 |
| --- | --- |
| `projects.directories.add_input` | 把本机一个文件夹加为输入；路径核实不了时拒绝 |
| `projects.directories.remove_input` | 让一个文件夹不再是输入；磁盘上的文件不动 |
| `projects.directories.set_output` | 设或改输出：给 `workspace_id`（项目已有的目录）、`workspace_path`（本机路径）或 `default_output: true`（设回默认位置）三选一；旧文件不搬、不删、不覆盖 |
| `projects.directories.repair` | 文件夹换了位置后重新找到它，只在它失效时允许；目录的身份不变 |
| `projects.directories.map_source` / `unmap_source` | 把另一台设备的一个目录对应到本机的文件夹，或取消对应 |

页面里的插件要关联目录或换输出，用 `host.workspaces.add(path)`（加为输入）、`host.workspaces.setOutput(id)`（把项目已有的目录设为输出），由宿主显示并真实确认，见 `docs/platform/UI-PLATFORM.md`。

## 项目的 Agent 运行时

项目的新会话、方法与 MCP 服务跑在哪个运行时：人在「项目设置 → 常规」里选（`projects.settings.runtime.select`，只有本机用户、`projects:settings`），没选就是平台运行时目录的 Home 默认（`defaultAgentRuntime`：目录顺序里第一个能开会话的）。读取与解析只有一处写法：`resolveProjectRuntime(目录, 读到的选择)`（`contracts/services/agent-host`）。选定的运行时不在目录里、或开不了会话时，新会话与项目的方法、MCP 设置被拒绝，错误说出运行时的名字并指向项目设置，不悄悄换成别的运行时；Characters 的动作目录同样为空。已建的会话仍跑在建它时的运行时上。设置页的选择器只在有一个以上运行时、或已选的运行时不可用时出现，后一种情形里可以改选或恢复默认。读取需要在 Manifest `capabilities.consumes` 里声明；没有任何插件能改这个选择。存储见 `docs/system/HOME-DATA.md`。

## 数据和刷新

目录事实唯一来源是 catalog（`projects/catalog.db`）的 `workspaces`、`workspace_project_memberships`（`role_input`、`role_output` 两列表示角色）和 `workspace_source_links`，不复制目录到设置存储。项目库里没有浏览选择：旧的 `project_browsing_settings` 随项目库升到第 2 版删掉，换成每个调用方的「最近用过」`material_recent_uses`。默认输出目录是 `workspaces` 里真实的一行，建项目时写入，`canonical_path` 记为 `project-output:<project_id>`、不存路径，路径由 Home 与项目编号推导；文件夹在第一次写或运行时才建，建好前 Git 的读取返回空、暂存和提交答「还没有建立，不是 Git 仓库」，平台资料服务列出空目录。

受保护的项目 Web 页面使用 `/projects/<id>/api/project-settings/directories`：GET 读目录（即 `projects.directories.get`），POST `{ change, input }` 做一项改动，`change` 是上表六个动作名去掉前缀后的一个（`add_input`、`remove_input`、`set_output`、`repair`、`map_source`、`unmap_source`），`input` 由对应动作自己的 schema 检查；系统选文件夹的窗口走 `POST /api/workspaces/pick`。这些是可信 Host UI 路由（`apps/local-host/src/project-workspace-http.ts`），不是给插件绕过 Manifest 的 SDK。插件经 `services.actions` 调具名动作。读接口不提供写设置能力。

Workspace 不再进入产品 catalog 或启动图，也没有 navigator view。旧安装数据和历史 Artifact 保留但不再更新，也不迁移。旧的 `projects.workspaces.*`、`projects.workspace.read`、`projects.settings.workspaces.read` 与 `projects.settings.browsing-workspace.*` 都已删除，不留兼容（`docs/system/CONTRACT-CHANGES.md` §8）；新消费者读 `projects.directories.get`。

平台资料服务与 Git 每次读取，先按页面说的目录（没说就是输出目录）向 `projects.directories.get` 核对，异步读取后再核对一次；目录已不属于项目时拒绝，资料服务同时撤回它从原目录交出去的快照（历史固定版本保留）。工作面打开或点击刷新后重新读取。

## 设置归属清单

| 内容 | 归属与入口 | 本次处理 |
| --- | --- | --- |
| 项目名称、项目维护、本地数据位置 | 项目设置 → 常规 | 保留；名称属于项目记录 |
| 输入目录、输出目录 | 项目设置 → 输入与输出 | 目录分输入与输出两种角色；页面看哪个目录不记在项目里 |
| 背景、共同要求、约束、协作方式、质量标准 | 项目设置 → 项目说明；Goals guidance | 保留原有长期说明契约，不纳入设置读取协议 |
| Goals 工作规则、项目规划方法 | 原有 `/settings/rules`、`/settings/planning` 页面及 Goals 管理路径 | 保留业务 owner 和原有入口，不因“设置”改成通用 KV |
| 外观、模型、Runtime、MCP、Connector、诊断 | 全局设置 | 属于本机/用户，继续共用；不复制到每个项目 |
| 插件专有长期偏好 | 插件 `settings` contribution / `storage:private` | 设置槽是呈现位置，私有存储不是跨插件配置接口 |
| Coding 的执行位置、模型、材料、运行配置 | 会话 | 一轮在输出目录里跑，或在宿主为这个会话建的独立工作树里跑（开轮时冻结）；目录候选读项目的 `projects.directories.get` |
| 资料阅读位置、Git 当前差异、固定内容 | 平台资料服务的私有值 / 插件私有状态 / Artifact | 不属于项目设置，由各自的主人管理 |
| 插件启用、安装、权限、连接凭据 | 项目 catalog / Plugin Runtime / Connector owner | 保留管理契约，不暴露给全部插件 |

新增设置先明确范围（项目/个人/会话）、唯一 owner、读者和写入入口；有实际跨插件需求时添加具名、定型、单独授权的 capability。不要把所有页面字段自动变成可读项目设置。

验证入口：`tests/current-project-settings.test.ts`（权限、隔离、没有浏览选择），`tests/project-directories.test.ts`（目录动作、角色、输入只读、默认输出），`tests/default-output-first-use.test.ts`（默认输出目录第一次用到才建），`tests/system-materials-actions.test.ts`、`tests/side-materials-reader.e2e.test.ts`、`tests/git-product-http.test.ts`（实际消费与恢复），`tests/project-workspaces-settings.e2e.test.ts`、`tests/project-settings-navigation.e2e.test.ts`（真实设置操作）。
