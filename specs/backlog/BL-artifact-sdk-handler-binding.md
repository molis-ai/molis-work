# BL-artifact-sdk-handler-binding

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-artifact-sdk-handler-binding | 插件成果 SDK 其余 7 个动作处理器（`modules/artifacts/src/plugin-client.ts` 的 read、head、own、publish、record、process-head、process-own）改用 `bindActionHandler` 按 schema 读输入类型，去掉 `value as …`；为此把 `plugin-action-schemas.ts` 里共用的 schema 写成字面量。顺带删掉 Shelf 对 `listConsumable()` 结果再按消费类型过滤的一步（`plugins/native/shelf/src/runtime-actions.ts`，平台本来就只给声明消费的类型）。 | 第 98 批 PR [#2154](https://github.com/molis-ai/molis-work/pull/2154) 评审不挡合并第 4 条与收尾清理候选，2026-11-19 | 明确后续做 | 98 只迁了 `list` 一个处理器（它的输入本批新加了字段）；其余 7 个的输入 schema 引用 `record`、`origin` 等共用定义，写成字面量要连 Artifacts 插件那份副本一起核（`tests/plugin-artifact-schemas.test.ts`），不在 98 范围。Shelf 那步不改行为，但 Shelf 不在 98 范围 | 无。schema 的值不变，动作合同快照不变 | 低 | 成果与过程项模块维护人 |
