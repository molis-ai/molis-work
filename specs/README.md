# 规格书怎么放

根目录只放三样：**在做的** spec、**现行规范**、[统一待办清单](BACKLOG.md)。其余都在 [`archive/`](archive/)。

## 在做的

- [goal-closure-identity](goal-closure-identity/spec.md)：完成前的「必须你点头」接到真实检查（授权和接受要求都只对当时的约定和那一轮工作有效）；管理入口固定记本机这个人；决策工具 schema 不再要求 `actor_id`；这些 typed 入口插件够不到（`host_only`）。
- [plugin-picker-dock](plugin-picker-dock/spec.md)：插件切换器里「常驻 Dock」与「装没装」合成一张网格，悬停才出现的两个图标按钮，添加与移除不刷新页面。
- [repository-anti-corruption](repository-anti-corruption/spec.md)：系统性代码与架构防腐整理（防腐收尾第二步）。
- [artifact-positioning](artifact-positioning/spec.md)：Artifact 定位与动线梳理，所有插件统一进同一个壳子。
- [coding-quality-assurance](coding-quality-assurance/spec.md)：Coding 质量保证（已定方向，防腐收尾后做）。
- [risk-plugin](risk-plugin/spec.md)：专门记录风险的插件（风险已移出 Goals）。

## 现行规范

仍被 `AGENTS.md`、SSOT、Skill 或包 README 引为现行规则的 spec。它们不归档；改规则就改它们。

- [action-architecture](action-architecture/spec.md)：能力怎样注册、发现、调用、授权（§3「基本合同」）。
- [plugin-platform-v2](plugin-platform-v2/spec.md)：插件能声明什么、宿主怎么装配、插件之间怎么交换。
- [molis-work-architecture-reorganization](molis-work-architecture-reorganization/spec.md)：架构与包重组基线。
- [coding-plugin](coding-plugin/spec.md)：Coding 的单一需求来源，下一阶段见 [next-requirements.md](coding-plugin/next-requirements.md)。
- [craft-finish](craft-finish/spec.md)：界面设计规范。
- [ui-craft-floor](ui-craft-floor/spec.md)：界面工艺底线。

## 还没做的事

都在 [BACKLOG.md](BACKLOG.md)，那是唯一来源。spec 里不再另记「未完成」。

## 规则

**开工。** 新任务在根目录建 `specs/<task>/spec.md`，第一段写状态句：`状态：<执行中/待验收/…>（日期）。`。进度与证据写在同一份 spec 里，不另开进度文件。验收标准写在标题含「验收」的一节，逐条带编号（见下面「验收编号」）。

**归档。** 任务做完（包括只差用户验收的），在开头补一句归档状态，写明判定、依据和日期，然后整个目录移到 `archive/`：

```
> 归档（YYYY-MM-DD）：判定为**已实现 / 部分实现 / 未实现 / 已被取代 / 已作废**。<依据>。剩余事项已移到统一待办清单：BL-xxx。
```

- 判定以 main 上的代码和真实行为为准，不只看原状态句。
- 已被取代的，写明被哪份 spec 或哪个决定取代。
- 部分实现或未实现的，先把剩下的事逐条抽进 [BACKLOG.md](BACKLOG.md)，再归档；只差用户验收的，列进清单的「待你验收」。
- 判断不了的不归档，在 BACKLOG 的「待你决定」里写明缺什么证据。
- 归档时同步改仓库里所有指向它的链接（代码注释、README、`docs/`、`skills/`、测试），再跑断链检查和 `pnpm boundary:check`。

**验收编号。** spec 的验收标准逐条带一个编号，测试引用它；改需求时一查编号，就知道哪些测试要跟着改。

- **写法**：验收标准在标题含「验收」的一节里（`## 验收标准`），每条以编号开头，有序列表、无序列表、表格第一格都行：`1. **DOCK-03** 静止时条目的按钮不可见……`。编号是 2 到 8 个大写字母、一个连字符、2 或 3 位数字。字母是这份 spec 的前缀（目录名的缩写）：一份 spec 一个前缀，一个前缀只属一份 spec，也不用 `BL`、`PMR`（待办与合入后审查的编号）。数字在这份 spec 里往上数。
- **不改号、不复用**：删掉一条标准，把它写成 `~~DOCK-04~~ 已取消：<理由>`，编号继续占着；改一条的内容，编号不变；新加的条目从最大的号往后排。同一个标题下只要有一条带编号，其余的列表项和表格行也都要带。
- **归档以后编号还在**：spec 移进 `archive/` 以后，它的前缀仍然属于它，别的 spec 不能再用；它的编号仍然算「有人定义」，老测试里引用的 `DOCK-03` 不会因此变成没人认的引用。检查读 `archive/<目录>/spec.md` 里的编号，只当定义用：归档的 spec 不要求测试覆盖，也不要求补编号。
- **测试引用编号**：证明这一条的测试，把编号写进测试名（`test("DOCK-03 at rest an entry shows no buttons", …)`），或写在测试旁的注释里。一个测试证明几条就写几个；写成范围（`DOCK-01..05`）只算第一个。引用的是 `tests/` 下的测试文件和各处的 `*.test.*`；任何 `fixtures/` 目录里的文件都不算，叫 `*.test.*` 也一样（`vendor/`、`node_modules/`、`dist/`、`.impeccable/` 同；这几个目录在仓库根还是嵌在哪一层都一样）。
- **不能用测试证明的**（真机、要人来判断、等用户自己试用）：在那一条里写 `[人工]`，不再要求测试，证据写进 spec 的证据节。
- **整份 spec 没有可编号的标准**（程序性的 spec，验收在别处逐项闭环）：开头状态句附近写一行 `验收编号：不适用（理由）`。
- **检查**：`node scripts/check-spec-coverage.mjs`。现在是**报告模式**，不管找到什么退出码都是 0（只有参数写错、或 git 读不了仓库才退出 2），CI 里只当信息：列出有验收一节却没有编号的 spec、没有测试引用的编号、测试里引了 spec 里没有的编号，以及重号、串用的前缀（含已归档 spec 占着的前缀）。`--strict` 是它变成门禁以后的样子；在做的 spec 都编好号、报告里没有问题之后再把 CI 那一步改成 `--strict`。

**现行规范** 不归档。规则变了就改原文；一份规范被新 spec 整体取代时，新 spec 成为现行规范，旧的按上面的规则归档。

## 梳理记录

- 2026-10-01：全量梳理根目录 193 份 spec。7 份确认为现行规范；186 份归档（已实现 104、已被取代 70、部分实现 8、已作废 4），剩余事项抽进 BACKLOG。逐份判定与依据见 [合入后审查 §8](archive/post-merge-review/spec.md#8-spec-梳理)。
- 2026-10-02：`home-one-screen` 归档（已实现，只差用户试用，BL-111；负责会话确认）。#150 带进根目录的两份归档：`performance-preserving-fixes`（部分实现，BL-109）、`project-management-freeze`（诊断记录，BL-110）。同时把仓库里 109 处指向本机路径（`/tmp`、`/Users/…`、`node_modules`）的链接改成仓库内相对链接；仓库外的只写成路径文本。
- 2026-10-10：`casebook-plugin` 归档（已作废；用户决定删除 Casebook，插件以后重做，防腐整理 §1）。
- 此前两批（158 份）按开头状态句与代码核对归档。
