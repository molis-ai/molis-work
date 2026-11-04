# 动作架构迁移记录索引

状态：历史记录（2026-09-25 至 2026-09-28）；2026-11-03 按主题分册。记录中的实现和测试结果只对应当时提交与环境，不能替代当前版本验证。

现行动作合同见[总需求书](spec.md)；当前包归属见[SSOT](../../docs/SSOT-MATRIX.md)，防腐后续事项见[统一待办](../BACKLOG.md)，当时的决策见[防腐归档](../archive/repository-anti-corruption/spec.md)。原记录中“尚未提交/发布”“待迁移”等状态保留在历史分册，不再作为本页当前结论。

| 查找内容 | 覆盖范围 |
| --- | --- |
| [盘点与早期验证](migration-history/overview.md) | 阶段快照、25 个插件盘点、平台消费方与初期检查 |
| [插件与 Runtime 接线](migration-history/plugins-and-runtime.md) | Jelly、Cognia、Dataset、Form、PPT、Images、Alchemist、Artifacts、Files/Git 与 MCP |
| [Goals 与对象读取](migration-history/goals.md) | Goals 动作、生命周期、关系规则、规划方法、连接摘要与目标正文 |
| [首页、场景与 Agent](migration-history/scenes-and-agents.md) | Session、首页发现与执行、场景作者、Feed/Inbox、授权与 Agent |
| [收尾回归与实操复查](migration-history/verification.md) | 2026-09-26/27 的回归、真实 Home/客户端覆盖、反例与调用链复查 |

[2026-09-28 main 复查报告](review-2026-09-28.md)保留发现、修复与证据边界。历史记录没有宣称逐项重测全部 2,600 项、覆盖所有商业服务或 UI 分支；整理不补做产品验收，也不把局部验证升级为完整验收。
