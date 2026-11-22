# BL-work-brief-sync-singleton-conflict

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-work-brief-sync-singleton-conflict | M1-B5 在同步界面说明两台设备各自新建同一项目的首页简报或同一账号的个人简报时的冲突 | [M1-B1 简报同步验收](../personal-cloud-sync/plugin-replication.md#m1-b1-risk-and-work-brief-acceptance-scope) | 明确后续做 | 两端分别生成简报标识，本机的唯一约束保留当前简报 | M1-B5 同步冲突与失败提示 | 中 | Workbench 同步界面（执行会话待分配） |

验收时分别复现项目首页简报与个人简报的独立创建。在同步界面说明两台设备各有一份简报、当前设备的内容已保留、这两份无法自动合并。M1-B5 只补清晰提示。
