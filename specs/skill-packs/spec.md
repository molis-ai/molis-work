# 技能包与个人助理 / Coding 的装配

状态：需求已整理，尚未实现（2026-10-18）。目标完成程度为**内部完整**：一个只有内容、没有运行时、动作和存储的技能包可以安装，个人助理与 Coding 能按同一份目录发现、选择、按精确版本使用；技能不授予权限，业务效果仍走动作授权与审查。

## 1. 问题

现有插件平台适合 app 型插件：Manifest、Runtime、actions、views、storage、routes。角色包、场景包、方法包（例如工程、产品、数据、设计、法务的做法）只需要 Markdown 和少量参考文件，却要背一整套运行时；第三方作者和内部内容作者都很难供给。

现状有三个具体断点：

1. **个人助理只看见“有可用动作的插件”提供的方法。** `apps/local-host/src/assistant/assistant-service.ts` 的 `methods()` 用当前范围里可用动作的提供方过滤；一个只有方法、没有动作的包不会出现在“可用的方法”里。
2. **Coding 有自己的方法路径。** `plugins/native/coding/src/roles.ts` 的 `skills` 是包内 `codingMethods`；项目里的方法经 `coding.discover-methods` → `agent.discoverSkills` → `coding.install-method` → `agent.installSkill` 安装。它和个人助理的 `methods` 是两条路径，没有共同的目录。
3. **Skill 合同太薄。** `AgentSkillDeclaration` 只有 `skill_id`、`version`、`name`、`summary`、`tools`；没有 `description`（什么时候触发）、`when_to_use`、`references/`、`scripts/`、`assets/`，也没有 `applies_to`。助理只能凭 summary 选，Coding 只能靠内置或项目目录。

## 2. 范围与非目标

**做**：

- 一个内容包格式（Skill Pack）：`pack.json` + `skills/*/SKILL.md` + 可选 `references/`、`scripts/`、`assets/`、`agents/`、`commands/`、连接器类别声明。
- 一个宿主注册表（Skill Pack Registry）：安装、签名、版本、项目启用、目录、读取、卸载。
- 个人助理与 Coding 的装配：助理把包内技能列为 `methods`；Coding 把同一份技能按 `applies_to` 注册为可安装方法或起跑时注入 `agent.skills`；两边共享同一份目录与版本。
- 渐进披露：metadata → `SKILL.md` 正文 → `references/`/`scripts/`/`assets/` 按需读取。
- 作者与评测：从一次对话生成包、校验、回放、评测。
- 连接器类别占位符（`~~project tracker` 等），让内容不绑定具体厂商；映射与授权见 [助理统一接入服务](../assistant-service-connections/spec.md)。

**不做**：

- 不新增第二套任务、记忆、Goal、Artifact 或业务事实；技能包只提供做法。
- 不授予权限：技能里写到的工具、动作、连接都仍走动作授权、`beforeEffect` 和审查队列。
- 不做自动选用的“全量技能”；自动选用仍按现有 `autoSelectable`/启用状态，用户可关闭。
- 不替代插件市场审核；目录元数据与审核见 [plugin-platform-v2](../plugin-platform-v2/spec.md)。

## 3. 包格式

```text
my-pack/
├── pack.json
├── skills/
│   └── <skill-id>/
│       ├── SKILL.md
│       ├── references/
│       ├── scripts/
│       └── assets/
├── agents/                 # 可选：给 Agent 的角色/子代理说明
├── commands/               # 可选：用户点名的入口
└── connectors.md           # 可选：~~category 占位符与映射
```

`pack.json` 至少包含：`id`、`version`、`name`、`publisher`、`description`、`applies_to`（`assistant` / `coding` / `both`）、`skills`（id、version、path）、可选 `connectors`、`agents`、`commands`、`license`、`homepage`、`category`、`tags`。

`SKILL.md` frontmatter 至少包含：

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

## 4. 注册表与装配

**安装**：签名包、固定版本、安装前展示技能/连接器/需要的工具；卸载只删包内容，不删业务数据。包可以随宿主发布（`bundled`），也可以从本地目录或受控市场安装。

**注册**：`SkillPackRegistry` 把每个技能注册为当前 Agent 可读的条目：

- **个人助理**：注册为 `methods`，owner 是包 id；助理列 `name` + `summary`/`description`，需要时用 `assistant.methods.read` 读正文。**不再用“有没有可用动作”过滤内容包**；改为“包已安装且在本项目启用”。助理的 `/` 选择仍可把正文作为这一轮材料。
- **Coding**：当 `applies_to` 包含 `coding` 时，注册为可安装方法（复用 `agent.installSkill` 的目录/候选机制），或按项目设置在起跑时注入 `agent.skills`；角色只看到自己工具范围内的技能。
- **其他 Agent**：注册为 `methods`，按 `agent.skills`/`methods` 的现有规则读取。

**生效**：安装 → 项目启用/选择 → 起跑时冻结精确 id/version → 这一轮使用；运行中的轮次不因升级改绑。技能不授予权限，权限仍来自动作授权。

**目录**：助理与 Coding 共享同一份 `Skill Catalog`（来源、版本、适用范围、启用状态、依赖），不各建一套名单；目录项可打开正文、查看使用了哪一份、停用或移除。

## 5. 选择与渐进披露

- **metadata**（name/description/when_to_use/applies_to）常驻，供前门路由和模型选择。
- **正文**（SKILL.md）只在用户点名、前门选中或模型读取时进入上下文。
- **资源**（references/scripts/assets）按正文指向读取，不整包塞入。
- 自动选用默认关闭；用户明确启用后，才按适用条件参与选择。选择依据要能解释；不可用时如实说明，不悄悄换成另一份。

## 6. 作者与评测

- **从一次对话生成**：看用户做一遍或听描述 → 区分固定步骤、可变参数、需要判断的点 → 判断点做 approval gate → 写 `SKILL.md` → 用用户已知答案的真实案例回放 → 注册到目录 → 需要时排期。
- **校验**：包 id/版本、技能 id/版本、正文长度、路径逃逸、重复 id、引用文件存在、`applies_to` 合法、`tools` 不越界。
- **评测**：测试 prompt、跑多次看方差、看触发率与结果质量、改 description/正文后重跑；不把一次成功当稳定。

## 7. 验收标准

| 编号 | 用户可观察结果 |
| --- | --- |
| SKP-01 | 安装一个只有 `pack.json` 和 `skills/` 的签名包，不新增运行时、动作、存储或路由；安装前能看见技能、连接器和需要的工具，卸载只删内容 |
| SKP-02 | 个人助理能看见这个包的技能，不需要该包提供动作；列表有 `description`/`when_to_use`，需要时能读正文，且读到的版本与目录一致 |
| SKP-03 | `applies_to` 含 `coding` 时，Coding 能按项目启用选择并安装/注入该技能；不含时 Coding 看不到 |
| SKP-04 | 同一份包在助理和 Coding 里显示同一 id/version/正文；两边不各存一份名单，升级后目录一致 |
| SKP-05 | 技能正文按需读取，`references/` 不随正文整包进入上下文；正文引用哪份参考，读到的是包内那一份 |
| SKP-06 | 技能不授予任何权限；它声明的工具仍要当前动作授权，写操作仍进审查队列，撤权/停用后不能继续用 |
| SKP-07 | 版本精确：运行中的一轮固定原版本，升级不改绑；卸载/停用后新轮次不再出现，历史记录仍可读 |
| SKP-08 | 坏包（缺正文、重复 id、路径逃逸、超长、引用缺失、`applies_to` 非法）被拒绝并说明原因，不部分安装 |
| SKP-09 | `scripts/` 只在当前权限岛和沙箱里执行；脚本失败、超时或越权时如实报错，不静默当作成功 |
| SKP-10 | 用户能从前门/目录选择一个技能，也能用 `/` 点名；自动选用默认关闭，启用后可按适用条件参与，选择依据可解释 |
| SKP-11 | 从一次对话生成一个技能包，经过校验与已知答案回放后注册；生成过程不自动安装、不自动扩大权限 |
| SKP-12 | `[人工]` 在真实项目里安装一个角色包，在助理和 Coding 各完成一次真实工作，再卸载；业务事实、Todo、Goal、Artifact 均未被技能包改写 |

## 8. 关联

- 插件声明与宿主装配：[plugin-platform-v2](../plugin-platform-v2/spec.md)
- 助理如何使用 Skill：[proactive-assistant](../proactive-assistant/spec.md) §5
- Coding 角色与方法：[coding-plugin](../coding-plugin/spec.md)、[next-requirements](../coding-plugin/next-requirements.md) A2/A4
- 作者手册与评测：[ai-development-handbook](../ai-development-handbook/spec.md)
- 连接器占位符：[assistant-service-connections](../assistant-service-connections/spec.md)
- 相关代码：`apps/local-host/src/assistant/assistant-service.ts`、`plugins/native/coding/src/roles.ts`、`plugins/native/coding/src/routes-setup.ts`、`packages/contracts/src/platform/plugin-agent.ts`
