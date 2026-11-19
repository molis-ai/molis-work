# S-assistant-memory-management

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-assistant-memory-management | 保留的助理记忆管理 HTTP 不得丢弃本人所见版本、从当前版本补值或绕过原项目范围；断连已到达而尚未提交的更新/删除不得继续写正式记忆、业务流水或接受遗忘。当前版本的新请求可以恢复，正常完成不取消；不撤回已提交效果。 | `apps/local-host/src/assistant/assistant-http.ts`、`apps/local-host/src/assistant/assistant-memory-bridge.ts`、`packages/contracts/src/services/assistant-memory.ts` | `tests/security-invariants-assistant-memory-management.test.ts`「QEA-56 · retained Assistant」「QEA-57 · retained Assistant」：真实版本冲突、缺版本、项目范围及断连与 SDK 交错，比较正式记录/流水/遗忘决定并验证恢复 | |
