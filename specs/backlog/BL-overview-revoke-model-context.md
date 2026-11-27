# BL-overview-revoke-model-context

分组：9. 平台小项与工程流程 / Prologue 上游

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-overview-revoke-model-context | 第 108 批 合入时同一项工作的旧工具结果会再次进入模型。本轮的 [B2R-02](../b108-review-remediation/spec.md) 在宿主记录已交付字段，授权缩小时使用现有 Prologue `digest` 模式。下一轮保留工作身份和本人输入，按当前授权重新读取可用摘要。原始执行记录保留在原会话。 | [修复验收 B2R-02](../b108-review-remediation/spec.md) | 明确后续做 | 完成宿主修复，待合入复验。 | Prologue 上游会话历史改写能力 | 高 | 一骏 |
