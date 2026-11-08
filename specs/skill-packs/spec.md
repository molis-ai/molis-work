# 技能包与个人助理 / Coding 的装配

状态：需求已整理，尚未实现（2026-10-18；2026-10-19 改为「没有 runtime、只有 Manifest 的插件」，不再设第二套安装与注册路径；2026-11-04 安装预览、启用和管理的界面已定样，见 §9；2026-11-06 第 08 批开工，开工前检查与拆片见 §10、§11）。实现归会话④（需求）。目标完成程度为**内部完整**：一个只有内容、没有运行时、动作和存储的插件可以安装，个人助理与 Coding 能按同一份目录发现、选择、按精确版本使用；技能不授予权限，业务效果仍走动作授权与审查。

2026-10-19 改动记录：原稿的 `pack.json` 与宿主 `SkillPackRegistry` 是插件之外的第二条安装、信任和注册路径，违反 2026-10-18 用户定的「插件不分官方、个人、创作台生成还是第三方，待遇一样；缺什么补进平台，不给某个插件在宿主里开私路」（`AGENTS.md` 硬约束，`specs/archive/repository-anti-corruption/spec.md` §1 的 2026-10-18 各行），也与 [plugin-platform-v2](../plugin-platform-v2/spec.md) S1「内容包是一种只有内容的声明形态」不一致。现在技能包就是一个没有 runtime 的插件：技能写在 Manifest 的方法声明里（`AgentSkillDeclaration` 加字段），走同一条插件安装、信任、启用、卸载路径。验收编号 SKP-01～SKP-12 全部保留，其中 SKP-01、SKP-02、SKP-04、SKP-08 的措辞随新设计改了；没有整条删除的编号（原稿没有一条只对旧设计成立）。

## 1. 问题

现有插件平台适合 app 型插件：Manifest、Runtime、actions、views、storage、routes。角色包、场景包、方法包（例如工程、产品、数据、设计、法务的做法）只需要 Markdown 和少量参考文件，却要背一整套运行时；第三方作者和内部内容作者都很难供给。

现状有三个具体断点：

1. **个人助理只看见“有可用动作的插件”提供的方法。** `apps/local-host/src/assistant/assistant-work-reads.ts` 的 `methods()`（2026-11-04 核对：过滤已从 `assistant-service.ts` 搬到这里） 用当前范围里可用动作的提供方过滤；一个只有方法、没有动作的包不会出现在“可用的方法”里。
2. **Coding 有自己的方法路径。** `plugins/native/coding/src/roles.ts` 的 `skills` 是包内 `codingSkills`（`plugins/native/coding/src/skills.ts`；2026-11-04 核对，原名 `codingMethods`）；项目里的方法经 `coding.discover-methods` → `agent.discoverSkills` → `coding.install-method` → `agent.installSkill` 安装。它和个人助理的 `methods` 是两条路径，没有共同的目录。
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

- **个人助理**：技能是 `methods`，owner 是插件 id；助理列 `name` + `summary`/`description`，需要时用 `assistant.methods.read` 读正文。今天 `methods()`（`apps/local-host/src/assistant/assistant-work-reads.ts`）只保留「所属插件在这个范围里有可用动作」的方法，所以没有动作的技能包助理看不见；这个过滤要改成「插件已安装且在本项目启用」。助理的 `/` 选择仍可把正文作为这一轮材料。
- **Coding**：`applies_to` 包含 `coding` 时，从同一份方法目录里取，注册为可安装方法（复用 `agent.installSkill` 的目录/候选机制），或按项目设置在起跑时注入 `agent.skills`；角色只看到自己工具范围内的技能。Coding 自己的 `codingSkills` 与 `coding.discover-methods` 路径并到这份目录上，不并存两条。
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

- 合同设计（第 08 批，2026-11-04 设计稿）：[contract-design.md](contract-design.md)
- 插件声明与宿主装配：[plugin-platform-v2](../plugin-platform-v2/spec.md)
- 助理如何使用 Skill：[proactive-assistant](../proactive-assistant/spec.md) §5
- Coding 角色与方法：[coding-plugin](../coding-plugin/spec.md)、[next-requirements](../coding-plugin/next-requirements.md) A2/A4
- 作者手册与评测：[ai-development-handbook](../ai-development-handbook/spec.md)
- 连接器占位符：[assistant-service-connections](../assistant-service-connections/spec.md)
- 相关代码：`apps/local-host/src/assistant/assistant-work-reads.ts`、`plugins/native/coding/src/roles.ts`、`plugins/native/coding/src/routes-setup.ts`、`packages/contracts/src/platform/plugin-agent.ts`

## 9. 决策记录

- **2026-11-04 用户定样（第 08 批「先定样：安装预览、启用和管理」）**：选 **A 的启用步骤＋C 的目录**。可点原型与状态表见 [docs/design/skill-packs/](../../docs/design/skill-packs/README.md)。
  - **安装与导入**：安装确认里只看技能、不选。确认里列出每个技能的用途、适用于助理还是 Coding、会不会执行脚本、用到的连接器类别；详情里有什么时候用、声明的工具、附带文件和正文开头；升级时标出新增、正文变了、会移除、仅手动会保留。点「同意并安装」后，同一块就地换成「在这个项目里用哪些」：每项三档（关／自动／仅手动），默认关，上面三句话说明三档；可「以后再说」。从本机导入走同一个步骤。
  - **目录**：设置里「技能」一节是左边列表、右边详情。列表每行带状态（自动／仅手动／关／用不了），可搜索、按在用／没启用／用不了筛选。详情里是：三档单选（每档一句说明）、什么时候用和不用、声明的工具、附带文件、正文开头与打开全文、最近一次被用、所在包与整包的停用和卸载。窄屏先列表，点进去看详情。
  - **用不了**：每种原因写一句话，给一件能做的事（照合同的不可用原因码），和启用状态分开显示。插件停用、发布者撤销、正文或资源坏了的，三档变灰。
  - **改状态**：立即生效，提示里可以撤销；保存失败就地说「什么都没改」并给重试。
  - **否掉的**：
    - A 的目录（按包分组、行末三档分段）：用户更要列表加完整详情，技能多了好找；
    - B 在安装确认里一并用开关选：把「同意权限」和「让 AI 用」并进一个按钮，三档也拆成开关加勾选两个控件；
    - C 装完不启用、要另去目录：装完还要再走一趟。
  - **代价**：目录里改状态要先点进详情。
  - **组件板新增**（定下后先补标本再进产品，交 D 轨）：条目行下面的三档分段、条目行里的折叠详情、列表＋详情的整页、提示里的按钮、状态旁的链接按钮。
- **2026-11-06 用户定（第 08 批开工时一并问的两项）**：
  - **两张新表的建表步骤**：同意。`skill_settings`、`skill_uses` 按本批前置等 05 的 U1／U2 与 SQLite 切换，在 U1 升级链里加一步只建这两张空表，不动已有数据。08-7 那一片在同一个 PR 里把这一步写进 `docs/system/CONTRACT-CHANGES.md`「当前保留机制」。否掉的：到时再问（多停一次）；赶在重建前写进第 1 版（要推翻本批「动表等 05」的前置）。
  - **Coding 旧路的存量**：删 `agent.skills.discover.v1`／`install.v1` 与 Prologue 存储里的 `molis-coding-method`（第 09 批 9-4、9-5）时不认也不迁，不写迁移、不留读取兜底；真实 Home 里万一有旧数据，用「从本机导入」重新导一次。否掉的：写迁移搬进新目录（新增迁移逻辑，要长期维护）。

- **2026-11-07 用户定**：「发布者撤销」那种用不了的状态字保留定样的「已撤销」，英文先用产品词典已有的 Retracted；第 16 批换成稳定键以后再单独译成 Revoked。否掉的：改成「发布者已撤销」（改了已定的样里的一个词）。
- **2026-11-07 第 08 批主会话定**：C-1 的 frontmatter 转声明照写手的做法——`name` 兼作 Skill 的 id 与名称；没写 `summary` 时取 `description` 开头 300 个 UTF-16 单元；`version` 先取调用方给的，其次取 frontmatter 的，都没有就是 1。只有声明的插件写 `requires` 不要求同时列进 `capabilities.consumes`（它自己不调用动作，`consumes` 必须为空）。`connector_categories` 先只查格式，类别表由助理统一接入服务的主人给出。
- **2026-11-07 用户定（C-3 与第 20 批的先后）**：C-3 先落，不等第 20 批的 P-3b／P-3c。C-3 排在 C-1 之后，和共用 `platform/plugin.txt` 快照的片（05② C-2、P-1 和在途的 #1939）先准备好的先落，同一时间一个 PR。场景合同第 10 节先后表、第 20 批文件和依赖表已经照改。否掉的：照原表排在 P-3b／P-3c 之后（两边没有语义依赖，C-3 已经写完，要空等 20 批还没开工的两片）。
- **2026-11-07 用户定（沙箱包方法的 `tools`）**：签名沙箱包的方法仍要求 `tools` 为空，C-3 照这样做。S-105 里「空工具方法不授予执行、目录或子 Agent 权限」一条不放宽；C-3 只把 S-105 写的三键写法改成完整声明。沙箱方法要声明只在 `SKILL_TOOLS` 里的工具，得另开需求放宽 S-105，并带上拒绝测试。否掉的：在 C-3 里一并放开（那样要改安全边界，C-3 就不再只是合并写法）。

## 10. 开工前检查（第 08 批主会话，2026-11-06）

按[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md#4-开工前检查)第 4 节逐项答（第 15 项随决定 27 于 2026-11-07 补）。依据：本 spec、[合同稿](contract-design.md)、main `cf21c8d67`（第 14 项冲突面 2026-11-07 按 main `52f1e9836` 重核）。档位：大需求；类型：横向能力（主），兼产品线（助理、Coding）。决策标记：直接做；第 6、7 项里两张新表与 Coding 旧路的存量，用户 2026-11-06 已定（§9）；C-3 落在 02③ 之后时的存量另问（第 7 项）。

本批只交合同、Plugin Runtime、安装、Skill 目录与设置、导入、界面和设计与无障碍内容包。助理与 Coding 两个消费方在[第 09 批](../post-anticorruption-roadmap/reference/batches/09.md)（9-2～9-5），见 §11 末尾。

| # | 项 | 结论 |
| --- | --- | --- |
| 1 | 事实主人 | Skill 正文与声明归提供它的插件。Skill 目录、启用状态（`skill_settings`）与用量（`skill_uses`）归宿主的 Agent 定义登记（`apps/local-host/src/agent-definitions/`，Home 库 `agent-definitions`）。安装、信任、停用、卸载归 Plugin Runtime。导入来源的原文件归用户本机，导入只做固定拷贝。助理与 Coding 以后都读 `skills.catalog.list@1`，不各存名单（接入在 09）（合同稿 §1、§8） |
| 2 | 插件同等待遇 | 只有声明的插件走同一条 `plugins.install.preview`／`confirm`，用同一个 `inspectContentPlugin` 和同一套签名校验；信任只按签名区分。随包带的官方包不走内置 `registration`：那条路给 `HOST_BUILD_TRUST`，不能拒绝升级。「启用时从已验证包登记方法」对所有插件都成立，不是给只有声明的插件开的分支（合同稿 §3） |
| 3 | 能力注册 | `system.skills` 提供方把四个动作登记一次；`skills.import.*`、`plugins.bundled.list@1` 只给本人；页面、Agent、插件都从动作目录取。范围、操作者、安装从调用上下文来；「本轮点名」从这一轮冻结的 `SkillRef` 名单来，不从模型输入读。没有等模型或外部服务的动作，不声明 `concurrent` |
| 4 | 合同 | 改。分三份合同：C-1 声明，C-2 动作与安装预览，C-3 沙箱方法写法合一（合同稿 §12）。C-1 单开一个只改合同的小 PR（#1936，第 09、20 批要用）；C-2、C-3 按[决定 31](../post-anticorruption-roadmap/reference/decisions.md#decision-31)在本批分支上做，随本批 PR 合入（2026-11-08 改，见 §11）。M1 之前按 N35 一个 PR 改完所有消费者，不留兼容期；各片随之刷新动作快照与 api 快照 |
| 5 | 放在哪个包 | 合同与校验放 `packages/contracts`、`packages/plugin-sdk`；「已声明、不启动」放 `packages/plugin-runtime`。目录、设置、用量扩展宿主已有的 Agent 定义登记：它今天已经按 Manifest 的 `methods` 登记方法，是方法定义的事实主人，所以这是给已有主人加状态，不是新的平台服务。用户 2026-11-01 定「新的平台服务放 `horizontal/` 新包」，管的是新服务，这里不新开包。依赖方向不变 |
| 6 | 表与存储 | 新增两张表 `skill_settings`、`skill_uses`，只由 `apps/local-host/src/agent-definitions/` 读写；别的包调它导出的函数，不进 `tooling/gates/table-owners.json` 的共写名单。`table-owners.json` 的 `areas` 现在只有 Feed 一条，08-7 评估给 `agent-definitions` 加一条，只许变严。同片改 `docs/SSOT-MATRIX.md` 的主人行、`docs/system/HOME-DATA.md` 和库版本维护清单。动表的实现按本批前置，等 05 的 U1／U2 与 SQLite 切换；那时真实 Home 已经重建，在 U1 升级链里加一步，只建这两张空表（用户 2026-11-06 同意，§9） |
| 7 | 兼容与迁移 | 不加读取兼容。迁移只有两处。① 上一项的建表一步，用户已同意；08-7 在同一个 PR 里把它写进 `docs/system/CONTRACT-CHANGES.md`「当前保留机制」。② C-3 把沙箱 app 包的 `methods: [{ name, purpose, body }]` 改成完整的 Skill 声明，已签名留存的沙箱包和创作台生成的包会读不了（`docs/platform/PLUGIN-DEVELOPMENT.md`「沙箱包格式与安装」）。C-3 若在 02③ 真实 Home 重建之前合入，直接改，不迁；若在重建之后，旧包要迁移或兼容，属红线，开 PR 前先问用户（合同稿 §12、§13 第 3 条）。Coding 旧路的 `molis-coding-method` 不认也不迁（用户 2026-11-06 定，§9；删除在 09 的 9-4、9-5） |
| 8 | 安全边界 | 碰。包内路径校验，拒 `..`、绝对路径、符号链接。签名验证复用现有的。资源只按声明的路径读，并核对 `sha256`。导入只读来源目录之内。`manual` 的 Skill 只认冻结名单，防提示注入。Skill 不授予权限：`tools` 只是说明，Coding 不借它扩大 `host_tools`（SKC-13，代码随 09 的 9-5 落）。各实现片在 `docs/system/SECURITY-INVARIANTS.md` 加行，配断言「拒绝」本身的测试 |
| 9 | 调用次数 | 打开目录发一次请求，返回里带 `excerpt` 和 `availability`，详情不再为开头另读正文。改状态一次点击一次请求：原型的启用步骤与目录都是「选好就生效」，「完成」只跳转，不按条目逐个发。`skills.catalog.list@1` 每次请求做一遍目录发现与授权核对，开一次库。页面不轮询。一轮开头要冻结多个 `SkillRef` 时，读正文不能逐个重核、逐个开库（N42～N44）：C-2 定为 `skills.body.read@1` 收引用数组（1～20 个），一次请求一份上下文；这条和 09 第八节第 6 条「一轮只取一次目录」对齐 |
| 10 | 升级与数据 | 包升级、插件停用再启用都不改设置；被移除的 Skill 删设置，新增的是 `off`。正在跑的一轮固定原 `SkillRef`。卸载后，用量历史保留当时的引用与名称。再导入同一来源就是升级。沙箱包的方法写法见第 7 项② |
| 11 | 成果与过程项 | 不涉及：技能包不产出成果或过程项，只有声明的插件的 Manifest 不许声明 `artifacts`、`process_items` |
| 12 | 页面与外壳 | 安装预览是在现有「设置 → 插件」的安装审阅里加一节；「技能」是设置里「插件」旁边的一节，不是插件自己的整页。新的 DOM 事件按 `dom-events.ts` 登记。页面资源有增长要写明；单个资源一次涨超过 10 KB，或新增资源，先问用户 |
| 13 | 错误 | 坏包沿用 `plugin.declaration_invalid`，加 `problems` 明细；新码用 `defineErrorCodes`，不写 Error 子类。新文件要在 `tooling/gates/error-owners.json` 加主人的，开片前先问 |
| 14 | 冲突面 | 见下表。借 D 轨（08-2、08-9）的文件，按轨道规则 7 在认领板认领后单开一片，需求方的片叠在后面。借 E 轨的三个文件（08-3）按[第 8.4 节](../post-anticorruption-roadmap/reference/development-workflow.md#batch-grouping)第 5 条接力（2026-11-07 改，原来也是单开一片）：在认领板认领这三个文件；08-3 在 08-5 的子分支上单独一个提交，同一时间只有这一个写手改它们（写手由本批派，决定 26），就是规则 7 的「交给正在改这批文件的写手」；本批 PR 开出后，本批评审台审 08-5 子分支时按 E 轨的标准单独看这个提交：三个插件照常装配，只补取值、不改行为，结论在 PR 评论里单列一行。合回本批分支前再查一次在途 PR，有别的片要改这三个文件，就把 08-3 连同依赖它的 08-5 切成小 PR 先落（第 8.4 节「提前切出」）。11-07 查过：没有在途 PR 改它们 |
| 15 | 全局最优 | 逐个场景看：**插件**——只有声明的插件、沙箱包、内置插件、创作台生成的包用同一份方法声明、同一个校验函数和同一条安装路径（C-1、C-3），第三方作者只学一种写法；**平台**——Skill 目录扩展已有的 Agent 定义登记，Plugin Runtime 只多一种「已声明、不启动」，不另起服务、不另设注册表；**助理**——和 Coding 读同一个 `skills.catalog.list@1`，一轮开头的多个正文一次请求读完（`skills.body.read@1` 收引用数组），接入在 09；没有界面时，助理能读目录、用 `auto` 的和本轮点名的；启用、导入只给本人，故意不开给 Agent（防提示注入）；**各类平台能力**——授权、审查、动作目录不变，Skill 不授予权限；连接器经 `requires` 与 `connector_categories` 相接（类别表由助理统一接入服务的主人给，§9）；统一输入的 `/` 点名在 09 的 9-2／9-4，和第 10 批同改 `assistant-composer.ts`；第 20 批的场景包沿用 `kind: "content"` 的白名单与 `SkillRef`，第 72 批的导出导入沿用内容包格式；**后续开发**——再加一种只有声明的内容，只在白名单加键、在检查函数加一条。比较过三种做法：单设 `SkillPackRegistry`（2026-10-19 否，第二条安装与信任路径）；目录放进新的 `horizontal/` 服务包（否：方法定义的主人已是 Agent 定义登记，新包会复制登记）；启用并进安装动作（否：同意权限与让 AI 用混成一步，定样也否了）。多付代价的：宿主 Agent 定义登记多两张表；Coding 失去自有的发现与安装路径，由 09 的 9-4 删旧路、改读目录时付；`SignedAgentReference` 的方法引用改 `SkillRef` 随 09 的 9-2 付（见本批文件偏离记录） |

| 文件 | 轨道 | 本批哪片 | 在途的别批 PR |
| --- | --- | --- | --- |
| `packages/contracts/src/platform/plugin-agent.ts`、`plugin-manifest.ts`、`plugin-package.ts`，`packages/plugin-sdk/src/manifest.ts` | C1 | 08-1、08-5 | #1837（02③）四个都改，已于 11-07 合入；C-1、C-3 已 rebase 到它之后 |
| `tooling/gates/api/contracts/platform/plugin.txt` | C1 | 08-1、08-5 | #1837、#1879（18 P2）、#1960（02 复查）已合入；C-1 在 #1936，C-3 在本批分支上叠在 C-1 之后，同一时间一个写手 |
| `tooling/gates/actions/host-actions.tsv`（规则 4 枢纽） | C1 | 08-6（安装预览的输出 schema）、08-7、08-8、08-10（`plugins.bundled.list@1`）；C-2 只声明，不动它 | #1846 在途；同一时间一片在途 |
| `packages/plugin-runtime/`，宿主的 `plugin-install-service.ts`、`sandbox-package.ts`、`plugin-install-actions.ts`、`plugin-instructions.ts` | C1／C 轨 | 08-5、08-6 | 08-5 与 08-6 都碰沙箱包解析与安装预览，先 08-5 后 08-6 |
| `apps/local-host/src/agent-definitions/`（C 轨，09 第八节第 4 条） | C | 08-7 | #1837 改其中几个文件（版本标记），08-7 本来就排在它之后 |
| `packages/design-system/`（组件板） | D | 08-2 | #1872（10 K0c）改 `primitives/catalog.ts`、`styles/primitives.ts`；标本放新文件，#1872 合入后本批分支合一次 main，标本子分支叠上（11-07 曾先开 #1935，碰了独占文件，用户定关掉等 #1872） |
| `apps/workbench/src/settings-plugins.ts`（安装审阅）、设置里新加的「技能」一节、`apps/workbench/src/i18n/`、页面样式表（`mw-item` 从组件板搬进来） | D | 08-9 | 开片前查；由 D 落或认领后单开一片，D 轨审 |
| `plugins/native/todo/src/roles.ts`、`plugins/native/issues/src/skills.ts`、`plugins/native/pages/src/skills.ts` | E | 08-3（在 08-5 的子分支上，单独一个提交，按第 14 项接力） | 合回本批分支前查；11-07 查过没有在途 PR |

## 11. 拆片与先后（第 08 批主会话，2026-11-06）

合同先行，服务接着，界面最后。下表每片一个提交起步。按[决定 31](../post-anticorruption-roadmap/reference/decisions.md#decision-31)（第 8.4 节，2026-11-08 起；原按决定 28 合组开几个 PR）全批一个 PR：08-1 已单开 #1936（第 09、20 批要用），照原样走；其余各片在本批分支 `batch/08` 上分子分支做，合回本批分支，不开 PR。子分支：08-4；08-5 加 08-3（E 轨三个文件按 §10 第 14 项接力）；08-2；08-6、08-7、08-8 一个（08-7 等不到第 05 批的前置，就从本批分支拿掉它的提交，留给后面）；08-9；08-10；另有一个小修子分支。同一子分支的后续步骤叠在一起。

| 片 | 内容 | 前置 | 验收 |
| --- | --- | --- | --- |
| 08-1 C-1 声明合同 | 合同稿 §12 C-1 行 | 02 交接（已合）；#1837、#1879 合入后开 PR | SKC-01、SKC-03 的合同与 SDK 部分 |
| 08-2 组件板标本 | §9 的五个「组件板新增」补成 `/__ui/catalog` 上的标本，D 轨合审 | 定样（已合）；#1872 合入后本批分支合一次 main 再叠上 | 照定样决策；每个标本的正常／异常、中英文、深浅色、1440／1024／390 都齐 |
| 08-3 三个内置插件补取值 | Todo、Issues、Pages 的 `methods` 写上 `description`、`applies_to`（E 轨文件） | 08-1 | 三个插件照常装配；为 08-5 改必填铺路 |
| 08-4 C-2 动作合同 | 合同稿 §12 C-2 行；`skills.body.read@1` 的批量读法按 §10 第 9 项定 | 08-1；`host-actions.tsv` 上没有别的片在途 | SKC-05～09 的合同部分 |
| 08-5 C-3 方法写法合一 | 合同稿 §12 C-3 行，`description`、`applies_to` 改必填；跑 `pnpm studio:replay` | 08-1、08-3；#1837 合入；02③ 已于 11-07 重建，旧三键沙箱包不兼容、不迁移（用户 11-08 定，§9） | SKP-08；现有沙箱包与创作台回放不被拒 |
| 08-6 Runtime 与安装 | 「已声明、不启动」装配；内容包的解析接进安装服务；启用时从已验证包登记方法；安装预览的 `skills`、`requires`，以及按 Skill 的升级差异 | 08-4、08-5（预览要给沙箱包方法列 `description`／`applies_to`，宿主不替它编） | SKC-02、SKC-03、SKC-04，SKP-01、SKP-08 |
| 08-7 Skill 目录、设置与用量 | `system.skills` 的四个动作；两张新表（U1 里加一步建表）；冻结点名；SSOT、HOME-DATA、库版本清单 | 08-4、08-6；05 的 U1／U2 与 SQLite 切换 | SKC-05、SKC-06、SKC-08、SKC-09、SKC-12，SKC-07 的目录一侧 |
| 08-8 外部 Skills 导入 | `skills.import.*`、CLI `pack-content`、用本机发布身份签名 | 08-4、08-6（不动表）。和 08-7 改同一份 `system.skills` 登记或 `host-actions.tsv` 时，同一时间一个写手，先准备好的先落 | SKC-10 |
| 08-9 界面 | 照 §9 定样：安装预览一节、启用步骤、「技能」目录、从本机导入；技能名称与说明的英文走提供它的插件的 `ui.translations`，在这一片读取时补齐（含 Todo、Issues、Pages 的四个方法） | 08-2、08-6、08-7、08-8；D 轨文件按 §10 第 14 项 | SKP-01、SKP-08、SKP-10 的界面部分；本人验收 |
| 08-10 设计与无障碍内容包（BL-165） | 写成只有声明的插件；随安装包带上，加 `plugins.bundled.list@1` | 08-6；官方签名等 26-1 | 能装上、过校验、进 Skill 目录；本人验收 |

**不在本批的验收编号：**

- **消费方，在第 09 批**：助理的 `methods()` 改读目录，`SignedAgentReference` 的方法引用改用 `SkillRef`（9-2）；助理交活时带 `SkillRef`（9-3）；Coding 读目录并删旧路（9-4，SKC-11）；agent-host 按 `SkillRef` 冻结、`tools` 的两道检查（9-5，SKC-13）；真实验证（9-6，SKP-12 与 ADH-23）。SKP-02～07、SKP-10 的消费方一侧（`/` 点名、AI 自动选用，9-2／9-4）、SKC-07 的消费方部分，以及 SKC-06 委派之后仍成立的部分，都随 09 验。
- **SKP-09（`scripts/` 只在权限岛和沙箱里跑）**：本批只管声明一侧：`role: "script"`、`runs_scripts` 标注、只能按声明路径读，宿主不执行脚本。执行发生在会跑脚本的 Agent 里（Coding），随 09 的 9-4、9-5 验；09 第七节已加一行。
- **SKP-11（从对话生成技能包）**：在[第 42 批](../post-anticorruption-roadmap/reference/batches/42.md)。

**C-3 与第 20 批的先后**：两者没有语义依赖：P-3b 只要 08 C-1，P-3c 只要 08 C-2；C-3 动 `plugin-package`，它们动 `plugin-manifest`／`blueprints`，只共用 `platform/plugin.txt` 这一份快照。用户 2026-11-07 定 C-3 先落（§9），[场景合同](../scene-and-page-contract/spec.md)第 10 节先后表、第 20 批文件和依赖表已照改。原定随 C-3 的 PR 一起改，按[第 8.4 节](../post-anticorruption-roadmap/reference/development-workflow.md#batch-grouping)第 7 步「影响别的批的决定要立刻入库」提前单开文档 PR。
