# BL-plugin-release-module-source

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-plugin-release-module-source | 产品是否继续在 `plugin_runtime_release_artifacts` 里存内置插件的 `module_source`。这张表只增不减，代码只有 `packages/plugin-runtime/src/supervisor.ts:500-532` 那条回退读取在用，而用户 2026-10-08 定内置插件一律跟当前构建（`packages/plugin-runtime/README.md:104`），这条路今天用不上。金样里每个库约 5 MB；同一行的 `manifest` 产品真在读，要留。另外存着的代码里有 4 份本来就加载不了：`createCodingPlugin`、`createFeedPlugin` 因为 `postcss` 的 CommonJS `Dynamic require`，`createGoalsPlugin`、`createHomeGoalsPlugin` 因为 `plugins/native/goals/src/module/planning/method-packs.ts:135-138` 的 `new URL` 报 `Invalid URL`。 | [第 05 批](../post-anticorruption-roadmap/reference/batches/05.md) U2-c，评审台查明；用户 2026-11-08 定回放不测这条路、代码照存 | 待决定 | 改的是库里存什么，要定回退读取还要不要，不属于金样这一片。用户今天碰不到：内置插件不走这条路。 | 无；改表结构要带升级段 | 低 | Plugin Runtime |
