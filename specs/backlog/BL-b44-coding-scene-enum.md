# BL-b44-coding-scene-enum

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b44-coding-scene-enum | 技能（`applies_to`、`last_used.caller`、`SKILL_PICK_CONSUMERS`）与记忆（`MEMORY_SCENES`、`current_scene`）合同里写死 `"coding"`。2026-11-17 D4 定为通用场景类别；若改成插件申报的场景名，要升技能库与记忆库版本并写连续升级步骤 | [第 44 批合后复查](https://github.com/molis-ai/molis-work/pull/2155) 2026-11-20 | 待你决定 | 值存在库里，改名要升库版本；此前按 D4 保留，用户 2026-11-20 定记 Backlog 以后排 | 技能库、记忆库的升级链 | 低 | 插件同等待遇（第 44 批）主会话（执行会话待分配） |
