# W5-13 C1：侧栏浏览器输入失败可见

状态：RAC-115 已实现，作者定向验证 24 项通过、1 项既有失败已在同一干净基线复现，待独立 REVIEW/TEST 与合并。Codex 保留 C1 归属；RAC-113、RAC-114 的既有合入证据不代表 C1 整体完成。

承接[总规格](../spec.md) W5-13 的 browser 区域吞错收尾，及侧栏浏览器的[既有输入与接手合同](../../archive/side-panel/spec.md) D03、D09、AC04。流水线在 FIX2 的 #1198 固定并明确释放后授予本片唯一 writer。准确基线 `2dd53591276982b6947369e345ddfcffcc21afd2`，32 个当前在途 PR 的完整文件清单没有修改本片 browser 目录、既有测试或本 slice。

## 行为与边界

`BrowserPage.input` 的共用 `send` 把 `Input.*` 的 CDP 拒绝一律转成成功的 Promise。`browser-socket.ts` 已经等待这次调用并有错误回答，但它拿不到失败，因此人工输入拒绝没有提示。CDP 自己已经处理断连、超时和协议错误，本片不另建传输或重试。

失败沿现有 socket 错误出口传播，使用现有 `browser.load_failed` 与中性提示“无法确认这次输入是否完成，请检查页面。”，不声称网页未执行，也不自动重发。现有 `hostLog.warn` 仅记 `browser / input_dispatch_failed`、原错误 name/code 和代码中固定的 Input 方法名；不记录输入、网址、原 CDP message/stack 或其他敏感内容。四类成功输入的参数、顺序及先接手暂停助理的语义保持。

允许生产修改仅 `apps/local-host/src/browser/browser-host.ts` 的输入失败出口及模块级小函数；验证扩展既有 `tests/side-panel-browser.e2e.test.ts`，必要时补同包 README。现有巨大类 `BrowserPage` 为 443 行、45 方法，不增加类行数和方法；文件当前 769 行，不越过 800 行。既有 socket、CDP 连接、关闭/可选能力的尽力处理、API/schema、权限、导航、存储、公共 baseline 与其他 C1 余项均不改，不增加测试专用公开接口或包内部 import。

## 验收与验证

- **RAC-115**：用实际隔离浏览器的 CDP 协议拒绝触发输入失败；修前确认请求已被拒但原 socket 没有收到错误，修后原通道收到中性错误。失败只发送一次、无自动重放，页面没有被重复输入；恢复原方法后，下一次明确输入（含中文）能正常完成。日志恰好一条，仅含固定方法及错误 name/code，不含输入 canary、页面 URL、原错误正文或堆栈。保留既有鼠标、键盘、组字与接手/恢复正向回归。

复用现有真实浏览器测试宿主及公开方法，故障仅将一次 Input 请求导向不存在的协议方法，使用浏览器实际返回的拒绝；不通过新公开接口读取私有状态。每个 Home/profile 独立，明确设置 `MOLIS_WORK_BROWSER_PATH` 为公共 test-kit 的专用浏览器路径，和 `MOLIS_WORK_TEST_CHROME` 对齐；不回退日常 Chrome，最终按自身 PID 关闭并清理临时目录。

先整体构建并取得真实拒绝红例，再改生产代码、重建、运行本文件完整回归与 Host 日志定向回归：

```sh
pnpm install --frozen-lockfile --offline
pnpm build
node scripts/run-tests.mjs tests/side-panel-browser.e2e.test.ts --jobs 2 --verbose
node scripts/run-tests.mjs tests/host-log.test.ts
node scripts/run-tests.mjs tests/side-panel-platform.test.ts tests/side-panel-assistant-surface.test.ts --jobs 2 --verbose
node scripts/check-health-gates.mjs --base origin/main
pnpm boundary:check
git fetch origin main
pnpm secrets:check
node scripts/affected-tests.mjs --base origin/main --json
```

build/browser 使用公共 machine-slot，无新 full；`full` 若实际命中，交 Claude 唯一排期。README 其他必跑项由作者、独立 TEST 和同头 CI 按实际证据核齐；不把局部通过称整包验收。新 head 固定即直交 REVIEW/TEST/流水线/root 并明确释放，不等 CI/合并；源码后续按唯一 writer 排槽。真实 Home、Tauri 窗口、系统输入法与本人验收不在本片已验证范围内。

作者证据在 `/tmp/molis-verify-2026-10-24/c1-rac115/`：`tests-before.log` 在修改生产代码前确认 Chrome 的实际协议拒绝，唯一红例是原 socket 错误回答仍为空。修复后 `tests-after.log` 中 RAC-115、原崩溃恢复、侧栏主路径及无浏览器拒绝通过，Host 日志 5/5 通过；`tests-platform.log` 的两个相关文件共 15/15 通过。合计 24 通过、1 失败，无跳过、重试或放宽断言。唯一失败是旧 cookie 持久化用例预期 `closed=kept`、实际为空；`tests-baseline.log` 在准确基线 `2dd53591276982b6947369e345ddfcffcc21afd2` 的干净工作树、相同专用浏览器与整文件上复现相同失败（3 通过、1 失败），未纳入本片修复。

整体构建、定向 Biome、边界及对 merge-base 的 health 检查通过，未改 baseline。额外的测试文件严格 TypeScript 检查保留原 dialog 空值诊断 TS2531；`test-typecheck-baseline.log` 证明基线与修改后仅同一诊断，无新增，不能称该文件严格检查全绿。实际 `affected.json` 选中 85 个文件，`full`、`storage`、`uncovered` 均为空；已运行其中 3 个直接相关文件，另加 Host 日志，余下 82 个建议交独立 TEST/同头 CI 对照 README 必跑项核齐，未宣称全部通过。
