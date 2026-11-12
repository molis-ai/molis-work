# BL-workbench-unused-deps

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-workbench-unused-deps | `apps/workbench/package.json` 的 `marked` 与 `sanitize-html` 已没有代码 import（main 上就如此，B27SRC 后 SDK 也换成 Micromark）；删依赖要动锁文件，删前核对构建与页面资源不变。Pages 的 `plugins/native/pages/src/import-content.ts` 自己用的 `marked` 不在此列 | [第 27 批收尾检查](../post-anticorruption-roadmap/reference/batches/27.md#收尾检查) 第 4 问；[公开代码源](../visual-ui-experience/work-items/batch27-code-source/spec.md) | 明确后续做 | 留给下一次依赖整理，不在功能批里动锁文件 | — | 低 | 工程流程（统筹） |
