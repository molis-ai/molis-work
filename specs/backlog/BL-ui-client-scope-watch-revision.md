# BL-ui-client-scope-watch-revision

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-ui-client-scope-watch-revision | 页面的 `host.scope` 运行时有 `watchRevision(read, refresh)`（`packages/ui-host/src/client-lifecycle.ts`），`docs/platform/PLUGIN-DEVELOPMENT.md` 也让作者用它配合 `services.ui.invalidate()`，但公开合同 `UiClientScope`（`packages/contracts/src/platform/ui.ts`）没写这个方法。Git、Coding、Schedule 只好各在自己的 `browser/types.ts` 里补写同一个签名；外部作者照 SDK 类型写会报错。应把它写进 `UiClientScope`，三个插件改用公开类型 | 第 96 批 96-2 改写（PR #2165） | 已知缺口 | 改公开合同要跑 `pnpm api:update`、按共享核心跑全量，不随一个插件缺陷批做 | 无 | 低 | 平台（执行会话待分配） |
