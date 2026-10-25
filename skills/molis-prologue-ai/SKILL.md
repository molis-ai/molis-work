---
name: molis-prologue-ai
description: How to add or change an AI capability in Molis Work — anything that calls a model (text, structured output, images, TypeSafe judgments) or runs an Agent (tools, workspace, review) — through the Home's Prologue Runtime, and how to design what the model is given (prompts, methods/Skills, context, tool descriptions) and prove it works on real tasks. Use when a change touches model calls, prompts, Agent roles or runs, methods, the materials a model reads, tool descriptions, model settings or credentials, AI budgets or usage, review of Agent side effects, or code in horizontal/agent-host, or when AI behaviour falls short. Not needed for plugin work that never calls a model.
---

# Molis Work 里的 AI 能力怎么做

架构与示例在仓库手册 [`docs/platform/PROLOGUE-AI.md`](../../docs/platform/PROLOGUE-AI.md)（只在源码仓库里，不随安装包发布）：第一部分（第 1–11 节）是接入合同，第二部分（第 12–17 节）是 AI 行为设计与质量。本文是执行清单，单独也够用。插件本身怎么写仍按 [`molis-plugin-dev`](../molis-plugin-dev/SKILL.md)。

生成插件沙箱使用 [generated-ai.md](../molis-plugin-dev/generated-ai.md)：通过 `model.generate` 进入同一 Home Runtime；创作台设计与代码阶段都直接挂载该章。不要给沙箱套 Native 的 `caller.beforeEffect()` 接口。

## 什么时候读

- 动作或页面要调模型、生成图片、做 TypeSafe 判断。
- 插件要跑 Agent（Manifest 的 `agent` 块、角色、提示词、宿主工具、动作工具）。
- 改模型设置、凭据解析、预算、用量、审查队列，或 `horizontal/agent-host` 的任何代码。
- 写或改提示词、角色、方法（Skill）、给模型的材料、工具描述，或 AI 的表现不如预期。

纯界面、纯存储、不碰模型的插件功能不用读。

## 先读

1. 手册第 1–3 节（分工与调用链）；要写提示词、方法、材料或工具时再读第 12–16 节。
2. `specs/action-architecture/spec.md` §3「基本合同」与 F1–F4（身份、副作用前检查、预算、交接）。
3. 你要仿照的现有实现：单次调用看灵光对话（`plugins/native/lingguang/src/actions.ts` + `plugins/native/lingguang/src/plugin.ts`）；Agent 看 Schedule（`plugins/native/schedule/src/roles.ts` + `plugins/native/schedule/src/runtime-wakeups.ts`），复杂的再看 Coding。

## 判断放在哪

| 这段逻辑是… | 放在 |
| --- | --- |
| 提示词正文、选哪些材料、结果怎么写回、失败保留什么 | 业务插件 / 模块 |
| 模型选择、凭据、身份、授权、调用记录 | Local Host |
| 推理、Agent 轮次、角色冻结、审查、预算、MCP、任务板 | `horizontal/agent-host` |
| 与业务无关、多个产品都需要、契约稳定 | 下沉 Prologue（先和 SDK 负责人确认，改 vendored 包按 `vendor/prologue-sdk/README.md`） |

## 交给 AI 的那部分怎样设计（context over control）

先把目标、事实、能力和反馈给够，让模型在授权范围内自己判断；只有真实的确定性约束才写成代码。细则、正反案例与源码索引在手册第 12–16 节，这里只列动手时对照的几条：

- **先分清谁管什么**：理解与选择归模型；做法归方法（Skill）；这一次的事实归材料；发生了什么归工具回执；身份、权限、版本、幂等、取消、预算、恢复归代码（手册 12.1）。固定步骤只给出错代价高、又能事先写清的部分（12.3）。
- **每样东西放在它的层里**：产品约束放 base 层，角色目的放角色提示词，有界调用的要求放登记的指令，会变的事实放每一轮的材料，用户这一次的话不由插件代写；同一条规则只写一层（13.1）。机器要读的输出写清形状并由代码校验，给人看的回复不套固定标题和条数。
- **规则要有来由**：每句话给出一个事实或一个理由；说不出理由的「不要」，要么交给代码，要么删掉（13.1、15.6）。不为一次交付加关键词路由、固定子任务数、固定轮数判完成，也不在每次失败后追加一条禁令。
- **方法（Skill）**：摘要说清适合什么，正文写做法、判断线索、资料、工具用法和什么算好；必须的过程写出理由；正文改了发新版本；方法不放大工具权限（13.2）。
- **上下文**：给来源、版本和状态；按需取用，不预载；省略了要说出来；压缩、交接和中途补充复用已有机制（13.3）。
- **工具**：描述写清用途、影响和常见失败；回执说真实状态和下一步，「成功」不只是收下请求；不可用要给原因和去处（13.4）。
- **照着基础实现写**：手册第 14 节列了经源码核对的参考和证据等级；需求里的设计（场景 Skill、工作简报、子代理交互）还没实现，不当成现成代码。
- **用真实任务证明**：用例证明机制，替身不证明 AI 理解了场景；改了提示词或方法，按手册 16.3 做前后对比并写清证据等级；表现不好先按 16.4 看它当时实际拿到了什么，再决定补上下文、改工具、调提示还是修运行时。

## 步骤

原图输入使用共享 `hostTextGeneration` 的 `images: [{ root_path, relative_path, label? }]`：路径须由可信 Host 从已授权材料解析，不能从模型或请求 JSON 直接授权。模型目录须声明 `vision: true`，环境变量配置的模型（只给开发与测试）不推定视觉能力、不自动换模型。Agent Host 复用 SDK Node Host intake/Session attachments，真实格式限 PNG/JPEG/GIF/WebP，单图 32 MiB、每次 50 张/128 MiB，并受共享资源限额约束；超限拒绝、不静默截断或替换为 OCR。成功/失败/取消撤销资源及 Host 暂存字节，关闭 owner 等清理；原 Action 的 signal/beforeEffect、模型快照和业务提交检查仍须保留。PDF/目录组织和领域结果由消费者负责，不把 SDK 已支持当成插件已迁移。

1. **选用法**（手册第 2 节）：单次有界调用 → Host 端口；多轮带工具 → Agent 角色；专门编排 → 新适配器。不要为统一而套 Agent 循环。
2. **定义动作**：权限写 `model:invoke`；等模型的动作写 `scheduling: "concurrent"`；`effect` 与真实效果一致（名字里有 delete/remove/trash 会被推断为不可撤销，不对就用 `withActionEffect` 显式声明）。
3. **处理器**：读快照 → 把 `caller.signal` 传给模型 → 返回后 `await caller.beforeEffect()` → 按快照/版本提交；嵌套动作/场景用 `retainActionAuthority(caller, originReference, caller.beforeEffect)` 保留外层执行检查；空结果、超时、错误都不制造成功结果，输入保留。
4. **Host 装配**：Runtime 插件由宿主给 `services`（含 `services.model`，见下）；仍在构建期装配的旧插件只注入函数端口（`completeText`、`modelAvailability`），随 W5-11 删。未配置时 `actions.connection_required`。插件不拿密钥、不依赖 `@prologue/sdk`。
   宿主自己运行的 Home 与项目 Runtime 插件（非沙箱、有 Home）共用这条模型/指令入口，不写第二层绑定：Manifest 声明 `model:invoke`（只列模型、问能不能用的声明只读的 `model:read`，它发不出请求），用 `context.services.model.complete(instructed(自己的指令, 数据), { selection?, system?, output?, timeout_ms?, max_output_tokens? })`。只在自己的、声明了 `model:invoke` 且 `scheduling: "concurrent"` 的动作处理器里能调，其余位置 `plugin.model_*` 拒绝；发出前、返回后宿主各问一次这次调用的 `beforeEffect()`，动作返回之后再调是 `actions.expired`；限额默认 120 秒 / 5000 token，至多 600 秒 / 12000（`PLUGIN_MODEL_LIMITS`）；指令是本插件自己的，没有目录条目时在 `PluginDefinition.instructions` 登记。写入前插件仍要自己 `await caller.beforeEffect()`，按读取时的版本提交。不向 Prologue 传调用编号。手册第 4 节有写法和错误码。
   宿主自己的代码需要执行引用、结构化结果、进度或用量时使用同一绑定的 `hostTextGeneration`（Host 侧函数，插件内不直接调；Runtime 插件用上一段的 `services.model.complete`，JSON 的业务校验留在插件），不要再组模型/凭据或轮询 Run。`structured` 显式指定 local/native 与可支持 schema，未知约束拒绝而不忽略；领域 parse 留在插件。仅需要 JSON 格式解码时 Host 使用 Agent Host 公开的 `decodePrologueJsonOutput`（SDK 所有），围栏容忍显式启用；插件消费 JSON 值并验证业务含义，不能各自复制 JSON/围栏解析。`onProgress` 只表示过程，不授权业务提交。完整用量保留 reported/estimated/unknown，未知不当零；未报实际模型不填请求模型。默认不自动纠正格式，允许额外调用必须有界且重新预算/授权。
   `selection: { provider_id, model_id }` 指向 Home 已配置的模型，`availability(selection)` 查询同一个目标；不指定才用默认。明确选择不可用就拒绝，不换成别的供应商或环境模型。Runtime 在首次等待前复制选择，模型调用仍复用 Host 的配置/连接复核；不把地址或凭据给插件。

   Coding 的提交说明/接续摘要用 `CODING_INSTRUCTIONS` 登记，短草稿只传 `prompt` id 与独立 `material`（请求里没有 `instructions` 字段），Host 只从原 invocation 取插件身份并解析用户覆盖。调用走 `agent.draft-text.v1`（宿主的动作，只给持有 `model:invoke` 的插件，经 `services.actions.invoke` 调；人、Agent、工作流、MCP 都够不到，PG-035）→ `model-draft.ts` → 共享 inference，无临时 Runtime/目录；Cognia 经 Home Runtime 的 `services.model` 复用同一个 Host 推理服务，Alchemist 复用 `hostTextGeneration`，六类固定指令使用 `ALCHEMIST_INSTRUCTIONS`，研究维度经 `InstructedPrompt.data` 传递；一次格式纠正也使用登记指令，仍须原预算与授权显式允许。模型目录使用 `configuredModelChoices` 的元数据检查，不能为发现而调用会解密的 health。Host Capability 的可选 signal 经 Plugin SDK 传到 invocation，只能取消自身调用；`beforeEffect` 仍需在派出与业务提交前复查，异步检查结束后也要检查取消和时限。
   - **提示词要登记，用户能看能改**：指令写在插件的 `src/prompts.ts`，用 `defineInstructionPrompt({ owner_id, prompt_id, version, title, purpose, used_by, body })` 声明，从包入口导出 `<插件>_INSTRUCTIONS`；调用时传 `instructed(指令, 数据)`，端口类型写 `InstructedPrompt`／`ModelPromptInput`，不收裸字符串。指令只写要求，用户材料和本次参数放在数据里。
   - **判断服务（TypeSafe）写在代码里的固定题面同样登记**（不是“判断服务没有 Prompt”）。题面归谁，就走谁的那条路，两条都以 `tests/prompt-registration.test.ts` 为检查：
     - 插件自己的题面（如创作台挑能力、挑组件，`plugins/native/plugin-builder/src/choice-prompts.ts`）：在包里用 `defineInstructionPrompt` 声明，列进包导出的 `<插件>_INSTRUCTIONS`。插件创作台是平台能力（PG-051 Q2），它的题面由 Host 在 `BUILTIN_INSTRUCTIONS` 里登记；别的插件把指令放进自己定义的 `instructions`，运行时登记；工作流经端口取有效正文（创作台是 `AgentBuilderPorts.instruction`，没有端口就用默认文字）。
     - Host 自己的题面（不属于任何插件，如选区推荐的 `CONTEXTUAL_NEXT`、`CONTEXTUAL_SURFACE`）：在 `apps/local-host/src/agent-definitions/system-prompts.ts` 声明（默认文字放在调用它的包里），再加进 `apps/local-host/src/agent-definitions/builtin-instructions.ts` 的 `BUILTIN_INSTRUCTIONS`；owner 是新的 `system:<模块>` 时，还要在同一文件的 `SYSTEM_INSTRUCTION_SOURCES` 登记显示名，否则设置里它显示成一个名叫 `system:<模块>` 的插件。调用时经 `registeredInstructionBody` 取有效正文；缓存的判断结果用 `registeredInstructionRevision`（只读，不记使用）判断题面有没有被改过。
     - 默认文字改了要同时升 `version`，并在 `WORDING_HISTORY`（同一个测试文件）为它加一行（只加不改）：版本和文字指纹对不上，测试就失败。新增的题面在这张表里自己开一条历史，并把它的 id 前缀加进同一个测试里 `everyWording` 的筛选。没登记就直接调 `evaluateTypeSafe` 的 Host 文件也会被这个测试拦下。
     - Host 自己的 AI 写法总表见 `docs/system/EXTENSION-POINTS.md` 第 3.4 节；登记后用户改了怎样在下一次判断生效，见手册 `docs/platform/PROLOGUE-AI.md`“判断服务（Jev）的固定题面也登记”一段。用户自己写的判断规则（Functions）题面是用户的数据，不在此列。
   - Host 适配器经 `resolveModelPrompt(home, prompt, 插件 id)` 取有效正文（用户在设置“提示词”里改过就用用户版，并记一次使用）；插件的 `*_INSTRUCTIONS` 放进自己定义的 `instructions`（`PluginDefinition.instructions`），插件运行时由 Host 登记，调用只能发送定义里带的指令（PG-051）。
   - 不经 Agent Host 的 Agent（如插件创作台）也一样：Prompt 登记在同一处，运行时经端口取有效正文，版本里写出 `+user.<修订号>`。
   - 生成插件先按可信调用上下文选择安装发布版或创作构建，再解析该版本已声明的 prompt；不能先查 Home 设置登记来选择默认正文。安装版应用现有用户覆盖，创作试运行验证构建正文。多项目登记按安装隔离，用户覆盖仍按 Home/owner/prompt 共享；卸载一个安装不能移除其他安装的登记。
5. **Agent 角色**（如需要）：Manifest `agent.roles[]` 的每个角色声明 `role_id`、`version`、`execution`（缺省 read-only）、`prompts`（按角色列出，读者角色不要拿到写者提示词）、`host_tools`，`agent.prompts` 声明提示词条目；提示词正文放在插件定义的 `agent_prompts`，Skill 正文放 `agent_skills`（给自己的 Agent）；给别的 Agent 的 Skill 声明在 Manifest `methods`、正文放 `PluginDefinition.methods`；插件运行时由 Host 的 `registerPluginAgentDefinitions` 登记，设置「Prompt 与 Character」里看得见（PG-051）；在 Prologue 上登记钩子一律 `forSession`。
   - **角色版本跟着它实际拿到的工具走**（统筹 2026-10-19 裁定）：角色实际拿到的工具集变了就升这个角色的 `version`，经共用常量（现在是 `BUSINESS_HOST_TOOLS`）变的也算。改常量的同一个改动里，展开它的每个角色都升一版（现在是助理的 `assistant`、`assistant-delegated` 和 Todo 的 `organizer`），PR 里写出哪些角色多了或少了什么工具。冻结记录（`AgentRunView.frozen`）里有 `role_version` 也有 `host_tools`：版本不动、工具变了，按版本比前后两轮就以为角色没变，要逐项比工具列表才看得出来。
   - **说明怎样处理补充（`acknowledge-inputs`）**：展开 `BUSINESS_HOST_TOOLS` 的业务角色经这个常量自动带上；有目录的角色要自己在 `host_tools` 里列（Coding 里人直接对话的角色都列了，子任务的角色没列）。补充的编号只在列了它的一轮里给模型看。它只把 AI 自己说的怎样处理记在 SDK 的输入账上，不改账本：补充还是那条补充，事情做没做看工具回执，不看这句自称（`specs/ai-input-receipts` 3e-0）。
   - **`BUSINESS_HOST_TOOLS` 里还有 `board-wait`**（#661 加）：展开常量的业务角色都能登记等外面的结果，只能用它的 App 登记的只读外部检查器（第 7 步「等外面的结果」和其后一段）。
   - **在插件里跑一个 Agent**（等它跑完再写）：Manifest 声明 `agent.roles` 与权限 `agent:run`；动作声明 `scheduling: "concurrent"`（或保留 job）；处理器里用 `context.services.agents.run`，只传角色、任务、标题、可选工作区 id 和至多十分钟的时限，返回最后一条 assistant 正文与会话/运行引用。原动作取消、停用、撤权、超时，或运行等人工交互（`awaiting-input`、`awaiting-review`）时，平台取消本次运行。例子 `plugins/native/schedule/src/runtime-wakeups.ts`，契约 `packages/contracts/src/platform/plugin-agents.ts`，手册第 4 节有细节。
6. **错误**：执行服务不可用用 `inferenceServiceUnavailableReason` 如实说明；派出前被宿主复核拒绝用 `isDispatchRefusal` 识别，说明「没有发出」而不是网络问题；供应商 HTTP 错误按状态给可操作提示；不要把 SDK 细节透给用户。
   - **页面上的「没有模型」状态**（只指原生插件的客户端脚本；生成插件没有 DOM，界面由宿主按合同渲染，不写这个）：显示过「没有模型」的页面在 `document` 上听 `molis-work:model-ready`（分栏窗格里的框架也收到），事件里重读一次是否有模型，不留着加载时的旧答案，否则页面和「模型已连接」的提示互相矛盾。去设置的链接是普通链接（`/settings/models`），页面不为它单写返回逻辑；链接若放在模态 `<dialog>` 里，点击时先关掉对话框（设置盖在页面上，模态会压住它）。要在事件里重开对话框的页面，只有此刻自己真在屏幕上才开，要同时看有盒子和可见，写成 `root.getClientRects().length && getComputedStyle(root).visibility === 'visible'`（Jelly 的写法）：只看 `getClientRects().length` 不够，设置盖下面的页面是 `visibility: hidden`，盒子还在，`showModal()` 开在被藏起来的页面里会锁住整页（Jelly 的教训）。记着「去过设置」的标记，在第一次事件上就用掉（那一刻页面不在屏幕上也用掉），不留到以后：人没保存就走了、标记还留着，之后某次保存时页面恰好回到前台，对话框就在人没打算的时候弹出来。事件何时发、设置盖何时先关、怎样到框架和其他标签页，不在这里重复，见 `docs/platform/PROLOGUE-AI.md`「第一次配置」和 `packages/contracts/src/platform/dom-events.ts` 里 `molis-work:model-ready` 的登记条目。
7. **取消与恢复**：被取消/撤权/停用的调用不再写任何业务记录（处理器开始之前就被拒的，调用记录里只留一行「未执行」的诊断行，只记谁、什么动作、结果与错误码，不记内容）；长任务用持久记录 + `request_id` 幂等，重试不重复调模型。
   - **等待与接续**（会话的一步等回信、后台命令或别的会话那一步，`specs/prologue-adoption/spec.md` §4.6.10）：等待和接续归 SDK 的任务图，插件不存副本。合同在 `packages/contracts/src/services/agent-collaboration.ts`：读与控制是宿主登记的动作 `agent.collaboration.read.v1`、`agent.collaboration.control.v1`，等到有接续可走用 `agentHostCapabilities.awaitContinuations`。接续由插件起会话的下一轮来接（宿主按接续的请求键开跑，开跑前的复核照旧）；开跑被拒（撤权、取消、停用）时不留言、不动接续，留给之后的 activation。写法看 `plugins/native/coding/src/wake-loop.ts`。
   - **等外面的结果**（一步等作业跑完、结果文件写好）：角色的 `host_tools` 带 `board-wait`，提示词教模型登记 `{ kind: "external", checker, params }`。通用检查器是宿主提供的两个：`molis.action-query@1`（只读查询动作的状态，要在这一轮的 `action_tools` 里，`params.tool` 写模型看到的动作工具名）和 `molis.file-present@1`（授权目录里的相对路径与完成标记）。要判断好坏的条件不能这样等：判断是命令，会被拒；声明了 `model:invoke` 的查询也会被拒（每看一次就调一次模型）。规则见 `docs/system/SECURITY-INVARIANTS.md` S-27，提示词的写法看 `plugins/native/coding/src/roles.ts` 的 `coding-background`。

接入本人操作的等待使用 `molis.connector-setup@1`，参数仅 `{ authorization_id }`，来自本会话的 `connectors.setup.prepare`。Host 在登记与每次读取前后检查请求的原会话、用户、项目及当前助理查询权限；重启后只恢复这项窄读取，不恢复通用动作或文件授权。检查只证明请求和连接状态，等待满足后还须按最新任务调用真实业务能力。App-tools 业务角色使用同一个 SDK 持久等待，只允许其 App 登记的只读外部检查器；命令、信封、节点及待答问题条件不向此模式开放。无绑定、其他会话与已撤权检查均拒绝。真实 SDK 与本机协议替身已验证等待、最新请求、单次接续及重启，真实模型和服务账号的验收仍见 `specs/assistant-service-connections/spec.md` §11。
8. **文档**：新能力写进对应插件 spec；改了本清单涉及的契约，同一任务更新手册与本 Skill；改了手册第 14 节点名的代码，同一改动更新那一行。

装配 Node Runtime 时从创建起保留 `createPrologueNodeAdapter` 的初始化句柄；初始化拒绝后的资源清理仍经该句柄的 `close()` 显式重试，全部成功才归还存储所有权。调用合同和 Host 接法见 [Agent Host README](../../horizontal/agent-host/README.md)。

## 交互：问人、建议一步、引用对象

AI 要人补信息、确认一步或挑一个对象时，用下面四条共用的路（`specs/ai-interaction-experience`）。不在回复正文里列选项让人照着打字，不自己画卡，也不另存一份等待状态：等待归 Runtime，卡归宿主，规则在插件 SDK。

- **Agent 中途问人（问卷）**：角色的 `host_tools` 带 `ask-user`。模型能用的题型是 `hostQuestionTypes()`（选择、文字、数字、日期、日期时间、对象引用，即每个画问题的界面都画得出的那几种），一张卡可以混着问。Run 停在 `awaiting_input`；宿主用 `agentQuestionHtml`（`apps/local-host/src/agent-question-card.ts`）把每个等待中的问题画成同一张卡，作为 `html` 放进助理与 Coding 的视图。页面插入它，由共享客户端读回字段，插件 SDK 的 `questionAnswer` 把字段变成回答，经 Run 的控制动作交回（Coding 是 `coding.runs.control`，版本以动作目录里的为准）。Runtime 按它保存的题逐题检查：有一题不合格就整份退回 `agent.answer_invalid`，`problems` 经 `questionErrors` 变成各字段旁的一行（带界限与单位），问题保持打开，模型什么都没听到；改对再交，原 Run 接着做。
- **对象引用**：一类对象能被问到，要它先能被搜到：插件为这个种类写对象读取器，并在条目列出动作（`defineSearchEntriesAction`）里列出这个种类和给人看的名字，写法见 [`molis-plugin-dev` 的 search.md](../molis-plugin-dev/search.md)。两样都在同一个 Manifest 里，这个种类就是能问的。宿主由此算出 `hostReferenceKinds()`，经 Prologue 的 `askUserReferenceKinds` 交给模型；模型问清单外的种类，给人看之前就被退回。卡上不列候选，人打字时才按这一题的种类调 `search.references`。交给 Run 之前，宿主以会话主人的身份向对象的主人重读每个选中的对象，用主人此刻的标题，页面写的标题不用；读不到的那一题退回 `reference-unavailable`（安全不变量 S-26）。现在只算内置插件的种类（BL-152）。
- **建议一步（操作卡）**：一轮有冻结的 `action_tools` 时，角色的 `host_tools` 带 `suggest-action`，模型就多一个只能点名这一轮动作的建议工具。建议原样记进 `AgentRunView.offers`，什么都不执行。落成卡、执行、失效的规则在插件 SDK（`draftActionCard`、`runActionCard`、`sweepActionCard`），卡由调用方按 Run 的主人存（助理在 `apps/local-host/src/assistant/assistant-offers.ts`，Coding 在 `plugins/native/coding/src/action-cards.ts`），执行只经 `agent.offers.run.v1`（S-29）。人不点就不执行；对象改了版、时刻过了或动作不再提供，卡就失效而不是照旧执行。
- **不跑 Agent 的动作先问（单次接续）**：动作发现信息不够时，返回 `{ status: "needs_input", interaction }`（contracts 的 `InteractionRequestResult`）而不是猜一个结果，并自己留着问过的题。宿主在 Runtime 插件的路由上把它画成同一张卡（`apps/local-host/src/plugin-interaction-answer.ts`），人答完，页面带着回答再调一次。插件用 SDK 的 `questionSetFlaw` 检查要问的题、`questionProblems` 检查回答，这和 Runtime 是同一套规则（`tests/question-rules-consistency.test.ts`）；退回时把问题放进错误的 `details.problems`，宿主补上各字段那一行。现在只问选择题。

三个例子各有用例，照着写：

| 例子 | 走的路 | 用例 |
| --- | --- | --- |
| 助理「帮我约一个下周的复盘会」：一张卡问开会时间、时长（分钟）和关联的 Goal；时长填 240 只在那一题报「不能超过 120 分钟」，改对后原 Run 接着做 | 问卷 + 对象引用 | `tests/interaction-examples.test.ts`；浏览器里的同一条路：`tests/assistant-typed-questions.e2e.test.ts` |
| 助理建议「改到周五」：对话里的卡，点了才执行，对象变了就失效 | 操作卡 | `tests/action-cards.test.ts`、`tests/agent-host-offers.test.ts`。输入框旁的同排按钮归情境线，还没做 |
| Form「AI 生成题目」缺受众与题量：先问几道选择题，答完接着生成 | 单次接续 | `plugins/native/form/src/drafting.ts`，用例 `tests/form-draft-questions.test.ts`、`tests/plugin-interaction-answer.test.ts` |

改了这四条中的任何一条，跑 `node scripts/run-tests.mjs tests/interaction-examples.test.ts tests/agent-question-types.test.ts tests/agent-reference-questions.test.ts tests/action-cards.test.ts tests/form-draft-questions.test.ts tests/security-invariants-object-references.test.ts`。

## 验证与验收

- `node scripts/run-tests.mjs tests/action-model-scheduling.test.ts`（等模型的动作必须并发，例外要写理由）。
- `node scripts/run-tests.mjs tests/plugin-model-service.test.ts`（Runtime 插件的 `services.model`：只在声明过的并发动作里、动作返回后被拒、取消与停用时不交结果、走宿主自己的文字模型路径）。
- `node scripts/run-tests.mjs tests/prompt-registration.test.ts`（定义的指令必须已登记、插件端口不收裸字符串、Host 直接调模型只能在带理由的过渡清单里）。
- 仿 `tests/action-before-effect.test.ts` 覆盖「等模型时撤权 / 停用 / 取消」不写入且可恢复。
- 模型替身放在生产接缝：`new MolisWorkLocalHost({ homeDirectory, completeText })` 或 `bindPrologueInference(home, client)`；不要 mock 全局 `fetch`。
- 改了 `horizontal/agent-host`：跑 `tests/agent-*.test.ts` 与 `tests/prologue-*.test.ts`；动到真实 SDK 路径时用本机替身模型服务跑一次（见 `tests/agent-budget-prologue.test.ts`）。
- 改了插件的 Agent 角色或 `services.agents.run` 的用法：跑 `tests/agent-built-plugins-agent.test.ts` 和该插件自己的 Agent 用例；平台回归用 `tests/security-invariants-plugin-agents.test.ts`。
- 真实模型实测用用户配置的 MiniMax（anthropic-messages）；图片、TypeSafe 需要各自服务，做不到就写「未验证」。
- 改了提示词或方法：先征得用户同意，在隔离 Home 里对同一批真实任务改前改后各跑几次，按手册 16.3 的格式记进 spec 或 PR；创作台挂载的章节和提示词先跑 `pnpm studio:replay`。
- 界面有变：浏览器里把主路径点一遍（加载、成功、失败、取消、未配置模型）。
- 交付时分清：源码审查、替身、真实 SDK、真实模型、产品实操、用户验收。

执行结果驱动通知时，从 Agent Host 的 Run 投影或 Prologue Effect/dispatch 回执读取真实结果；批准不等于执行成功，reconcile-required/unknown 也不是成功。Coding/Git 的刷新通知不重试模型或副作用，SDK 重启恢复历史回执时不重新发布“新执行”。订阅使用当前插件 activation 的独立身份，等待后复查，停止时释放。


Shelf 的自动 recipe 是共享 Prologue 消费者：固定指令登记在插件 prompts.ts，模型选择与人工终端 engine 分离。调模型的 Action 声明 `model:invoke` 和 metered；本机提取是另一个不要模型、成本 none 的 Action，两条路不合成一个能走两边的入口（Shelf 的 `shelf.jobs.generate` 与 `shelf.jobs.extract` 就这样分，它们的权限、成本和调用链以 `docs/platform/PROLOGUE-AI.md` §11 为准，这里不复述）。保留完整执行回执的 reported/estimated/unknown，JSON 解码读取 SDK 的 ok/value，领域约束再校验。材料部分覆盖进入最终结果说明；最终业务提交仍复查原调用、材料 hash 和可信 Host 返回的模型配置校验，不让最后一次 await 留出失效结果写入窗口。

评论内显式召唤个人助理时，复用宿主的原线程回复服务和同一个 Prologue，不新建第二个执行引擎。插件拥有消息与锚点，并声明用户专属的线程上下文查询与回复命令；宿主冻结该轮目标、材料和受限角色，最终回复从可信调用上下文交给所有者。普通评论不启动模型。模型完成而投递失败时只重投递；停止、撤权或原注册实例变化后拒绝迟到写入。后台使用 dispatcher 在原处理器存活时保留的授权检查，不保存已经结束的 beforeEffect。重启后的投递由新的显式请求恢复，不自动再调模型。实现入口为 `apps/local-host/src/assistant/assistant-threads.ts`，协议与验证边界见 [统一规格](../../specs/archive/pages-assistant-surfaces/spec.md)。

评论入口明确带入未保存正文时，使用 `AssistantThreadDraft` 随该轮发起请求交给 owner 校验版本；只存入该轮材料并标出草稿，不替用户保存正文。默认仍等待保存，未持久化的新锚点必须先保存。
