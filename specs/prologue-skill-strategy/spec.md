# Prologue Skill 策略：选择、唤起与渐进披露

状态：需求已整理（2026-10-21；2026-10-27 用户确定启用后默认自动选用、点名优先及仅手动选项），其余策略仍待逐项评审，尚未实施本次决定。独立需求；包装、安装、信任与文件形状沿用 [skill-packs](../skill-packs/spec.md)，本 spec 只补“选哪份、怎么唤起、怎么组合、怎么证明有用”。

同系列：[Tool](../prologue-tool-strategy/spec.md) · [MCP](../prologue-mcp-strategy/spec.md) · [Context](../prologue-context-strategy/spec.md)。

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
- 组合失败整次拒绝，不跑一半；已经发生的子调用按效果链留回执。

### 3.5 版本与生命周期

- 仍然只有精确 `id@version`；没有“取最新”。
- 新增 `deprecatedBy` / `replacement`：目录可提示“有新版本”，但不自动换绑；运行中的 Run 继续用冻住的那一版。
- 新增 `minHostVersion`：宿主能力不够时目录里标不可用，不静默隐藏。
- 升级只影响之后的 Run；历史回执保留原版本。

### 3.6 权限与信任

- 工具权限岛不变：`⊆ 父亲 ∩ Host ∩ 策略`，清单要得比给得出的多就整份拒绝。
- **工具可见性**：选中/调用 skill 时，它声明的工具必须已在本轮工具面带 schema，或能通过 `find-tools` 找到；`core+search` 下不能出现“方法能调、工具调不动”。
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
| S2 | `uses` 组合、派生方法、`skill-selector` 槽、评测 | 方法链有界、权限不扩、触发率/成功率可测 |

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
| SKL-10 | 组合环、超深、超次数、跨权限岛在准备阶段整次拒绝 | Prologue 单测 |
| SKL-11 | Molis 能看到“为什么选这份方法”，可改选、停用或切为仅手动；两处设置与重启后有效值一致，自动选用不额外要求逐次确认，也不放宽实际操作授权 | Molis 设置页/工作台测试 |
| SKL-12 | Molis 的模型自动调用与派生方法接通；显式选择不退化 | Molis `agent-host` 测试 + 真实运行 |
| SKL-13 | 同一方法在助理与 Coding 的 id/version/正文一致；升级后旧 Run 不换绑 | Molis `skill-service` 测试 |
| SKL-14 | `[人工]` 在真实项目里用一次方法完成工作，能看到选择理由、用量和结果；没有把方法正文写进业务事实 | 人工 |
| SKL-15 | 选中 Skill 的工具在工具面可见或可找；`core+search` 下不会出现方法可调、工具不可调 | Prologue 单测 + Molis 工具面测试 |

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
