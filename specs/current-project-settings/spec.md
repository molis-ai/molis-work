# 当前项目设置与工作目录

目标为内部完整：项目设置能查看、关联目录和切换 Files/Git 浏览目录；Workspace 不再是独立导航插件。目录关联继续唯一存于 catalog 的 workspaces / workspace_project_memberships，已有数据无需重新关联。

新增两个无参数、按当前 Host runtime 限定的 typed query capability：projectSettingsCapabilities.workspaces（关联列表）与 projectSettingsCapabilities.browsingWorkspace（当前浏览目录）。Manifest consumes 逐项声明，沿用 runtime 的授权拦截，禁止任意键值读取和调用方项目编号。输出只包含 ProjectWorkspaceRef，不泄漏 catalog 的 project_ids 等字段。旧 projects workspace 查询保留兼容，但同样裁剪输出。

浏览偏好由宿主管理，项目数据库只存目录 ID，不复制目录。首次使用迁移 Workspace 插件 selected-workspace；有效关联且可用才返回，单目录沿用自动选中，多目录无选择返回 null。设置写入通过已有受保护的项目 Web 路由；插件无写能力。Files/Git 读该设置并在异步读取后复查选择；Files 切换使旧输出失效。Coding 与插件创作台仅迁移候选列表查询，不跟随浏览选择。

范围：contracts、Projects/Host 的偏好持久化与迁移、插件 Manifest/消费路由、工作台设置与导航、开发指南及必要 README。整理当前设置归属并移除重复的浏览目录选择 UI；不合并 Goals guidance，不迁移全局模型/工具、运行中会话配置或插件私有 UI 偏好。

验收：真实设置页面查看、关联、切换；重开恢复；无 Workspace 导航；未声明失败、分项权限和跨项目隔离；Files/Git 随选择变化；Coding 会话选择独立；旧关联及旧浏览偏好可用。验证用定向 node:test、项目 build/typecheck、边界检查和浏览器实操。新增测试须覆盖真实生产路由和授权路径。

已有工作树改动（diff/plugin-builder manifest 及其测试）保留。GoalBoard MCP reader 版本过旧，无法记录本任务，不绕过 catalog；本需求书作为执行记录。


## 完成与验证（2026-09-23）

完成程度：内部完整，工程与自动化真实场景实操通过；未进行一骏本人验收，未将代码安装或发布到外部环境。

| 要求 | 当前证据 |
| --- | --- |
| 两项具名设置、按 Manifest 授权、当前项目隔离 | `tests/current-project-settings.test.ts` 用真实 Host 与 PluginCapabilityClient：未声明、只声明其中一项、跨项目返回、额外项目参数拒绝、catalog 字段裁剪、Host 未开放均通过 |
| 关联目录保持唯一事实源 | Host 从原 catalog.listWorkspaceDirectory 读取；设置表仅 board_id + workspace_id。实际 HTTP 与浏览器关联均复用 `/api/workspaces` |
| 旧浏览选择与重启 | migration 测试使用旧 plugin_runtime_installs / plugin_private_values，验证一次迁移、不覆盖新选择、撤销关联后不可用；Files/Git HTTP 测试验证完整服务重启 |
| 项目设置查看、关联、切换 | `tests/project-workspaces-settings.e2e.test.ts` 在真实 Chrome 中打开齿轮 → 工作目录，关联两个本机文件夹，切换浏览选择，直接页与嵌入页共用行为；网络阻断后保留输入且恢复重试 |
| Workspace 不再独立出现 | 产品 catalog、Host start 图、伴随工作面均移除；Manifest 无 navigator。浏览器断言侧栏无 Workspace，真实图测试无此运行节点 |
| Files/Git 行为保持 | `files-product-http` 与 `git-product-http`：边界读取、差异、固定快照、授权撤销、重启恢复；真实浏览器读取 beta.txt 内容并在 Git 查看同一目录 |
| Coding 独立选择、共同候选 | 浏览器创建会话并保存 alpha 执行目录，浏览改成 beta 后会话仍为 alpha，候选仍含两个目录；Coding 材料/规划/角色/写入目录回归通过 |
| 文档及已有设置规整 | `docs/platform/PROJECT-SETTINGS.md` 定义协议、迁移、设置归属表；同步开发指南、molis-plugin-dev Skill、Projects 文档、应用及插件 README、DESIGN。全局设置、Goals 说明、会话配置及插件私有状态保持各自 owner |

运行成功：

- `pnpm build`（完整 workspace 与根构建）；最新设置英文文案另运行 Workbench build。
- `pnpm exec tsc --noEmit -p tsconfig.json`、`pnpm exec tsc --noEmit -p tsconfig.sdk.json`。
- `pnpm boundary:check`、`node scripts/workspace-packages.mjs`、`git diff --check`。
- `node --import tsx --test --test-concurrency=1` 定向运行 current-project-settings、files-product-http、git-product-http、coding-companion-http、coding-companion-inputs、workspace-plugin-graph 与 project-workspaces-settings.e2e。
- Coding 的 materials/plans/characters/writer-assignments、Shelf 材料、插件创作台 workflow、Files/Git/Workspace 单元与 project-settings-stage 回归通过。
- project-settings-navigation.e2e 与 project-settings-standalone.e2e 通过，覆盖改名、删除重试、说明版本、既有规则/规划页面与工作台状态恢复。旧导航断言改为当前实际分类；结构断言剔除 script 文本以检查渲染元素。

已人工查看自动化截图：`/tmp/molis-project-settings-desktop.png`（1440×1000）和 `/tmp/molis-project-settings-mobile.png`（390×844）；窄屏无横向溢出。测试均使用隔离数据，不改用户实际目录关联。

无需求剩余项。GoalBoard MCP 的 catalog reader 版本仍不兼容，因此未同步外部 GoalBoard 记录；没有绕过连接去写数据库。
