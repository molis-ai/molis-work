# W4-01 真实 corpus：现行主干执行差量

状态：**WAIT，供根接续；不是新任务书、派工或模型执行授权。** 唯一工程书仍为 [`coordination/2026-10-28/plans/W4-01/PLAN.md`](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/W4-01/PLAN.md) 及同目录 `brief-counter.md`、`brief-list.md`。该书已获根接受 A/B/C 修订。本差量只核 2026-10-31 指定已采用 main `3fd857792a27352030ac8f3544a3b57d418febc1`；主检出本地 `08c9933d`，不能当该 main。`ESTIMATE.md:9` 已把余项计为一片，`MISC.md:188` 明记真实模型未授权、未执行；不从五份待领配额另立可选任务。

## 当前事实与最小改动

- 从旧书核对基点 `b0567bf` 到指定 main，`scripts/replay-plugins.mjs`、`tests/replay-plugins.test.ts`、`tests/probe-plugin-installed.test.ts`、`tests/fixtures/replay-plugins/`、两份 owner 文档均无差异。当前 corpus 仍只有 `plugin-sample` 与 `text-stats-packed`；`about` 仍留真实创作台样本待补。runner 的 `loadFactory` 只接受目录/`pnpm pack`；非内置走 `pluginFixtures`，`nextVersion` 改内存定义、`platform.upgrade`，不证明签名安装/升级。现有 RAC-790/791 覆盖两样本和三种坏样本。
- 发布入口仍在 `apps/local-host/src/plugin-builder/studio-ports.ts` 的 `publish`：`plugin.mjs`、`manifest.json`（BuildManifest）、`contract.json`、`interface.json`、`prompts.json` 原件可取；代码 Agent 经 `resolvePrologueBuilder`。签包可复用公开 `sandboxPluginManifest` 与 `signPluginPackage`，包文件映射和 `payloadOf` 形状见 `tests/fixtures/sandbox-package.ts`。只复用签名/封装，不能复用其中手写的 `CODE`、contract、interface 来冒充模型产物。
- 两个固定 project scope 样本及 oracle、v1/v2 原字节、单次 add 后升级/重启只读，完全沿用已接受书与两 brief。最小实现只增 corpus 两样本目录和现有 runner 的 signed-package 分支、精确测试断言；不建新 runner、DSL、生产导出或 Home scope。现行 `plugin-install-service.ts` 的 preview/confirm 与 `installed-plugin-lifecycle.ts` 的 `assertUpgradeOf` 已有项目包升级路径；T141/T143/T149/BL589 不是前置。`tests/probe-plugin-installed.test.ts` 的“没有升级入口”注释与拒绝例来自未带兼容声明的旧包，不能据此否定现行正向路径；以同发布者、兼容 v2 的真实 CLI 结果为准。
- **测试差量**：非 macOS 时 runner 仍逐项运行原两样本，真实签包样本各报告 `status=unsupported, ok=false, steps` 各项 `null`，顶层退出 1。`tests/replay-plugins.test.ts` 须按平台分别断言：macOS 的四样本完整通过；其他平台预期退出 1、原两项通过、两真实样本明确 unsupported 且未执行。不能整文件 skip 或把 unsupported 改成功；RAC-791 原拒绝保持。这样 Linux CI 检查报告语义，而 macOS 实跑是新增签包行为证据。

## 文件边界与在途锁

作者允许范围：`tests/fixtures/replay-plugins/corpus.json`、该目录两份真实样本的发布原件/签名 v1-v2 包/简短 provenance README、`scripts/replay-plugins.mjs`、`tests/replay-plugins.test.ts`；只有封装确需共用时最小改 `tests/fixtures/sandbox-package.ts` 或现有 resident fixture。owner 文档 `docs/system/CONTRACT-CHANGES.md`、`specs/repository-anti-corruption/slices/w5-02-registry.md` 交根串行更新。不要改 builder、SDK、安装实现、真实 Home 或 4207。

本轮按 GitHub **23 个 open PR 的完整分页文件清单**核：无 PR 改 corpus、runner、replay 测试、probe-installed 或签包 fixture；#1101 的完整路径含 `docs/system/CONTRACT-CHANGES.md`，该共享文档属保护/根协调范围；#1675 含 `apps/local-host/src/plugin-builder/{exposed-actions,installed,prompts}.ts`，会影响将来生成/安装基点但不是本片可写路径。其余 21 个未命中上述预期文件。领取前由根 fresh 核 owner 未入库产物、PR head/文件锁与已采用 main；若现成真实产物存在，先核来源和固定 oracle，不重复生成。

## 验收与必要命令（本轮均未运行）

根确认隔离模型执行条件后，作者以准确采用基点记 base/head/tree、冻结两 brief，完成真实创作台设计→代码→检查→发布；逐轮留非 secret provenance 与人工 diff。macOS 独立 Home 中两签名样本必须经常驻 Host/CLI 预览无写、确认 pin、动作发现与固定输入、v2 同安装升级、重启再读，逐步报告实际返回和持久状态。错误包与错误 oracle 能使对应真实分支失败；原两路及 RAC-791 不退化。只在 Mac 结算完整行为，Linux 结算报告/拒绝语义。

改过 `src`/脚本后先占公共构建槽运行 `pnpm build`；再在独立测试窗口运行 `node scripts/replay-plugins.mjs --json` 与 `node scripts/run-tests.mjs tests/replay-plugins.test.ts tests/probe-plugin-installed.test.ts --jobs 1`（probe 旧负例只作安装/重启基础证据，正向 v2 必须由新增 corpus 验）。按最终 diff 做 `pnpm boundary:check`、`node scripts/test-imports.mjs --check`、`node scripts/check-health-gates.mjs --base origin/main`，推前 fresh fetch 后 `pnpm secrets:check`；Full/CI 与采用由根另核，不拿 smoke、mock 或旧 RAC-792 代替。测试浏览器、临时 Home 与签名私钥按仓库规则隔离清理。

**仍需根给出的决定**：是否有 ac-registry 作者尚未采用的真实样本；两次真实生成获准使用的独立 Home、provider/model、执行时段、每样本耗时/修复轮及总 token 或金额上限、超限停点。没有这些，不能读真实配置/Keychain、试探模型或开始生成。当前未发现需就具体安全合同升级模型判断的争点；若真实原件无法无损映射当前包合同，再把确切形状差异交根裁决。
