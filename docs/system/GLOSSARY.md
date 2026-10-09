# 术语表

状态：现行（2026-10-08，按 main `bf99c8cb` 的代码核对，并按同日全部 27 项用户决定修订）。第 4 节的界面用词等用户批准；第 5 节的代码改名尚未执行。

这份表回答「同一个东西在仓库里该叫什么」。依据是用户 2026-10-08 的决定（`specs/repository-anti-corruption/spec.md` §1「术语表收敛范围」）：文档里一个概念一个名字、一个定义；代码内部标识符随之改名；用户看得见的用词变化先列清单、经用户批准再发。任务来源是 `docs/prompts/repository-anti-corruption.md` §4.15。

## 0. 怎么用

- 「用名」一栏是文档、spec、Skill、代码注释和新标识符里唯一的写法。「旧称」不再用于新写的内容。
- 三种名字分开记：文档用名、代码标识符、界面文字。界面文字只在「界面现状」里记录，改界面用词要用户批准（第 4 节）。
- 代码里的旧标识符在第 5 节的改名完成前仍在，各条的「代码」是读代码时的对照。持久化或合同里的标识符（动作 id、字段名、权限串、表和列）改名等于改数据或合同，按 `AGENTS.md` 的合同规则先经用户确认，第 5 节单独分类，不默认执行。
- 增删或改名一个术语，在同一个 PR 里改本表和第 4、5 节的清单。
- 界面文字最终存成翻译词典的值，词典的键不随措辞变；术语怎样对应键见 2.7。
- 已有定义的相邻词不在这里重复：Module、Horizontal Service、平台产品服务、Plugin、App 见 [ARCHITECTURE](ARCHITECTURE.md) §3；Home 见 [PRODUCT](../../PRODUCT.md)「Platform and Plugins」（一个 Home 一个常驻宿主）和 [HOME-DATA](HOME-DATA.md)（Home 下每个库与文件归谁）；「每项事实一个主人」和包的成熟度见 [SSOT-MATRIX](../SSOT-MATRIX.md)。

## 1. 速查

| 用名 | 一句话 | 界面现状 | 旧称与易混写法 |
| --- | --- | --- | --- |
| 动作（Action） | 一项已注册、带版本和输入输出合同的可调用操作；所有入口调用同一份 | 能力（另有处写「动作」，见 U1） | 能力、函数、工具（指目录条目时） |
| 动作目录 | 动作服务按调用者算出的、当下可发现的动作清单 | 能力库 | 共同目录、能力目录、能力板、动作库 |
| 动作服务 | 注册、发现、授权、调用动作的共用服务 | 能力服务 | 统一动作服务（全称，可用） |
| 宿主能力（typed capability） | 注册表里不带 `action` 的条目，只作宿主内的服务通道 | 无 | 裸写的「能力」「Capability」 |
| 判断规则 | 已发布、版本不可变的判断：给一段内容，返回选择、是非概率或分数 | 判断规则 | 判断函数、Function、Functions |
| 消费场景 | 插件或系统里真正使用判断结果的位置 | 用途、消费场景 | 判断场景、去向、消费入口 |
| 推荐选项 | 判断结果里「建议做什么」的一项 | 推荐动作 | 行为（behavior） |
| Skill | 按需读取的文字做法，不授予任何权限 | 方法（Character 流程里写 Skills） | 方法（指这个时）、Method |
| 规划方法 | Goals 里可选采用的规划方法包 | 规划方法 | 方法包（method pack） |
| 研究方法 | 炼金术士里用户确认保存、可沿用的研究做法 | 研究方法 | playbook |
| 连接方式 | 一个服务的授权途径（OAuth、命令行、令牌、MCP） | 连接方式 | method（代码里的 `ConnectorMethod*`） |
| Agent | 多轮、带工具、按角色运行并受审查的 AI 工作者；外部的叫外部 Agent，是在外部 Runtime 里运行的工作者 | 内置 Agent、外部 Agent（另有「原生 Agent」等写法，见 U6） | 把 Claude Code、Codex 这类产品叫 Agent（它们是 Runtime） |
| Runtime（AI Runtime） | 能运行 Agent 或与用户对话的 AI 环境，含外部 AI 工具这个产品（Claude Code、Codex 等） | Runtime、执行工具（另有处写「本地 Agent」「Agent」指它，见 U6） | 把外部产品叫 Agent；与 Plugin Runtime、项目运行对象混写（见 2.3） |
| Agent role | 插件或系统声明的 Agent 工作方式，起跑时被冻结 | 角色（「系统与插件带来的角色」） | 角色、role、Character（指它时） |
| Character | 个人拥有、可发布成固定版本的 AI 做事方式；是宿主设置里的一节，不是插件 | 角色（「我的角色」） | 角色（泛称）、Characters 插件 |
| 项目（Project） | 唯一的工作边界与身份，`project_id` | 项目 | Board（指项目时） |
| 目标资料库（Goals 根记录） | Goals 在每个项目库里的根记录，一个项目一条，不是项目本身 | 目标资料库（报错与动作「初始化目标资料库」） | Board（指它时） |
| 讨论（项目讨论） | 右栏里一个项目的群聊与 Thread，在用并继续迭代的产品功能 | 讨论、项目讨论、群聊与 Thread | IM 实验、实验线（它不是实验，也不是 `experiments` 插件） |
| 插件的名字 | `project_plugin_id`、`manifest.plugin_id`、`manifest.name`、界面显示名、目录与包名，五样各有用处 | 显示名中英文混用 | 见第 3 节 |
| 翻译键 | 界面文字在词典里的稳定标识，标识概念和位置，不含措辞；措辞是词典的值 | 无（用户看不见） | 中文原文当键（现状，将被取代，见 2.7） |

## 2. 定义

### 2.1 动作体系

**动作（Action）**

- 定义：一项已注册的操作。它有稳定身份（`capability_id` 加 `version`，要固定提供方时再加 `provider_id`）、类别、作用域、可调用者、所需权限、输入 schema 和可选的输出 schema，由一个提供方的处理器兑现。同一份定义供所有入口使用，入口之间只有可见范围和名称适配的差别。
- 类别（`ActionMetadata.kind`）：`query` 查询、`judgment` 判断、`operation` 操作、`navigation` 打开页面。作用域：`home` 或 `project`。可调用者（`audiences`）：`user`、`agent`、`workflow`、`mcp`、`plugin`。
- 声明不授予权限。`permissions` 只写需要什么；实际授权来自安装授权，以及「对外接入」里逐个客户端（外部 MCP 客户端和内置 Agent 都算一个客户端）授予的 `action_grants`（`docs/modules/actions.md`）。
- 提供方（`ActionProvider`）是 `system`、`plugin` 或 `mcp`（接入的外部 MCP 服务）。「提供方」只指这个；模型厂商叫「供应商」。
- 代码：`ActionDefinition`、`ActionMetadata`、`ActionReference`（`packages/contracts/src/platform/actions.ts`）；插件在 Manifest 的 `actions` 里声明。
- MCP 工具是动作在 MCP 客户端上的呈现，工具名由动作身份派生，通常是 `molis_work_v1_action_<capability_id>__v<version>`（`apps/mcp/src/action-tools.ts`、`apps/local-host/src/mcp-action-grants.ts`）。它不是另一种对象。
- 取舍：文档和代码写「动作」。以 `Action` 开头的类型名出现在 283 个源码文件里，spec 与架构文档也这么写；「能力」在代码里是注册表条目那一层（capability，见下），界面则把动作叫「能力」（第 4 节 U1）。
- 不是：页面上的按钮。按钮是在某个对象上推荐出来的动作（见推荐选项）。

**动作目录**

- 定义：动作服务按调用者、项目、授权、生命周期和连接状态算出的、当下可发现的动作清单，即 `ActionService.discover(context)` 返回的 `ActionView[]`。它是一个视图，不是第二份登记；事实是已注册的动作和它们的处理器。
- 创作台的「能力板」展示的是面向生成插件的这份目录（`docs/platform/PLUGIN-DEVELOPMENT.md`），不是另一份。
- 旧称（都指它）：共同目录、统一能力目录、能力目录、能力板、能力库、动作库。

**动作服务**

- 定义：让页面、内置 Agent、工作流程、插件和外部 MCP 客户端从同一处注册、发现、授权、调用动作的服务。动作注册一次，所有入口读同一个目录。
- 代码：`ActionService`（`packages/kernel/src/action-service.ts`：`registerProvider`、`discover`、`invoke`、`discoverScenes`、`bind`）；宿主侧的装配在 `apps/local-host/src/local-host.ts`。
- 两个都叫「网关」的东西要分开写：**动作网关**是本机回环 HTTP 转发（`/api/internal/action-service`，`apps/local-host/src/action-gateway.ts`），让 stdio MCP 这类非常驻进程调用常驻宿主的动作服务；**Agent 动作工具**是发给内置 Agent 一轮的工具（`find-capabilities`、`read-capability`、`change-capability`、`suggest-action`、`change-reversible`，`horizontal/agent-host/src/adapters/prologue-action-gateway.ts` 里的 `GATEWAY_TOOLS`），用来找、读、调用动作。

**宿主能力（typed capability）与 Capability**

- 定义：`HostCapabilityDescriptor` / `HostCapabilityDefinition`（`packages/contracts/src/platform/app-host.ts`）是注册表条目的类型，有 `capability_id`、`version`、`operation`（`query`、`command`、`wait`）。动作是带 `action` 元数据的 capability（`ActionDefinition extends HostCapabilityDefinition`）；不带 `action` 的叫宿主能力，经 `LocalHost.invoke()` 调用。`ActionService.discover` 只列带 `action` 的条目，所以宿主能力不进动作目录。
- 现状：`LocalHost.register()`（`apps/local-host/src/local-host.ts`）里，带 `action` 的交给 `ActionService.registerProvider`，不带的进 `CapabilityRegistry`（`packages/kernel/src/index.ts`）。Manifest 的 `capabilities.provides` / `consumes` 列的是宿主能力 id，插件只能调用自己声明消费的（`packages/plugin-runtime/src/services.ts`）；动作写在 Manifest 的 `actions`。
- 方向（2026-10-07 用户决定，`specs/repository-anti-corruption/spec.md` §1「两套能力机制收敛」）：对外的只走动作；宿主能力只留作 Runtime 插件的宿主内服务通道（`agent.*`、`schedule` 等），不再新增。收敛还没完成。
- 写法：文档写「动作」；只有讲注册表类型时写 capability；讲宿主内通道写「宿主能力」。`docs/system/ARCHITECTURE.md` §4 与 `docs/platform/PLUGIN-PLATFORM.md` §3 里的 Capability 指宿主能力这一层。

### 2.2 判断体系

**判断规则（judgment rule）**

- 定义：一条已发布、版本不可变的规则：输入一段内容（至多 8000 字），由 TypeSafe 服务（Jev）按规则返回结构化判断，形态是 `choice`（选一个键）、`noul`（是非加概率）或 `score`（分数）三种之一。草稿不在动作目录里，发布后注册为动作 `functions.published.<function_key>`（类别 `judgment`，权限 `functions:invoke`）。每次调用留一条判断记录（`JudgmentRecord`，库表 `function_judgments`）。判断只推荐，不取得执行授权。
- 归属：`modules/functions`（草稿、版本、样本、判断记录）；编辑器在 `apps/workbench/src/functions`，从「能力 → 能力库 → 编辑判断规则」进入 `/capabilities/rules`。没有独立的 Functions 插件。
- 取舍：界面本来就叫「判断规则」。「函数」一词同时被「函数调用」（调用动作）和工作流程里的「模板转换」占用，所以文档不用。
- 不是：工作流程的「模板转换」（衔接类型，代码里叫 `function`，不调用模型）；也不是已被删除的 Functions 插件。

**消费场景（consumption scene）**

- 定义：插件或系统里真正使用判断结果的位置，不是下拉框里的一个标签。它声明触发时机、对象种类、交给判断的上下文和接受的结果形状；谁在使用它，由消费者自己保存的绑定（`ActionSceneBinding`）记录，绑定把「某个场景里的某个位置」连到「某条判断规则」。目录里的「已用在哪」从这些绑定反查，不另存一份。
- 代码：`ActionSceneDefinition`、`ActionSceneBinding`、`ActionSceneHandlerBinding`（`packages/contracts/src/platform/actions.ts`）；插件在 Manifest 的 `action_scenes` 里声明，并兑现 `bindings`、`bind`、`consume`。现有场景：`home.dock`（`apps/local-host/src/home-actions.ts`）、`feed.capture`（`plugins/native/feed/src/scenes.ts`）、`inbox.next`（`plugins/native/inbox/src/scenes.ts`）。
- 旧称：判断场景（skills 与手册里）、去向（skills 里的说法；代码里是 `destination`，规则编辑器的目录里除场景外还含一个 `agent.mcp`，表示交给 Agent 经 MCP 调用）、消费入口（`specs/action-architecture/spec.md` §3）。

**推荐选项（recommendation option）**

- 定义：判断结果里「建议做什么」的一项。一项要么是一个动作引用（`recommended_actions`，精确的 `ActionReference` 加 `provider_id`），要么是消费场景在 `result_schema` 里列出的符号（`suggested_behavior_ids`，只在该场景内有意义，由场景所有者映射到自己的按钮或动作）。推荐不授予执行权限。
- 代码里这一概念一直叫 behavior：结果类型 `molis.behavior-recommendation.v1`，字段 `suggested_behavior_ids`（也存在 `function_judgments.suggested_json` 里），编辑器目录 `FunctionAuthoringBehavior`（`packages/contracts/src/modules/functions.ts`）、`apps/local-host/src/behavior-catalog.ts`。Manifest 的 `behaviors` 已在 2026-10 删除。
- 旧称：行为。文档不再用这个词指它。

### 2.3 AI 执行体系

**Agent**

- 定义：按一个角色运行、有多轮循环和工具、经动作服务使用被授权的动作、副作用进入审查队列的 AI 工作者。一次有界的文字、结构化、图片或判断调用不是 Agent（`docs/platform/PROLOGUE-AI.md` §2）。
- 内置 Agent 由 `horizontal/agent-host` 经 Prologue 运行（动作的可调用者 `agent`，客户端 id `agent:prologue`）；系统级的助理（Assistant）是其中一个，角色 id 是 `assistant`（`apps/local-host/src/assistant/assistant-agent.ts`）；插件用 Manifest 的 `agent` 块声明自己的 Agent（`AgentManifest`）。外部 Agent 是在 Claude Code、Codex 等外部 Runtime 里运行的工作者，经 MCP 使用动作（可调用者 `mcp`）；它所在的外部 Runtime 可由 `horizontal/runtime-host` 启动、恢复。
- 文档里区分两面，一个词只指其中一面：
  - 写 Runtime（已知是哪个产品时写产品名，如 Claude Code）：说的是产品或环境，是被探测、被选用、被当作导入来源、被扫描、被启动、被连接的对象，连同它的命令行、配置目录和进程。
  - 写 Agent（外部的写「外部 Agent」）：说的是在 Runtime 里运行的工作者，是做事、使用自己的登录与权限、请求授权和提问、调用动作、被审查的对象。
  - 判法：看句子里它在做什么。在做事，写 Agent；在被选、被找、被启动，写 Runtime。所以「Claude Code 是一个 Agent」「扫描本地 Agent」都是把产品叫成了工作者，不再这样写；「外部 Agent 使用自己的权限」是对的。
- 外部 AI 工具在界面里有许多叫法（原生 Agent、本地 Agent、本机 Agent、外部原生 Agent、外部 Agent、Agent CLI、单写的 Agent、执行工具、Runtime），多数指的是产品而不是工作者。第 4 节 U6 把它们逐条分成两组，建议界面也按这两面写。

**Runtime（AI Runtime）**

- 定义：能运行 Agent 或与用户对话的 AI 环境。本机有两类：Home 唯一的 Prologue Runtime（内置），以及外部 AI 工具。`horizontal/agent-host` 注册 Runtime 并记录各自的能力矩阵，`horizontal/runtime-host` 启动、恢复外部 Runtime 的进程和终端。产品对 Runtime 保持中立（`PRODUCT.md`）。
- 另外两个东西也带 Runtime，写的时候必须加限定：**Plugin Runtime**（`packages/plugin-runtime`，插件的安装、授权、隔离和生命周期；「Runtime 插件」指经它装配的插件，对比构建期装配的插件，见 `AGENTS.md` 硬约束）；**项目运行对象**（`MolisWorkProjectRuntime`，`apps/local-host/src/project-host.ts`，宿主为一个已打开的项目装起来的存储和协调对象）。
- 裸写「Runtime」只指本条的 AI Runtime（`skills/goal-advance/SKILL.md` 与 `docs/runtime.md` 都是这个用法）。

**Agent role（角色声明）**

- 定义：插件或系统声明的一种 Agent 工作方式：`role_id`、版本、名称、执行档位（`read-only`、`text-edit`、`workspace-write`、`operate`）、工作区方式、由哪几段提示词按层（`base`、`role`、`project`、`task`）组成。起跑前 Host 从声明里冻结它，运行中不能变宽（`AgentRoleDeclaration`，`packages/contracts/src/platform/plugin-agent.ts`；`docs/horizontal/agent-host.md`）。
- 来源：插件 Manifest 的 `agent.roles`，或系统内置（`apps/local-host/src/agent-definitions/builtin-agents.ts`）。设置的「角色」页把它们列在「系统与插件带来的角色」下。

**Character**

- 定义：个人拥有的 AI 做事方式：标题、指令、可选的内置工具范围和动作范围（用来限制，不授予权限）、可附带导入的规则与 Skill 快照。草稿归 `modules/characters`，发布到项目后是成果的一个固定版本（类型 `character.definition.v1`）。起跑时按精确版本选用，且只对插件在 Manifest 的 `agent` 块里用 `characters.role_ids` 声明接受 Character 的 Agent role 开放（声明类型 `AgentManifest`，`packages/contracts/src/platform/plugin-agent.ts:189`；Coding 的声明在 `plugins/native/coding/src/roles.ts:38`；起跑时的核对在 `horizontal/agent-host/src/index.ts:466`）。
- 归属（2026-10-08 用户决定，`specs/repository-anti-corruption/spec.md` §1「Characters 的代码身份」）：Characters 不是插件，是宿主设置里的一节，界面仍是「设置 › 角色」；代码并进宿主或一个 Module，它的安装记录与 Runtime 条目一起删。文档按「设置的一节」写；只有讲落地前的代码时才写「Characters 插件」。
- 现状代码（上面的决定还没落地）：`plugins/native/characters` 仍是经 Plugin Runtime 装配的插件（`kind: "app"`，`plugin_id` 为 `io.molis.work.characters`），在内置插件清单里带 `personal: true`（`apps/workbench/src/builtin-plugins.ts`），宿主侧另有 4 个文件：`apps/local-host/src/characters-host.ts`、`apps/local-host/src/character-import-discovery.ts`、`apps/local-host/src/character-import-plugins.ts`、`apps/local-host/src/character-native-execution.ts`。已发布的版本里存着生产者身份（`CHARACTER_PLUGIN_ID`、`CHARACTER_PUBLISHER_SIGNATURE`，`packages/contracts/src/modules/characters.ts:12-13`），`plugins/native/characters/src/plugin.ts:36` 读取时核对；并入宿主时这两个值保留还是迁移，由并入的切片定，不属于术语改名。
- 代码：`CharacterDraft`、`CharacterContent`（`packages/contracts/src/modules/characters.ts`）。
- 注意：设置的「角色」页同时列出 Character（「我的角色」）和 Agent role（「系统与插件带来的角色」）。界面把两者统称「角色」，文档分开写：个人的叫 Character，声明出来的叫 Agent role。裸写「角色」只用于引用这个界面标签。

**Skill**

- 定义：一份按需读取的文字做法，有名称、适用说明和正文，可声明它会用到的工具；它不授予任何权限，权限仍来自动作授权。同一种东西有三处载体：
  1. 仓库的 `skills/<名>/SKILL.md`，给外部编码 Runtime 和插件创作台用（`goal-advance` 随安装发进用户的 Runtime，创作台挂载 `molis-plugin-dev` 的章节，见 `apps/local-host/src/plugin-builder/skill.ts`）。
  2. 插件为 Agent 提供的 Skill：类型 `AgentSkillDeclaration` / `AgentSkillDefinition`（`skill_id`、`version`、`name`、`summary`、`tools`、`body`），Manifest 里有两个位置：`agent.skills` 是插件自己的 Agent 用的，`methods` 是提供给别的 Agent（助理、Character）用的；也可从项目目录安装（`agent.skills.discover.v1`、`agent.skills.install.v1`，只存文本，不执行包内脚本）。起跑时只接受精确的 id 与版本。
  3. Character 里导入的 Skill 快照（`import_snapshot.skills`），每轮选用其中几个。
- 取舍：Prologue SDK、导入来源和代码类型都叫 Skill；只有界面和少数标识符（Manifest 的 `methods` 键、`assistant.methods.*`）叫「方法」，而「方法」在界面里还指规划方法、研究方法、连接方式。所以文档统一写 Skill，其余三个「方法」必须写全名。
- 旧称：方法（指 Skill 时）、Method。

**其余三种「方法」（必须写全名）**

- 规划方法（planning method）：Goals 拥有、规划时可选采用的方法包（类型 `PlanningMethodPack` 在 `packages/contracts/src/modules/goals.ts:209`，解析与内置包在 `modules/goals/src/planning/method-packs.ts`），按「项目 > 个人 > 内置冷启包」生效；内置包是 `modules/goals/methods/` 下的 Markdown。
- 研究方法（research method）：炼金术士里用户确认保存、可在新研究里沿用的做法，代码里叫 playbook（`memory.playbook.*`，`plugins/native/alchemist/src/studio/shared/contracts/actions.ts`）。
- 连接方式（connection method）：一个服务可用的授权途径，`ConnectorMethodOption`（`kind` 为 `oauth`、`cli`、`token`、`mcp`，`packages/contracts/src/services/connector-host.ts`）。

### 2.4 项目与 Board

**项目（Project）**

- 定义：唯一的工作边界。`project_id` 是它唯一的身份：目录条目、项目数据库和库里 Goals 的根记录都用它（`docs/system/ARCHITECTURE.md` §2、`docs/modules/projects.md`）。每个项目一个 SQLite 库；部分个人插件的 Home 级库按 `project_id` 区分本项目与个人。「个人空间」是保留身份的项目分区，不列为项目，不能改名或删除。
- 项目插件和个人插件的分法见 `PRODUCT.md`「Platform and Plugins」。

**目标资料库（Goals 根记录）**

- 定义：Goals 在每个项目数据库里的根记录，一个项目一条：记录项目标题和当前聚焦的 Goal，Goals 的其他记录挂在它下面（表 `boards`，`project_id` 是主键，`modules/goals/src/schema.ts:159`；记录类型 `GoalsBoardRecord`，`packages/contracts/src/modules/goals.ts:380`）。它不是项目：项目身份是 `project_id`，这条记录用同一个 `project_id` 作键。
- 动作 `goals.board.initialize`（标题「初始化目标资料库」，`plugins/native/goals/src/board-actions.ts:21`）创建它；没有它时 Goals 的读写报「这个项目还没有初始化目标资料库」（`modules/goals/src/command-support.ts:32`，2026-10-08 起的界面文案）。托管的项目数据库必须恰好有一条（`apps/local-host/src/managed-project-database.ts:43`）。
- 文档写「目标资料库」（与界面同名）；代码里仍叫 Board，改名见 R-A1。

**Board**

- 不再是项目的名字。2026-10 起 `board_id` 已改为 `project_id`（`docs/system/ARCHITECTURE.md` §2），文档里不再用 Board 指项目。
- 代码里还剩的 Board 标识符指的是项目或目标资料库：多数是目标资料库（`GoalsBoardRecord`，表 `boards`），Casebook 日志的 `board` 列存的是 `project_id`（`apps/local-host/src/casebook/observer.ts`）。表名 `boards` 按 2026-10-06 的决定保留（它是 Goals 的根记录，不是第二个身份）；其余标识符的改名见第 5 节。
- 正当的别的用法，不属于改名范围：Goals 的**看板**视图（与列表、依赖画布并列，同一份 Goal 与关系的派生视图）；Agent 的**任务板、步骤板**（Prologue SDK 的概念，`horizontal/agent-host/src/adapters/prologue-taskboard.ts`、`plugins/native/coding/src/taskboard.ts`）；设计系统的**组件板**（`/__ui/catalog`，`DESIGN.md`）。

### 2.5 其他易混的词

- **提供方**与**供应商**：提供方是动作的提供者（`ActionProvider`）；供应商是模型厂商。
- **工具**必须加限定：MCP 工具（动作的呈现）、Agent 工具（内置 Agent 一轮里的工具，如 `ask-user`、`find-capabilities`）、执行工具（界面「AI 与执行工具」页里的外部 Runtime）。
- **Function**：在代码里同时指判断规则（`modules/functions`）和工作流程的模板转换（衔接类型 `function`）；文档写判断规则或模板转换。

### 2.6 讨论（项目讨论）

- 定义：右栏的「讨论」页签（页签名「讨论」，页内标题「项目讨论」，内嵌页标题「群聊与 Thread」）：一个项目里的群聊和内联 Thread。它是在用、会继续迭代的产品功能，不是实验，也不是待删的东西（2026-10-08 用户决定，`specs/repository-anti-corruption/spec.md` §1「右栏『讨论』页签与 IM 代码」）。
- 代码：页签与内嵌框在 `apps/workbench/src/side-panel.ts:38,42`；服务端包 `server/`（`@molis-ai/molis-work-server`，Home 下的库 `server/server.sqlite`，表名前缀 `mw_`，`server/src/database.ts`）里的群聊域；界面包 `packages/im-ui`（`@molis-ai/molis-work-im-ui`）；合同子路径 `@molis-ai/molis-work-contracts/services/im`；宿主挂载在 `apps/local-host/src/im-server.ts`。`apps/server` 是同一服务的独立启动器，没有产品入口，去留随功能迭代另定。
- 写法：文档写「讨论」或「项目讨论」，代码缩写是 IM。不再写「IM 实验」「实验线」。它不是 `experiments` 插件（界面叫「实验」），也不在内置插件清单里。
- 重名：`im` 在工作台代码里同时是整个右栏的 dock 窗口 id（`apps/workbench/src/side-panel.ts:35` 的 `dock-window-im`、`apps/workbench/src/immersive-shell.ts` 的 `data-dock-toggle="im"`），不只指讨论页签，见 R-A10。
- 同一决定里的三处账目修正不属于命名，列在这里避免误会：`server/server.sqlite` 已登记进 Home 数据与备份表（`docs/system/HOME-DATA.md` 3.4），`uninstall --purge-user-data` 也清除 `server/`（W2-12）；宿主不再直接读它的表（`apps/local-host/src/im-server.ts` 里读 `mw_projects`、`mw_members`，W2-06 未做）；`server` 的包类别已由基础包改成业务包（`scripts/workspace-packages.mjs:36` 标 `module`，按 Module 规则检查）；`packages/im-ui` 是界面包、不拥有事实，仍标 `foundation`（同文件第 37 行），是否改类另待决定。

### 2.7 术语与翻译键

- 现状：翻译键就是中文原文。`apps/workbench/src/i18n/en.ts` 的 `EN: Record<string, string>` 由工作台和各插件的词典展开合成，条目形如 `"连接不可用": "Connection unavailable"`。所以改一个界面用词要同时改源码里的文字和每份词典的键，同一句中文在不同词典里还可以有不同的英文，例如「判断规则」在 `apps/workbench/src/functions/en.ts:148` 是 Judgment rules，在 `plugins/native/lingguang/src/en.ts:47` 是 Rules，在 `plugins/native/workflows/src/en.ts:151` 是 Judgment rule。
- 决定（2026-10-08，`specs/repository-anti-corruption/spec.md` §1「界面翻译」，用户没有选推荐）：全部换成稳定键，词典按主人分，CI 查缺失、无用与冲突；路线第 5 波的「翻译按主人分」改成「稳定键」，先做一个插件样板（W5-03）。
- 术语怎样对应键（规则；样板落地时按实际调整，调整在同一个 PR 里改本节）：
  1. 键标识概念和位置，不含措辞；中文和英文措辞都是词典的值。所以第 4 节的界面用词获批后只改词典的值，键、代码标识符和文档都不动；不获批就保持现值。英文值跟中文值同一批审批，例如「能力」今天译作 Capabilities（`apps/workbench/src/i18n/gap-en.ts:109`）。
  2. 键用英文小写加点分层，形如 `<主人>.<位置>.<元素>`：主人是 `project_plugin_id`（第 3 节）或宿主区域（如 `settings`、`shell`）。键里指本表概念的那一段，用下表「键里的词」；旧称不进新键。示例（不是现存的键）：`judgment_rule.editor.step.scene`。
  3. 下表的词与第 5 节 R-A 的新标识符同源，代码改名完成后键里的词与标识符一致。
  4. 同一个键在合并后的全部词典里只能有一个值（现在中文键下的冲突，如上面「判断规则」的三个英文，换成稳定键后由 CI 的冲突检查拦）；同一概念被写成两个不同的键、各带不同措辞（如 U1 的「动作库」和「能力库」），CI 看不出，靠评审对照本表。
  5. 现在词典里含旧术语的无用条目（R-A8 的 11 条）不带进稳定键，转换时作为无用键处理，不单独改名。

| 术语 | 键里的词 |
| --- | --- |
| 动作 | `action` |
| 动作目录 | `action_catalog` |
| 动作服务 | `action_service` |
| 宿主能力 | `host_capability` |
| 判断规则 | `judgment_rule` |
| 消费场景 | `scene` |
| 推荐选项 | `recommendation_option` |
| Skill | `skill` |
| 规划方法 | `planning_method` |
| 研究方法 | `research_method` |
| 连接方式 | `connection_method` |
| Agent | `agent` |
| Runtime（AI Runtime） | `runtime` |
| Agent role | `agent_role` |
| Character | `character` |
| 项目 | `project` |
| 插件 | `plugin` |
| 讨论 | `discussion` |

## 3. 插件的名字

### 3.1 五样名字

| 名字 | 是什么 | 例子 |
| --- | --- | --- |
| `project_plugin_id` | 项目里启用与隐藏、插件切换器、工作面都用的短 id（`ProjectPluginId`） | `goals`、`form`、`plugin-builder` |
| `manifest.plugin_id` | 插件的身份键，安装记录、事件订阅、发行物留存、提示词覆盖（`owner_id`）等都以它为键；签名变了同样视为另一个插件，旧授权、存储和绑定不继承（`docs/platform/PLUGIN-PLATFORM.md` §2） | `io.molis.work.sessions` |
| `manifest.name` | Manifest 里的名字。它不只是导航标题缺省时的显示名：成果类型声明、「继续」与「被谁引用」入口里的 `plugin_title` 取它（`apps/workbench/src/plugin-catalog.ts:305,313,322`），成果预览里的「在 X 打开原对象」用它（`apps/local-host/src/artifact-native-plugin-http.ts:61`），动作提供方的标题也取它（`apps/local-host/src/content-action-providers.ts:33`），所以会出现在界面上 | `Forms`、`待办` |
| 界面显示名 | `manifest.ui.views[].title`，插件切换器和标签页标题用它 | `Forms`、`角色` |
| 目录与包名 | `plugins/native/<目录>`，`@molis-ai/molis-work-plugin-<目录>` | `plugins/native/work` |

### 3.2 写法规则

- 讲产品时先写界面显示名；要精确指代时写 `project_plugin_id`。路径、包名、`plugin_id` 只在讲代码或身份时写。
- `manifest.name` 应与界面显示名一致，因为上面几处会把它直接显示出来。现在只有 `characters` 不一致（名称 Characters，界面「角色」）；它按 2.3 的决定并入宿主后这个差异随之消失。
- 内置插件清单以 `apps/workbench/src/builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG` 为准（现行代码共 26 个：项目插件 11 个，个人插件 15 个；Characters 按 2.3 的决定并入宿主后，是 25 个，个人插件 14 个）。官方集成的 `plugin_id` 是 `io.molis.work.integration.<连接器>`（`plugins/official-integrations/*/src/index.ts`）。

### 3.3 内置插件的名字对照

规则上 `plugin_id` 是 `io.molis.work.<project_plugin_id>`，目录和包名与 `project_plugin_id` 相同，界面 UI 描述（`UiContributionDescriptor`）里的 `plugin_id` 与 Manifest 的相同。下表列出全部 26 个，凡不规则的在最后一栏写明（2026-10-08 核对每个插件的 Manifest 和 UI 描述）；表后第 1–4 条是跨插件的说明。

| `project_plugin_id` | `manifest.name` | 界面显示名 | 不规则之处 |
| --- | --- | --- | --- |
| `goals` | Goals | Goals | 12 个 UI 描述写成 `io.molis.work.native.goals`（见表后第 2 条） |
| `sessions` | Sessions | Sessions | 目录和包名是 `work`（`@molis-ai/molis-work-plugin-work`）；2 个 UI 描述写成 `io.molis.work.native.work`（与 Manifest 的 `io.molis.work.sessions` 也不同，见表后第 2 条） |
| `inbox` | Inbox | Inbox | UI 描述写成 `io.molis.work.native.inbox`（表后第 2 条） |
| `feed` | Feed | Feed | UI 描述写成 `io.molis.work.native.feed`（表后第 2 条）；出站规则生成的成果版本记着生产者 `io.molis.work.native.feed`（表后第 3 条） |
| `schedule` | Schedule | Schedule | UI 描述写成 `io.molis.work.native.schedule`（表后第 2 条） |
| `artifacts` | 成果 | 成果 | 2 个 UI 描述写成 `io.molis.work.native.artifacts`（表后第 2 条） |
| `coding` | Coding | Coding | |
| `files` | Files | Files | |
| `git` | Git | Git | |
| `diff` | Diff | Diff | |
| `text-stats` | Text stats | Text Stats（导航）、Text stats（页面） | 两个标题大小写不同 |
| `cognia` | Cognia | Cognia | |
| `plugin-builder` | 插件创作工作台 | 插件创作工作台 | |
| `images` | 图片 | 图片 | |
| `jelly` | Jelly | Jelly | |
| `experiments` | 实验 | 实验 | |
| `shelf` | Shelf | Shelf | |
| `lingguang` | 灵光 | 灵光 | |
| `todo` | 待办 | 待办 | |
| `characters` | Characters | 角色 | 名称与界面显示名不同；页面只在设置里，不进插件切换器；按 2.3 的决定会并入宿主，这一行随之删除 |
| `pages` | Pages | Pages | |
| `form` | Forms | Forms | id 单数，名称复数 |
| `dataset` | Dataset | Dataset | |
| `ppt` | PPT | PPT | |
| `alchemist` | 炼金术士 | 炼金术士 | |
| `workflows` | 工作流程 | 工作流程 | Manifest 的 `plugin_id` 是 `io.molis.work.native.workflows`，比其他插件多一段 `.native.`（表后第 1 条） |

中文界面里显示名中英文混用：17 个用英文（Goals、Sessions、Inbox、Feed、Schedule、Coding、Files、Git、Diff、Text stats、Cognia、Jelly、Shelf、Pages、Forms、Dataset、PPT），9 个用中文（成果、插件创作工作台、图片、实验、灵光、待办、角色、炼金术士、工作流程）。Characters 已定为设置的一节而不是插件（2.3），并入宿主后清单是 25 个，个人插件 14 个。

表外的几处不规则：

1. **Manifest 的 `plugin_id` 多一段 `.native.`**：只有工作流程（`plugins/native/workflows/src/model.ts:7`）。它是安装记录、事件订阅、发行物留存和提示词覆盖（`owner_id`，`plugins/native/workflows/src/prompts.ts:5`）的键，改名属 R-B8。
2. **UI 描述里的 `plugin_id` 与 Manifest 不一致**：6 个插件共 19 个描述写成 `io.molis.work.native.<x>`，而它们的 Manifest 是 `io.molis.work.<x>`（会话插件的 Manifest 是 `io.molis.work.sessions`，描述却是 `io.molis.work.native.work`）。位置：Goals 12 个（`plugins/native/goals/src/` 下的 `context-ui.ts:20`、`decision-results-ui.ts:13`、`dialogs-ui.ts:94`、`document-ui.ts:60`、`factors-ui.ts:64`、`momentum-ui.ts:70`、`planning-ui.ts:26`、`policy-ui.ts:147`、`proposal-ui.ts:203`、`relation-ui.ts:145`、`status-ui.ts:81`、`tree-ui.ts:256`），Feed `ui.ts:164`，Inbox `ui.ts:37`，Schedule `ui.ts:33`，成果 `browser-ui.ts:223` 与 `reference-ui.ts:33`，会话 `ui/contribution.ts:9` 与 `ui/terminal.ts:16`。Plugin Runtime 对经它装配的插件的视图描述会拒绝这种不一致（`packages/plugin-runtime/src/contribution.ts:51`），构建期装配的插件没有这道检查，所以没被发现。`descriptor.plugin_id` 只被这道检查和已安装插件的客户端加载（`packages/ui-host/src/plugin-client.ts:31`）读取，我没有找到把它存进库的地方，所以改名属 R-A9，不属 R-B。但 `tests/builtin-plugin-composition.test.ts:44-48` 的注释写着构建期 UI 的「旧公开身份保持稳定」，并断言了其中两个描述的 `plugin_id`，改前要先确认那条断言想钉的是 `plugin_id` 还是只是 `contribution_id`。
3. **成果版本里记着一个不同的生产者 id**：Feed 的出站规则生成成果版本时，生产者写的是 `FEED_ARTIFACT_PRODUCER`（`plugins/native/feed/src/out-rules.ts:16-17,221`），`plugin_id` 为 `io.molis.work.native.feed`，`binding_signature` 为 `native:feed`；Feed 的 Manifest 是 `io.molis.work.feed`（`plugins/native/feed/src/identity.ts:1`）。生产者存进成果表的 `producer_plugin_id`（`modules/artifacts/src/repository.ts:52`），所以这是已存数据，改名属 R-B9。它还有一个后果：宿主按声明检查内置插件的写入时用生产者的 `plugin_id` 查内置目录，查不到的生产者放行（`apps/local-host/src/declared-types.ts:11-17`），所以这条写入没有被对照 Feed 的 `artifacts.produces` 检查。
4. **贡献 id（`contribution_id`）不是插件 id**：多数内置插件的贡献 id 以 `io.molis.work.native.<x>.` 开头（如 `io.molis.work.native.todo.ui.v1`，`plugins/native/todo/src/ui.ts:4`）。这是贡献 id 的命名空间，不要拿它推 `plugin_id`；它不在改名范围内。


## 4. 界面用词待批清单

以下每一条都会改变用户看得见的文字，未经用户批准不改。「建议」是推荐，不是已定；不批准时，本表在「界面现状」一栏记录对照，文档照常使用「用名」。位置给出文件，行号会漂移，以符号和字面为准。

**U1　动作叫「能力」还是「动作」**

- 现状：界面把动作目录叫「能力」：顶栏「能力」「打开能力服务」（`apps/workbench/src/arrival/shell.ts`），页面「能力库」（`apps/workbench/src/capabilities.ts`、`apps/workbench/src/settings-sections.ts`），创作台「能力板」（`plugins/native/plugin-builder/src/agent-studio.ts`），角色页「角色可选能力」（`plugins/native/characters/src/actions.ts`），助理提示词里的「可用能力目录」（`apps/local-host/src/assistant/assistant-service.ts`），报错「能力未注册或版本已失效」（`packages/kernel/src/action-service.ts`）。在 `apps/workbench/src`、`plugins/native`、`apps/local-host/src` 里，「能力」出现 264 行，「动作」200 行（只数 `.ts/.mts/.mjs`，不含测试和英文翻译文件；含注释、提示词和动作说明，不全是界面文字）。
- 同一页里两个词并用：判断规则编辑器里既有「从动作库加入」「原动作不可用」（`apps/workbench/src/functions/client.ts`），又有「搜索能力」「没有匹配的能力」（`apps/workbench/src/functions/ui.ts`、`client.ts`）。
- 同一组页面两个名字：顶栏进入的是「能力 · 系统服务」，设置里同样四页（能力库、服务连接、对外接入、调用记录）却放在「工具与接入」组下（`apps/workbench/src/settings-sections.ts`）。该组还含「AI 与执行工具」，范围比前者大，所以这一条不要求合并，只请确认。
- 建议：界面统一用「能力」指目录里的条目（它已是顶栏、页面名和设置项的名字）：把「动作库」「原动作」两处改成「能力库」「原能力」；页面上给用户的下一步仍叫「动作」（「页面动作」「推荐动作」）。代码与文档仍写 Action，术语表记录「界面叫能力」。
- 备选：界面全部改成「动作」；保持现状。

**U2　界面里出现的「Functions」改成「判断规则」**

- 现状：Functions 插件已不存在，但这些用户可见的文字还在用这个名字：`apps/local-host/src/connector-access.ts`（错误提示「请在使用此连接的模型、Images、Functions 或 Coding 设置中……」）、`apps/local-host/src/connector-directory.ts`（TypeSafe 连接的说明与用途标签）、`apps/local-host/src/host-connector-methods.ts`、`apps/local-host/src/functions-http/route-error.ts` 和 `apps/workbench/src/functions/client.ts`（「Functions 请求失败」）、`apps/local-host/src/plugin-builder-surface.ts`（「请在 Functions 设置中配置 TypeSafe Key」）、`apps/workbench/src/settings-connector-guide.ts`、`apps/workbench/src/settings-connectors.ts`（含按钮「查看 Functions」，实际链到能力库）。英文界面的对应译文随之改。
- 建议：改成「判断规则」。
- 备选：保持现状。

**U3　Skill 在界面叫「方法」**

- 现状：Coding 的「项目方法」「安装方法」「方法」（`plugins/native/coding/src/ui.ts`、`settings-client.ts`、`client.ts`），助理里的「用一个能力或方法」和物料类型「方法」（`apps/workbench/src/scripts/client/assistant-island.ts`、`apps/workbench/src/settings-agent-diagnostics.ts`）；同一界面的 Character 流程却写「本轮使用的 Skills」（`plugins/native/coding/src/characters-client.ts`）。而「方法」还指规划方法、研究方法、连接方式。
- 建议：上面这些指 Skill 的地方统一写「Skill」；规划方法、研究方法、连接方式保持全名。
- 备选：界面保留「方法」，把 Character 流程里的「Skills」也改成「方法」；保持现状。

**U4　消费场景在界面叫「用途」或「消费场景」**

- 现状：规则编辑器的步骤叫「选择用途」（`apps/workbench/src/functions/ui.ts`），能力库页和一批报错写「消费场景」（`apps/workbench/src/capabilities.ts`、`apps/local-host/src/functions-actions.ts`、`apps/local-host/src/local-host.ts`）。
- 建议：用户可见处统一写「用途」，把报错和能力库页里的「消费场景」改掉；文档与代码仍写消费场景。
- 备选：统一成「消费场景」；保持现状。

**U5　Board 还出现在 4 处报错里**

- 现状：「Board 已存在」「Board ID 和名称不能为空」（`modules/goals/src/board-commands.ts`）、「Goal Tree 提案的 base_event_cursor 必须是当前 Board 已观察到的事件游标」（`plugins/native/goals/src/goal-tree-submission.ts`）、「项目数据库必须恰好包含一个 Board」（`apps/local-host/src/managed-project-database.ts`）。这些是动作和命令的报错，用户会在各入口看到。同日的文案改动（#299）已把「Board 不存在」和动作「初始化目标资料库」的说明改成「目标资料库」，所以这 4 处与它不一致。
- 建议：余下的统一写「目标资料库」或「项目」，与 #299 一致：「目标资料库已存在」「项目 ID 和名称不能为空」「……必须是当前目标资料库已观察到的事件游标」「项目数据库必须恰好包含一个目标资料库」。错误码 `board.not_found` 等属合同，随第 5 节 R-B3 决定，不在这一条。
- 备选：保持现状。

**U6　「角色」同时指 Character 和 Agent role；外部 AI 工具和它里面的工作者都被叫成「Agent」**

- 现状（角色）：「角色」页把「我的角色」（Character）和「系统与插件带来的角色」（Agent role）放在一页（`plugins/native/characters/src/ui.ts:63,69`）；Coding 的提示同一句里写「已发布角色」和「左侧 Characters」（`plugins/native/coding/src/characters-client.ts:41`）。
- 现状（Agent 一词）：界面里指外部 AI 工具的地方写过「原生 Agent」「本地 Agent」「本机 Agent」「外部原生 Agent」「外部 Agent」「终端 Agent」「Agent CLI」，还有单写的「Agent」（导入对话框的下拉框标签，选项却是 Codex、Claude Code、Cursor 这样的产品；Shelf 的缺省运行工具名）；设置页「AI 与执行工具」写的是「Runtime」和「执行工具」（`apps/workbench/src/settings-renderer.ts:73-74`）。按 2.3 的判法逐条分，绝大多数是产品、导入来源或运行环境，只有几条在说工作者本身。
- 范围：按字面搜过源码里带中文的「Agent」（不含测试、规格、文档和词典文件），指外部 AI 工具或其中工作者的都在下面两张表里。指内置 Agent、插件自己的 Agent（Coding、插件创作台的「代码 Agent」、Schedule 的项目 Agent）和 Agent 这个概念的，不在此列。下面是请你批准的完整字面清单，只换名词，不动别的字。
- 词典：Characters 的这些字符串在词典里没有对应条目（按字面搜过各 `*en.ts`），只改源码。Shelf 的有：`plugins/native/shelf/src/en.ts` 里对应的键和英文值（如「未发现终端 Agent。」译作 No terminal agent found.）按 2.7 第 1 点同批改。

A　指产品、导入来源或运行环境的（按 2.3 是 Runtime；已知是哪个产品时写产品名，`plugins/native/characters/src/import-client.ts:99` 已经写「本地 Claude Code」这样的名字，那一条不改）

| 位置 | 现在 | 建议 |
| --- | --- | --- |
| `plugins/native/characters/src/import-ui.ts:3` | 把 Codex、Claude Code 等 Agent 已有的规则、Skills 和附件带进来 | 把 Codex、Claude Code 等已有的规则、Skills 和附件带进来 |
| `import-ui.ts:5` | 下拉框标签「Agent」，选项是 Codex、Claude Code、Cursor 等 | 标签改「Runtime」 |
| `import-ui.ts:7` | 列表的朗读标签「发现的本地 Agent」 | 「发现的本地 Runtime」 |
| `plugins/native/characters/src/import-client.ts:52` | 指定配置目录时，请先选择 Agent。 | 指定配置目录时，请先选择 Runtime。 |
| `import-client.ts:56` | 可以指定 Agent 配置目录后重试 | 可以指定 Runtime 配置目录后重试 |
| `plugins/native/characters/src/ui.ts:66` | 从 Codex、Claude Code 等本机 Agent 导入已有的规则与 Skills | 从 Codex、Claude Code 等导入已有的规则与 Skills |
| `import-ui.ts:16` | 小节标题「本地 Agent」（来源未知时的缺省；与 `import-ui.ts:15` 的「Molis 内置引擎」并列，两节是一对环境） | 「本地 Runtime」 |
| `import-ui.ts:16` | 按钮「启动原生 Agent」 | 「启动本地 Runtime」 |
| `import-ui.ts:21` | 再选在 Coding（内置引擎）或本机原生 Agent 里执行 | 再选在 Coding（内置引擎）或本机 Runtime 里执行 |
| `apps/local-host/src/characters-host.ts:33` | 预览已过期，请重新扫描本地 Agent | 预览已过期，请重新扫描本地 Runtime |
| `apps/local-host/src/character-native-execution.ts:67` | 此角色没有本地 Agent 来源 | 此角色没有本地 Runtime 来源 |
| `character-native-execution.ts:81` | 未发现对应 Agent CLI，请安装后重新检查；不会替换为其他引擎 | 未发现对应 Runtime 的命令行，请安装后重新检查；不会替换为其他引擎 |
| `plugins/native/characters/src/plugin.ts:47` | 本地 Agent 导入服务尚未接通 | 本地 Runtime 导入服务尚未接通 |
| `apps/local-host/src/character-import-discovery.ts:75,82`、`packages/contracts/src/modules/character-import.ts:42` | 不支持的 Agent 来源 | 不支持的 Runtime 来源 |
| `character-import-discovery.ts:83` | 手动目录必须指定对应 Agent | 手动目录必须指定对应 Runtime |
| `apps/local-host/src/character-import-plugins.ts:91` | 此 Agent 的插件启用索引尚未支持…… | 此 Runtime 的插件启用索引尚未支持…… |
| `horizontal/agent-host/src/character-import.ts:16,20` | 请使用本地 Agent（两条报错） | 请使用本地 Runtime |
| `plugins/native/coding/src/characters-client.ts:36` | 技能名后的「· 需要原生 Agent」 | 「· 需要本地 Runtime」 |
| `apps/workbench/src/character-terminal-client.ts:71` | 正在连接原生 Agent… | 正在连接本地 Runtime… |
| `plugins/native/characters/src/actions.ts:43,44,48,53,57` | 五个动作的标题与说明里的「用本机 Agent 运行」「查找可导入的 Agent」「本机 Agent 配置目录」「本机 Agent 设定」「启动本机 Agent 执行任务」（能力库和 Agent 看得到） | 同样只把「Agent」换成「Runtime」 |
| `modules/shelf/src/runtimes.ts:182,186` | 未发现 Agent；未发现终端 Agent。 | 未发现 Runtime；未发现终端 Runtime。 |
| `modules/shelf/src/runtimes.ts:195`、`plugins/native/shelf/src/client.ts:82,1452` | 还没有选定运行工具时的缺省名「Agent」 | 「Runtime」 |
| `plugins/native/shelf/src/client.ts:231,1450,1457,1682` | 没有 Agent 也可以先提取 PDF 里的字；未发现终端 Agent。（及其后接「文件已留在架子上。」的两处） | 同样把「Agent」换成「Runtime」 |
| `plugins/native/shelf/src/settings-ui.ts:209,213,224` | 本机文字提取不调用 Agent；不需要 Agent、授权或联网；未发现终端 Agent。暂存、预览、拖出和本机文字提取仍然可用。 | 同样把「Agent」换成「Runtime」 |
| `plugins/native/shelf/src/terminal-client.ts:169` | 未发现终端 Agent。装一个再来对话。 | 未发现终端 Runtime。装一个再来对话。 |

B　说工作者本身的（做事、用自己的权限、请求授权和提问；按 2.3 写「外部 Agent」）

| 位置 | 现在 | 建议 |
| --- | --- | --- |
| `apps/local-host/src/character-native-execution.ts:10` | 原生 Agent 使用自己的登录、模型和权限，仍会读取本机实时规则、插件与 MCP。…… | 外部 Agent 使用自己的登录…… |
| `plugins/native/characters/src/ui.ts:88` | 外部原生 Agent 使用自己的工具与权限 | 外部 Agent 使用自己的工具与权限 |
| `apps/workbench/src/character-terminal-client.ts:42` | 原生 Agent · 授权、提问和操作状态显示在终端中 | 外部 Agent · 授权、提问和操作状态显示在终端中 |
| `modules/shelf/src/runtimes.ts:176` | Workspace Sandbox：Agent 只能写任务工作区 | Workspace Sandbox：外部 Agent 只能写任务工作区 |

不在两张表里的几处：

- 已经一致、不改：`apps/workbench/src/settings-assistant.ts:8` 的「不影响 Coding、外部 Agent 或你自己在页面里操作」（说使用动作的工作者，是 B 组的写法）；`apps/workbench/src/settings-renderer.ts:73-74` 的「AI 与执行工具」「没有可探测的 Runtime」（A 组的写法）；「Molis 内置引擎」（`plugins/native/characters/src/import-ui.ts:15`、`plugins/native/characters/src/ui.ts:88`）是内置 Runtime 的叫法，不是把产品叫成 Agent。
- 提示词正文：`plugins/native/shelf/src/prompts.ts:58` 的「不要调用终端 Agent」是登记的提示词（`SHELF_INSTRUCTIONS`，`version: 1`）的一部分，不是界面文案；改它要升提示词版本，所以不随这一批改，另议。
- 词典里没有使用处的键：`plugins/native/shelf/src/en.ts:132,137,200,283` 的四个含「Agent」「本机 Agent」的键，源码里没有对应的使用处（按字面搜过），翻译换成稳定键时作为无用键处理（2.7 第 5 点）。

- 建议：批准上面两张表。A 组换成 Runtime，B 组写「外部 Agent」，这样不会把产品叫成工作者，「Agent」在界面里也只剩工作者一个意思。设置页标题「AI 与执行工具」不变（它是工具清单，不是概念名）。「角色」保留为设置页的统称，两个小节标题已经分开；Coding 里的「左侧 Characters」改成「设置 › 角色」（Characters 是设置的一节，不在左侧）。
- 备选：A 组的泛称改用「执行工具」（设置页标题已用它指外部 Runtime，见 2.5），不用「Runtime」；A 组也写「外部 Agent」（不推荐：就是 §1 列为易混的写法，用户会把产品当成工作者）；把「我的角色」改叫「Character」；保持现状。
- 关联：Characters 已定为设置的一节（2.3），上面涉及 `plugins/native/characters` 的文案随它并入宿主时一起搬，不单独改。

**U7　插件显示名中英混用，连接说明里又写英文 id**

- 现状：见 3.3。连接设置的文案用英文 id 称呼插件：「Images」（`apps/local-host/src/connector-directory.ts`、`apps/workbench/src/settings-connector-guide.ts`），「Experiments」（同上，另有 `apps/local-host/src/host-connector-methods.ts`），而插件切换器里它们叫「图片」「实验」。`text-stats` 的两个标题大小写不同。`manifest.name` 也会进界面（3.1），目前只有 Characters 的名称与显示名不一致，它并入宿主后这条路径就没有不一致了。
- 建议：连接说明里的插件名一律取界面显示名（「图片」「实验」「判断规则」）。显示名的中英混用本身不改，等用户另行决定统一语言。`Text Stats` 与 `Text stats` 统一为 `Text stats`。
- 备选：统一所有显示名的语言（范围大，需另起一项）；保持现状。

## 5. 代码改名后续清单

按类别分。规模是 2026-10-08 在 main `bf99c8cb` 上数的，只用来估大小，落地前要重数：「源码」指已追踪的 `.ts`、`.mts`、`.mjs` 文件，不含任何 `tests/` 目录、`*.test.*`、`.impeccable/` 和 `vendor/`；「测试」指 `tests/` 目录和 `*.test.*`；名字按单词边界数（`@molis-ai/molis-work-plugin-work` 要避开 `-workflows`）。新名字是建议，落地时可调整；落地归路线表里的 W5-14（`specs/repository-anti-corruption/roadmap-2026-10-07.md`）。

### R-A　只改标识符（不动持久化数据，不动合同 id；编译和现有测试可以校验）

| # | 旧标识符 | 建议新名 | 规模 | 说明 |
| --- | --- | --- | --- | --- |
| R-A1 | `GoalsBoardRecord`、`getBoard`、`requireBoard`、`validateManagedBoard`、`readManagedBoard`、`initializeBoard`（含 `InitializeBoardInput`、`InitializeBoardOutput`、`initializeBoardCapability`）、`BoardSnapshot*`（含 `boardSnapshotSchema`、`snapshotBoardCapability`）、`MolisWorkCommands`（在 `board-commands.ts`）、`GOAL_BOARDS_SCHEMA_SQL` | 去掉 Board：目标资料库（Goals 根记录）写 `GoalsLibrary*`（如 `GoalsLibraryRecord`、`getGoalsLibrary`、`requireGoalsLibrary`、`initializeGoalsLibrary`）；`BoardSnapshot*` 去掉 Board 前缀，具体名落地时定（`GoalsQuerySnapshot` 已存在，避开）；`MolisWorkCommands` 改 `GoalsLibraryCommands` | 源码：`GoalsBoardRecord` 4 个文件、`getBoard` 10、`requireBoard` 10、`validateManagedBoard`/`readManagedBoard` 4、`initializeBoard` 系 14、`BoardSnapshot` 13；测试：`initializeBoard` 系 58 | 表名 `boards` 保留（2026-10-06 决定）。`initializeBoard` 在测试里是初始化项目的目标资料库的公用写法，改名要连测试一起 |
| R-A2 | 文件 `modules/goals/src/board-commands.ts`、`plugins/native/goals/src/board-actions.ts`、`board-entry-capabilities.ts`、`board-snapshot-query.ts`；`tests/goals-board-actions.test.ts` | 去掉 `board-` 前缀 | 5 个文件 | 引用这些路径的 README 和 `docs/` 同步 |
| R-A3 | 判断规则的 TypeScript 类型：`FunctionRecord`、`FunctionDraftPatch`、`FunctionSummary`、`FunctionDescribe`、`FunctionSample`、`FunctionCriteria`、`FunctionInvokeResult`、`FunctionsPrimitive`、`FunctionStatus`、`FunctionAuthoring*` | `JudgmentRule*` | 源码 9 个文件、测试 3 个 | 只改类型名；`function_key`、表和动作 id 见 R-B2 |
| R-A4 | 包 `@molis-ai/molis-work-module-functions`、目录 `modules/functions`、`apps/workbench/src/functions/`、`apps/local-host/src/functions-*.ts` | `judgment-rules` | 源码 15 个文件、测试 20 个文件导入这个包名 | Home 里的 `functions` 库名属合同，见 R-B2 |
| R-A5 | `FunctionAuthoringBehavior`、`behavior-catalog.ts`、`liveHostFunctionAuthoringCatalog`、常量 `*_BEHAVIOR_ID`（如 `HOME_TALK_BEHAVIOR_ID`） | `…Option`、`recommendation-catalog.ts`、`*_OPTION_ID` | 源码 5 个文件（`FunctionAuthoringBehavior`、`behavior-catalog`）；`behavior_id` 字样（含 `suggested_behavior_ids`）源码 31 个文件、测试 23 个，`*_BEHAVIOR_ID` 常量源码 5 个文件、测试 3 个 | 常量的值（`inbox.admit` 等）不变；编辑器目录是宿主与编辑器之间的形状，未持久化，可一起改 |
| R-A6 | `AgentMethodView`、`AgentMethodRegistration`、`METHOD_TOOLS`、`inspectMethodDeclarations`、`method_owner`、`codingMethods`/`pagesMethods`/`todoMethods` 及其所在文件（`plugins/native/coding/src/methods.ts`、`plugins/native/pages/src/methods.ts`、`plugins/native/todo/src/roles.ts`） | `AgentSkill*`、`SKILL_TOOLS`、`inspectSkillDeclarations`、`skill_owner`、`*Skills`、`skills.ts` | 前五项源码 7 个文件，`codingMethods`/`pagesMethods`/`todoMethods` 11 个文件 | 只含类型、函数和文件名。Manifest 的 `methods` 键、`assistant.methods.*`、字段 `method_id` 和助理物料种类值 `"method"` 都是合同或已存数据，见 R-B5 |
| R-A7 | 目录 `plugins/native/work`、包 `@molis-ai/molis-work-plugin-work` | 目录改叫 `sessions`，包改 `@molis-ai/molis-work-plugin-sessions` | 源码 21 个文件、测试 16 个文件导入（不含 `package.json`） | 同步 `scripts/workspace-packages.mjs`、SSOT、各 README |
| R-A8 | 翻译表里找不到字面使用处、又含旧术语的键 | 删除 | 11 条：`apps/workbench/src/i18n/en.ts` 5 条（键里的字样有「Functions 行为总表」「Functions 出站动作」「判断函数 key」「Board 级事项」，前一个出现在一整句的键里）、`i18n/information-loop-en.ts` 3 条、`apps/workbench/src/functions/en.ts` 1 条、`plugins/native/feed/src/en.ts` 2 条 | 只按字面搜过。翻译换成稳定键（2.7，W5-03）后这些条目不带进新词典，所以不单独做；W1-08 的翻译检查落地后以它报告的无用键为准 |
| R-A9 | 6 个插件共 19 个 UI 描述的 `plugin_id: "io.molis.work.native.<x>"`（Goals 12、Feed、Inbox、Schedule、成果 2、会话 2，位置见 3.3 表后第 2 条） | 与各自 Manifest 的 `plugin_id` 相同：`io.molis.work.<x>`，会话是 `io.molis.work.sessions` | 源码 19 个文件；测试：`tests/builtin-plugin-composition.test.ts:47-48` 断言了 Goals 提案与会话终端的旧值 | 描述没找到持久化的位置（见 3.3）。改后可以让构建期装配也过 Plugin Runtime 同样的一致性检查。该测试的注释写着「旧公开身份保持稳定」，改前先确认它钉的是 `plugin_id` 还是只是 `contribution_id`，再按预期变化改断言 |
| R-A10 | 工作台右栏的 dock 窗口 id `im`：`dock-window-im`、`data-dock-window="im"`、`data-dock-toggle="im"`、`navigation-presentation.ts:60` 里的 `id==='im'` | `side`（讨论页签的内嵌框 `data-dock-frame="im"` 可改 `discussion`） | 源码 3 个文件（`apps/workbench/src/side-panel.ts`、`apps/workbench/src/immersive-shell.ts`、`apps/workbench/src/scripts/client/navigation-presentation.ts`），测试 2 个（`tests/desktop-tui.test.ts`、`tests/lingguang-plugin.test.ts`） | 这个 id 指整个右栏，不是讨论页签（2.6）。落地前先确认它没有写进本地存储的键 |
| R-A11 | 注释与局部变量里把项目叫 board/Board 的，以及把 Agent role 叫 Characters 的 | 项目；Agent role | 无法按名计数，改 R-A1 时顺带 | 例：`modules/functions/src/store.ts` 的局部变量 `board`；`plugins/native/goals/src/document-collection.ts` 与 `goal-tree-materialization-order.ts` 里未用的 `_boardId` 参数；`packages/contracts/src/modules/goals.ts` 的注释；`plugins/native/characters/src/client.ts` 的注释把系统与插件的角色叫 Characters |

### R-B　持久化或合同里的标识符（改名等于改数据或合同）

按 `AGENTS.md`：存量数据由维护改成现行形状，读取时不兜底历史取值。所以这一类每一项都要用户先确认合同变化，再由维护脚本改存量；不确认就保持原名，并在 R-C 记录。

| # | 标识符 | 建议 | 规模 | 为什么要先问 |
| --- | --- | --- | --- | --- |
| R-B1 | 字段 `capability_id`（动作与宿主能力的身份字段） | 保留原名，记「`capability_id` 就是动作的 id」 | 源码 202 个文件、1,169 处 | 写在工作流步骤、MCP 授权、判断规则、场景绑定、Character 的动作范围里；改名收益很小，数据和外部授权都要动 |
| R-B2 | 判断规则：动作 id `functions.list`、`functions.describe`、`functions.invoke`、`functions.published.<function_key>`；权限串 `functions:invoke`、`functions:manage`；`FUNCTIONS_PLUGIN_ID`（`io.molis.work.functions`）；字段 `function_key`；库表 `function_judgments` 等；Home 里的 `functions` 库名（`openBaselineHomeSqlite(home, "functions", …)`） | 改成 `judgments.*` / `judgment_rule`，或保留 | `functions.*` 动作 id 源码 9 个文件，权限串 10，`function_key` 28 | 动作 id 派生 MCP 工具名，改名会使已有客户端授权失效；权限串写在安装授权里；库名要走维护 |
| R-B3 | Board 系：事件类型与错误码 `board.created`、`board.active_goal_changed`、`board.not_found`、`board.exists`；能力 id `io.molis.work.local-host.board.initialize`、`io.molis.work.local-host.board.snapshot`；动作 id `goals.board.initialize`；Casebook 日志的 `board` 名（`apps/local-host/src/casebook/` 下 9 个文件；`journal.ts` 里 5 张表有 `board` 列） | 动作 `goals.library.initialize`，事件与错误码 `goals_library.*`（如 `goals_library.not_found`）；Casebook 的 `board` 列存的是 `project_id`，改 `project` | 事件与错误码 7 个源码文件，Casebook 9 个文件 | 事件与动作 id 对外可见；Casebook 的列在项目库里，要走维护；`board.not_found` 还列在 Casebook 的原因码表里（`apps/local-host/src/casebook/reason-codes.ts`），那是外部 Casebook 插件对接的合同，改动先看 `docs/Casebook交互事实接口-接入与边界.md` |
| R-B4 | 推荐选项：结果类型 `molis.behavior-recommendation.v1`、字段 `suggested_behavior_ids`、判断规则草稿里的 `scene_map`（值是场景内的符号）、库列 `suggested_json` 里的内容 | `molis.recommendation.v1`、`suggested_option_ids` | 结果类型 6 个源码文件，`suggested_behavior_ids` 30，`scene_map` 9 | 已存的判断记录与草稿里有旧值；结果合同写入严格，读取不兜底，所以要先改存量 |
| R-B5 | Skill：Manifest 的 `methods` 键；动作 id `assistant.methods.*`（现有 `assistant.methods.read`）；助理里 Skill 的 id 字段 `method_id`（`assistant.methods.read` 的输入和输出字段，`apps/local-host/src/assistant/assistant-rule-actions.ts:61-65,86-87`；物料里的 `method.method_id`）；助理物料种类值 `"method"`（`packages/contracts/src/services/assistant.ts:199`），它存在轮次记录的 `materials` 里（`apps/local-host/src/assistant/assistant-store.ts:107`） | `skills` / `assistant.skills.*` / `skill_id` / `"skill"` | `assistant.methods` 2 个源码文件；`method_id` 在助理一侧 5 个源码文件（`apps/local-host/src/assistant/assistant-rule-actions.ts`、`apps/local-host/src/assistant/assistant-service.ts`、`apps/workbench/src/scripts/client/assistant-island.ts`、`apps/workbench/src/settings-agent-diagnostics.ts`、`packages/contracts/src/services/assistant.ts`） | Manifest 是插件 SDK 的公开合同（`packages/contracts/src/platform/plugin.ts`）；动作 id 派生 MCP 工具名；`method_id` 是动作的输入输出字段；物料种类值存在已存的轮次里，改名要走维护。Goals 的 `method_id` 指规划方法，不在此列（R-C）。**排序**：W4-02 让 Manifest 的 `methods` 对 Runtime 和已安装插件生效（2026-10-08 用户决定，`specs/repository-anti-corruption/spec.md` §1「Runtime 与安装插件声明的 methods」），改键名与它碰同一个 Manifest 合同，应和 W4-02 一起问、或排在它之后，让合同只变一次 |
| R-B6 | Agent 动作工具名 `find-capabilities`、`read-capability`、`change-capability` | `find-actions`、`read-action`、`change-action`（`suggest-action`、`change-reversible` 已一致） | 源码 6 个文件 46 处，测试 10 个文件 | 助理提示词引用这些名字（`apps/local-host/src/assistant/assistant-agent.ts`），提示词可由用户改写（`user_revision`），改名要升提示词版本并核对用户改写的版本 |
| R-B7 | 工作流程衔接类型 `function`（模板转换） | `template` | `plugins/native/workflows/src` 的 `actions.ts`、`client.ts`、`model.ts` | 已保存的流程和实例里存着这个值 |
| R-B8 | 工作流程的 `plugin_id` `io.molis.work.native.workflows` | `io.molis.work.workflows` | 字面量在 4 个源码文件（`apps/local-host/src/workflows-actions.ts:26`、`plugins/native/workflows/src/` 的 `client.ts:180`、`model.ts:7`、`prompts.ts:5`），常量 `WORKFLOWS_PLUGIN_ID` 另有 3 个文件引用 | `plugin_id` 是安装记录、事件订阅、发行物留存和提示词覆盖（`owner_id`）的键，改名要改这些存量 |
| R-B9 | Feed 出站规则生成的成果版本里的生产者 `FEED_ARTIFACT_PRODUCER`：`plugin_id` `io.molis.work.native.feed`、`binding_signature` `native:feed`（`plugins/native/feed/src/out-rules.ts:16-17,221`） | `plugin_id` 改 `io.molis.work.feed`（Feed 的 Manifest id，`plugins/native/feed/src/identity.ts:1`），签名取 Feed Manifest 的发布者签名 | 源码 1 个文件定义，存量是成果表 `producer_plugin_id`、`producer_binding_signature` 两列里 Feed 写过的行 | 已存的成果版本带旧值，读取不兜底，要先由维护改存量；改后宿主按声明检查写入时才查得到 Feed（`apps/local-host/src/declared-types.ts:11-17`，现在查不到就放行），所以改前要先确认 Feed 的 `artifacts.produces` 与实际写入一致 |

### R-C　不改名（记入术语表即可）

- SQL 表 `boards`：2026-10-06 的决定。
- Agent 的任务板、步骤板（`step_board`、`SdkBoard`、`prologue-taskboard`）：Prologue SDK 的概念，不指项目。
- 设计系统的「组件板」、Goals 的「看板」视图及其 CSS：不指项目。
- `agent.skills.*` 宿主能力 id、`skill_id`、`AgentSkill*` 类型：与本表的 Skill 一致，不用改。
- 类型名 `HostCapabilityDefinition`、`CapabilityRegistry`：本表把 capability 定义为注册表条目，这两个名字与定义一致。
- Goals 里规划方法的 `method_id`（`modules/goals`、`plugins/native/goals`、`apps/local-host/src/web-planning.ts` 以及 Goals 的库表与事件）：它指规划方法，写在 Goals 的库和事件里，建议不改；读到 `method_id` 时看所在包：助理一侧是 Skill（R-B5），Goals 一侧是规划方法。
- 构建期 UI 描述和内置插件的 `contribution_id` 里的 `.native.` 段（3.3 第 4 条）：贡献 id 的命名空间，不是插件 id。
- R-B 里用户不确认改名的项，在这里补一行。

## 6. 文档里还没统一的地方

本表只定名字，没有改其他文档。下面是仍用到或提到旧称的现行文档（按字面搜过，个别是在说明旧称已删），由文档对齐的后续切片处理。`skills/` 在全量回归期间不改（`AGENTS.md`），所以 Skill 里的改动排在回归之后。

| 旧称 | 现行文档里的位置 |
| --- | --- |
| 判断场景 | `docs/platform/PLUGIN-DEVELOPMENT.md`、`plugins/native/inbox/README.md`、`tooling/plugin-cli/README.md`、`.cursor/rules/plugin-dev-skill.mdc`、`skills/molis-plugin-dev/{SKILL,elements,examples,host}.md`、`specs/action-architecture/spec.md` |
| 判断函数 | `docs/SSOT-MATRIX.md`、`docs/platform/PROLOGUE-AI.md`、`modules/functions/README.md`、`skills/molis-plugin-dev/SKILL.md`、`specs/BACKLOG.md`、`specs/action-architecture/spec.md` |
| 共同目录、能力目录、能力板、能力库 | `AGENTS.md`、`PRODUCT.md`、`docs/SSOT-MATRIX.md`、`docs/modules/actions.md`、`docs/modules/shelf.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`docs/platform/PROLOGUE-AI.md`、`packages/plugin-sdk/README.md`、`apps/workbench/src/functions/README.md`、`plugins/native/{alchemist,coding,feed,inbox}/README.md`、`skills/` 下 6 个文件 |
| 函数调用 | `docs/platform/PROLOGUE-AI.md`、`specs/action-architecture/spec.md` |
| Functions 插件 | `modules/functions/README.md`、`plugins/native/inbox/README.md`、`apps/workbench/src/functions/README.md` |
| 方法（指 Skill） | `docs/horizontal/agent-host.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`plugins/native/coding/README.md`、`specs/coding-plugin/spec.md` |
| 行为（指推荐选项） | `docs/platform/PLUGIN-DEVELOPMENT.md`、`packages/plugin-sdk/README.md`、`plugins/official-integrations/catalog/README.md`、`skills/molis-plugin-dev/{elements,host,integrations}.md`、`specs/action-architecture/spec.md` |
| Board（指项目） | `docs/mcp.md`、`docs/mcp.en.md`、`plugins/native/goals/README.md` |
| Characters 当作插件写（2.3 的决定落地后不再成立；落地前这些文档与代码一致，不先改） | `plugins/native/characters/README.md`、`docs/platform/PLUGIN-PLATFORM.md`、`docs/platform/UI-PLATFORM.md`、`skills/molis-plugin-dev/{SKILL,elements,host,search}.md`、`tests/builtin-plugin-assembly-gate.test.ts` 的冻结名单 |

按日期的迁移记录和归档 spec（`specs/action-architecture/migration.md`、`specs/archive/`、`specs/molis-work-architecture-reorganization/`）保持当时的写法，不回改。

## 7. 防止旧术语回流

路线里只有一道窄的门禁：W1-04 的旧名计数（`pnpm health:check` 的 `oldNames`，口径在 `scripts/gates/source-counts.mjs` 开头和 `tooling/gates/README.md`）按文件数 TypeScript 源码里的 `goalboard` 和 `board_id` 两种写法，只许减少；它不数本文「旧称」一栏里的词和第 5 节的其余改名（`GOAL_BOARDS_SCHEMA_SQL` 等「Board 当项目」的名字，见 R-A1），不数 `docs/`、`skills/` 里的词，也不数连字符写法 `board-id`。完整的回流门禁仍缺（§4.15：「没有防止旧术语回流的门禁」）。建议在 W5-14 的改名完成后扩一道只许减少的计数门禁：数第 1 节「旧称」一栏在 `docs/`、`skills/` 和源码标识符里的出现次数，做法同 `pnpm health:check` 对兼容标记的计数（对照合并基点，PR 里改基线放不过）。在这之前，靠第 0 节的规则和评审。
