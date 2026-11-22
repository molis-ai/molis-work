# BL-mr21-personal-purge-finalize

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-mr21-personal-purge-finalize | 个人云同步 `PCSYNC-OPT-16` 的本机最终清理没有生产调用方：`apps/local-host/src/project-deletion-service.ts` 的 `finalizeExpiredPersonalProject` 只有测试在调，客户端也读不到服务端的过期清理凭据（`server_purged_at`），云端过 30 天清掉的项目在本机永远留在回收状态。要在个人同步拉取时认出项目墓碑与清理时间，经受保护入口调用最终清理；先删除后取消回收的顺序问题由 #2200 修 | [三天复核](../main-review-1121/spec.md) P1-3（2026-11-21） | 部分实现 | 要先定同步协议里清理凭据的形状与来源，碰 #2200 正在改的同步与删除文件，等它合入后接 | #2200 | 高 | 待分配 |
