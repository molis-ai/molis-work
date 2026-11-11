# BL-goal-evidence-display

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-goal-evidence-display | 逐项依据已经随 `goals.state.read`、`goals.events.read` 返回（每条要求的最新报告带所核版本、方法、观察、证据引用、可信层级 `tier`、缺口 `gap`，要求带 `satisfied_by` 与 `conclusion_superseded`），但界面还没有显示：Goal 页面的要求列表、收尾原因与助理的「要求与成果对照」栏（PWA 定样 B）都还只显示「已满足／待你认可」。要补：每条要求显示凭什么满足（你认可、平台命令核验、另一会话复查）、核对的是哪一版、缺什么；认可的版本和最新报告的版本不同时并排显示 | [第 24 批第 3 项](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-item-3)；[11-04 核账](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-audit)缺口 8；[proactive-assistant](../proactive-assistant/spec.md) | 未实现 | 第 24 批只落合同与规则，不动界面；助理一栏属 32 批第 2 项，Goal 页面的显示要先定样 | 32 批第 2 项；界面定样 | 中 | E 轨（Goal 页面）、A 轨（助理） |
