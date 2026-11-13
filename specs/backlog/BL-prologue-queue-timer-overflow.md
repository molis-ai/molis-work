# BL-prologue-queue-timer-overflow

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-prologue-queue-timer-overflow | `vendor/prologue-sdk` 的任务队列在一条任务错过时间后（比如 Home 关了一晚或几天）算错后面任务的等待时间：到点时把这条任务的到期时间当成现在（`dist/orchestration/core/queue.js:67`、`:185`），所以 A 过期多久，B 就晚多久；超过 `setTimeout` 上限（约 25 天）B 反而马上跑。要到下一次排任务或取消（`:102`、`:136`）才校正。临时脚本的复现：A 过期 30 天、B 1 小时后到期，B 3 ms 就跑，早了近 1 小时；A 过期 10 天或 2 天，B 晚相同的量。修法在上游 `queue.js:185`，改成 `rearm(await deps.now())`；接线是 `composition/core/assemble-orchestration.js` 的 `arm`，延迟没封顶。受影响的是用这个队列定时的 `apps/local-host/src/memory/memory-host.ts:151,188` 和 `apps/local-host/src/assistant/assistant-followups.ts:192`。 | [第 05 批](../post-anticorruption-roadmap/reference/batches/05.md) U2-c 生成金样时看到 `TimeoutOverflowWarning`，用户 2026-11-08 定 | 已知缺口 | 问题在上游 SDK，换包是红线。用户定下次换包一起修，什么时候转上游由用户定。临时脚本只验证了队列本身，这三条真实路径没跑过，用户实际碰到过没有不知道。 | 下次换 `vendor/prologue-sdk` | 中 | Agent 运行时（统筹转上游） |
