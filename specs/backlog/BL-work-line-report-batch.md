# BL-work-line-report-batch

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-work-line-report-batch | 没有对话来源、带 `reports_to: "assistant"` 的多行如果在同一次任务总表读取里一起结束，`AssistantTaskReports` 现在逐行调用 `AssistantReportRounds.report`，后到的那行会在主对话忙时答 `later`、等下一间隙再起一轮，没有合成一轮。对话派出的多结果合并有 `assistant-delegation-handback` 的 PA-08；无来源路径没有两行用例。补法：按项目把同一拍结束的行收成一批，主对话空闲时起一轮列出全部结果，忙时整批留到下一间隙；通知仍按任务去重 | 第 32 批 #2093 合后独立审计（32.md 第 1 项「同时到的合并」、PWA-155） | 明确后续做 | 本批先交单行汇报与只读汇报轮；批量汇报要调整 `AssistantTaskReports`/`AssistantReportRounds` 的端口与去重键，并补两行用例，不能和已合的汇报轮语义混在一起 | 无。执行批次 [97-2](../post-anticorruption-roadmap/reference/batches/97.md#batch-97-item-2)。 | 中 | 助理线 |

本项验收（2026-11-18）：同一项目多件后台工作同时结束时，助理合成一轮汇报；对话忙时整批留到空闲。
