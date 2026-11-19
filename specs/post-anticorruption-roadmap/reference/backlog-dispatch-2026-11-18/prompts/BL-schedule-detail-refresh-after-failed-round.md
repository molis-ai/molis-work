# BL-schedule-detail-refresh-after-failed-round · 定时任务失败时，开着的详情立刻显示原因

任务刚失败，用户不用整页刷新，就能在当前详情里看到哪次失败、为什么失败。

预计 **4–8 工时**。维护范围为E／Schedule 页面。正式交付项为 [96-2](../../batches/96.md#batch-96-item-2)。[原始待办](../../../../backlog/BL-schedule-detail-refresh-after-failed-round.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-schedule-detail-refresh-after-failed-round。正式交付项为 96-2，批次文件在 specs/post-anticorruption-roadmap/reference/batches/96.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-schedule-detail-refresh-after-failed-round.md。产品决定与验收按该 BL 的现行记录。

目标
定时任务失败时，开着的详情立刻显示原因。任务刚失败，用户不用整页刷新，就能在当前详情里看到哪次失败、为什么失败。

实施
复读 specs/proactive-assistant/evidence/18-p4-walkthrough.md 的 O3，从 plugins/native/schedule/src/browser/ 的详情读写、选择与刷新入口接到现有轮次结束信号。只更新对应任务。关闭详情或切换选中项时，迟到的响应不能覆盖新任务。

验收
node scripts/run-tests.mjs tests/schedule-isolated-page.e2e.test.ts。真实打开任务详情，让一次执行失败，断言无手动刷新即显示该轮及原因。再验从 A 切到 B 时 A 的结果不会写到 B。 涉及浏览器实操时用项目测试浏览器及隔离 Home。

协作
建议与 BL-schedule-update-task-lookup 共一个小批。两者没有硬前置，通常先改后端查询、再验页面。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
