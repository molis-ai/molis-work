# Prologue Context 策略：来源、预算与压缩

状态：需求已整理（2026-10-21），待评审后实施。独立需求；来源、信任、打包和压缩沿用 [context-program](../context-program/spec.md) 与 Prologue `context/` 合同，本 spec 只补“每类内容给多少、为什么给、什么时候该重读、怎么压得不丢”。

同系列：[Skill](../prologue-skill-strategy/spec.md) · [Tool](../prologue-tool-strategy/spec.md) · [MCP](../prologue-mcp-strategy/spec.md)。

## 1. 问题与现状

Prologue `context/` 已经有：来源与信任等级、硬敏感名单、忽略规则、项目指令、嵌套规则、预算台账、打包与省略、必需项失败、来源指纹、入站筛查、压缩与分支摘要、微压缩、会话历史、提醒、文本资料。Molis 有 prompt 分层、`maxInstructionChars`、`MAX_COMPOSED_INSTRUCTION_CHARS`、独立的压缩 Prompt 和材料装配。

但“这一轮看见什么”仍是一个总预算：

1. **只有总预算，没有来源预算。** 项目指令、人的话、回忆、工具结果、MCP/网页、资料命中都抢同一个窗口；一段长指令或一个大工具结果可以把别的挤掉，而省略只记“没放下”。
2. **没有每条的代价。** `ContextItem` 有 `chars`，但打包按 token 估；回执里没有一个逐条的 token/来源/原因视图，App 很难解释“为什么这轮没带那条”。
3. **没有新鲜度。** 项目指令、嵌套规则、资料每次重读；没有版本/mtime/摘要，无法判断“这份规矩是不是旧的”，也无法避免重复读。
4. **没有缓存友好的分层。** 任何条目变化都改整包指纹；稳定前缀（角色、项目规则、技能元数据）和动态后缀（工具结果、召回、本轮问题）没有分开。
5. **压缩只有阈值。** 没有 coding / assistant / review 的压缩档；哪些必须逐字保留（用户原话、写/命令回执、待批准）靠各条规则散着写。
6. **没有指令冲突检查。** 多层规则可能互相矛盾；没有“哪条覆盖哪条”的报告，也没有重复检测。

## 2. 市面做法

| 路线 | 代表 | 值得借 | 不照搬 |
| --- | --- | --- | --- |
| 文件规则层级 | [Claude Code memory](https://code.claude.com/docs/en/memory)、Codex/本仓库的 AGENTS.md | 项目/用户/企业层级、导入、可审 | 把规则当数据；没有信任等级 |
| 结构化记忆 | [Cline Memory Bank](https://docs.cline.bot/best-practices/memory-bank) | 结构化文件、明确更新点 | 手动维护、无预算 |
| 上下文编辑 | Anthropic context editing / compaction | 工具结果清理、摘要保留关键项 | 静默丢历史 |
| Condenser | OpenHands condenser | 压缩触发、摘要、保留近期 | 只按 token 阈值 |
| 检索式上下文 | LangGraph / RAG | 按相关性取，不整库塞 | 用相关度替代必需项 |

### 2.1 来源与取舍

Context 是这五份里外部对照最薄的一份；下表只列直接影响本 spec 的来源，不冒充完整调研。后续应补 Codex/AGENTS.md、Cursor rules、OpenHands condenser、Aider repo map 的逐项对照。

| 来源 | 类型 | 它做了什么 | 采纳 / 拒绝 | 影响 |
| --- | --- | --- | --- | --- |
| [Claude Code memory](https://code.claude.com/docs/en/memory) | 官方文档 | `CLAUDE.md` 层级、导入、项目/用户范围 | 采纳层级与可审；拒绝把规则当数据 | profile、来源预算 |
| [Cline Memory Bank](https://docs.cline.bot/best-practices/memory-bank) | 官方文档 | 结构化 Markdown 文件、明确更新点 | 采纳结构化来源；拒绝手动无预算 | 来源分类、trace |
| [Anthropic context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing) | 官方文档 | 工具结果清理、压缩 | 采纳压缩剖面/保护项；拒绝静默丢 | 压缩、trace |
| [LangMem](https://www.langchain.com/blog/langmem-sdk-launch) | 厂商博客 | semantic/episodic 记忆与检索 | 采纳“检索式上下文”的思路；拒绝用相关度替代必需项 | 来源预算、profile |

## 3. 优化策略

### 3.1 上下文剖面

| 剖面 | 适用 | 默认侧重 |
| --- | --- | --- |
| `coding` | Coding / 编码 Agent | 项目规则、工作区事实、写/命令回执；少网页 |
| `assistant` | 个人助理 | 人的话、记忆、当前对象、跨会话材料 |
| `review` | 审查/判断 | 规则、证据、变更摘要；不带执行工具结果 |
| `minimal` | 小模型/低预算 | 只带必需项和本轮问题 |

剖面只决定来源配额、必需集合、压缩风格；硬边界（信任、必需项、预算失败）不变。

### 3.2 来源预算

- 每个来源类（persona / project-instructions / nested-rules / user / memory / skills / tool-results / mcp / web / source-hit / artifacts）有 `min` / `max` / `weight`。
- `context/budget` 仍只负责计数；本 spec 的 profile/来源预算属于 `context/pack` 的取舍策略，不改变 budget Contract。
- 先满足必需项，再按权重分配剩余；某类超上限先裁该类，不先裁别人的必需项。
- 回收顺序：低权重数据 → 可再读的工具结果 → 缓存/召回 → 非必需技能元数据；用户原话、写/命令回执、待批准不回收。
- 放不下仍是明确失败或省略，不静默截断。

### 3.3 逐条 trace

- 每条 `ContextItem` 带 `tokens`、`source`、`origin`、`stable`（前缀/动态）、`reason`（included / omitted / truncated / flagged）。
- `ContextPack.trace` 只给引用、来源、token、原因；不给正文，不给密钥/路径。
- App 能回答：这轮带了哪几类、各花多少、哪条被裁、为什么；不把 trace 当第二份上下文。

### 3.4 新鲜度

- 指令/规则/资料读取带版本或 mtime + 内容指纹；同一版本不重复读。
- 变更时给出 `context-source-changed`，下一轮重读；运行中的包不换。
- 无法判断新鲜度时标 `unknown`，不假装是新的；旧版本仍可回放。

### 3.5 缓存友好的打包

- 稳定前缀：persona、项目指令、嵌套规则、技能元数据、固定资料；动态后缀：本轮用户话、召回、工具结果、网页。
- 两个指纹：`prefixFingerprint`（前缀不变就不变）和 `packFingerprint`（整包）。
- 不拥有 Prompt cache；只保证前缀稳定、顺序确定、来源不变时字节不变。
- 这里只提供稳定前缀指纹，不实现缓存；缓存仍归 App/Provider。

### 3.6 压缩剖面

- `coding`：保留用户原话、写/命令回执、待批准、工具批次边界；摘要过程，不摘要回执。
- `assistant`：保留人的话、当前对象、未完成请求；摘要旧对话。
- `review`：保留规则、证据、变更摘要；不带执行细节。
- 压缩后必须真实缩短、保留保护项、满足预算；失败/取消不提交。
- 压缩器只选已提供的原文，不自己编；摘录为空要显式表达。

### 3.7 指令冲突检查

- 对项目规则、嵌套规则、persona 做确定性重复/矛盾检查：同一路径重复、同一主题相反、同一约束被放宽。
- 只报告，不自动改；报告带来源、版本、位置。
- 优先级仍按来源等级；报告帮助人改规则，不把“模型判断”当规则。

## 4. Prologue 合同

- `ContextProfile`：`coding` / `assistant` / `review` / `minimal`；`config.context.profile` 与 `config.context.profiles`（App 可覆盖）。
- `ContextSourceBudget`：`min` / `max` / `weight` / `reclaim`；按来源类配置。
- `ContextItem` 增加 `tokens`、`stable`；`ContextPack` 增加 `prefixFingerprint`、`trace`。
- `ContextPack.trace[]`：`{ source, origin, tokens, stable, reason }`；不含正文。
- `context-source-changed` 事件：来源、旧/新版本、时间；不含正文。
- `compaction.profile` + `preserve`：用户原话、写/命令回执、待批准、工具批次；压缩器输入带 profile。
- `instructionConflicts`：确定性检查结果；`context-conflict` 事件/回执；不自动修改。
- 现有 `context-pack` / `context-compaction` 槽保留；剖面是配置，不是新槽。

## 5. Molis Work 接入

| 位置 | 改什么 | 不做什么 |
| --- | --- | --- |
| `horizontal/agent-host` | 角色/执行档位映射到 context profile；来源预算；压缩 profile；trace 投影 | 不复制 SDK 打包 |
| `apps/local-host` | `MAX_COMPOSED_INSTRUCTION_CHARS` 与来源预算对齐；规则新鲜度；冲突报告 | 不把规则正文写进业务事实 |
| `apps/workbench` | “这轮带了什么/为什么没带”视图；来源成本；规则冲突提示 | 不显示密钥/裸路径 |
| `packages/contracts` | context trace / profile / conflict 投影；API 快照 | 不复制 SDK 类型 |
| `packages/storage` | 规则版本/新鲜度缓存；不新增第二套上下文账 | 不存完整上下文正文 |

Molis 的 [Agent Host](../../docs/horizontal/agent-host.md) 已有“Prompt 分层、材料、压缩”的调用链；本 spec 把“每类给多少、为什么、是否新鲜、怎么压”变成可配置、可回执，而不是继续堆在 `MAX_COMPOSED_INSTRUCTION_CHARS` 一个数上。

## 6. 分期

| 期 | 内容 | 完成时能证明 |
| --- | --- | --- |
| C0 | profile、来源预算、逐条 trace、prefixFingerprint | 能解释每轮带了什么、花了多少、为什么裁 |
| C1 | 新鲜度、压缩 profile、指令冲突报告 | 规则变了会重读；压缩不丢保护项；冲突可见 |
| C2 | 按任务评测、缓存命中、来源推荐 | 不同任务用不同剖面；缓存/成本可量化 |

## 7. 验收标准

| 编号 | 可观察标准 | 证明方式 |
| --- | --- | --- |
| PCTX-01 | 四个 profile 的来源配额/必需集合/压缩风格符合 §3；只能收窄硬边界 | Prologue 单测 |
| PCTX-02 | 某来源超上限先裁该类；必需项放不下仍明确失败，不静默丢 | Prologue 单测 |
| PCTX-03 | 每条 trace 带 source/origin/tokens/stable/reason；不含正文/密钥/裸路径 | Prologue 单测 |
| PCTX-04 | prefixFingerprint 只随稳定前缀变化；动态后缀变化不改前缀 | Prologue 单测 |
| PCTX-05 | 同一版本指令/资料不重复读；变化时发 `context-source-changed`，下一轮重读 | Prologue 单测 + Molis 测试 |
| PCTX-06 | 新鲜度未知标 unknown，不假装新；旧包可回放 | Prologue 单测 |
| PCTX-07 | 压缩 profile 保留用户原话、写/命令回执、待批准、工具批次；失败/取消不提交 | Prologue 单测 + live |
| PCTX-08 | 压缩后真实缩短、保护项仍在；空摘录可表达 | Prologue 回归 |
| PCTX-09 | 指令重复/矛盾报告带来源/版本/位置；不自动改规则 | Prologue 单测 |
| PCTX-10 | Molis 角色映射到 profile；`MAX_COMPOSED_INSTRUCTION_CHARS` 不越过来源预算 | Molis `agent-host` 测试 |
| PCTX-11 | Molis 能看“这轮带了什么/为什么没带”；不泄露正文 | Molis 设置页/工作台测试 |
| PCTX-12 | 规则/资料变化后下一轮重读；运行中的包不换 | Molis live |
| PCTX-13 | 压缩用对应 profile 的 Prompt；独立用量可解释 | Molis 压缩测试 |
| PCTX-14 | `[人工]` 在真实项目里用 coding/assistant 两个 profile 各完成一次工作，成本与遗漏可解释 | 人工 |

## 8. 非目标与风险

- 不拥有 Memory 条目、Prompt cache、结果分块；只消费它们。
- 不自动修改规则/解决冲突；只报告。
- 不为了缓存命中而改变顺序/信任/必需项。
- 不静默截断；截断/省略必须可见。
- 风险：来源预算把必需内容裁掉；必需项先算，非必需才分配。
- 风险：profile 变成产品默认；默认按角色/场景由 App 选，SDK 不替它决定。

### 8.1 复查记录（2026-10-21）

- 需求分册把“预算计数”和“打包取舍策略”分开：本 spec 的 profile/来源预算落在 pack 策略，不把 `context/budget` 改成策略模块。
- `prefixFingerprint` 只服务缓存稳定性，不拥有 Prompt cache；缓存是否命中仍由 App/Provider 决定。
- 外部对照偏薄：Claude Code、Cline、Anthropic context editing、LangMem 四条主线；Codex AGENTS、Cursor rules、OpenHands condenser、Aider repo map 还没逐项对照。
- 与 Tool/Memory 的边界：Tool 的 perTool 观察先裁原始结果，Context 的来源预算再决定打包；Memory 的单次召回预算与 Context 的窗口预算叠加，两处都可见。

## 9. 参考

- [context-program](../context-program/spec.md)：情境动作与上下文总纲。
- [ai-development-handbook](../ai-development-handbook/spec.md)：prompt / Skill / context / tool 的分层。
- [Agent Host](../../docs/horizontal/agent-host.md)：Molis 的 Prompt 分层、材料与压缩。
- [Prologue AI 手册](../../docs/platform/PROLOGUE-AI.md)：上下文写法与评测。
- [Claude Code memory](https://code.claude.com/docs/en/memory)
- [Cline Memory Bank](https://docs.cline.bot/best-practices/memory-bank)
- [Anthropic context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)
