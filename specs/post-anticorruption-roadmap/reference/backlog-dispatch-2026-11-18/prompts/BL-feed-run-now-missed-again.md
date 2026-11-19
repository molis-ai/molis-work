# BL-feed-run-now-missed-again · 资讯更新点过「现在做」，睡醒后直接做

你点了补拉资讯就合上电脑。十几分钟后打开，它应补拉一次，不能又把同一件事推回来让你选。

预计 **3–6 工时**。维护范围为Feed。正式交付项为 [95-2](../../batches/95.md#batch-95-item-2)。[原始待办](../../../../backlog/BL-feed-run-now-missed-again.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-feed-run-now-missed-again。正式交付项为 95-2，批次文件在 specs/post-anticorruption-roadmap/reference/batches/95.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-feed-run-now-missed-again.md。产品决定与验收按该 BL 的现行记录。

目标
资讯更新点过「现在做」，睡醒后直接做。你点了补拉资讯就合上电脑。十几分钟后打开，它应补拉一次，不能又把同一件事推回来让你选。

实施
查 plugins/native/feed/src/missed-pulls.ts 和 plugins/native/feed/src/store/sources.ts，参考 plugins/native/schedule/src/missed-runs.ts。让明确点过「现在做」的那一次有可恢复的决定，下次调度尊重它。其他未经处理的过点任务照常进待办。

验收
在隔离库用受控时钟跑「错过→现在做→停宿主超过十分钟→恢复→再次调度」，断言只执行一次、不再弹第二条。加普通错过的对照。运行 node scripts/run-tests.mjs tests/mainline-missed-runs.test.ts tests/schedule-resident-runtime.test.ts 及本次 Feed 回归。

协作
与 BL-missed-runs-never-expire 共用 Feed 的错过状态，建议先交这条，再接七天到期。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
