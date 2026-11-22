# BL-contract-optional-field-old-packages

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-contract-optional-field-old-packages | 平台规定的输出 schema（如首页概况）在申报时逐字比对，所以在原版本上加一个可选项，已装的、申报了它的旧签名包就启动不了，要重新打包（第 15 批给 `start` 加字段、36A-6 加 `outline` 与 `lede` 都是这样）。要定一条通用规则并写进 `docs/system/CONTRACT-CHANGES.md`：这类加项是一律要求重新打包并在升级时明白告诉用户哪个插件要更新，还是让平台接受「申报的是现行 schema 去掉可选项后的子集」 | [第 36A 批](../post-anticorruption-roadmap/reference/batches/36a.md#batch-36a-item-6) PR #2232 评审；[决定 62](../post-anticorruption-roadmap/reference/decisions.md#decision-62) ① | 待你决定 | 这次按「重新打包」处理（用户 2026-11-22 定），通用规则涉及合同流程与升级提示，单独定 | 无 | 低 | 用户；平台线 |
