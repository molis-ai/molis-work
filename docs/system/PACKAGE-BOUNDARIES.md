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
  → declared Module / Service / UI contracts and the action directory
  → never an App, Horizontal Service or Module implementation package (one listed exception, §2)

platform packages
  → contracts/platform/*
  → lower-level platform packages only

the published surface (contracts, plugin-sdk) is the lowest layer
  → contracts depends on no workspace package
  → plugin-sdk depends on contracts only (`public-sdk-private-dependency`); every other layer may use its runtime tools
```

内核（`packages/kernel`）有两半：核心（目录、分发、可用性、授权、场景兼容）只读 `contracts/platform/*`；放在内核里的平台产品服务「情境排序」（`contextual.ts`，纯函数，N-03：位置不变）另可读 `contracts/services/contextual`，也只许这一份，由 `pnpm health:check` 的 K2 守着（§6）。平台包读 `contracts/services/*` 在内核之外还有三处（`packages/storage` 的记忆账本与搜索索引适配、`packages/im-ui`），不属于内核这条例外，记在 BL-123。

`server/`（身份、设备、接续回执与群聊领域）按 Module 规则检查，不算平台包：它有自己的业务事实（2026-10-08 决定第 4 项）。分类以 `scripts/workspace-packages.mjs` 的 `kind` 为准。

## 2. 强制禁止

- Module implementation 或 Store 导入另一个 Module implementation 或 Store。
- Module 导入 Horizontal Service、App 或 Plugin（代码 import 与 `package.json` 依赖都查，`module-upward-dependency`）。
- Plugin 导入另一个 Plugin implementation、Store 或未公开 UI 组件。
- Plugin 导入 App、Horizontal Service 或 Module implementation（`plugin-upward-dependency`）。在册的唯一例外：`plugins/native/shelf → modules/shelf`（Shelf 仍用 Shelf Module 的配方与设置解析，是待还的债，不是先例）。Goals 插件曾声明却从未导入 `modules/goals`，该依赖已删。
- 生产源码导入任何插件的 `./testing` 出口，或插件自己的其他模块导入它的 `testing` 模块（`plugin-testing-entry-import`）。`./testing` 是测试在运行时之外开插件数据的入口（现在没有插件带这个出口：Pages 的 `openPagesStore` 已搬进测试夹具 `tests/fixtures/plugin-home-stores.ts`，PG-023；规则留着，不让它再长出来）；生产代码经 Plugin Runtime 取数据，不经它。
- Plugin SDK 导入或依赖 contracts 以外的任何工作区包（`public-sdk-private-dependency`，源码 import 与 `package.json` 依赖都查）。外部作者只装 contracts 与 SDK 两个包；SDK 依赖了私有包，打包后的示例就装不上（2026-09-30 出过一次）。所以作者和平台共用、会运行的工具放在 SDK 里，而不是私有的 kernel 或 plugin-runtime，平台各层从 SDK 取同一份。现在在 SDK 里的是执行生命周期（kernel、宿主、调度服务、Shelf 模块和沙箱从 SDK 取）、Manifest 解析与版本比较（`parsePluginManifest` 等，Plugin Runtime 与命令行从 SDK 取）动作、Agent、方法的声明检查（`inspectActionDeclarations` 等，kernel 注册时用）和逐行文本比较（`compareTexts` 等，工作台审查界面、Coding 与 Diff 从 SDK 取；结果与行的类型留在合同包）以及动作的两个绑定函数（`bindPluginActionRoute`、`bindOwnerPluginAction`，失败按错误的 kind 答，合同包里的那张状态表随之删除）；W3-03 要从合同包搬出的三样会运行的东西都已在 SDK 里；W3-02-C 又把这两个绑定函数从合同包搬了进来。
- Plugin 导入私有的界面包 `design-system`、`im-ui`、`ui-host`（`plugin-private-ui-dependency`，源码 import 与 `package.json` 依赖都查）。插件画界面用 SDK 公开的部件（`/ui` 的字符串部件、`/browser` 的 DOM 工具、`/page-globals` 的页面全局类型），外部作者装的也是这一套，内置插件不另走私有的路（2026-10-18「插件同等待遇」）。唯一在册的例外是 plugin-builder（创作台是平台能力，名单在 `packages/test-kit/src/boundaries.ts` 的 `PRIVATE_UI_EXEMPT_PLUGINS`，只许减少）。伙伴页面的舞台（Files、Git、Diff、Text Stats）不是公开部件，四个插件各自用公开部件写。
- App 导入另一个 App，列出的启动器边之外都拒绝（`app-dependency-not-allowed`）：产品根的启动器 → desktop / local-host / mcp，desktop → local-host，local-host → cli / mcp / workbench，`apps/server` → desktop / local-host。
- App Shell、CLI、MCP、Workbench 或 Desktop 直接写业务数据库。
- Horizontal Service 或平台产品服务（记忆、放置、搜索、情境排序）拥有或决定 Goal、Signal、Action、Session 等插件或 Module 的业务事实。
- 内核核心调用情境排序（核心文件导入它，或经入口转手导入它的名字）；情境排序做 I/O、持有模块级可变状态，或在代码里点名插件或能力 id（`pnpm health:check` 的 K1–K5，§6）。
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
7. `production`、`experimental`、`slice` 或 `absent` 成熟度（见 [`SSOT-MATRIX`](../SSOT-MATRIX.md) §2）；
8. 旧来源、剩余 caller 和移除条件。

已建的 package 要有真实实现：不注册假 Provider、假 Store、UI 入口或伪成功 API；还没建的目标只留在 SSOT 的 `absent` 行。独立 package 默认是 Monorepo 私有包；只有 Contracts、Plugin SDK 和必要 UI Extension 类型进入潜在公共发布面。

### 新增一个横向服务或平台服务

照这个顺序做；`horizontal/knowledge` 是最近的完整样例。

1. 目录 `horizontal/<名>/`，包名 `@molis-ai/molis-work-service-<名>`；合同放 `packages/contracts/src/services/<名>.ts`（公开 subpath）。
2. 在 `scripts/workspace-packages.mjs` 加一条 `entry(路径, 包名, "horizontal", 合同子路径, 迁移目标, 一句话, 不负责什么, 旧来源, 状态)`。归属由 `scripts/package-owners.mjs` 的规则算出：`node scripts/package-owners.mjs --write` 刷新 SSOT 的「归属」列与 `.github/CODEOWNERS`。
3. 包 README 写「开发要求」（写法见 `docs/system/DEVELOPMENT-REQUIREMENTS.md`），并在 `docs/horizontal/` 加手册。
4. 要给页面、工作流、Agent、MCP、插件用的，都写成动作：动作定义写 `audiences`；Host 的装配点是 `apps/local-host/src/<名>-actions.ts`，返回 `registration: { provider, definitions, handlers }`（样例 `knowledge-actions.ts`）。插件使用它，要在自己的 Manifest `capabilities.consumes` 里声明。
5. `pnpm build` 之后跑 `pnpm actions:update`（系统动作记在 `tooling/gates/actions/host-actions.tsv`），改了公开合同再跑 `pnpm api:update`，提交 `tooling/gates/`。
6. `node scripts/gates/package-inventory.mjs --table` 重新生成 `specs/repository-anti-corruption/spec.md` §5.1 的包清单行。
7. `pnpm boundary:check` 与 `node scripts/check-health-gates.mjs --base origin/main` 都要过。

## 5. Adapter 放置

不设顶层 `adapters/`：

- SQLite、Filesystem、Blob：`packages/storage/src/adapters/`
- PTY：`horizontal/runtime-host/src/adapters/`
- Tauri、Keychain、Updater：`apps/desktop/adapters/`
- GitHub、Gmail、RSS 等：对应 `plugins/official-integrations/<provider>/`

Adapter 只翻译 Port 与具体技术调用，不拥有业务事实。只有形成独立发布物或多个真实消费者的版本压力时，才升格为 package。

## 6. 自动门禁

F3 已建立自动门禁，覆盖：public entrypoint、禁止 deep import、Module/Plugin/App 依赖禁区、Contract 清单一致性、package 独立 typecheck/build、循环依赖、README/状态矩阵存在。门禁通过不等于功能实现完成；行为还需由对应垂直 Goal 的兼容与端到端测试证明。

本地使用：

```bash
pnpm boundary:test   # 用失败样例证明规则真的会拦截
pnpm boundary:check  # 扫描当前实际 workspace package
pnpm workspace:verify # 门禁 + 所有目标 package 的 build（每个包的 tsc 同时做类型检查，类型错误在这里就失败）
```

`.github/workflows/ci.yml` 在 pull request 和 `main` push 上把挡合并的检查分成四组并行的作业（各约 5 分钟），都在 `Verify` 的 `needs` 里：`gates`（不要构建）跑健康门禁（`health:check`，对照合并基点）、版本一致，以及文档门禁、翻译、包清单、vendored 记录、密钥扫描、探针与产品子集运行器、测试运行器自己的变异用例；`health-gate-rules`（只构建 contracts 包给一个门禁用例用）跑 `tests/health-gates-*.test.ts`，即健康门禁各条规则的变异用例，分在两个 runner 上（矩阵 `shard: [1, 2]`，每份取同一列表里隔一个的文件，`node scripts/run-tests.mjs --shard <k>/<n>`）；`architecture-boundaries` 跑同一条 `workspace:verify`，再在这次构建上跑页面资源预算（`page-assets:check`，宿主发出的样式表、脚本、插件客户端包与字体只许变小）、Goal 查询/存储边界、存储基线、发布资产、启动器类型检查、单一工作台外壳与成果门禁、炼金术士与创作台回放；`action-contracts` 自己构建，跑动作与插件合同（`pnpm test:contracts`），分在两个 runner 上、每个同时只跑 2 个文件：其中几个用例起真实宿主和 MCP 服务、自带时限，一个 4 核 runner 上同时跑 4 个时会超时。两个作业里一次点名多个文件的 `node scripts/run-tests.mjs` 都是几份同时跑、每份一个 `MOLIS_WORK_HOME`（`MOLIS_WORK_TEST_JOBS: 4`，见 [并行开发](PARALLEL-DEVELOPMENT.md) 第 5 节），上次用时长的先跑：各作业用 `actions/cache` 把运行器记下的用时带到下一次运行。安全不变量（`pnpm test:security`）是单独的 `security-invariants` 作业，暂不挡合并，不在 `Verify` 的 `needs` 里，所以不拖长必过检查。全量产品测试仍在本地跑（见 PR 模板），但这些定向行为回归和 package 边界检查持续执行；用户动线上的一部分产品用例由下面的 `product-subset` 作业在 Linux 上跑。

健康门禁里还有静态检查（Biome：空 `catch`、`as unknown as`、没处理的 promise、显式 `any`、`console`、`debugger`，按文件计数、只许减少，口径与按包开新规则见 `tooling/gates/README.md`「静态检查」）。非 TypeScript 的代码由两个作业查，都在 `Verify` 的 `needs` 里，不看数字、有告警就失败：`native-checks`（macOS：`apps/desktop` 的 `rustfmt --check`、`cargo clippy -D warnings` 与 `cargo test`，Rust 版本固定；Swift 的 `swiftc -typecheck`，`jelly-whisper` 包的 `swift build` 暂不挡合并，见 BL-122）和 `shell-checks`（Linux：被跟踪的 `.sh` 的 `shellcheck`，被跟踪的 `.py` 能解析）。脚本是 `scripts/gates/native-checks.mjs`，规则的测试是 `tests/native-checks.test.mjs`。

`ci.yml` 里另有一个不挡合并的 `linux-probe` 作业（依据 `specs/repository-anti-corruption` 决定 #14）：`continue-on-error: true`，不在 `Verify` 的 `needs` 里，分支保护不动。它只在每晚的定时运行（main，`schedule`，有自己的并发组，夜里的合并取消不到它）和手动触发（`workflow_dispatch`）时跑，PR 和推送上不跑（用户 2026-10-14 定：每次推送占一小时 runner 却不决定任何事，main 上又常被下一次合并取消）。它在 ubuntu 上先 `pnpm build`，再用 `scripts/ci-linux-probe.mjs` 把 `tests/` 下的非浏览器测试文件逐个跑一遍，记下哪些在 Linux 上通过：

- 每个文件经 `scripts/run-tests.mjs` 单独跑（环境和本地一样，每个文件一份新的 `MOLIS_WORK_HOME`），CI 里同时跑两个（`--jobs 2`）；失败的文件重跑一次（`--retries 1`），重跑通过的记为 `flaky`；每次尝试最多 10 分钟（`--timeout-seconds 600`），超时记 `timeout` 且不重跑；整体开始新文件的时间上限 85 分钟（`--budget-minutes 85`），剩下的记 `not-run`，作业本身硬上限 120 分钟（到点按取消处理，见下）。
- 每个文件按自己的源码（连同它引用的 `tests/` 下的辅助文件：沿着相对路径的 import 一路跟下去，测试里写的 `./fixtures/x.js` 指的是 `x.ts`，也跟）打标记。这是读文本的静态规则，看不到 `tests/` 以外的文件、拼出来的路径、测试起的子进程里发生的事，所以标记是线索不是证明。规则在 `scripts/ci-linux-probe/select.mjs`：`browser` 是文件名带 `.e2e.test.`，或出现 Chrome 的路径、调试端口，或引用 test-kit 的浏览器子路径 `@molis-ai/molis-work-test-kit/browser`（不跑，记 `excluded`）；`darwin` 是平台判断、Seatbelt、Keychain、launchctl、Swift 助手、`/Applications/` 这类 macOS 专有的路径与工具（照跑并标出，失败时先当作平台差异读）；`live` 是文件名带 `live`，或用 `MOLIS_WORK_LIVE_*` 这类真实模型、真实网络的开关（探针不把这些开关传给测试，所以文件里的 live 测试会跳过）。整个文件只有 live 测试的（如 `tests/prologue-node-live.test.ts`）记 `skipped`，不算通过；文件里还有别的测试在跑的（如 `tests/plugin-sandbox-network.test.ts`、`tests/agent-built-plugins-dependencies.test.ts`），没失败就是 `pass`，跳过的个数记在 `report.json` 的 `skipped`，摘要里列在「Passed with some tests skipped」下，仍进 `pass.txt`（通过的只是在 Linux 上真正跑到的那一部分）。
- 结果：`pass`（至少一个测试体跑过且没有失败，文件里跳过的测试只计数）、`flaky`、`skipped`（整个文件没有测试体运行）、`fail`、`timeout`、`not-run`（没有结果：时间上限用完、或这次运行被取消时还没出结果，包括当时正在跑的那个）、`excluded`。测试文件失败是数据，探针照常以 0 退出；退出 2 只表示探针自己跑不了（参数错、没选中文件、平台不是 `--expect-platform`）；被信号取消时退出 128 加信号号，部分报告已经写好。
- 写出三个文件，作为名为 `linux-probe` 的产物保留 30 天（上传步骤是 `if: always()`），摘要在运行结束时附到作业摘要里一次：`report.json`（每个文件的标记、计数、耗时、尝试次数和失败信息节选，`endedBy` 记这次怎么结束）、`pass.txt`（通过的文件，一行一个，将成为 W2-16 的 `tests/ci-product-subset.txt` 的底稿）、`summary.md`（没有 darwin 或 live 标记却失败的文件列在最前，那些先看）。
- 被取消也有结果。`ci.yml` 的 `concurrency` 是 `cancel-in-progress: true`（同一个 PR 或 `main` 上有更新的推送，正在跑的 CI 就被取消），作业到 `timeout-minutes` 也被停掉，约 100 分钟的运行常遇到这种事。所以三个文件在每个文件跑完后都重写一次（先写临时文件再改名，被杀在写的当口留下的是上一份完整的）；收到 SIGINT、SIGTERM、SIGHUP（取消和超时发的就是这些）时，探针先停掉正在跑的测试进程，写一份部分报告并附到作业摘要，再以 128 加信号号退出（130、143、129）；没出结果的文件记 `not-run`，`endedBy` 写信号名，摘要最上面写明「Incomplete」。被 `kill -9` 这类拦不住的方式杀掉时，留下最后一次逐文件报告（`endedBy: "running"`），没有作业摘要。部分报告只覆盖已跑到的文件（顺序固定，按文件名）；要完整的一份，等一次没被取消的运行，或手动触发（`workflow_dispatch`，选 `main` 以外的分支：并发组按分支，`main` 上的合并取消不到它）。

本地：`node scripts/ci-linux-probe.mjs --list` 只列选择和标记、什么都不跑；`--only <正则>` 限定文件。本机跑出来的结果不是 Linux 结果，摘要里会写明。规则的测试是 `tests/ci-linux-probe.test.ts`，在 CI 的 `gates` 作业里跑。探针本身一直只记录、不挡合并（全部非浏览器文件要跑约 50 分钟）；它第一次在 main 上的运行（run 37895261962）是产品子集清单的底稿，并入 `Verify` 的是下面的产品子集作业。


### 产品子集作业（W2-16，决定 #14）

`ci.yml` 的 `product-subset` 作业把用户动线上的产品用例放进 CI。依据同一个决定：先单独作为一个作业跑约两周，不挡合并（`continue-on-error: true`，不在 `Verify` 的 `needs` 里，作业名写着「not required yet」，分支保护不动）；这段时间里把不稳定的文件隔离掉，之后把它加进 `Verify` 的 `needs`。它在两个独立 ubuntu runner 上分别先 `pnpm build`，再用 `scripts/ci-product-subset.mjs` 把 `tests/ci-product-subset.txt` 里的文件逐个跑一遍。`--shard 1/2` 与 `--shard 2/2` 按清单序号分配，互斥且合起来覆盖完整清单；完整清单与隔离规则在分片之前校验，不要求单片再次包含全部冒烟。两个分片都必须通过才算完整子集通过，`fail-fast: false` 保留另一片的结果。逐个跑的做法和探针共用一份（`scripts/ci-linux-probe/run.mjs`：每个文件经 `scripts/run-tests.mjs` 单独跑，各有一份 `MOLIS_WORK_HOME`，非浏览器文件 4 个同时跑（`--jobs 4`，2026-10-14 从 2 提上来，趁作业还不挡合并看负载会不会让文件变得不稳定），失败的文件重跑一次，重跑通过的记 `flaky`，超时的杀掉整个进程组）；和探针不同，它有结论，会让作业变红。

- **清单** `tests/ci-product-subset.txt`：一行一个文件，`#` 开头是注释，开头那段注释写着取舍的规矩。第一版（377 个文件；`pnpm test:security` 进了阻塞作业之后，去掉与它重复的 11 个，再因 `CliAgentAdapter` 删除（W2-18 决定 1）去掉它的三个测试文件 `tests/cli-agent-adapter.test.ts`、`tests/cli-command-receipts.test.ts`、`tests/cli-node-process.test.ts`，剩 363 个）取自探针在 main 上的那次运行：在 Linux 上通过、没有 darwin 或 live 标记、不在阻塞作业里已经跑的合同与门禁用例之列（包括它经 `pnpm workspace:verify` 里的 `boundary:test`、`pnpm test:contracts` 这类脚本跑的）、当时用时不超过 5 秒的文件，加上各产品领域的主流程（每个当时不超过 60 秒）、`tests/i18n.test.ts`（W2-16 要求翻译测试进 CI）和 5 个浏览器冒烟。清单是产品用例里「快而稳、走用户动线」的那部分，不是全量；浏览器用例的全量、慢用例和 macOS 专有的用例仍在本机跑。
- **浏览器冒烟**：3 到 5 个（清单里被探针规则认作浏览器文件的就是冒烟），分别从新建项目、直接地址进工作台、Goal 页跟随外部改动、离开 Coding 会话回项目选择器、助理底栏收消息进去。先于其他文件跑，一次一个，不与别的测试争 CPU；每个有自己的时限（`--browser-timeout-seconds 240`）和一份整体预算（`--browser-budget-minutes 8`）。作业用 runner 镜像里的 Chrome，经 `MOLIS_WORK_TEST_CHROME` 指向一个加了 `--no-sandbox` 的包装脚本（内核限制非特权用户命名空间的 runner 上需要）。没有 Chrome 时冒烟全部跳过，而整个文件都跳过的算失败：什么也没验证过。冒烟在 Linux 上还没有跑过，作业的第一次运行就是验证。
- **时间预算**：每片其余文件 15 分钟（`--budget-minutes 15`），每个文件 180 秒；到点不再开始新文件，也不再重试失败的文件（重试是新的一次开始），没轮到的记 `not-run`，算失败（清单比预算长了：缩短清单，或在评审里调预算）；作业总上限 35 分钟，装得下最坏的情形：安装与构建约 2 分钟，冒烟预算 8 分钟加最后一个冒烟的一次尝试 4 分钟，其余文件预算 15 分钟加最长的一次尝试（隔离的冒烟排在最后，也是 4 分钟），共 33 分钟（`tests/ci-product-subset.test.ts` 里有一条断言按参数算这个数）。原定目标是作业和当时的 `architecture-boundaries`（约 20 分钟）一样长；挡合并的检查拆成几组并行作业后约 5 分钟，这个作业约 15 分钟，并入 `Verify` 时会成为最长的一个（并入前要先缩短，见 [并行开发](PARALLEL-DEVELOPMENT.md) 第 5 节）。摘要里列出各阶段用了多少、最慢的文件。
- **结论**：被计入的文件里有失败、超时、整个文件都跳过、或没轮到的，退出 1；`flaky`（重跑通过）不算失败，在摘要里单列并附一条可贴的隔离条目，重跑时整个文件都跳过的不算重跑通过，文件仍记为失败；退出 2 是起不来（参数、平台不是 `--expect-platform`、清单或隔离文件违反规则、隔离项的 `since` 比当天晚一天以上）；被信号取消时退出 128 加信号号，先停掉正在跑的测试、写一份部分报告并附到作业摘要（和探针一样；`report.json`、`summary.md` 分别作为名为 `product-subset-1`、`product-subset-2` 的产物保留 30 天）。
- **隔离名单** `tests/quarantine.json`（`{ "entries": [...] }`）：不稳定的文件记一条，写 `file`、`owner`（`.github/CODEOWNERS` 里的账号）、`since`、`expires`、`reason`。被隔离的文件仍在清单里，仍然会被跑（排在计入的文件之后，用剩下的预算，不重试），结果显示在摘要里，但不计入结论；不跳过、不放宽任何断言，本机全量和探针也照跑。`expires` 当天仍有效，过了那天文件自动重新计入，摘要里单列「Quarantine ended」；到期日不能超过 `since` 之后 30 天，而 `since` 不能比运行当天晚（晚一天以内按时区放过，更晚的运行器退出 2、什么也不跑），所以不能靠把日期写到将来来拉长。续期只有一种办法：把 `since` 改成较新的日期，那是对一个看得见的文件的改动，要过评审；规则分不出它和新开一条隔离的区别。要么修好，要么在评审里把它从清单拿掉。最多 10 条，且仍计入的冒烟不少于 3 个。
- **规则的检查**：清单和隔离文件的规则（行格式、文件存在、不重复、不含 live 与 macOS 专有的文件、冒烟 3 到 5 个、i18n 测试在内、隔离项的字段、账号、日期、30 天、条数）在 `scripts/ci-product-subset/plan.mjs`，运行器和 `pnpm health:check` 读同一份（`scripts/gates/product-subset.mjs`，没有基线，出一处就失败）。这些规则随挡合并的 `gates` 作业检查，所以现在就挡合并，作业本身不挡：清单里的用例重命名、删除，或被加上 macOS 专有、live 的用法，要在同一个 PR 里改清单（W2-16 实现时加的，决定 #14 说的是作业不挡合并；记在 spec §1 同一行）。要日期才能判断的两条（隔离到期、`since` 不在将来）不在门禁里，由运行器按当天日期判断。「清单里没有阻塞作业已经跑的用例」这一条由 `tests/ci-product-subset-plan.test.ts` 查：读 `ci.yml` 里阻塞作业（`verify` 的 `needs`）各步点名的测试文件，和这些步骤经 `pnpm <脚本>` 走到的根 `package.json` 脚本点名的（一层层往下跟，`pnpm --filter` 的包脚本不算）；某个脚本文件自己再启动的测试看不到，那种情形要在清单头部的取舍里手工核对。变异用例是 `tests/ci-product-subset-plan.test.ts`（这些规则）和 `tests/ci-product-subset.test.ts`（运行器的每种结果、两份预算、隔离到期、阶段顺序、取消、拒绝启动、`ci.yml` 里这个作业的形状），都在 `gates` 作业里跑。
- **PR 上只跑改动碰到的文件**（T-130，2026-10-29，CI 拥堵时统筹定）：
  - 怎么挑：pull request 上先跑一个不装依赖的小作业 `test-selection`（`scripts/ci-test-selection.mjs`）。它用 `scripts/affected-tests.mjs --base HEAD^1 --json --wide` 选出改动碰到的用例，取其中在本清单里的文件，交给运行器的 `--only`。隔离的文件被选中了照样跑、照样不计。
  - 起几片：选中的不超过一片的量（冒烟单独算）就只起一片；一个都没选中就跳过作业。
  - 什么时候整套跑：`affected-tests` 建议全量；有改动的源码文件没有用例读；改了作业赖以运行的文件（清单、隔离文件、运行器、`ci.yml`、根 `package.json`、锁文件、`skills/`、`vendor/` 等）或挑选与运行器加载的文件（`affected-tests`、`package-dev-requirements.mjs`、`scripts/ci-linux-probe/`、`machine-slot.mjs`、清单的读法；用例顺着 import 找，漏一个就红）；`affected-tests` 的回答缺了 `tests`、`full`、`changes`、`uncovered` 中任何一项；挑选本身出任何错。两个作业只在 `test-selection` 成功时读它的输出（`if`、几片、文件名单都看 `needs.test-selection.result`）：跳过、失败、取消时，就算它已经写了一半输出，也按整张清单两片跑。
  - 其他事件：push main、每晚和手动运行不挑，照旧整张清单两片；合并队列照旧不跑。
  - `security-invariants` 作业按同一个办法挑 `test:security` 的文件。
  - 规则钉在 `tests/ci-test-selection.test.ts`（`gates` 作业里跑）。
  - 并入 `Verify` 时，要另定 PR 上被跳过怎么算。
- **本机**：`node scripts/ci-product-subset.mjs --list` 只列会跑什么、哪些被隔离、哪些已到期，什么也不跑；`--only <正则>` 限定文件，可以在本机试一两个文件（本机的结果不是 Linux 结果，摘要里会写明）。
- **并入 `Verify`**（约两周后，隔离完不稳定的文件）：把 `product-subset` 加进 `verify` 作业的 `needs` 和它最后一步的检查，去掉 `continue-on-error` 和作业名里的「not required yet」，改 `tests/ci-product-subset.test.ts` 里钉住现状的那一条。必需检查仍然只有 `Verify`，名字与分支保护都不变。

门禁由两层组成：

- `packages/test-kit` 的根入口提供纯规则：输入“谁在 import 谁”，返回具体违规；不读取数据库，也不复制业务判断。子路径 `/browser` 是与业务无关的无头 Chrome 驱动（找 Chrome、启动与关闭、DevTools 命令、页内等待与点击），只用 Node 内置的 `WebSocket` 与 `node:child_process` 等内置模块；产品选择器与产品诊断留在 `tests/fixtures/`（`goal-browser.ts`、`plugin-builder-browser.ts`），在它之上加。子路径 `/local-host-http` 是访问本机 Host HTTP 管理接口的客户端（闸门要的请求头、被拒绝的状态与代码，授权、撤权、建项目、装插件，一组授权按声明的依赖排序），只用 Node 内置的 `fetch` 与 `node:crypto`，类型只来自合同包的 `platform/actions`；宿主装配（`serveTestHost`、`openTestHome`）留在 `tests/fixtures/test-home.ts`，在它之上加。例外名单 `APP_IMPORT_ALLOWLIST`、`PLUGIN_MODULE_IMPORT_ALLOWLIST`（`packages/test-kit/src/boundaries.ts`）按包路径记边，只许减少，`packages/test-kit/tests/boundaries.test.mjs` 把它们逐项钉死；`unusedLayerExceptions` 找出名单里没有被用到的边。
- `scripts/check-package-boundaries.mjs` 读取 workspace manifest 与源码 import，把实际仓库信息交给纯规则，并检查依赖环和 Contract/README 清单。它记下每个 import 和 manifest 依赖实际有的边，名单里列了而仓库里没有任何 import 或依赖用到的边会报 `layer-exception-unused`：一条已经不存在的边不会留在名单里等着悄悄回来。 它里面「某个文件必须包含某段文字」的检查（Goals、Governance、Artifacts、Private Work Context、Runtime Host 几段，以及 Feed 与 Integration 段、Goals 的路由挂载检查、提案界面检查与「这个贡献登记了没有」，写法见脚本里 `hasInCode`、`hasInText`、`hasImportFrom`、`matchesStatementInCode` 的说明）先去掉注释再判断：名称与语法写法还要去掉字符串、正则和模板文字，错误码、测试标题、SQL 这类本身就是文字的只去掉注释和正则，`from "…"` 必须是一条真的 import 语句；带引号路径的 import 写法（工作台登记）要求这条语句从代码开始；内置插件目录的 `contributions` 也只在去掉注释和字符串之后读；一段注释或字符串不再能顶替代码。「不许登记」的那一处（`mentionsWorkbenchUiContribution`）仍读原文，不变松。这些检查不看那段文字是不是用在该用的位置，也不跟别名。回归：`tests/package-boundary-must-contain.test.mjs`。

结构数字另由 `pnpm health:check` 对照 merge-base 只许减少（模块在 `scripts/gates/`，测试 `tests/health-gates-structure.test.ts`，规则与取数口径见各模块文件头）：

| 数字 | 量什么 | 为什么 |
| --- | --- | --- |
| `contractsPurity` | `packages/contracts/src` 里：定时器与 `AbortController`/`fetch`/`process`/`globalThis`，`Date.now()`、`new Date()`、`Math.random()`；Node 内置模块导入；模块级可变状态——`let`/`var`、`new Map/Set/WeakMap/WeakSet`，以及同一文件里被写入的模块级对象或数组字面量（成员赋值、`++`/`--`、`delete`、`push` 一类修改数组的方法、`Object.assign` 等；`as const` 和 `Readonly…` 类型的不算）；字面 HTTP 状态码；20 行以上的函数，不管写成声明、变量里的箭头或函数表达式、类和对象字面量的方法/访问器/构造函数/函数属性，还是交给某个调用的回调（逐个记行数，名字如 `validators.validateThing`；嵌套在别的函数里的算在外层里，匿名的按出现顺序叫 `<anonymous#N>`） | 合同包只放类型、Schema 与无副作用的小函数（N-11）；现有的运行时代码是基线，搬到所有者那里（W3-03）后数字下降 |
| `hostEntryExports` | `apps/local-host/src/index.ts` 的 `export *` 个数 | 宿主入口过宽，每个新 helper 都变成公开面（N-11） |
| `moduleRepositoryExports` | 各 Module 入口（`src/index.ts`）导出的 `…Repository`/`…Store` 名字，和导出的类、接口上公开的 `repository` 成员；顺着 `export *`、`export {…} from`、对 import 的 `export {…}` 找到声明，命名空间再导出（`export * as ns from "./x.js"`，或 `import * as ns` 后 `export { ns }`）里的每个名字按 `ns.<名>` 记（嵌套按 `a.b.<名>`）。没有追的：别名声明（`export const repo = GoalsRepository`、`export type R = GoalsRepository`）和把命名空间包进对象（`export const api = { ns }`），靠评审。Module 指 `scripts/workspace-packages.mjs` 里 `kind` 为 `module` 的包（`modules/*` 和 `server`），另加任何 `modules/<名>` 目录；对照 merge-base 时两边都读这份清单 | Repository 仅内部可见（§3）；去掉导出是下一步，这一步先不让它变多 |
| `typedCapabilities` | 按文件三项：①对 `HostCapabilityDefinition` 和包装它的类型别名的引用（别名由扫描仓库发现，R8 删除前是 `HostMethodCapability`，含 `import { 别名 as 本地名 }`；只读取定义类型的 `HostCapabilityInput` 一类不算）；②没有 `action` 的描述符字面量（转成上述类型的；同时带 `capability_id`、`version`、`operation` 的任何字面量，不管有没有转型；以及展开一个基础描述符、又给 `capability_id` 一个字符串字面量新 id 的，如 `{ ...base, capability_id: "x.y.v1" }`）；③typed 注册调用：`registerCapability(…)`；对“注册型”接收者的 `.register(…)` 或 `["register"](…)`——接收者在本文件里声明为注册型类型（`LocalHost`、`CapabilityRegistry`、Agent 与 Schedule 的 registrar 等：凡有一个 `register`/`registerCapability` 方法且第一个参数是 typed 定义的类或接口，也由扫描发现）、用 `new` 造出、是这类接收者的 `typeof`，或经一个声明了返回类型为注册型的函数取得（`getHost().register(…)`，本文件里的或导出的）；对这类接收者的 `register` 的非调用引用（`.bind(host)`、`.call(…)`、`.apply(…)`、`const add = host.register`、`const { register } = host`、`list.forEach(host.register)`，每处记一次，绑定出的名字再按下一条追）；调用第一个参数是 typed 定义的函数（本文件里的，如 `horizontal/agent-host/src/capability-registration.ts` 的局部 `register` 助手，它有 40 多处调用；或别的文件导出的，含 import 改名）；调用把自己的第一个参数原样交给上述任一种注册的本地函数（不论参数类型，逐层追到不再增加）；以及名为 `register`/`registerCapability` 的调用，第一个参数是内联的描述符字面量（有 `capability_id`，有 `operation` 或展开，无 `action`），不管接收者是什么类型 | 2026-10-07 N-12 决定：对外的只走动作，不再新增 typed 条目；R8「删 typed 通道」删掉了定义类型、注册口与插件的 `services.capabilities`，三项现在都是 0。三项里任何一项变多都会失败，所以新的 typed 描述符（用类型名或别名）、新的注册点、新写出这些的文件都放不过；已有的 typed 能力被调用不在其内（见下面「看不到的」） |
| `layerExceptions` | `APP_IMPORT_ALLOWLIST`、`PLUGIN_MODULE_IMPORT_ALLOWLIST` 里的条目，一条边一条记录 | 名单和钉死它的测试可以在同一个 PR 里一起改；这里对照 merge-base，新增条目放不过，只能删。名单读不出来时也失败（合入前的 merge-base 还没有这两个名单，那一次不比）：读得出来指两个名单各是一个同名变量，初值是只含字符串字面量的数组；改名、挪走，或往里放展开（`...EXTRA_EDGES`）、标识符、函数调用、带替换的模板，都算读不出来 |
| `hostPluginFiles`、`registerProviderSites` | 宿主里以内置插件命名的 `<插件>-actions.ts`、`<插件>-native-plugin-http.ts`；`apps/local-host/src` 里每个文件的 `registerProvider(` 调用 | 构建期装配路径冻结（AGENTS.md）；名单测试 `tests/builtin-plugin-assembly-gate.test.ts` 之外，这里对照 merge-base，改名单放不过 |
| `hybridPlugins` | 已由 Plugin Runtime 启动、宿主却还有同名文件或手工 `registerProvider(<插件>…Provider(…))` 的插件（现在：shelf、coding、git），报告里标出 | 混合装配既不是 Runtime 形状也不是冻结的构建期形状，名单看不出来。Characters 按 2026-10-08 决定第 26 项并进了宿主和 `modules/characters`，不再是 Runtime 插件（CHR-1，2026-10-22），名单里没有它了 |
| `pluginOutsideMentions` | 每个内置插件的包名在它自己的包之外出现在多少个源码或配置文件里（import、`package.json` 依赖、工作区清单） | 加一个插件除了它自己的包还要改几处。新插件的额度是 0（W5-02 PR-C，统筹 10-23 定）：生成器写的两份文件不算，两个应用与根的 `package.json` 只在插件依赖正好等于生成文件 import 的那一组（根是两份的并集）时不算 |

安装生命周期和发布类型这条链沿用 `apps/local-host/src/installed-plugin-host.ts` 作为创作台类型接缝：由它 `export type` 转出 `AgentBuilderPorts`、`AgentRelease`，`installed-plugin-lifecycle.ts`、`installed-plugin-version.ts`、`installed-release.ts` 再以 `import type` 取得所需类型，不增加运行时依赖。这一约定只限定上述类型链；其他创作台调用方和私路的后续处理见[特权清单](../../specs/repository-anti-corruption/privileges.md)。不得为压低 `pluginOutsideMentions` 数字，借该接缝加入新的运行时依赖。

这些数字**看不到**的（没有类型检查器和跨文件数据流，靠评审；每个模块的文件头写得更细）：

- 所有结构数字按文件记录，只扫 `apps`、`horizontal`、`modules`、`packages`、`plugins`、`server`、`tooling` 下的 `.ts`/`.mts` 源码，不含声明文件、`dist/`、`node_modules/`、`tests/` 目录和 `*.test.ts`；`tests/` 之外的 `fixtures/` 目录会扫，生产代码躲不进名叫 fixtures 的目录。**拆文件会红**：把带记录的文件拆成两个，只有 git 认作改名的那一半带着记录走，另一半里搬来的条目算新增。W2/W3 里拆 `apps/local-host/src/project-capabilities.ts`（49 处注册）这类文件的重构，要么让带记录的那部分留在被判为改名的文件里，要么在同一个 PR 里改门禁（过评审）。
- `typedCapabilities`：只数定义和注册，不数使用者。R8 删掉 typed 通道后已经没有 typed 能力可调（`host.invoke(…)` 只收动作定义）；规则留着，防的是定义、注册口回来。新文件里这样的调用若同时按包名点名了插件，由 `pluginOutsideMentions` 拦。也看不到：展开基础描述符、又没写字符串字面量 id（`{ ...base, capability_id: id }`），并经一个在本文件里没写出类型名的接收者（或只是别处导入的某物的 `typeof`）按变量注册；`host[name](…)` 这类计算键、`Reflect.apply(host.register, …)`、放在数组或 Map 里的 registrar、解构出来的参数（`({ register }) => register(…)`）；另一个文件里的、第一个参数没有类型的包装函数；签名里没写返回类型的注册型函数。
- `contractsPurity`：看不到经别名写入的字面量（`const alias = cache; alias.x = 1`）、交给别的函数去写（`fill(cache)`）、被别的文件导入后写入；函数里只要声明了与模块级字面量同名的局部，整个函数跳过这项检查；类的静态字段和闭包里的状态（`const counter = makeCounter()`）；经对象取的全局（`window.setTimeout`、`self.fetch`）；名字不像状态码的变量里的字面状态码（`const code = 404`）。
- `moduleRepositoryExports`：别名声明和把命名空间包进对象，见上表该行。
- `pluginOutsideMentions` 数的是包名字符串出现在多少个文件里；用相对路径指到另一个插件源码的 import 不在其内（那条路径由 `pnpm boundary:check` 的 import 规则管）。

内核的两半（`scripts/gates/kernel-contextual.mjs`，W3-04，测试 `tests/health-gates-kernel-contextual.test.ts`）不是数字，而是没有基线的规则，出现一处就失败，和 `tableOwnerProblems`、`domEventProblems` 同类：

| 规则 | 查什么 | 为什么 |
| --- | --- | --- |
| K1 | 核心文件（`packages/kernel/src` 里不是 `contextual.ts` 或 `contextual/` 的文件）不导入、不转出、不动态加载情境排序，也不从别的核心文件取它转出的名字；包入口也不转出它：情境排序走自己的子入口 `@molis-ai/molis-work-kernel/contextual`（`export *` 一律不许） | 核心保留目录、分发、可用性，不调用产品策略；加载核心的导入闭包里没有情境排序 |
| K2 | 内核里只有情境排序读 `contracts/services/*`，且只读 `services/contextual` | 把本文 §1 的规则落到内核，例外写在一处 |
| K3 | 情境排序的包导入只能是 `contracts/platform/actions`、`contracts/services/contextual`、`node:crypto`；相对导入可指向内核里的任何文件，但不能出 `packages/kernel/src`，也不能指向 `index.ts` | 不读 storage、agent-host、其他 Node 内置模块：I/O 留在宿主 |
| K4 | 情境排序按 `contracts-purity.mjs` 的口径数：副作用与模块级可变状态都是 0 | 同样输入同样陈列；缓存、计时、取消、模型调用留在宿主 |
| K5 | 情境排序和 `subject-offer-choices.ts` 里没有形如能力 id 的小写带点字符串、以 `io.molis.work.` 开头的字符串和插件包名；只豁免内核自己的错误码（`new ActionError(…)` 的第一个参数、`code:` 的值） | 基本合同 C1「注册一次」的**部分**守卫：候选只从目录来 |

按目录认文件：把 `contextual.ts` 拆成 `contextual/*.ts` 不用改规则；新增的核心文件情境排序可以直接导入。看不到的：拼出来的能力 id（`"pages" + ".discard"`）、不带点的前缀比较、从合同包导入的能力 id 常量、动态拼出的模块名（核心里的不报，情境排序里的会报）、不经 import 的依赖。新的合同子路径要加进 `CONTEXTUAL_PACKAGES`，那是一次有意的评审。

typed 条目的新增、Repository 导出的新增、宿主入口的变宽、合同包里新副作用的出现、层间例外的新增，都不是加数字能放过的事：改动门禁本身要过评审。

旧根 `src/` 与 0.1.x 的根 SDK 都已退出产品实现，根包 `@molis-ai/molis-work` 只发布命令行入口，不导出代码。`pnpm boundary:check` 拒绝任何根目录 `src/`（不再有兼容白名单）；各包的大文件由 `pnpm health:check` 的巨大单元门禁只许变小。

Goals 的十四个 typed 桥已删除；`checkNoGoalTypedAdapters` 用 AST 拒绝它们的名称、literal 与旧模块重新进入生产定义、注册、导出和调用。`tests/goals-query-boundaries.test.mjs` 注入别名、动态引用和拼接 literal 验门禁；`tests/typed-registry-inventory.test.ts` 核实际 Host 剩余宿主内注册和 Goals 动作目录。CLI 与管理 MCP 经宿主造的管理调用者调用 Goals 动作（Host 私有 `bindGoalsManagementActions`，`actionClient(reference, false)`；MCP 只接管理动作端口或 null）。门禁 `checkGoalTransportCallers` 用 AST 核对实际动作调用与 Host 装配，并以 mutation 拒绝 typed/domain 路线、Runtime 获得管理端口、提前准备插件或丢失原库身份预打开。Host 只对未登记到当前 Home 的项目保留原 `client(reference).withScope(() => undefined)` 空 scope；已登记项目从目录取得原路径与项目身份，避免转发进程先打开项目，Apps MCP 不持有客户端，标准 MCP 按 Action 目录发现，不要求恢复已退出的旧 MCP snapshot 分支。它们仍不得越过 Host 直接读写领域 owner。2026-10-07 的 N-12 决定是对外只走动作、没有生产调用方的 Goals typed 桥要删（W2-08、W3-07 做），在此之前 `typedCapabilities` 只许减少，不许新增。

Repository 仅内部可见是目标约束；当前 Goals/Artifacts 等 public entrypoint 仍导出构造类型，尚待将 Host 装配与普通消费者接口分清。`moduleRepositoryExports` 把现有导出冻结住，只许减少。不能将现有导出视为任意调用 Store 的许可，也不能通过删除此约束宣称边界已完成收口。
