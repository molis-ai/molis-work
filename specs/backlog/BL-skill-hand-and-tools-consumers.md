# BL-skill-hand-and-tools-consumers

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-skill-hand-and-tools-consumers | 第 31 批把 SDK 的 `find-skills`／`read-skill` 放进了 Agent 工具目录，但还没有角色/消费者声明它们；Coding 现在的自动技能仍是旧的「auto 全列」路径（`plugins/native/coding/src/skill-tools.ts` 的 `autoSkillsOf`／`autoSkillMaterial`）。消费 SDK 选择器与 `find-skills` 的接入归 Skill 策略的消费者片（41-1 等），届时把旧路径列为候选删除。 | 第 31 批（SKL-02/03/05/07/15 的 SDK 侧）；[Skill 策略](../prologue-skill-strategy/spec.md) | 明确后续做 | 选择器的消费者要按 Skill 策略的设计接（点名优先、理由投影、设置页），不在 SDK 窗口里做 | 第 31 批合入 | 中 | A／助理与输入，E／插件（执行会话待分配） |
