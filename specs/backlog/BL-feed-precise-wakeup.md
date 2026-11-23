# BL-feed-precise-wakeup

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-feed-precise-wakeup | 让 Feed 按各来源下一次拉取时间登记精确唤醒，不再以 `FEED_WAKE_INTERVAL_MS = 30_000`（`plugins/native/feed/src/runtime-wake.ts`）每 30 秒请求平台叫醒一次。当前只要项目安装了 Feed，`web-project-schedulers.ts` 每轮看到两轮内有到期任务，该项目就永远不会空闲休眠，抵消了第 103 批空闲休眠在 Feed 项目上的收益 | [第 103 批](../post-anticorruption-roadmap/reference/batches/103.md)（103-1 实际做法与偏离） | 明确后续做 | 第 103 批先按最小改动保持 Feed 自动拉取准时，改按来源下次拉取时间排期涉及 Feed 同步调度与唤醒重算，单列跟进 | 无 | 高 | E 轨／Feed（执行会话待分配） |
