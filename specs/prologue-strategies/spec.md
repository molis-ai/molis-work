# Prologue 策略族：Context、MCP、Skill、Tool

状态：需求已整理（2026-11-13 合并四份策略；各份的用户决定与日期保留在子文档）。四份都尚未实现本次决定；代码、合同和默认行为不变。

四份子文档：

| 子文档 | 管什么 | 原状态 |
| --- | --- | --- |
| [Context](context.md) | 来源、预算、压缩、重读与按用户/任务/执行状态适配 | 需求已整理，尚未实施 |
| [MCP](mcp.md) | 服务器信任、发现、健康、三种权限选项、断开恢复与未知写入核对 | 需求已整理，尚未实施 |
| [Skill](skill.md) | 选择、唤起、渐进披露、组合与观测、多 Skill 部分失败与恢复 | 需求已整理，尚未实施 |
| [Tool](tool.md) | 工具面、搜索、结果预算与观测、按任务/阶段查找与调用、说明按需加载、发现不扩权 | 需求已整理，尚未实施 |

共同边界：四份都消费 Prologue SDK，但各自是独立需求；不要按一份的完成度推断其他三份。来源、信任、打包与压缩沿用 [context-program](../context-program/spec.md)；连接、协议、调用与审查沿用 [plugin-platform-v2](../plugin-platform-v2/spec.md)；Skill 包装、安装与信任沿用 [skill-packs](../skill-packs/spec.md)；工具形状、副作用链与审批沿用 [action-architecture](../action-architecture/spec.md)。

路线书去处：Prologue 上游与服务端批见[路线书](../post-anticorruption-roadmap/spec.md)第 61 批与 SRV 批；换 `vendor/prologue-sdk`、动真实 Home 仍逐项要用户批。

验收编号：不适用（四份子文档分别验收；合并前没有独立编号需要迁移）。
