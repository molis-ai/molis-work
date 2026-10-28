# Prologue Tool 策略：工具面、搜索与执行预算

状态：需求已整理（2026-10-21；2026-10-27 用户确定按任务和执行阶段自动查找、选择并调用已授权工具，说明按需加载，用户可点名或限制，发现不扩权），其余策略仍待逐项评审，尚未实施本次决定。独立需求；工具的形状、副作用链与审批沿用 [action-architecture](../action-architecture/spec.md) 与 Prologue `tool/` 合同，本 spec 只补“给模型看哪些、怎么找、怎么省、怎么证明用得对”。

同系列：[Skill](../prologue-skill-strategy/spec.md) · [MCP](../prologue-mcp-strategy/spec.md) · [Context](../prologue-context-strategy/spec.md)。

## 1. 问题与现状

Prologue `tool/` 已经有：目录登记、名字@版本（版本是形状指纹）、冻结快照、停用/墓碑、参数核对、副作用链、并行波与锁、幂等边界、`find-tools` 按需带 schema、`bounded-script` 代码模式、观察上限。Molis 的角色声明 `host_tools`，动作走 `prologue-action-gateway`，MCP 走 `mcp:` 前缀。

但工具面正在变成主要成本：

1. **系统工具闭集很大。** `SYSTEM_TOOL_NAMES` 已到三十项左右；闭集永远带完整 schema，不能延后。业务工具、动作工具、MCP 工具再叠上去，一轮的 schema 成本很高。
2. **延后默认关。** `deferToolSchemasBeyond` 不给就全量声明；Molis 的 Node 适配器注释还写着“每个工具的 shape 都上每个请求”，说明延后没有成为实际策略。
3. **搜索太弱。** `find-tools` 只按名字/描述的子串，每段都要命中；没有语义、没有分组、没有“按来源/服务器/标签”，最多回 8 份。
4. **没有工具面预设。** 只有 Run 级 `toolNames`，没有“核心工具 + 搜索”的档位，也没有 coding / assistant / browser / review 的常用面。
5. **观察预算只有全局。** `config.tool.observation` 是 200 行 / 32KB；一个话多的工具可以挤掉别的工具结果，不能按工具/来源设更小或更大。
6. **缺选择与效果证据。** 没有 tool 的 `when_to_use`、示例、成本、危险度、是否只读；没有调用成功率、审批率、平均 token、工具选错率。

Molis 现在把 13 个业务网关工具、宿主工具和 MCP 工具按角色显式列出；工具一多，角色 `version` 要跟着升，`find-tools` 的说明也会变长。工具策略不优化，最后会把成本转嫁给提示词和模型。

## 2. 市面做法

| 路线 | 代表 | 值得借 | 不照搬 |
| --- | --- | --- | --- |
| Tool search / deferral | Codex 的 `tool_search`、Prologue 现有 `find-tools` | 名字常驻、schema 按需；搜索后再声明 | 只按子串；没有“取过才准调”的跨重启账 |
| 工具即代码 | `bounded-script`、CodeAct | 一个脚本代替多次往返；每步仍走门 | 在脚本里直接碰磁盘/网络 |
| 工具分组/剖面 | Claude Code 的 tools / commands、[LangGraph tool calling](https://mintlify.wiki/langchain-ai/langgraph/tutorials/tool-calling) | 按任务给一组工具，不给全量 | 把工具名单写死在提示词里 |
| 工具注解 | MCP tool annotations | readOnly / destructive / idempotent / openWorld 影响审批与重试 | 用注解放宽硬边界 |
| 大结果卸载 | 现有 observation + resource | 截断明说，全文进引用 | 静默截断或把全文塞回事件 |

### 2.1 来源与取舍

下表只列直接影响本 spec 决定的来源；不是完整工具生态调研。`tool_search`、CodeAct 一类做法在公开资料里版本差异较大，实施前按目标版本复核。

| 来源 | 类型 | 它做了什么 | 采纳 / 拒绝 | 影响 |
| --- | --- | --- | --- | --- |
| Codex `tool_search` | 厂商文档/博客 | 名字常驻、schema 按需搜索 | 采纳 deferral/search；拒绝“取过才准调”的跨重启账 | `core+search`、`find-tools` |
| [MCP tool annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) | 官方规范 | readOnly / destructive / idempotent / openWorld | 采纳只加严；拒绝用注解放宽边界 | 元数据、审批 |
| `bounded-script` / CodeAct | 概念与现役实现 | 一段有界脚本编排多次工具调用 | 采纳有界解释器；拒绝 fs/net 直连 | 代码模式、预算 |
| [Claude Code custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools) | 官方文档 | 按任务给工具、工具描述与回执 | 采纳预设/分层；不照搬名单 | 工具面、描述 |
| [LangGraph tool calling](https://mintlify.wiki/langchain-ai/langgraph/tutorials/tool-calling) | 第三方文档 | 先检索再调用 | 采纳检索式选择；不把检索当授权 | 搜索、排序 |

## 3. 优化策略

### 3.1 工具发现与选用：按任务和执行阶段适配

2026-10-27 用户确定：默认由 AI 根据任务和执行阶段，从统一目录自行查找、选择并调用已授权工具，工具说明按需加载；用户可以点名或限制，发现工具不扩大权限。系统工具、插件动作与已接入的 MCP 工具沿同一目录和执行链使用，Skill 所需工具也从这里取得。用户无需事先枚举整项工作的工具名单，也不因 AI 自动选用而逐次确认选择本身；实际操作仍沿当前授权和必要批准。

探索、执行、检查、等待后接续或失败恢复时，AI 可以在当前有效范围内调整工具选择。以下档位与预设是实现提案，服务于这个产品规则，不要求用户先选技术档位；本节不表示现有实现已经具备默认自动选用。

| 档 | 给模型什么 | 默认 |
| --- | --- | --- |
| `explicit` | 只给当前有效范围内点名的工具，全部带 schema | 显式限定工具集合时使用 |
| `core+search` | 当前可用的核心工具带 schema；其余通过目录摘要和 `find-tools` 按需取说明 | 本次确定的默认方向 |
| `all` | 全部带 schema | 小工具面、调试用 |

- **按需加载**：先用简短用途、适用条件、来源和效果信息判断，再取得所选工具的完整说明、参数与必要示例。按任务变化补充需要的工具，不把全量 schema 固定塞进每轮；同一有效版本可以复用，版本变化或原说明不足时重新取得，不凭旧说明猜测调用。
- **核心闭集**：`read` / `write` / `edit` / `run-command` / `ask-user` / `find-tools` 在当前授权且已装配时始终带 schema；**其余闭集 P0 不延后**（现有“闭集不延后”是硬边界）。按需加载先覆盖可延后的部分；扩展闭集是否允许只延后 schema、保留名字，另开安全裁决，本次产品方向不自动放宽它。
- **现状对齐**：`find-tools` 已在实现里，但需求分册把它列为 `应有`、默认关；本次确定将 `core+search` 作为目标默认，实施须接通实际装配，不宣称已经可用。它依赖 `find-tools`，缺失时明确说明能力缺口，不静默回落为全量 schema 或假装已搜索。
- **和 Skill 分开**：`find-tools` 只找工具；`find-skills`（Skill 策略）只找方法，两者结果不混。
- **场景参考**：`coding`、`assistant`、`review`、`browser`、`data` 可作为初始排序和取材示例，随后按任务和阶段调整；参考组之外、当前已获准且已装配的工具仍可被找到。预设不另造目录，也不能把推荐名单当授权名单。
- **用户控制**：本次点名优先；点名工具不可用或被有效限制排除时说明原因和对工作的影响，不静默替换明确指定的做法。用户限制同时作用于搜索、候选和实际调用，不能通过精确名字、缓存说明、Skill 或派生任务绕过；点名本身不解除其他权限边界。
- **有效范围**：Host 硬边界、角色 `host_tools`、Session 包、Run `toolNames`、用户限制与当前授权共同收窄可用范围，AI 在其中选择。搜到、加载说明或 Skill 声明依赖均不新增权限，不自动安装或启用新的外部来源。停用、撤权或连接失效后，旧目录与已加载说明不再支持未获准调用；实际调用仍执行现行校验。

### 3.2 搜索：从子串到“可解释的检索”

- 保留确定性关键词搜索；新增可选语义排序（`toolSearch` 注入，不内置嵌入模型）。
- 支持按 `namespace`（`mcp:server`、`action:`、`system:`）、`owner`、`tags`、`readOnly` 过滤。
- 结果分组：同一服务器/插件的工具成组，先给组摘要再给单条。
- 分页：`find-tools` 支持 `cursor`，不只回 8 条就结束。
- 结果带 `why`：命中名字、标签、描述、技能声明的工具；不返回未授权/未装配的工具。

### 3.3 工具元数据：让选择有依据

`ToolRegistration` 增量：

- `tags`：`read` / `write` / `search` / `browser` / `code` / `memory` / `skill` 等。
- `whenToUse` / `whenNotToUse`：一句话，进搜索与描述，不写进系统提示。
- `examples`：最多 2 个有界示例（参数形状，不含真实密钥）。
- `readOnly` / `destructive` / `openWorld`：只能加严，不能放宽 `effectKind`。
- `cost`：`cheap` / `metered` / `expensive`，用于排序与提示，不参与授权。
- `namespace` / `aliases` / `deprecatedBy`：名字迁移与分组；版本仍是形状指纹。
- `observation`：该工具可覆盖全局观察上限（只能更小，除非 App 明确放宽该工具）。

### 3.4 结果预算：按工具/来源，不只按全局

- `config.tool.observation` 保留全局默认；新增 `perTool` / `perNamespace` 覆盖。
- 超限仍走 resource 引用；截断标记必须在正文里，不只写回执。
- 大结果优先卸载，不把全文塞进事件账；同一轮多个大结果按预算排队。
- 只读工具的观察可微压缩；写/命令回执不压（沿用现有 `rereadable` 规则）。

### 3.5 执行：并行、锁与重试

- 并行仍按 `lockOn` 分波；只读默认可并行，写同一路径/同一工作区串行。
- `idempotency` 继续决定未知结果是否可重放；`none` 一律对账，不自动重试。
- 工具注解只能**加严**，不能自行把 `ask` 降成 `allow` 或授予权限。是否等待用户按 [主动助理 §7.1](../proactive-assistant/spec.md#71-行动范围与授权)的权限选项与有效操作授权裁决：修改前确认保留逐次确认，自动执行复用明确覆盖的操作，不因 destructive / openWorld 标记一律重复弹窗；平台不可覆盖的拒绝与用户限制继续生效。
- 工具失败给结构化错误：`retryable` / `unknown` / `invalid-arguments` / `unauthorized`；不让模型从一段自然语言里猜。

### 3.6 观测与评测

- 每次调用记：工具名@版本、来源（system/action/mcp/package）、参数指纹、状态、耗时、token、审批结果、是否被截断。
- 聚合看：调用数、失败率、超时率、审批率、平均观察 token、`find-tools` 命中率、工具选错/重试率。
- 评测按代表性真实任务看是否选到合适工具、随阶段调整、遵守点名与限制并取得正确结果；绕路与 token 是辅助指标，不拿少加载或单次调用成功代替任务完成。

## 4. Prologue 合同

- `ToolRegistration` 增加 §3.3 的可选字段；`ToolCatalog` 的冻结快照仍只读、不含 execute。
- 新增 `config.tool.selection: "explicit" | "core+search" | "all"`；目标默认 `core+search`，由装配根提供实际搜索能力；有效的显式工具限制继续生效，不被默认覆盖。`explicit` / `all` 是有明确用途的配置，不将用户点名一个工具误解为取消其余已授权能力。
- `config.tool.deferToolSchemasBeyond` 控制可延后 schema 的加载时机，不决定有没有搜索和自动选择能力；新增 `coreToolNames`（提案默认 6 个）与 `toolProfiles`（App 可调整的参考组），均在 §3.1 的有效范围内使用。
- `find-tools` 增加 `namespace` / `cursor` / `why`；保留现有 `find-tools` 名字与参数兼容。
- 新增可选 `toolSearch` 注入（语义排序），不是槽；不装就只用关键词。
- `ToolObservation` 带 `truncated` / `resourceRef` / `profile`；新增 `perTool` 观察配置。
- 新事件：`tool-found`（哪个工具被取过）、`tool-selection`（本轮为什么给这组工具）；不记 schema 正文。
- 错误码：`TOOL_SEARCH_UNAVAILABLE`、`TOOL_PROFILE_INVALID`、`TOOL_OBSERVATION_LIMIT`。

## 5. Molis Work 接入

| 位置 | 改什么 | 不做什么 |
| --- | --- | --- |
| `horizontal/agent-host` | 默认接通 `core+search`，结合任务/阶段和有效配置选用工具；`find-tools` 分组/分页；按工具观察预算 | 不扩大角色 `host_tools`，不把场景参考组变成固定上限 |
| `apps/local-host` | 动作网关工具加 tags/when；提供项目/角色当前获准能力，调用时落实有效边界；工具用量投影 | 不另写工具目录或场景专用选择分支 |
| `apps/workbench` | 支持用户点名或限制、查看用了什么及原因；按工具看失败/审批/成本 | 不做第二套工具注册，不要求用户先配置完整工具面 |
| `packages/contracts` | 工具元数据、`tool-selection`/`tool-found` 投影；API 快照 | 不复制 SDK 类型 |
| MCP 适配 | 已接入、启用且获准的工具按服务器分组进入同一目录；按 annotations 加严，可信只读能力与三种权限选项按 MCP 策略接入 | 不把 MCP 工具当另一条执行链或因自动发现而扩权 |

Molis 的 [Prologue AI 手册](../../docs/platform/PROLOGUE-AI.md) 已要求“工具会说话”；本 spec 把“给哪些工具、怎么找到、结果多大”变成可观察的配置，而不是每个角色手写一长串名字。

## 6. 分期

| 期 | 内容 | 完成时能证明 |
| --- | --- | --- |
| T0 | 元数据、默认 `core+search` 与实际装配、可延后 schema 按需加载、用户点名/限制、`find-tools` 分组/分页、perTool 观察预算 | AI 能随任务/阶段先找再调；限制同时约束发现和调用；闭集语义不变 |
| T1 | 可调整的场景参考组、`toolSearch` 注入、工具用量/失败聚合 | 工具选择随当前工作调整；选错/绕路可量化 |
| T2 | 别名/弃用、按任务评测、工具推荐 | 改名不破历史；工具面随任务收敛 |

## 7. 验收标准

| 编号 | 可观察标准 | 证明方式 |
| --- | --- | --- |
| TOL-01 | 默认接通 `core+search`，AI 能按任务/阶段查找并选用已获准工具；`explicit` / `all` 符合 §3.1，已有显式限制不被默认覆盖；缺搜索能力时准确报缺 | Prologue 单测 + Molis 装配测试 |
| TOL-02 | 当前可用闭集保持现行 schema 规则；可延后部分按需取得完整说明与参数，不把全部 schema 固定带入每轮；有效同版本可复用，变更后不使用失效说明 | Prologue 单测 |
| TOL-03 | `find-tools` 支持 namespace/cursor/why；只返回本轮可见且已装配的工具 | Prologue 单测 |
| TOL-04 | 语义 `toolSearch` 不装时退关键词；装了也不改变授权 | Prologue 单测 |
| TOL-05 | 工具元数据只加严，不被注解或模型声明降成 allow；实际调用按三种权限选项和有效操作授权执行，明确获准的自动执行不重复询问，用户限制和不可覆盖的拒绝仍有效 | Prologue 单测 + 策略测试 |
| TOL-06 | perTool 观察上限生效；超限进 resource；截断标记在正文 | Prologue 单测 |
| TOL-07 | 并行波与锁不因工具面变化而放宽；写同一路径仍串行 | Prologue 回归 |
| TOL-08 | 非幂等工具未知结果不自动重试；错误带 retryable/unknown | Prologue 单测 |
| TOL-09 | `tool-found` / `tool-selection` 只带引用与原因，不带 schema 正文 | Prologue 单测 |
| TOL-10 | Molis 场景参考组可随任务/阶段调整，组外已获准工具仍可发现；角色、Session/Run 与用户限制共同生效，自动选用不扩大权限 | Molis `agent-host` 测试 |
| TOL-11 | Molis 启用 `core+search` 后，MCP/动作工具仍可先找再调 | Molis live + 真实运行 |
| TOL-12 | 工具失败/审批/成本可聚合；能回答“这轮为什么给这些工具” | Molis 投影测试 |
| TOL-13 | MCP 工具按服务器分组；readOnly 注解只加严，不绕过审查 | Molis MCP 测试 |
| TOL-14 | `[人工]` 在代表性真实编码/助理任务中，探索、执行、检查与恢复时能选用合适工具、取得正确结果且遵守用户要求，无需预先枚举完整工具名单；记录绕路、说明用量与基线差异，不能仅凭 token 减少验收 | 人工 + 真实运行记录 |
| TOL-15 | 用户点名被优先采用，不可用时说明原因且不静默替换；显式限制能阻止搜索、精确调用、缓存说明和 Skill/派生任务绕过，点名不解除其他授权边界 | Prologue 单测 + Molis 策略测试 |
| TOL-16 | 搜到或加载工具说明不新增授权、安装或启用来源；停用、撤权与连接失效后，旧目录或已加载说明不能促成新的未获准调用 | Prologue 单测 + Molis 集成测试 |

## 8. 非目标与风险

- 不做第二套工具注册/执行；所有工具仍走同一目录、同一道门。
- 不把工具搜索变成授权；搜到不等于能调。
- 不自动重试非幂等工具；不把未知结果当成功。
- 不为了省 token 删掉核心闭集的名字。
- 风险：语义搜索引入不确定性；默认仍关键词，语义只排序、不扩权。
- 风险：初始推荐漏掉当前任务所需工具；在有效授权范围内继续搜索，确实未装配或未获准时说明缺口，不扩权或捏造能力。

### 8.1 复查记录（2026-10-21）

- 2026-10-21 需求分册把“工具搜索”列为 `应有`、默认关，当时草案将 `core+search` 作为可选策略。2026-10-27 用户已改定 §3.1 的默认自动发现与按需加载；实际装配与效果仍待实施验证，依赖 `find-tools` 的事实不变。
- 现有系统工具闭集约 29 项，P0 不改变“闭集永远带 schema”。扩展闭集延后 schema 只是待裁决项，不在本 PR 实施范围。
- 与 Skill 的边界：`find-tools` / `find-skills` 分开；选中 Skill 的工具可见性由 Skill 策略补，本 spec 不替它决定。
- 与 Context 的边界：perTool 观察上限在 Tool 层裁原始观察；Context 的来源预算再决定打包放不放。两层都可见，不把一次裁剪说成删除。

## 9. 参考

- [action-architecture](../action-architecture/spec.md)：动作、授权与审查。
- [prologue-adoption](../prologue-adoption/spec.md)：Molis 的工具采用与 `find-tools` 历史。
- [Prologue AI 手册](../../docs/platform/PROLOGUE-AI.md)：工具描述与回执写法。
- [LangGraph tool calling](https://mintlify.wiki/langchain-ai/langgraph/tutorials/tool-calling)
- [Claude Code custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools)
- [MCP tool annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
