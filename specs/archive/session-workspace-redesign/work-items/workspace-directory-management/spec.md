# 项目内工作目录关联管理

## 背景与目标

项目工作台已经把「工作目录」放在选定 Project 内，与 Goals、Sessions 平级，并能从真实 Session Registry 汇总路径和 Session 数量。但现有页面仍停留在高保真切片：路径修复、解除项目关系和从目录启动 Session 只更新页面或显示提示，没有写入真实事实源。

Molis Work 中本 Goal 的早期 Contract 仍写着“全局与项目内工作目录目录”。用户后续已经明确纠正为：Sessions 和工作目录只出现在选定 Project 内，与 Goals 平级；全局只负责选择 Project。本 Work Item 以最新用户决定为准，不实现第二套全局管理页，也不引入持久默认。

目标是把项目内工作目录从可交互原型升级为功能可用：用户可以看清路径健康、相关 Sessions 和项目关系，在逐次确认后添加目录、修复记录、解除当前项目关系，并从健康目录创建新的 Runtime Session。

## 范围

### 包含

- 以 Project Catalog 的 `workspaces` 与 `workspace_project_memberships` 作为工作目录和项目关系的事实源。
- 合并当前 Project 下 Session Registry 已记录的工作目录，避免历史 Session 路径从页面消失。
- 项目内按名称、规范化路径、Runtime、健康状态和 Session 使用情况搜索、筛选、排序。
- 显式添加一个绝对路径并关联当前 Project；软链接解析到同一 canonical identity，不产生重复记录。
- 修复缺失路径或冲突记录，只更新 Molis Work 的目录身份、项目关系和目标 Session 的 workspace 关系，不移动、创建或删除真实文件。
- 解除当前 Project 与目录的关系；保留其他 Project 的关系、Session 历史和真实文件夹。
- 从健康目录选择 Runtime、可选当前 Goal和标题，逐次确认后创建新的 Session；能力不足时走现有 Runtime Adapter fallback，并明确返回真实结果。
- 全局 `/workspaces` 返回项目选择；项目兼容路由进入同一个项目工作台。

### 不包含

- 全局工作目录管理页或第二套工作台壳层。
- 项目默认工作目录、工作目录默认项目或其他持久默认。
- 根据 cwd、最近使用或现有关系静默创建 Project/Session 关联。
- 删除、移动、创建、复制或扫描真实文件夹。
- 批量操作。
- Handoff；它属于独立 Goal。

## 用户流程

1. 用户在项目根目录进入「工作目录」，看到与当前 Project 明确关联的目录，以及当前 Project 的 Sessions 已记录但尚未进入 Catalog 的路径。
2. 用户通过一个紧凑工具栏搜索、筛选健康状态并排序；选择记录后右侧打开连续详情工作面。
3. 健康目录显示规范化路径、已知 Sessions、使用 Runtime 和项目关系；缺失或冲突记录明确禁止启动。
4. 用户可以添加目录。表单展示原始路径、规范化后的身份影响和当前 Project；勾选确认后才写入。
5. 用户可以修复目录记录。表单展示旧路径、新绝对路径、受影响 Session 数和“不会操作文件系统”；确认后以一个可补偿操作更新两个事实源，Session Registry 写入失败时自动恢复 Catalog 关系。
6. 用户可以解除当前 Project 关系。确认面说明记录将从当前目录消失，但其他项目、Session 和真实文件夹不受影响。
7. 用户可以从健康目录启动新 Session。表单展示工作目录、Runtime、当前 Project、可选 Goal 与标题；确认后调用现有 SessionDirectoryService，并在成功后进入新 Session 详情。

## 模块与调用链

### `src/projects/catalog.ts`

- 新增项目内可用的工作目录读取模型，返回 canonical path、显示名、realpath 验证、项目关系和更新时间。
- 新增确认后的添加关系、修复路径和解除关系操作。
- 路径先通过现有 workspace normalization 生成稳定 identity；软链接与真实路径归一为同一记录。
- 修复路径在 Catalog 事务中合并或更新 workspace 及 membership；不触碰文件系统。
- `setWorkspaceDefault` 与旧 Web/MCP 默认入口保留兼容错误但不再写入；解析链忽略历史默认，新关系始终 `is_default = false`。

### `src/sessions/registry.ts`

- 新增按旧 workspace identity/path 批量改写目标 Session 工作目录关系的原子操作，仅用于用户确认的路径修复。
- 只更新匹配记录，不改变 Project、Goal、Runtime 身份和内容。

### `src/web/server.ts`

- 项目工作台数据由 Project Catalog 目录记录与当前项目 Session 路径合并。
- 新增项目内工作目录 API：添加、修复、解除项目关系、从目录创建 Session。
- 所有写入要求 `user_confirmed=true`，校验当前 Project、绝对路径、Goal 归属和目录健康状态。
- API 不接受默认关系，不删除文件系统内容。

### `src/web/workspace-project-actions.ts`

- 协调 Catalog 与 Session Registry 的路径修复和解除关系。
- 若第二事实源失败，恢复第一事实源的原关系；若自动恢复本身失败，返回明确的人工恢复错误，不把部分成功伪装成成功。

### `src/web/project-session-workspaces.ts`

- 保留已经验收的 Goal-like 目录—详情层级和现有视觉语言。
- Sessions 与工作目录的列表 Item 直接复用 Goal / Feed 的统一目录行语法：透明静止态、无描边的悬停态、同一选中面与焦点反馈，以及只有一层的状态标签；不得退化为独立卡片或双层状态框。
- 将工作目录的添加、筛选排序、修复、解除关系和启动流程接入真实 API。
- 详情使用真实已知 Sessions，不再使用固定演示内容；真实记录不再显示“可交互原型”。
- Handoff 在独立 Goal 真正接通前不显示占位主动作。
- 桌面和窄屏共享同一 DOM；触控动作至少 44px，无横向溢出。

## 输入、输出与边界

- 输入：当前 `project_id`、绝对工作目录路径、目标 workspace identity、可选 Runtime/Goal/Session 标题和用户确认。
- 输出：规范化的 Project 工作目录记录，或新创建的 Molis Work Session。
- 一个目录可关联多个 Project；本页面的解除动作只删除当前 Project membership。
- 目录 identity 来自规范化 canonical path，不来自 Session ID、cwd 文本或显示名称。
- 缺失路径可以保留记录和修复，但不能启动 Session。
- 路径冲突必须先通过修复或合并解决，不能静默选择一条。
- 所有可见 Session 关系来自 Session Registry；相同目录不合并 Session 身份。

## 验收标准

1. `tests/workspace-project-actions.test.ts` 证明添加、解除、路径修复和启动 Session 都要求确认，只影响当前 Project/目标目录，不创建默认，不删除文件；Catalog 与历史 Session identity 冲突会在启动前阻止操作。
2. `tests/workspace-directory.test.ts` 证明项目视角和统一事实源一致；绝对路径、软链接、monorepo、移动、缺失和重复路径得到稳定身份或明确状态。
3. 现有 `tests/session-project-binding-router.test.ts` 继续证明 workspace 只提供候选，不静默绑定新外部 Session。
4. `tests/workspace-directory.test.ts` 证明第二事实源失败时，路径修复和解除会恢复原 Catalog 关系。
5. 项目页面真实工作目录动作成功后刷新仍一致；失败时保留输入并显示可行动错误。
6. 目录中 Goals、Sessions、工作目录保持平级，没有全局管理页、switch、第二侧栏、错误箭头、链接下划线或新增容器体系。
7. 桌面、用户当前宽度和窄屏完成浏览器 QA；Session / 工作目录列表与 Goal / Feed 使用同一目录行层级，列表、详情和对话框均无横向溢出，键盘焦点与确认门禁可用。

## 验证命令

```bash
node --import tsx --test \
  tests/workspace-project-actions.test.ts \
  tests/workspace-directory.test.ts \
  tests/session-project-binding-router.test.ts \
  tests/session-project-actions.test.ts \
  tests/session-directory.test.ts \
  tests/session-web.test.ts
pnpm typecheck
pnpm build
git diff --check
```

## 假设与开放项

- 本次达到完成等级 3「功能可用」，不覆盖安装发布。
- 旧 Contract 的全局目录条款与最新用户决定冲突；实现后提交 Molis Work Candidate/Proposal 纠正，未确认前不伪报旧 Goal 完成。
- 如果真实 Runtime `create` 不可用，现有 Adapter 可创建 Molis Work 托管 Session，但界面必须如实显示能力来源。
