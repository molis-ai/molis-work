# BL-actions-definition-casts

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-actions-definition-casts | N22 的两项过渡计数有盲区：定义处以 `expr as ActionDefinition<In, Out>` 写死输入/输出类型，既不进 `scripts/gates/action-input-counts.mjs` 的 `handlerInputCasts`（只认处理器输入上的 `as`），也不进 `handwrittenActionInputs`（只认 `createActionDefinition<X, …>` 与转交它的包装函数的类型参数），`specs/action-input-contracts` §9.2/AIC-19 给 N22-G 的检查面也没写这种 cast，回潮可以从这扇门进来。本批新写 12 处：`apps/local-host/src/project-workspace-actions.ts:85-93`（6 个 `as ActionDefinition<unknown, ProjectDirectories>`）与 `apps/local-host/src/project-workspace-http.ts:36-42`（6 个 `as ActionDefinition<never, ProjectDirectories>`）；生产代码 `as ActionDefinition<` 共 169 处（含测试与脚本共 178 处）。另：这两个文件的目录与资料处理器是手写 `handle(caller, value)` + `value as Record<string, unknown>` 的旧式写法（本批新写，不属于 T/S 片），按决定 29 落在第 55 批 T11/S 片，要在 55-T11 交接里写明 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批独立审计（N22/BL-900 分册 F4/F5） | 已知缺口 | 计数门禁只认两种写法；N22-G 原文没写 cast 形式；扩计数或改 N22-G 验收面是门禁/合同改动，超出本批授权 | 第 55 批第 3 项 N22-G、T11/S 片 | 中 | 第 55 批 N22-G（执行会话待分配） |
