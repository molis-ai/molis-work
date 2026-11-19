# BL-report-rounds-auto-cap · 助理只汇报结果时，别占用继续干活的次数

多件后台工作接连交结果后，助理还应能继续原任务。汇报本身既不消耗次数，也不把已用次数清零。

预计 **8–16 工时**。维护范围为助理线。正式交付项为 [97-1](../../batches/97.md#batch-97-item-1)。[原始待办](../../../../backlog/BL-report-rounds-auto-cap.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-report-rounds-auto-cap。正式交付项为 97-1，批次文件在 specs/post-anticorruption-roadmap/reference/batches/97.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-report-rounds-auto-cap.md。产品决定与验收按该 BL 的现行记录。

目标
助理只汇报结果时，别占用继续干活的次数。多件后台工作接连交结果后，助理还应能继续原任务。汇报本身既不消耗次数，也不把已用次数清零。

实施
查 apps/local-host/src/assistant/ 下的 assistant-task-reports.ts、assistant-delegation.ts、assistant-continuations.ts、assistant-store.ts。用可持久识别的轮次用途区分只汇报和继续做，按仓库版本规则处理已有库。旧记录按有证据的语义处理，不能把所有宿主发起的轮次当作汇报。保留真正续做的上限和人的介入行为。

验收
node scripts/run-tests.mjs tests/assistant-task-reports.test.ts tests/assistant-continuation-control.test.ts。验证「续做→多次汇报→重启→续做」只数真正续做，仍在原上限停下。另验旧库升级。按实际变更更新 schema／版本快照。

协作
与 BL-work-line-report-batch 共用汇报代码，先做本条。#2138 正改 assistant-store.ts，若接线触及 #2123 也先核对。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
