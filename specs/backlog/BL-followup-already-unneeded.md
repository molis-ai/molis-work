# BL-followup-already-unneeded

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-followup-already-unneeded | 首页「错过」提示里还要列出「已核对、不再提醒」的那几件（11-04 用户决定的 PWA-27 的一半）。今天助理跟进的结果里没有「已不需要」这一种，首页只能列错过的；要等跟进结果多出「已不需要」并按同一格式交出，首页再接上，不在平台另判 | [主动助理 spec §18 2026-11-04 决定](../proactive-assistant/spec.md#18-决策记录)、[resident-runtime-design.md](../proactive-assistant/resident-runtime-design.md) §10.1、[#2034](https://github.com/molis-ai/molis-work/pull/2034) 合后审计 | 明确后续做 | 没有数据来源：助理跟进的 `AssistantFollowUp` 结果今天没有「已不需要」一类；平台不替主人判断 | 助理跟进结果新增「已不需要」并交出 `runs.overview` | 低 | A 轨／助理（执行会话待分配） |
