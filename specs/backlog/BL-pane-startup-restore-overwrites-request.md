# BL-pane-startup-restore-overwrites-request

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-pane-startup-restore-overwrites-request | 窗格页（`?workbenchPane=` 的另一份文档）自己的启动恢复（写 `{ itemId: null, intent: "restore" }`）如果晚于 `load` 才发，仍可能盖掉外层从搜索打开记录时发来的 `workbench-select-item`。现在的时间线里它在 `load` 之前，所以没有踩到 | [#1887 评审「不挡合并」的剩余风险](https://github.com/molis-ai/molis-work/pull/1887) | 已知缺口 | #1887 的修法把记录的请求改到窗格页面 `load` 之后再发、并走 `workbench-select-item`，顺序由同一窗口两条 `postMessage` 保证；这条记的是「窗格页启动恢复若晚于 load」这条时间线变化后的风险，真遇到时再看，不挡合并 | 无 | 低 | 工作台外壳（具体会话待分配） |
