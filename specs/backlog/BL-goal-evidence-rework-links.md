# BL-goal-evidence-rework-links

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-goal-evidence-rework-links | 返工轮次和委托还不点名要求：助理的轮次、委托子任务（`delegated_by.acceptance` 是自由文字）、助理结果边都不带 `requirement_id`，所以返工时说不出「这一轮是为哪条要求返工、针对哪一版」。Goals 一侧已能按要求、按版本记依据和认可（第 24-3 批），要补的是助理一侧在发起返工、委托时带上要求编号和所针对的版本，并在报告里用同一个编号回报 | [第 24 批第 3 项](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-item-3)；[11-04 核账](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-audit)缺口 6 | 未实现 | 归 A 轨的文件（`apps/local-host/src/assistant/**`、`services/assistant` 合同），第 24 批不借别轨文件；Coding 委托是否连到要求当时未核实 | 32 批第 2 项 | 中 | A 轨 |
