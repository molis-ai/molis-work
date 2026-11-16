# BL-run-terminal-cleanup

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-run-terminal-cleanup | 第 31 批终态清理只改了 `prologue-run.ts` 的主路径，四个相邻消费者仍只认 `completed`/`failed`/`cancelled`：`prologue-stop-guard.ts` 的 `roundFacts`/`stopGuards`、`prologue-checkers.ts` 的 round 记录、`prologue-run-observation.ts` 的 `agent.run` 终态事实、`prologue-work-graphs.ts` 重启对账的 `endOf`；`tripped`/`circuit-tripped` 可能泄漏记录、缺终态事实，或重启后 step 仍 `running`。另有三项复查余项：`messages.failed` 对护栏/熔断复用“失败了”的措辞；`prologue-run-store` 的 `controlPhase` 仍把护栏绊停显示为 `failed`，而清理按 `stopped`；缺一个 adapter 级生命周期测试（发射各终态并断言 surface/project work/LSP/live session/waiters 清理）。`history` 的 `limit`/`before_version` 也仍缺非法值校验与 limit-only/before-only 用例。 | 第 31 批合后独立复查（PR #2089，2026-11-15） | 已知缺口 | 这些相邻路径不是本 PR 引入，先保持主路径修复可合并；四项需要按 Agent Host 的终态语义统一后再改，避免在收口 PR 里扩大范围 | 第 31 批终态语义统一；adapter 生命周期测试夹具 | 中 | Agent Host／31 后续（执行会话待分配） |
