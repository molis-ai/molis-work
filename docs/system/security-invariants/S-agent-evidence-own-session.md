# S-agent-evidence-own-session

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-agent-evidence-own-session | `agent.evidence.check@1` 是别的 owner（现在是 Goals 的逐项依据核对）能问到的唯一一条“某轮跑过的命令”的事实：有没有回执、怎样结束、之后这一轮有没有再写文件。它只回答宿主给这次调用绑定的那个会话（`runtime_session_id`，不从输入读，输入里也没有会话字段）里的轮次：没有绑定会话的调用（用户、MCP 客户端、自己发起的工作流）和插件一律拒绝，别的会话或别的项目的轮次按“找不到这一轮”拒绝，且不去读任何回执。回答只有事实，不带命令文本和输出；读不到的回执、轮次里没跑过的命令、读不出先后位置的命令，都不当作“之后没有改动”。它不运行任何命令。 | `horizontal/agent-host/src/recovery-actions.ts`（`checkEvidence` 的处理器）；`packages/contracts/src/services/agent-host.ts`（动作声明：`audiences: ["agent", "workflow"]`、`plugin: false`）；`apps/local-host/src/local-host.ts`（把调用的 `runtime_session_id` 交给处理器） | `tests/security-invariants-agent-evidence.test.ts`「EVD-30」「EVD-31」「EVD-32」 | |
