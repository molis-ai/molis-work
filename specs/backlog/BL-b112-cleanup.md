# BL-b112-cleanup

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b112-cleanup | 第 112 批评审的不挡合并项与合入时漏的一步：① 补公共合同台合审——`UiShowToastOptions.undo`（`packages/contracts/src/platform/ui.ts`）与插件页面框和外层之间新加的 `toast-undo` 消息（`apps/workbench/src/browser/plugin-frame/types.ts`），#2338 合入前没过合审（执行手册第九节第 4 条）；② 插件页面框重新载入以后，之前 toast 上的「撤销」按了没有反应也没有提示（令牌只记在旧框里），应提示「已经撤销不了」或在框重载时收起这些 toast；③ `format.model.preference` 唯一的内置使用者（Jelly）删了，金样里不再有这个格式，随 [#2342](https://github.com/molis-ai/molis-work/pull/2342)（退役 Manifest 自报的模型选择）一起定退役还是补沙箱插件金样；④ 平台层的不一致（不是本批引入）：插件被撤权后经动作调用回「404 `actions.missing`」，在项目里关掉时回「403 `actions.plugin_disabled`」，没有 HTTP 路由的插件页面分不出「权限被撤」和「已卸载」 | [112 合入记录](../post-anticorruption-roadmap/reference/batches/112.md#batch-112-merged)、#2338 评审 | 未实现 | 批次已合入，按[执行手册](../post-anticorruption-roadmap/reference/batch-runbook.md)第九节第 6 条随下一批小修做，不开合后审计 PR | ③ 等 #2342 | 中 | 执行会话待分配 |
