# BL-context-bar-surface-composition

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-context-bar-surface-composition | 浮条与情境行的确定排序和版面（`packages/kernel/src/contextual.ts` 的 `fragmentCandidates`、`contextualCandidates`、`ruleScores`、`planContextualLayout`）也是确定组合，接进第 15 批的组合服务（`horizontal/surfaces`），不再留第二套 | [第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md)「还没定的一处」；[第 15 批评审台收尾检查](https://github.com/molis-ai/molis-work/pull/2017#issuecomment-6823945201) | 明确后续做 | 第 15 批第一片的组合服务不接浮条，浮条的行为归 [context-program](../context-program/spec.md) | 组合服务（第 15 批） | 中 | 情境线 |
