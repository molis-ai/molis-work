# BL-skill-category-prompt-text

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-skill-category-prompt-text | 技能里的服务类别（ASC-38～40）给模型看的补充说明在 `apps/local-host/src/agent-definitions/skill-connector-categories.ts` 里按 `locale.startsWith("zh")` 硬写中英两份；应改用 [Prologue AI 手册](../../docs/platform/PROLOGUE-AI.md)的提示词与词条机制，回复语言由平台一处给 | 第 61 批全 PR 评审（[#2133](https://github.com/molis-ai/molis-work/pull/2133)） | 已知缺口 | 第 61 批先按现有技能正文的拼接点做通，提示词词条化随 62 的 Skill 策略一起改 | 第 62 批四策略 | 低 | AI 运行时维护人 |
