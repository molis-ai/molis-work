# Prologue Context 策略：来源、预算与压缩

状态：需求已整理（2026-10-21；2026-10-27 用户确定统一机制、按用户/任务/执行状态动态适配，并以真实长任务验证效果），其余策略仍待逐项评审，尚未实施本次决定。独立需求；来源、信任、打包和压缩沿用 [context-program](../context-program/spec.md) 与 Prologue `context/` 合同，本 spec 补充取材、保留、压缩、重读与适配要求，不把接口提案或文档检查当作已实现能力。

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

### 3.1 按用户、任务与执行状态适配

2026-10-27 用户确定：上下文由系统自动管理，使用一套通用机制，由 AI 按当前任务、Skill 和有效配置调整取材、保留、压缩与重读策略。默认优先保证工作连续性和结果质量，同时遵守已有效的用量与模型限制；普通用户不必手动分配各类 token 配额，能够查看当前理解、重要取舍与材料缺口并纠正。按以下因素共同判断，不只按插件名或固定场景标签选一套策略：

- 用户与项目：本次明确要求、项目约定、个人偏好，以及已选择的质量、速度、用量取舍。同一可调整项按本次明确要求、项目显式配置、个人设置、提供方默认确定；临时选择不自动写成永久偏好，任何层级都不能放宽来源信任或授权。
- 任务与阶段：当前目标、完成条件、依赖和阶段。探索、执行、检查所需材料可不同，同一任务跨阶段时应重新判断，而不一直套起跑时的固定配额。
- 执行状态：跨日接续、等待、失败恢复、角色协作，以及用户修改、决定或资料版本变化。目标、有效约束、关键决定、已完成效果、结果未知项与未完成事项持续可接续。
- 运行条件：实际模型能力、可用上下文、工具结果体积与已有效用量范围。在这些限制内调整，不因适配而自动扩预算、换模型或扩大资料访问。

以下只作为可调整的取材例子，不构成封闭的场景清单或宿主分支：

| 工作特点 | 取材与保留重点 | 随执行变化 |
| --- | --- | --- |
| 编码与修复 | 项目规则、有效工作目录、代码变更、错误和验证结果 | 探索时取相关实现，修复后保留真实改动与验证依据；需要外部资料时仍可按授权读取 |
| 研究与分析 | 问题、范围、来源、证据、分歧与不确定性 | 从探索转向结论时保留支持及反对依据，资料更新后核对结论 |
| 创作与编辑 | 设定、结构、风格、当前版本与人工修改 | 从构思转向修订时提高当前文本与用户修改的优先级，旧草稿按需取回 |
| 审阅与判断 | 标准、原件、变更、相关执行与验证证据 | 按待判断问题取证，不一律排除执行结果，也不把全部日志带入 |
| 个人助理与跨工作接续 | 用户要求、当前对象、有效约定、关联材料与待处理事项 | 任务切换、等待或重启后重新核对范围与状态，避免混入别项工作的材料 |

策略参数与做法可通过 Skill 和有效配置调整，平台负责来源、授权、预算计数、版本、打包与压缩等公共能力。新增场景复用这套能力，不为每种场景新增宿主分支。策略调整在后续打包和推理步骤生效，已发出的模型请求保留当时材料与配置；停止、撤权和后续提交前核对仍沿原规则即时生效。

### 3.2 来源预算

- 每个来源类（persona / project-instructions / nested-rules / user / memory / skills / tool-results / mcp / web / source-hit / artifacts）的 `min` / `max` / `weight` 是内部策略参数提案，按 §3.1 的有效要求和当前任务调整，不要求普通用户逐项配置。
- `context/budget` 仍只负责计数；本 spec 的 profile/来源预算属于 `context/pack` 的取舍策略，不改变 budget Contract。
- 先满足必需项，再按权重分配剩余；某类超上限先裁该类，不先裁别人的必需项。
- 重复内容、与当前阶段无关的旧对话、可重新读取的非关键工具结果与元数据可优先摘要或暂不带入；具体顺序由当前任务和依赖决定。当前有效要求、关键决定、执行效果和待处理事项不能为省 token 被丢失。
- 历史内容留存与每轮实际带入分开：原文和历史证据沿原记录规则保存与取回，不能只剩摘要；不要求所有历史原话与回执每轮完整重放。当前判断或操作需要的精确指令、参数、版本与效果证据须实际可用。
- 缺少关键依据时先在已有授权与预算内取回；仍无法取得或必需项放不下时，说明影响，只暂停依赖它的处理，不猜测补齐或静默截断。

### 3.3 逐条 trace

- 每条 `ContextItem` 带 `tokens`、`source`、`origin`、`stable`（前缀/动态）、`reason`（included / omitted / truncated / flagged）。
- `ContextPack.trace` 只给引用、来源、token、原因；不给正文，不给密钥/路径。
- App 能回答：这轮带了哪几类、各花多少、哪条被裁、为什么；不把 trace 当第二份上下文。
- 用户看到可理解的当前任务摘要、主要取材理由与缺口，可纠正目标、偏好或相关性；详细来源成本按需展开，不把内部配额表变成继续工作的必填配置。纠正通过原配置与对象主人生效，不在 trace 中保存第二份事实。

### 3.4 新鲜度

- 指令/规则/资料读取带版本或 mtime + 内容指纹；已有可用且确认新鲜的同版本内容时复用。压缩、缓存失效或当前判断需要精确原文时按需取回，不能为了避免重读而只依赖摘要。
- 变更时给出 `context-source-changed`，下一轮重读；运行中的包不换。
- 无法判断新鲜度时标 `unknown`，不假装是新的；旧版本仍可回放。
- 跨日、等待、失败恢复或角色交接后，核对当前相关资料、人工修改与已发生效果；有变化时重读受影响部分。不能用旧摘要覆盖新事实，也不能以缓存版本未变为理由忽略已知的修改或失效信号。

### 3.5 缓存友好的打包

- 稳定前缀：persona、项目指令、嵌套规则、技能元数据、固定资料；动态后缀：本轮用户话、召回、工具结果、网页。
- 两个指纹：`prefixFingerprint`（前缀不变就不变）和 `packFingerprint`（整包）。
- 不拥有 Prompt cache；只保证前缀稳定、顺序确定、来源不变时字节不变。
- 这里只提供稳定前缀指纹，不实现缓存；缓存仍归 App/Provider。

### 3.6 随任务调整压缩与恢复

- 按 §3.1 识别当前保护项与可摘要过程，任务阶段、用户更正和执行状态变化后重新判断；不能只因角色名相同就沿用固定压缩规则。
- 持续保留目标、有效约束、关键决定、人工修改、已完成效果、结果未知项、依赖与未完成事项。当前步骤需要精确核对的原话、写/命令回执、待批准内容及工具批次边界保留原文与身份，其他历史内容按 §3.2 留存并按需读取。
- 压缩后必须真实缩短、保留保护项、满足预算；失败/取消不提交。
- 压缩器只选已提供的原文，不自己编；摘录为空要显式表达。
- 恢复使用实际业务结果和当前授权，不因摘要写着“待执行”就重做已生效操作。低预算或较小窗口也不能把关键要求和缺失依据静默丢弃。

### 3.7 指令冲突检查

- 对项目规则、嵌套规则、persona 做确定性重复/矛盾检查：同一路径重复、同一主题相反、同一约束被放宽。
- 只报告，不自动改；报告带来源、版本、位置。
- 优先级仍按来源等级；报告帮助人改规则，不把“模型判断”当规则。

## 4. Prologue 合同

本节字段与接口是待实施时核对的提案；2026-10-27 的产品决定不冻结四个场景枚举或新增另一套上下文存储。

- `ContextProfile`：承载有效取材与压缩参数，可提供 `coding` / `assistant` / `review` / `minimal` 等初始配置例子，但不是封闭枚举或按插件名分支的合同；`config.context.profile` 与 `config.context.profiles` 由 App/AI 按 §3.1 组合有效策略，精确形状实现时核定。
- `ContextSourceBudget`：`min` / `max` / `weight` / `reclaim`；按来源类配置。
- `ContextItem` 增加 `tokens`、`stable`；`ContextPack` 增加 `prefixFingerprint`、`trace`。
- `ContextPack.trace[]`：`{ source, origin, tokens, stable, reason }`；不含正文。
- `context-source-changed` 事件：来源、旧/新版本、时间；不含正文。
- `compaction.profile` + `preserve`：带入当前有效策略与保护项，包括本次需要的精确原话、写/命令回执、待批准、工具批次及连续工作状态；按 §3.2 区分本轮保留与历史按需取回。
- `instructionConflicts`：确定性检查结果；`context-conflict` 事件/回执；不自动修改。
- 现有 `context-pack` / `context-compaction` 槽保留；剖面是配置，不是新槽。

## 5. Molis Work 接入

| 位置 | 改什么 | 不做什么 |
| --- | --- | --- |
| `horizontal/agent-host` | 消费用户、任务、阶段与运行条件形成的有效策略；来源预算；压缩与重读；trace 投影 | 不复制 SDK 打包，不按插件/场景名新增执行分支 |
| `apps/local-host` | `MAX_COMPOSED_INSTRUCTION_CHARS` 与来源预算对齐；规则新鲜度；冲突报告 | 不把规则正文写进业务事实 |
| `apps/workbench` | 当前理解、取材与缺口的查看和纠正；来源成本按需展开；规则冲突提示 | 不显示密钥/裸路径，不要求普通用户手动分配 token 配额 |
| `packages/contracts` | context trace / profile / conflict 投影；API 快照 | 不复制 SDK 类型 |
| `packages/storage` | 规则版本/新鲜度缓存；不新增第二套上下文账 | 不存完整上下文正文 |

Molis 的 [Agent Host](../../docs/horizontal/agent-host.md) 已有“Prompt 分层、材料、压缩”的调用链；本 spec 把“每类给多少、为什么、是否新鲜、怎么压”变成可配置、可回执，而不是继续堆在 `MAX_COMPOSED_INSTRUCTION_CHARS` 一个数上。

## 6. 分期

| 期 | 内容 | 完成时能证明 |
| --- | --- | --- |
| C0 | 用户/任务/执行状态等有效策略输入、来源预算、逐条 trace、prefixFingerprint | 同一机制可按有效要求调整取材，能解释每轮带了什么、花了多少、为什么裁 |
| C1 | 新鲜度、随任务调整的压缩与恢复、指令冲突报告 | 阶段和状态变化后能重新取材，规则变了会重读，压缩不丢保护项，冲突可见 |
| C2 | 按用户、任务、阶段与运行条件适配；真实长任务对照、缓存命中、来源推荐 | 编码、研究、创作等任务中需求不遗漏、状态不混用、效果不重复，人工修改保持，中断后能正确接续；同时记录质量、用量和延时 |

## 7. 验收标准

| 编号 | 可观察标准 | 证明方式 |
| --- | --- | --- |
| PCTX-01 | 同一公共机制依据用户要求、项目/个人设置、任务阶段和运行条件形成有效取材/压缩策略；不局限四个固定场景，不改变来源信任、权限与预算硬边界 | Prologue 单测 + Molis 策略接入验证 |
| PCTX-02 | 某来源超上限先裁该类；必需项放不下仍明确失败，不静默丢 | Prologue 单测 |
| PCTX-03 | 每条 trace 带 source/origin/tokens/stable/reason；不含正文/密钥/裸路径 | Prologue 单测 |
| PCTX-04 | prefixFingerprint 只随稳定前缀变化；动态后缀变化不改前缀 | Prologue 单测 |
| PCTX-05 | 可用且确认新鲜的同版本指令/资料能复用，压缩或缓存失效后需要原文时仍可取回；变化时发 `context-source-changed`，下一轮重读，不拿旧摘要代替 | Prologue 单测 + Molis 测试 |
| PCTX-06 | 新鲜度未知标 unknown，不假装新；旧包可回放 | Prologue 单测 |
| PCTX-07 | 压缩保留当前连续工作状态及本次需要的精确原话、写/命令回执、待批准、工具批次；历史原文沿记录规则可取，摘要不替代原证据；失败/取消不提交 | Prologue 单测 + live |
| PCTX-08 | 压缩后真实缩短、保护项仍在；空摘录可表达 | Prologue 回归 |
| PCTX-09 | 指令重复/矛盾报告带来源/版本/位置；不自动改规则 | Prologue 单测 |
| PCTX-10 | 本次要求优先于项目、个人与提供方默认，临时选择不变成永久偏好；阶段、状态或模型条件改变后后续打包采用有效策略，`MAX_COMPOSED_INSTRUCTION_CHARS` 不越过有效预算 | Molis `agent-host` 测试 |
| PCTX-11 | 用户能查看并纠正当前理解、取材与缺口，详细成本按需展开；无需逐项配 token 才能继续，trace 不泄露正文 | Molis 设置页/工作台测试 |
| PCTX-12 | 规则/资料变化后下一轮重读；运行中的包不换 | Molis live |
| PCTX-13 | 压缩使用当前任务的有效策略与保护项；改变有效做法能改变取舍，独立用量可解释，不能仅按角色名选择固定 Prompt | Molis 压缩测试 |
| PCTX-14 | `[人工]` 用编码、研究、创作等代表性真实长任务验证个体差异与阶段变化，跨日、等待、协作、失败和重启后仍能正确接续；核对遗漏要求、误用旧事实、重复操作、人工修改保留及结果质量，用量与压缩率不单独作为达标依据 | 人工长任务与自动化实操结果分别留证 |
| PCTX-15 | 在真实执行路径中跨阶段、改变用户要求或资料、制造中断后，后续取材与恢复使用有效要求和当前事实；已生效操作不重复、人工修改不被旧摘要覆盖；关键依据不可用时明确缺口，只暂停依赖部分，不猜测补齐 | Molis 集成与长任务回放：对照原请求、原业务结果和独立检查点，不能只验证摘要结构 |

## 8. 非目标与风险

- 不拥有 Memory 条目、Prompt cache、结果分块；只消费它们。
- 不自动修改规则/解决冲突；只报告。
- 不为了缓存命中而改变顺序/信任/必需项。
- 不静默截断；截断/省略必须可见。
- 风险：来源预算把必需内容裁掉；必需项先算，非必需才分配。
- 风险：profile 固化成场景分支或把配置负担转给用户；App/AI 按当前任务与有效配置适配，SDK 提供通用机制，场景做法由 Skill 与配置承载。

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
