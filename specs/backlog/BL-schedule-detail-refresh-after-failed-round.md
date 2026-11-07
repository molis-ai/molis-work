# BL-schedule-detail-refresh-after-failed-round

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-schedule-detail-refresh-after-failed-round | Schedule 的任务详情开着时，一轮失败（例如 `agent.model_not_configured`）不会出现在详情里，要整页刷新才看得到。这是 Schedule 自己的刷新问题，与任务授权无关 | [第 18 批 P4 实走记录](../proactive-assistant/evidence/18-p4-walkthrough.md) O3 | 已知缺口 | 不在第 18 批范围内；需要 Schedule 在一轮结束时更新开着的详情 | — | 低 | E 轨 |
