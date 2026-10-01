# Web 产品界面与页面组合

组合目标、信息流、会话、设置和首次使用页面，让各 Native Plugin 的功能在同一个工作区中呈现。

包名：`@molis-ai/molis-work-app-workbench`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Local Host 提供页面模型和操作端口；Workbench renderer 组合公共样式、导航与 Plugin UI，浏览器脚本处理选择、滚动恢复、刷新和请求。终端资产入口委托 Work Plugin 的 terminal-client。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/ui-composition.ts](src/ui-composition.ts) | UI 组合 |
| [src/goals-page-renderer.ts](src/goals-page-renderer.ts) | 目标页面装配 |
| [src/scripts/client/initialization.ts](src/scripts/client/initialization.ts) | 客户端初始化与恢复 |
| [src/browser-assets.ts](src/browser-assets.ts) | 浏览器资产入口 |

可对照现有调用方 [apps/local-host/src/workbench-renderer.ts](../local-host/src/workbench-renderer.ts) 阅读装配方式。

## 接入与边界

页面型插件可通过公共子路径 `@molis-ai/molis-work-app-workbench/plugin-pages` 的 `renderPluginPageWorkspace` 组合声明视图与宿主 UiHost。调用者负责受信身份、活动安装及权限、数据模型、请求路由和字体静态资源；本函数不注册内置插件、不打开数据库，也不使未安装插件自动出现在日用导航。`development: true` 用于明确标注隔离身份与数据的开发预览，不能作为真实团队接通证明。对应回归为 `tests/plugin-page-workspace.test.ts`。

本包处理页面结构和交互装配，不打开数据库。目标状态解释、关系/规划等专属界面由 Goals Plugin 提供；通用主题和图标由 Design System 提供。

本包的装配依赖见 [package.json](package.json)；包之间的允许方向由仓库边界检查约束。

## 本地开发

改共享控件或列表交互时，建议对照 `/__ui/catalog`（见 [CLI 与开发 · 前端与控件板](../../docs/cli-and-development.md#前端与控件板)），达标标本补进 Design System Catalog。

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
pnpm --filter @molis-ai/molis-work-app-workbench build
```

已有行为示例与回归：[workbench-ui-platform.test.ts](../../tests/workbench-ui-platform.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/workbench-ui-platform.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：工作台界面的组合根：导航、插件选择、设置页、首次使用与 Functions 编辑器。
- 不负责：业务 Store、Node 专用实现、Tauri 命令。
- 公开入口：`@molis-ai/molis-work-app-workbench`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/app-host`。
- 依赖：组合根：按 `package.json` 装配已登记的包，只做装配与 IO，不写业务规则。方向见[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节。
- 不变量：
  - 导航与区域从 Manifest 派生（`BUILTIN_PLUGIN_CATALOG`），不按插件名写分支。
  - 内置 build 只在 `builtin-plugins.ts` 绑定一次 Manifest、目录信息、Agent 正文、UI/静态资源及可选历史 MCP 适配器；`plugin-catalog.ts` 和 `plugin-workbench.ts` 派生相应投影。资源 order 保持 CSS 与客户端初始化顺序，不改变 Manifest 的导航 order。公共动作发现与授权仍归 Kernel/Host。
  - 插件的 Agent 提示词与方法正文随目录条目的 `agent` 声明，Manifest 只写声明。
  - 界面文字走 i18n，新增中文文案同时补英文；控件只用 design-system，不引入系统弹窗或原生下拉。
  - `development: true` 只标明隔离预览，不能当作真实团队接通的证明。
  - 浏览器端程序由 `src/scripts/client/*` 字符串片段拼成，类型检查看不到里面：改动后跑 `tests/client-script-undeclared.test.ts`，它检查拼接结果里没有未声明的名称（页面全局在测试里列白名单）。
- 改动后必跑：`node scripts/run-tests.mjs tests/plugin-declarative-mounting.test.ts tests/builtin-plugin-agent-texts.test.ts tests/builtin-manifests-contract.test.ts tests/builtin-plugin-composition.test.ts tests/workbench-ui-platform.test.ts tests/i18n.test.ts tests/client-script-undeclared.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/workbench-tab-workspace.e2e.test.ts`
- 相关手册：[DESIGN.md](../../DESIGN.md)、[specs/craft-finish/spec.md](../../specs/craft-finish/spec.md)、[docs/platform/UI-PLATFORM.md](../../docs/platform/UI-PLATFORM.md)、[skills/molis-plugin-dev/ui.md](../../skills/molis-plugin-dev/ui.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

独立插件资源每项最多等待 10 秒，失败或挂起超时解除界面等待并提供原资源重试入口；重试不重派业务动作。Host 关闭释放等待中的资源与定时器，旧请求迟到不重复挂载；已打开界面和最近选择沿用原实例。

## 进一步阅读

- [职责与接入说明](../../docs/platform/UI-PLATFORM.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd4`, `goal-reorg-ap3`, `goal-reorg-gw4`, `goal-reorg-gw5`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

当前项目的目录关联与 Files/Git 浏览选择由项目设置的「工作目录」页统一维护，Workspace 不再作为导航插件。页面与嵌入工作台共用 `project-settings-pages.ts` / `scripts/project-settings.ts`；协议和设置归属见 [PROJECT-SETTINGS.md](../../docs/platform/PROJECT-SETTINGS.md)。

工作台从现有内置目录派生独立客户端资源，首次打开时装入惯有 surface DOM 并准备 `clientAssets` 后挂载。原 surface 根节点和已挂载实例持续保留；隐藏时使用原 UI Host 生命周期暂停读取。Pages 编辑器由 Pages 的登记声明依赖，Coding 与伴随视图的原装配由相同目录登记。失败保留内容并提供仅重载 UI 资源的按钮，不自动重试业务动作。分屏省略其他独立客户端 surface 的正文，通用 Goals/Feed/Inbox 与设置绑定保留；CSS 为保持现有全局层叠仍由 shell 按原顺序提供。回归见 `tests/workbench-deferred-clients.e2e.test.ts`、`tests/workbench-hidden-refresh.e2e.test.ts`。
