# Package 边界规则

状态：已确认（F1）  
完整包清单：[`docs/SSOT-MATRIX.md`](../SSOT-MATRIX.md)

## 1. 依赖方向

```text
apps
  → composition roots
  → public Module / Service / Platform contracts

modules
  → contracts/modules/*
  → contracts/services/*
  → kernel capability

horizontal
  → contracts/modules/*
  → contracts/services/*
  → colocated adapter ports

plugins
  → plugin SDK
  → declared Module / Service / UI contracts

platform packages
  → contracts/platform/*
  → lower-level platform packages only
```

## 2. 强制禁止

- Module implementation 或 Store 导入另一个 Module implementation 或 Store。
- Plugin 导入另一个 Plugin implementation、Store 或未公开 UI 组件。
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

`ci.yml` 里另有一个不挡合并的 `linux-probe` 作业（依据 `specs/repository-anti-corruption` 决定 #14）：`continue-on-error: true`，不在 `Verify` 的 `needs` 里，分支保护不动。它在 ubuntu 上先 `pnpm build`，再用 `scripts/ci-linux-probe.mjs` 把 `tests/` 下的非浏览器测试文件逐个跑一遍，记下哪些在 Linux 上通过：

- 每个文件经 `scripts/run-tests.mjs` 单独跑（环境和本地一样，每个文件一份新的 `MOLIS_WORK_HOME`），CI 里同时跑两个（`--jobs 2`）；失败的文件重跑一次（`--retries 1`），重跑通过的记为 `flaky`；每次尝试最多 10 分钟（`--timeout-seconds 600`），超时记 `timeout` 且不重跑；整体开始新文件的时间上限 85 分钟（`--budget-minutes 85`），剩下的记 `not-run`，作业本身硬上限 120 分钟（到点按取消处理，见下）。
- 每个文件按自己的源码（连同它引用的 `tests/` 下的辅助文件）打标记，规则在 `scripts/ci-linux-probe/select.mjs`：`browser` 是文件名带 `.e2e.test.`，或出现 Chrome 的路径、调试端口（不跑，记 `excluded`）；`darwin` 是平台判断、Seatbelt、Keychain、launchctl、Swift 助手、`/Applications/` 这类 macOS 专有的路径与工具（照跑并标出，失败时先当作平台差异读）；`live` 是文件名带 `live`，或用 `MOLIS_WORK_LIVE_*` 这类真实模型、真实网络的开关（探针不把这些开关传给测试，所以文件里的 live 测试会跳过）。整个文件只有 live 测试的（如 `tests/prologue-node-live.test.ts`）记 `skipped`，不算通过；文件里还有别的测试在跑的（如 `tests/plugin-sandbox-network.test.ts`、`tests/agent-built-plugins-dependencies.test.ts`），没失败就是 `pass`，跳过的个数记在 `report.json` 的 `skipped`，摘要里列在「Passed with some tests skipped」下，仍进 `pass.txt`（通过的只是在 Linux 上真正跑到的那一部分）。
- 结果：`pass`（至少一个测试体跑过且没有失败，文件里跳过的测试只计数）、`flaky`、`skipped`（整个文件没有测试体运行）、`fail`、`timeout`、`not-run`（没有结果：时间上限用完、或这次运行被取消时还没出结果，包括当时正在跑的那个）、`excluded`。测试文件失败是数据，探针照常以 0 退出；退出 2 只表示探针自己跑不了（参数错、没选中文件、平台不是 `--expect-platform`）；被信号取消时退出 128 加信号号，部分报告已经写好。
- 写出三个文件，作为名为 `linux-probe` 的产物保留 30 天（上传步骤是 `if: always()`），摘要在运行结束时附到作业摘要里一次：`report.json`（每个文件的标记、计数、耗时、尝试次数和失败信息节选，`endedBy` 记这次怎么结束）、`pass.txt`（通过的文件，一行一个，将成为 W2-16 的 `tests/ci-product-subset.txt` 的底稿）、`summary.md`（没有 darwin 或 live 标记却失败的文件列在最前，那些先看）。
- 被取消也有结果。`ci.yml` 的 `concurrency` 是 `cancel-in-progress: true`（同一个 PR 或 `main` 上有更新的推送，正在跑的 CI 就被取消），作业到 `timeout-minutes` 也被停掉，约 100 分钟的运行常遇到这种事。所以三个文件在每个文件跑完后都重写一次（先写临时文件再改名，被杀在写的当口留下的是上一份完整的）；收到 SIGINT、SIGTERM、SIGHUP（取消和超时发的就是这些）时，探针先停掉正在跑的测试进程，写一份部分报告并附到作业摘要，再以 128 加信号号退出（130、143、129）；没出结果的文件记 `not-run`，`endedBy` 写信号名，摘要最上面写明「Incomplete」。被 `kill -9` 这类拦不住的方式杀掉时，留下最后一次逐文件报告（`endedBy: "running"`），没有作业摘要。部分报告只覆盖已跑到的文件（顺序固定，按文件名）；要完整的一份，等一次没被取消的运行，或手动触发（`workflow_dispatch`，选 `main` 以外的分支：并发组按分支，`main` 上的合并取消不到它）。

本地：`node scripts/ci-linux-probe.mjs --list` 只列选择和标记、什么都不跑；`--only <正则>` 限定文件。本机跑出来的结果不是 Linux 结果，摘要里会写明。规则的测试是 `tests/ci-linux-probe.test.ts`，在 CI 的 Package boundaries 任务里跑。约两周后的续接：隔离不稳定的文件，把通过的文件定成 `tests/ci-product-subset.txt`（W2-16），再把这个作业加进 `Verify` 的 `needs` 并去掉 `continue-on-error`。

门禁由两层组成：

- `packages/test-kit` 提供纯规则：输入“谁在 import 谁”，返回具体违规；不读取数据库，也不复制业务判断。
- `scripts/check-package-boundaries.mjs` 读取 workspace manifest 与源码 import，把实际仓库信息交给纯规则，并检查依赖环和 Contract/README 清单。

旧根 `src/` 与 0.1.x 的根 SDK 都已退出产品实现，根包 `@molis-ai/molis-work` 只发布命令行入口，不导出代码。`pnpm boundary:check` 拒绝任何根目录 `src/`（不再有兼容白名单）；各包的大文件由 `pnpm health:check` 的巨大单元门禁只许变小。

Goal 的 typed compatibility capability 可保留为统一 Action 的薄适配，门禁检查其实际返回 `goalAction` 的结果。CLI 的 snapshot 仍消费该适配，标准 MCP 按 Action 目录发现，不要求恢复已退出的旧 MCP snapshot 分支。两者仍不得越过 Host 直接读写领域 owner。

Repository 仅内部可见是目标约束；当前 Goals/Artifacts 等 public entrypoint 仍导出构造类型，尚待将 Host 装配与普通消费者接口分清。不能将现有导出视为任意调用 Store 的许可，也不能通过删除此约束宣称边界已完成收口。
