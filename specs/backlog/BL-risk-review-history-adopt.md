# BL-risk-review-history-adopt

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-risk-review-history-adopt | 风险详情的复查段按定样显示**历次结果**（助理带来的用 `mw-brought` 标出），到期结果给建议，人点「采纳／不采纳」才改处置计划；今天只显示 Schedule 任务最后一轮的结论（需要你看／没有实质变化分开）、没跑成的原因和读取授权，没有历次列表与采纳 | 第 17 批 D 轨合审（PR #2058，头 293e6c31d0 退回第 3 条），偏离记在 `specs/risk-plugin/implementation.md` §10 第 8 条 | 部分实现 | SDK `/ui` 没有导出助理带来内容的部件（`mw-brought`），Schedule 一轮的结果是一段文字、没有结构化的建议可采纳 | SDK 的 brought 部件；Schedule 一轮结果带结构化建议（或风险自己的建议动作） | 中 | C 轨（执行会话待分配） |
