# BL-missed-runs-never-expire · 错过的任务统一留七天，到期一次说清跳过了几件

资讯、定时、助理跟进和一次性提醒都从原定时间起保留七天。七天内你可补做或跳过，逾期未处理的统一跳过并汇总。

预计 **12–24 工时**。维护范围为主动助理线协调各来源。正式交付项为 [95-3](../../batches/95.md#batch-95-item-3)。[原始待办](../../../../backlog/BL-missed-runs-never-expire.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-missed-runs-never-expire。正式交付项为 95-3，批次文件在 specs/post-anticorruption-roadmap/reference/batches/95.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-missed-runs-never-expire.md。产品决定与验收按该 BL 的现行记录。

目标
错过的任务统一留七天，到期一次说清跳过了几件。资讯、定时、助理跟进和一次性提醒都从原定时间起保留七天。七天内你可补做或跳过，逾期未处理的统一跳过并汇总。

实施
用户已定从 due_at 起算七天。查 packages/contracts/src/platform/scheduled-runs.ts、plugins/native/feed/src/missed-pulls.ts、plugins/native/schedule/src/missed-runs.ts、apps/local-host/src/assistant/assistant-followups.ts，沿当前汇总界面接展示。让各来源自行保存处理事实。离线跨过期限也补处理。已人工处理的不计入汇总，过期记录多于第一页时也处理完整。

验收
node scripts/run-tests.mjs tests/mainline-missed-runs.test.ts tests/schedule-missed-runs.test.ts 并补各来源回归。用受控时钟测期限前、刚满七天、关机跨期、一次性提醒、「现在做」与到期同时发生、重启不重复提示。

协作
先接 BL-feed-run-now-missed-again 的已处理状态。若两项都改 Feed 库版本就顺序接入。与 Schedule 编辑线共改合同／测试时交给同一处写入。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
