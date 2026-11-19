# BL-work-line-report-batch · 同一项目同时办完几件事，助理合起来报一次

两件后台工作同时完成时，主对话里一次报全。主对话正忙就一起等，用户仍能分别找到每个任务的结果。

预计 **8–16 工时**。维护范围为助理线。正式交付项为 [97-2](../../batches/97.md#batch-97-item-2)。[原始待办](../../../../backlog/BL-work-line-report-batch.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-work-line-report-batch。正式交付项为 97-2，批次文件在 specs/post-anticorruption-roadmap/reference/batches/97.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-work-line-report-batch.md。产品决定与验收按该 BL 的现行记录。

目标
同一项目同时办完几件事，助理合起来报一次。两件后台工作同时完成时，主对话里一次报全。主对话正忙就一起等，用户仍能分别找到每个任务的结果。

实施
在 apps/local-host/src/assistant/assistant-task-reports.ts 内追 AssistantTaskReports→AssistantReportRounds，把一次读取里同项目、没有原对话来源、reports_to 为 assistant 的已结束行分组，空闲时产生一轮只读汇报。主对话忙时整组保留。按任务保留通知去重、重试与重启后的幂等。已有原对话的交还依原路。

验收
node scripts/run-tests.mjs tests/assistant-task-reports.test.ts tests/assistant-delegation-handback.test.ts。覆盖同项目两条→一轮含两个结果、跨项目不混、忙后恢复、部分已记账再重试。逐任务核对无丢失或重复。

协作
排在 BL-report-rounds-auto-cap 后，由同一写手处理共享汇报端口和测试。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
