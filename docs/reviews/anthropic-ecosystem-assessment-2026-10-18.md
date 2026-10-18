# Anthropic 插件生态对照评估

状态：评估记录（2026-10-18，只读）。对照 Anthropic 的五个公开仓库，给出 Prologue、Molis Work 平台、Coding、个人助理的补充建议。本文不是实施 spec，也不改任何代码。

## 0. 结论

1. 最值得学的不是某个单点功能，而是**三层分发结构**：轻量内容包（skills / commands / agents）、声明式扩展（MCP / LSP / hooks）、受控运行时（安装、授权、评测）。
2. Prologue 的运行时底座比预想完整：hooks、skills/recipes、checkpoints/rewind、MCP、memory、subagents 都已经有。真正缺的是 **LSP**、**技能包的渐进披露**、**面向作者的测试与评测**，以及**把 hooks 产品化**。
3. Molis 的插件平台很重（manifest、runtime、actions、views、storage），适合 app 型插件，不适合角色包/技能包。补一个 **content-only 插件** 和**目录元数据**，是投入产出比最高的一步。
4. Coding 的差距集中在 **LSP 代码智能**、**多代理 PR 评审**、**GitHub/Issue 动线**、**非交互结构化输出**；前两项应优先。
5. 个人助理最值得补的是 **工作记忆初始化 + 每日/每周更新例程 + 自动化推荐**；这三件能把助理从“会聊天”变成“像同事”。
6. 明确不要照搬：自主 Agent 团队/派单、自动开 PR、自动写记忆、无界 hook 脚本、无审核的公共市场。

## 1. 看了什么

2026-10-18 浅克隆到 `/tmp/anthropic-eval/`，读的是代码、Manifest、Skill、Agent、Command、Hook、Marketplace 和 Action 配置，不只读 README。

| 仓库 | 本次 head | 内容 | 重点看了什么 |
| --- | --- | --- | --- |
| `anthropics/claude-code` | `dd6bee3` | 1,614 个文件；CLI 本体不开源，仓库含插件、mods、示例与更新日志 | 13 个插件、4 个 mods、`.claude/commands`、hook 配置、`mods/types` 的 typed hook API |
| `anthropics/claude-plugins-official` | `ea10b21` | 315 个市场条目；40 个内部插件目录、14 个外部插件目录 | marketplace schema、12 个 LSP 声明、code-review / pr-review-toolkit / security / modernization / project-artifact / session-report / plugin-dev |
| `anthropics/claude-plugins-community` | `06ec7b6` | 6 个社区插件；只读镜像 | 单 Skill 插件、`html-plan`、`next-steps` 的 function hook UI |
| `anthropics/knowledge-work-plugins` | `33eeda1` | 22 个带 manifest 的插件（17 个角色包 + 5 个 partner-built） | productivity、enterprise-search、data、engineering、cowork-plugin-management |
| `anthropics/claude-code-action` | `f27be6b` | 225 个文件 | 触发模式、结构化输出、进度跟踪、安全模型、PR 评审与 Issue 分诊方案 |

没有运行它们的代码，没有安装插件，没有接真实账号。数字是本次 clone 的快照。

## 2. 五个仓库的设计要点

### 2.1 claude-code

- 插件目录是 `commands/`、`agents/`、`skills/`、`hooks/`、`.mcp.json`、`.claude-plugin/plugin.json`。组件按目录自动发现。
- `mods/` 是更下一层的扩展：一个 `register(on)` 模块，用 typed hook API 拦引擎事件，带 tier / provenance（core、prepend、user、append），可以加 `$` 上的名词、画 UI pane、跑 headless 多 surface 测试。`mods/diff` 就是一个用 hook 画 `/diff` pane 的完整插件。
- `plugins/hookify` 把“写 hook”变成写 Markdown：`.claude/hookify.<name>.local.md`，frontmatter 写 event / conditions / action（warn 或 block），改完立刻生效，不用重启。
- `plugins/security-guidance` 是分层安全：写文件时的正则提醒、回合结束时的 LLM diff 评审、`git commit` / `git push` 时的 agentic 评审；后台评审用 `asyncRewake` 把发现送回会话。
- `plugins/ralph-loop` 用 Stop hook 做“同一句提示反复跑，直到完成承诺或次数上限”，是持久迭代模式。
- 更新日志里能看到更完整的产品面：LSP、worktree、checkpoint/rewind、agent teams/teammates、output styles、statusline、sandbox、remote control、后台会话、`claude plugin eval`、`claude plugin test`。

### 2.2 claude-plugins-official

- Marketplace 的条目不只是名字：`category`、`tags`、`keywords`、`displayName`、`homepage`、`author`、`version`、`strict`、`renames`，以及 `source` 的三种写法（本地目录、`git-subdir` 带 `ref` + `sha`、`url` 带 `sha`）。
- 顶层 `renames` 让插件改名后老安装还能迁移；插件 `name` 是不可变 slug，展示名走 `displayName`。
- 12 个 LSP 插件几乎只有 README + marketplace 里的 `lspServers`（`command`、`args`、`extensionToLanguage`），没有为每种语言写宿主代码。语言支持是**声明**，不是平台分支。
- 内部插件覆盖了几类高价值工作流：
  - `code-review`：先判断 PR 是否值得审，再读修改目录的 `CLAUDE.md`，5 个并行 Sonnet 评审（规范、明显 bug、git 历史、以前的 PR 评论、代码注释），每个问题再让独立 agent 打 0–100 置信分，低于 80 丢掉，最后用 `gh` 回帖。
  - `pr-review-toolkit`：6 个专科评审 agent（规范、简化、注释、测试、静默失败、类型设计）。
  - `claude-security`：扫描代码库/变更，每个 finding 由独立 verifier panel 挑战，只产出 patch 文件，不自动应用、不 commit、不 push。
  - `code-modernization`：12 个命令、8 个 agent，从评估、地图、业务规则、计划审批到升级/重写，带独立证明和实时进度 pane。
  - `project-artifact`：一个可分享的项目状态页，按 tab 组织；每次刷新重新取实时状态、部署到同一 URL、只报告 delta；页面里嵌 state block，供下次 diff。
  - `session-report` / `receipts`：从本地会话记录生成使用/影响报告；`receipts` 明确不编 dollar 数、把项目名当数据而不是指令。
  - `claude-code-setup`：只读扫描代码库，按 hooks / subagents / skills / MCP / commands 各推荐 1–2 个最值得的自动化。
  - `plugin-dev`：7 个作者技能（结构、hooks、MCP、settings、commands、agents、skills）+ 校验脚本 + 8 阶段 `create-plugin` 工作流。
  - `skill-creator`：访谈、起草、测试 prompt、eval viewer、迭代、description 优化；强调渐进披露、SKILL.md < 500 行、scripts/references/assets 分层。

### 2.3 claude-plugins-community

- 只读镜像，夜间从内部审核流水线同步；提交走表单，直接 PR 会被自动关闭。每个插件都过了自动安全扫描和人工批准。
- 6 个插件里有几个很能说明“轻量插件”的价值：
  - `html-plan`：把实施计划写成一张交互式 HTML，claim 树 + 每种 claim 一个 exhibit + 决策放在它影响的 claim 上，读者在一个页面里回答、评论，最后把一份 response 交回 agent。
  - `next-steps`：用 function hook 在输入框上方给 1–3 个下一步建议，按 1/2/3 填入草稿、按 0 忽略。
  - `eli5`：一个 SKILL.md 就把“用大图少字解释任何东西”做成可安装插件。

### 2.4 knowledge-work-plugins

- 22 个 manifest，内容全是 Markdown + JSON，没有代码、没有构建；插件就是“某个职能的做法 + 连接器 + 命令”。
- `.mcp.json` 预置 MCP server；`CONNECTORS.md` 用 `~~project tracker`、`~~chat`、`~~calendar` 这类**类别占位符**，让同一份内容适配不同厂商。
- `productivity`：
  - `TASKS.md` 是任务事实，`dashboard.html` 是它的视图，二者双向同步。
  - 两层记忆：`CLAUDE.md` 是 hot cache（约 50–80 行：我、人、术语、项目、偏好），`memory/` 是 cold storage（glossary、people、projects、context）。
  - `/start` 用用户真实的 todo 做访谈，逐条解码昵称、缩写、项目代号；`/update` 同步外部任务、挑过期项、补记忆缺口；`--comprehensive` 再扫聊天/邮件/日历，找漏掉的 todo。
- `enterprise-search`：把一个问题拆成每个来源的子查询，并行跑，去重，按相关度/新鲜度/权威性排序。
- `data`：SQL 方言、schema 发现、查询、校验、可视化、dashboard、可复用的 data context skill。
- `engineering`：standup、code review、debug、deploy checklist、incident response、architecture、system design、tech debt、testing strategy。

### 2.5 claude-code-action

- 两种模式：没有 `prompt` 时是交互模式（响应 `@claude`），有 `prompt` 时是自动化模式（直接跑）。`track_progress` 会创建并更新带 checkbox 的进度评论。
- `--json-schema` 让结果按 schema 校验，统一放在 `structured_output` 里，后续 step 用 `fromJSON(...)` 消费。这适合做 flaky test 判定、置信度门槛、发布说明、分诊。
- 安全模型很具体：
  - 只允许有写权限的人触发；bot 默认不能触发，`allowed_bots` 有明确警告。
  - PR 场景下先把 `.claude/`、`.mcp.json`、`CLAUDE.md`、`.husky/` 等配置从 base 分支恢复，PR head 的版本只放在 `.claude-pr/` 供参考，避免 PR 作者改配置提权。
  - 清洗 HTML 注释、不可见字符、图片 alt、隐藏属性、HTML 实体，降低 markdown 注入。
  - 默认不自动创建 PR：Claude 只推分支并给创建链接，人点。
  - token 只给当前仓库、短时；`show_full_output` 默认关；支持 commit signing。
- 方案库覆盖：自动 PR 评审、按路径评审、外部贡献者评审、自定义 checklist、定时维护、Issue 分诊打标、文档同步、安全评审。

## 3. 能力对照

| 能力 | Prologue 现状 | Molis Work 现状 | Anthropic 的做法 | 判断 |
| --- | --- | --- | --- | --- |
| Skill 包 | 有 body、parameters、tools 子集、inline/fork、recipe；body 是单段文本 | 插件 `agent.skills`、`methods`；创作台可生成 | SKILL.md + references/ + scripts/ + assets/，metadata → body → resources 三层加载，description 触发 | **补渐进披露与触发描述** |
| Hooks | 有完整 hook bus：tool-before/after/failed、session-start/end/stop、prompt-submit、compaction、subagent；支持 allow/ask/deny/rewrite/later、blocking、timeout、session 范围 | 插件 manifest 没有 hooks；Coding 用户钩子仍是 ✗（next-requirements B3） | hooks.json + command/prompt hooks + 用户 Markdown 规则 + 面板 | **不用重造，补产品化** |
| LSP | SDK 没有 LSP 模块 | Coding 没有代码智能（A4 ✗） | 12 个 LSP 插件，marketplace 里只声明 `lspServers` | **优先补** |
| Checkpoint / rewind | 有 | Coding 已接 | `/rewind`、文件回退 | 已覆盖 |
| Git worktree | 只有 workspace root 抽象，没有 worktree 原语 | Coding 有设计与部分接线 | `--worktree` + WorktreeCreate/Remove hooks | 补完即可，不必重做 |
| Subagent | 有 | 有 | agent 定义带 model、tools、color、触发示例 | 补描述触发/per-agent 模型即可 |
| Agent teams / teammates | 没有 | 没有，且产品原则不派单 | 长驻 teammate + SendMessage | **不照搬** |
| 插件目录/市场 | 不适用 | 本地注册表、插件创作台；没有分类目录与安装前详情 | 315 条、14 类、官方/社区分层、安装前展示组件 | **补目录与元数据** |
| 插件作者工具 | plugin-sdk、测试工具 | plugin-builder、molis-plugin-dev、plugin CLI | 7 个作者技能 + 校验器 + 8 阶段工作流 + eval | **补校验/eval** |
| 工作记忆 | 有 memory | 有 memory、候选、召回 | 两层记忆 + 启动访谈 + 每日补缺 | **补例程，不新增事实源** |
| 跨源搜索 | 不适用 | `search.query` 跨插件、按权限 | 拆子查询、并行、去重、排序 | **补规划层** |
| 任务 | 不适用 | Todo 插件 | TASKS.md + dashboard 视图 | **只学视图，不建第二事实源** |
| 状态页/简报 | 不适用 | Goals、Artifacts、Pages | project-artifact：tab、state block、delta、freshness | **补工作简报** |
| PR 评审 | 不适用 | diffs、review queue，没有多代理评审 | 5 并行评审 + 置信分 + 过滤 + inline comment | **补评审面板** |
| GitHub/Issue 自动化 | 不适用 | Coding D2 部分 | Action + 三条命令（commit-push-pr、triage、dedupe） | **补命令与 CI 模式** |
| 结构化输出 | 有 schema/动作合同 | 动作有 schema；Coding 非交互 JSON 未做（D1） | `--json-schema` + 单一 JSON 输出 | **补非交互入口** |
| 输出风格/状态栏 | 没有 | 工作台统一 UI | output styles、statusline、themes | 低优先 |
| Connector 抽象 | 不适用 | 服务连接 #661、官方集成 | `.mcp.json` + `~~category` 占位符 | **补类别占位符** |
| 使用报告 | 不适用 | 动作调用记录、会话 | receipts / session-report | 可选，注意隐私 |

## 4. 建议补的能力

### 4.1 Prologue

**R1. Skill 包支持渐进披露。**
现在 `SkillManifest.body` 是一段正文；Claude 的 Skill 是 `SKILL.md` + `references/` + `scripts/` + `assets/`，metadata 常驻、正文触发时加载、资源按需读。建议给 Skill 加 `description`（触发条件）、`resources`（只读引用）、`scripts`（可执行、仍受权限岛约束），正文保持有界。这样 Molis 才装得下工程方法、行业方法、角色包，而不是把整本手册塞进一次上下文。落点：`packages/plugin-sdk` 的技能登记、`packages/contracts` 的 Skill 合同、`skills/molis-plugin-dev` 的作者说明。

**R2. LSP 模块。**
Prologue 没有 LSP。建议新增语言服务器生命周期（按扩展名懒启动、初始化、didOpen/didChange、definition/references/hover/documentSymbol/workspaceSymbol/diagnostics、超时、LRU 文档、会话结束关闭），暴露一个只读“代码智能”工具。宿主只允许本机已安装的 server，缺了提示，不自动下载（对应 Coding Q5）。落点：Prologue SDK 新模块、Molis `apps/local-host` 的进程生命周期、Coding 的工具暴露。

**R3. Hook 事件补齐与作者 API。**
现有 hook 事件已经覆盖主链；可以补 `notification`、`permission-request`、`worktree-create/remove`、`prompt-change`，并把 hook 的注册、测试、日志做成作者可用的 API。不要新增一套与现有 hook bus 并行的机制。

**R4. 插件/技能评测。**
`skill-creator` 的 eval 循环值得借鉴：测试 prompt、跑 N 次、看方差、看触发率、看输出质量，再改 description/body。Prologue 有 testing API，Molis 有 studio replay，但作者侧还缺“我这个 Skill/插件到底好不好”的闭环。建议在 plugin CLI 加 `eval` 子命令，支持用例、禁用工具、评分与报告。

**R5. Agent 定义增强（可选）。**
Claude 的 agent 定义带 `description`（触发示例）、`tools`、`model`、`color`。Prologue 已有 tools/model 的一部分；建议补“什么时候该用这个 agent”的描述与自动选择，而不是补 agent teams。

### 4.2 Molis Work 平台

**R6. content-only 插件（技能包/角色包）。**
这是最重要的一条。现在 Molis 的插件需要 runtime 入口、actions、views、storage 或 routes；知识工作型内容（工程、产品、数据、销售、法务）根本不需要这些。建议新增一种 `kind: "content"`（或 content-only profile）：只允许 `skills`、`commands`、`agents`、`methods`、connector 类别声明，不允许写事实、不允许 UI、不允许 actions。安装后它的技能进入助理/Coding 的技能目录，卸载只删内容。这样第三方和内部都能低成本产出角色包，也不会破坏“事实一个主人”。

**R7. 插件目录与安装前详情。**
Marketplace 的元数据不只是好看：`category`、`tags`、`displayName`、`homepage`、`repository`、`license`、`icon`、`renames`、`source` 固定到 SHA、`strict`、`version`。建议 Molis 的本地插件市场补这些字段，并在安装前展示：命令、技能、agent、hooks、MCP/LSP、需要的权限、发布者与签名。Molis 已有签名和安装记录，这是自然延伸，不是新平台。来源固定到 SHA、官方/第三方分层、审核记录，都能直接借鉴。

**R8. 插件作者工具链与 eval。**
`plugin-dev` 的 7 个作者技能 + 校验脚本 + 8 阶段工作流，和 Molis 的 plugin-builder 是同一件事的两种做法。建议补：manifest 校验、hook schema 校验、agent/skill linter、打包前预览、`eval` 用例；并把“创建一个插件”做成和 `feature-dev` 一样的阶段化工作流。Molis 的创作台已经很强，缺的是作者侧的质量闭环。

**R9. Connector 类别占位符。**
让插件内容写 `~~project tracker`、`~~chat`、`~~calendar`，由宿主映射到用户实际连接的服务。这样角色包不需要为每个厂商复制一份，也不会把某个具体服务写死进内容。落点：`specs/assistant-service-connections`、connector 目录、插件 manifest 的 connector 声明。

**R10. 自动化推荐。**
`claude-code-setup` 的只读扫描很适合 Molis 的“项目到达/上手”：读项目类型、依赖、测试、CI、已有配置，按 hooks / skills / MCP / subagents / commands 各推荐 1–2 个，并说明证据。它可以是一个 Skill，不需要新服务；写入仍由用户确认。

### 4.3 Coding

**R11. LSP 代码智能（与 R2 同一条）。**
这是 Coding 最大的深度缺口。先支持 TypeScript/JavaScript、Python、Rust、Go；写后回传该文件新增的诊断；格式化放在审查之前，审查卡展示格式化后的最终内容；查定义/引用/实现/符号/调用链。验收就用 next-requirements A4 的“改一个被多处引用的函数名，靠查引用改全，诊断为零，`tsc` 通过”。

**R12. 多代理 PR 评审面板。**
把 `code-review` 的结构搬到 Coding：
1. 资格检查（closed/draft/trivial/已评审）。
2. 读根目录与修改目录的 `AGENTS.md`/项目规则。
3. 5 个并行评审：规范、明显 bug、git 历史、以前的 PR 评论、代码注释。
4. 每个问题独立置信评分 0–100，低于 80 丢掉。
5. 只对改动行给意见；能回 GitHub 就 inline comment，不能就进 review queue 卡片。
再加 `pr-review-toolkit` 的专科 reviewer（静默失败、测试、类型、注释、简化）作为可选面板。Molis 已有 diff、review queue、subagents，不需要新运行时。

**R13. GitHub / Issue 动线 + 结构化输出。**
三条命令值得直接做：`commit-push-pr`、`triage-issue`、`dedupe`。它们共同的特点是**工具白名单很窄、步骤写死、输出格式写死**。配合 Coding 的非交互模式（D1）与 `--json-schema` 等价物，就能做 CI 里的 flaky test 判定、发布说明、Issue 分诊。注意：默认不自动开 PR，只推分支给链接；token 只给当前仓库；PR 场景先从 base 分支恢复项目配置。

**R14. 安全评审工作流。**
`claude-security` 的“独立 verifier 挑战每个 finding、只出 patch、不自动应用”非常适合 Molis 的 review queue。可以先做一个 Coding 的“安全评审”动作：扫描当前 diff → 候选 finding → 独立 agent 复核 → 只把确认的写进 review 卡片 → 用户决定是否生成 patch。不要自动 commit/push。

**R15. 现代化/长期改造工作流（P2）。**
`code-modernization` 的“评估 → 地图 → 业务规则 → 计划审批 → 升级/重写 → 独立证明”适合大型重构，但它是重工作流，应该作为插件/场景包，而不是 Coding 核心。Molis 的 Goals + Coding + review queue 已经能承载，缺的是模板和阶段化 agent。

**R16. 计划即页面（可选）。**
`html-plan` 的 claim 树 + exhibit + 决策放在 claim 上，比长文计划更适合评审。Molis 有 Pages/Artifacts，可以把“实施计划”做成一个可交互页面，用户在里面勾选决策、评论，最后把一份 response 交回 Coding。它是体验差异化，不是基础能力。

### 4.4 个人助理

**R17. 工作记忆初始化 + 每日/每周更新。**
- `/start`：用用户真实的 Todo/项目做访谈，逐条解码人名、缩写、项目代号；写入 hot cache（谁、术语、项目、偏好）和 cold memory（glossary、people、projects、context）。
- `/update`：同步外部任务、挑过期/30 天未动/没有上下文的项、补记忆缺口；`--comprehensive` 再扫最近的聊天/邮件/日历，找漏掉的承诺。
- 关键约束：用 Molis 现有 memory 的候选 + 用户确认，不自动写；不建第二个任务库，Todo 仍是任务事实，dashboard 只是视图。

**R18. 角色/场景技能包。**
工程、产品、数据、销售、法务、财务、客服、运营，每个都是 content-only 插件，装到助理上就变成“这个角色的同事”。这和第 4.2 的 R6 是同一件事的两面：平台提供 content 类型，助理消费技能包。

**R19. 跨源搜索规划。**
Molis 的 `search.query` 已经跨插件、按权限返回；缺的是“规划层”：把问题拆成每个来源的子查询、并行跑、去重、按相关度/新鲜度/权威性排序，并保留每个结果的来源与时间。`enterprise-search` 的 `search-strategy`、`search`、`digest`、`knowledge-synthesis` 可以直接作为 Skill 模板。

**R20. 项目状态页 / 工作简报。**
`project-artifact` 的结构很适合 `specs/work-brief`：overview、workstreams、next steps、risks/open questions、decisions；每次刷新重新取实时状态、只报 delta、页面里嵌 state block；取不到的数据标 stale，不编。Molis 的数据源可以是 Goals、Coding、Todo、Feed、Schedule，页面落在 Pages/Artifacts。

**R21. 使用/影响报告（可选，注意隐私）。**
`receipts` / `session-report` 从本地会话记录生成“我做了什么、落在哪些项目、花了多少 token/cache、哪些 prompt 最贵”。Molis 有动作调用记录和会话，可以做“工作回顾”，但必须：只读本地、不编金额、不读其他工具的私有目录、默认只给本人看。它更适合 work-brief 而不是助理主界面。

## 5. 优先级

| 优先级 | 建议 | 为什么现在 | 依赖 | 体量 | 风险 |
| --- | --- | --- | --- | --- | --- |
| P0 | R6 content-only 插件 + R7 目录元数据 | 平台生态的杠杆最高；角色包/技能包是新增内容供给 | 合同变更、plugin-runtime、市场 UI | M–L | 中；必须守住“内容不写事实” |
| P0 | R2/R11 LSP | Coding 最大的能力缺口；已有 A4 需求 | Prologue 新模块、Coding 入口 | L | 中；进程生命周期、沙箱、只装本机 server |
| P0 | R12 PR 评审面板 | 直接提升 Coding 质量；复用 diff/review queue/subagents | Coding 动作与视图 | M | 中；成本、误报、只评改动行 |
| P0 | R17 工作记忆 + 每日更新 | 助理从被动变主动；复用 memory/Todo/schedule | 助理 Skill、memory 候选 | M | 低–中；不要自动写 |
| P0 | R3/R4 hooks 产品化 + eval | Prologue 已有 hook bus，补用户可用的一层 | 插件 manifest、UI、沙箱 | M | 中；hook 是安全边界 |
| P1 | R13 GitHub/Issue + 结构化输出 | Coding D1/D2 的直接落地 | 非交互模式、权限、token | M–L | 中；默认不自动开 PR |
| P1 | R14 安全评审 | 与 review queue 天然契合 | 专科 agents、diff | M | 低–中；只出 patch |
| P1 | R19 跨源搜索规划 | 助理/搜索的高频价值 | `search.query` | S–M | 低 |
| P1 | R20 状态页/简报 | work-brief 的具体形态 | Goals/Coding/Todo 数据、Pages | M | 低–中；取不到要标 stale |
| P1 | R8 作者工具链/eval | 插件质量与市场审核的前提 | plugin CLI、plugin-builder | M | 低 |
| P2 | R15 现代化工作流 | 大型重构场景，非日常 | Coding 工作流 | L | 中 |
| P2 | R16 计划即页面 | 体验差异化 | Pages/Artifacts | M | 低 |
| P2 | R21 使用报告 | work-brief 的补充 | 会话/动作记录 | S–M | 中；隐私 |
| P2 | R5 agent 定义增强 | 提升子代理选择质量 | Prologue agent 定义 | S | 低 |
| P2 | R18 角色包内容 | 依赖 R6 | 内容生产 | M | 低 |

## 6. 不建议照搬

1. **自主 Agent 团队 / 自动派单。** Claude Code 的 teammates 和 background sessions 很强，但 Molis 的产品原则是 pull-based、不派单、人决定。可以保留显式子代理与任务板，不要做“自己找活干”的团队。
2. **自动创建 PR。** Claude Code Action 默认只推分支、给人链接；这个边界值得保留。Molis 的 review queue 更是如此。
3. **自动写记忆。** Claude 的 auto-memory 很方便，但 Molis 已经定了“候选 + 用户确认”。不要为了省一步破坏这个决定。
4. **无界 hook 脚本。** Hook 能拦工具调用，也能跑任意命令；必须有沙箱、超时、失败即挡、审计记录、来源与 tier。不要做一个“什么都能跑”的开放 hook 市场。
5. **无审核的公共市场。** Anthropic 的官方市场有审核、社区市场有自动扫描 + 批准、外部插件有明确警告。Molis 已有签名与安装记录，应该做“受控目录”，而不是“任意 URL 安装”。
6. **读其他工具的私有会话。** `receipts` 读 `~/.claude/projects` 是因为它就是 Claude Code；Molis 不应该去读别人的私有目录来生成报告。
7. **把 TASKS.md / CLAUDE.md 变成第二事实源。** 学它们的“视图”和“例程”，不要学“再建一个任务库/记忆库”。

## 7. 下一步建议

1. **写一份 content-only 插件 + 目录元数据的 spec**（合同变化，按 `docs/system/CONTRACT-CHANGES.md` 升版），先用一个工程角色包做样板，验证“安装 → 技能出现在助理/Coding → 卸载只删内容”。
2. **在 Prologue 开 LSP 模块的 spike**：TypeScript server 先行，Coding A4 接上，验收用“改名改全、诊断为零”。
3. **在 Coding 做一个 PR 评审面板的离线原型**：复用现有 subagents + review queue + diff，不新增运行时；先用一个种子 bug 和一个已知误报验收。
4. **在助理做一个 `/start` + `/update` 的 Skill 原型**：只读 + 候选写入，先在隔离 Home 跑，不碰真实 Home。
5. **把 hook 规则文件做成一个小实验**：`.molis/hooks/*.md`，支持 warn/block、立即生效、面板启停；先做“写 `.ts` 后跑 lint”和“阻止 `.env` 写入”两条。

## 8. 覆盖复核（2026-10-18）

把本文的建议逐条对到现行的 spec、`coding-plugin/next-requirements.md`、在途分支与 BACKLOG，看哪些已经有人做、哪些只差一片、哪些是真的新线。

| 建议 | 对应线 / 需求 | 状态 | 缺口 |
| --- | --- | --- | --- |
| Skill 渐进披露 + 描述触发 | Prologue `dist/skill`；`specs/ai-development-handbook`；`skills/molis-plugin-dev` | **部分覆盖** | 运行时只有单段 body；没有 `references/`、`scripts/`、`assets/` 与触发描述 |
| LSP | `specs/coding-plugin/next-requirements.md` A4（✗，等 Q5） | **已排期，未开工** | 没有 Prologue LSP 模块，也没有声明式 `lspServers` |
| Hooks 产品化 | Prologue `dist/hooks`；Coding B3（✗，等 Q3）；W5-13 日志 | **部分覆盖** | 运行时已有 hook bus；插件 manifest、规则文件、面板、沙箱都还没有 |
| 插件/技能评测 | `specs/ai-development-handbook`；`pnpm studio:replay`；现有测试 | **部分覆盖** | 没有作者侧的 `eval` 用例、方差、触发率、评分闭环 |
| Agent 定义增强 | Prologue `dist/agent`、`dist/character`；`specs/subagent-interaction` | **部分覆盖** | 有 tools/model；没有 Claude 那种触发描述/自动选择说明 |
| content-only 插件 | `specs/plugin-platform-v2`、`docs/system/THIRD-PARTY-PLUGINS.md`、plugin-builder | **未覆盖** | 现有 `PluginKind` 只有 native / integration / app，所有插件都要入口、动作或 UI |
| 插件目录/元数据 | `specs/plugin-platform-v2`；BL-058（市场只列本地注册表）；plugin-builder | **部分覆盖** | 有安装、签名、授权；没有 category、tags、displayName、homepage、renames、安装前详情 |
| 作者工具链 | plugin-builder、`skills/molis-plugin-dev`、`tooling/plugin-cli` | **部分覆盖** | 有创建/校验；没有 hook schema 校验、agent/skill linter、通用 eval、跨 surface UI 测试 |
| Connector 类别占位符 | `specs/assistant-service-connections`（#661）；官方集成 | **部分覆盖** | 有真实连接；没有 `~~project tracker` 这类内容层占位符与映射 |
| 自动化推荐 | 项目到达/引导（BL-106、BL-107）；没有独立需求 | **未覆盖** | 没有“读项目 → 推荐 hooks/skills/MCP/subagents”的只读流程 |
| LSP（Coding 侧） | 同上 A4 | **已排期，未开工** | 与上条同 |
| 多代理 PR 评审 | `specs/coding-quality-assurance`（已定方向，防腐后做）；review queue、diff、subagents | **部分覆盖** | 有自检/交叉/对抗评审方向；没有 PR 资格检查、置信分、inline comment、专科 reviewer |
| GitHub/Issue + 结构化输出 | Coding D1（✗）、D2（◐）；`coding-harness-optimization` R10 | **部分覆盖/已排期** | 没有 commit-push-PR、triage、dedupe 三条命令；没有非交互 JSON 入口 |
| 安全评审 | `specs/coding-quality-assurance`；`SECURITY-INVARIANTS.md` | **部分覆盖** | 有安全不变量与拒绝测试；没有扫描 → verifier → patch 的评审工作流 |
| 现代化/长期改造 | 无 | **未覆盖** | 没有评估/地图/业务规则/计划/证明的阶段化模板 |
| 计划即页面 | Pages、Artifacts、Goals；`html-plan` 只是参照 | **未覆盖** | 能力能承载，但没有 claim 树 + exhibit + 决策的页面模板 |
| 工作记忆 + 每日更新 | `specs/proactive-assistant` §3、§9；memory、schedule；`specs/work-brief` | **部分覆盖** | 有工作理解和周期报告；没有 `/start` 式访谈、hot cache/cold memory、每日补缺例程 |
| 角色/场景技能包 | `specs/proactive-assistant` §5.3（初始场景 Skill）；插件平台 | **部分覆盖** | 有初始 Skill 方向；没有可安装的角色包与内容分发 |
| 跨源搜索规划 | `horizontal/search` 的 `search.query`；`specs/archive/system-search` | **部分覆盖** | 有跨插件聚合与权限；没有拆子查询、并行、去重、排序的规划层 |
| 状态页/工作简报 | `specs/work-brief`（WBR-01–09）；proactive-assistant §9 | **部分覆盖** | 有内容归属、版本、来源；没有 living page、state block、只报 delta |
| 使用/影响报告 | proactive-assistant §9.2（报告质量）；动作调用记录 | **部分覆盖** | 有周期报告；没有 token/cache/subagent/昂贵 prompt 的会话报告 |
| 输出风格/状态栏 | Coding E3（✗）；`font-and-skin-system`；`visual-ui-experience` | **已排期/部分覆盖** | 主题与字体有独立线；输出风格、状态栏还没有 |
| 主题/字体 | `specs/font-and-skin-system`（实现方案已写） | **已覆盖（规划中）** | 等实现 |
| 语音输入 | `specs/unified-input-voice`；#631 草稿 | **进行中** | — |
| 下一步建议 | `specs/context-program` W3-A1/A2；已合 #536 等 | **已覆盖/进行中** | — |
| 输入回执 | `specs/ai-input-receipts`；#713、#714 | **进行中** | — |
| 问卷/操作卡 | `specs/ai-interaction-experience`；#708 等 | **进行中** | — |
| 工作树 | `specs/coding-plugin/spec.md` 的独立工作树；`coding-harness-optimization` R6 | **部分覆盖** | 设计有，落地程度要核对；没有 WorktreeCreate/Remove 钩子 |
| checkpoint/rewind | 已在 main（Coding） | **已实现** | — |
| 子代理 | 已在 main；`specs/subagent-interaction` 补 UI | **已实现/规划 UI** | — |
| 图片输入/联网/沙盒/分叉/导出/长期记忆/旁问/多模型/编辑器/导入 | Coding A3、B1、B2、C1–C5、E1、E4、E5 | **已排期** | 等 Q1–Q8 拍板 |
| plan mode | Prologue `AgentMode`；Coding 计划 | **已实现** | — |
| Agent teams | 无；产品原则不派单 | **明确不做** | — |

覆盖率概括：**完全没有对应线的只有 4 条**（content-only 插件、自动化推荐、现代化、计划即页面）；工作记忆例程算部分覆盖（有工作理解与周期报告，没有访谈/热缓存/每日补缺）。**大量条目是“已排期/部分覆盖”**，缺的不是方向，而是产品化的最后一层。最容易被误判为“新功能”的 LSP、hooks、slash commands、GitHub、结构化输出，其实都已经在 Coding 的 next-requirements 里，只是等 Q1–Q8 或排期。

## 9. 复查补充：评估里漏掉的模式

回仓库补读了 `claude-code` 的 `plugins/`、`examples/`、`mods/`，`claude-plugins-official` 的剩余插件，`claude-plugins-community` 的 6 个插件，`knowledge-work-plugins` 的角色包与 `cowork-plugin-management`，以及 `claude-code-action` 的 `agent-approval-check`、`action.yml` 和剩余文档。以下是上一版没有写进去、但值得单独列出的：

**N1. Agent 产出的 PR 需要真人批准（`agent-approval-check`）。**
它扫描 PR 的 commit、author、review，识别 agent 身份；只数有写权限的人的最新 `APPROVED` review 和 `/approve <head-sha>` 评论；达到 N 个才给 `agent-approval-check` 绿色状态；push 后旧 SHA 的批准作废；`exempt_head_branches` 明确警告分支名是攻击者可控的。这个模式非常贴合 Molis 的“人决定”原则，也比 review queue 更适合团队/CI 场景。建议做成 Coding 的可选 GitHub 检查，而不是让 agent 自己批准。

**N2. 把“我常做的一件事”变成 Skill（`small-business/build-agent`）。**
流程是：看用户做一遍或听描述 → 区分固定步骤/可变参数/需要判断的点 → 把判断点做成 approval gate → 写 `SKILL.md`（带 fallback、不编数字）→ 用用户已知答案的真实案例回放 → 注册到 router → 需要时排期。它解决的是“插件不可能预装每个行业的流程”这个问题，和 Molis 的 plugin-builder、proactive-assistant 的 Skill 配置正好互补。建议作为“从这次对话生成 Skill”的入口，而不是只让用户手写。

**N3. 一页式业务脉搏（`small-business/business-pulse`、`sales/daily-briefing`）。**
并行拉所有可用连接器，算出红/黄/绿，风险项必须带具体记录、金额/天数与下一步；某个连接器失败就标 n/a 并继续；全都没连时让用户口述几个数字，标“owner-supplied, not pulled”。这正是 Molis 工作简报/项目首页可以用的具体结构，比“生成一份周报”更可操作。

**N4. 插件定制，而不只是新建（`cowork-plugin-management/cowork-plugin-customizer`）。**
它先找 `~~` 占位符，区分“通用模板第一次配置”和“只改某一段”，用知识 MCP 查公司实际工具/流程，替换占位符、更新 URL/配置、连接 MCP，最后打包 `.plugin`。Molis 的 plugin-builder 目前更像“从零生成”，缺“把一份通用角色包改成我们公司的”这条路径。它和 N3 的 `~~` 占位符是同一套东西。

**N5. 前门路由（`small-business/smb-router`）。**
一个不自己干活的 Skill：读业务上下文，把模糊请求匹配到**单一最佳**专业 Skill，解释为什么，确认后再触发。Molis 的 proactive-assistant 有 Skill 选择，但没有一个“我不知道该用哪个，你替我选”的前门。对角色包/技能包多起来之后，这个入口会很重要。

**N6. 组织级策略与托管设置（`examples/settings`、`examples/mdm`、`mods/sec-default`）。**
Claude Code 有 managed settings / MDM 模板、`allowManagedHooksOnly`、`allowManagedPermissionRulesOnly`、`strictKnownMarketplaces`、HIPAA/lax/strict 三档；`sec-default` 把组织策略放在最外层，用户装的插件碰不到。Molis 是本地优先，但团队/企业部署迟早需要“这台机器由谁管、哪些插件/钩子/权限不能被个人覆盖”。这不是当前 P0，但应该进 C 端/团队就绪的清单。

**N7. 评审评论的“产线化”细节（`claude-code-action`）。**
- `classify_inline_comments`：未确认的 inline comment 先缓冲，结束后用 Haiku 分成“真评审”与“测试/探测”，防止子代理的测试评论发到 PR。
- `include_fix_links`：每条评审意见带一个 “Fix this” 链接，点开带着上下文进入修复。
- `use_sticky_comment` / `track_progress`：一条评论持续更新进度，不发多条。
- `use_commit_signing` / `ssh_signing_key`：agent 提交可签名、可归属。
- PR 场景先从 base 分支恢复 `.claude/`、`.mcp.json`、`CLAUDE.md`，并清洗 HTML 注释/不可见字符/alt/实体。
这些是 R12/R13 的具体交互与安全细节，上一版只写了“多代理评审”，没写“怎么把评论安全地发出去”。

**N8. 有界迭代与对抗验证（`ralph-loop`、`math-proof`、`code-simplifier`）。**
- `ralph-loop` 用 Stop hook 反复跑同一句提示，直到完成承诺或次数上限；适合“修到测试全绿”，但必须是有界、可取消、有明确完成条件。
- `math-proof:siege` 是 judge + fresh workers + ledger + 两个 verifier 逐行核对；这是比“再找一个 agent 看一眼”更硬的对抗验证协议，可用于高风险评审/研究。
- `code-simplifier` 是专门的“简化但不改行为”评审角色，适合进 PR 评审面板。

**N9. 交互式页面（`html-plan`、`playground`）。**
`html-plan` 是 claim 树 + exhibit + 决策；`playground` 是控件 + 实时预览 + 可复制 prompt。两者都能落在 Molis 的 Pages/Artifacts 上，作为“计划评审”和“方案探索”的页面形态，而不是聊天里的长文。上一版只提了 html-plan，漏了 playground 这个更通用的“可视化探索”模板。

**N10. 设计/无障碍内容包（`knowledge-work-plugins/design`、`claude-code/frontend-design`）。**
design 角色包有 accessibility-review（WCAG 2.1 AA 清单）、design-critique（可用性/层级/一致性）、design-handoff、design-system、ux-copy；frontend-design 有“避免通用 AI 审美”的审美方向。Molis 有 `DESIGN.md` 和视觉线，但没有一个助理/评审用的设计审查 Skill。它可以是一个 content-only 角色包，不需要新平台能力。

**N11. MCP 服务端作者工具（`mcp-server-dev`、`mcp-tunnels`）。**
`mcp-server-dev` 从用例问到部署形态（remote HTTP / MCP app / MCPB / local stdio），再给 auth、tool description、widget、manifest、安全加固的参考；`mcp-tunnels` 是私有网络里的 MCP 隧道。Molis 有 connector 平台和 service connections，但“给一个没有官方连接器的系统写 MCP server”的作者路径还没有。可作为 P2 的工具链。

**N12. 作者侧 SDK 体验（`agent-sdk-dev`、`plugin-dev` 的校验器、`claude-md-management`）。**
`agent-sdk-dev` 有 `/new-sdk-app` + Python/TS verifier；`plugin-dev` 有 `validate-agent.sh`、`validate-hook-schema.sh`、`hook-linter.sh`、`test-hook.sh`；`claude-md-management` 有 CLAUDE.md 质量审计、模板、更新规则。Molis 的 plugin CLI 有 validate/pack/sign/verify，但还缺“生成后自动校验 + 质量审计 + 项目记忆改进”的闭环。

## 10. 修订后的优先级

P0 不变：content-only 插件 + 目录元数据、LSP、PR 评审面板、工作记忆/每日更新、hooks 产品化。

P1 新增：
- **Agent 产出 PR 的真人批准门**（N1）——与“人决定”一致，团队场景刚需。
- **从一次对话生成 Skill**（N2）——插件生态的内容供给入口。
- **插件定制 + `~~` 占位符**（N4）——角色包真正落地的前提。
- **一页式脉搏/工作简报**（N3）——work-brief 的具体形态。

P2 新增：
- **前门路由**（N5）
- **组织级策略/MDM**（N6）
- **评审评论产线化**（N7）
- **有界迭代/对抗验证/简化评审**（N8）
- **交互式计划/探索页面**（N9）
- **设计/无障碍内容包**（N10）
- **MCP 服务端作者工具**（N11）
- **作者侧 SDK 校验闭环**（N12）

## 11. 证据索引

- `claude-code`
  - `plugins/code-review/commands/code-review.md`
  - `plugins/pr-review-toolkit/agents/`
  - `plugins/hookify/core/config_loader.py`、`hooks/hooks.json`
  - `plugins/security-guidance/hooks/hooks.json`、`README.md`
  - `plugins/feature-dev/commands/feature-dev.md`、`agents/`
  - `mods/README.md`、`mods/types/claude-code.d.ts`、`mods/diff/hooks/register.ts`
  - `.claude/commands/commit-push-pr.md`、`triage-issue.md`、`dedupe.md`
- `claude-plugins-official`
  - `.claude-plugin/marketplace.json`
  - `plugins/typescript-lsp/README.md` 与 marketplace 的 `lspServers`
  - `plugins/code-review/`、`plugins/pr-review-toolkit/`
  - `plugins/claude-security/skills/claude-security/SKILL.md`、`agents/`
  - `plugins/code-modernization/commands/`、`agents/`、`hooks/`
  - `plugins/project-artifact/skills/project-artifact/SKILL.md`
  - `plugins/session-report/skills/session-report/SKILL.md`
  - `plugins/receipts/skills/receipts/SKILL.md`
  - `plugins/claude-code-setup/skills/claude-automation-recommender/SKILL.md`
  - `plugins/plugin-dev/skills/`、`plugins/skill-creator/skills/skill-creator/SKILL.md`
- `claude-plugins-community`
  - `html-plan/skills/html-plan/SKILL.md`
  - `next-steps/hooks/register.tsx`、`.claude-plugin/plugin.json`
  - `README.md`
- `knowledge-work-plugins`
  - `productivity/skills/start/SKILL.md`、`update/SKILL.md`、`memory-management/SKILL.md`、`task-management/SKILL.md`
  - `enterprise-search/skills/search/SKILL.md`
  - `data/skills/write-query/SKILL.md`
  - `engineering/skills/code-review/SKILL.md`
  - `productivity/.mcp.json`、`CONNECTORS.md`
- `claude-code-action`
  - `README.md`、`docs/usage.md`、`docs/solutions.md`、`docs/security.md`、`docs/custom-automations.md`
  - `action.yml`
- 本地对照
  - `vendor/prologue-sdk`（解包后 `dist/hooks`、`dist/skill`、`dist/host/core/contract.d.ts`）
  - `packages/contracts/src/platform/plugin.ts`
  - `specs/coding-plugin/next-requirements.md` A2/A4/B3/D1/D2/E3
  - `specs/prologue-adoption/spec.md`、`specs/assistant-service-connections/spec.md`、`specs/proactive-assistant/spec.md`、`specs/work-brief/spec.md`

## 12. 落地映射（2026-10-18）

本轮已把建议落到以下计划；未落成 spec 的 P2 项在 `specs/BACKLOG.md` 留行。

| 建议 | 落到哪里 | 状态 |
| --- | --- | --- |
| Skill Pack / content-only / 渐进披露 / 助理与 Coding 共用目录 | 新 spec [skill-packs](../../specs/skill-packs/spec.md) | 需求已整理，未实现 |
| Agent 产出 PR 的真人批准门 | 新 spec [agent-approval](../../specs/agent-approval/spec.md) | 需求已整理，未实现 |
| 项目自动化建议 | 新 spec [automation-recommender](../../specs/automation-recommender/spec.md) | 需求已整理，未实现 |
| 代码现代化工作流 | 新 spec [code-modernization](../../specs/code-modernization/spec.md) | 需求已整理，未实现 |
| LSP 声明、钩子规则、多代理评审、批准门、结构化输出、有界迭代、计划页 | [coding-plugin/next-requirements](../../specs/coding-plugin/next-requirements.md) §9 | 已补充到 Coding 下一阶段 |
| 自检/交叉评审/对抗评审、置信分、专科评审、安全评审、批准门、有界迭代 | [coding-quality-assurance](../../specs/coding-quality-assurance/spec.md) | 已补充方案 |
| 工作记忆、每日例程、前门路由、从对话生成 Skill、跨源搜索规划 | [proactive-assistant](../../specs/proactive-assistant/spec.md) §5.7–5.11、PWA-96–110 | 已补充方案 |
| living page、一页式脉搏、使用回顾、交互式报告页 | [work-brief](../../specs/work-brief/spec.md) §3.1–3.4、WBR-10–16 | 已补充方案 |
| 连接器类别占位符、未支持工具接入路径 | [assistant-service-connections](../../specs/assistant-service-connections/spec.md) §12、ASC-38–44 | 已补充方案 |
| Skill Pack、目录元数据、hooks、LSP 声明 | [plugin-platform-v2](../../specs/plugin-platform-v2/spec.md) 补充节、PLP-01–08 | 现行规范已补充 |
| 技能包作者/评测/校验 | [ai-development-handbook](../../specs/ai-development-handbook/spec.md) §10、ADH-19–23 | 已补充方案 |
| 设计/无障碍内容包、技能包定制、插件目录审核、托管策略、Telemetry、MCP 作者工具 | [BACKLOG](../../specs/BACKLOG.md) BL-165–170 | 待排期 |
| 评估、遗漏与优先级本身 | 本文 §1–§10；装配细节见 [能力装配笔记](anthropic-capability-assembly-2026-10-18.md) | 记录 |
