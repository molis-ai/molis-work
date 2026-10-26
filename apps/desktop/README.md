# 桌面应用装配

把本地 Web 产品接入桌面窗口、Panel、Capsule 和 Runtime 启动流程，并提供 macOS 发布工具。

包名：`@molis-ai/molis-work-app-desktop`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createDesktopWebHost 向 Local Host 注入桌面能力；项目目录装配由 openMolisWorkProjectCatalog 提供。Panel 和 Capsule 通过 native bridge 与 Tauri 外壳交互，业务数据仍经各 Module 的公开接口访问。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/web-host.ts](src/web-host.ts) | 桌面 Web Host 装配 |
| [src/project-catalog.ts](src/project-catalog.ts) | 项目目录装配 |
| [src/panels.ts](src/panels.ts) | Panel API |
| [src/launch.ts](src/launch.ts) | Runtime 启动 |

可对照现有调用方 [apps/desktop/launchers/web/server.ts](../../apps/desktop/launchers/web/server.ts) 阅读装配方式。

## 接入与边界

Tauri 工程、配置和资源已集中在本包的 `src-tauri/`，启动占位页在 `webview-placeholder/`；本包不另建 Goal 状态机。App 构建、安装与 Developer ID 签名/公证是不同步骤，当前实现不能据此声称已公证或已公开发布。

面板写入和 HTTP 启动准备共用 `desktopLaunchArgs` 检查：省略参数仍为 `[]`，提供时必须是字符串数组，空串、空格和每个字符串原样保留；非法输入以 `desktop.launch_args_input_invalid` / `invalid` 拒绝（HTTP 400），不写面板、别名、绑定或事件，也不生成启动计划。带 resume 的请求同样先检查显式参数，合法 resume 生成规则保持。

面板持久化的 `launch_args` 只接受 JSON 字符串数组。损坏 JSON、非数组或含非字符串的数组以 `desktop.launch_args_invalid` / `internal` 拒绝完整记录读取（HTTP 500）；包含坏记录的本次列表，以及依赖读取的重开、状态修改、关闭和别名操作也拒绝。失败不改原数据、不生成启动参数，也不把坏记录当成无参数启动；其他 Goal 的合法面板仍可读取。整项目删除经面板 owner 的窄 `listIds` 检查进程中的存活终端，坏参数不会卡住已确认且无活终端的项目删除；原有删除事务仍清理面板、别名和绑定。本包不提供单条坏记录的自动修复或单独删除。

本包的装配依赖见 [package.json](package.json)；包之间的允许方向由仓库边界检查约束。

桌面启动、原生命令分发及 Shelf 后台请求先用随机 challenge 和 Home 控制密钥验证本地服务的 HMAC 响应。后台请求复用已验证的 TCP 连接再发送令牌和内容；端口上的任意 HTTP 服务不能冒充本 Home。原生 PTY 已移除，终端仍走工作台的 WebSocket PTY。对应 SYS-14 的 Rust/HTTP 负向用例证明协议拒绝，原生 WebKit 实操单列验收。

## 产品启动与打包

`launchers/` 保存 CLI、MCP、Web 的最终产品启动装配；它使用根产品 manifest 的依赖，由根 `tsconfig.json` 编译到原来的 `dist/cli`、`dist/mcp`、`dist/web`。协议实现仍在 CLI/MCP App，业务装配仍在 Local Host。

CLI 的正常回答与退出码由原命令分发器负责；入口之外的意外拒绝只写现有 Host 的安全日志并退出 1。Web 收到 SIGINT/SIGTERM 后只发起一次关闭，先停接纳与空闲连接，给现有 owner 一轮事件循环结束流，再终止剩余活动 HTTP 和本服务登记的 socket（含升级后的 WebSocket）；HTTP/Host 清理和这些 socket 的实际 close 回调完成后才退出 0。关闭拒绝或原 2 秒界限内仍未完成则写安全诊断并退出 1，不宣称剩余清理已经完成。相关真实构建入口回归见 [desktop-entry-failures.test.ts](../../tests/desktop-entry-failures.test.ts)，含实际 SSE、认证 PTY、未完成请求与真实卡死对照。

桌面 Rust 入口为 `adapters/tauri/src/main.rs`，`src-tauri/Cargo.toml` 指向它。仓库根运行 `pnpm desktop` 启动开发版，`pnpm desktop:build:macos` 构建 App/DMG；后者会准备本地 Runtime 资源，但不会自动安装应用。

主窗口将系统文件拖放交给 WebKit 的 HTML5 拖放处理（`dragDropEnabled: false`），由页面现有的 drop 入口接收图片与文件；不得让 Tauri 的原生拖放接管后丢弃事件。胶囊与 Shelf 的原生拖拽路径不变。macOS 截图浮动缩略图、Finder 图片以及保存后重开需要用实际 App 验证，浏览器用例不能替代。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-app-desktop typecheck
pnpm --filter @molis-ai/molis-work-app-desktop build
```

已有行为示例与回归：[desktop-tui.test.ts](../../tests/desktop-tui.test.ts)、[持久化参数故障回归](../../tests/desktop-launch-args.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/desktop-tui.test.ts
```

这些测试使用隔离数据或注入端口；Provider/桌面相关测试的通过不等于真实账户连接、安装或发布验收。

## 开发要求

生产 MCP 在需要宿主时按需启动当前 Home 已安装的 `bin/molis-work-web`，只传固定 Home 与配置端口，不注册登录服务。Web 初次就绪有界，Home 健康认证通过才转发；MCP 退出后宿主继续常驻，App 按现有规则复用外部宿主，不接管其 Child 或 owner。MCP 取消/EOF 只结束该请求的等待与 HTTP，Web 启动失败经私有 fd 3 返回安全错误码，详细规则及真实进程验收见 [W5-16 C5](../../specs/repository-anti-corruption/slices/w5-16-mcp-autostart.md)。

- 负责：macOS 产品外壳与原生桥的组合根，以及 CLI、MCP、Web 的启动器（`launchers/`）。
- 不负责：业务事实、Module 规则、Runtime 状态。
- 公开入口：`@molis-ai/molis-work-app-desktop`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/app-host`。
- 依赖：组合根：按 `package.json` 装配已登记的包，只做装配与 IO，不写业务规则。方向见[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节。
- 不变量：
  - 启动器只准备环境并转发：MCP stdio 经动作网关转给常驻 Web 宿主，不另起执行器。
  - 不直接写业务数据库；面板、Capsule、热键等原生适配不承载业务判断。
  - 构建、安装与签名/公证是不同步骤，构建通过不等于已公证或已发布。
- 改动后必跑：`node scripts/run-tests.mjs tests/desktop-shell-bootstrap.test.ts tests/desktop-tui.test.ts tests/action-mcp-stdio.test.ts`
- 相关手册：[docs/platform/DESKTOP.md](../../docs/platform/DESKTOP.md)、[docs/platform/LOCAL-HOST.md](../../docs/platform/LOCAL-HOST.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/platform/DESKTOP.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap4`, `goal-reorg-dv4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
