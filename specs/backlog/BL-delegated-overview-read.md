# BL-delegated-overview-read

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-delegated-overview-read | 助理调用持有 `actions:delegate` 的插件动作，插件在里面再调 `overview.read@1` 时，嵌套调用仍是助理身份（不带 `delegated_by`），按助理的授权读到总览。要么转托调用盖 `delegated_by` 并由总览拒绝转托链，要么确认 `actions:delegate` 本就允许；补真实链路用例 | 第 108 批独立审查（PR [#2348](https://github.com/molis-ai/molis-work/pull/2348)） F-9 | 待你决定 | 读到的范围不超过本人授予助理的范围；是否允许经插件转托要用户定 | 无 | 低 | 一骏 |
