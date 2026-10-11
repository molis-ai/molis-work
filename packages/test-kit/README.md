# 工作区测试工具

两件与业务无关的事：帮助维护者发现深层导入、跨 owner 实现依赖和依赖环，保护重组后的模块边界；给浏览器用例一套找 Chrome、启动、驱动 DevTools 的公共代码。

包名：`@molis-ai/molis-work-test-kit`。工作区内部包，只给测试和仓库脚本用，生产代码不依赖它（`production-test-kit-dependency` 规则会拦）。

## 一次典型调用

边界规则：脚本收集源码 import 与包清单，交给 evaluateImportBoundary；extractImportSpecifiers 提取导入，findDependencyCycles 查找依赖环。仓库级扫描入口是 scripts/check-package-boundaries.mjs。

浏览器：`ChromeHarness.start(目录, 选项)` 用 `locateTestChrome()` 找 Chrome（环境变量 `MOLIS_WORK_TEST_CHROME` 优先，CI 用它指路），启动无头 Chrome 并连上 DevTools；找不到 Chrome 返回 `null`，由调用方写自己的跳过文案。`harness.page()` 得到一页 `ChromePage`，用 `evaluate`、`wait`、`click`、`fill`、`viewport`、`screenshot`；`command`、`on`、`event` 是协议层。超时、等待的时限和失败时附带的页面状态（`describe`）都是参数，各用例按自己的需要带上，包里不出现任何产品选择器。用例结束时 `await harness.close()`。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/boundaries.ts](src/boundaries.ts) | 导入边界与依赖环规则（含层与层之间的方向：Module 不向上依赖 Horizontal、Plugin、App；Plugin 不依赖 App、Horizontal、Module 实现包（合同包不算）；App 之间只有登记的边；例外名单按包路径记，只许减少，`unusedLayerExceptions` 找出仓库里已经没有的边） |
| [src/index.ts](src/index.ts) | 公开检查 API |
| [src/browser/locate.ts](src/browser/locate.ts) | `locateTestChrome`：环境变量与固定位置的查找顺序 |
| [src/browser/launch.ts](src/browser/launch.ts) | `launchHeadlessChrome`：标准启动参数（全部列在下面「开发要求」的不变量里）、读调试地址、等 `exit` 的关闭（超时 SIGKILL） |
| [src/browser/cdp.ts](src/browser/cdp.ts) | `ChromeHarness`：命令、持续监听与一次性事件、超时信息 |
| [src/browser/page.ts](src/browser/page.ts) | `ChromePage`：页内等待、点击、填写、视口、截图 |
| [tests](tests) | 规则回归 |

可对照现有调用方 [scripts/check-package-boundaries.mjs](../../scripts/check-package-boundaries.mjs) 阅读装配方式。

## 接入与边界

本包提供与业务无关的检查规则和浏览器驱动，不替代模块测试、浏览器验收或数据迁移验证。新增边界规则应同时提供允许/拒绝案例，避免仅检查固定文件数量。

浏览器驱动只用 Node 24 自带的 `WebSocket`（连 DevTools）和 `node:child_process`（起 Chrome）等内置模块，不加依赖；`@molis-ai/molis-work-test-kit` 根入口保持纯规则（`scripts/check-package-boundaries.mjs` 导入它），Chrome 相关代码只在子路径 `/browser`。需要产品选择器、产品诊断的夹具留在 `tests/fixtures/`，在这里的 `ChromeHarness` 之上加（例如 `tests/fixtures/goal-browser.ts`、`tests/fixtures/plugin-builder-browser.ts`）。

用 test-kit 浏览器代码的用例会被 Linux 探针标成浏览器用例（`scripts/ci-linux-probe/select.mjs` 的 `RULES.browser.text` 认包名 `molis-work-test-kit/browser`），不在探针里跑。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-test-kit typecheck
pnpm --filter @molis-ai/molis-work-test-kit build
```

```bash
pnpm boundary:check
pnpm boundary:test
```

边界检查会扫描实际工作区源码；规则测试覆盖允许导入、拒绝导入和循环依赖。

## 开发要求

- 负责：导入边界规则；与业务无关的无头 Chrome 启动与 DevTools 驱动（子路径 `/browser`）。确定性时钟、假能力、临时存储目前不在这里，仍在各测试里。
- 不负责：属于某个 Module 的业务夹具、规则或断言；任何产品选择器；宿主、授权与项目的装配（那在 `tests/fixtures/`）。
- 公开入口：`@molis-ai/molis-work-test-kit`（`src/index.ts`）与 `@molis-ai/molis-work-test-kit/browser`（`src/browser/index.ts`），都经 `dist` 导出，不深入 `src/` 导入；合同 `@molis-ai/molis-work-contracts/platform/testing`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 规则与业务无关，不替代模块测试、浏览器验收或迁移验证。
  - 新增边界规则同时提供允许与拒绝案例，不靠检查固定文件数量。
  - 浏览器驱动的每个超时与诊断都是参数；用例原来的时限和失败信息靠参数保留，不在这里改默认值来迁就某个用例。
  - 关闭只等主进程的 `exit`，不等 `close`（Chrome 的辅助进程会继承 stderr，等 `close` 可能不返回）。
  - 经 `launchHeadlessChrome`（`ChromeHarness.start` 也走它）启动的浏览器，标准启动参数只有这一套，每一个都带（`STANDARD_ARGS`，包自己的测试核对这一行与代码一致）：`--headless=new`、`--lang=zh-CN`、`--accept-lang=zh-CN`、`--disable-gpu`、`--disable-background-networking`、`--disable-component-update`、`--disable-extensions`、`--disable-background-timer-throttling`、`--disable-renderer-backgrounding`、`--disable-backgrounding-occluded-windows`、`--no-first-run`、`--no-default-browser-check`、`--remote-debugging-port=0`，另加每次启动一个新的用户数据目录。其中 `throttling`、`renderer-backgrounding`、`backgrounding-occluded-windows` 三个参数让后台或被遮挡的页面不降频、不降优先级，所以经它启动的页面按前台节奏跑。不经它的浏览器（自己 `spawn` Chrome 直接取页面 DOM 的用例、产品的内置浏览器）另有各自的参数，不在这一套之内。`extraArgs` 排在标准参数之后，只能追加、去不掉其中任何一个；某个用例要别的参数就放进 `extraArgs`，不要为它另写启动器。改这一套等于改所有用 `/browser` 的用例的运行条件，要重跑「改动后必跑」里的浏览器用例。
  - 不依赖任何包以外的运行库；不 import 宿主、模块、横向服务或插件。
  - 本包自己的测试用 `pnpm --filter @molis-ai/molis-work-test-kit test`。
- 改动后必跑：`node scripts/run-tests.mjs tests/import-boundary-template.test.ts tests/workbench-registration-boundaries.test.mjs tests/health-gates-structure.test.ts tests/ci-linux-probe.test.ts`，和包自己的 `pnpm --filter @molis-ai/molis-work-test-kit test`（例外名单的条目另由健康门禁对照 merge-base 只许减少）；改了 `/browser` 的，再加跑（需要本机 Chrome，在排好的浏览器时段里）`tests/ci-product-subset.txt` 里的 5 个浏览器冒烟、`tests/artifact-clipboard.e2e.test.ts`、`tests/shelf-client-boundaries.e2e.test.ts`、`tests/functions-draft-retention.test.ts`、`tests/agent-studio.e2e.test.ts`
- 相关手册：[docs/platform/CONTRACTS-AND-OPERATIONS.md](../../docs/platform/CONTRACTS-AND-OPERATIONS.md)、[docs/system/PACKAGE-BOUNDARIES.md](../../docs/system/PACKAGE-BOUNDARIES.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/system/PACKAGE-BOUNDARIES.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/testing`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-f3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
