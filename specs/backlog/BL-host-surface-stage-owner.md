# BL-host-surface-stage-owner

分组：7. 平台与架构 / 工作台外壳

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-host-surface-stage-owner | 平台自带的框内页面（目前只有插件创作台，`apps/workbench/src/host-surfaces.ts`）有两处仍按插件目录查：舞台模型的 `sharedStageModel`（`apps/workbench/src/stage-renderers.ts`）只从 `BUILTIN_PLUGIN_CATALOG` 取插件编号，创作台会退回到项目键 `plugin-builder`，若它将来用 `drawing.mount` 挂别的部件会被拒；`pluginWorkbenchPacks` 用「传入的是不是插件目录」来换成含平台页面的完整名单。两处的写法都被 `scripts/check-package-boundaries.mjs`（DD2、Feed 部件）逐字钉住，改成读 `WORKBENCH_SURFACE_CATALOG` 要同时改这道门禁。今天创作台不用 `drawing.mount`，不影响行为。 | 第 47 批 47-1 C 只读评审 | 已知缺口 | 改门禁要先问用户；今天没有使用方 | 无 | 低 | 工作台外壳主人 |
