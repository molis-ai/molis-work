# S-assistant-memory-candidate-cancellation

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-assistant-memory-candidate-cancellation | 助理候选卡的接受/拒绝，在 HTTP 响应提交前断连后不得继续提交候选决定、正式记忆或业务流水。传输只提供同次信号，Memory 与 SDK 原提交检查执行拒绝；正常响应完成不取消，新的明确决定可以恢复。不承诺撤回断连前已经提交的效果。 | `apps/local-host/src/assistant/assistant-http.ts`（`settleMemoryCandidate`）、`apps/local-host/src/web-entry-actions.ts`（`responseAbortSignal`）、`apps/local-host/src/local-web-actions.ts`（`bindLocalWebActions`） | `tests/security-invariants-assistant-memory-candidates.test.ts`「QEA-49 · Assistant candidate」：真实助理工具生成候选，真实 HTTP 断连与 SDK 提交交错，核对 canonical/ledger 及新请求恢复 | |
