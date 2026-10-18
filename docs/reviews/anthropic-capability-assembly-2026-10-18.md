# 能力装配笔记：个人助理与 Coding

状态：设计笔记（2026-10-18，只读分析）。回答的是“Anthropic 那些能力在 Molis Work 里放在哪、由谁消费、怎么装”，不是实施 spec。

## 0. 一句话

Anthropic 这套东西大多不是新动作，而是 **Skill（做法）+ Agent role（谁）+ Action（能做什么）+ Hook（护栏）+ View（在哪看）+ Trigger（何时）** 的装配。Molis 已经有这些槽位；缺的是**内容包（Skill Pack）的统一装配合同**，以及把新能力放进正确槽位，而不是再造一套。

## 1. 现有装配槽位

| 槽位 | 代码 / 合同 | 谁消费 | 说明 |
| --- | --- | --- | --- |
| Action | Manifest `actions`、`ActionDefinition`、统一动作目录 | 页面、工作流、Agent、MCP | 唯一带权限的能力；调用方、授权、`beforeEffect` 都在这一层 |
| Skill | `AgentSkillDeclaration` / `AgentSkillDefinition`；`agent.skills`（插件自己的 Agent）、`methods`（给别的 Agent）、`assistant.methods.read` | 助理、Coding、Character | 文字做法，不授予权限；有 id/version/name/summary/tools/body |
| Agent role | `AgentRoleDeclaration`、`agent.roles` | 助理、Coding、插件 Agent | 角色、提示词层、执行档位、工作区、`host_tools`；起跑前冻结 |
| Character | `modules/characters`、`AgentManifest.characters` | 助理、Coding 的声明角色 | 个人做法，可带 Skill 快照；按精确版本选用 |
| Hook | Prologue `runtime.hooks`（tool-before/after/failed、session-start/end/stop、prompt-submit、compaction、subagent） | 所有 Agent 运行 | 目前 Molis 自己用：动作网关、任务板校验、消息、外部检查器；还没有用户/插件层 |
| View / command | `ui.views`、`ui.commands` | 工作台 | 内容挂在哪、用户怎么点 |
| Service | memory、search、placement、schedule、artifacts | 助理、Coding、插件 | 共享机制与事实服务，不拥有业务事实 |
| Review / authority | `AgentReviewQueue`、`beforeEffect`、动作授权 | 所有 Agent | 副作用进审查队列，人决定 |
| Trigger | schedule、condition、proactive | 助理、Coding 后台 | 什么时候跑 |

## 2. 个人助理怎么装

**Manifest**：`ASSISTANT_AGENT` 有 `assistant` 和 `thread-reply` 两个 role；`host_tools` 是 `BUSINESS_HOST_TOOLS`（ask-user、update-todo、find-tools、context-remaining）；`characters` 可选；**没有自己的 `agent.skills`**。

**Skill 从哪来**：
1. 插件 `methods`：助理列出最多 20 条，只给 `name` + `summary`；某个适合这件事时，用 `assistant.methods.read` 读正文，读了才照做；用户用 `/` 选中的方法，正文直接作为材料进入这一轮。
2. Character 导入的 Skill 快照：按精确版本进入这一轮。
3. 没有仓库 `skills/` 的直接消费；仓库 Skill 是给外部 Runtime 和创作台用的。

**关键过滤器**：`assistant-service.ts` 的 `methods()` 只保留“这个范围里有可用动作的 owner”：

```ts
const live = new Set(actions.discover().filter(view => view.availability.available).map(view => view.provider.provider_id));
return registered.filter(method => live.has(method.owner_id))...
```

这意味着：**一个只有内容、没有动作的 Skill Pack，助理看不见。** 这是 content-only 装配的第一个硬约束。

**能力**：动作目录按当前工作范围与授权过滤；`find-capabilities` / `read-capability` / `change-capability` / `suggest-action`；写操作进审查队列；记忆工具在提供时才有（`remember`、`suggest-memory`、`list-memories`、`forget-memory`），候选 + 用户确认。

**呈现**：卡片、问卷卡、下一步、工作视图、侧栏；结果对象仍由原插件打开。

## 3. Coding 怎么装

**Manifest**：`codingAgentManifest` 有 planner、reader、reviewer、coordinator、writers、builder、writer 七个 role；三个子代理 role（coding-reader、coding-reviewer、coding-builder）；`mcp: true`；`skills: codingMethods`；五个 role 接受 Character。

**Skill 从哪来**：
1. `agent.skills` 的 4 个内置方法：`coding-review-change`、`coding-diagnose-fix`、`coding-implement-change`、`coding-git-delivery`。
2. 项目里发现/安装的方法：`coding.discover-methods` → `agent.discoverSkills` → `coding.install-method` → `agent.installSkill`；按精确 id/version 选用。
3. Character 里的 Skill 快照。
4. 每一轮选中的 methods 随 start 请求冻结。

**工具**：每个 role 的 `host_tools`（read-file、search、edit、run-command、start-command、dispatch-subagent、board-read/report/wait、session-send…），加动作工具、MCP；LSP 还没有。

**执行**：计划/任务板、子代理、工作树、检查点/回退、审查队列、外部检查器。

**缺口**：
- 没有 LSP 工具。
- 没有一个“评审工作流”的装配（多代理、置信分、inline comment 是多个 role + skill + action + view + review 的组合，不是单个动作）。
- 没有从签名内容包安装方法的路径；只有项目目录发现。
- `AgentSkillDeclaration` 只有 `summary`，没有 `description`/`when_to_use`/`references`/`scripts`/`assets`。

## 4. 能力放哪

“主”＝这个能力主要落在这个消费者；“次”＝可复用或委托；“—”＝不适用。

| 能力 | 主要槽位 | 个人助理 | Coding | 其他场景 |
| --- | --- | --- | --- | --- |
| Skill Pack（角色/场景内容） | Skill | 主 | 主 | Goals 规划方法、Feed/Inbox 分诊、Pages 写作、Todo 例程、Workflows 步骤 |
| Hooks（用户/插件规则） | Hook | 主 | 主 | 所有 Agent；项目/用户级策略 |
| LSP | Action/tool | 次（委托 Coding） | 主 | — |
| PR 评审面板 | Role + Skill + Action + View + Review | 次（读结果/委托） | 主 | — |
| 真人批准门 | Review/authority | 主（写操作） | 主（PR/推送） | Goals 完成决定、Workflows 外发 |
| build-agent（把重复工作变成 Skill） | Skill 作者流程 | 主 | 次（Coding 方法） | Plugin Builder、Todo、Schedule |
| 一页式脉搏/工作简报 | Skill + Action + Artifact | 主 | — | work-brief、首页、Goals |
| 前门路由 | Skill | 主 | — | 角色包多时的入口 |
| 跨源搜索规划 | Skill + Search service | 主 | 次（代码搜索用 LSP/search） | Feed/Inbox、全局搜索 |
| 工作记忆例程 | Skill + Memory service | 主 | 次（项目说明） | 项目到达、首页 |
| 设计/无障碍审查 | Skill + Action | 主 | 次（UI 任务） | Pages、视觉线 |
| 交互式计划/探索页面 | Skill + View/Artifact | 主 | 主 | Goals 规划、Pages |
| 现代化/长期改造 | Role + Skill + Action + TaskBoard | 次（委托） | 主 | — |
| 有界迭代（ralph-loop） | Agent loop + Skill | 次 | 主 | 后台任务 |
| 简化/对抗评审（code-simplifier、math-proof） | Role + Skill | 次（研究） | 主 | 高风险评审 |
| 插件市场/元数据 | 分发层 | — | — | Plugin Builder、设置、安装 |
| 组织策略/MDM | Hook/authority 层 | — | — | 平台/团队部署 |
| Telemetry | Service | — | — | 平台/诊断 |

## 5. 统一装配合同：Skill Pack

建议把“content-only 插件”做成 **Skill Pack（内容包）**，而不是再加一个重量级 PluginKind：

```
my-pack/
├── pack.json                 # id, version, name, publisher, category, applies_to, connectors
├── skills/
│   └── <skill-id>/
│       ├── SKILL.md          # frontmatter + 正文
│       ├── references/       # 按需读
│       ├── scripts/          # 可选，执行仍受权限岛
│       └── assets/           # 模板/图
├── agents/                   # 可选：角色/子代理说明
└── commands/                 # 可选：用户点名的入口
```

`SKILL.md` frontmatter 至少要有：

- `name`、`version`、`description`（做什么 + 什么时候触发）
- `when_to_use` / `when_not_to_use`（比 summary 更能帮选择）
- `tools`（声明会用到哪些工具，不授予权限）
- `applies_to`：`assistant` / `coding` / `both`
- `user_invocable`、`argument_hint`（要不要 `/`）
- `references/`、`scripts/`、`assets/` 的入口说明

Host 侧新增一个 **SkillPackRegistry**：

- 安装：签名包、固定版本、安装前展示 skills/connectors/permissions；卸载只删内容。
- 注册：
  - 助理：注册为 `methods`，owner 是 pack id；**不要再用“有没有可用动作”过滤内容包**，改为“已安装且在本项目启用”。
  - Coding：注册为可安装方法（复用 `agent.installSkill` 的路径）或起跑时注入的 `agent.skills`；按 pack 的 `applies_to` 和项目启用决定。
  - 其他 Agent：注册为 `methods`。
- 生效：安装 → 项目启用/选择 → 起跑时冻结 → 这一轮按精确版本用；Skill 不授予权限，动作仍走授权。
- 选择：助理用 `name` + `description` + `when_to_use`；Coding 用 session 的方法选择；两者共享同一份 catalog，不各建一套。

## 6. 装配顺序

1. **Skill Pack + 助理 methods 过滤器 + description/resources**：先让内容进得来、选得中。
2. **Hooks 用户/插件层**：复用现有 `runtime.hooks`，加 manifest/project 规则、面板、沙箱、日志。
3. **LSP**：Prologue 新模块 + Manifest `lsp_servers` + Coding 只读工具。
4. **PR 评审工作流**：role + skill + action + view + review 的组合，不是新运行时。
5. **真人批准门**：接在 review queue/authority 上，Coding 再映射到 GitHub 状态。
6. **build-agent + customizer**：前者产出 Skill Pack，后者改已有 pack。
7. **工作简报/一页式脉搏**：助理 Skill + 数据动作 + work-brief 内容。
8. **前门路由**：角色包多起来之后再加。

## 7. 不要做

- 不要给助理和 Coding 各建一套 Skill 目录；共享一个 registry，可见性和选择规则分开。
- 不要把每个能力都做成 Action；Skill 是做法，Action 才是权限。
- 不要让 Skill 授予权限；权限仍来自动作授权。
- 不要为 TASKS.md/CLAUDE.md 建第二套任务/记忆事实源；它们是视图/材料，Todo 与 memory 仍是主人。
- 不要做自主 Agent 团队/派单；保留显式子代理与任务板。

## 8. 证据

- `apps/local-host/src/assistant/assistant-agent.ts`（角色、prompts、host_tools、characters）
- `apps/local-host/src/assistant/assistant-service.ts`（methods 列表、`assistant.methods.read`、chosen methods、能力目录）
- `plugins/native/coding/src/roles.ts`、`methods.ts`、`manifest.ts`（角色、skills、subagents、characters）
- `plugins/native/coding/src/routes-setup.ts`（discover/install/read methods）
- `packages/contracts/src/platform/plugin-agent.ts`（`AgentSkillDeclaration`、`BUSINESS_HOST_TOOLS`、`METHOD_TOOLS`）
- `horizontal/agent-host/src/adapters/prologue-run.ts`、`prologue-taskboard.ts`、`prologue-messages.ts`、`prologue-checkers.ts`（Molis 已在用的 hooks）
- `horizontal/agent-host/src/reviews.ts`（审查队列）
- `docs/system/GLOSSARY.md` §2.3（Agent、Agent role、Character、Skill）
- `docs/system/EXTENSION-POINTS.md` §3.4（AI 能力、Agent 角色、提示词）

## 9. 已落到的计划（2026-10-18）

| 装配内容 | 计划 |
| --- | --- |
| Skill Pack、渐进披露、助理/Coding 共用目录 | [skill-packs](../../specs/skill-packs/spec.md) |
| Coding 侧的 LSP、钩子、评审、批准门、结构化输出、计划页 | [coding-plugin/next-requirements](../../specs/coding-plugin/next-requirements.md) §9 |
| 多代理评审、置信分、安全评审、有界迭代、对抗验证 | [coding-quality-assurance](../../specs/coding-quality-assurance/spec.md) |
| 工作记忆、每日例程、前门路由、从对话生成 Skill、跨源搜索 | [proactive-assistant](../../specs/proactive-assistant/spec.md) §5.7–5.11 |
| living page、一页式脉搏、使用回顾、交互式报告 | [work-brief](../../specs/work-brief/spec.md) §3.1–3.4 |
| 连接器类别占位符、未支持工具接入 | [assistant-service-connections](../../specs/assistant-service-connections/spec.md) §12 |
| 插件声明里的 Skill Pack、目录元数据、hooks、LSP | [plugin-platform-v2](../../specs/plugin-platform-v2/spec.md) 补充节 |
| 作者/评测/校验 | [ai-development-handbook](../../specs/ai-development-handbook/spec.md) §10 |
| 真人批准门 | [agent-approval](../../specs/agent-approval/spec.md) |
| 自动化建议 | [automation-recommender](../../specs/automation-recommender/spec.md) |
| 现代化工作流 | [code-modernization](../../specs/code-modernization/spec.md) |
