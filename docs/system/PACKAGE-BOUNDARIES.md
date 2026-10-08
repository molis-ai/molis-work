# Package 边界规则

状态：已确认（F1）  
完整包清单：[`docs/SSOT-MATRIX.md`](../SSOT-MATRIX.md)

## 1. 依赖方向

```text
apps
  → composition roots
  → public Module / Service / Platform contracts
  → another App only along the listed launcher edges (§2)

modules
  → contracts/modules/*
  → contracts/services/*
  → kernel capability
  → never a Horizontal Service, App or Plugin

horizontal
  → contracts/modules/*
  → contracts/services/*
  → colocated adapter ports

plugins
  → plugin SDK
  → declared Service / UI contracts and the action directory
  → never an App, Horizontal Service or Module implementation (one listed exception, §2)

platform packages
  → contracts/platform/*
  → lower-level platform packages only
```

## 2. 强制禁止

- Module implementation 或 Store 导入另一个 Module implementation 或 Store。
- Module 导入 Horizontal Service、App 或 Plugin（代码 import 与 `package.json` 依赖都查，`module-upward-dependency`）。
- Plugin 导入另一个 Plugin implementation、Store 或未公开 UI 组件。
- Plugin 导入 App、Horizontal Service 或 Module implementation（`plugin-upward-dependency`）。在册的唯一例外：`plugins/native/shelf → modules/shelf`（Shelf 仍用 Shelf Module 的配方与设置解析，是待还的债，不是先例）。Goals 插件曾声明却从未导入 `modules/goals`，该依赖已删。
- App 导入另一个 App，列出的启动器边之外都拒绝（`app-dependency-not-allowed`）：产品根的启动器 → desktop / local-host / mcp，desktop → local-host，local-host → cli / mcp / workbench，`apps/server` → desktop / local-host。
- App Shell、CLI、MCP、Workbench 或 Desktop 直接写业务数据库。
- Horizontal Service 或平台产品服务（记忆、放置、搜索、情境排序）拥有或决定 Goal、Signal、Action、Session 等插件或 Module 的业务事实。
- Server Core 导入 Plugin payload schema 或完整 Local Module 状态机。
- `packages/contracts` 依赖 App、Module implementation、Plugin implementation、数据库或网络客户端。
- 通过 deep import 绕过 package public entrypoint。
- 用新的全局 `Manager`、`Service`、`Coordinator` 或共享 Store 代替旧 Huge Class。

## 3. 公开 Contract 形状

每个 Module 至少分开定义：

- Query：只读输入、结果、分页和权限 scope。
- Command：意图、版本/幂等键、成功结果和稳定错误码。
- Event：事务后事实、事件版本、幂等 identity 和最小 payload。
- Repository：仅实现内部可见，除测试端口外不从 public entrypoint 导出。
- Recovery：冲突、重试、恢复和 Compatibility 行为。

`packages/contracts` 是一个分发包，通过显式 subpath 暴露边界；禁止用根 barrel 再聚合所有类型。

## 4. package 建立标准

F2 创建目标地图里的全部 package。每个 package 必须有：

1. manifest 与 workspace 接线；
2. 单一 public entrypoint；
3. 允许/禁止依赖说明；
4. 就近 README；
5. 独立 build/typecheck；
6. import boundary 或 Contract conformance test；
7. `contract-only`、`partial` 或 `implemented` 状态；
8. 旧来源、剩余 caller 和移除条件。

`contract-only` package 只提供真实边界，不注册入口、不创建 Store、不返回伪成功。独立 package 默认是 Monorepo 私有包；只有 Contracts、Plugin SDK 和必要 UI Extension 类型进入潜在公共发布面。

## 5. Adapter 放置

不设顶层 `adapters/`：

- SQLite、Filesystem、Blob：`packages/storage/adapters/`
- PTY、Codex app-server：`horizontal/runtime-host/adapters/`
- Tauri、Keychain、Updater：`apps/desktop/adapters/`
- GitHub、Gmail、RSS 等：对应 `plugins/official-integrations/<provider>/`

Adapter 只翻译 Port 与具体技术调用，不拥有业务事实。只有形成独立发布物或多个真实消费者的版本压力时，才升格为 package。

## 6. 自动门禁

F3 已建立自动门禁，覆盖：public entrypoint、禁止 deep import、Module/Plugin/App 依赖禁区、Contract 清单一致性、package 独立 typecheck/build、循环依赖、README/状态矩阵存在。门禁通过不等于功能实现完成；行为还需由对应垂直 Goal 的兼容与端到端测试证明。

本地使用：

```bash
pnpm boundary:test   # 用失败样例证明规则真的会拦截
pnpm boundary:check  # 扫描当前实际 workspace package
pnpm workspace:verify # 门禁 + 所有目标 package 的 typecheck/build
```

`.github/workflows/ci.yml` 在 pull request 和 `main` push 上运行同一条 `workspace:verify`，并运行健康门禁（`health:check`）、Goal 查询/存储边界、存储基线、发布资产、启动器类型检查、动作与插件合同、单一工作台外壳与成果门禁。全量产品测试仍在本地跑（见 PR 模板），但这些定向行为回归和 package 边界检查持续执行。

门禁由两层组成：

- `packages/test-kit` 提供纯规则：输入“谁在 import 谁”，返回具体违规；不读取数据库，也不复制业务判断。例外名单 `APP_IMPORT_ALLOWLIST`、`PLUGIN_MODULE_IMPORT_ALLOWLIST`（`packages/test-kit/src/boundaries.ts`）按包路径记边，只许减少，`packages/test-kit/tests/boundaries.test.mjs` 把它们逐项钉死。
- `scripts/check-package-boundaries.mjs` 读取 workspace manifest 与源码 import，把实际仓库信息交给纯规则，并检查依赖环和 Contract/README 清单。

结构数字另由 `pnpm health:check` 对照 merge-base 只许减少（模块在 `scripts/gates/`，测试 `tests/health-gates-structure.test.ts`，规则与取数口径见各模块文件头）：

| 数字 | 量什么 | 为什么 |
| --- | --- | --- |
| `contractsPurity` | `packages/contracts/src` 里的定时器与 `AbortController`/`fetch`/`process`、`Date.now()`、`Math.random()`，Node 内置模块导入，模块级可变状态，字面 HTTP 状态码，20 行以上的函数（逐个记行数） | 合同包只放类型、Schema 与无副作用的小函数（N-11）；现有的运行时代码是基线，搬到所有者那里（W3-03）后数字下降 |
| `hostEntryExports` | `apps/local-host/src/index.ts` 的 `export *` 个数 | 宿主入口过宽，每个新 helper 都变成公开面（N-11） |
| `moduleRepositoryExports` | 各 Module 入口导出的 `…Repository`/`…Store` 名字，和导出的类、接口上公开的 `repository` 成员 | Repository 仅内部可见（§3）；去掉导出是下一步，这一步先不让它变多 |
| `typedCapabilities` | `HostCapabilityDefinition` 的引用、没有 `action` 的描述符字面量、`registerCapability` 调用，按文件 | 2026-10-07 N-12 决定：对外的能力只走动作服务，typed 注册表只留作宿主内服务通道，不再新增条目 |
| `hostPluginFiles`、`registerProviderSites` | 宿主里以内置插件命名的 `<插件>-actions.ts`、`<插件>-native-plugin-http.ts`；`apps/local-host/src` 里每个文件的 `registerProvider(` 调用 | 构建期装配路径冻结（AGENTS.md）；名单测试 `tests/builtin-plugin-assembly-gate.test.ts` 之外，这里对照 merge-base，改名单放不过 |
| `hybridPlugins` | 已由 Plugin Runtime 启动、宿主却还有同名文件或手工 `registerProvider(<插件>…Provider(…))` 的插件（现在：shelf、characters、coding、git），报告里标出 | 混合装配既不是 Runtime 形状也不是冻结的构建期形状，名单看不出来。Characters 按 2026-10-08 决定第 26 项将并进宿主或某个 Module，不再长期作为 Runtime 插件 |
| `pluginOutsideMentions` | 每个内置插件的包名在它自己的包之外出现在多少个源码或配置文件里（import、`package.json` 依赖、工作区清单） | 加一个插件除了它自己的包还要改几处；目标是 0（W4-01）。新插件最多可以被 7 个文件点名，等于现有最小的完整插件（text-stats） |

typed 条目的新增、Repository 导出的新增、宿主入口的变宽、合同包里新副作用的出现，都不是加数字能放过的事：改动门禁本身要过评审。

旧根 `src/` 与 0.1.x 的根 SDK 都已退出产品实现，根包 `@molis-ai/molis-work` 只发布命令行入口，不导出代码。`pnpm boundary:check` 拒绝任何根目录 `src/`（不再有兼容白名单）；各包的大文件由 `pnpm health:check` 的巨大单元门禁只许变小。

Goal 的 typed compatibility capability 现在仍作为统一 Action 的薄适配存在，门禁检查其实际返回 `goalAction` 的结果。CLI 的 snapshot 仍消费该适配，标准 MCP 按 Action 目录发现，不要求恢复已退出的旧 MCP snapshot 分支。两者仍不得越过 Host 直接读写领域 owner。2026-10-07 的 N-12 决定是对外只走动作、没有生产调用方的 Goals typed 桥要删（W2-08、W3-07 做），在此之前 `typedCapabilities` 只许减少，不许新增。

Repository 仅内部可见是目标约束；当前 Goals/Artifacts 等 public entrypoint 仍导出构造类型，尚待将 Host 装配与普通消费者接口分清。`moduleRepositoryExports` 把现有导出冻结住，只许减少。不能将现有导出视为任意调用 Store 的许可，也不能通过删除此约束宣称边界已完成收口。
