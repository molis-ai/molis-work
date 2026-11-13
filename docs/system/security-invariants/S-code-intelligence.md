# S-code-intelligence

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-code-intelligence | 宿主侧代码理解（官方编码包 `coding.find-symbol` 的 `coding.symbol-index` 执行器）只读**本轮目录里的真实文件**：请求路径与根都先过 `realpath` 再比较，指到根外的符号链接、绝对路径与 `..` 一律拒绝；没有登记服务器、或没有 `path` 的调用也拒绝，不猜、不扫描根外。为它启动的语言服务器是「别人家的进程」：平台自己的 `MOLIS_WORK_*` 环境（含 Home 的加密密钥）在 spawn 之前剥掉，服务器拿不到；语言服务器只能从人配置的 `language-servers.json` 来，工具不隐式下载。AI 运行时不因此获得新的文件权限——执行器只读，写仍走工作区与审查。 | `horizontal/agent-host/src/code-intelligence/index.ts`、`horizontal/agent-host/src/code-intelligence/lsp-client.ts`；`apps/local-host/src/agent-host-composition.ts` | `tests/security-invariants-code-intelligence.test.ts`「S-code-intelligence」 | — |
