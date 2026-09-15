# macOS Desktop Release

## 完成等级

内部完整，并具备可发布流水线：Apple Silicon 与 Intel 用户可以下载对应 DMG、把 Molis Work 拖入 Applications 并直接启动。正式面向公网免 Gatekeeper 警告仍以 Developer ID 与 Apple notarization 凭据为发布门禁。

## 背景与问题证据

- 当前 `pnpm install:local` 能安装 Molis Work Core，`molis-work service` 能维护 macOS LaunchAgent，`pnpm desktop` 能从源码启动 Tauri Desktop。
- 当前 Tauri `bundle.active=false`，README 明确写着 Desktop 只是源码 Preview，没有 DMG、签名、公证或 GitHub Release。
- Desktop 启动时只会查找 `~/.molis-work/bin/molis-work-web`；全新用户下载单独的 App 后无法启动。
- 现有 Molis Work launcher 使用 `/usr/bin/env node`，即使 App 内附 Core，只要用户没有系统 Node，MCP、Web 与 CLI 仍不可用。

## 目标与用户路径

1. 用户下载与 CPU 架构匹配的 `Molis Work-<version>-macos-<arch>.dmg`。
2. 用户把 Molis Work 拖入 Applications 并打开。
3. App 从自己的 Resources 中找到 Node 与 Molis Work Runtime；若本机尚未安装，则调用现有安装服务写入 `~/.molis-work`。
4. 安装后的 CLI、MCP 与 Web launcher 使用 release 自带 Node，不依赖系统 Node、pnpm 或源码仓库。
5. App 启动或复用本地 Web 服务并进入 Desktop 工作台；已有项目、配置和历史保持不变。
6. 开发者也可以通过仓库内的 build、install、start 脚本构建、安装和启动同一 App。

## 方案与模块边界

- `src/install/home.ts`：识别可选的 `runtime/node`，将其纳入内容摘要和原子 release；为这种 release 生成自带 Node 的 shell launcher，同时兼容并可升级旧 Node launcher。
- `src/install/uninstall.ts`：把新旧两代 launcher 都视为 Molis Work 自有文件，仍按原来的冲突保护卸载。
- `desktop/src-tauri/src/main.rs`：在 App setup 阶段读取 bundled resource；本地 Web 未运行时幂等安装或刷新同版本 Core，再启动 Web。失败时在窗口中显示可操作错误，不静默退出。
- `scripts/prepare-macos-runtime.sh`：下载固定 Node LTS，校验官方 SHA256，使用这份 Node 安装生产依赖，并生成 Tauri resource payload。
- `scripts/build-macos-release.sh`：构建 Core、准备 payload、生成 `.app` 与 `.dmg`，输出架构明确的产物与 SHA256。
- `scripts/install-macos-app.sh`、`scripts/start-macos-app.sh`：开发和手动分发入口；默认安装到用户级 `~/Applications`，替换旧 App 前移入废纸篓。
- `.github/workflows/release-macos.yml`：手动触发可生成 arm64/x64 内部包；`v*` tag 只有在 Apple secrets 完整、Tauri 签名与公证成功后才发布公开 Release。

## 输入、输出与依赖

- 输入：仓库版本、macOS 架构、固定 Node LTS 版本、可选 Apple Developer secrets。
- 输出：`release/macos/*.dmg`、`.app.zip`、`.sha256`，以及 GitHub Release assets。
- Node 与生产依赖必须和目标架构一致；不生成一个混合 native addon 的伪 universal 包。
- 用户权威数据仍只在 `~/.molis-work/projects` 与 catalog 中，Desktop payload 不包含用户数据。

## 非目标

- 不实现自动更新器、App Store、Windows/Linux 安装包。
- 不把 Runtime 配置接入、项目创建或 demo 创建偷偷并入 App 首次启动。
- 不绕过 Gatekeeper，不自动删除 quarantine 标记。
- 不把证书、密码、API key 或 notarization profile 写入仓库。

## 验收标准

1. 带 `runtime/node` 的安装源生成 shell launcher，删除安装源且 PATH 中没有 Node 后，CLI/MCP/Web 仍能运行。
2. 不带 bundled Node 的现有源码/npm 安装行为与 launcher 保持兼容。
3. Desktop 全新启动能从 bundled resource 安装 Core；已有安装只复用或按现有摘要规则刷新，不修改项目数据。
4. 本机 `pnpm desktop:build:macos` 产出与当前架构匹配的 App、DMG、zip 和 SHA256。
5. `pnpm desktop:install:macos` 与 `pnpm desktop:start:macos` 可重复执行并给出清楚结果。
6. GitHub workflow 对 `v*` tag 生成 arm64 与 x64 assets；没有签名 secrets 时明确阻止公开 Release，手动触发仍可生成内部 ad-hoc artifacts。
7. README 与安装文档准确区分源码安装、Desktop DMG、ad-hoc 包和签名公证包。
8. TypeScript、Rust、安装器、Desktop 与完整测试通过；本机构建的 App 可启动并返回健康页面。

## 验证

```bash
pnpm typecheck
node --import tsx --test tests/install.test.ts tests/uninstall.test.ts tests/desktop-tui.test.ts
cargo test --manifest-path desktop/src-tauri/Cargo.toml
pnpm desktop:build:macos
pnpm test
git diff --check
```

手动验证：把本机已有 `MOLIS_WORK_HOME` 指向临时目录启动构建出的 App，确认它自动安装 bundled Core、页面健康、三个 launcher 均可在移除 Node PATH 后运行；再以正常 `~/.molis-work` 启动，确认已有项目不变。
