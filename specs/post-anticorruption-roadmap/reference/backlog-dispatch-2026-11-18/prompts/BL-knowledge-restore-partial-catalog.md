# BL-knowledge-restore-partial-catalog · 恢复 Home 时，别把还没找到的知识卡删掉

恢复后搜索目录要花时间重建。只看到一部分卡时就按缺失清理，卡可能会消失，重建后原来写好的内容也可能找不回来。

预计 **8–16 工时**。维护范围为知识线。正式交付项为 [73-3](../../batches/73.md#batch-73-item-3)。[原始待办](https://github.com/molis-ai/molis-work/blob/3a6f2289a0b526d0496481ee060807c23ed337f3/specs/backlog/BL-knowledge-restore-partial-catalog.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-knowledge-restore-partial-catalog。正式交付项为 73-3，批次文件在 specs/post-anticorruption-roadmap/reference/batches/73.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-knowledge-restore-partial-catalog.md。产品决定与验收按该 BL 的现行记录。

目标
恢复 Home 时，别把还没找到的知识卡删掉。恢复后搜索目录要花时间重建。只看到一部分卡时就按缺失清理，卡可能会消失，重建后原来写好的内容也可能找不回来。

实施
沿 apps/local-host/src/knowledge-actions.ts 的 knowledge.list、settle／organizer.kick 和 horizontal/knowledge/src/organize.ts 的 reconcile 查所有入口。区分「目录没追完」与「完整目录确认来源已删」。前者保留卡的身份、正文、手改与排除状态、已用生成额度，后者仍可按规则清理。覆盖恢复后首次列卡和后台整理，兼顾索引重建。

验收
node scripts/run-tests.mjs tests/knowledge-fresh-catalog.test.ts tests/knowledge-cards.test.ts。用可控的部分→完整目录与隔离恢复样本比对卡 ID、已有正文、生成次数，另验真正删除。历史曾观察到 14→3→14。模型正文丢失是待验证风险。

协作
建议最先开工。现行离线恢复已受影响，73-3 可复用结果做整份 Home 导入验收。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
