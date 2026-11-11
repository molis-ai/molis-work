# BL-coding-write-check-batch-read

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-coding-write-check-batch-read | Coding 时间线读写后检查回执是一条回执一个请求，每次请求在 agent-host 里回放整轮（`plugins/native/coding/src/write-checks.ts`、`horizontal/agent-host/src/adapters/prologue-node-port.ts` 的 `readCommandOutput`）。读到的结果永久缓存，读不到的 30 秒内不重读，所以代价只在一轮第一次显示时出现；一轮写得多时仍是多次回放。改成 agent-host 随轮次视图一次带回各写入的检查结果（或一个按轮批量读的动作） | [第 24 批第 1 项](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-item-1)；PR #2024 评审 M8 | 已知缺口 | 要改 `agent.command-output` 或轮次视图的合同，和 31 批的 SDK 窗口一起做更省 | 31 批 | 低 | C 轨、B／Coding |
