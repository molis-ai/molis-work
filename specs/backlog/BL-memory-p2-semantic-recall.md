# BL-memory-p2-semantic-recall

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-memory-p2-semantic-recall | 语义／混合召回：在关键词之外增加可选的语义召回。**触发条件**：固定验证集里换了说法就召不回应该召回的记忆，且人工复核确认是漏召回。**算数**：同一验证集上漏召回下降，误召回、注入 token 和时延不超过冻结的界 | [prologue-memory-strategy §9.1、§3.2](../prologue-memory-strategy/spec.md)；[决定 36](../post-anticorruption-roadmap/reference/decisions.md#decision-36) | 明确后续做 | 没触发；先要有 P0 的质量与成本对照（BL-1073） | BL-1073 | 低 | C2／Memory |
