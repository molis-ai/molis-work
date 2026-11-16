# BL-work-line-background-provider-gaps

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-work-line-background-provider-gaps | 后台任务总表的合同对所有插件通用，但审查报告点名迁移的后台工作里，Alchemist 的研究运行和平台自己的 `background.jobs` 还没有 provider；现在实际报的是 Coding、Images、助理/Character，Feed/Schedule 经 runs 概览只报错过的一次。补法：Alchemist 用 `defineBackgroundTasksAction` 报研究运行，平台作业由宿主按 `background.start` 记录报同一形状；或者把 32.md「所有插件都能报」的括号改成只列已接的提供方 | 第 32 批 #2093 合后独立审计（`docs/reviews/platform-capability-audit-2026-11-14.md` 第 3 项、32.md 第 3 项与收尾检查） | 明确后续做 | 本批先交通用合同与现有提供方；Alchemist 研究运行和平台作业的进度字段、停止命令各要按主人补，且不改本批已合入的形状 | 无 | 中 | 助理、Alchemist 与宿主 |
