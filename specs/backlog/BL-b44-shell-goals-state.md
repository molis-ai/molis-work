# BL-b44-shell-goals-state

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b44-shell-goals-state | 工作台外壳仍持有 Goals 的状态与画法（H4 未达成）：`goalData`（约 30 处）、`visibleGoals`、`goalWorkspaceMode`、`data-goal-*` 属性与 `frame-container.ts`（721 行）。应先做通用的页面客户端生命周期接口，再把这些搬回 Goals 的页面客户端，外壳不再点名 Goals | [第 44 批合后复查](https://github.com/molis-ai/molis-work/pull/2155) 2026-11-20 | 部分实现 | 工作量以天计，需要先设计通用的页面客户端生命周期接口；用户 2026-11-20 定记 Backlog 以后排 | `pluginPageClients` 已有的组装方式（第 44 批） | 中 | 插件同等待遇（第 44 批）主会话（执行会话待分配） |
