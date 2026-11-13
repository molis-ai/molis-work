# BL-sdk-home-aggregate-query-export

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-sdk-home-aggregate-query-export | 插件 SDK 根入口导出 `isHomeAggregateQuery`（`packages/plugin-sdk/src/action-declarations.ts`），它是宿主判断 Home 聚合查询用的，插件作者不该用；移到宿主一侧或私有子路径，改公开 API 快照 | [第 15 批评审台意见 S6](https://github.com/molis-ai/molis-work/pull/2017#issuecomment-6823945201)；[第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md) | 明确后续做 | 改 SDK 公开 API 要单独评审，不在功能批里顺手动 | — | 低 | 合同（C 轨） |
