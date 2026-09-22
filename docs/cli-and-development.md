# CLI 与开发

## 安装代码的开发边界

`pnpm build` 先清理各 workspace 包的生成目录，再根据声明的依赖顺序构建全部 56 个包，最后生成根入口和 PTY bundle。`build:migrated-packages` 复用同一个 `workspace:build`，因此删除/移动源码后不会把旧 JS 带进 npm/DMG。只清生成目录，不清 node_modules 或用户数据。Plugin CLI 的稳定 bin 启动文件随源码存在，干净 `pnpm install --frozen-lockfile` 后构建即可使用 `pnpm exec molis-work-plugin --help`。包边界扫描覆盖 src、tooling 和 bin 中的 JavaScript/TypeScript 调用。

Desktop 发布脚本归 `apps/desktop/tooling/`，根 `pnpm desktop:*` 命令不变。它调用 Local Host 的 `createMolisWorkRuntimePayload` 生成自包含目录，不在孤立资源目录对 workspace:* manifest 再执行 npm install。失败不覆盖已有资源，vendor 来源、SBOM、许可证随 payload 和 Home 安装保留。

Home 安装、Runtime 接入、常驻 Web 服务和卸载的实现统一在 `apps/local-host/src/installer/`，调用者通过 `@molis-ai/molis-work-app-local-host` 公开入口使用；旧 `src/install/` 已删除。不要在 CLI/Web 中复制预览、确认、所有权、回滚和清理规则。

`installMolisWorkHome` 必须接收明确的 `sourceDirectory`；只有产品根 CLI 根据自己的入口位置补默认值，因此从其他工作目录执行、不传 `--source` 仍安装同一个产品。卸载器必须注入 `UninstallProjectAccess`，根 `src/local-host/uninstall.ts` 负责只读连接与现有 Demo 删除装配；Projects 的公开检查负责 catalog facts，预览不迁移数据库。

修改 workspace 源码后必须重新构建。`pnpm build` 最后通过 `apps/local-host/tooling/write-build-manifest.mjs` 调用 Local Host 的构建记录生成函数，覆盖根源码、workspace 包源码/配置和构建脚本；不要单独生成记录掩盖旧构建。新建 workspace 层级时同步 installer fingerprint 的包发现范围与构建列表。定向回归包括 `tests/install.test.ts`、`tests/service.test.ts`、`tests/uninstall.test.ts`、`tests/uninstall-catalog.test.ts`，真实 Web/Desktop 调用由对应集成测试覆盖。DV4 完整发布验收尚未完成，不能把这些回归当成可发布证明。

## 当前Goal、父目标与依赖

当前工作由事件状态表示，公开读取使用 `goal_state`。父目标按自己的当前约定、报告、要求和适用阻塞判断完成，子目标数量不构成完成证明。未完成依赖影响正式完成，但不禁止记录普通笔记或部分结果。

结构影响与图合法性由 Goals Module 的规划图计算，当前候选读取事件work_status，不读取旧叶子分类。关系变化通过当前有限Goal Tree提案及受保护用户决定处理；不再生成clarifier Claim、Draft Dialogue或旧动作token。回归见 `tests/goal-tree-event-flow.test.ts`、`tests/goal-events-state.test.ts` 和 `tests/planning-engine.test.ts`。

## 一次性 V3 导入

旧 JSON 不是并行运行模式，只能通过显式导入写入一个全新的 V1 Board：

```bash
molis-work v1 import-v3 \
  --db .molis-work/imported.db \
  --board-id imported \
  --actor user \
  --key import-1 \
  --file legacy-goal-board.json
```

导入保留Goal标题与原结果、父子结构、范围、inputs/outputs、root constraints、coverage disposition和原始来源。现有事务同时接通当前事件归属，`goal_state.intent.source_kind` 为 `migration`；导入后可立即从Runtime或Web记录普通笔记，重启后仍可继续。不会合成验收要求、完成或用户批准，也不生成原V3没有的依赖。需要进一步明确交付时使用当前约定与要求。目标Board已存在时拒绝覆盖。

management MCP 提供同一 Coordinator 上的 `molis_work_v1_import_v3`；Runtime MCP 不暴露导入。

## CLI

公开 CLI 顶层提供本体安装、常驻服务、demo、安全卸载，以及 `molis-work v1 <operation>` 管理接口：

```text
init | snapshot | import-v3 | active-goal
goal-tree-propose | goal-tree-read | goal-tree-check | goal-tree-decide
```

复杂输入可以通过 `--json` 或 `--file payload.json` 传入。旧create-goal、Claim/Run、Evidence/Review和Contract/Candidate/Rewire等命令已退役，旧名字会报未知操作。日常笔记、报告、约定、收尾与继续使用MCP或Web，CLI没有同义事件写命令。CLI是用户/管理和本地调试入口，不是Runtime的服务故障回退。

## 项目结构

> 当前仓库已经是 Monorepo：18 个目标 package 保持 `contract-only`，30 个 package 已有真实迁移切片并标记为 `partial`；根 `@molis-ai/molis-work` package 暂时继续承载现有产品与发布兼容面。package 存在不代表全部业务都已迁入；真实状态和迁移 owner 见 [架构 SSOT 索引](SSOT-MATRIX.md)。

```text
apps/                        6 个产品入口与 composition root 边界
packages/                    10 个 Foundation package；contracts 暴露 30 个公开 subpath
modules/                     16 个业务事实 owner 边界
horizontal/                  5 个横向运行服务边界
plugins/                     6 个 Native Plugin 与 5 个官方 Integration Plugin 边界
packages/plugin-runtime/     FD3 本地 Plugin 生命周期参考实现
packages/plugin-sdk/         FD3 Manifest 与 Integration Plugin 定义 API
plugins/official-integrations/
                             官方 Manifest、Provider Adapter 与安装 package
apps/workbench/              Shell/Slot/资产、当前Goal导航与原生Plugin页面接线
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
                             48 包清单、manifest、入口、README 与 Contract 接线检查
src/index.ts、sdk-*.ts        0.1.x SDK 兼容出口；实现由 owner 包提供
apps/desktop/launchers/mcp/server.ts            MCP 启动入口；协议归 apps/mcp，装配归 Local Host
apps/desktop/launchers/web/server.ts            Web 启动入口；HTTP/资源装配归 Local Host，页面归 Workbench/Native Plugin
apps/desktop/               Desktop 平台与 Native adapter；旧 src/desktop 已删除
apps/local-host/src/installer/
                             安装、Runtime 接入、常驻服务与安全卸载的唯一实现
apps/local-host/tooling/     构建记录与 npm 发布包生成；调用 Local Host 公开 API
apps/desktop/tooling/        macOS 构建、Runtime payload、安装与启动脚本
apps/desktop/launchers/cli/main.ts              CLI 启动入口；命令归 apps/cli，装配归 Local Host
desktop/                     macOS App 的 Cargo/Tauri 发布配置；源码位于 apps/desktop/adapters/tauri
examples/seed-demo.mts       调用产品 demo 生命周期的开发脚本
docs/screenshots/            README 产品截图
skills/goal-advance/         Runtime 工作协议
skills/molis-plugin-dev/     插件开发 Skill（随安装发布，不自动挂 Runtime）
tests/goal-events-state.test.ts
                             当前要求、决定、完成与继续的状态转换
tests/goal-event-migration.test.ts
                             真实旧库升级、原历史和批准的保留
tests/goal-tree-event-flow.test.ts
                             有限树提案、用户决定、图与事务边界
tests/command-entry-chain.test.ts
                             当前MCP/Host/CLI入口组合与持久化
tests/host-entry-consistency.test.ts
                             组合调用、并发排队与Host资源生命周期
tests/mcp.test.ts            MCP audience、权限与连接回归
tests/plugin-outbound-mcp.test.ts
                             插件对外 MCP 登记、合成目录、闸门与分发
tests/web.test.ts            Web 数据与交互回归
tests/desktop-tui.test.ts    第三栏启动、面板与本机 PTY 回归
tests/i18n.test.ts           界面语言回归
tests/uninstall.test.ts      用户数据保留、强确认与恢复收据回归
PRODUCT.md                   产品定义
DESIGN.md                    shipped UI 设计系统
docs/SSOT-MATRIX.md          架构、包状态和迁移 owner 的权威索引
docs/system/                 分层、依赖、迁移与 Huge Class 退出规则
docs/modules/                16 个 Module 的事实 owner 与 API 边界
docs/horizontal/             5 个横向运行服务的技术边界
docs/platform/               Plugin、Storage、Exchange 与 UI 平台机制
specs/molis-work-architecture-reorganization/spec.md
                             本次重组的完整已确认 Contract
```

### 重组期间的开发规则

- 根 `pnpm` 命令继续验证当前产品；`workspace:*` 命令验证 48 个新 package，`*:all` 命令同时覆盖两者。
- 新代码只能通过 public entrypoint 调用其他 owner；禁止 deep import、跨 Module Store 和 App 直写业务数据库。
- `contract-only` 只表示边界存在，不得注册假 Provider、假 Store、UI 入口或伪成功 API。
- 每个迁移切片同时更新目标 package README、`docs/system/MIGRATION.md` 和对应 Module/Service 文档。
- Huge Class 的职责归属和删除门见 [Huge Class 职责迁移图](system/HUGE-CLASS-MIGRATION.md)。

## 对外 MCP

对外只有 `molis-work-mcp`。插件登记、人开闸、Host 合成目录。写插件的顺序和要素取舍见 [molis-plugin-dev Skill](../skills/molis-plugin-dev/SKILL.md)。作者步骤见 [Plugin 开发 · 对外 MCP](platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。Runtime Skill 协议见 [MCP 接入](mcp.md)。

### 调用链

```text
molis-work-mcp
  apps/desktop/launchers/mcp/server.ts     进程入口
  apps/local-host/src/mcp-server.ts        装配、冻结目录、按 catalog entry 分发
  apps/local-host/src/mcp-catalog.ts       平台 schema + 插件 mcp_exports → 一份目录
  apps/local-host/src/mcp-settings-store.ts  {home}/config/mcp-tools.json
  apps/local-host/src/mcp-authority.ts     list/call 同闸
  apps/local-host/src/mcp-native-plugins.ts Native 插件适配表（新产品加一条）
  apps/mcp                                 平台 schema、协议、连接工具、项目工具分发
  plugins/*/src/mcp.ts 或 contribution.mcp 只认 tool_id
```

`initialize` 时冻结启用集合。改设置只影响之后的新连接，不发 `tools/list_changed`。

`tools/call` 按目录条目的 `source` 分发：

| source | 走到 |
| --- | --- |
| `plugin` | `mcp-native-plugins` 按 `plugin_id` 找 adapter，传入 `{ tool_id, arguments }` |
| `platform` 且是连接工具 | `apps/mcp` 的 runtime-context handlers |
| 其余 `platform` | Host 注入身份后 `dispatchMcpProjectTool` |

### 改哪里

- **新 native 插件对外贡献**：插件 Manifest `mcp_exports` + 按 `tool_id` 的 handler + `mcp-native-plugins.ts` 加一条，`default_enabled` 默认 `false`。个人 store 且按项目分区的，adapter 从绑定连接取 `project_id`，不要改 `apps/mcp/src/tool-catalog.ts`，不要在 `mcp-server.ts` 点名公开工具名。
- **新平台工具**（连接 / Goals / 事件）：schema 和分发仍在 `apps/mcp`。
- **开关与设置页**：偏好在 `mcp-settings-store.ts`；HTTP 在 `web-mcp-settings.ts`；页面在 Workbench 全局设置，不进插件 `settings-page`。
- **运行时托管 app 插件**：`contribution.mcp` 已校验兑现；生产分发还没接到 Plugin Runtime，接上之前不要给 Coding 填 `mcp_exports`。

`agent.mcp` 是插件内 Agent 调外部 MCP，方向相反，不要复用。

## 前端与控件板

改工作台、插件或共享控件时，**视觉、动效、图标与色彩都是本切片的工作**，不是以后再说。编译过、测试绿、能点，都不等于做完。工艺底线见 [ui-craft-floor](../specs/ui-craft-floor/spec.md)；意图见 [DESIGN.md](../DESIGN.md)。

硬规则：

- **不准把操作系统默认控件当成产品 UI。** 禁止系统下拉菜单、系统颜色选择器、系统日期/时间弹出、`alert` / `confirm` / `prompt`、未换肤的 `range`。选择打开后必须是 `mw-menu`，原生 `<select>` 只可隐藏当表单值。文件选择可隐藏原生 input，按钮必须是 `mw-btn`。原生 `<dialog>` 只留 Escape 和焦点圈，外观走 `mw-*`。详见 [mw-select-custom-menu](../specs/mw-select-custom-menu/spec.md)。
- **图标与色彩成套。** 动作图标从 Lucide 库取。插件身份走 `--plugin-tint`（轨、目录、空态、当前舞台）。状态走 status family。靛（`--blue` / `--focus`）只给链接、选区和进行中，不是焦点描边，也不是第二套按钮。不要第二套 emoji 图标，不要灰图标配随机强调色。
- **动效成套，而且要做。** 只用 `--motion-*` / `--ease-*` 和已有位移（分段滑块、插件轨、目录 yield、`creative-arrive`）。状态变了要看得出走过去或到达，不要硬切。hover / press 是色阶，不是浮起。`prefers-reduced-motion` 去掉位移。不为动而动。
- **键盘焦点**是内侧 1px `--ink`（`--focus-stroke`）。禁止 `outline: 2px solid var(--focus|blue)` 和 `0 0 0 2px var(--focus)`。详见 [neutral-focus-stroke](../specs/neutral-focus-stroke/spec.md)。

改共享控件、状态或微动效，先打开 `/__ui/catalog` 对照标本再动手。一次性草稿可以先写在业务里，**进产品主链前换成 `mw-*`，不得带着系统控件进去**。已经达到产品美学要求的共享控件、状态变体或微动效，**要**补进 `packages/design-system` 的 Catalog。产品专属编排不必做成标本。用法见 [design-system README](../packages/design-system/README.md)；平台分工见 [UI Platform](platform/UI-PLATFORM.md)。

## 开发验证

```bash
# 目标 package 树
pnpm workspace:check
pnpm boundary:test
pnpm boundary:check
pnpm workspace:verify
pnpm workspace:typecheck
pnpm workspace:build

# 当前产品兼容面 + 目标 package 树
pnpm typecheck:all
pnpm build:all

# 当前产品回归与发布内容
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

上句描述当前发布物。Monorepo 重组完成后的 package、安装和发布命令由 DV4 与最终 Cutover Goal 更新并在干净环境验证。
