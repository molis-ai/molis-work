# 规格书怎么放

根目录只放三样：**在做的** spec、**现行规范**、[统一待办清单](BACKLOG.md)。其余都在 [`archive/`](archive/)。

## 在做的

- [post-merge-review](post-merge-review/spec.md)：全部需求合入后的功能审查、合并缺陷修复与 spec 梳理（防腐收尾第一步）。
- [context-toolbar](context-toolbar/spec.md)：情境动作从底栏搬到选区旁——与 Pages 格式条合并成系统级浮条，定义工具 / 动作两类内容与插件协议（设计已定，未开工）。§10 是各插件现状与可扩展场景。
- [quick-create](quick-create/spec.md)：每个插件一句话新建，与选区浮条里的「发送到…」共用一条起草 → 确认 → 创建的路径（设计已定，未开工）。
- [side-shelf](side-shelf/spec.md)：Shelf 不再是插件，成为右栏的一格；右栏（Shelf、灵光、文件、浏览器、讨论）与左边双向互动，落点与「放进左边」（设计已定，未开工）。
- [context-program](context-program/spec.md)：上面三份的总纲：一个动作池、一个情境中枢、一条浮条、一条执行路径；第 8 节是全部扩展能力的索引，第 9 节是合并后的分期。

## 现行规范

仍被 `AGENTS.md`、SSOT、Skill 或包 README 引为现行规则的 spec。它们不归档；改规则就改它们。

- [action-architecture](action-architecture/spec.md)：能力怎样注册、发现、调用、授权（§3「基本合同」）。
- [plugin-platform-v2](plugin-platform-v2/spec.md)：插件能声明什么、宿主怎么装配、插件之间怎么交换。
- [molis-work-architecture-reorganization](molis-work-architecture-reorganization/spec.md)：架构与包重组基线。
- [coding-plugin](coding-plugin/spec.md)：Coding 的单一需求来源，下一阶段见 [next-requirements.md](coding-plugin/next-requirements.md)。
- [craft-finish](craft-finish/spec.md)：界面设计规范。
- [ui-craft-floor](ui-craft-floor/spec.md)：界面工艺底线。
- [casebook-plugin](casebook-plugin/spec.md)：外部 Casebook 插件对宿主前置能力的说明。

## 还没做的事

都在 [BACKLOG.md](BACKLOG.md)，那是唯一来源。spec 里不再另记「未完成」。

## 规则

**开工。** 新任务在根目录建 `specs/<task>/spec.md`，第一段写状态句：`状态：<执行中/待验收/…>（日期）。`。进度与证据写在同一份 spec 里，不另开进度文件。

**归档。** 任务做完（包括只差用户验收的），在开头补一句归档状态，写明判定、依据和日期，然后整个目录移到 `archive/`：

```
> 归档（YYYY-MM-DD）：判定为**已实现 / 部分实现 / 未实现 / 已被取代 / 已作废**。<依据>。剩余事项已移到统一待办清单：BL-xxx。
```

- 判定以 main 上的代码和真实行为为准，不只看原状态句。
- 已被取代的，写明被哪份 spec 或哪个决定取代。
- 部分实现或未实现的，先把剩下的事逐条抽进 [BACKLOG.md](BACKLOG.md)，再归档；只差用户验收的，列进清单的「待你验收」。
- 判断不了的不归档，在 BACKLOG 的「待你决定」里写明缺什么证据。
- 归档时同步改仓库里所有指向它的链接（代码注释、README、`docs/`、`skills/`、测试），再跑断链检查和 `pnpm boundary:check`。

**现行规范** 不归档。规则变了就改原文；一份规范被新 spec 整体取代时，新 spec 成为现行规范，旧的按上面的规则归档。

## 梳理记录

- 2026-10-01：全量梳理根目录 193 份 spec。7 份确认为现行规范；186 份归档（已实现 104、已被取代 70、部分实现 8、已作废 4），剩余事项抽进 BACKLOG。逐份判定与依据见 [合入后审查 §8](post-merge-review/spec.md#8-spec-梳理)。
- 2026-10-02：`home-one-screen` 归档（已实现，只差用户试用，BL-111；负责会话确认）。#150 带进根目录的两份归档：`performance-preserving-fixes`（部分实现，BL-109）、`project-management-freeze`（诊断记录，BL-110）。同时把仓库里 109 处指向本机路径（`/tmp`、`/Users/…`、`node_modules`）的链接改成仓库内相对链接；仓库外的只写成路径文本。
- 此前两批（158 份）按开头状态句与代码核对归档。
