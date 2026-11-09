# 能力包：AI 能力的统一声明与目录

状态：需求已整理，尚未实现（2026-11-08 用户提出并定范围；排在[第 09 批](../post-anticorruption-roadmap/reference/batches/09.md)，在第 08 批技能包之上扩展）。合同设计稿由第 09 批合同台出（9-8），界面先定样（9-11）。名称（「能力包」与界面上已叫「能力库」的动作目录怎样并存）待用户确认，见 §9 待决 1。

## 1. 问题

平台上给 AI 用的东西有五类：技能（方法）、提示词、角色、工具、MCP。它们今天各有各的登记处、引用写法、开关和用量记录，没有一个地方能看到「有哪些、从哪来、什么版本、干什么用、用在哪、开没开、用了多少」。2026-11-08 对 main `c902b9aa35` 的只读盘点：

| 类 | 现在登记在哪 | 现在的问题 |
| --- | --- | --- |
| 技能 | ① Manifest `methods` → 宿主 Agent 定义登记 `AgentDefinitions.methods()`（`apps/local-host/src/agent-definitions/agent-definitions.ts`），只有助理读；② Coding 的 `agent.skills` 与 Prologue 存储里的 `molis-coding-method`（`horizontal/agent-host/src/index.ts` 的 `skillCatalog`、`adapters/prologue-methods.ts`），只有 Coding 读；③ 沙箱包的 `methods: [{name,purpose,body}]`；④ Character 导入把 Skill 正文内嵌进快照（BL-957） | 两份目录互不相通；同一个东西有六种引用写法（`AgentSkillRef`、`SignedAgentReference` 的 method、`SkillRef`、`AssistantMethodSelection.method_id`、`BuilderSkill.id`、`CharacterImportSkill.id`）；技能用量没有任何记录（`recordSignedUse` 遇到 method 直接返回）。第 08 批正在收（C-1 已合，#1936；其余在 `batch/08`） |
| 提示词 | 插件 Manifest `agent.prompts` 与 `defineInstructionPrompt`（15 个插件和模块）、宿主内置 `BUILTIN_INSTRUCTIONS`、创作台 `BUILDER_PROMPTS`（自己的 `"designer/1"` 版本写法）、生成插件的 `export const prompts`；人的改写在 `prompt_overrides`，用量在 `prompt_uses` | 版本在声明和正文里各写一遍；创作台挂载的 `skills/molis-plugin-dev` 章节按摘要算版本，用户看不见 |
| 角色 | 插件 `agent.roles`、Coding 的 7 个角色和 3 个子代理、Character（`modules/characters`）、签名沙箱包的角色资料 | 签名角色在 `roles()` 和 `methods()`（`kind: "role"`）里各出现一次；内置角色在「Prompt 与 Character」和 Characters 两处列出 |
| 工具 | 只有散落的名字串：`BUSINESS_HOST_TOOLS`、`SKILL_TOOLS`（`packages/contracts/src/platform/plugin-agent.ts`）、`GATEWAY_TOOLS`（`horizontal/agent-host/src/adapters/prologue-action-gateway.ts`）、`childRoleTools()`、`STEP_TOOLS`、创作台 `TOOLS`、Coding `roles.ts` 里每个角色手写的 `host_tools`、`assistant-present.ts` 自己的一份名字到动词表；真正的全集只在 vendored SDK 的 `SYSTEM_TOOL_NAMES` 里、运行时才核 | 没有一处带说明、主人、版本或用量；`change-reversible` 在 `GATEWAY_TOOLS` 里却不在 `SKILL_TOOLS` 里，合同没写为什么 |
| MCP | 对外：Molis 自己的 MCP 服务器，工具名由动作派生（`apps/mcp/src/action-tools.ts`），开关在 `config/mcp-tools.json` 的 `action_grants`；对内：项目 MCP 服务器（`AgentMcpLibrary`，Prologue 存储 `molis-mcp`）与服务连接带的 MCP，两条「MCP 工具登记成动作」的流水线（`external-mcp-actions.ts`、`connector-mcp-actions.ts`）各带两份 JSON | Coding 设置页自己又声明了一份 `McpServer`（`plugins/native/coding/src/browser/settings/mcp.ts`），不用 `AgentMcpServerView`；运行时登记的 `mcp.external.*`、`mcp.connector.*` 不在动作快照里；「启用」在服务器、对外授权、动作可用三处各有一个意思 |

设置里也是散的：「角色」「提示词」在「AI」组，「能力库」（动作）、「服务连接」「对外接入」「AI 与执行工具」「调用记录」在「工具与接入」组，第 08 批又在「插件」旁加「技能」；Coding 有自己的方法页和 MCP 页，Goals 有自己的规划方法库。用户找一类东西要知道它在哪一页。

## 2. 要做到什么

平台把这五类能力的**声明与说明**收进同一个能力包统一管理：一处能看到全部条目，每条能看出类别、来源（哪个包、插件、连接或服务器）、版本与升级差异、用途与适用范围、声明的工具／权限／连接、在哪里生效、开没开、用了多少。助理与 Coding 读同一份目录、同一个精确版本。仓库里散落、重复、过时的同类登记一起收口。

第 08 批已定的技能包结论和内容不改：`kind: "content"` 的只有声明的插件、`SkillRef`、`system.skills` 的四个动作、`SkillCatalogEntry`、`skill_settings`／`skill_uses` 两张表、三档（关／自动／仅手动）、定样（A 的启用＋C 的目录）。能力包在它上面扩展：技能是能力包的一类，技能条目原样出现。

## 3. 边界

**能力包收**：声明与元数据、目录、版本、来源、生效范围、用量、导入导出。能力包是「能力清单与说明」的主人。

**能力包不收**（各有主人，能力包只读它们、在详情里给去处）：

| 不收的 | 主人 |
| --- | --- |
| 工具与动作的执行 | 动作服务、动作网关、Agent Host |
| MCP 的连接与调用、凭据 | 连接器（`horizontal/connector-host`）、Agent Host 的 MCP 库、MCP 授权（S-07、S-08、S-72、S-73） |
| 技能正文与脚本的执行 | 会跑脚本的 Agent（Coding），SKP-09 |
| 授权判定、人审 | 动作服务与第 39 批的统一管理页 |
| 角色的作用范围与继承、固定版本、生效与恢复 | 第 36 批（角色设置） |
| 场景采用 | 第 20 批（场景与生成页面） |
| 动作目录本身 | 动作服务；界面里的「能力库」。能力包里的 MCP 工具、Agent 动作工具指向动作目录的条目，不复制一份（[action-architecture](../action-architecture/spec.md) §3 禁止另设「MCP 工具总表」） |
| 外部工具（Codex、Claude Code 这类 AI 开发产品）登记表 `EXTERNAL_TOOLS` | 第 22 批（BL-955）；它登记的是 Runtime 产品，不是给 AI 用的能力 |

**不另起第二套**：不新建注册表、不另存一份名单、不新造开关语义。目录是**聚合视图**：每类条目从它的事实主人读，能力包不复制事实（SSOT 一个事实一个主人）。唯一要新增的声明是工具：今天只有散落的名字串，没有主人，能力包要给它一份声明（§4）。

## 4. 五类条目从哪来

| 类（`kind`） | 条目来源（事实主人） | 能力包新增什么 |
| --- | --- | --- |
| `skill` | 第 08 批的 `skills.catalog.list@1`（宿主 Agent 定义登记） | 不加。条目就是 `SkillCatalogEntry`，原样嵌进来 |
| `prompt` | 宿主 Agent 定义登记的提示词（插件声明、内置、生成插件）与人的改写、`prompt_uses` | 统一版本写法：创作台的 `"designer/1"` 与按摘要算的章节版本改成和别的提示词同一种（`tooling/versions.json` 一处） |
| `role` | 插件声明的角色与子代理（宿主 Agent 定义登记）、Character（`modules/characters`）；作用范围与继承读第 36 批的公开读接口，36 落地前只显示声明和来源 | 签名角色只出现一次（从 `methods()` 里去掉 `kind: "role"`） |
| `tool` | **新：Agent 工具声明表**，放在合同里，一处登记每个 Agent 工具的 id、说明、主人（平台网关、业务、子代理文件工具、计划步骤、创作台）、是否会写；`BUSINESS_HOST_TOOLS`、`SKILL_TOOLS`、`GATEWAY_TOOLS`、`childRoleTools`、`STEP_TOOLS`、创作台 `TOOLS`、`assistant-present.ts` 的名字表都由它派生（照 BL-955 外部工具登记表的做法，配 AST 扫描防手写名单）；哪些角色开放它，读角色声明的 `host_tools` | 声明表本身；它只记「有什么、是什么」，不授予：角色的 `host_tools` 仍是授权来源，技能的 `tools` 仍只是说明（SKC-13） |
| `mcp` | 服务器：Agent Host 的 MCP 库（项目 MCP）与连接器带的 MCP；工具：已登记成动作的 `mcp.external.*`、`mcp.connector.*`（读动作目录）；对外：Molis 自己的 MCP 服务器暴露了哪些、对哪个客户端开着（`action_grants`） | 不加事实。Coding 设置页改用 `AgentMcpServerView`；两条「MCP 工具登记成动作」的流水线合成一条（版本簿与最近所见按来源分键，不再四份 JSON 各写一套） |

**条目的公共部分**（合同稿定字段名）：类别、引用（技能用 `SkillRef`，其余各用主人现有的精确引用，不新造第七种）、名称、用途／什么时候用、适用范围（助理／Coding／两者／某个角色）、来源（包或插件 id 与名称、版本、发布者与信任；连接 id；服务器 id）、版本与升级差异、声明的工具／权限／连接器类别、生效范围（项目／个人空间／某个角色）、状态、不可用原因、用量（次数与最近一次，标明来源记录是否只保留近期）。

**状态不新造开关**（R3）：

| 类 | 能改什么 | 在哪改 |
| --- | --- | --- |
| 技能 | 关／自动／仅手动 | 照第 08 批，`skills.settings.set@1` |
| 提示词 | 改写与恢复默认 | 宿主 Agent 定义登记已有的动作，详情里直接调 |
| 角色 | 只看：生效范围与用量 | 改去 Characters（第 36 批以后去角色设置） |
| 工具 | 只看：哪些角色开放、会不会写 | 不能在能力包里开关；授权仍在角色与动作授权 |
| MCP | 只看：服务器开没开、连接健康、对外开给了谁 | 去「服务连接」、Coding 的 MCP 设置、「对外接入」 |

**用量从现有记录读，不新增用量账**：技能读 `skill_uses`（第 08 批），提示词读 `prompt_uses`，角色读 `prompt_uses` 与 Character 的 `character_runs`，MCP 工具读动作调用记录（只保留近期，界面写「近期」），Agent 工具读 Agent 的运行记录。合同稿核实哪一类读不出可靠次数；确实要新存一份时，是第 05 批 U1 升级链里加一步，先问用户。

## 5. 包与导入导出

- **包的形状沿用第 08 批的内容包**（`kind: "content"`，签名内容包，同一条 `plugins.install.preview`／`confirm`）。能力包在白名单里加两类只有文字的声明：提示词改写（目标插件、提示词键、基于的版本、正文）和只有文字的角色说明（名称、职责、指令、声明需要的工具；声明的工具不授予）。第 20 批的场景套组要带角色说明时用同一个键，不另加（原定「要带时在白名单里加一个只收文字的键」，见[技能包合同稿](../skill-packs/contract-design.md)第 3 节）。
- **工具与 MCP 不进包**：包里不放 MCP 服务器配置、端点或凭据，也不声明新工具（没有运行时，造不出工具）；只用已有的 `requires` 与 `connector_categories` 写「需要哪类连接」，装上后由用户经连接器连。要让包带 MCP 服务器配置，是另一条连接路径，另开需求。
- **导出**：选中的条目按类导出成一个内容包：技能带声明与正文、资源；提示词改写带目标与基于的版本；角色带文字说明；工具与 MCP 只带引用（id 与需要的连接器类别）。用这个 Home 的发布身份签名，和第 08 批的「从本机导入」同一个身份。
- **导回**：走第 08 批的安装路径。提示词改写在目标插件的版本对不上时不悄悄套用，列出差异让人选；引用的工具或 MCP 不在时标「用不了」并给去处。
- 第 09 批交格式和最小的导出导入；冲突处理、部分失败与恢复、分享的完整体验仍在[第 72 批](../post-anticorruption-roadmap/reference/batches/72.md)第 1 项。

## 6. 消费者

- **助理与 Coding**：读同一份目录、同一个精确版本（原第 09 批 9-2～9-5，不变）。助理把活交给 Coding 时，带冻结好的 `SkillRef`，`manual` 的点名名单由宿主从调用上下文带过去（原 9-1、9-3）。
- **提示词、角色的消费者**：按需接，不挡第 09 批。助理回答「你会什么」、第 61 批第 3 项的组合候选目录、第 63 批的智能组合、第 74 批的用量统计以后都读这一份，不各建一份。

## 7. 安全

- 声明不授权：技能与角色声明的工具、包里写的连接器类别都只是说明；授权仍来自角色的 `host_tools`、动作授权与连接授权。
- `manual` 的点名名单从这一轮冻结的选择来，由宿主经调用上下文带过去，不从模型或页面的输入读（原 9-1 的信任规则）。
- 工具与 MCP 的条目在能力包里只读：目录读取不触发连接、不调用工具、不刷新凭据；改状态只链到主人的页面或主人的动作。
- Agent 和插件看到的目录按主人的规则过滤：技能照第 08 批（看不到 `off`）；MCP 只列对它开着的；凭据、端点里的密钥、原始路径一律不进条目。
- 每个新增的面都有断言「拒绝」本身的测试，写进 `docs/system/SECURITY-INVARIANTS.md`。第 08 批的技能相关不变量（S-105，`batch/08` 上的 S-content-package、S-skill-import、S-bundled-packages）按类扩展；需求原稿写的「S-109」在 main 上是另一条（私密 owner 的本机保护端口），按类扩展的是前面这几条，编号由合同稿定。

## 8. 仓库收口

第 09 批碰到的模块里，下面这些在本批删或改；删不了、不归本批的记 BL 或候选，写清主人和去处。删前按[系统性整理](../../docs/prompts/repository-systematic-review.md)第 11 节核对。

| 收什么 | 本批怎么办 |
| --- | --- |
| Coding 旧方法路：`agent.skills.discover.v1`／`install.v1`、`molis-coding-method`、`routes-setup.ts` 的三个路由、`browser/settings/methods.ts` | 删（原 9-4、9-5；`molis-coding-method` 不认也不迁，用户 2026-11-06 定） |
| 助理按「有可用动作」过滤方法 | 改成读目录（原 9-2） |
| `SignedAgentReference` 的方法引用 | 换 `SkillRef`（原 9-1、9-2） |
| 六种技能引用写法 | 收成 `SkillRef`：`AgentSkillRef`、`AssistantMethodSelection.method_id`、`SignedAgentReference` 的 method 在本批改；`BuilderSkill`（创作台）、`CharacterImportSkill`（BL-957）记候选，写主人 |
| 没人用的半成品：`AgentRoleSkillsDeclaration`、`AgentSkillsCapability`、`UNREGISTERED_MODEL_CALLS`（空）、`builtin-registrations.ts` 的转发 | 核过没有外部消费者就删 |
| `recordSignedUse` 用字符串切片重拼提示词键（重复了 `sandboxAgentBodyIdentity`） | 改成调同一个函数 |
| 签名角色在 `roles()`、`methods()` 各出现一次 | 只留 `roles()` |
| Agent 工具名单散在八处 | 收成 §4 的声明表，其余派生，加防手写扫描 |
| `MANAGEMENT_GOAL_TOOL_NAMES` 与 `goal-tools.ts` 各写一遍；`docs/mcp.md` 漏了这三个 | 派生一处，补文档 |
| MCP 服务器视图两份类型；两条 MCP→动作流水线各写一遍 | 收成一份类型、一条流水线 |
| 提示词版本写法三种（`@version` 标记、创作台 `"designer/1"`、章节摘要） | 收成一种 |
| 设置里的重复视图：「提示词」「角色」「技能」、Coding 的方法页与 MCP 页、助理 `/` 菜单各列一份 | 收成能力包的聚合目录，哪些页并进来、哪些只留链接，按 9-11 的定样 |
| Goals 的规划方法库（`plugins/native/goals/methods/`，37 个，自有启用与个人副本） | 不在本批：它是 Goals 的业务数据，要不要变成技能是产品决定，记 BL，主人 Goals |
| 安装器 `runtime-config-adapters.ts` 手写的命令名与路径、Shelf 的 `SHELF_ENGINES` | 不在本批：外部工具登记表的余项，归第 22 批（BL-955） |
| 运行时登记的 MCP 动作不在动作快照里 | 记 BL，主人 C1（动作合同快照），本批不改门禁 |

旧数据：不迁、不兜底（`molis-coding-method` 用户已定；Coding 会话里存的 `methods:<会话>` 仍按第 09 批第八节第 5 条等用户定）。

## 9. 待决

1. **名称**：界面已把动作目录叫「能力」「能力库」（GLOSSARY U1），Onboarding §3.8 的「能力包」指场景里的能力组合，代码里 capability 指动作。能力包的界面名、英文名与代码前缀要用户定（第 09 批开工前一起问）。
2. 设置里哪些页并进能力包、哪些只留链接：随 9-11 定样一起定。

## 10. 验收标准

| 编号 | 用户可观察结果 |
| --- | --- |
| CPK-01 | 能力包目录列出五类条目，能按类别筛；第 08 批的技能条目原样出现（字段与 `skills.catalog.list@1` 一致），状态、不可用原因与启用操作照第 08 批 |
| CPK-02 | 每条能看出属于哪个包／插件／连接／服务器、哪个版本；包升级时显示这一条的升级差异；同一能力在能力包、助理、Coding 三处显示同一版本与来源 |
| CPK-03 | 技能沿用三档；提示词能改写与恢复（调宿主已有的动作）；角色、工具、MCP 只显示生效范围、开放给谁与用量，改状态只给主人页面的去处；代码里没有能力包自己的启用状态 |
| CPK-04 | 每条显示用了多少与最近一次；用量从主人现有的记录读，只保留近期的标「近期」；能力包没有自己的用量表 |
| CPK-05 | 助理与 Coding 从同一份目录拿到同一个 `SkillRef` 与正文（即 SKP-02、SKP-04、SKC-07）；助理交给 Coding 的技能进 Coding 的「本轮方法」和冻结记录 |
| CPK-06 | 选中的条目导出成一个签名内容包，再装回另一个 Home 后还能用、版本对得上；提示词改写在目标版本对不上时列出差异，不悄悄套用；工具与 MCP 只带引用，导出包里没有凭据与端点 |
| CPK-07 | Agent 工具只有一处声明，别处的名单都由它派生；手写一份新名单被扫描拦下；声明表里没有的工具名在角色声明里出现时被拒 |
| CPK-08 | 收口表（§8）里本批要删的，代码里搜不到；记成 BL 或候选的，每条有主人与去处 |
| CPK-09 | 拒绝：模型或页面伪造一个 `manual` 技能的引用读正文被拒（含委派到 Coding 之后）；读目录不触发 MCP 连接、工具调用或凭据刷新；Agent 读目录看不到 `off` 的技能和没对它开放的 MCP；条目里没有凭据、密钥与原始路径；导入包里的角色声明的工具不进任何角色的 `host_tools` |
| CPK-10 | `docs/SSOT-MATRIX.md` 与 `docs/system/PACKAGE-BOUNDARIES.md` 写明能力包归谁、为什么是宿主 Agent 定义登记的扩展而不是新的 `horizontal/` 服务包；作者手册有「怎么做能力包」一章；GLOSSARY 有词条 |
| CPK-11 | `[人工]` 用户在一个地方找到某个技能、提示词、角色、工具或 MCP，看懂它从哪来、干什么、在哪生效、用了多少，并能去改它 |

## 11. 决策记录

- **2026-11-08 用户定**：第 09 批从「助理与 Coding 接点」扩成能力包：五类能力（技能、提示词、角色／方法、工具、MCP）的声明与元数据收进同一个能力包统一管理；执行仍走原机制；第 08 批的结论和内容不改；散落、重复、过时的同类东西一起收口；检查后续依赖批次是否要跟着改。用户给了 R1～R8 八条诉求（本 spec §4～§8、§10 按它们展开）和收与不收的边界（§3）。

## 12. 关联

- [技能包](../skill-packs/spec.md)与[合同稿](../skill-packs/contract-design.md)（第 08 批）
- [第 09 批](../post-anticorruption-roadmap/reference/batches/09.md)
- [action-architecture](../action-architecture/spec.md) §3（动作目录、MCP 工具是动作的呈现）
- [Prologue Skill](../prologue-skill-strategy/spec.md)、[Tool](../prologue-tool-strategy/spec.md)、[MCP](../prologue-mcp-strategy/spec.md) 策略（第 61 批收口）
- [Onboarding §3.8 场景与能力包](../onboarding-coverage/spec.md#38-场景与能力包)（第 20 批）
