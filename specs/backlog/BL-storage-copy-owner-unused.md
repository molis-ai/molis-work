# BL-storage-copy-owner-unused

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-storage-copy-owner-unused | `openOwnerCopyStore`、`openAggregateCopyOwner` 没有产品调用方，`packages/storage/README.md:159` 还写 Images 复用它们。要么核实后删掉并改 README，要么把真正该用的地方接上。 | [第 05 批](../post-anticorruption-roadmap/reference/batches/05.md) U1-i 评审（[#1926](https://github.com/molis-ai/molis-work/pull/1926)） | 清理候选 | 不确定以后的升级链片要不要用，按清理规则先列为候选，不在不相关的片里删。U1-d 动 `packages/storage/src/aggregate-copy-store.ts` 时一起核。 | U1-d | 低 | 存储 |
