# 能力包：AI 能力的统一声明与目录

状态：需求已整理，尚未实现（2026-11-08 用户提出并定范围；排在[第 09 批](../post-anticorruption-roadmap/reference/batches/09.md)，在第 08 批技能包之上扩展）。合同设计稿由第 09 批合同台出（9-8，[合同设计稿](contract-design.md)，2026-11-08 出稿、待合审），界面先定样（9-11）。名称已定（2026-11-08）：界面叫「能力包」，代码与动作 id 用 `kit`（§9）。2026-11-08 经独立复查改了导出、工具全集的主人、汇总方式与收口范围（§12 最后一条）。

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

**不另起第二套**：不新建注册表、不另存一份名单、不新造开关语义。目录是**聚合视图**：每类条目由它的事实主人上报，能力包只汇总，不复制事实（SSOT 一个事实一个主人）。外部工具登记表 `EXTERNAL_TOOLS`（Codex、Claude Code 这类 Runtime 产品）不进能力包，归第 22 批（BL-955）。

## 4. 五类条目从哪来

### 4.1 怎样汇总：主人上报

照现成的「能力的使用位置」（`actions.usages.read`，`apps/local-host/src/action-usage-actions.ts`）的做法：

- 每个主人登记一个**上报动作**，输入输出用能力包合同里的同一对类型（`input_type`／`output_type` 标记），返回自己的条目。
- `kit.catalog.list@1` 用**调用方自己的动作客户端**，在动作目录里按这对类型找到上报者，逐个调用后合并。
- 好处：主人只读自己的事实，各上报动作的 audience 照主人的规则写，能力包不会把只给本人或只给插件的数据转给 Agent；插件和宿主同等待遇，第三方插件以后也能上报自己的条目，宿主不按名字开分支；能力包本身不读连接器、MCP 库、Characters 和第 36 批的内部实现，不加重宿主耦合。
- 9-8 合同稿再比较一次「宿主扩展 Agent 定义登记」「`horizontal/` 新包」「主人上报」三种，按开工前检查第 5 项定；推荐主人上报。汇总动作本身很薄，放哪个包也在那里定。

### 4.2 各类的主人与条目

| 类（`kind`） | 上报的主人 | 版本与升级差异 | 能力包新增什么 |
| --- | --- | --- | --- |
| `skill` | 第 08 批的 Skill 目录（宿主 Agent 定义登记） | 照 08（`SkillRef` 与安装预览里的按 Skill 差异） | 不加。条目里嵌 `SkillCatalogEntry` 原样；用量次数等能力包的字段加在外层，不改 08 的类型 |
| `prompt` | 宿主 Agent 定义登记（插件声明、内置、生成插件的提示词，人的改写、`prompt_uses`） | 默认正文的版本；有改写时显示「基于第几版、默认已到第几版」 | 不加。条目不带提示词正文或改写原文，只带名称、主人、版本、用在哪个调用处、有没有改写 |
| `role` | 宿主 Agent 定义登记（插件声明的角色与子代理）、Characters（`modules/characters`）；作用范围与继承由第 36 批的公开读接口给，36 之前只显示声明与来源 | 角色声明的版本；Character 的修订号 | 签名角色只上报一次（从 `methods()` 里去掉 `kind: "role"`） |
| `tool` | **Agent Host**：它读 vendored SDK 的系统工具全集，再加平台网关工具、业务工具、子代理与计划步骤工具，按同一种条目上报（id、说明、来源、会不会写、哪些角色开放） | 系统工具的版本取 SDK 包的版本与形状指纹；平台工具取产品版本 | 工具条目的上报。合同里只保留作者用得到的 `BUSINESS_HOST_TOOLS`、`SKILL_TOOLS`；Agent Host 内部的名单（`GATEWAY_TOOLS`、`childRoleTools`、`STEP_TOOLS`、创作台 `TOOLS`）收成 Agent Host 里的一处，`assistant-present.ts` 的名字表改从条目取 |
| `mcp` | 服务器：Agent Host 的 MCP 库（项目 MCP）、连接器带的 MCP；它们的工具、提示与资源：服务器上报的清单，已登记成动作的工具指向动作目录（`mcp.external.*`、`mcp.connector.*`）；对外：Molis 自己的 MCP 服务器暴露了什么、对哪个客户端开着（`action_grants`），以及装进外部 AI 工具的 `goal-advance` Skill | 服务器上报的工具清单变化（「发现差异」，[MCP 策略](../prologue-mcp-strategy/spec.md) M0） | 不加事实，只上报。读的是已存的清单，不为列目录去连服务器 |

**工具的说明不授予权限**：Agent Host 的工具条目只记「有什么、是什么」。角色的 `host_tools` 仍是授权来源，技能的 `tools` 仍只是说明（SKC-13）。新增一条检查：角色 `host_tools` 里的名字不在 Agent Host 的工具全集里，装配时拒绝；再加一个测试核对 Agent Host 的全集与 SDK 的 `SYSTEM_TOOL_NAMES` 一致，换包时漂移就红。合同不复制 SDK 的名单：只有 Agent Host 依赖 SDK（AGENTS.md 硬约束），[Tool 策略](../prologue-tool-strategy/spec.md) 第 5 节也写明不在宿主另写工具目录。

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
| 工具 | 现有记录里能便宜取到的最近一次；取不到就写「次数随第 61 批」 | 精确次数随[第 61 批](../post-anticorruption-roadmap/reference/batches/61.md)第 1 项 Tool 策略的用量投影（用户 2026-11-08 定） |

**用在哪**：动作与 MCP 工具复用 `actions.usages.read`；技能、提示词、角色由各自的主人在上报里给。

## 5. 包与导入导出

按类导出，每类走它的主人现有的路，不为能力包另开安装路径：

| 类 | 导出成什么 | 导回 |
| --- | --- | --- |
| 技能 | 内容包（第 08 批的格式）。只重新签名本机做的或从本机导入的包（`home_local`），用这个 Home 的发布身份；第三方的包原样带原签名，或只导出引用，不换成自己的身份再发 | 第 08 批的安装路径 |
| 提示词改写 | 用户数据文件，不是插件：每条写目标插件、提示词键、基于的版本、改写正文 | 逐条列差异，由本人确认后经主人的改写操作写入；基于的版本对不上时标出，不套用。装任何包都不会改提示词 |
| 角色 | 只带引用（主人与 id、版本）；Character 的定义本来就是成果（`character.definition.v1`），沿它 | 引用的角色不在时标「用不了」并给去处 |
| 工具、MCP | 只带引用（id 与需要的连接器类别），不带服务器配置、端点和凭据 | 不在时标「用不了」并给去处 |

- 内容包的白名单**不加键**：第 08 批的格式不变。场景套组要不要带角色说明、键叫什么，仍按 08 合同稿第 3 节由第 20 批定。
- 导出和导入只给本人，不开给 Agent。
- 第 09 批交这条最小路径（导出、导回、版本核对）；预览、冲突、部分失败与恢复、分享的完整体验仍在[第 72 批](../post-anticorruption-roadmap/reference/batches/72.md)第 1 项。

## 6. 消费者与谁能看

- **助理与 Coding**：读同一份 Skill 目录、同一个精确版本（第 09 批 9-2～9-5）。助理把活交给 Coding 时，带冻结好的 `SkillRef`，`manual` 的点名名单由宿主从调用上下文带过去（9-1、9-3）。
- **`kit.catalog.list@1` 先只给本人**：今天没有 Agent 或插件要读整份能力包，不为猜测的消费者开口（开工前检查第 15 项）。Agent 选技能继续读第 08 批的 `skills.catalog.list@1`。以后第 61 批第 3 项的组合候选、第 63 批的智能组合、助理回答「你会什么」要读时，再按类开 audience，开时每个上报动作仍按主人的规则过滤。
- **第 74 批的用量统计**读同一批记录，不另存。

## 7. 安全

- 声明不授权：技能与角色声明的工具、包里写的连接器类别都只是说明；授权仍来自角色的 `host_tools`、动作授权与连接授权。
- `manual` 的点名名单从这一轮冻结的选择来，由宿主经调用上下文带过去，不从模型或页面的输入读（9-1 的信任规则）。
- 工具与 MCP 的条目只读：列目录不连服务器、不调工具、不刷新凭据；改状态只链到主人的页面。
- 汇总用调用方自己的客户端：只给本人或只给插件的上报，Agent 拿不到。
- 条目里不带提示词正文与改写原文、凭据、端点里的密钥、原始本机路径。
- 装包不改提示词；导出导入只给本人。
- 每个新增的面都有断言「拒绝」本身的测试，写进 `docs/system/SECURITY-INVARIANTS.md`。需求原稿写的「S-109」在 main 上是另一条（私密 owner 的本机保护端口）；按类扩展的是第 08 批的技能相关不变量（S-105，`batch/08` 上的 S-content-package、S-skill-import、S-bundled-packages），新的编号由 9-8 定。

## 8. 仓库收口

第 09 批碰到的模块里，下面这些在本批删或改；删不了、不归本批的记 BL 或候选，写清主人和去处。删前按[系统性整理](../../docs/prompts/repository-systematic-review.md)第 11 节核对。

| 收什么 | 本批怎么办 |
| --- | --- |
| Coding 旧方法路：`agent.skills.discover.v1`／`install.v1`、`molis-coding-method`、`routes-setup.ts` 的三个路由、`browser/settings/methods.ts` | 删（9-4、9-5；`molis-coding-method` 不认也不迁，用户 2026-11-06 定） |
| 助理按「有可用动作」过滤方法 | 改成读目录（9-2） |
| `SignedAgentReference` 的方法引用 | 换 `SkillRef`（9-1、9-2） |
| 六种技能引用写法 | `AgentSkillRef`、`AssistantMethodSelection.method_id`、`SignedAgentReference` 的 method 在本批收成 `SkillRef`；`BuilderSkill`（创作台，随 BL-377 重做）、`CharacterImportSkill`（BL-957）记候选 |
| `recordSignedUse` 用字符串切片重拼提示词键（重复了 `sandboxAgentBodyIdentity`） | 改成调同一个函数 |
| 签名角色在 `roles()`、`methods()` 各出现一次 | 只留 `roles()` |
| Agent Host 内部散着的工具名单（`GATEWAY_TOOLS`、`childRoleTools`、`STEP_TOOLS`、创作台 `TOOLS`）与 `assistant-present.ts` 的名字表 | 收成 Agent Host 的一处（§4.2）；`change-reversible` 不进技能工具的理由写进合同注释 |
| `MANAGEMENT_GOAL_TOOL_NAMES` 与 `goal-tools.ts` 各写一遍；`docs/mcp.md` 漏了这三个 | 派生一处，补文档 |
| Coding 设置页自己声明的 `McpServer` | 改用 `AgentMcpServerView` |
| 设置里的重复视图：「提示词」「角色」「技能」、Coding 的方法页与 MCP 页、助理 `/` 菜单各列一份 | 收成能力包的聚合目录，哪些页并进来、哪些只留链接，按 9-11 的定样；第 08 批的「技能」一节怎么处理要尽早定 |
| `UNREGISTERED_MODEL_CALLS`（已是空表，`/diagnostics` 还在传）、`AgentRoleSkillsDeclaration`（公开合同，SDK 还在校验）、`AgentSkillsCapability`（没有实现者）、`builtin-registrations.ts` 的转发 | 核过消费者再删；删公开合同的跑 `pnpm api:update`，按 `docs/system/CONTRACT-CHANGES.md` 写影响 |
| 两条「MCP 工具登记成动作」的流水线（`external-mcp-actions.ts`、`connector-mcp-actions.ts`）各写一遍 | **不在本批**：它们是 MCP 调用链，四份 JSON（`config/*-mcp-actions.json`、`*-mcp-tools.json`）存着动作版本，流程与对外授权按这些版本固定引用，合并要改带版本文件的结构。记 BL，主人连接器线，去处第 61 批第 1 项 |
| 提示词版本写法三种（`@version` 标记、创作台 `"designer/1"`、章节摘要） | **不在本批**：创作台是用户批过的构建期例外，随 BL-377 重做；章节摘要连着 `pnpm studio:replay`。记候选，主人创作台 |
| Goals 的规划方法库（`plugins/native/goals/methods/`，37 个，自有启用与个人副本） | **不在本批**：它是 Goals 的业务数据，要不要变成技能是产品决定。记 BL，主人 Goals |
| 安装器 `runtime-config-adapters.ts` 手写的命令名与路径、Shelf 的 `SHELF_ENGINES` | **不在本批**：外部工具登记表的余项，归第 22 批（BL-955） |
| 运行时登记的 MCP 动作不在动作快照里 | **不在本批**：记 BL，主人 C1（动作合同快照），本批不改门禁 |

旧数据：不迁、不兜底（`molis-coding-method` 用户已定；Coding 会话里存的 `methods:<会话>` 仍按第 09 批第八节第 5 条等用户定）。

## 9. 待决与边角

1. ~~名称~~ 已定（用户 2026-11-08）：界面叫「能力包」；代码、类型与动作 id 用 `kit`（如 `kit.catalog.list@1`、`KitEntry`），避开指动作的 capability；GLOSSARY 写清「能力包」与「能力库」（动作目录）的分别（9-7）；Onboarding §3.8 原来的「能力包」改称「能力组合」。英文界面名随 9-11 定样一起定。
2. ~~工具用量~~ 已定（用户 2026-11-08）：09 先显示能便宜取到的最近一次，精确次数随第 61 批（§4.4）。
3. 设置里哪些页并进能力包、哪些只留链接，第 08 批的「技能」一节怎么处理：随 9-11 定样一起定。
4. 9-8 合同稿里写明的边角：
   - **主人不在了**：插件卸载后，它的提示词改写、技能、角色不再列为可用条目；用量历史照 08 保留当时的名称与引用，在详情里可看。删掉的 MCP 服务器、删掉的 Character 同样只留历史。
   - **文字**：条目名称与说明的界面文字按 AGENTS.md 的文字规则：插件的取它的语言文件，平台工具的说明用键，不把译好的句子存进数据；第 16 批切换前照当时的写法。
   - **范围**：目录按调用上下文的项目汇总；Home 级插件、个人助理的条目标「个人空间」。
   - **搜索**：目录页内可搜（照 08）；系统搜索不收能力包条目，要收另提。
   - **调用次数**：打开目录一个请求；每个上报者一次调用；不为详情另读正文。

## 10. 开工前检查（初判）

初判，不是答卷：9-8 开工时按[开发流程第 4 节](../post-anticorruption-roadmap/reference/development-workflow.md#4-开工前检查)逐项答，统筹审。

| # | 项 | 初判 |
| --- | --- | --- |
| 1 | 事实主人 | 能力包不新增事实，只汇总：技能归插件与 Agent 定义登记（08），提示词与插件角色归 Agent 定义登记，Character 归 `modules/characters`，作用范围与继承归 36，工具全集归 Agent Host，MCP 归 Agent Host 的 MCP 库与连接器 |
| 2 | 插件同等待遇 | 主人上报按合同类型发现，内置与第三方插件同一条路；不按插件名开分支 |
| 3 | 能力注册 | `kit.catalog.list@1` 与各主人的上报动作都登记一次；导出动作只给本人；不等模型，不声明 `concurrent` |
| 4 | 合同 | 新增：条目类型与上报的输入输出类型、`kit.catalog.list@1`、导出动作；内容包白名单不变；刷新动作与 api 快照 |
| 5 | 放在哪个包 | 9-8 比三种（宿主扩展、`horizontal/` 新包、主人上报）后定，推荐主人上报，汇总动作很薄 |
| 6 | 表与存储 | 不新增表；用量读现有记录 |
| 7 | 兼容与迁移 | 不加；会动带版本文件的 MCP 合并移出本批 |
| 8 | 安全边界 | 碰：汇总用调用方的客户端、条目不带正文与密钥、导出导入只给本人、装包不改提示词；配拒绝测试 |
| 9 | 调用次数 | 一次打开一个请求、每个上报者一次；不连 MCP 服务器；`prompt_uses` 等按键批量读 |
| 10 | 升级与数据 | 包升级时技能照 08；提示词显示基于的版本与默认版本；MCP 显示发现差异 |
| 11 | 成果与过程项 | 导出的内容包是给人留存、分享的文件，不进成果库；Character 定义沿用已有成果类型 |
| 12 | 页面与外壳 | 能力包目录是设置里的一节，不是整页；先定样；页面资源增长写明，超 10 KB 先问 |
| 13 | 错误 | 新码用 `defineErrorCodes("kit", …)`，主人表加一条先问 |
| 14 | 冲突面 | 08 的 `agent-definitions/`、`host-actions.tsv`（规则 4 枢纽）、Agent Host（C2）、组件板（D）、设置页（D） |
| 15 | 全局最优 | 插件：上报合同对第三方同样开放；平台：不建第二份名单，复用使用位置的上报模式；助理：先不开口，Agent 继续读 08 的 Skill 目录；各类平台能力：授权、连接、调用链不动；后续开发：再加一类能力只加一个上报者 |

## 11. 验收标准

| 编号 | 用户可观察结果 |
| --- | --- |
| CPK-01 | 能力包目录列出五类条目，能按类别筛、能搜；第 08 批的技能条目原样出现（字段与 `skills.catalog.list@1` 一致），状态、不可用原因与启用操作照第 08 批 |
| CPK-02 | 每条能看出属于哪个包／插件／连接／服务器、哪个版本，并按 §4.2 显示这一类的升级差异；同一能力在能力包、助理、Coding 三处显示同一版本与来源 |
| CPK-03 | 技能沿用三档；提示词、角色、工具、MCP 在能力包里只能看，改状态只给主人页面的去处；MCP 的三种「开」分开显示；代码里没有能力包自己的启用状态 |
| CPK-04 | 每条显示能读到的用量并写清范围（「近期 N 次」「只有最近一次」「无记录」「次数随第 61 批」），不把只保留近期的记录写成总数；能力包没有自己的用量表 |
| CPK-05 | 助理与 Coding 从同一份目录拿到同一个 `SkillRef` 与正文（即 SKP-02、SKP-04、SKC-07）；助理交给 Coding 的技能进 Coding 的「本轮方法」和冻结记录 |
| CPK-06 | 本机做的技能包导出后装回另一个 Home 还能用、版本对得上；第三方技能包不被换成本机签名；提示词改写导回时逐条确认、版本对不上的不套用；角色、工具、MCP 只带引用，导出文件里没有凭据与端点 |
| CPK-07 | Agent 工具只有 Agent Host 一处全集，别处名单由它派生；角色 `host_tools` 里出现全集没有的名字时装配被拒；Agent Host 的全集与 SDK 的系统工具名单不一致时测试失败 |
| CPK-08 | 收口表（§8）里本批要删的，代码里搜不到；记成 BL 或候选的，每条有主人与去处 |
| CPK-09 | 拒绝：模型或页面伪造一个 `manual` 技能的引用读正文被拒（含委派到 Coding 之后）；列目录不触发 MCP 连接、工具调用或凭据刷新；Agent 与插件调 `kit.catalog.list@1` 被拒；条目里没有提示词正文、改写原文、凭据、密钥与原始路径；装包不改任何提示词；Agent 调导出导入被拒 |
| CPK-10 | `docs/SSOT-MATRIX.md` 与 `docs/system/PACKAGE-BOUNDARIES.md` 写明能力包各类条目归谁、汇总放在哪、为什么（含 9-8 三种方案的比较）；作者手册有「怎么做能力包」一章；GLOSSARY 有词条 |
| CPK-11 | `[人工]` 用户在一个地方找到某个技能、提示词、角色、工具或 MCP，看懂它从哪来、干什么、在哪生效、用了多少，并能去改它 |
| CPK-12 | 一个第三方插件按上报合同上报自己的条目，不改宿主代码就出现在能力包里；汇总时它只用调用方的权限 |

## 12. 决策记录

- **2026-11-08 用户定**：第 09 批从「助理与 Coding 接点」扩成能力包：五类能力（技能、提示词、角色／方法、工具、MCP）的声明与元数据收进同一个能力包统一管理；执行仍走原机制；第 08 批的结论和内容不改；散落、重复、过时的同类东西一起收口；检查后续依赖批次是否要跟着改。用户给了 R1～R8 八条诉求（本 spec §4～§8、§11 按它们展开）和收与不收的边界（§3）。
- **2026-11-08 用户定（名称）**：界面叫「能力包」，代码与动作 id 用 `kit`；Onboarding §3.8 的「能力包」改称「能力组合」。否掉的：界面改叫「AI 能力」（和用户的叫法不一致）；把动作目录的「能力库」改回「动作库」、代码用 `capability_pack`（推翻 U1 的建议方向，改动大，代码里 capability 仍指动作）。
- **2026-11-08 用户定（工具用量）**：09 先显示能便宜取到的最近一次，精确次数随第 61 批 Tool 策略的用量投影。否掉的：09 新增一张工具用量表（动存储、要升级段，和 61 的投影可能重复）。
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
- [Prologue Skill](../prologue-skill-strategy/spec.md)、[Tool](../prologue-tool-strategy/spec.md)、[MCP](../prologue-mcp-strategy/spec.md) 策略（第 61 批收口）
- [Onboarding §3.8 场景与能力组合](../onboarding-coverage/spec.md#38-场景与能力组合)（第 20 批）
