# BL-local-space-process-items-adoption

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-local-space-process-items-adoption | 没开账号同步的 Home（本地空间）在产品里没有采用入口：同步设置里的过程项四步要先有同步服务、且切换完成（`apps/local-host/src/space-sync-http.ts`、`apps/local-host/src/process-items-maintenance.ts`），而第 06 批合入后旧布局第 2 版的项目库在普通打开时被拒。要给这类 Home 一个采用入口（维护命令或设置里的本地采用），走同一个 `adoptProjectDatabase` 和 `retireFilesConsents`，从没同步过的待上传行照用户 11-12 的决定带进新日志 | [第 06 批](../post-anticorruption-roadmap/reference/batches/06.md)评审台（PR #2009）；[同步切换](../batch-06-shared-tools/sync-cutover.md) | 已知缺口 | 第 06 批按用户决定先做有同步的 Home；真实 Home 的采用等用户另行授权的维护窗口。开发机上的本地空间 Home 在入口做好之前，只能用导出的采用函数在隔离副本上处理 | 第 06 批已合入（#2009/a720）；剩余是采用入口实现，必须排在下一个碰真实 Home 的批之前 | 高 | 第 06 批之后接手资料与同步的批次（执行会话待分配） |
