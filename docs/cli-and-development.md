# CLI 与开发

## 安装代码的开发边界

`pnpm build` 先清理各 workspace 包的生成目录，再根据声明的依赖顺序构建全部 71 个 workspace 包，最后生成根入口和 PTY bundle。`build:migrated-packages` 复用同一个 `workspace:build`，因此删除/移动源码后不会把旧 JS 带进 npm/DMG。只清生成目录，不清 node_modules 或用户数据。Plugin CLI 的稳定 bin 启动文件随源码存在，干净 `pnpm install --frozen-lockfile` 后构建即可使用 `pnpm exec molis-work-plugin --help`。包边界扫描覆盖 src、tooling 和 bin 中的 JavaScript/TypeScript 调用。

Desktop 发布脚本归 `apps/desktop/tooling/`，根 `pnpm desktop:*` 命令不变。它调用 Local Host 的 `createMolisWorkRuntimePayload` 生成自包含目录，不在孤立资源目录对 workspace:* manifest 再执行 npm install。失败不覆盖已有资源，vendor 来源、SBOM、许可证随 payload 和 Home 安装保留。

Home 安装、Runtime 接入、常驻 Web 服务和卸载的实现统一在 `apps/local-host/src/installer/`，调用者通过 `@molis-ai/molis-work-app-local-host` 公开入口使用；旧 `src/install/` 已删除。不要在 CLI/Web 中复制预览、确认、所有权、回滚和清理规则。

`installMolisWorkHome` 必须接收明确的 `sourceDirectory`；只有产品根 CLI 根据自己的入口位置补默认值，因此从其他工作目录执行、不传 `--source` 仍安装同一个产品。卸载器必须注入 `UninstallProjectAccess`，`apps/local-host/src/local-uninstall.ts` 负责只读连接与现有 Demo 删除装配；Projects 的公开检查负责 catalog facts，预览不迁移数据库。

修改 workspace 源码后必须重新构建。`pnpm build` 最后通过 `apps/local-host/tooling/write-build-manifest.mjs` 调用 Local Host 的构建记录生成函数，覆盖根源码、workspace 包源码/配置和构建脚本；不要单独生成记录掩盖旧构建。新建 workspace 层级时同步 installer fingerprint 的包发现范围与构建列表。定向回归包括 `tests/install.test.ts`、`tests/service.test.ts`、`tests/uninstall.test.ts`、`tests/uninstall-catalog.test.ts`，真实 Web/Desktop 调用由对应集成测试覆盖。DV4 完整发布验收尚未完成，不能把这些回归当成可发布证明。

## 当前Goal、父目标与依赖

当前工作由事件状态表示，公开读取使用 `goals.state.read`。父目标按自己的当前约定、报告、要求和适用阻塞判断完成，子目标数量不构成完成证明。未完成依赖影响正式完成，但不禁止记录普通笔记或部分结果。

结构影响与图合法性由 Goals Module 的规划图计算，当前候选读取事件work_status，不读取旧叶子分类。关系变化通过当前有限Goal Tree提案及受保护用户决定处理；不再生成clarifier Claim、Draft Dialogue或旧动作token。回归见 `tests/goal-tree-event-flow.test.ts`、`tests/goal-events-state.test.ts` 和 `tests/planning-engine.test.ts`。

## CLI

公开 CLI 顶层提供本体安装、常驻服务、demo、安全卸载，以及 `molis-work v1 <operation>` 管理接口：

```text
init | snapshot | active-goal
goal-tree-propose | goal-tree-read | goal-tree-check | goal-tree-decide
```

复杂输入可以通过 `--json` 或 `--file payload.json` 传入。旧create-goal、Claim/Run、Evidence/Review和Contract/Candidate/Rewire等命令已退役，旧名字会报未知操作。日常笔记、报告、约定、收尾与继续使用MCP或Web，CLI没有同义事件写命令。CLI是用户/管理和本地调试入口，不是Runtime的服务故障回退。`init` 与 `goal-tree-decide` 以本机这个人的身份写入，参数里不带身份；`goal-tree-propose`、`goal-tree-check` 与 `active-goal` 目前仍从参数 `actor_id` 取作者（`goal-tree-propose` 还从参数取 `submitted_session_id`），不是宿主注入的身份（已知差距）。

## 项目结构

> 仓库是插件基座加多插件的 Monorepo：71 个 workspace 包里 70 个 `partial`、1 个 `contract-only`（contracts）；根包只装配产品启动器，不导出代码。真实状态和 owner 见 [架构 SSOT 索引](SSOT-MATRIX.md)。

```text
apps/                        6 个产品入口与 composition root 边界
packages/                    10 个 Foundation package（另有根目录 server/）；contracts 暴露 63 个公开 subpath
modules/                     13 个业务事实 owner
horizontal/                  8 个包：5 个横向运行服务，3 个平台产品服务（记忆、放置、搜索）
plugins/                     26 个 Native Plugin 与 6 个官方 Integration Plugin
packages/plugin-runtime/     FD3 本地 Plugin 生命周期参考实现
packages/plugin-sdk/         FD3 Manifest 与 Integration Plugin 定义 API
plugins/official-integrations/
                             官方 Manifest、Provider Adapter 与安装 package
apps/workbench/              工作台外壳：底栏、插件选择、按 Manifest 派生的导航与插件页面接线
apps/desktop/                AP4 Desktop Shell、Panel、Capsule 与 Tauri native adapter
apps/cli/                    当前管理命令的解析、Host调用与输出
apps/mcp/                    平台 MCP schema、协议、项目工具分发；插件贡献由 Host 从 Manifest 合成
packages/ui-host/            UI Contribution registry、surface render 与 Slot mount 校验
packages/design-system/      AP3 主题偏好、浏览器视觉基础与分层样式
plugins/native/feed/         FD4 Feed/Attention/Source UI 和 HTTP route table
modules/goals/               当前事件、约定/要求、完成状态、图/规划、指导与历史读取
modules/governance-collaboration/
                             当前用户决定、有限结构提案、来源与历史事实
tooling/plugin-cli/          Plugin CLI 边界；真实开发工具由 DV3 实现
scripts/workspace-packages.mjs
                             71 包清单、manifest、入口、README 与 Contract 接线检查
apps/desktop/launchers/mcp/server.ts            MCP 启动入口；协议归 apps/mcp，装配归 Local Host
apps/desktop/launchers/web/server.ts            Web 启动入口；HTTP/资源装配归 Local Host，页面归 Workbench/Native Plugin
apps/desktop/               Desktop 平台与 Native adapter；旧 src/desktop 已删除
apps/local-host/src/installer/
                             安装、Runtime 接入、常驻服务与安全卸载的唯一实现
apps/local-host/tooling/     构建记录与 npm 发布包生成；调用 Local Host 公开 API
apps/desktop/tooling/        macOS 构建、Runtime payload、安装与启动脚本
apps/desktop/launchers/cli/main.ts              CLI 启动入口；命令归 apps/cli，装配归 Local Host
apps/desktop/src-tauri/      macOS App 的 Cargo/Tauri 配置；Rust 入口在 apps/desktop/adapters/tauri
examples/seed-demo.mts       调用产品 demo 生命周期的开发脚本
docs/screenshots/            README 产品截图
skills/goal-advance/         Runtime 工作协议
skills/molis-plugin-dev/     插件开发 Skill（随安装发布，不自动挂 Runtime）
tests/goal-events-state.test.ts
                             当前要求、决定、完成与继续的状态转换
tests/goal-event-imported-requirements.test.ts
                             导入的要求、原历史和批准的保留
tests/goal-tree-event-flow.test.ts
                             有限树提案、用户决定、图与事务边界
tests/command-entry-chain.test.ts
                             当前MCP/Host/CLI入口组合与持久化
tests/host-entry-consistency.test.ts
                             组合调用、并发排队与Host资源生命周期
tests/mcp.test.ts            MCP audience、权限与连接回归
tests/mcp-action-catalog.test.ts
                             对外 MCP 目录：平台工具加已授权的动作
tests/web.test.ts            Web 数据与交互回归
tests/desktop-tui.test.ts    第三栏启动、面板与本机 PTY 回归
tests/i18n.test.ts           界面语言回归
tests/uninstall.test.ts      用户数据保留、强确认与恢复收据回归
PRODUCT.md                   产品定义
DESIGN.md                    shipped UI 设计系统
docs/SSOT-MATRIX.md          架构、包状态和迁移 owner 的权威索引
docs/system/                 分层、依赖、迁移与巨大单元清单
docs/modules/                Module 的事实 owner 与 API 边界（页面尚未与 13 个 Module 一一对应：characters 暂无页面，另含 4 个未来 owner 和已退役模块的页面，以 SSOT-MATRIX 为准）
docs/horizontal/             `horizontal/` 下各服务的技术边界（Memory、Placement 见各自包 README）
docs/platform/               Plugin、Storage、Exchange 与 UI 平台机制
specs/molis-work-architecture-reorganization/spec.md
                             本次重组的完整已确认 Contract
```

### 重组期间的开发规则

- 根 `pnpm build` 先构建全部 71 个 workspace 包再编译启动器；`workspace:*` 只跑 workspace 包，`*:all` 同时跑两者。
- 新代码只能通过 public entrypoint 调用其他 owner；禁止 deep import、跨 Module Store 和 App 直写业务数据库。
- `contract-only` 只表示边界存在，不得注册假 Provider、假 Store、UI 入口或伪成功 API。
- 每个迁移切片同时更新目标 package README 和对应 Module/Service 文档。
- 巨大单元（超过阈值的文件、类、函数）的 owner、判定与计划见 [巨大单元清单与判定](system/HUGE-CLASS-MIGRATION.md)。

## 对外 MCP

对外只有 `molis-work-mcp`：连接工具，加上每个已授权的动作。写插件的顺序和要素取舍见 [molis-plugin-dev Skill](../skills/molis-plugin-dev/SKILL.md)。作者步骤见 [Plugin 开发 · 对外 MCP](platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。Runtime Skill 协议见 [MCP 接入](mcp.md)。

### 调用链

```text
molis-work-mcp
  apps/desktop/launchers/mcp/server.ts     进程入口
  apps/local-host/src/mcp-server.ts        装配、实时发现、按 catalog entry 分发
  apps/local-host/src/mcp-catalog.ts       平台工具 + 已授权且可用的动作
  apps/local-host/src/mcp-settings-store.ts  {home}/config/mcp-tools.json（只存动作授权）
  apps/local-host/src/mcp-authority.ts     list/call 同闸
  apps/local-host/src/action-gateway.ts    动作 → 常驻 Web Host
  apps/mcp                                 平台 schema、协议、连接工具、管理工具分发
```

每次 `tools/list` 和 `tools/call` 读取当前目录及授权；已连接的客户端也会看到变化，调用时再次校验。当前不主动发送 `tools/list_changed`。正式 launcher 有明确 Runtime Home 时，从同一 Home 的常驻服务取得动作；服务离线时只保留连接工具。

`tools/call` 按目录条目的 `source` 分发：

| source | 走到 |
| --- | --- |
| `action` | 同一 ActionClient；正式 stdio 通过本机通道进入常驻 Host 的注册表和执行队列。Runtime 的写入以会话身份为审计作者，成功的 Goals 写入记进会话活动 |
| `platform` 且是连接工具 | `apps/mcp` 的 runtime-context handlers |
| 其余 `platform`（管理入口） | Host 注入身份后 `dispatchMcpProjectTool` |

### 改哪里

- **新增业务能力**：由插件声明动作合同和处理器，经过 SDK/Runtime 注册到同一目录；动作的 `audiences` 含 `mcp` 就会出现在授权列表里。无需 MCP 总表、按名称的分支或单独的 MCP 登记。账号和个人成果仍须遵守实际 owner 合同。
- **授权与设置页**：精确的客户端动作授权在 `mcp-settings-store.ts`；管理入口在系统「能力 → 对外接入」。没有按工具名称的开关。

`agent.mcp` 是插件内 Agent 调外部 MCP，方向相反，不要复用。

## 前端与控件板

改工作台、插件或共享控件时，**视觉、动效、图标与色彩都是本切片的工作**，不是以后再说。编译过、测试绿、能点，都不等于做完。工艺底线见 [ui-craft-floor](../specs/ui-craft-floor/spec.md)；视觉规范见 [DESIGN.md](../DESIGN.md)（Soft Workbench）。

硬规则：

- **不准把操作系统默认控件当成产品 UI。** 禁止系统下拉菜单、系统颜色选择器、系统日期/时间弹出、`alert` / `confirm` / `prompt`、未换肤的 `range`。选择打开后必须是 `mw-menu`，原生 `<select>` 只可隐藏当表单值。文件选择可隐藏原生 input，按钮必须是 `mw-btn`。原生 `<dialog>` 只留 Escape 和焦点圈，外观走 `mw-*`。详见 [mw-select-custom-menu](../specs/archive/mw-select-custom-menu/spec.md)。
- **图标与色彩成套。** 动作图标从 Lucide 库取，色随表面（`--ink-soft`，当前 `--ink`）。插件没有身份色（`--plugin-*` 都是中性色）。石墨 `--action` 只给主操作和选中的选项；铜色 `--accent`（`--blue*` / `--focus` 的实际值）只给焦点、链接和进行中，不填按钮。状态走 status family。颜色、圆角、高度、时长只取 `palette.ts` 的 token，不写 hex，不用 `!important` 或按插件覆盖去压前面的层。不要第二套 emoji 图标。
- **动效成套，而且要做。** 只用 `--dur-*`（按压 130、状态 250、到达 420）/ `--ease-quint` / `--ease-spring` 和已有位移（分段滑块、目录 yield、底栏菜单升起、`craft-rise` 到达）。状态变了要看得出走过去或到达，不要硬切。hover 是色阶，不是浮起；按下回弹。`prefers-reduced-motion` 去掉位移。不为动而动。
- **键盘焦点**只用 `--focus-stroke`（2px 铜色、偏移 1px）；字段是铜色边框加 3px 铜色光晕。不要自己写焦点色，不要去掉焦点。旧的「内侧 1px ink」规则（[neutral-focus-stroke](../specs/archive/neutral-focus-stroke/spec.md)）已被 Soft Workbench 取代。
- **字与层次。** 系统字体栈，字重只有 400 / 500 / 600（`--weight-body` / `--weight-control` / `--weight-title`），不准全局强制字重。工作都在一张连续白色工作面上，插件不画自己的外框卡片；只有浮起的东西投影。

改共享控件、状态或微动效，先打开 `/__ui/catalog` 对照标本再动手（真实底栏在 `/__ui/catalog/bar`，组合示例在「组合」一节）。一次性草稿可以先写在业务里，**进产品主链前换成 `mw-*`，不得带着系统控件进去**。已经达到产品美学要求的共享控件、状态变体或微动效，**要**补进 `packages/design-system` 的 Catalog。产品专属编排不必做成标本。用法见 [design-system README](../packages/design-system/README.md)；平台分工见 [UI Platform](platform/UI-PLATFORM.md)。

## 开发验证

```bash
# 全部 workspace 包
pnpm workspace:check
pnpm boundary:test
pnpm boundary:check
pnpm workspace:verify
pnpm workspace:typecheck
pnpm workspace:build

# 根启动器 + 全部 workspace 包
pnpm typecheck:all
pnpm build:all

# 产品回归与发布内容
pnpm typecheck
pnpm test
pnpm package:npm
```

单独检查某个 package 时使用其正式名称，例如：

```bash
pnpm --filter @molis-ai/molis-work-module-goals typecheck
pnpm --filter @molis-ai/molis-work-module-goals build
pnpm --filter @molis-ai/molis-work-plugin-runtime typecheck
pnpm --filter @molis-ai/molis-work-integration-github typecheck
```

`workspace:check` 只核对 F2 包清单；`boundary:check` 扫描真实 import、依赖方向、Contract 入口、依赖环和 Huge Class 临时名单；`workspace:verify` 是本地与 CI 共用的完整 package 门禁。

当前 Desktop payload 包含根 dist、正式 workspace 运行依赖、Runtime Skill、Node 和 vendor 来源/许可资产，不包含第二套业务实现。npm 使用 `pnpm package:npm`：先完整构建，再由 Local Host tooling 在临时目录生成 `release/npm/*.tgz`。需要其他输出目录时用 `pnpm package:npm /absolute/output`。不要直接在源码根执行 npm/pnpm pack；它会提示正确命令，避免生成含 workspace:* 的不可安装包。

npm 产物随包交付实际依赖的 workspace 与 vendor JavaScript 包，按各包 files 声明保留发布资产；注册表依赖由消费者正常安装，SQLite/PTY 不带入构建机二进制，也不附 Node。消费环境需要 Node 24+。本地验收先在新目录执行 `npm install /absolute/archive.tgz`（不能跳过安装脚本），再执行 `node tests/npm-distribution-smoke.mjs /absolute/consumer`。该检查通过实际产品入口验证 CLI、SQLite 持久化、PTY、方法资产、Home 安装及源包不可用时的 MCP 握手；只支持当前 Unix 测试宿主，不声称验证其他平台。

上句描述当前发布物；DV4 的干净环境完整发布验收仍未完成。
