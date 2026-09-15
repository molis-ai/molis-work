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

本包的装配依赖见 [package.json](package.json)；包之间的允许方向由仓库边界检查约束。

## 产品启动与打包

`launchers/` 保存 CLI、MCP、Web 的最终产品启动装配；它使用根产品 manifest 的依赖，由根 `tsconfig.json` 编译到原来的 `dist/cli`、`dist/mcp`、`dist/web`。协议实现仍在 CLI/MCP App，业务装配仍在 Local Host。

桌面 Rust 入口为 `adapters/tauri/src/main.rs`，`src-tauri/Cargo.toml` 指向它。仓库根运行 `pnpm desktop` 启动开发版，`pnpm desktop:build:macos` 构建 App/DMG；后者会准备本地 Runtime 资源，但不会自动安装应用。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-app-desktop typecheck
pnpm --filter @molis-ai/molis-work-app-desktop build
```

已有行为示例与回归：[desktop-tui.test.ts](../../tests/desktop-tui.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/desktop-tui.test.ts
```

这些测试使用隔离数据或注入端口；Provider/桌面相关测试的通过不等于真实账户连接、安装或发布验收。

## 进一步阅读

- [职责与接入说明](../../docs/platform/DESKTOP.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap4`, `goal-reorg-dv4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
