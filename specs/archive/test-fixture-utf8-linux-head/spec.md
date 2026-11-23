# 测试夹具 UTF-8 与 Linux 回归提交

> 归档（2026-11-23）：判定为**已实现**。真实 HTTP 分块回归和 Linux 检出脚本的定向验收通过。

负责人 Codex。目标为工程功能可用，验收覆盖真实 HTTP 接收和回归脚本的 Git 行为。

从 `179a99691c23e1bea5291892e694fd2d0f8228f9` 建独立工作树。核对了 [认领板 #1743](https://github.com/molis-ai/molis-work/issues/1743)、开放 PR 文件清单和 [#2268](https://github.com/molis-ai/molis-work/pull/2268) 的在途调度改动。本轮沿用现有测试运行器。

## BL-1000

模型和 HTTP 替身的 `IncomingMessage` 默认交付 Buffer。把 Buffer 逐块转成字符串会在中文或 emoji 跨块时丢字。对确实逐块转换的读取，沿用现有 HTTP 夹具的 `setEncoding("utf8")`。

查到 25 个测试文件中的 27 处原始字节读取，包括共用的 Coding 模型替身，以及助理、Prologue、记忆、图片、Companion 和 MCP 测试中的内联服务。`assistant-text-model.ts`、`model-stand-in.ts`、`recording-text-model.ts` 等已把字节收齐后解码。现有 HTTP 响应夹具（如 `tests/settings-direct-access.test.ts`）已有跨块的 `setEncoding("utf8")` 读法。早期录制脚本的子项由 [#2158](https://github.com/molis-ai/molis-work/pull/2158) 结清。

## BL-linux-repro-source-head

`scripts/linux-repro.mjs` 从开发工作树读目标提交，并把 Docker 内的命令交给 Bash。原来的 `&&` 链会让前两步的失败漏过 `set -e`。让取源和检出各自失败即退出。构建和测试开始前都读实际 `HEAD`，比对目标并打印实际提交。沿用原有的卷与 `--rebuild` 约定。

## 验收标准

- **TFLH-01** BL-1000。真实 loopback 请求分别从一个中文字和一个 emoji 的内部切开。Coding 模型替身记录的完整请求与原始 JSON 字符串逐字相等，解析后的消息也相等。复用 `tests/fixture-request-text.test.ts` 的模型替身回归入口。
- **TFLH-02** 正确提交在空卷完成检出，构建和测试各自的日志都带实际完整 SHA。
- **TFLH-03** 来源不可读时，空卷和缓存了任何提交的卷都立即失败。检出失败同样不能安装、构建或测试。
- **TFLH-04** 旧卷能在来源可读时切到目标提交。如果构建期间 HEAD 变化，测试前的核对会失败并同时报出目标与实际 SHA。

验证使用 `pnpm build`、`node scripts/affected-tests.mjs` 与 `node scripts/run-tests.mjs --jobs 1`，浏览器用例用隔离浏览器。Linux 提交用例以临时 Git 仓库、同一 Bash 脚本和隔离卷目录模拟缓存，安装与构建用探针记录是否执行。

## 验收记录

`pnpm build` 与 ShellCheck 通过。macOS 定向运行 [请求夹具回归](../../../tests/fixture-request-text.test.ts) 6/6、[Linux 检出回归](../../../tests/linux-repro.test.ts) 5/5。TFLH-01 在同一份 JSON 里把「猫」和 🐱 各从第一个 UTF-8 字节后切开，收到的完整 JSON 与消息正文都和原文相等。

[Linux 首跑](https://github.com/molis-ai/molis-work/actions/runs/45239002580) 发现 Git 的错误措辞随版本变化。不可读来源用例核对 Git 的退出码、出错路径、卷的检出状态和后续阶段是否启动。最终复跑见 [#2282](https://github.com/molis-ai/molis-work/pull/2282)。

| 运行场景 | 日志中的实际 HEAD | 结果 |
| --- | --- | --- |
| 空卷，来源可读 | `7353f97deb0f5263e44c4c5de4938bd2ded1d1e4` | 构建和测试开始前各记录同一个提交 |
| 来源不可读 | 空卷没有 HEAD；缓存分别为 `8211833f2f232405c7ce19b6e1f76afed77a8898`、`7353f97deb0f5263e44c4c5de4938bd2ded1d1e4` | 三次退出 128，安装、构建和测试均未启动 |
| 已有正确 HEAD，检出失败 | `7353f97deb0f5263e44c4c5de4938bd2ded1d1e4` | 索引锁令真实 Git 检出失败，退出 128 |
| 旧卷，来源可读 | `8211833f2f232405c7ce19b6e1f76afed77a8898` → `7353f97deb0f5263e44c4c5de4938bd2ded1d1e4` | 更新后才运行测试 |
| 构建后 HEAD 发生变化 | 构建前 `7353f97deb0f5263e44c4c5de4938bd2ded1d1e4`，测试前 `8211833f2f232405c7ce19b6e1f76afed77a8898` | 日志带出预期和实际提交，退出 1 |
