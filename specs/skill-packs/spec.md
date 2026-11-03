# 技能包与个人助理 / Coding 的装配

状态：需求已整理，尚未实现（2026-10-18；2026-10-19 改为「没有 runtime、只有 Manifest 的插件」，不再设第二套安装与注册路径）。实现归会话④（需求）。目标完成程度为**内部完整**：一个只有内容、没有运行时、动作和存储的插件可以安装，个人助理与 Coding 能按同一份目录发现、选择、按精确版本使用；技能不授予权限，业务效果仍走动作授权与审查。

2026-10-19 改动记录：原稿的 `pack.json` 与宿主 `SkillPackRegistry` 是插件之外的第二条安装、信任和注册路径，违反 2026-10-18 用户定的「插件不分官方、个人、创作台生成还是第三方，待遇一样；缺什么补进平台，不给某个插件在宿主里开私路」（`AGENTS.md` 硬约束，`specs/repository-anti-corruption/spec.md` §1 的 2026-10-18 各行），也与 [plugin-platform-v2](../plugin-platform-v2/spec.md) S1「内容包是一种只有内容的声明形态」不一致。现在技能包就是一个没有 runtime 的插件：技能写在 Manifest 的方法声明里（`AgentSkillDeclaration` 加字段），走同一条插件安装、信任、启用、卸载路径。验收编号 SKP-01～SKP-12 全部保留，其中 SKP-01、SKP-02、SKP-04、SKP-08 的措辞随新设计改了；没有整条删除的编号（原稿没有一条只对旧设计成立）。

## 1. 问题

现有插件平台适合 app 型插件：Manifest、Runtime、actions、views、storage、routes。角色包、场景包、方法包（例如工程、产品、数据、设计、法务的做法）只需要 Markdown 和少量参考文件，却要背一整套运行时；第三方作者和内部内容作者都很难供给。

现状有三个具体断点：

1. **个人助理只看见“有可用动作的插件”提供的方法。** `apps/local-host/src/assistant/assistant-service.ts` 的 `methods()` 用当前范围里可用动作的提供方过滤；一个只有方法、没有动作的包不会出现在“可用的方法”里。
2. **Coding 有自己的方法路径。** `plugins/native/coding/src/roles.ts` 的 `skills` 是包内 `codingMethods`；项目里的方法经 `coding.discover-methods` → `agent.discoverSkills` → `coding.install-method` → `agent.installSkill` 安装。它和个人助理的 `methods` 是两条路径，没有共同的目录。
3. **Skill 合同太薄。** `AgentSkillDeclaration` 只有 `skill_id`、`version`、`name`、`summary`、`tools`；没有 `description`（什么时候触发）、`when_to_use`、`references/`、`scripts/`、`assets/`，也没有 `applies_to`。助理只能凭 summary 选，Coding 只能靠内置或项目目录。

## 2. 范围与非目标

**做**：

- 技能包就是**没有 runtime、只有 Manifest 的插件**。它的技能写在 Manifest 的方法声明（`methods`，类型是 `AgentSkillDeclaration`，见 `packages/contracts/src/platform/plugin-agent.ts`）里，正文和可选的 `references/`、`scripts/`、`assets/` 随插件包发布。
- 把 `AgentSkillDeclaration` 加几个可选字段：`description`（什么时候触发）、`when_to_use`、`when_not_to_use`、`applies_to`、`user_invocable`、`argument_hint`，以及资源文件的清单。现在它只有 `skill_id`、`version`、`name`、`summary`、`tools`。
- 安装、签名与信任、版本、项目启用、卸载，全部走现有的插件安装与 Plugin Runtime 路径。不设第二个注册表、安装器或信任规则；缺什么补进平台，不给技能包开私路。
- 个人助理与 Coding 的装配：助理把插件声明的技能列为 `methods`；Coding 把同一份技能按 `applies_to` 注册为可安装方法或起跑时注入 `agent.skills`；两边读同一份平台方法目录和版本。
- 渐进披露：metadata → 正文 → `references/`/`scripts/`/`assets/` 按需读取。
- 作者与评测：从一次对话生成插件（内容型）、校验、回放、评测。
- 连接器类别占位符（`~~project tracker` 等），让内容不绑定具体厂商；映射与授权见 [助理统一接入服务](../assistant-service-connections/spec.md)。占位符写在正文里，不另设宿主侧的映射表。

**不做**：

- 不新增第二套任务、记忆、Goal、Artifact 或业务事实；技能包只提供做法。
- 不授予权限：技能里写到的工具、动作、连接都仍走动作授权、`beforeEffect` 和审查队列。
- 不做自动选用的“全量技能”；自动选用仍按现有 `autoSelectable`/启用状态，用户可关闭。
- 不替代插件市场审核；目录元数据与审核见 [plugin-platform-v2](../plugin-platform-v2/spec.md)。
- 不设 `pack.json`、`SkillPackRegistry` 或任何只给技能包用的安装入口（2026-10-19 删）。

## 3. 包形状

```text
my-skill-plugin/
├── manifest.json           # 普通插件 Manifest：没有 runtime 入口，methods 里声明技能
├── skills/
│   └── <skill-id>/
│       ├── SKILL.md
│       ├── references/
│       ├── scripts/
│       └── assets/
├── agents/                 # 可选：给 Agent 的角色/子代理说明；要成为声明，先在 Manifest 里有位置
└── commands/               # 可选：用户点名的入口；同上
```

Manifest 是普通的插件 Manifest：`id`、`version`、`name`、发布者与签名、`permissions` 等字段沿用现有写法，不新增 `pack.json` 里那套重复的字段。两处需要改合同（`docs/system/CONTRACT-CHANGES.md`）：

1. Manifest 目前要求有 `entrypoints`；没有 runtime 的插件需要允许它为空，并由 Plugin Runtime 把这类插件当作「只有声明、不起进程」装配。
2. `AgentSkillDeclaration` 加上面列的可选字段，`methods` 里每条声明指向包内的 `skills/<skill-id>/SKILL.md`。

`SKILL.md` frontmatter 与 `methods` 里的声明说同一件事，Manifest 声明是目录读取的依据，frontmatter 只在作者工具里用来生成和校验声明：

```yaml
name: write-weekly-review
version: 1
description: 写周度复盘；当用户要周报、周度回顾或跨插件总结时使用。
when_to_use: 一周结束、需要跨插件综合结果时。
when_not_to_use: 只要当天待办或单条状态时。
tools: [read-file, search]        # 声明，不授予
applies_to: both                  # assistant / coding / both
user_invocable: true
argument_hint: "<周期，可选>"
```

正文保持在 500 行以内；更大的内容拆到 `references/`，在正文里写清“什么时候读哪一份”。`scripts/` 只放确定性辅助脚本，执行仍受当前权限岛、沙箱和审查约束。

## 4. 安装与装配

**安装**：和任何插件一样。签名决定首次要不要确认和跑不跑沙箱（安装信任按发布者签名区分，插件之间不再分官方、个人、第三方）；固定版本；安装前展示它声明的技能、需要的工具和连接器类别；卸载只删插件内容，不删业务数据。可以随宿主发布，也可以从本地目录或受控市场安装，入口就是现有的插件安装与市场。

**目录**：不新建注册表。平台已有的方法目录（宿主按插件 Manifest 的 `methods` 登记，助理经 `assistant.methods.read` 读取）就是共同目录，技能包的技能进的是这一份：

- **个人助理**：技能是 `methods`，owner 是插件 id；助理列 `name` + `summary`/`description`，需要时用 `assistant.methods.read` 读正文。今天 `AssistantService.methods()`（`apps/local-host/src/assistant/assistant-service.ts`）只保留「所属插件在这个范围里有可用动作」的方法，所以没有动作的技能包助理看不见；这个过滤要改成「插件已安装且在本项目启用」。助理的 `/` 选择仍可把正文作为这一轮材料。
- **Coding**：`applies_to` 包含 `coding` 时，从同一份方法目录里取，注册为可安装方法（复用 `agent.installSkill` 的目录/候选机制），或按项目设置在起跑时注入 `agent.skills`；角色只看到自己工具范围内的技能。Coding 自己的 `codingMethods` 与 `coding.discover-methods` 路径并到这份目录上，不并存两条。
- **其他 Agent**：按 `agent.skills`/`methods` 的现有规则读取。

**生效**：安装 → 项目启用/选择 → 起跑时冻结精确 id/version → 这一轮使用；运行中的轮次不因升级改绑。技能不授予权限，权限仍来自动作授权。

目录项能打开正文、查看使用了哪一份、停用或移除（停用和移除就是插件的停用和卸载）。

## 5. 选择与渐进披露

- **metadata**（name/description/when_to_use/applies_to）常驻，供前门路由和模型选择。
- **正文**（SKILL.md）只在用户点名、前门选中或模型读取时进入上下文。
- **资源**（references/scripts/assets）按正文指向读取，不整包塞入。
- 2026-10-27 用户确定：启用 Skill 后默认允许 AI 按任务自动查找和选用，用户可将该 Skill 改成“仅手动点名”，本次用户点名优先。启用时说明默认用途与范围；导入、安装或查看不等于启用。用户已有的仅手动选择保留，不因升级或重新启用被重置。
- 自动选用只涉及已启用、适用且具备必要能力与权限的 Skill，不把全部正文塞进每轮上下文；选择依据可查看，用户可改选。仅手动的 Skill 不被 AI 自行选用，已知精确引用也不能绕过该设置；用户本次点名后仍沿原权限调用，不可用时如实说明，不悄悄换成另一份。

## 6. 作者与评测

2026-10-27 已定：由执行 AI 判断当前内容是否构成可复用方法，再调用公开的创作/更新工具；工具说明按[长期内容用途合同](../prologue-memory-strategy/spec.md#13-长期内容的用途与工具选择2026-10-27-已定)区分 Skill、记忆和项目长期说明。一次性结果、个人背景及项目规矩各归原主人，生成 Skill 仍遵守本 spec 的安装、启用与权限规则，不因 AI 选中了工具而自动生效。现有方法先查再更新，完成后回执提供具体去处和管理入口；工具接入尚待实现。

- **从一次对话生成**：看用户做一遍或听描述 → 区分固定步骤、可变参数、需要判断的点 → 判断点做 approval gate → 写 `SKILL.md` → 用用户已知答案的真实案例回放 → 注册到目录 → 需要时排期。
- **校验**：插件 id/版本、技能 id/版本、正文长度、路径逃逸、重复 id、引用文件存在、`applies_to` 合法、`tools` 不越界。
- **评测**：测试 prompt、跑多次看方差、看触发率与结果质量、改 description/正文后重跑；不把一次成功当稳定。

## 7. 验收标准

| 编号 | 用户可观察结果 |
| --- | --- |
| SKP-01 | 安装一个没有 runtime、只在 Manifest 里声明技能的签名插件，走和其他插件同一条安装路径，不新增运行时、动作、存储或路由；安装前能看见技能、连接器类别和需要的工具，卸载只删内容 |
| SKP-02 | 个人助理能看见这个插件的技能，不需要它提供动作；列表有 `description`/`when_to_use`，需要时能读正文，且读到的版本与目录一致 |
| SKP-03 | `applies_to` 含 `coding` 时，Coding 能按项目启用选择并安装/注入该技能；不含时 Coding 看不到 |
| SKP-04 | 同一个插件的技能在助理和 Coding 里显示同一 id/version/正文；两边读同一份方法目录、不各存一份名单，升级后目录一致；代码里没有只给技能包用的注册表或安装入口 |
| SKP-05 | 技能正文按需读取，`references/` 不随正文整包进入上下文；正文引用哪份参考，读到的是包内那一份 |
| SKP-06 | 技能不授予任何权限；它声明的工具仍要当前动作授权，写操作仍进审查队列，撤权/停用后不能继续用 |
| SKP-07 | 版本精确：运行中的一轮固定原版本，升级不改绑；卸载/停用后新轮次不再出现，历史记录仍可读 |
| SKP-08 | 坏插件（Manifest 声明的正文缺失、重复 id、路径逃逸、超长、引用缺失、`applies_to` 非法）被拒绝并说明原因，不部分安装 |
| SKP-09 | `scripts/` 只在当前权限岛和沙箱里执行；脚本失败、超时或越权时如实报错，不静默当作成功 |
| SKP-10 | 用户能从前门/目录选择一个技能，也能用 `/` 点名；启用后默认允许 AI 按适用条件自动选用，用户点名优先，可改为仅手动；仅导入/安装未启用的技能不参与，已有仅手动选择不被升级或重新启用重置，选择依据可查看 |
| SKP-11 | 从一次对话生成一个技能包，经过校验与已知答案回放后注册；生成过程不自动安装、不自动扩大权限 |
| SKP-12 | `[人工]` 在真实项目里安装一个角色包，在助理和 Coding 各完成一次真实工作，再卸载；业务事实、Todo、Goal、Artifact 均未被技能包改写 |

## 8. 关联

- 插件声明与宿主装配：[plugin-platform-v2](../plugin-platform-v2/spec.md)
- 助理如何使用 Skill：[proactive-assistant](../proactive-assistant/spec.md) §5
- Coding 角色与方法：[coding-plugin](../coding-plugin/spec.md)、[next-requirements](../coding-plugin/next-requirements.md) A2/A4
- 作者手册与评测：[ai-development-handbook](../ai-development-handbook/spec.md)
- 连接器占位符：[assistant-service-connections](../assistant-service-connections/spec.md)
- 相关代码：`apps/local-host/src/assistant/assistant-service.ts`、`plugins/native/coding/src/roles.ts`、`plugins/native/coding/src/routes-setup.ts`、`packages/contracts/src/platform/plugin-agent.ts`
