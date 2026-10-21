# Prologue Tool 策略：工具面、搜索与执行预算

状态：需求已整理（2026-10-21），待评审后实施。独立需求；工具的形状、副作用链与审批沿用 [action-architecture](../action-architecture/spec.md) 与 Prologue `tool/` 合同，本 spec 只补“给模型看哪些、怎么找、怎么省、怎么证明用得对”。

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

## 3. 优化策略

### 3.1 工具面：三档 + 预设

| 档 | 给模型什么 | 默认 |
| --- | --- | --- |
| `explicit` | 只给 `toolNames` 点名的工具，全部带 schema | 当前行为的兼容档 |
| `core+search` | 一小套核心工具带 schema；其余只报名字/一句话，`find-tools` 取 | 工具总数超过阈值时默认 |
| `all` | 全部带 schema | 小工具面、调试用 |

- **核心闭集**：`read` / `write` / `edit` / `run-command` / `ask-user` / `find-tools` 永远带 schema；**其余闭集 P0 不延后**（现有“闭集不延后”是硬边界）。扩展闭集是否允许只延后 schema、保留名字，另开安全裁决；本 spec 不偷偷改。
- **工具面预设**：`coding`、`assistant`、`review`、`browser`、`data`。预设只决定“默认给哪组”，仍受角色 `host_tools`、Session 包和 Run `toolNames` 收窄。
- **组合顺序**：硬边界 › 角色/包地板 › 预设 › Run 覆盖。后一层只能收窄。

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
- 工具注解可以**加严**审批（destructive / openWorld 必问），不能把 `ask` 降成 `allow`。
- 工具失败给结构化错误：`retryable` / `unknown` / `invalid-arguments` / `unauthorized`；不让模型从一段自然语言里猜。

### 3.6 观测与评测

- 每次调用记：工具名@版本、来源（system/action/mcp/package）、参数指纹、状态、耗时、token、审批结果、是否被截断。
- 聚合看：调用数、失败率、超时率、审批率、平均观察 token、`find-tools` 命中率、工具选错/重试率。
- 评测按任务集看“选对工具/少绕路/少 token”，不拿单次成功当稳定。

## 4. Prologue 合同

- `ToolRegistration` 增加 §3.3 的可选字段；`ToolCatalog` 的冻结快照仍只读、不含 execute。
- 新增 `config.tool.selection: "explicit" | "core+search" | "all"`；默认 `explicit`。只有 App/Session 显式选 `core+search` 时，超过 `config.tool.deferToolSchemasBeyond` 才延后；装配根不自动切档。
- `config.tool.deferToolSchemasBeyond` 仍是阈值；新增 `coreToolNames`（默认 6 个）与 `toolProfiles`（App 可覆盖）。
- `find-tools` 增加 `namespace` / `cursor` / `why`；保留现有 `find-tools` 名字与参数兼容。
- 新增可选 `toolSearch` 注入（语义排序），不是槽；不装就只用关键词。
- `ToolObservation` 带 `truncated` / `resourceRef` / `profile`；新增 `perTool` 观察配置。
- 新事件：`tool-found`（哪个工具被取过）、`tool-selection`（本轮为什么给这组工具）；不记 schema 正文。
- 错误码：`TOOL_SEARCH_UNAVAILABLE`、`TOOL_PROFILE_INVALID`、`TOOL_OBSERVATION_LIMIT`。

## 5. Molis Work 接入

| 位置 | 改什么 | 不做什么 |
| --- | --- | --- |
| `horizontal/agent-host` | 角色/执行档位映射到工具面预设；启用 `core+search`；`find-tools` 分组/分页；按工具观察预算 | 不扩大角色 `host_tools` |
| `apps/local-host` | 动作网关工具加 tags/when；业务工具面按项目/角色选择；工具用量投影 | 不另写工具目录 |
| `apps/workbench` | 工具选择器/“为什么给这组工具”；按工具看失败/审批/成本 | 不做第二套工具注册 |
| `packages/contracts` | 工具元数据、`tool-selection`/`tool-found` 投影；API 快照 | 不复制 SDK 类型 |
| MCP 适配 | 按服务器分组、按 annotations 加严；readOnly MCP 工具可进只读面 | 不把 MCP 工具当另一条执行链 |

Molis 的 [Prologue AI 手册](../../docs/platform/PROLOGUE-AI.md) 已要求“工具会说话”；本 spec 把“给哪些工具、怎么找到、结果多大”变成可观察的配置，而不是每个角色手写一长串名字。

## 6. 分期

| 期 | 内容 | 完成时能证明 |
| --- | --- | --- |
| T0 | 元数据、非闭集 `core+search`、`find-tools` 分组/分页、perTool 观察预算 | 工具多时 schema 成本下降；模型能先找再调；闭集语义不变 |
| T1 | 工具面预设、`toolSearch` 注入、工具用量/失败聚合 | 不同角色拿到不同工具面；选错/绕路可量化 |
| T2 | 别名/弃用、按任务评测、工具推荐 | 改名不破历史；工具面随任务收敛 |

## 7. 验收标准

| 编号 | 可观察标准 | 证明方式 |
| --- | --- | --- |
| TOL-01 | `explicit` / `core+search` / `all` 三档行为符合 §3.1；默认仍 `explicit` | Prologue 单测 |
| TOL-02 | 核心闭集始终带 schema；非闭集按阈值延后；扩展闭集 P0 不延后；闭集名字不会消失 | Prologue 单测 |
| TOL-03 | `find-tools` 支持 namespace/cursor/why；只返回本轮可见且已装配的工具 | Prologue 单测 |
| TOL-04 | 语义 `toolSearch` 不装时退关键词；装了也不改变授权 | Prologue 单测 |
| TOL-05 | 工具元数据只加严审批；destructive/openWorld 不能被注解降成 allow | Prologue 单测 + 策略测试 |
| TOL-06 | perTool 观察上限生效；超限进 resource；截断标记在正文 | Prologue 单测 |
| TOL-07 | 并行波与锁不因工具面变化而放宽；写同一路径仍串行 | Prologue 回归 |
| TOL-08 | 非幂等工具未知结果不自动重试；错误带 retryable/unknown | Prologue 单测 |
| TOL-09 | `tool-found` / `tool-selection` 只带引用与原因，不带 schema 正文 | Prologue 单测 |
| TOL-10 | Molis 角色映射到预设后，工具面只收窄不扩权；角色版本随工具面变化 | Molis `agent-host` 测试 |
| TOL-11 | Molis 启用 `core+search` 后，MCP/动作工具仍可先找再调 | Molis live + 真实运行 |
| TOL-12 | 工具失败/审批/成本可聚合；能回答“这轮为什么给这些工具” | Molis 投影测试 |
| TOL-13 | MCP 工具按服务器分组；readOnly 注解只加严，不绕过审查 | Molis MCP 测试 |
| TOL-14 | `[人工]` 在真实项目里用工具面预设完成一次编码/助理工作，token 与绕路比全量声明少 | 人工 |

## 8. 非目标与风险

- 不做第二套工具注册/执行；所有工具仍走同一目录、同一道门。
- 不把工具搜索变成授权；搜到不等于能调。
- 不自动重试非幂等工具；不把未知结果当成功。
- 不为了省 token 删掉核心闭集的名字。
- 风险：语义搜索引入不确定性；默认仍关键词，语义只排序、不扩权。
- 风险：预设把角色需要的工具漏掉；角色/包的显式名单仍是地板，装配时求交并报缺。

## 9. 参考

- [action-architecture](../action-architecture/spec.md)：动作、授权与审查。
- [prologue-adoption](../prologue-adoption/spec.md)：Molis 的工具采用与 `find-tools` 历史。
- [Prologue AI 手册](../../docs/platform/PROLOGUE-AI.md)：工具描述与回执写法。
- [LangGraph tool calling](https://mintlify.wiki/langchain-ai/langgraph/tutorials/tool-calling)
- [Claude Code custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools)
- [MCP tool annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
