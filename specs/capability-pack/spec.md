# 能力包：AI 能力的统一声明与目录

状态：已实现（[第 09 批](../post-anticorruption-roadmap/reference/batches/09.md)，PR #2015；能力包页用户 2026-11-10 验收通过）。2026-11-11 收尾（PR #2019：合并三份技能引用比对键、删旧地址 302、清旧方法路尾项）后按审计整改补了 CPK-10 的三方案比较正文、CPK-08 的收口与 BL 去处、CPK-02 的偏离记录（见合同设计稿 §10）。CPK-02 按用户 2026-11-11 裁定「版本不升，做代码修复」用现有持久数据补上：包上次升级来自 `plugin-packages/` 留存的签名包，连接带的 MCP 发现差异来自 `config/connector-mcp-tools.json` 的 `change`（都不改库结构、不升版本）；项目 MCP 服务器的发现差异随第 62 批 MCP M0。余项：CPK-11 的 `[人工]` 验收在仓库里只有 2026-11-10 本人确认的转述，没有一手记录。2026-11-08 用户提出并定范围，在第 08 批技能包之上扩展。2026-11-09 用户更正模型：能力包是**装东西的对象**——页面先是能力包列表，一个包下面列它的技能、MCP、工具，以及搭配的角色，角色带着自己的提示词（§4.0）；定样选 A（列表＋包详情）。合同设计稿由第 09 批合同台出（9-8，[合同设计稿](contract-design.md)，第 4 稿已冻结，实现偏离记在其 §10）。名称已定（2026-11-08）：界面叫「能力包」，英文 AI kits，代码与动作 id 用 `kit`（§9）。决策见 §12。

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

平台把这五类能力的**声明与说明**收进能力包统一管理。一处先看到全部能力包；打开一个包，看到它装了哪些角色（各带自己的提示词）、技能、MCP、工具；打开一条，能看出来源（哪个包、插件、连接或服务器）、版本与升级差异、用途与适用范围、声明的工具／权限／连接、在哪里生效、开没开、用了多少。助理与 Coding 读同一份目录、同一个精确版本。仓库里散落、重复、过时的同类登记一起收口。

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

**不另起第二套**：不新建注册表、不另存一份名单、不新造开关语义。能力包是**聚合视图**：包不存，每次按「插件就是包」现算（§4.0）；每类条目由它的事实主人上报，能力包只汇总、拼包，不复制事实（SSOT 一个事实一个主人）。外部工具登记表 `EXTERNAL_TOOLS`（Codex、Claude Code 这类 Runtime 产品）不进能力包，归第 22 批（BL-955）。

## 4. 包与条目从哪来

### 4.0 包：装东西的对象（2026-11-09 用户定）

- **谁说一个包里有什么**：插件本身就是一个包，应用插件与第 08 批的内容包一样，包里有什么就是它 Manifest 声明的（角色、提示词、技能、它的 MCP；工具是它的角色 `host_tools` 点的名字）；不加新的 Manifest 键，不另存。另有两个系统包：**Molis Work 自带**（个人助理角色与它的提示词、全部 Agent 工具、对外的 Molis Work MCP 与 `goal-advance`、平台连接驱动带的 MCP）和**你的角色**（你写的 Character）。
- **用户自己组包**：本批不做，记 [BL-kit-user-packs](../backlog/BL-kit-user-packs.md)（不新建用户数据与注册表）。
- **角色与提示词怎么连**：插件 Agent 的提示词用现有的「角色点名它由哪些提示词组成」（Manifest `agent.roles[].prompts`）；直接调模型的提示词可以写它属于哪个角色（新加的可选字段）。**没有归属角色的提示词默认归个人助理**（默认都由个人助理执行）：在插件包里挂到一行「个人助理」下面，这一行引用自带包里的个人助理，不复制。
- **一条能在几个包里**：工具能（工具是系统的，哪个包的角色点了它，它就在哪个包里）；技能、MCP、提示词只在一个包（各有唯一的主人）；个人助理只作为提示词的挂处出现在别的包里。
- **包的状态从内容读出**，没有「整包停用」开关：已卸载（只剩包头与「重新添加」）、已停用（插件停用，去处是启用插件）、要处理（逐项写出哪一条用不了）、在用。
- 汇总、来源盖章、条目形状、`kit.catalog.list@1` 的「包 → 条目」返回形状见[合同设计稿](contract-design.md)第 4 节。

### 4.1 怎样汇总：主人上报

照现成的「能力的使用位置」（`actions.usages.read`，`apps/local-host/src/action-usage-actions.ts`）的做法：

- 每个主人登记一个**上报动作**，输入输出用能力包合同里的同一对类型（`input_type`／`output_type` 标记），返回自己的条目。
- `kit.catalog.list@1` 用**调用方自己的动作客户端**，在动作目录里按这对类型找到上报者，逐个调用后合并。
- 好处：主人只读自己的事实，各上报动作的 audience 照主人的规则写，能力包不会把只给本人或只给插件的数据转给 Agent；插件和宿主同等待遇，第三方插件以后也能上报自己的条目，宿主不按名字开分支；能力包本身不读连接器、MCP 库、Characters 和第 36 批的内部实现，不加重宿主耦合。
- 9-8 合同稿比较了「宿主扩展 Agent 定义登记」「`horizontal/` 新包直接读主人内部」「主人上报」三种，比较正文在[合同设计稿](contract-design.md) §4.1 末（各自代价与否掉的理由也在那里），定为主人上报、汇总放 `horizontal/kit` 新包；汇总处还按登记盖来源与所属的包，并把条目拼成包（合同设计稿第 4.6 节）。

### 4.2 各类的主人与条目

| 类（`kind`） | 上报的主人 | 版本与升级差异 | 能力包新增什么 |
| --- | --- | --- | --- |
| `skill` | 第 08 批的 Skill 目录（宿主 Agent 定义登记） | 照 08（`SkillRef` 与安装预览里的按 Skill 差异） | 不加。条目里嵌 `SkillCatalogEntry` 原样；用量次数等能力包的字段加在外层，不改 08 的类型 |
| `prompt` | 宿主 Agent 定义登记（插件声明、内置、生成插件的提示词，人的改写、`prompt_uses`） | 默认正文的版本；有改写时显示「基于第几版、默认已到第几版」 | 不加。条目不带提示词正文或改写原文，只带名称、主人、版本、用在哪个调用处、有没有改写 |
| `role` | 宿主 Agent 定义登记（插件声明的角色与子代理）、Characters（`modules/characters`）；作用范围与继承由第 36 批的公开读接口给，36 之前只显示声明与来源 | 角色声明的版本；Character 的修订号 | 签名角色只上报一次（从 `methods()` 里去掉 `kind: "role"`） |
| `tool` | **Agent Host**：它读 vendored SDK 的系统工具全集，再加平台网关工具、业务工具、子代理与计划步骤工具，按同一种条目上报（id、说明、来源、会不会写、哪些角色开放） | 系统工具的版本取 SDK 包的版本与形状指纹；平台工具取产品版本 | 工具条目的上报。合同里只保留作者用得到的 `BUSINESS_HOST_TOOLS`、`SKILL_TOOLS`；Agent Host 内部的名单（`GATEWAY_TOOLS`、`childRoleTools`、`STEP_TOOLS`、创作台 `TOOLS`）收成 Agent Host 里的一处，`assistant-present.ts` 的名字表改从条目取 |
| `mcp` | 服务器：Agent Host 的 MCP 库（项目 MCP）、连接器带的 MCP；它们的工具、提示与资源：服务器上报的清单，已登记成动作的工具指向动作目录（`mcp.external.*`、`mcp.connector.*`）；对外：Molis 自己的 MCP 服务器暴露了什么、对哪个客户端开着（`action_grants`）（装进外部 AI 工具的 `goal-advance` Skill 随 44-7 删除，目录里不再列2026-11-13 按插件同等地位收口改，[决定 42](../post-anticorruption-roadmap/reference/decisions.md#decision-42)） | 服务器上报的工具清单变化（「发现差异」，[MCP 策略](../prologue-strategies/mcp.md) M0） | 不加事实，只上报。读的是已存的清单，不为列目录去连服务器 |

**工具的说明不授予权限**：Agent Host 的工具条目只记「有什么、是什么」。角色的 `host_tools` 仍是授权来源，技能的 `tools` 仍只是说明（SKC-13）。新增一条检查：角色 `host_tools` 里的名字不在 Agent Host 的工具全集里，装配时拒绝；再加一个测试核对 Agent Host 的全集与 SDK 的 `SYSTEM_TOOL_NAMES` 一致，换包时漂移就红。合同不复制 SDK 的名单：只有 Agent Host 依赖 SDK（AGENTS.md 硬约束），[Tool 策略](../prologue-strategies/tool.md) 第 5 节也写明不在宿主另写工具目录。

### 4.3 状态：不新造开关（R3）

| 类 | 能力包里能做什么 | 改去哪里 |
| --- | --- | --- |
| 技能 | 关／自动／仅手动 | 照第 08 批，`skills.settings.set@1` |
| 提示词 | 只看：改没改过、用在哪、用了多少 | 「提示词」页（宿主 Agent 定义登记现有的改写与恢复，今天是私有路由 `/api/agent-definitions/prompt`）。要在能力包里直接改，得先把改写注册成只给本人的动作，另问用户 |
| 角色 | 只看：生效范围与用量 | Characters（第 36 批以后去角色设置） |
| 工具 | 只看：哪些角色开放、会不会写 | 不能开关；授权仍在角色与动作授权 |
| MCP | 只看：服务器开没开、连接健康、对外开给了谁；三种「开」分开显示，各写清是哪一种 | 「服务连接」、Coding 的 MCP 设置、「对外接入」 |

### 4.4 用量：从现有记录读，写清范围

不新增用量账。每条显示能读到的，并写清范围：

| 类 | 读哪份 | 能显示什么 |
| --- | --- | --- |
| 技能 | `skill_uses`（第 08 批） | 近期次数与最近一次 |
| 提示词 | `prompt_uses`（每个键只留 200 行，Home 级、不分项目） | 「近期 N 次」与最近一次；不写成总数 |
| 角色 | `prompt_uses`、Character 的 `character_runs` | 近期次数与最近一次 |
| MCP 工具 | 动作调用记录（诊断记录，只保留近期）与「使用位置」 | 「近期」与用在哪 |
| 工具 | 现有记录里能便宜取到的最近一次；取不到就不显示 | 界面只显示「最近一次」，不写「次数随第 62 批」这类内部说法（2026-11-09 主会话定）；精确次数随[第 62 批](../post-anticorruption-roadmap/reference/batches/62.md)第 1 项 Tool 策略的用量投影（用户 2026-11-08 定） |

**用在哪**：动作与 MCP 工具复用 `actions.usages.read`；技能、提示词、角色由各自的主人在上报里给。

## 5. 包与导入导出

**以包为单位**：「导出这个包」出一个文件，里面放这个包能带走的几部分（内容包、你对这个包的提示词改写、其余的引用）；导回时各部分仍走下表各自的路（技能走第 08 批的安装确认、提示词改写逐条确认、其余只核对在不在）。导出菜单也可以只导出提示词改写或只导出引用。文件形状见合同设计稿第 4.9 节。

每一部分走它的主人现有的路，不为能力包另开安装路径：

| 类 | 导出成什么 | 导回 |
| --- | --- | --- |
| 技能 | 内容包（第 08 批的格式），原样导出安装时留存的签名包，从不重新签名：本机做的、本机导入的本来就是这个 Home 的身份签的，第三方的带原签名；带运行代码的应用包与随宿主构建的内置插件只导出引用 | 第 08 批的安装路径 |
| 提示词改写 | 用户数据文件，不是插件：每条写目标插件、提示词键、基于的版本、改写正文 | 逐条列差异，由本人确认后经主人的改写操作写入；基于的版本对不上时标出，不套用。装任何包都不会改提示词 |
| 角色 | 只带引用（主人与 id、版本）；Character 的定义本来就是成果（`character.definition.v1`），沿它 | 引用的角色不在时标「用不了」并给去处 |
| 工具、MCP | 只带引用（id 与需要的连接器类别），不带服务器配置、端点和凭据 | 不在时标「用不了」并给去处 |

- 内容包的白名单**不加键**：第 08 批的格式不变。场景套组要不要带角色说明、键叫什么，仍按 08 合同稿第 3 节由第 20 批定。
- 导出和导入只给本人，不开给 Agent。
- 第 09 批交这条最小路径（导出、导回、版本核对）；预览、冲突、部分失败与恢复、分享的完整体验仍在[第 73 批](../post-anticorruption-roadmap/reference/batches/73.md)第 1 项。

## 6. 消费者与谁能看

- **助理与 Coding**：读同一份 Skill 目录、同一个精确版本（第 09 批 9-2～9-5）。助理把活交给 Coding 时，带冻结好的 `SkillRef`，`manual` 的点名名单由宿主从调用上下文带过去（9-1、9-3）。
- **`kit.catalog.list@1` 先只给本人**：今天没有 Agent 或插件要读整份能力包，不为猜测的消费者开口（开工前检查第 15 项）。Agent 选技能继续读第 08 批的 `skills.catalog.list@1`。以后第 62 批第 3 项的组合候选、第 64 批的智能组合、助理回答「你会什么」要读时，再按类开 audience，开时每个上报动作仍按主人的规则过滤。
- **第 75 批的用量统计**读同一批记录，不另存。

## 7. 安全

- 声明不授权：技能与角色声明的工具、包里写的连接器类别都只是说明；授权仍来自角色的 `host_tools`、动作授权与连接授权。
- `manual` 的点名名单从这一轮冻结的选择来，由宿主经调用上下文带过去，不从模型或页面的输入读（9-1 的信任规则）。
- 工具与 MCP 的条目只读：列目录不连服务器、不调工具、不刷新凭据；改状态只链到主人的页面。
- 汇总用调用方自己的客户端：只给本人或只给插件的上报，Agent 拿不到。
- 条目里不带提示词正文与改写原文、凭据、端点里的密钥、原始本机路径。
- 装包不改提示词；导出导入只给本人。
- 每个新增的面都有断言「拒绝」本身的测试，写进 `docs/system/SECURITY-INVARIANTS.md`。需求原稿写的「S-109」在 main 上是另一条（私密 owner 的本机保护端口）；按类扩展的是第 08 批的技能相关不变量（S-105，`batch/08` 上的 S-content-package、S-skill-import、S-bundled-packages），新的编号由 9-8 定。

## 8. 仓库收口

第 09 批碰到的模块里，下面这些在本批删或改；删不了、不归本批的记 BL 或候选，写清主人和去处。删前按[系统性整理](../../docs/prompts/repository-systematic-review.md)第 11 节核对。**2026-11-11 按代码核对回填完成状态**（已删／已改的行写 PR 号；BL 与候选写具体批次去处）。

| 收什么 | 本批怎么办 |
| --- | --- |
| Coding 旧方法路：`agent.skills.discover.v1`／`install.v1`、`molis-coding-method`、`routes-setup.ts` 的三个路由、`browser/settings/methods.ts` | **已删**（#2015，9-4、9-5）：代码与页面已搜不到旧标识；`routes-setup.ts` 仍在，装的是材料、动作、MCP、计划与 @ 文件这些路由，三个方法路由已删。`molis-coding-method` 不认也不迁，用户 2026-11-06 定 |
| 助理按「有可用动作」过滤方法 | **已改**（#2015，9-2）：助理读共同目录，只有内容的包也能被列（`tests/assistant-methods.test.ts` 写明 expected change, not a looser check） |
| `SignedAgentReference` 的方法引用 | **已改**（#2015，9-1、9-2）：`SignedAgentReference` 只剩 `kind: "role"`（`packages/contracts/src/services/agent-definitions.ts`） |
| 六种技能引用写法 | **已完成收口**（#2015）：`AgentSkillRef`、`AssistantMethodSelection.method_id`、`SignedAgentReference` 的 method 收成 `SkillRef`；`BuilderSkill`（创作台，随 BL-377 重做）、`CharacterImportSkill`（BL-957）记候选，已写进两条 BL 的正文 |
| `recordSignedUse` 用字符串切片重拼提示词键（重复了 `sandboxAgentBodyIdentity`） | **已改**：改用 SDK 的 `sandboxPromptId`，与 `sandboxAgentBodyIdentity` 同一处 |
| 签名角色在 `roles()`、`methods()` 各出现一次 | **已改**：只留 `roles()`；`methods()` 只出技能 |
| Agent Host 内部散着的工具名单（`GATEWAY_TOOLS`、`childRoleTools`、`STEP_TOOLS`、创作台 `TOOLS`）与 `assistant-present.ts` 的名字表 | **已改**（#2015，9-9）：全集收成 `horizontal/agent-host/src/tool-catalog.ts` 的 `AGENT_TOOLS` 一处，能力包的工具条目也从它派生；`assistant-present.ts` 的活动动词表只做呈现、键是全集里的名字。`change-reversible` 不进技能工具的理由写在 `packages/contracts/src/platform/plugin-agent.ts` 的注释 |
| `MANAGEMENT_GOAL_TOOL_NAMES` 与 `goal-tools.ts` 各写一遍；`docs/mcp.md` 漏了这三个 | **已改**：只在 `apps/mcp/src/tool-dispatch.ts` 写一处，`tool-catalog.ts` 从它派生；`docs/mcp.md` 补了管理工具一节 |
| Coding 设置页自己声明的 `McpServer` | **已改**：改用合同的 `AgentMcpServerView`（`plugins/native/coding/src/browser/settings/mcp.ts`） |
| 设置里的重复视图：「提示词」「角色」「技能」、Coding 的方法页与 MCP 页、助理 `/` 菜单各列一份 | **已改**（#2015，9-11 按定样）：导航「技能」换成「能力包」、去掉全局「提示词」，技能页并进能力包，Coding 方法页删；角色、能力库、服务连接、对外接入、调用记录、AI 与执行工具、Coding MCP 页保留，从详情链过去 |
| `UNREGISTERED_MODEL_CALLS`（已是空表，`/diagnostics` 还在传）、`AgentRoleSkillsDeclaration`（公开合同，SDK 还在校验）、`AgentSkillsCapability`（没有实现者）、`builtin-registrations.ts` 的转发 | **已删**（#2015；#2019 收尾核过）：公开合同随删、快照已刷，`/diagnostics` 不再传未登记模型调用；`builtin-registrations.ts` 只剩 `homeAgentDefinitions` 一个入口，`builtinRegistrations` 的转发已删 |
| 两条「MCP 工具登记成动作」的流水线（`external-mcp-actions.ts`、`connector-mcp-actions.ts`）各写一遍 | **不在本批**：它们是 MCP 调用链，四份 JSON（`config/*-mcp-actions.json`、`*-mcp-tools.json`）存着动作版本，流程与对外授权按这些版本固定引用，合并要改带版本文件的结构。记 [BL-mcp-action-pipelines-merge](../backlog/BL-mcp-action-pipelines-merge.md)，主人连接器线，去处第 62 批第 1 项 |
| 提示词版本写法三种（`@version` 标记、创作台 `"designer/1"`、章节摘要） | **不在本批**：创作台是用户批过的构建期例外，随 BL-377 重做；章节摘要连着 `pnpm studio:replay`。记候选，主人创作台（写进 [BL-377](../backlog/BL-377.md)） |
| Goals 的规划方法库（`plugins/native/goals/methods/`，37 个，自有启用与个人副本） | **不在本批**。已定：规划方法 41-2 起是能力包里的技能，不再是 Goals 的业务数据（见 [BL-goals-methods-as-skills](../backlog/BL-goals-methods-as-skills.md)，随第 41 批 41-2 做，走第 08 批的共同目录）（2026-11-13 按插件同等地位收口改，[决定 42](../post-anticorruption-roadmap/reference/decisions.md#decision-42)） |
| 安装器 `runtime-config-adapters.ts` 手写的命令名与路径、Shelf 的 `SHELF_ENGINES` | **不在本批**：外部工具登记表的余项，归第 22 批（BL-955） |
| 运行时登记的 MCP 动作不在动作快照里 | **不在本批**：记 [BL-runtime-mcp-actions-snapshot](../backlog/BL-runtime-mcp-actions-snapshot.md)，主人 C1（动作合同快照）；去处**第 62 批第 1 项**，与流水线合并一起做（合并后快照只量一条流水线），本批不改门禁 |

旧数据：一次清掉（用户 2026-11-09 定，现在没有用户）。Coding 的技能统一由能力包／共同目录管理：旧的发现、安装、存储（`molis-coding-method`）与旧形状全删；Coding 会话里存的 `methods:<会话>` 与助理历史材料里的旧方法形状，不管存量、不做读取兜底、不做迁移，也不做「请重新选择」提示。

## 9. 待决与边角

1. ~~名称~~ 已定（用户 2026-11-08）：界面叫「能力包」；代码、类型与动作 id 用 `kit`（如 `kit.catalog.list@1`、`KitEntry`），避开指动作的 capability；GLOSSARY 写清「能力包」与「能力库」（动作目录）的分别（9-7）；Onboarding §3.8 原来的「能力包」改称「能力组合」。英文界面名随 9-11 定样一起定。
2. ~~工具用量~~ 已定（用户 2026-11-08）：09 先显示能便宜取到的最近一次，精确次数随第 62 批（§4.4）；界面不写「次数随第 62 批」（2026-11-09）。
3. ~~设置页合并~~ 已定（2026-11-09，主会话按设计台建议）：技能页并进能力包，导航「技能」换成「能力包」；提示词列表并进，编辑页保留、从提示词详情进入；角色、能力库、服务连接、对外接入、调用记录、AI 与执行工具、Coding 的 MCP 页保留，从详情链过去；Coding 方法页删；Goals 规划方法库本批不并（41-2 起作为能力包里的技能进来）。合并后「AI」组是：模型设置 · 助理 · 角色 · 能力包。
4. ~~英文名~~ 已定（2026-11-09，主会话）：AI kits。
5. 9-8 合同稿里写明的边角：
   - **主人不在了**：插件卸载后，它的包只剩包头（名称、版本、「重新添加」）；它的提示词改写、技能、角色不再列为条目；用量历史照 08 保留在各主人那里。删掉的 MCP 服务器、删掉的 Character 同样。要在包里列历史条目，记 [BL-kit-uninstalled-history](../backlog/BL-kit-uninstalled-history.md)。
   - **文字**：条目名称与说明的界面文字按 AGENTS.md 的文字规则：插件的取它的语言文件，平台工具的说明用键，不把译好的句子存进数据；第 16 批切换前照当时的写法。
   - **范围**：目录按调用上下文的项目汇总；Home 级插件、个人助理的条目标「个人空间」。
   - **搜索**：目录页内可搜（照 08）；系统搜索不收能力包条目，要收另提。
   - **调用次数**：打开能力包一个请求；每个上报者一次调用；打开包和条目不另发请求，不为详情另读正文。

## 10. 开工前检查（初判）

初判，不是答卷：9-8 开工时按[开发流程第 4 节](../post-anticorruption-roadmap/reference/development-workflow.md#4-开工前检查)逐项答，统筹审。

| # | 项 | 初判 |
| --- | --- | --- |
| 1 | 事实主人 | 能力包不新增事实，只汇总；包不存、按插件现算，包头（停用、卸载、升级）归插件安装服务：技能归插件与 Agent 定义登记（08），提示词与插件角色归 Agent 定义登记，Character 归 `modules/characters`，作用范围与继承归 36，工具全集归 Agent Host，MCP 归 Agent Host 的 MCP 库与连接器 |
| 2 | 插件同等待遇 | 主人上报按合同类型发现，内置与第三方插件同一条路；不按插件名开分支 |
| 3 | 能力注册 | `kit.catalog.list@1` 与各主人的上报动作都登记一次；导出动作只给本人；不等模型，不声明 `concurrent` |
| 4 | 合同 | 新增：条目类型与上报的输入输出类型、`kit.catalog.list@1`、导出动作；内容包白名单不变；刷新动作与 api 快照 |
| 5 | 放在哪个包 | 主人上报，汇总放 `horizontal/kit` 新包，宿主只装配（合同设计稿第 1 稿比较三种后定） |
| 6 | 表与存储 | 不新增表；用量读现有记录 |
| 7 | 兼容与迁移 | 不加；会动带版本文件的 MCP 合并移出本批 |
| 8 | 安全边界 | 碰：汇总用调用方的客户端、条目不带正文与密钥、导出导入只给本人、装包不改提示词；配拒绝测试 |
| 9 | 调用次数 | 一次打开一个请求、每个上报者一次；不连 MCP 服务器；`prompt_uses` 等按键批量读 |
| 10 | 升级与数据 | 包升级时技能照 08；提示词显示基于的版本与默认版本；MCP 显示发现差异 |
| 11 | 成果与过程项 | 导出的内容包是给人留存、分享的文件，不进成果库；Character 定义沿用已有成果类型 |
| 12 | 页面与外壳 | 能力包目录是设置里的一节，不是整页；先定样；页面资源增长写明，超 10 KB 先问 |
| 13 | 错误 | 新码用 `defineErrorCodes("kit", …)`，主人表加 `kit` 一条（2026-11-09 已定） |
| 14 | 冲突面 | 08 的 `agent-definitions/`、`host-actions.tsv`（规则 4 枢纽）、Agent Host（C2）、组件板（D）、设置页（D） |
| 15 | 全局最优 | 插件：上报合同对第三方同样开放；平台：不建第二份名单，复用使用位置的上报模式；助理：先不开口，Agent 继续读 08 的 Skill 目录；各类平台能力：授权、连接、调用链不动；后续开发：再加一类能力只加一个上报者 |

## 11. 验收标准

| 编号 | 用户可观察结果 |
| --- | --- |
| CPK-01 | 能力包先列出全部包（插件包、Molis Work 自带、你的角色）；打开一个包看到它的角色（各带提示词）、技能、MCP、工具；能按类别筛、能搜包和包里的东西；第 08 批的技能条目原样出现（字段与 `skills.catalog.list@1` 一致），状态、不可用原因与启用操作照第 08 批 |
| CPK-02 | 每条能看出属于哪个包／插件／连接／服务器、哪个版本，并按 §4.2 显示这一类的升级差异；同一能力在能力包、助理、Coding 三处显示同一版本与来源。包上次升级与连接带的 MCP 发现差异已实现（合同设计稿 §10；`tests/kit-catalog.test.ts`、`tests/connector-mcp.test.ts`）；项目 MCP 服务器的发现差异随第 62 批 MCP M0；证据见合同设计稿 §7 |
| CPK-03 | 技能沿用三档；提示词、角色、工具、MCP 在能力包里只能看，改状态只给主人页面的去处；MCP 的三种「开」分开显示；代码里没有能力包自己的启用状态 |
| CPK-04 | 每条显示能读到的用量并写清范围（「近期 N 次」「只有最近一次」「无记录」），工具只显示最近一次、不写内部说法；不把只保留近期的记录写成总数；能力包没有自己的用量表 |
| CPK-05 | 助理与 Coding 从同一份目录拿到同一个 `SkillRef` 与正文（即 SKP-02、SKP-04、SKC-07）；助理交给 Coding 的技能进 Coding 的「本轮方法」和冻结记录 |
| CPK-06 | 本机做的技能包导出后装回另一个 Home 还能用、版本对得上；第三方技能包不被换成本机签名；提示词改写导回时逐条确认、版本对不上的不套用；角色、工具、MCP 只带引用，导出文件里没有凭据与端点 |
| CPK-07 | Agent 工具只有 Agent Host 一处全集，别处名单由它派生；角色 `host_tools` 里出现全集没有的名字时装配被拒；Agent Host 的全集与 SDK 的系统工具名单不一致时测试失败 |
| CPK-08 | 收口表（§8）里本批要删的，代码里搜不到；记成 BL 或候选的，每条有主人与去处。证据：`tests/capability-pack-closeout.test.ts`（源码搜旧标识、BL 去处） |
| CPK-09 | 拒绝：模型或页面伪造一个 `manual` 技能的引用读正文被拒（含委派到 Coding 之后）；列目录不触发 MCP 连接、工具调用或凭据刷新；Agent 与插件调 `kit.catalog.list@1` 被拒；条目里没有提示词正文、改写原文、凭据、密钥与原始路径；装包不改任何提示词；Agent 调导出导入被拒 |
| CPK-10 | `docs/SSOT-MATRIX.md` 与 `docs/system/PACKAGE-BOUNDARIES.md` 写明能力包各类条目归谁、汇总放在哪、为什么（含 9-8 三种方案的比较）；作者手册有「怎么做能力包」一章；GLOSSARY 有词条。三方案比较正文在[合同设计稿](contract-design.md) §4.1 末，由 `tests/capability-pack-closeout.test.ts` 钉住 |
| CPK-11 | `[人工]` 用户在一个地方找到某个技能、提示词、角色、工具或 MCP，看懂它从哪来、干什么、在哪生效、用了多少，并能去改它 |
| CPK-12 | 一个第三方插件按上报合同上报自己的条目，不改宿主代码就出现在它自己的包里；汇总时它只用调用方的权限，来源与所属的包由汇总处盖成它自己 |
| CPK-13 | 角色点名的提示词挂在那个角色下；写了所属角色的直接调模型提示词挂在那个角色下；都没有的挂在包里的「个人助理」下，个人助理只有一个条目；写了不属于同一插件的角色时登记被拒 |
| CPK-14 | 包没有开关：插件停用时包显示已停用并给「启用插件」；卸载后只剩包头与「重新添加」；有用不了的条目时包显示要处理并逐项写出；一个工具被几个包的角色点名时在每个包里出现，详情列出这几个包 |

## 12. 决策记录

- **2026-11-08 用户定**：第 09 批从「助理与 Coding 接点」扩成能力包：五类能力（技能、提示词、角色／方法、工具、MCP）的声明与元数据收进同一个能力包统一管理；执行仍走原机制；第 08 批的结论和内容不改；散落、重复、过时的同类东西一起收口；检查后续依赖批次是否要跟着改。用户给了 R1～R8 八条诉求（本 spec §4～§8、§11 按它们展开）和收与不收的边界（§3）。
- **2026-11-08 用户定（名称）**：界面叫「能力包」，代码与动作 id 用 `kit`；Onboarding §3.8 的「能力包」改称「能力组合」。否掉的：界面改叫「AI 能力」（和用户的叫法不一致）；把动作目录的「能力库」改回「动作库」、代码用 `capability_pack`（推翻 U1 的建议方向，改动大，代码里 capability 仍指动作）。
- **2026-11-08 用户定（工具用量）**：09 先显示能便宜取到的最近一次，精确次数随第 62 批 Tool 策略的用量投影。否掉的：09 新增一张工具用量表（动存储、要升级段，和 62 的投影可能重复）。
- **2026-11-09 用户定（模型与定样）**：能力包是装东西的对象：页面先是能力包列表，一个包下面列它的技能、MCP、工具，以及搭配的角色，角色带着自己的提示词（§4.0）。定样选 **A：左边包列表、右边包详情，包里的一条就在右栏打开**（[设计台说明](https://github.com/molis-ai/molis-work/blob/claude/b09-design-kit-page-2eda30/docs/design/capability-pack/README.md)）。否掉的：B 包卡片＋包内目录（常来的人每次多一步、换包要回卡片页）；第一轮「五类按类汇总的一张目录」（不是用户说的层级）。
- **2026-11-09 用户定（用户自己组包）**：本批不做，记 BL；不新建用户数据与注册表。
- **2026-11-09 用户定（没有归属角色的提示词）**：默认归个人助理（默认都由个人助理执行）。能说清属于哪个角色的挂在那个角色下（插件 Agent 的提示词用现有的角色 `prompts`；直接调模型的提示词新加可选的所属角色），其余在包里挂到「个人助理」下。否掉的：在包上单列「没有角色的提示词」一节（多一种挂法，和执行事实不一致）。
- **2026-11-09 用户定（Coding 已存的方法选择，原 D-2）**：现在没有用户，一次性清干净：Coding 的技能统一由能力包／共同目录管理，删掉旧的发现、安装、存储与旧形状；不管存量、不做读取兜底、不做迁移、不做「请重新选择」提示；助理历史材料里的旧方法形状同理（§8）。否掉的：不认不迁但给「请重新选择」提示（多一个错误码和页面提示，没有用户受益）；迁移（只能迁一部分，还要保留机制与金样）。
- **2026-11-09 主会话按推荐定**：
  - 插件页面的点名信封只对本插件自己的技能算点名，跨插件点名只认宿主入口（助理输入框、技能设置页、宿主委派）。
  - 提示词改写的导出、预览、逐条确认导回做成只给本人的动作，限制：一份文件至多 200 行、每条正文不超过提示词上限、预览显示登记表里的标题、预览绑定本人与项目且只能确认一次。
  - 错误主人表加 `kit`。
  - 没有「整包停用」开关：包的状态从内容与插件读出（R3「不另造第二套启用」）。
  - 英文界面名 **AI kits**；工具用量界面只显示「最近一次」，不出现「次数随第 62 批」这类内部说法。
  - 设置页合并按设计台建议（§9 第 3 条）。
  - 「导出这个包」以包为单位出一个文件，各部分仍走 §5 各自的路；不另加导出动作。
- **2026-11-08 复查后改（第 09 批规划，独立评审 + 本会话核对代码）**，都在用户诉求与边界之内，没有降低验收：
  - 提示词改写不进可安装的内容包，改成用户数据文件、逐条确认导回：装第三方签名包就能改别的插件的提示词，等于一条提示词注入路，也和 08「启用、导入只给本人」相悖。
  - 角色导出只带引用、内容包白名单不加键：装上的角色说明没有落点，键按 08 合同稿留给第 20 批，守住「08 内容不改」。
  - 导出不给第三方技能换签名：换成本机身份再分发会把 `pinned` 变成 `home_local`。
  - 工具全集的主人从「合同里一张表」改为 Agent Host：真正的全集在 vendored SDK，合同抄一份会在换包时漂移，Tool 策略也不许宿主另写工具目录。
  - 两条 MCP→动作流水线合并移出本批：它是 MCP 调用链（边界说不收），四份 JSON 存着动作版本，合并要改带版本文件的结构。
  - 提示词在能力包里只看不改：R3 原话「先只展示」；今天的改写是私有路由，不是动作。
  - 汇总改为主人上报、`kit.catalog.list@1` 先只给本人：避免能力包把只给本人或插件的数据转给 Agent，也不为猜测的消费者开口。
  - 用量写清范围：`prompt_uses` 每键只留 200 行、调用记录只留近期，不能写成总数。
  - 提示词版本写法统一移出本批：创作台随 BL-377 重做，章节摘要连着回放。

## 13. 关联

- [技能包](../skill-packs/spec.md)与[合同稿](../skill-packs/contract-design.md)（第 08 批）
- [第 09 批](../post-anticorruption-roadmap/reference/batches/09.md)
- [action-architecture](../action-architecture/spec.md) §3（动作目录、MCP 工具是动作的呈现）
- [Prologue Skill](../prologue-strategies/skill.md)、[Tool](../prologue-strategies/tool.md)、[MCP](../prologue-strategies/mcp.md) 策略（第 62 批收口）
- [Onboarding §3.8 场景与能力组合](../onboarding-coverage/spec.md#38-场景与能力组合)（第 20 批）
