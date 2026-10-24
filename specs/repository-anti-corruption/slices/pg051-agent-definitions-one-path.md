# PG-051：Agent 定义只留一条登记路（设计稿）

状态：已实现、在评审：P1 已合（#1124），P2a（#1138）与 P2b 在评审（2026-10-23，防腐线 ac-kernel 片，R8 的一部分）；统筹 10-23 定了第 6 节两项（Q1 选 b、Q2 照推荐），按第 5 节分片写代码。代码按 main `acc71ae47` 核过。

## 1. 现状：两条路

Home 有一份 Agent 定义的登记表（`apps/local-host/src/agent-definitions/agent-definitions.ts` 的 `AgentDefinitions`，每个 Home 一份，「Prompt 与 Character」设置读它，Agent 宿主按它取本人改过的 Prompt）。往里登记有两条路：

| | 目录那条 | 运行中的定义那条 |
| --- | --- | --- |
| 入口 | `builtinRegistrations()`（`agent-definitions/builtin-agents.ts`），登记表第一次打开时登记一次 | `registerPluginAgentDefinitions`（`apps/local-host/src/plugin-instructions.ts`），项目插件在 `plugin-host-services.ts`、Home 插件在 `home-plugin-executor.ts` 启动时调，停下时撤回 |
| 读哪里 | 构建期目录 `BUILTIN_PLUGIN_CATALOG`：每个内置包 `registration` 上的 `agent.prompts`、`instructions`、`methods`，加 Manifest 的 `agent`（角色）与 `methods`（声明） | `PluginDefinition` 的 `instructions`、`methods` |
| 登记什么 | 角色（含子任务角色）、Agent Prompt、指令、方法 | 只有指令和方法；`roles: []`，`agent_prompts` 不看 |
| 什么时候在 | Host 一启动就在，不管装没装、启没启用 | 只在这次安装运行时 |
| 谁走 | 全部内置插件（下表） | 目录里没有登记任何东西的插件（装上的、创作台生成的、第三方的） |

目录现在为这些插件登记（构建产物实测）：

| 插件 | 角色 | Agent Prompt | 指令 | 方法 | 级别 |
| --- | --- | --- | --- | --- | --- |
| Coding | 7 + 子任务 3 | 11 | 2 | — | 项目 |
| Schedule | 1 | 2 | — | — | 项目 |
| Todo | 1 | 1 | 2 | 2 | Home |
| Issues | — | — | 1 | 1 | Home |
| Pages | — | — | 2 | 1 | 项目 |
| Shelf | — | — | 21 | — | Home |
| Alchemist | — | — | 6 | — | 项目 |
| Cognia、Jelly | — | — | 2、1 | — | Home |
| 创作台、Lingguang、Form、Dataset、PPT、Workflows | — | — | 2、1、1、1、1、1 | — | 项目 |

另有不是插件的：个人助理（`ASSISTANT_AGENT`）、宿主自己的模块指令（`system:onboarding` 等，`builtin-instructions.ts` 的 `SYSTEM_INSTRUCTION_SOURCES`）、创作台的设计师与代码 Agent（`BUILTIN_INLINE_AGENT_PROMPTS`、`BUILTIN_INLINE_AGENT_ROLES`）。

真正跑一轮时，Agent 宿主用的是这次激活自己带的声明（`agent-host-composition.ts` 的 `startAuthority`：`caller.declaration` 的 `manifest.agent`、`agent_prompts`、`agent_skills`）；没有调用者时才回落到目录（`BUILTIN_PLUGIN_AGENTS.get(pluginId)`）。

## 2. 问题

1. **V-05**：不在目录里的插件即使 Manifest 写了 `agent` 块，登记表里也没有它的角色和 Agent Prompt。设置里看不到、改不了；`effective()` 对没登记的 Prompt「照原样跑」，所以本人改过也不生效。目录里的插件两样都有——同一份 Manifest，待遇不同（10-18 同等待遇）。
2. **内置插件不装也登记**：目录那条在 Host 启动时为全部内置插件登记，项目里没装、停用的也在设置里，方法也给别的 Agent 看。装上的插件只在运行时才有。
3. **互斥规则只护着目录**：`registerPluginAgentDefinitions` 遇到「目录为同一个主人登记过任何东西」就拒绝启动——这条只因为有两条路才需要。
4. **同一件东西两处写**：内置包把 Agent Prompt 写在 `registration.agent.prompts`（给目录），又写在 `PluginDefinition.agent_prompts`（给真正跑的）——Coding、Schedule 两处都写；Todo 只写了目录那份，它的定义不带 `agent_prompts`。指令、方法同样有 `registration.instructions`/`methods` 和 `PluginDefinition.instructions`/`methods` 两个字段。

## 3. 设计：只留「运行中的定义」那条

1. **一个载体**：插件的 Agent 定义只写在 `PluginDefinition` 上——Manifest `agent`（角色、子任务角色、Prompt 声明）与 `methods`（声明），定义的 `agent_prompts`、`agent_skills`、`instructions`、`methods`（正文）。`PluginRegistration` 去掉 `instructions`、`agent`、`methods` 三个字段；内置包把它们搬到自己的 `createXPlugin()`（Coding、Schedule 删掉重复的一份，Todo 补上 `agent_prompts`）。
2. **一个登记口**：`registerPluginAgentDefinitions` 登记定义带的全部东西，形状与今天目录登记的一样：角色与 Agent Prompt 用现有的 `agentRegistration(owner, source, manifest.agent, agent_prompts)`，再并入指令（`withInstructions`）和方法（`declaredMethods`）。按安装记引用、最后一个实例撤回、多安装并列显示，沿用现有的 `holders` 与 `AgentDefinitions` 的 scope。
3. **删掉目录那条**：`builtinAgents()` 里插件的那一圈、`builtinRegistrations()` 里目录的指令与方法、`BUILTIN_INSTRUCTIONS` 里目录的那部分、workbench 导出的 `BUILTIN_PLUGIN_AGENTS`、`startAuthority` 的目录回落（没有调用者的直接调用改成拒绝，或由调用方给出声明），以及第 2 节第 3 条的互斥规则。
4. **不是插件的照旧**：个人助理、`system:*` 的模块指令是平台自己的，留在启动时登记。创作台的设计师与代码 Agent 见第 6 节 Q2。
5. **沙箱插件**：今天两条路都不给沙箱插件登记（`definition.execution === "sandbox"`）。本稿不改，归 PG-017 / V-20 一起定。
6. **跑的时候不变**：`startAuthority` 本来就用激活自己的声明，本稿只让登记表和它一致。本人改过的 Prompt 按「主人 + Prompt id」存在 Home 的登记库里，撤回登记不删它，下次登记回来照样生效。

## 4. 行为变化与风险

- **设置里什么时候看得到**（第 6 节 Q1）：只在运行时登记的话，项目级插件（Coding、Schedule、Pages…）要等某个项目打开、插件启动后才出现在 Home 级的「Prompt 与 Character」里；今天 Host 一启动就在。
- **方法**：Todo、Issues、Pages 的方法只在它们运行时给别的 Agent 用——和装上的插件今天一样。Todo、Issues 是 Home 级、Host 启动就运行，实际不变；Pages 是项目级。
- 测试要改的：`tests/agent-definitions.test.ts`（补 V-05）、`tests/prompt-registration.test.ts`（指令清单改从各包的定义读）、`tests/builtin-plugin-agent-texts.test.ts`、`tests/plugin-methods-runtime.test.ts`。
- 门禁：`PluginRegistration` 是合同（`pnpm api:update`）；`apps/workbench/src/builtin-plugins.ts` 是生成的，生成器不碰这三个字段，不用改。不新增兼容标记。

## 5. 分片（定了 Q1、Q2 之后）

**10-23 调整**：项目级内置插件的定义只在 `apps/local-host/src/project-plugins.ts` 的监督器里造，目录读不到；Q1 选 (b) 之后，Host 启动时由登记库按「未运行」恢复，目录那条可以直接删。所以实际分片是：

- **P1（#1124）**：运行中的定义登记完整——Agent 块的角色与 Agent Prompt（修 V-05）；目录已为同一主人登记的、只带 Agent 块的插件照旧交给目录；Todo 的定义补上 `agent_prompts`。
- **P2a**：登记库持久化（Q1 b，RAC-193、RAC-196）：新 Home 库 `agent-declarations` 记住每个安装最近一次登记的声明，最后一个实例停下时改成「未运行」、Host 打开登记册时恢复、卸载时（`PluginExecutor.uninstalled`）删；未运行的主人不给方法。
- **P2b**：三个字段从 `PluginRegistration` 搬到 `PluginDefinition`、删目录那条、`BUILTIN_PLUGIN_AGENTS`、`startAuthority` 回落与互斥规则；创作台按 Q2 改成平台自己的来源。

**`startAuthority` 回落的调用方**（RAC-195 之前先列，按 main `acc71ae47` 查）：没有插件调用者时 `ports.authority` 走目录回落。生产代码里只有 Characters 的宿主提供方 `apps/local-host/src/characters-host.ts` 的 `listActions(["prologue", CHARACTER_PLUGIN_ID])`；Characters 没有 Agent 块，回落本来就是空声明。Coding 的调用都带宿主签发的调用者，助理用自己的 `authority`（`assistant/assistant-http.ts`），工作流、定时、MCP 走动作、不经这个口。所以 P2 去掉回落时，没有调用者的调用得到空声明，不报错：列动作照常，用插件角色起跑因为没有角色被拒——这才是真正没有主人的调用。

原稿的分片（留作对照）：

1. **P1 合同与包**：`PluginRegistration` 去掉三个字段；内置包搬到 `PluginDefinition`；`prompt-registration` 测试改读定义。目录那条暂时从定义读，行为不变。
2. **P2 一条路**：`registerPluginAgentDefinitions` 登记角色与 Agent Prompt（修 V-05）；删目录那条、`BUILTIN_PLUGIN_AGENTS`、`startAuthority` 回落、互斥规则。Q1 选 (b) 时连同登记库的持久化一起做（登记库结构变了，按 `docs/system/CONTRACT-CHANGES.md` 改库结构，现在不留兼容期）。
3. 验收编号预留 RAC-191～196：
   - RAC-191 不在目录里的插件，Manifest 的角色与 Agent Prompt 登记上，本人改过的在下一轮生效（V-05）。
   - RAC-192 没装、停用的内置插件，设置里不显示为启用，方法不给别的 Agent。
   - RAC-193 同一插件两个安装并列，最后一个停下才撤回；本人改过的版本在撤回后保留、重新登记后照样生效。
   - RAC-194 一个插件登记别的主人的指令或角色，拒绝启动（原有规则，换到唯一的登记口）。
   - RAC-195 没有调用者的 `startAuthority` 不再从目录取声明：今天走这条回落的调用方（工作流程、定时、MCP 等）先全部列出、各自改成由调用方给声明；拒绝只留给真正没有主人的调用，用户动线不变成报错（统筹 10-23）。
   - RAC-196 未运行的记录（Q1）只用于设置里显示和让本人先改：它的方法不给别的 Agent，`startAuthority` 不用它；插件新版本登记时整份替换这个安装的旧记录，不并旧键（统筹 10-23）。

## 6. 统筹的决定（2026-10-23）

- **Q1 定 (b)**：登记库记住每个安装最近一次登记的声明，Host 启动时按「未运行」恢复，卸载才删。附带条件见 RAC-196；库结构按 `docs/system/CONTRACT-CHANGES.md` 改，不留兼容、不写回落。
- **Q2 定推荐**：主人 id 不变（`io.molis.work.plugin-builder`），来源改成平台自己的、启动时登记，不迁数据。
- 顺序：P1 → P2 → R8 余下批次。

当时的选项：


- **Q1 没在运行的插件，设置里显示什么？**
  - (a) 只显示正在运行的。最简单，和今天装上的插件、方法一致；代价是项目级插件的 Prompt 要等项目打开过才出现在 Home 级设置里。
  - **(b，推荐)** 登记库记住每个安装最近一次登记的声明，Host 启动时按「未运行」恢复（`AgentDefinitions.refreshOwner` 已经按 `source.state` 让启用的优先），卸载时才删。设置一直看得到、可以先改；改登记库结构（库结构变化，按 CONTRACT-CHANGES）。存进去的是插件自己声明的 Prompt 正文，和今天目录登记的同一类内容，不新增信任边界。
- **Q2 创作台的设计师与代码 Agent 归谁？** 10-18 定创作台是平台能力。
  - **(推荐)** 主人 id 不变（`io.molis.work.plugin-builder`，本人改过的 Prompt 按这个键存，不迁数据），来源改成平台自己的（和个人助理一样启动时登记）。
  - 另一种：主人改成 `system:builder`，要迁本人改过的 Prompt，需要用户确认迁移。
