# BL-memory-p1-residuals

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-memory-p1-residuals | Memory P1 的三项产品边界：① Molis `memory.export@1`/`import@1` 仍使用 `molis.memory` 信封 v1，没有把 SDK Export v2 作为内部载荷，也没有暴露 `maxEntries` 分批导入；② 权威正文/历史已归 SDK 单条密文记录，但 `memory_changes`、`memory_pairs`、`memory_candidates` 与未完成 `memory_markers` 仍持久化正文的显示/提案/维护副本；③ 直接绕过 App 使用旧 SDK 打开已采用存储仍可能降写，受支持的旧 Molis 入口只由 ledger 版本检查拒绝 | [31-2 收尾](../post-anticorruption-roadmap/reference/batches/31.md#batch-31-item-2)、[Memory spec §5、§9.1](../prologue-memory-strategy/spec.md)、[MEM-11、MEM-19、MEM-40](../prologue-memory-strategy/spec.md#103-长期内容工具分工) | 已知缺口 | ① 产品层内嵌/分批会改导出格式与动作输入，需用户确认是否仍按 2026-11-14 的“内嵌 Export v2”口径实现；② 删显示副本会改“最近变动”和撤销展示的读取路径，需先定是否把显示投影改为按需读 SDK 历史；③ 旧 SDK 不受当前 App 控制，只能记支持边界 | 用户对①③的范围决定；②的显示投影方案 | 中 | C2／Memory（后续执行会话待分配） |
