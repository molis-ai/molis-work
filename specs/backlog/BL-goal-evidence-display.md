# BL-goal-evidence-display

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-goal-evidence-display | 逐项依据已随平台 `acceptance.read@1`（第 44 批 44-3 起取代原 `goals.state.read` 私有字段）返回，且工作台要求栏（`apps/workbench/src/work-acceptance-parts.ts`）已展示所核版本、方法、观察、证据与 `machine_checked`/自述区分。仍留：① `work-acceptance-parts.ts:34` 尚未将 `peer_reviewed`（另一会话复查）与 `self_reported` 区分展示；② Goal 文档内联要求列表（`plugins/native/goals/src/event-document-ui.ts:237-251`）与收尾原因仍只显示简短状态，未内联展开依据档位与版本差异 | [第 24 批第 3 项](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-item-3)；[11-04 核账](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-audit)缺口 8；[proactive-assistant](../proactive-assistant/spec.md) | 部分实现 | 2026-11-22 核：平台要求栏主体已随第 32-2 批落地，Goal 文档内联展示与 `peer_reviewed` 档位区分待第 66-3 批定样收口 | 第 66-3 批界面定样 | 中 | E 轨（Goal 页面）、A 轨（平台要求栏） |
