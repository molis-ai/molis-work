# BL-contract-comment-stale-versions

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-contract-comment-stale-versions | 产品代码里还有旧版本注释：`packages/contracts/src/platform/plugin.ts:172`、`:174`、`:178` 三条 `/** v2: … */`（分别注释 `event_types`、`agent_prompts`、`agent_skills`）写的是历史版本标记；第 02 批 N41 版本归一后这些形状的现行注册版本是 1，注释不再描述现行版本。注释属产品代码，第 02 批审计维修的边界只允许改文档，本次不改，登这条承接 | 2026-11-08 审计（N6） | 明确后续做 | 只改注释也要动 contracts 源码，本批边界只允许改文档，故不在本批改 | 无 | 低 | contracts 合同维护人（执行会话待分配） |
