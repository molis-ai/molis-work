# BL-project-runtime-settings-baseline

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-project-runtime-settings-baseline | `apps/local-host/src/project-runtime-settings.ts` 的 `project_runtime_settings` 在项目库基线之外按需建表：同是第 1 版的项目库，有没有这张表取决于用户选没选过，以后的升级步骤都得处理「表可能不存在」。项目库第一次升版本时把它放进基线，并带升级步骤 | 第 02 批复查（2026-11-07）、[Home 数据归属](../../docs/system/HOME-DATA.md) | 明确后续做 | 统一起点已登记，放进基线就要升项目库版本：直接加进基线而不升版本，真实 Home 的项目库缺这张表，会被结构核对拒绝。原来挡着的升级链 U1 已由 [#1958](https://github.com/molis-ai/molis-work/pull/1958) 合入（2026-11-08 核），现在可以做：升项目库版本时把表放进基线，并写好升级步骤 | 无 | 中 | 存储维护人（执行会话待分配） |
