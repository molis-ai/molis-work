# BL-goal-evidence-rework-links

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-goal-evidence-rework-links | 返工轮次和委托还不完全点名要求：第 32 批（#2093）已建结构化委托要求（`AgentDelegatedRequirement`）与按 `requirement_id` 交付报告，第 44 批 44-3 已将 Goals 的要求与认可统一迁至平台 `modules/acceptance`。仍留：`apps/local-host/src/assistant/assistant-delegation.ts` 的 `delegated_by.acceptance` 仍是自由文字；Coding 委托与平台要求的关联仍待核实补齐 | [第 24 批第 3 项](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-item-3)；[11-04 核账](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-audit)缺口 6 | 部分实现 | 2026-11-22 核：Goals 一侧已随第 44 批 44-3 改为消费 `modules/acceptance`；仅剩 `delegated_by.acceptance` 结构化与 Coding 委托链路核实 | 无 | 低 | A 轨 |
