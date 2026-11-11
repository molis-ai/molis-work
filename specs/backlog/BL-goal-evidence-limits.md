# BL-goal-evidence-limits

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-goal-evidence-limits | 逐项依据合同的已知限制（第 24-3 批如实记下）：① 平台命令核验只对「成果库记录的来源修订就是那一轮的编号」的成果成立，现在只有 Coding 执行报告这样记；文档、数据表等由用户或别的插件固定的版本，报告只能算自述或由另一会话复查。② 命令必须和交付版本出自同一轮：下一轮单独跑的测试不能核验上一轮做出的版本（用户 2026-11-11 定的「出处和先后」规则的直接结果）。③ 复查方的独立性只按会话分：同一个 AI 另开一个会话也算另一会话；做出版本的会话只有它自己能被平台认出，所以复查要等至少一个执行方先报告过。④ Prologue 的 `EvidenceLedger`、`judgeObjective` 仍没有接，证据取自 agent-host 已有的命令回执与轮次活动（`agent.evidence.check@1`）。⑤ Goals 项目库第 2 版的新列（`tier`、`gap`）不带 CHECK，因为平台的升级段不放行带 CHECK 的加列；取值靠 Goals 写入时保证 | [第 24 批第 3 项](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-item-3)；[决定 35](../post-anticorruption-roadmap/reference/decisions.md#decision-35) | 已知缺口 | ①②③ 是已定规则的边界，要放宽得用户再定；④ 等 31 批向 Prologue 提的能力；⑤ 等升级段支持整表重建时再补约束 | 31 批（④） | 低 | E 轨、C2 |
