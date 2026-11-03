# Molis Work 文档入口

按你要做的事选一条阅读路径；需要判断某项规则或事实以哪份文档为准时，查 [SSOT「文档各管什么」](SSOT-MATRIX.md#1-文档各管什么)。本页只导航，不另维护功能状态、包清单或执行规则。

## 按任务阅读

| 要做的事 | 从这里开始 | 按需继续 |
| --- | --- | --- |
| 使用产品、连接 Runtime | [产品介绍](../README.zh.md)（[English](../README.md)）→ [安装与维护](installation.md)（[English](installation.en.md)） | [Runtime 协议](runtime.md)（[English](runtime.en.md)）、[MCP 接入](mcp.md)（[English](mcp.en.md)）；让 Runtime 在项目中工作见 [Runtime Skill](../skills/goal-advance/SKILL.md) |
| 开发或修改插件 | [插件开发 Skill](../skills/molis-plugin-dev/SKILL.md) → [插件开发手册](platform/PLUGIN-DEVELOPMENT.md) | Skill 给开发步骤，手册解释本地运行、动作录取与打包签名；[动作基本合同](../specs/action-architecture/spec.md)规定注册、调用与授权；具体包的边界和验证看包 README |
| 修改平台 | [仓库协作规则](../AGENTS.md) → [CLI 与开发](cli-and-development.md)（[English](cli-and-development.en.md)）→ [SSOT 包归属](SSOT-MATRIX.md) | [架构](system/ARCHITECTURE.md)、[依赖边界](system/PACKAGE-BOUNDARIES.md)、[并行开发](system/PARALLEL-DEVELOPMENT.md)；改界面看 [DESIGN](../DESIGN.md)，调模型看 [Prologue AI Skill](../skills/molis-prologue-ai/SKILL.md)与[手册](platform/PROLOGUE-AI.md) |
| 发布、安装维护或处理 Home 数据 | [发布策略](releases/POLICY.md) → [发布检查清单](releases/CHECKLIST.md) | [安装与维护](installation.md)、[Home 数据归属](system/HOME-DATA.md)、[合同变更](system/CONTRACT-CHANGES.md)；版本变化查 [CHANGELOG](releases/CHANGELOG.md)及该版本的发布记录 |
| 接续任务或确定下一步 | [规格书索引](../specs/README.md) → 对应任务的 spec、当前状态与证据 | [统一待办](../specs/BACKLOG.md)查剩余事项，[路线书](../specs/post-anticorruption-roadmap/spec.md)查依赖与排期，[需求开发流程](../specs/post-anticorruption-roadmap/development-workflow.md)查从立项到收尾的步骤 |

## 怎样判断材料的用途

| 材料 | 怎样使用 |
| --- | --- |
| 现行规范 | 从 [SSOT](SSOT-MATRIX.md#1-文档各管什么)和[规格书索引的「现行规范」](../specs/README.md#现行规范)进入。产品承诺、事实归属与执行规则各有主人；规范里的目标和约束不等于每项能力均已实现或发布。 |
| 执行中或待验收的需求 | [规格书索引的「在做的」](../specs/README.md#在做的)也包含尚未实现的需求。读对应 spec 的状态、验收与证据；分支实现、合入 main、工程验证、产品实操与用户验收分别判断。 |
| 历史记录 | [文档归档](archive/)、[规格书归档](../specs/archive/)和 [0.1.x Bug 台账](molis-work-bug-cards.md)保留当时的事实与决定，不作为当前操作步骤。归档不等于全部实现或验收通过，剩余事项见归档说明指向的待办。 |
| 设计与运营材料 | [设计参考与原型](design/README.md)用于理解方案，生产 UI 以 [DESIGN](../DESIGN.md)和组件板为准；[产品运营文档](product-operations/README.md)用于产品表达与场景研究，使用时保留其基线、成熟度与示意标记。 |

遇到文档与实现不一致，沿 SSOT 找到 owner 后核对当前代码和验证记录，再修正对应说明。旧截图、历史报告或某次测试通过，都不能单独证明当前版本可用。
