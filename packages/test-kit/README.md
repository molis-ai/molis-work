# 工作区测试工具

三件与业务无关的事：帮助维护者发现深层导入、跨 owner 实现依赖和依赖环，保护重组后的模块边界；给浏览器用例一套找 Chrome、启动、驱动 DevTools 的公共代码；给宿主用例一个访问本机 Host HTTP 管理接口的客户端，用例像人在设置页那样建项目、给 MCP 客户端授权，而不是直接改授权文件。

包名：`@molis-ai/molis-work-test-kit`。工作区内部包，只给测试和仓库脚本用，生产代码不依赖它（`production-test-kit-dependency` 规则会拦）。

## 一次典型调用

边界规则：脚本收集源码 import 与包清单，交给 evaluateImportBoundary；extractImportSpecifiers 提取导入，findDependencyCycles 查找依赖环。仓库级扫描入口是 scripts/check-package-boundaries.mjs。

浏览器：`ChromeHarness.start(目录, 选项)` 用 `locateTestChrome()` 找 Chrome（环境变量 `MOLIS_WORK_TEST_CHROME` 优先，CI 用它指路），启动无头 Chrome 并连上 DevTools；找不到 Chrome 返回 `null`，由调用方写自己的跳过文案。`harness.page()` 得到一页 `ChromePage`，用 `evaluate`、`wait`、`click`、`fill`、`viewport`、`screenshot`；`command`、`on`、`event` 是协议层。超时、等待的时限和失败时附带的页面状态（`describe`）都是参数，各用例按自己的需要带上，包里不出现任何产品选择器。用例结束时 `await harness.close()`。

本机 Host HTTP：`new LocalHostHttpClient({ origin, controlToken })` 带上 Host 的闸门要的一切（自己的 origin、JSON、Home 的控制令牌、每次一个新的一次性键；读请求什么都不带），被拒绝时抛 `LocalHostHttpError`（`localHostHttpError` 造、`isLocalHostHttpError` 认；带 `status`、`code`、Host 自己的话）。在它之上，`grantMcpAction`/`revokeMcpAction` 走「对外接入」页用的授权接口，`grantMcpActions` 按依赖顺序（`orderGrantViews`：先 `required_actions`，再需要消费场景绑定的）一个个授权，遇到 Host 的拒绝就停下并说出是哪一项；`createProject`、`addProjectPlugin` 走项目设置；`readMcpActionAccess` 读客户端在一个范围里能看到、已授权的。这些都是 Host 自己的检查：不可用的能力、只给人的能力、不在目录里的项目、缺依赖，在用例里和在产品里一样被拒绝。客户端在创建时留住当时的 `fetch`，用例之后替换 `globalThis.fetch` 去冒充上游服务，不会拦到它发给 Host 的请求。装配（临时 Home、`MolisWorkLocalHost`、`createMolisWorkWebServer`、网关客户端）不在这里，在 `tests/fixtures/test-home.ts`。

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
| [src/local-host-http/client.ts](src/local-host-http/client.ts) | `LocalHostHttpClient`、`LocalHostHttpError`（带 `status`、`code` 的普通 `Error`，`localHostHttpError` 造、`isLocalHostHttpError` 认）：闸门要的请求头、被拒绝的状态与代码 |
| [src/local-host-http/management.ts](src/local-host-http/management.ts) | 授权、撤权、读接入、建项目、装插件；每条路由串旁边写着它的主人文件 |
| [src/local-host-http/order.ts](src/local-host-http/order.ts) | `orderGrantViews`：一组授权的顺序，同一个视图出现多次只取一次，有环就在发出前抛错 |
| [tests](tests) | 规则回归 |

可对照现有调用方 [scripts/check-package-boundaries.mjs](../../scripts/check-package-boundaries.mjs) 阅读装配方式。

## 接入与边界

本包提供与业务无关的检查规则和浏览器驱动，不替代模块测试、浏览器验收或数据迁移验证。新增边界规则应同时提供允许/拒绝案例，避免仅检查固定文件数量。

CDP 命令超时的 `Error.cause` 仅记录等待期间的 `nodeCpuMs`、`eventLoopActiveMs`、`eventLoopIdleMs`，辅助区分本 Node 进程繁忙与等待对端。数字不是 Chrome CPU 或响应到达时间，不能单独作为根因。原期限、失败消息与调用栈保留；不发送诊断 CDP 请求。

超时的错误还在 `error.diagnostics`（不在 `cause` 里，`cause` 仍只有上面三个键）里带上等待期间的两样东西：`chromeMessages` 是这期间本进程已处理的 CDP 消息条数（只数已处理的，看不出发送端积压），`chromeTopMethods` 是最多的三种方法。打开 `ChromeConnectOptions.profileTimeouts`（默认关）时另带 `nodeSelfTime`：主线程自耗时最高的几种函数，名字与脚本 URL 已截断，URL 去掉查询串与 fragment，不倾倒 profile、事件参数或回复。没有超时的命令不写诊断；`close()` 会停掉采样。采样每 10 毫秒一个样本，所以每个函数的时间是估计；采样段每 20 秒轮转一次，轮转回调同样会被主线程忙推迟，通常把分配控制在一个段内，但不是严格的分配上限。跨过段边界的等待会标 `nodeSelfTimeComplete: false`。超时仍在原 `limit` 判定（最多多一轮事件循环）；判定之后、拒绝之前，B2 打开时最多等一次有界的采样读取（150 毫秒），读取期间才到的回复照样丢掉，读取期间 `close()` 会停掉读取而命令照样按超时拒绝。读不到或超过这个上限就不再等，`nodeSelfTime` 是空数组、`nodeSelfTimeComplete: false`（表示没能证明整个窗口被覆盖）；B2 打开时拒绝落在 `limit`～`limit + 250` 毫秒之间。诊断里的 `profileReadMs` 记录这次读取等了多久，`elapsed` 按真正结算的时间写（两者相减就是定时器本身晚了多少）。采样段起点取 `Profiler.start` 前后两次 `performance.now()` 的中点，对齐误差不超过那一次往返的一半，命令窗口按 `performance.now()` 算。

浏览器驱动只用 Node 24 自带的 `WebSocket`（连 DevTools）和 `node:child_process`（起 Chrome）等内置模块，不加依赖；本机 Host HTTP 客户端只用 Node 自带的 `fetch` 和 `node:crypto`，类型只来自 `@molis-ai/molis-work-contracts/platform/actions`；`@molis-ai/molis-work-test-kit` 根入口保持纯规则（`scripts/check-package-boundaries.mjs` 导入它），Chrome 相关代码只在子路径 `/browser`，本机 Host HTTP 客户端只在子路径 `/local-host-http`（不叫 `/local-web`，免得和 local-host 的 `local-web-actions.ts` 混）。需要产品选择器、产品诊断的夹具留在 `tests/fixtures/`，在这里的 `ChromeHarness` 之上加（例如 `tests/fixtures/goal-browser.ts`、`tests/fixtures/plugin-builder-browser.ts`）。宿主的装配同样留在 `tests/fixtures/`：`test-home.ts` 的 `serveTestHost`、`openTestHome` 起临时 Home、`MolisWorkLocalHost`、产品自己的 web 服务和网关客户端，把 `/local-host-http` 的客户端交给用例（`goal-browser.ts` 的返回值里也有 `controlToken` 与 `web`）。Goals 的授权夹具 `tests/fixtures/goals-mcp-grants.ts` 也走这个客户端：给一个 Home 目录（短暂起一个产品装配的 Host）或用例自己起的 `serveTestHost`，约 60 个 Goals 动作按依赖顺序、同范围的一起（`with`，一次最多 16 个）分几次存。

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

- 负责：导入边界规则；与业务无关的无头 Chrome 启动与 DevTools 驱动（子路径 `/browser`）；访问本机 Host HTTP 管理接口的客户端与授权、项目的调用（子路径 `/local-host-http`）。确定性时钟、假能力、临时存储目前不在这里，仍在各测试里。
- 不负责：属于某个 Module 的业务夹具、规则或断言；任何产品选择器；宿主、授权与项目的装配（那在 `tests/fixtures/`）；决定一项授权该不该被接受（那是 Host 的检查，这里只发请求、转述拒绝）。
- 公开入口：`@molis-ai/molis-work-test-kit`（`src/index.ts`）、`@molis-ai/molis-work-test-kit/browser`（`src/browser/index.ts`）与 `@molis-ai/molis-work-test-kit/local-host-http`（`src/local-host-http/index.ts`），都经 `dist` 导出，不深入 `src/` 导入；合同 `@molis-ai/molis-work-contracts/platform/testing`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 规则与业务无关，不替代模块测试、浏览器验收或迁移验证。
  - 新增边界规则同时提供允许与拒绝案例，不靠检查固定文件数量。
  - 浏览器驱动的每个超时与诊断都是参数；用例原来的时限和失败信息靠参数保留，不在这里改默认值来迁就某个用例。
  - 回复已经读到就按回复结算：定时器到期后先让出一轮检查阶段，再决定是否超时；超时诊断只挂在 `error.diagnostics`，不改 `cause`、失败消息与期限。
  - 关闭先等主进程的 `exit`，再最多等 500 毫秒让 stderr `close`（辅助进程退完），不无限等（Chrome 的辅助进程会继承 stderr，等 `close` 可能不返回）：辅助进程收尾时还在写用户数据目录，主进程一退就删目录，Linux 上会遇到 ENOTEMPTY。等调试地址默认 30 秒（负载重的 CI 机器上冷启动的 Chrome 会超过 8 秒）。
  - 经 `launchHeadlessChrome`（`ChromeHarness.start` 也走它）启动的浏览器，标准启动参数只有这一套，每一个都带（`STANDARD_ARGS`，包自己的测试核对这一行与代码一致）：`--headless=new`、`--lang=zh-CN`、`--accept-lang=zh-CN`、`--disable-gpu`、`--disable-background-networking`、`--disable-component-update`、`--disable-extensions`、`--disable-background-timer-throttling`、`--disable-renderer-backgrounding`、`--disable-backgrounding-occluded-windows`、`--no-first-run`、`--no-default-browser-check`、`--remote-debugging-port=0`、`--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`，另加每次启动一个新的用户数据目录。最后一个让页面看到一只鼠标（`hover: hover`、`pointer: fine`），和 macOS 上无头 Chrome 自己报的一样：Linux 上它找不到指点设备，报 `hover: none`，页面就按触屏排版；触屏模拟（`Emulation.setTouchEmulationEnabled`）照样盖过它。其中 `throttling`、`renderer-backgrounding`、`backgrounding-occluded-windows` 三个参数让后台或被遮挡的页面不降频、不降优先级，所以经它启动的页面按前台节奏跑。不经它的浏览器（自己 `spawn` Chrome 直接取页面 DOM 的用例、产品的内置浏览器）另有各自的参数，不在这一套之内。`extraArgs` 排在标准参数之后，只能追加、去不掉其中任何一个；某个用例要别的参数就放进 `extraArgs`，不要为它另写启动器。改这一套等于改所有用 `/browser` 的用例的运行条件，要重跑「改动后必跑」里的浏览器用例。
  - 本机 Host HTTP 的授权与项目调用只走 Host 自己的设置接口，不提供写授权文件的捷径，也不替 Host 判断：被拒绝的授权原样抛出（状态、代码、Host 的话），`grantMcpActions` 只加上是哪一项。路由串各自写着主人文件（`web-mcp-action-settings.ts`、`web-project-settings.ts`），路由改名会在每个授权用例里以 404 出现。
  - 一组授权的顺序只由声明决定（`required_actions`、`required_scene`），有环就在发出前抛错；用例漏掉的依赖不替它补，Host 会以 `mcp.grant_requires` 拒绝，用例自己把依赖列进去。
  - 不依赖任何包以外的运行库；不 import 宿主、模块、横向服务或插件。
  - 本包自己的测试用 `pnpm --filter @molis-ai/molis-work-test-kit test`。
- 改动后必跑：`node scripts/run-tests.mjs tests/import-boundary-template.test.ts tests/workbench-registration-boundaries.test.mjs tests/health-gates-structure.test.ts tests/ci-linux-probe.test.ts`，和包自己的 `pnpm --filter @molis-ai/molis-work-test-kit test`（例外名单的条目另由健康门禁对照 merge-base 只许减少）；改了 `/browser` 的，再加跑（需要本机 Chrome，在排好的浏览器时段里）`tests/ci-product-subset.txt` 里的 5 个浏览器冒烟、`tests/artifact-clipboard.e2e.test.ts`、`tests/shelf-client-boundaries.e2e.test.ts`、`tests/functions-draft-retention.test.ts`、`tests/agent-studio.e2e.test.ts`；改了 `/local-host-http` 的，再加跑 `tests/mcp-action-settings.test.ts`、`tests/workspace-read-actions.test.ts`、`tests/action-gateway.test.ts`、`tests/external-mcp-actions.test.ts`、`tests/goals-mcp-grants-fixture.test.ts`
- 相关手册：[docs/platform/CONTRACTS-AND-OPERATIONS.md](../../docs/platform/CONTRACTS-AND-OPERATIONS.md)、[docs/system/PACKAGE-BOUNDARIES.md](../../docs/system/PACKAGE-BOUNDARIES.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/system/PACKAGE-BOUNDARIES.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
