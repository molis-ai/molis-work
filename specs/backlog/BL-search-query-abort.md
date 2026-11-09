# BL-search-query-abort

分组：4. 搜索、放置与工作流 / 调用次数

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-search-query-abort | `/api/search/query` 在请求中止或连接提前关闭时不把中止交给各搜索来源：打字时旧查询被页面放弃，宿主仍把每个来源跑完。第 10 批 K2 的 `/api/composer/*/pick` 已按 `bindLocalWebActions(..., { signal })` 转交中止，搜索路由照同一写法改，并补「放弃的查询让来源看到 `actions.cancelled`、下一次只调一次」的用例（对抗式审查 N42～N56 的调用次数口径） | [第 10 批](../post-anticorruption-roadmap/reference/batches/10.md#batch-10-progress) K2 交回（11-08），旧代码的问题 | 已知缺口 | 是既有路由的问题，不是本批带来的，按第 11.1 节记 BL 不挡本批 | 无 | 低 | 系统搜索（执行会话待分配） |
