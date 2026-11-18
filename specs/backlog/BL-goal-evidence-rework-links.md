# BL-goal-evidence-rework-links

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-goal-evidence-rework-links | 返工轮次和委托还不点名要求：助理的轮次、委托子任务（`delegated_by.acceptance` 是自由文字）、助理结果边都不带 `requirement_id`，所以返工时说不出「这一轮是为哪条要求返工、针对哪一版」。Goals 一侧已能按要求、按版本记依据和认可（第 24-3 批），要补的是助理一侧在发起返工、委托时带上要求编号和所针对的版本，并在报告里用同一个编号回报 | [第 24 批第 3 项](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-item-3)；[11-04 核账](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-audit)缺口 6 | 部分实现 | 2026-11-17 核：第 32 批（#2093）已在平台一侧做了助理委托这条路——委托时带结构化要求（`AgentDelegatedRequirement`），交付按 `requirement_id` 逐项报告并钉住 `requirement_version`，返工轮用 `touches` 写明动了哪几项（`apps/local-host/src/assistant/assistant-delegated-delivery.ts`、`modules/acceptance`）。仍留：`delegated_by.acceptance` 还是自由文字；Goals 自己的依据与认可路径没有改读同一份要求，随第 44 批 Goals 改为消费平台认可时一起收；Coding 委托是否连到要求仍未核实 | 第 44 批（Goals 一侧） | 低 | A 轨；Goals 一侧随第 44 批 |
