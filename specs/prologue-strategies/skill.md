# Prologue Skill 策略：选择、唤起与渐进披露

> 2026-11-13 从 `specs/prologue-skill-strategy/spec.md` 并入本目录；正文保留，只改相对链接。

状态：需求已整理（2026-10-21；2026-10-27 用户确定启用后默认自动选用、点名优先及仅手动选项，以及多 Skill 的部分失败与恢复规则）。第 41 批已实施 Molis 侧的选用（点名优先、自动／仅手动、依据、基础恢复，SKL-01/11 的 Molis 部分与 SKL-02 的替代口径）；**2026-11-19 / 11-20 [决定 58](../post-anticorruption-roadmap/reference/decisions.md#decision-58) ② 已拍板助理自动技能 20 条硬截断与短别名映射修复（排入 91A）、上游 `SKILL.md` YAML Frontmatter 解析器与内联上下文通道（排入 62）、助理 `agent.skill` 完整阶段观测（排入 63 Piece 0）以及三段式目录触发与工具隔离回放评测（排入 89-3），当前尚未写码**；SKL-15/16 的完整策略与其余策略仍待逐项评审，按第 62 批收口。独立需求；包装、安装、信任与文件形状沿用 [skill-packs](../skill-packs/spec.md)，本 spec 只补“选哪份、怎么唤起、怎么组合、怎么证明有用”。

同系列：[Tool](tool.md) · [MCP](mcp.md) · [Context](context.md)。

## 1. 问题与现状

Prologue 的 `skill/` 已经有：精确版本登记、`bounded` / `full-package` 两种形状、工具权限岛、指纹复验、`inline` / `fork`、有限配方、正文参数按 JSON 字面量填、来源根信任。Molis 的 `horizontal/agent-host` 已经把内置与已安装方法接到 `SkillRegistry`，用 `inlineMethods` 把正文固定进本轮指令。

但两边都停在“能点名一份方法”，没有走到“让正确的方法在正确的时机出现”：

1. **选择只有开关。** `config.skill.autoSelect` 是全局布尔；打开后所有 `autoSelectable` 条目一起进目录，没有排序、短名单、任务适配或“为什么选它”。
2. **元数据太薄。** `SkillCatalogEntry` 只有 `label`，没有 `description` / `when_to_use` / `when_not_to_use` / `applies_to`。Molis 的 [skill-packs](../skill-packs/spec.md) 已在 Manifest 侧补这些字段，但 Prologue 的 `SkillManifest` 与目录条目还没消费它们。
3. **模型找不到方法。** 自动选用关着时，模型手上只有 `invoke-skill` 精确 id@version，没有“先找再选”的入口；Molis 的 [Agent Host](../../docs/horizontal/agent-host.md) 也明确写着“模型自动调用和派生方法尚未接通”。
4. **没有组合。** 一份方法只能调工具，不能声明“先做 A 再做 B”或引用另一份方法；`bounded` 配方也只有工具步骤，没有方法步骤。
5. **资源不是一等公民。** SDK 只有 `body`；`references/`、`scripts/`、`assets/` 目前靠 skill-packs 的包形状，没有 SDK 的按需读取与来源校验。
6. **没有效果证据。** 没有选择原因、触发率、token 成本、成功/失败、用户是否改选；无法回答“这份方法到底有没有用”。

## 2. 市面做法

| 路线 | 代表 | 值得借 | 不照搬 |
| --- | --- | --- | --- |
| Agent Skills + 斜杠命令 | [Anthropic Skills 规范](https://mintlify.wiki/anthropics/skills/spec/overview)、[Claude Code commands](https://code.claude.com/docs/en/commands) | 元数据常驻、正文按需、资源渐进披露；人和模型都能点名 | 模型自己决定全部方法；没有权限岛 |
| Skills + 工具 | [OpenAI skills 实践](https://developers.openai.com/blog/skills-agents-sdk) | 方法绑定工具、按任务触发、可评测 | 把方法当 prompt 片段，缺少版本与权限 |
| Rules / Skills 分层 | [Cursor 插件规范](https://raw.githubusercontent.com/EveryInc/compound-engineering-plugin/5d523f00b7fc03fab00126589729def2b12b8ad5/docs/specs/cursor.md) | always-on 规则与 on-demand 方法分开；项目级启用 | 规则和方法混在一个目录 |
| Microagents | [OpenHands microagent](https://github.com/OpenHands/OpenHands/pull/7342) | 触发词、仓库/知识型方法、按上下文加载 | 没有精确版本与权限求交 |
| 工具即检索 | [LangGraph tool calling](https://mintlify.wiki/langchain-ai/langgraph/tutorials/tool-calling) | 先检索再调用，减少一次性目录 | 只解决工具，不解决方法 |

### 2.1 来源与取舍

下表只列直接影响本 spec 决定的来源；不是完整技能生态调研。部分引用是厂商博客或第三方规范，实施前按官方页面复核版本。

| 来源 | 类型 | 它做了什么 | 采纳 / 拒绝 | 影响 |
| --- | --- | --- | --- | --- |
| [Anthropic Skills 规范](https://mintlify.wiki/anthropics/skills/spec/overview) | 规范镜像 | 元数据、正文、资源分层 | 采纳渐进披露与选择元数据；拒绝无权限岛 | 元数据、资源、目录 |
| [Claude Code commands](https://code.claude.com/docs/en/commands) | 官方文档 | 斜杠命令、人点名、模型可调用 | 采纳人/模型双入口；不把命令当第二条写入 | 唤起、`find-skills` |
| [OpenAI skills 实践](https://developers.openai.com/blog/skills-agents-sdk) | 厂商博客 | 方法与工具绑定、评测 | 采纳工具绑定与评测；不照搬 prompt 片段 | 工具可见性、评测 |
| [Cursor 插件规范](https://raw.githubusercontent.com/EveryInc/compound-engineering-plugin/5d523f00b7fc03fab00126589729def2b12b8ad5/docs/specs/cursor.md) | 第三方规范 | rules 与 skills 分层 | 采纳 always-on / on-demand 分层；不照搬目录 | 选择档、目录 |
| [OpenHands microagent](https://github.com/OpenHands/OpenHands/pull/7342) | 第三方实现 | 触发词、仓库/知识型 microagent | 采纳触发元数据；不照搬运行时 | `when_to_use`、router |
| [LangGraph tool calling](https://mintlify.wiki/langchain-ai/langgraph/tutorials/tool-calling) | 第三方文档 | 先检索再调用 | 采纳“先找再调”；不把 skill 当 tool | `find-skills` |

## 3. 优化策略

### 3.1 选择：三档，不是布尔

2026-10-27 用户确定：启用 Skill 后默认允许 AI 按当前任务查找和选用，用户点名优先，也可将 Skill 设为“仅手动点名”。启用入口说明这个默认；仅导入、安装或查看不自动启用，用户已有的仅手动选择不被升级或重新启用重置。自动选用不扩展操作权限，不要求每次为选用已获准的 Skill 另行确认；真实操作仍沿当前授权与必要批准。以下档位是实现提案，用户入口只表达自动选用与仅手动的区别。

| 档 | 行为 | 默认 |
| --- | --- | --- |
| `off` | 不进入自动候选；由用户本次点名或 App 携带明确点名调用 | 用户选择仅手动时使用 |
| `router` | 从已启用且允许自动选用的 Skill 中，按任务、工具面、`applies_to`、`when_to_use` 选一个短名单（默认 3 份），带选择理由 | 启用 Skill 且没有明确的仅手动选择时使用 |
| `all` | 所有 `autoSelectable` 都进目录 | 仅兼容旧行为，逐步退出 |

- 用户本次点名优先于自动推荐；点名对象不可用、不适用或缺必要能力时说明影响，不静默替换。仅手动的 Skill 不能被搜索、自动候选或已知的精确引用绕过；用户本次点名后沿同一调用链使用。
- 短名单之外的方法仍可在有效使用方式和授权范围内通过精确 `invoke-skill` 调用；`skillNames` 仍是本 Run 的天花板。
- 选择理由只报“为什么是它”（命中哪个条件、与哪些工具匹配），不报正文。
- 选择结果在开跑时冻住；运行中改目录只影响下一跑。

### 3.2 唤起：三种来源，同一道门

| 来源 | 入口 | 说明 |
| --- | --- | --- |
| 人 | App 的按钮 / 斜杠命令 | 人明确点名；可带参数；回执说清用了哪一版 |
| 模型 | `find-skills` → `invoke-skill` | 先搜后调；搜索只返回元数据，不返回正文 |
| 派生 | 父方法调用子方法 | 只在同一权限岛内；深度、次数、环都要有界 |

三种来源都走 `prepareSkillIntent` / `assertIntentUnchanged` / 工具权限岛；没有“模型专用”的近路。

现有 `invoke-skill` 已经做精确引用、权限岛与指纹复验；本 spec 不改这些。斜杠命令在需求分册里是 `应有`，不是现役完成门；`find-skills` 是新增系统工具，需单独批准。

### 3.3 渐进披露：SDK 侧按需读取

- **元数据**常驻：`id@version`、`label`、`description`、`when_to_use`、`when_not_to_use`、`applies_to`、`argument_hint`、`tools` 摘要。
- **正文**只在被选中/点名/搜索后读取；`body` 仍是 ≤ 20k 字。
- **资源**按正文指向读取：`references/`、`scripts/`、`assets/` 各是 `resource` 引用；读哪份才取哪份，不整包进上下文。
- 资源必须属于同一技能版本；跨版本、路径逃逸、缺失引用都拒绝。

### 3.4 组合：有界的“方法链”

- `SkillManifest.uses` 可声明子方法（精确引用）和需要的工具；环、超深、超次数在登记或准备时拒绝。
- 子方法继承父方法的权限岛，只能更窄；父方法不能借子方法扩权。
- `bounded` 配方可以加“调用子方法”的步骤；`full-package` 的派生仍走子 Agent 边界，不共享上下文。
- 执行前发现组合环、越界等无效声明时，受影响的组合仍在准备阶段拒绝，不产生其业务效果；这不使其他独立且有效的工作失效。

2026-10-27 用户确定执行中的失败恢复规则：保留已经完成的结果，只暂停依赖失败步骤的部分；授权仍有效且互不依赖的工作继续。界面和调用结果区分已完成、失败、等待依赖与仍在执行的部分，不能把部分成功报成全部完成，也不能把已有结果显示为全部丢失。单个业务动作自身的事务和授权规则不因组合而改变。

修复、重试或重启后，从实际可恢复的位置接续。恢复前核对当前授权、依赖结果与原业务效果；结果未知的操作先查明是否已经生效，不直接重发。已经生效的写入、发送等操作不重复执行，后续有人工修改的结果不被旧步骤覆盖；无法核实的部分保持结果未知，仅暂停依赖它的处理。复用原调用记录与业务主人事实，不另建一套 Skill 任务状态。停止、停用或撤权按其实际范围生效，不以恢复为由继续不获准的工作。

### 3.5 版本与生命周期

- 仍然只有精确 `id@version`；没有“取最新”。
- 新增 `deprecatedBy` / `replacement`：目录可提示“有新版本”，但不自动换绑；运行中的 Run 继续用冻住的那一版。
- 新增 `minHostVersion`：宿主能力不够时目录里标不可用，不静默隐藏。
- 升级只影响之后的 Run；历史回执保留原版本。

### 3.6 权限与信任

- 工具权限岛不变：`⊆ 父亲 ∩ Host ∩ 策略`，清单要得比给得出的多就整份拒绝。
- **工具可见性**：按 [Tool 策略](tool.md) §3.1，选中/调用 Skill 所需工具从统一目录取得；AI 按当前任务与执行阶段查找、选择并调用已授权工具，说明按需加载。声明的必要工具须已带 schema 或可通过 `find-tools` 取得，不能出现“方法能调、工具调不动”；未装配、未获准或被用户限制时说明依赖缺口。Skill 声明与自动选用不增授工具权限，也不能绕过用户点名及限制。
- `scripts/` 不在 SDK 里直接跑；要跑就走沙箱/命令审查，和工具同一条门。
- `fromRoot` 仍要根被信任；搜索/目录可以列出，执行前才要求信任。
- 技能不能改工具闭集、不能改硬敏感名单、不能给自己加审批。

### 3.7 运行期观测与评测

这一节只做运行期效果，不重复 skill-packs 的包形状、安装与作者回放。

- 每次调用记 `SkillInvocationReceipt`：`skill`、`version`、`source`（人/模型/派生）、`selectionReason`、`parametersFingerprint`、`toolIsland`、`status`、`durationMs`、`tokens`、`resultRef`。
- 只记引用和摘要，不记正文；失败不记成成功。
- 评测至少看：触发率、误触发、用户改选率、成功率、平均 token、失败原因分布；改描述/正文后重跑，不拿一次成功当稳定。

## 4. Prologue 合同

在现有 `skill/` 上增量增加，不新增模块：

```ts
interface SkillManifest {
  // 现有字段保持不变
  description?: string;          // 什么时候用，一句话
  whenToUse?: readonly string[];
  whenNotToUse?: readonly string[];
  appliesTo?: readonly ("assistant" | "coding" | "review" | "any")[];
  userInvocable?: boolean;       // 人可点名
  argumentHint?: string;
  resources?: readonly { path: string; kind: "reference" | "script" | "asset"; summary?: string }[];
  uses?: readonly ExactRef<"skill">[]; // P1 组合
  deprecatedBy?: ExactRef<"skill">;
  minHostVersion?: number;
}

interface SkillCatalogEntry {
  // 现有字段
  description?: string;
  whenToUse?: readonly string[];
  appliesTo?: readonly string[];
  userInvocable?: boolean;
  deprecatedBy?: ExactRef<"skill">;
}
```

新增行为：

- `selectSkills({ task, tools, capabilities, limit })`：确定性短名单；不调模型。P1 可加 `skill-selector` 槽，让 App 用模型/向量做选择。
- `find-skills` 系统工具：按名字/描述/适用面搜索，返回元数据；正文仍要 `invoke-skill` 才读。
- `SkillInvocationReceipt` 与 `skill-invoked` 事件：只带引用、版本、来源、理由、状态、用量，不带正文。
- `config.skill.selection`：`off` / `router` / `all`；Molis 对已启用且允许自动选用的 Skill 默认采用 `router`，仅手动选择须在自动候选与调用处生效；沿应用同一份有效设置映射，不新增第二份启用状态。`router` 的 `maxSelected` 默认 3 仍为实现提案。
- `config.skill.composition`：`maxDepth` 默认 2、`maxCalls` 默认 8；环/超限在准备阶段拒绝。
- 现有 `invoke-skill` 保持精确引用；不把“按名字找最新”加回来。
- `find-skills` 是系统工具闭集的新增项：同步 `SYSTEM_TOOL_NAMES`、需求分册与 AGENTS 槽/工具表；不加就装配报不可用，不偷偷用 `invoke-skill` 兼任搜索。

## 5. Molis Work 接入

| 位置 | 改什么 | 不做什么 |
| --- | --- | --- |
| `horizontal/agent-host` | 消费 `description/when_to_use/applies_to`；接 `find-skills`；`router` 短名单；派生方法；调用回执 | 不另建方法注册表；不改安装与信任 |
| `apps/local-host` | 方法目录按项目启用；斜杠命令/按钮；选择理由与用量投影；审计 | 不把 Skill 正文写进业务事实 |
| `apps/workbench` | 方法选择器、斜杠命令、最近使用、改选/停用；启用后默认自动选用，可改为仅手动，显示“为什么选它” | 不自动启用刚导入/安装的 Skill，不覆盖已有仅手动选择 |
| `packages/contracts` | `AgentSkillDeclaration` 对齐新字段；`skill-invoked` 事件；API 快照 | 不复制 Prologue 的类型 |
| `packages/storage` | 复用调用记录/审计；不新增第二套方法账 | 不存正文副本 |

Molis 的 [skill-packs](../skill-packs/spec.md) 继续拥有包形状、安装、文件披露与作者流程；本 spec 只把“选择/唤起/组合/观测”接到那套包上。两处冲突时以 skill-packs 的安装与信任规则为准。

## 6. 分期

| 期 | 内容 | 完成时能证明 |
| --- | --- | --- |
| S0 | 元数据字段、`find-skills`、`router` 短名单、调用回执 | 启用后默认能自动找选，用户点名优先；仅手动设置实际限制自动选用，选择理由可解释 |
| S1 | 资源按需读取、`deprecatedBy`、`minHostVersion` | 正文/参考/脚本不整包进上下文；旧版本仍可回放 |
| S2 | `uses` 组合、派生方法、`skill-selector` 槽、评测 | 方法链有界、权限不扩；部分失败保留成果，独立工作继续，恢复不重复生效；触发率/成功率可测 |

## 7. 验收标准

| 编号 | 可观察标准 | 证明方式 |
| --- | --- | --- |
| SKL-01 | Molis 启用 Skill 后默认允许 AI 自动选用，用户点名优先；设为仅手动后不再自动选用，精确引用不绕过限制，用户本次点名仍可调用；未启用的 Skill 不自动参与，已有仅手动选择不被升级或重新启用重置 | Prologue 单测 + Molis 设置与实际调用验证 |
| SKL-02 | `router` 在给定任务/工具面下只选 ≤ `maxSelected` 份，理由与命中条件可解释 | Prologue 单测 |
| SKL-03 | `find-skills` 只返回元数据；正文要 `invoke-skill` 才读；自动查找不返回未装配、无权限或仅手动的方法作为可自动调用候选 | Prologue 单测 + live |
| SKL-04 | 三种来源都走同一权限岛；技能要的工具比本轮多时整份拒绝 | Prologue 单测 |
| SKL-05 | 正文/参考/脚本按需读取；路径逃逸、跨版本引用、缺失文件被拒绝 | Prologue 单测 |
| SKL-06 | 运行中改目录不影响已冻住的 Run；升级只影响下一跑 | Prologue 单测 |
| SKL-07 | 回执带来源、版本、理由、状态、用量；不带正文；失败不记成功 | Prologue 单测 + Molis 投影测试 |
| SKL-08 | `bounded` 配方仍不展开成开放循环；`fork` 只回摘要与引用 | Prologue 回归 |
| SKL-09 | `deprecatedBy` / `minHostVersion` 只提示，不自动换绑、不静默隐藏 | Prologue 单测 |
| SKL-10 | 组合环、超深、超次数、跨权限岛使受影响组合在准备阶段被拒且不产生其业务效果；不使其他独立且有效的工作失效 | Prologue 单测 |
| SKL-11 | Molis 能看到“为什么选这份方法”，可改选、停用或切为仅手动；两处设置与重启后有效值一致，自动选用不额外要求逐次确认，也不放宽实际操作授权 | Molis 设置页/工作台测试 |
| SKL-12 | Molis 的模型自动调用与派生方法接通；显式选择不退化 | Molis `agent-host` 测试 + 真实运行 |
| SKL-13 | 同一方法在助理与 Coding 的 id/version/正文一致；升级后旧 Run 不换绑 | Molis `skill-service` 测试 |
| SKL-14 | `[人工]` 在真实项目里用一次方法完成工作，能看到选择理由、用量和结果；没有把方法正文写进业务事实 | 人工 |
| SKL-15 | 选中 Skill 的工具在工具面可见或可找；`core+search` 下不会出现方法可调、工具不可调 | Prologue 单测 + Molis 工具面测试 |
| SKL-16 | 多 Skill 执行中途失败时，已完成结果保持，依赖部分暂停，授权有效且独立的工作继续，整体不冒充完成；修复、重试及重启后从实际结果接续，未知效果先核对，已生效操作不重复、人工后续修改不被覆盖，停止/撤权不被恢复绕过 | Prologue 集成 + Molis 实际调用验证：包含依赖与独立分支、效果已生效但回执丢失、重启与撤权 |
| SKL-17 | 自动选用时可按任务找到所有获准且设为自动的技能。将同一适用 Skill 分别放在目录第 2 和第 30 位，混入名称相近的方法；用多种中文说法发起同一任务，再换成只差一个条件的反例。核对候选与实际读到的版本。每轮自动最多读三项，点名不占名额，仅手动与停用设置均生效。首轮摘要达到预算时，告诉模型如何从同一目录找到其余获准项 | 91A 在助理正常入口改前、改后验前后位；89-3 扩至全目录与助理、Coding 两入口，分别统计应选和应避开的结果 |
| SKL-18 | [人工] 保持模型、记忆、工具权限、输入与评分规则相同，只切换待评 Skill 的启用状态，比较成品和返工。能分辨未选中、正文读取失败、已读但未遵循、遵循后仍无增益 | 89-3 先做隔离工具回放，再对真实产物盲评，报告两组样本数和差异；首例用[周报样本](../proactive-assistant/spec.md#recall-workflow) |

## 8. 非目标与风险

- 不自动启用全部已安装方法，也不把全部 Skill 正文注入每轮；启用后的自动选用默认与仅手动选择遵循 §3.1，不再要求另开一个自动选用开关。
- 不做第二套方法安装/信任；沿用 skill-packs 与 Plugin Runtime。
- 不在 SDK 里执行任意脚本；脚本走沙箱/命令审查。
- 组合只做有界方法链，不做通用工作流图。
- 风险：元数据写得太泛会让 router 失准；用真实任务回放校准，不靠模型自报。
- 风险：组合把权限岛越滚越大；每层都求交，父不能给子加权限。

### 8.1 复查记录（2026-10-21）

- 现有 `invoke-skill` 的精确引用、权限岛、指纹复验和 `inline/fork` 已能满足当前需求分册的完成门；本 spec 只补“找、选、组合、观测”，不重复这些合同。
- 斜杠命令在 `skill/invoke.md` 里是 `应有`，不是现役完成门；本 spec 把它放在 S1，不宣称已具备。
- `find-skills` 会进系统工具闭集，需同步 `SYSTEM_TOOL_NAMES`、需求分册与 AGENTS 表；没有批准就只能在 App 侧做目录，模型仍只能精确 `invoke-skill`。
- 与 Tool 策略的接口：`find-tools` 只找工具，`find-skills` 只找方法；两者结果不混。选中 Skill 的工具必须在工具面里可见或可找，否则 `core+search` 会让方法“能调但调不动自己的工具”。

## 9. 参考

- [skill-packs](../skill-packs/spec.md)：包形状、安装、渐进披露、作者与评测。
- [Agent Host](../../docs/horizontal/agent-host.md)：Molis 现有方法装配与 partial 边界。
- [Prologue AI 手册](../../docs/platform/PROLOGUE-AI.md)：Skill 与 prompt/context/tool 的分层。
- [Anthropic Skills 规范](https://mintlify.wiki/anthropics/skills/spec/overview)
- [Claude Code commands](https://code.claude.com/docs/en/commands)
- [OpenAI skills 实践](https://developers.openai.com/blog/skills-agents-sdk)
- [Cursor 插件规范](https://raw.githubusercontent.com/EveryInc/compound-engineering-plugin/5d523f00b7fc03fab00126589729def2b12b8ad5/docs/specs/cursor.md)
- [OpenHands microagent](https://github.com/OpenHands/OpenHands/pull/7342)

## 10. 决策记录

- **2026-11-14 用户定样（第 41 批「先定样：选用解释、改选与停用」）**：选 **A 回复上方一行**。可点原型与状态表见 [docs/design/archive/skill-selection/](../../docs/design/archive/skill-selection/README.md)。
  - **显示**：一轮回复的上面一行「用了」，每个技能是一个有边界的按钮，写着名字和来路（自动选的／你点名的／你改选的）；一个都没用时写「这一轮没用技能」，可以选一个重做。助理对话与 Coding 一轮的「技能」一行用同一个部件。
  - **依据与改动**：点技能按钮，在它下面打开依据：为什么用它、对上了哪些条件、来自哪个包哪一版、现在的状态。同一处有两组操作：只影响这一轮的（换一个重做、这次不用技能重做），和以后都生效的（以后只在我点名时用、在这个项目停用、恢复成自动），另有打开技能详情。「换一个」列出这次没选的技能和没选的原因。
  - **改状态**：立即生效，提示里可以撤销；保存失败在依据里就地说「什么都没改」并给重试（沿第 08 批定样）。
  - **点名的用不了**：这一轮不开始、不换成别的；说明原因，给三件能做的事（去处理、改用另一个、不用技能直接做）。
  - **几个技能里有一个失败**：每个技能一行，状态在前（做完了／没做成／等上一步／还在做）；重试只做没成的那一步和等它的。
  - **否掉的**：
    - B 回复下方每个技能一张卡、依据一直摊开：每轮多出一到三张卡，回复被推远；
    - C 发送前在输入框上方先告诉会用哪些：打字时就要算一次选用，输入框上方多一行会变的内容。
  - **代价**：看依据要点一下。
  - **组件板新增**（先补标本、D 轨合审后进产品）：一轮用了哪些技能的那一行、依据面板、几个技能各自结果的列表。
- **2026-11-14 用户定（第 41 批，怎么自动选）**：**AI 按任务自己选，平台限三个**；底座的原话匹配选择器不用（现有技能的使用条件是整句话，几乎对不上），旧的选取代码可以删减，选取策略可以整体优化。
  - **做法**：已设为自动的技能，名字和用途列给 AI；它按这一轮的任务决定读哪个，读了就算选了。Skill 目录（`system.skills`）是唯一的关口：一轮里自动技能最多读三个不同的，第四个被拒（`over_limit`）；读了哪几个由目录按轮记下，交给这一轮的主人（助理的轮次记录、Agent Run 的记录）。你点名的不占这三个名额，正文在开跑前就带上。
  - **依据显示什么**：来路（你点名的／AI 按这一轮的任务选的）加技能自己写明的用途与使用条件、来自哪个包哪一版、现在的状态。不显示「命中词」：没有原话匹配，就没有这一项（原型里「对上的」一行不进产品）。
  - **否掉的**：只用底座的原话匹配（现有技能几乎都选不中，要改写所有技能的使用条件）；先原话匹配、对不上再让 AI 选（两套来路，现有技能下第一条路很少走到）。
  - **代价**：同一句话两次可能选得不一样；依据不是精确的命中条件。§3.1 的 `router`／`all` 两档、§4 的 `selectSkills` 与 `config.skill.selection` 在 Molis 不采用，上游是否保留由第 62 批收口时定；Molis 工具目录里第 31 批登记、没有消费者的 `find-skills`／`read-skill` 删掉（原 BL-skill-hand-and-tools-consumers 随之关闭）。
- **2026-11-14 用户定（第 41 批第 2 项，规划方法变成技能）**，四次弹窗与一条补充说明合起来：
  - **放哪**：做成一个专门的技能包「规划与拆解」（`plugins/content/` 下的内容包，和「设计与无障碍」同一种），37 个规划方法都是包里的技能，在设置里和别的技能一样统一管理；不留在 Goals 包里。用户原话：「技能这个东西应该是在设置里统一管理的」「直接把规划的东西放到技能包里，变成一个统一的拆解的包」。
  - **Goals 解耦**：Goals 不再有自己的方法库、个人库（Home 半实例）和个人方法编辑页。~~只消费技能目录；项目已经采用的方法留在 Goals~~（当天晚些时候被下一条取代）。
  - **和 Goals 没有关系（同日再定，取代上一条的后半句）**：规划与拆解是**助理用的技能**。助理用它拆解之后，如果装了 Goals 插件，可以选择把结果写进去（用 Goals 自己的动作，由本人确认），仅此而已。Goals 不消费、不采用、不存规划方法：没有内置方法库、项目方法、「采用规划方法」和相关页面与动作；目标关系图的检查与变更影响分析不是方法，留在 Goals。用户原话：「和 goal 没关系了，解耦」「是助理使用这个技能拆解之后，如果有 goal 这个插件，助理可以选择写进去」。
  - **怎样提供**：**随系统自带，不用安装**（取代下面「用本机身份签名先装上」对这个包的适用；那一条仍适用于「设计与无障碍」这类随包带上、要本人安装的包）。每个 Home 的技能目录里从第一次启动就有，不能卸载，可逐个改成仅手动或关。
  - **默认档**：对个人助理默认「**自动**」。主会话按此定：37 个技能只给助理（`applies_to: assistant`），不进 Coding 每一轮的技能清单。
  - **个人的技能**：做技能目录的写入功能（在设置里新建、修改自己的技能），不为规划方法单做一套。界面先定样。
  - **不迁移**：当新应用处理，不考虑存量的个人规划方法，不写、不留迁移代码（用户原话：「都是新软件」）。PEQ-10 里「个人规划方法升级后还在」这一项随之不做。
  - **随包带的技能包怎么装上**：官方签名在第 26 批，还没有。用户定：用本机身份签名先装上（和「从本机导入技能」同一种信任），现在就能装，「设计与无障碍」也一样；以后换成官方签名时发布者会变，届时再做一次切换。这改了随包带的包的安全边界，安全不变量表与拒绝测试同步改。
  - **首屏增长**：用户批准工作台词包换名与工作台首屏冷启动 +10.2 KB（许可 `tooling/gates/page-asset-allowances/skill-selection-b41.json`）。
- **2026-11-14 第 41 批主会话定（按推荐直接定的取舍）**：
  - **随系统自带的技能包怎样实现**：不是内置插件（内置插件要有页面位置和 Runtime 实例，纯技能包没有），也不是自动安装（会改掉「随包带上的包只列出、不自动装」的安全不变量）。`plugins/content/<包>/pack-content.json` 写 `system.default_state`，`pnpm build` 打到宿主构建产物的 `system-skills/`，技能目录把它当宿主自己的内容读进来（来源显示 Molis Work，信任同内置），没有安装记录、发布者固定和签名。默认档由包声明；本人关掉时在 `skill_settings` 存一行 `off`（别的技能关掉仍是删行）。
  - **技能正文的多语言**：照[字体皮肤书第 15.3 节](../font-and-skin-system/a-section-contract.md)做了最小一片——声明加 `locales`，译文在 `skills/<id>/SKILL.<语言>.md`，缺文件、写了默认语言、包没有的语言都拒绝，读正文按调用方语言、没有就用默认语言。那一节其余各项（`changed_locales`、读正文输出 `locale`／`fell_back`、译文 frontmatter 转进语言文件、资源分语言、内置插件的方法改成文件）没做，仍归原批次。
  - **方法正文怎样改写**：每个技能是原方法的规划路径、必须覆盖、依赖规则、完成证据、收口检查、常见误拆，加一段通用的「怎样用这份方法」（原来由 Goals 的运行时模板拼进去的拆分与依赖规则，改写成不提 Goal 数据模型的说法）。原方法里只给 Goals 用的「事件类型／事件字段／默认要求」段不进技能。
  - **「换一个重做」「这次不用技能」**：助理与 Coding 都没有「重做一轮」的能力，也不为此新造；这两个操作就是把同一句话再发一轮，带上改选的技能（按点名）或带上「这一轮不自动选」，原来那一轮留在上面。
  - **依据面板归工作台外壳**：助理（与外壳同一个页面）和插件页面（在沙箱 iframe 里，改不了你的技能设置）都只画「用了」那一行，点技能按钮时发一个登记过的页面事件，由外壳打开依据面板、读目录、改设置；改选由外壳把你的选择发回那一行所在的页面，由它再发一轮。第三方插件用同一个部件、同一个事件。
  - **几个技能里有一个失败**（SKL-16）：Molis 现在没有「几个技能分步执行」这回事（`invoke-skill` 与方法链未开放，属 S2），一轮里的技能都是给同一次模型运行的材料。本批只做基础的一层：点名的技能读不了，这一轮不开始、逐个说明原因并给能做的事；自动技能读不了（用不了、超过三个）只影响那一个，这一轮照常。分步结果列表（原型里的 `sel-steps`）没有使用者，不进组件板，随第 62 批的方法链做。
  - **来路只分两种**：「你点名的」「自动选的」。原型里的「你改选的」并入「你点名的」：重做那一轮里它就是你选的，不为它另存一种来路。
  - **「换一个重做」由页面代发**：再发的那一轮文字是你原来那句，但不是你又打了一遍，按页面代发记（`written_by: "page"`），不进「你说过」。
  - **依据面板还有**：仅手动的技能给「恢复成自动」；「在设置里查看这个技能」去「能力包」页，面板不复制技能正文。
  - **用了哪些技能的已知局限**：读取调用的结果被截断时，这一次读取记不进「用了」那一行；限数与用量在目录里记，不受影响。
- **2026-11-14 用户定（弹窗，第 41 批第 2 项收尾）**：
  - **在设置里写自己的技能**：定样选 B——先说一句想要什么，助理起草成同一张表单，人改完再保存；「我自己写」直接进空表单。已实现（第 41 批）：自己写的技能是每个范围一个内容包（项目里 `my-skills.project`，个人空间 `my-skills.home`），用这个 Home 的发布身份签名、走同一条安装路径，待遇与从本机导入的相同；动作 `skills.authored.read@1`／`save@1`／`remove@1`／`draft@1` 只收本人（S-skill-authoring）；新建的技能在本人选择之前是关着的；这一版只写正文，不带附带文件。
  - **Goals 旧的个人方法库**（`goals/goals.db`）：「直接删，现在是开发阶段，软件没有用户，也清理相关代码」。不搬成技能，不留只读；升级轮里连目录删除。
  - **门禁改动四处**：同意（包边界必含项、金样回放认插件升级段的删表并核对已删的库、金样覆盖登记、补中间金样），明细见[第 41 批](../post-anticorruption-roadmap/reference/batches/41.md)。
- **2026-11-19 / 11-20 用户定（Harness 与 RSI 审阅，[决定 58](../post-anticorruption-roadmap/reference/decisions.md#decision-58) ②，仅更新排期、尚未实施）**：
  - **91A 止血**：修复助理自动技能 `.slice(0, 20)` 静默截断（37+ 内置技能尾部不可见）与短别名映射，上游同步修复 `surfaces.ts` 凭据技能边界问题；
  - **第 62 批窗口二**：上游补 `SKILL.md` YAML Frontmatter 解析器与内联 Skill 正文独立上下文通道，补 `skill-invoked` 可观测事件；
  - **第 63 批 Piece 0**：补齐助理 `agent.skill` 完整阶段观测（`offered`／`selected`／`rejected_over_limit`／`effective`），便于归因未触发与超限；
  - **第 89 批 89-3**：Skill 效果比较升级为三段式评测（全目录正／负向触发准确率与召回率 × Trace 派生工具 Mock 隔离回放 × 真实任务产出对比），统一收口进第 63 批 `horizontal/evaluation` 与 SIM 账本。

## 11. 开工前检查（第 41 批第 1 项，主会话 2026-11-14）

按[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md#4-开工前检查)第 4 节与第 4.1 节。依据：本文、[技能包](../skill-packs/spec.md)、main `4417d2bcd3`。档位：独立片；类型：横向能力（主），兼产品线（助理、Coding）。

| # | 项 | 结论 |
| --- | --- | --- |
| 1 | 事实主人 | 「一轮读了哪些自动技能、够不够三个」由 Skill 目录（宿主 Agent 定义登记）在这一轮进行时掌握；「这一轮用了哪些技能」归这一轮的主人：助理的轮次记录、Agent Run 的记录。设置与用量仍归 Skill 目录（`skill_settings`、`skill_uses`）。不出现第二个主人：界面只读轮次主人的记录 |
| 2 | 插件同等待遇 | 选用行是插件 SDK `/ui` 的部件，依据面板是外壳的平台能力，经登记的页面事件打开；Coding 不走私路，第三方插件同样能用。限三个与记录在目录里，对助理、Coding、任何插件的 Agent 一视同仁 |
| 3 | 能力注册 | 不新增动作。`skills.body.read@1` 原版本加一个拒绝原因；轮次身份由宿主写进调用上下文（`skill_round`），不从输入读 |
| 4 | 合同 | 改：`ActionSkillRound` 加轮次标识与「不自动选」；`SKILL_READ_REFUSALS` 加 `over_limit`；新增 `SkillPick`；`AssistantRound`、`AgentRunView` 各加这一轮的技能；助理发送与 Agent 起跑输入加「这一轮不自动选」；页面事件两条。阶段一原版本改，一个 PR 改完消费者；随本批 PR，不单开合同 PR（没有别的批在等） |
| 5 | 放在哪个包 | 合同在 `packages/contracts`；部件与自动技能目录文字在 `packages/plugin-sdk`（助理与 Coding 共用一份，删掉两处各写的一份）；限数与记录在 `apps/local-host/src/agent-definitions/`（给已有主人加行为）；面板在 `apps/workbench`。不新开包 |
| 6 | 表与存储 | 不改表。这一轮的技能写进轮次主人已有的 JSON（`assistant_rounds.body`、Run 的会话索引）；轮次进行中的读取记在目录的进程内存里，轮次结束交给主人。宿主中途重启：未结束的那一轮名额重新算，已结束的不受影响 |
| 7 | 兼容与迁移 | 不加。旧轮次没有这一项，就不画这一行 |
| 8 | 安全边界 | 碰提示注入一侧：限三个是目录里的硬拒绝，不靠提示词；「不自动选」的一轮里自动技能读取被拒；仅手动照旧不能绕过。插件页面仍不能改技能设置（面板在外壳）。加拒绝测试并改 `docs/system/SECURITY-INVARIANTS.md` 对应行 |
| 9 | 调用次数 | 画一行不发请求（随轮次记录来）；打开依据面板发一次 `/api/skills/list`；改设置一次点击一次请求；轮次结束目录交接一次、记用量一次（一次读设置、一次读发布者，不逐个）。页面不轮询 |
| 10 | 升级与数据 | 设置、用量、已有轮次都不动 |
| 11 | 成果与过程项 | 不涉及 |
| 12 | 页面、外壳与文字 | 不出整页；两条页面事件登记在 `dom-events.ts`；新文字用稳定键，工作台词表与 Coding 词表各加；页面资源增长写进 PR，超过 10 KB 先问 |
| 13 | 错误 | 不新增错误码；`over_limit` 是读取结果里的拒绝原因 |
| 14 | 冲突面 | C1：`platform/action-named-skills.ts`、`services/skills.ts`、`services/assistant.ts`、`services/agent-host-start.ts`、`platform/dom-events.ts` 及对应 api 快照；D：组件板标本两件；A（助理）：`assistant-*`；E（Coding）：`plugins/native/coding/`。在途 PR #2061（第 12 批，Coding）碰 Coding 的轮次文件，合回前同步 main 时一并解 |
| 15 | 全局最优 | **插件**：任何带 Agent 的插件自动得到限三个与记录，画一行只要调 SDK 部件；**平台**：关口只有目录一处，外壳多一个面板；**助理**：没有界面时照样受限、照样记录；**各类平台能力**：统一输入的 `/` 点名不变；观测层已有的 `agent.skill` 事实不改；能力包的用量计数跟着变准（自动读的也记）；**后续开发**：第 42 批创作的技能直接受同一规则，第 62 批的方法链在轮次记录上加步骤。比较过：底座选择器（用户否）；在助理和 Coding 各做一份（两份逻辑，第三方没有）；新增 `skills.select@1` 预选动作（没有原话匹配后它无事可做）。代价：Agent Host 与助理各有一处轮次结束的交接 |

平台能力检查（第 4.1 节）：别的插件也要（任何带 Agent 的插件）；现成的是 Skill 目录与 SDK `/ui`，缺的补进去；是「插件页面怎样请平台做本人才能做的事」的问题，用登记事件加外壳面板统一解；第三方能同样做到；助理与 Agent 不需要调用它（限制对它们自动生效）。结论：**现在收进平台**。

