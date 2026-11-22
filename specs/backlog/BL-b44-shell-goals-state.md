# BL-b44-shell-goals-state

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b44-shell-goals-state | 工作台外壳仍持有 Goals 的状态与画法（H4 未达成）：`goalData`（约 30 处）、`visibleGoals`、`goalWorkspaceMode`、`data-goal-*` 属性与 `frame-container.ts`（721 行）。应先做通用的页面客户端生命周期接口，再把这些搬回 Goals 的页面客户端，外壳不再点名 Goals。2026-11-21 三天复核（P1-7）补：`frame-container.ts` 还按 `"feed"`／`"inbox"` 分支并写死 `/api/stage/feed/objects/`，第三方插件拿不到同样的画框与正文加载，一并搬回各自的页面客户端；现在没有门禁能发现外壳里的插件名字符串分支 | [第 44 批合后复查](https://github.com/molis-ai/molis-work/pull/2155) 2026-11-20 | 部分实现 | 工作量以天计，需要先设计通用的页面客户端生命周期接口；用户 2026-11-20 定记 Backlog 以后排 | `pluginPageClients` 已有的组装方式（第 44 批） | 中 | 插件同等待遇（第 44 批）主会话（执行会话待分配） |
