# 语言工具与 Runtime 可用性核查（2026-11，供第 35 批）

状态：只读核查记录（2026-11-15，随路线书第 34 批可并行项完成）；不改 `horizontal/agent-host/src/code-intelligence/`、不改 `plugins/native/coding`、不改 `apps/desktop`。供[第 35 批](../post-anticorruption-roadmap/reference/batches/35.md)「代码智能与分析工具扩大（按需下载）」与 Onboarding 既有工作接续实现时直接引用。

## 1. 核查对象与依据

对照 [Coding 插件方案 §4.2](spec.md#42-代码智能与分析工具) 与第 31 批已落地的代码智能底座：

- 平台底座：`horizontal/agent-host/src/code-intelligence/index.ts`、`lsp-client.ts`、`tool-fetcher.ts`
- 受管二进制下载先例：`apps/local-host/src/connector-native-release.ts`（GitHub Release 压缩包 + SHA-256 摘要校验 + Home 受管安装目录）
- 本机环境只读核查（macOS arm64，仅运行 `--version`／`which`，不写任何目录、不联网下载）

## 2. 现役底座实际支持什么（第 31 批已落）

| 位置 | 当前已实现能力 | 限制与缺口（第 35 批要补） |
| --- | --- | --- |
| `code-intelligence/index.ts` | 只登记了 TypeScript／JavaScript 一项（`typescript-language-server --stdio`）；提供 `symbols`、`definition`、`references`、`diagnostics` 四个只读工具；未安装时返回 `status: "unavailable"` 与原因，不静默退化成 grep | 语言表只有 TS／JS；没有 Python、Rust、Go、C/C++、Java、Lua 等语言项，也没有静态分析工具（`ruff`、`ty` 等）入口 |
| `code-intelligence/lsp-client.ts` | 基于 stdio `Content-Length` 帧的轻量 LSP 客户端，带 `LSP_TIMEOUT_MS = 15_000`、`MAX_BUFFER_BYTES = 16 MiB`、最小环境变量（`PATH`、`HOME`、`TMPDIR` 等）与目录边界检查（只收工作区内路径） | 每个请求独立起停一次 `initialize` → 查询 → `shutdown`；对启动慢的大型语言服务（如 `rust-analyzer`、`jdtls`）单次冷启动可能接近 15 秒上限，第 35 批需评估按工作区短驻留或放宽冷启动时限 |
| `code-intelligence/tool-fetcher.ts` | 受管目录在 `<Home>/tools/code-intelligence/<id>/<version>/`；写入前做版本字符集校验与 `fetchLocks` 去重 | **只支持 npm 包安装**（调本机 `npm install --prefix <targetDir> --no-save --ignore-scripts --no-audit --no-fund <pkg>@<version>`）：一要本机 `PATH` 上有 `npm`（打包后的桌面端若只带内置 Node 而不带 `npm` CLI 会失败），二装不了非 npm 发行的原生二进制（`rust-analyzer`、`gopls`、`clangd` 等） |

## 3. 各语言工具／Runtime 逐项核查结果

| 语言／领域 | 候选工具 | 发行形态（按需下载可行性） | 本机实装现状（2026-11-15） | 第 35 批接入路径结论 |
| --- | --- | --- | --- | --- |
| TypeScript／JavaScript | `typescript-language-server` + `typescript` | 纯 npm 包（现役 `ToolInstallSpec` 已配 `typescript-language-server@4.3.3` + `typescript@5.7.3`） | `PATH` 未全局预装；本机有 Node `v24.15.0` 与 `npm` | 沿用 npm 受管安装；桌面端需核内置 Runtime 是否带 `npm` 或改走 tarball 解压 |
| Python 类型与导航 | `basedpyright`（或 `pyright`） | 有官方纯 npm 包（`pyright`／`basedpyright` 均提供 `langserver.index.js --stdio`，不要求目标机器预装 Python 才能起 LSP） | `python3`（`3.9.6`）、`uv`（`0.10.9`）在 `PATH`；`pyright`、`basedpyright` 未装 | **优先走 npm 包**（零新下载器即可复用 `tool-fetcher.ts`，只用内置 Node 就能跑 `--stdio`） |
| Python 静态检查／分析 | `ruff`、`ty` | 官方提供预编译单文件二进制（GitHub Releases，含 `aarch64-apple-darwin`、`x86_64-apple-darwin`、`x86_64-unknown-linux-gnu`、`x86_64-pc-windows-msvc` 附 `.sha256`）及 PyPI wheel（可经 `uv tool`） | `ruff`、`ty` 未装；`uv 0.10.9` 已装 | **走受管原生二进制下载**（复用 `connector-native-release.ts` 的平台三元组 + SHA-256 校验解压模式），不依赖用户机器装了 `uv` 或 `pip` |
| Rust | `rust-analyzer` | 官方 GitHub Releases 提供各平台单文件 `.gz` 二进制；分析依赖项目能找到 `cargo`／标准库 sysroot | `rust-analyzer`（`1.93.0`）、`rustc`、`cargo` 已在 `~/.cargo/bin` | 先探测 `PATH`／`~/.cargo/bin` 已有版本；未装时走受管 GitHub Release 单文件下载 + SHA-256 校验。若本机无 `cargo`／`rustc`，报明确缺口（缺 Rust 工具链），不替用户装整套 `rustup` |
| Go | `gopls` | 官方以 Go module 发布，无 npm 包、GitHub Release 不直接发单文件预编译包；运行本身也依赖本机 `go` 工具链解析模块 | `go`、`gopls` 均未装 | 先探测本机 `go`：无 `go` 时明确报「未安装 Go 工具链」；有 `go` 时用 `GOBIN=<Home>/tools/code-intelligence/gopls/<version>/bin go install golang.org/x/tools/gopls@v<version>` 受管安装（无 shell、最小环境、固定版本） |
| C／C++、Swift（本机原生） | `clangd`、`sourcekit-lsp` | macOS 随 Command Line Tools 自带；Linux／Windows 亦有官方 `clangd` GitHub Release 压缩包 + SHA-256 | `/usr/bin/clangd`（Apple clangd `17.0.0`）、`/usr/bin/sourcekit-lsp` 已在 `PATH` | `clangd` 先用本机 `PATH`，缺时走 GitHub Release + SHA-256；`sourcekit-lsp` 仅在 macOS／已装 Swift 工具链时启用 |

## 4. 对第 35 批的具体建议

1. **`tool-fetcher.ts` 扩成两种受管安装器，共用同一目录、锁与卸载：**
   - `kind: "npm"`：现役逻辑，补齐对内置 Node 环境的核对。
   - `kind: "archive"`：照 `apps/local-host/src/connector-native-release.ts` 按 `(platform, arch)` 取固定 URL 与固定 `sha256`，下载到临时文件校验通过后原子落入 `<Home>/tools/code-intelligence/<id>/<version>/`，不经 shell、不跑安装脚本。
   - `kind: "go-install"`（仅 `gopls`）：本机已有 `go` 时设置 `GOBIN` 装入同一受管目录；本机无 `go` 时直接返回明确未就绪原因，不静默失败。
2. **先探测本机已有命令，但必须过版本输出校验：** 跟外部工具登记表的 `detect` 一样，只用无 shell 的 `--version` 核对版本格式，不跑工作区里的相对路径二进制（防恶意仓库放同名可执行文件）。
3. **不装重型语言 Runtime 本身：** Molis 按需下载的是分析器／语言服务器（几十 MB、固定哈希、可一键清理），不替用户静默安装 `rustup`、JDK、Go SDK 或 Xcode Command Line Tools；缺底层工具链时在状态里如实说明。
