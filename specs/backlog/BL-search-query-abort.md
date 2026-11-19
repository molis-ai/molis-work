# BL-search-query-abort

分组：4. 搜索、放置与工作流 / 调用次数

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-search-query-abort | 搜索 HTTP 的断连没有传到动作；个人空间 open 替换 access 时另丢 signal，引用读取将取消降为不可用。注意 catchUp/sync/indexer 属于多个查询共用的索引工作，不能因取消一个查询而停止。QEA-11～13 已补 HTTP 传递、个人空间与引用取消，保留共享索引 | [第 10 批](../post-anticorruption-roadmap/reference/batches/10.md#batch-10-progress) K2 线索；[当前审查 QF-08](../quality-experience-audit/report.md) | 已知缺口 | 本轮已实现并通过定向验收，待最终整合门禁/CI 后按来源流程关闭；不是仍未开工 | 无 | 低 | 系统搜索（本轮 Codex 实施，原归属保留） |

2026-11-16：真实 Home/项目 HTTP 取消 4、服务 37、Host 1、刷新预算 1、引用 4、对象权限 3 项通过；独立真实 stdio MCP 授权 12 项通过。共享索引实写后第二查询正常返回；不把保留共享索引工作视为取消失效。整项目任务仍在进行，当前代码尚未最终 CI 验收。
