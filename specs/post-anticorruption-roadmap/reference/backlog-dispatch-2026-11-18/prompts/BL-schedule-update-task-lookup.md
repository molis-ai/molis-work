# BL-schedule-update-task-lookup · 编辑一项定时任务时，只查这一项

改一个任务现在会先列出所有任务再找它。直接按编号查，任务多时也不用连带读一整份清单。

预计 **2–4 工时**。维护范围为C／Schedule 服务。正式交付项为 [96-1](../../batches/96.md#batch-96-item-1)。[原始待办](https://github.com/molis-ai/molis-work/blob/6d22d58ae1a41215fe6723c15510d57b981b0200/specs/backlog/BL-schedule-update-task-lookup.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-schedule-update-task-lookup。正式交付项为 96-1，批次文件在 specs/post-anticorruption-roadmap/reference/batches/96.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-schedule-update-task-lookup.md。产品决定与验收按该 BL 的现行记录。

目标
编辑一项定时任务时，只查这一项。改一个任务现在会先列出所有任务再找它。直接按编号查，任务多时也不用连带读一整份清单。

实施
从 plugins/native/schedule/src/actions.ts 的更新动作和 plugins/native/schedule/src/service.ts 的服务端口向下追。复用已存在的按 ID 读取能力，限定当前项目。若端口缺少该能力就最小补齐。保留每日／一次性任务未传字段的语义以及找不到任务的结果。

验收
node scripts/run-tests.mjs tests/schedule-actions.test.ts tests/schedule-one-off-tasks.test.ts。用多个任务验证只读目标、没有调用整表列表，且另一个项目的编号不能用来修改。

协作
可先做。与失败后刷新分前后端。两人独立验收时避开共享夹具。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
