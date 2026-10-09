# 生产 AI 入口清单与分类（W2-18，交付第 12 项）

状态：清点与结论（2026-10-09，main `11878059`）；本文只读代码、不改代码。每一行都对着代码核过；核对用到的四种证据在 §0 写明，凡「读码」以外的都能照 §8 复现。

任务要求：`docs/prompts/repository-anti-corruption.md` 交付第 12 项（下沉 Prologue、产品内共享、保留业务层和暂缓的能力及理由），以及 `docs/prompts/repository-systematic-review.md` §8（清点全部生产 AI 入口，核对真实调用链，不能只看 import）。路线上的位置见 [roadmap-2026-10-07.md](roadmap-2026-10-07.md) 的 W2-18 与「覆盖缺口」一节；进度与决定在 [spec.md](spec.md)。同一片的另外两份产出：[逐插件结论](plugin-conclusions.md)、[前端动线走查](frontend-flow-walk.md)。

## 0. 怎么读

**入口**指一个用户或后台会触发的、最终向模型（或第一方判断服务）发请求的地方，按种类分：Agent 运行（带工具循环）、单次文字、结构化输出、判断（TypeSafe，产品里叫 Jev）、图片、本机识别（OCR、语音转写）、外部 Agent 运行时与本地模型、检索（不是模型，但是同一类外部调用，一并列出）。

**分类**四个词，取自任务书 §8：

| 分类 | 含义 | 判断规则 |
| --- | --- | --- |
| 下沉 | 已在或应在 Prologue SDK 里 | 与业务无关、合同稳定、不止一个产品需要 |
| 共享 | 产品内多个消费者共用一份 | 与业务无关，但依赖 Molis Work 自己的东西（模型目录、密钥存储、动作目录）；放 `horizontal/agent-host` 或宿主 |
| 保留 | 留在业务层（插件、模块、宿主） | 产品身份、领域语义、权限政策、体验决策 |
| 暂缓 | 本轮不动 | 用户口径：本机模型与外部 Agent 运行时暂缓（`docs/platform/PROLOGUE-AI.md` 开头；`CALL-CHAINS.md` §10.1） |

**证据**四种，每条结论末尾用字母标：

- **G 门禁测试**：`tests/action-model-scheduling.test.ts`（每个等模型的动作都声明 `scheduling: "concurrent"` 或在 `SERIAL_BY_DESIGN` 里写理由）、`tests/prompt-registration.test.ts`（模型调用的指令必须登记，`UNREGISTERED_MODEL_CALLS` 现在是空表）。
- **P 目录探针**：用 `MolisWorkLocalHost.inspectActions` 在一个新建的临时 Home 里把全部动作读出来，按声明的权限与成本筛（§8 给了方法）；这是「目录里到底有什么」的事实，不依赖文档。
- **R 读码**：沿「动作 → 宿主绑定 → `hostCompleteText`/`hostTextGeneration` → `resolvePrologueInference` → agent-host」逐环读，路径写在表里。
- **U 界面**：在隔离的临时 Home 里开真实页面操作的结果，截图在 [frontend-flow-walk.md](frontend-flow-walk.md)。

标注 `[已确认]` 读了代码或跑了命令；`[推断]` 由已确认的事实推出；`[未验证]` 没有跑通。

## 1. 结论

1. **没有供应商直连。** 对 `apps`、`packages`、`modules`、`horizontal`、`plugins`、`server`、`tooling` 的源码逐项搜了 `fetch`、`https.request`、`undici` 和各家 API 域名与名字（OpenAI、Anthropic、x.ai、MiniMax、Gemini、DashScope、DeepSeek、Moonshot、OpenRouter、Ollama、LM Studio 等）：服务端没有任何一处直接向模型厂商发请求。除模型外，服务端出站网络共八类，都不是模型调用：（1）连接器（OAuth、Gmail、GitHub、Notion 文档导入，`plugins/official-integrations`、`apps/local-host/src/connector-mcp.ts`）；（2）RSS 白名单传输（`feed-source-runtime.ts`）；（3）AnySearch 检索（`anysearch-transport.ts`，固定主机 `api.anysearch.com`）；（4）用户点名的网页与链接读取（`material-web.ts`：12 秒、4 MiB、不带凭据；`jelly-source-reader.ts`：只收公网地址、跳转逐跳复验）；（5）插件创作台里生成的插件，经沙箱代理与 `plugin-builder/network.ts`（只许 https、公网地址、声明且批准过的主机）；（6）Casebook 客户端（`casebook/client.ts`：只许本机或 https 端点）；（7）**炼金术士市场脉搏自带的三个公开来源**（`plugins/native/alchemist/src/studio/server/sources/`：`www.toolify.ai`、`watcha.cn`、`api.github.com`，默认在线，`bootstrap/local-runtime.ts:118-130`），其中 GitHub 来源的令牌直接读环境变量 `GITHUB_TOKEN`，不经连接器也不是密钥引用（[plugin-conclusions.md](plugin-conclusions.md) E-16）；（8）本机内部：动作网关 `action-gateway.ts`、安装器对 `127.0.0.1:4173` 的健康检查、桌面壳 `apps/desktop/src/capsule-shell.ts` 对本机接口的请求。（第一次扫描漏了第 7 类：当时的命令把名字带 `client` 的文件排除了，而 Alchemist 的 `sources/http-source-client.ts` 正好叫这个名字；§8 的命令已改为不排除。）`@prologue/sdk` 只被 `horizontal/agent-host` 的 21 个 `.ts` 文件导入（`git grep -l "@prologue/sdk" -- 'horizontal/**/*.ts'`；别处只有文档与包声明提到它），与 AGENTS.md 硬约束一致。[已确认]
2. **所有文字与图片模型调用都经同一个 Home 的 Prologue 推理端口。** 清单 44 行（§3），分成两条路：有界调用走 `hostCompleteText`/`hostTextGeneration`（宿主 `apps/local-host/src/host-complete-text.ts`）→ `resolvePrologueInference(home)` → agent-host 的 `createPrologueInference`；Agent 运行走 `AgentHost.start("prologue", …)`。两条路在派出前都带「复查授权、复查配置与凭据快照、可取消、有时限」，被取消或撤权的调用不写记录。[已确认，G+R]
3. **等模型的动作 100% 声明并发调度并披露成本。** 目录里 38 个带模型、判断或生成权限的动作，其中 34 个声明了 `cost: "metered"`；这 34 个里只有 5 个是串行的（实验的 `experiments.run`、图片的 `images.jobs.start`、Alchemist 的三个 `*.start`），每个都是「立刻返回、后台执行」，并在 `SERIAL_BY_DESIGN` 里写了理由；门禁测试守着。其余 4 个（三个 `scenes.enable:*` 与 `images.jobs.cancel`）是配置或取消，不等模型。[已确认，G+P]
4. **指令文字全部登记，用户在「设置 › 提示词」里能看到和改。** `BUILTIN_INSTRUCTIONS` 由各插件的 `instructions` 加宿主自己的 5 条（项目上手 2、信息助手 1、记忆 2）合成；未登记表为空。[已确认，G+R]
5. **绕过 `horizontal/agent-host` 的只有四类，全部属于「暂缓」口径**，其中一类用户看不见却默认注册、没有任何内置调用方：
   - 实验里的本地 `grok` 命令行与 `laya` Python 检查点（`experiments-executor.ts`、`experiments-grok.ts`、`experiments-process.ts`）：`docs/system/CALL-CHAINS.md` §10.1 已登记为长期例外。
   - Shelf「对话」里的外部终端 Agent（探测 9 个命令行引擎，`modules/shelf/src/runtimes.ts`）、Sessions 的终端、角色的「用本机 Agent 运行」：用户自己的外部 Agent，经 PTY 终端使用，不是 Molis Work 向模型发请求。
   - 本机 OCR 与语音转写（`apps/local-host/native/materials` 的 Swift 组件，Vision 与 WhisperKit）。
   - agent-host 里的 `CliAgentAdapter`（`claude` 命令行，只读档）：**每个 Home 的 Agent Host 都会注册它**（`agent-host-composition.ts:87`、`:101`，生产只有 `system-agent-service.ts:34` 一处调用 `composeAgentHost` 且没传 `cliRuntimes`），但没有任何内置代码选它——Coding 写死 `runtime_id: "prologue"`（`plugins/native/coding/src/routes.ts:873`），助理 `RUNTIME = "prologue"`（`assistant-service.ts:30`），Schedule 只认 `PROLOGUE_RUNTIME_ID`（`schedule-task-runner.ts`）。[已确认]
6. **§7 列了 9 项，其中要用户决定的有 3 项**（第 1、2、5 项）。最需要先拍板的是前两项：外部 CLI 运行时是否保留；实验的本地调用要不要进 AGENTS.md 的硬约束里留出例外条款。

## 2. 公共链：生产入口怎样到达 Prologue

```text
有界文字 / 结构化 / 图片 / 判断
  插件动作处理器（拿读取时的快照、带 caller.signal）
  → 宿主绑定（apps/local-host/src/<插件>-actions.ts，约 17 个文件各写一份“拿模型”的几行）
  → hostCompleteText / hostTextGeneration（host-complete-text.ts）
      固定这次的供应商与模型；读凭据快照；派出前核对配置与凭据没变；
      beforeDispatch = 原动作的 beforeEffect；120 秒默认时限、可传 timeoutMs；
      返回后再核一次，变了就报 actions.configuration_changed、结果不提交
  → resolvePrologueInference(home)（prologue-inference-host.ts）：取这个 Home 唯一的推理绑定
  → createPrologueInference（horizontal/agent-host/src/adapters/prologue-inference.ts）：
      completeText / completeTextResult / generateImages / evaluateTypeSafe
  → @prologue/sdk（vendored 单份 tgz）→ 供应商

Agent 运行
  助理、Coding、Schedule、插件创作台的设计与代码 Agent
  → AgentHost.start(runtime, request, authority)（horizontal/agent-host/src/index.ts）：
      角色冻结、目录授权、会话归属、字符版本、工具装配（含 find/read/change-capability 网关）
  → Prologue 适配器（adapters/prologue-node.ts）：工具循环；写入与命令进 AgentReviewQueue 等人批准
```

要点（都是读码确认）：

- 一个 Home 只有一个推理端口：`bindPrologueInference` 对第二个不同的实例抛 `inference.home_in_use`（`prologue-inference-host.ts`）。
- 凭据只给引用：`credential_ref` + `resolveCredential(ref)`，密钥不进插件、不进事件。
- 默认模型没有「默认」设置项：`selectConfiguredTextModel` 取供应商列表里第一个「已启用、格式支持、地址合法、凭据可用」的供应商的第一个启用模型（`apps/local-host/src/configured-models.ts`），显式选择从不回退。助理、Pages、Form、Dataset、PPT、Todo、灵光、Workflows、Inbox 都吃这个默认；Jelly、Alchemist、Shelf、插件创作台、实验各有自己的选择入口；Cognia 用默认，但页面标明用的是哪一个（见 [plugin-conclusions.md](plugin-conclusions.md) §3 的横向比较）。

## 3. 清单

列说明：**调度**是目录里声明的 `scheduling`（并发 = 不占项目串行队列）；**复查**是处理器在派出前后调用 `beforeEffect`（或 `beforeDispatch`）并在提交前核对读取时的版本；**登记**是指令正文已在 `BUILTIN_INSTRUCTIONS`；**无模型**是没有模型时目录里这个动作的可用性（P 探针：用户与助理两种受众都读了）。

### 3.1 Agent 运行

| ID | 入口 | 调用链 | 守卫 | 分类 | 说明 |
| --- | --- | --- | --- | --- | --- |
| AG-1 | 系统助理（底栏、助理面板、委托的子任务） | `assistant-service.ts` 的 `host.start(RUNTIME = "prologue", …)`（`:1970`）：角色 `assistant`、`workspace: "business"`、`action_gateway: true`；工具 `find/read/change-capability`、`suggest-action`、`change-reversible`、委托与记忆；写入类先弹准确参数确认 | 授权由 `AgentStartAuthority` 冻结；每轮预算 `max_turns` 与剩余 token；记忆按轮选好；写入前复查 | 业务层保留，循环已下沉 | 无模型：面板显示「还没有配置可用的模型，助理无法开始工作。输入已保留」并给「打开模型设置」（U，截图 14）。[已确认] |
| AG-2 | Coding 会话 | `plugins/native/coding/src/routes.ts`：`agent.session.create`、`agent.run.start`、`agent.run.wait`、`agent.run.control`；写文件与命令进 `AgentReviewQueue` | 角色来自 Manifest；目录必须宿主授权且 realpath 核过；批准一次性 | 保留 | `coding.runs.start` 目录里是 `metered`、并发、仅 `user` 受众（P）。无模型：页面底部提示「还没有模型」（U，截图 08）。[已确认] |
| AG-3 | Schedule 到点任务 | `apps/local-host/src/schedule-task-runner.ts`：只认 `PROLOGUE_RUNTIME_ID`，只读 Agent，10 分钟上限，要求项目已绑定工作区 | `control.beforeEffect()` 在启动前后复查 | 保留 | 创建任务时不检查有没有 Runtime 与工作区，到点才失败（`:33`、`:38` 抛错，界面「叫醒失败」）。见 §7 第 5 项。[已确认] |
| AG-4 | 插件创作台的主线设计师与代码 Agent | `horizontal/agent-host/src/adapters/plugin-builder.ts`（`createBuilderAgent`，由 `bindPrologueBuilder` 绑定到 Home） | 角色与提示词登记在 `BUILTIN_INLINE_AGENT_ROLES/PROMPTS`；设计阶段只读无工作区，编码阶段在构建目录写 | 保留（需要专门编排的 Agent 把适配器放进 `horizontal/agent-host/src/adapters/`，是 `docs/platform/PROLOGUE-AI.md` §2 写明的做法） | 顶栏有模型选择和「打开模型设置」，输入框下提示「请选择构建使用的模型」（U）。[已确认] |
| AG-5 | 助理委托的子任务与 Prologue 子代理 | `prologue-subagents.ts`、助理的 `delegate-work` 系列工具 | 子任务不带记忆工具，浏览器关闭（`assistant-service.ts` 的 `work.delegated_by` 分支） | 保留 | [已确认] |
| AG-6 | 助理与 Coding 使用的外部 MCP 工具 | `horizontal/agent-host/src/adapters/prologue-mcp.ts` + `apps/local-host/src/agent-host-composition.ts` 的 `createExternalMcpDirectory` | 连接的外部工具并入项目目录，随连接变化同步 | 保留（连接与授权在宿主） | 这是 Agent 向外调用，不是模型调用，列出来因为它也经 Agent 工具闸门。[已确认] |

### 3.2 有界文字：插件动作

下表的动作在目录里全部是 `cost: "metered"`、`scheduling: "concurrent"`（P+G），指令都已登记（G），处理器都按「读取快照 → 带 `signal` 调模型 → 返回后 `beforeEffect()` → 按快照提交」写（R）。

| ID | 能力 | 受众 | 无模型时（P） | 调用链与说明 |
| --- | --- | --- | --- | --- |
| TX-1 | `pages.ai`（写作助手：16 个命令，改写按 4 种风格拆成 4 项，界面共 17 项） | 用户、工作流、助理、MCP | 不可用，`actions.connection_required`「请先配置文字模型，再使用写作助手」 | `plugins/native/pages/src/ai.ts` → `apps/local-host/src/pages-actions.ts`；界面入口是选区旁的情境条「更多」，没有模型时 17 项都显示为灰色并写明原因（U，截图 11）。[已确认] |
| TX-2 | `pages.generate`（从材料生成文稿） | 同上 | 不可用，同上 | 同一绑定；`inbox.pages.generate` 复用它（Inbox 的可用性与 Pages 一致，`tests/pages-cross-module.test.ts` 第一条断言）。[已确认] |
| TX-3 | `inbox.pages.generate` | 同上 | 不可用 | Inbox 动作，经动作客户端调 `pages.generate`，不自己碰模型。[已确认] |
| TX-4 | `ppt.outline_ai` | 同上 | 不可用，列表里 `ai_available:false` 且界面按钮置灰 | `ppt-actions.ts`；`client.ts` 按 `ai_available` 禁用并给出原因。[已确认] |
| TX-5 | `form.questions.ai`（AI 拟一道题） | 同上 | 同上 | `form-actions.ts`；`list` 带 `ai_available`。[已确认] |
| TX-6 | `dataset.columns.ai`（AI 拟列名，不发表内数据） | 同上 | 同上 | `dataset-actions.ts`。[已确认] |
| TX-7 | `todo.organize.extract`（整理材料成待办候选） | 用户、助理、工作流、MCP | 不可用 | `todo-actions.ts`。**Todo 界面没有触发它的按钮**（`plugins/native/todo/src/client.ts` 只列、采用、关闭整理批次），生产里只有项目上手（`apps/local-host/src/web-onboarding.ts:30`）与助理/MCP 调它。[已确认] |
| TX-8 | `lingguang.conversation.message`（灵光对话） | 用户、助理、工作流、MCP | 不可用 | `lingguang-actions.ts`。[已确认] |
| TX-9 | `cognia.knowledge.synthesize`、`cognia.knowledge.query` | 同上 | 不可用，页面顶部写「当前没有可用的文字模型……导入、搜索和阅读仍可使用」并给「打开模型设置」（U，截图 07） | `cognia-prologue.ts` 固定模型并注入 `hostCompleteText`；检索用关键词子串打分选 1–5 份材料，再让模型带引用作答（`plugins/native/cognia/src/ai.ts`）。[已确认] |
| TX-10 | `jelly.plan.generate`（把原文或笔记选区拆成待采纳的行动计划） | 同上 | 不可用；另有「手工拆解」路径不要模型（`plugins/native/jelly/src/ai.ts` 的 `manual`） | `jelly-actions.ts`：`completeJson` 在派出前后各 `beforeEffect()`，SDK `decodeJsonOutput` 解码，坏结构报 `jelly.ai_invalid` 不改原文。Jelly 只有这一条登记指令（`JELLY_DECOMPOSE`），没有摘要类调用；`docs/platform/PROLOGUE-AI.md:57` 写的「每次分段摘要或合并」已经不是现状（§7 第 9 项）。Jelly 自带模型选择（`jelly.model.configure`）。[已确认] |
| TX-11 | `workflows.instances.continue`（AI 交接一站） | 用户、助理、MCP（不含工作流） | **目录里可用**，调用时才报 `workflows.not_ready` | `workflows-actions.ts` 的 `aiAvailable` 只给界面；流程编辑页在对应衔接处写「Inbox → Pages（还没有可用的文字模型）」（U，截图 19）。[已确认] |
| TX-12 | `shelf.jobs.generate`（用 AI 处理材料，含看图） | 同上 | 不可用，`shelf.no_model` | `shelf-ai.ts`：先 `beforeEffect`、逐文件核路径、材料总量上限 175,000 字符、可带原图（只给声明支持图片的模型，否则拒绝并说「原图未发送」）、10 分钟上限。[已确认] |
| TX-13 | `information.plan`（信息助手：起草筛选或写作方案） | 仅用户 | 不可用 | `information-actions.ts`，只读方案，不执行。[已确认] |
| TX-14 | `alchemist.conversation.send`、`alchemist.reuse.assess` | 同上 | **目录里可用**，调用时才拒绝（`actions.connection_required`） | `alchemist-prologue.ts`：三分钟生命周期、指令必须登记在本插件下、固定模型不可用就拒绝、不切供应商。[已确认] |
| TX-15 | `alchemist.explorations.start`、`alchemist.research.start`、`alchemist.pulse.start`（后台 worker） | 同上 | **目录里可用**，任务失败 | 立即返回、由 worker 持有生命周期，是 `SERIAL_BY_DESIGN` 里登记的三个；没有模型时任务终态是「失败」，卡片里露出原码 `RUNTIME_NOT_CONFIGURED`（U，截图 18）。研究阶段还会走 AnySearch 检索（§3.7）。[已确认] |
| TX-16 | 生成插件的 `model.generate`（插件创作台做出来的插件调用模型） | 仅插件 | 调用时拒绝 | `apps/local-host/src/plugin-builder/model.ts`：必须指明一段已声明的 prompt id，正文取自该插件安装的发布版本；120 秒、每身份每分钟 20 次、metered。[已确认] |

### 3.3 有界文字：宿主作业（不是动作调用）

这些不经动作目录，没有 `caller.beforeEffect`，各自靠「问项目还在不在 / 写入门」兜底：

| ID | 作业 | 调用链 | 守卫与缺口 | 分类 |
| --- | --- | --- | --- | --- |
| HJ-1 | 记忆提炼（从一轮工作里提候选） | `apps/local-host/src/memory/memory-learning.ts` 的 `learnFromWork`：`hostTextGeneration`，本地结构校验 | 模型前后各问 `stillWanted()`（项目被删就什么都不记）；写入由记忆服务的写入门决定；没有按次授权复查 | 保留 |
| HJ-2 | 记忆整理（找重复与矛盾，只提给人） | `memory-upkeep.ts` 的 `runUpkeep` | 同上，且只产出待人确认的对子 | 保留 |
| HJ-3 | 项目上手的笔记与提案 | `context-onboarding-service.ts`：`ONBOARDING_NOTES`、`ONBOARDING_PROPOSAL` 两次调用，各 180 秒 | 没有 `beforeDispatch`；无模型时材料已保存、`needs_model`，写「请在设置中连接文字模型，再回来继续整理」 | 保留 |
| HJ-4 | Coding 的提交说明与对话整理 | `model-draft.ts`（`agent.draft-text.v1` 能力，宿主能力而非动作）：无工具、无工作区；指令必须登记且取自原调用的插件身份；调用方是 `plugins/native/coding/src/routes.ts` 的两处（对话整理 `:480`、提交说明 `:1533`） | `createExecutionLifetime` 两分钟；派出前后复查；用量只在 input/output 都上报时给出 | 共享（能力通用，现在只有 Coding 一个调用方） |

### 3.4 判断（Jev，TypeSafe）

判断是第一方托管的结构化评估服务（`https://api.typesafe.ai/v1/systemone`，常量在 `modules/functions/src/provider.ts`），协议适配在 SDK 的 `evaluateTypeSafe`，宿主经 `createPrologueTypeSafeProvider`（`apps/local-host/src/typesafe-prologue.ts`）接入：连接变了就拒绝，不用旧答案。入口都是「已发布的判断规则」（`functions.published.*`）：

| ID | 入口 | 说明 |
| --- | --- | --- |
| JD-1 | `functions.invoke`、`functions.authoring.preview`、`functions.published.*`（内置 3 条：Inbox 收件、首页下一步、Inbox 下一步） | Functions 服务；无连接时目录里写「请先连接判断服务」。[已确认，P] |
| JD-2 | `inbox.judgment.evaluate`、`home.judgment.evaluate`、`feed.rules.evaluate`、`feed.rules.preview-judgment` | 经场景绑定调规则；`inbox.judgment.evaluate` 与 `home.judgment.evaluate` 没有绑定规则时不可用（`actions.binding_required`）；`feed.rules.*` 目录里可用、调用时才依赖规则。自动触发要用户先启用场景（`scenes.enable:*`，三项，权限里带 `model:invoke`）。[已确认，P] |
| JD-3 | 情境判断（选区旁推荐动作） | `apps/local-host/src/contextual/contextual-http.ts` 的 `jevEvaluator`：直接调 `resolvePrologueInference(home).evaluateTypeSafe`，不经动作目录。无判断连接时返回空推荐。[已确认，R] |
| JD-4 | 实验里的「Jev」参试者 | `experiments-executor.ts`，经 `createPrologueTypeSafeProvider`。[已确认，R] |
| JD-5 | 插件创作台的设计选择 | `plugin-builder-surface.ts`，同上；Jev 不可用时沿用整页设计（`agent-workflow.ts` 的 fallback 步骤）。[已确认，R] |

`TYPESAFE_API_KEY` 环境变量会盖过 Home 里选的判断连接（`functions-host.ts`、`contextual-http.ts:108`、`experiments-executor.ts:18`、`plugin-builder-surface.ts:11`）；Functions 设置页会显示「来自 TYPESAFE_API_KEY」（`apps/workbench/src/functions/en.ts`），但 `docs/` 里没有写这个变量。见 §7 第 6 项。[已确认]

### 3.5 图片

| ID | 入口 | 调用链 | 说明 |
| --- | --- | --- | --- |
| IM-1 | `images.jobs.start`（图片插件生图） | `images-service-host.ts` → `resolvePrologueInference(home).generateImages`（协议 `openai-images` 或 `gemini`，端点由用户的图像连接给出，180 秒） | 目录里是 `metered`、串行（立即返回，后台任务，`SERIAL_BY_DESIGN`）；没有连接时页面写「先连接一个生图服务」并给「连接生图服务」（U，截图 20）；厂商 HTTP 状态翻成可读提示，被撤权或配置变了就报「请求没有发给厂商」。真实厂商生成未测（BL-046）。[已确认] |
| IM-2 | 文字模型的看图输入（Shelf、助理附图） | `host-complete-text.ts` 的 `assertVisionInput`、agent-host 的 `prologue-inference-materials.ts` | 只给声明 `vision: true` 的模型，否则拒绝并说原图未发送；支持 PNG/JPEG/GIF/WebP，单图 32 MiB。[已确认，R] |

### 3.6 本机识别：OCR 与语音转写

| ID | 入口 | 调用链 | 分类 |
| --- | --- | --- | --- |
| LO-1 | Shelf「提取文字」（`shelf.jobs.extract`）、Jelly 导入图片与 PDF | `apps/local-host/src/material-native.ts` 用 `execFile` 调 `native/materials/bin/jelly-material`（macOS Vision、PDFKit），不联网、不调模型 | 暂缓（口径：Jelly 本机 OCR/Whisper 暂不纳入） |
| LO-2 | Jelly 导入音频与视频 | 同文件调 `jelly-whisper`（WhisperKit，模型在 `{home}/jelly/models`，默认不下载，需要调用方明确允许） | 暂缓 |

### 3.7 检索（不是模型，同属出站调用）

| ID | 入口 | 调用链 | 说明 |
| --- | --- | --- | --- |
| SE-1 | Alchemist 的公开研究、Feed 的网页搜索来源 | `search-evidence-runtime.ts`、`anysearch-transport.ts`（固定主机、拒绝非公网地址、请求 64 KiB 与响应 1 MiB 上限）、vendored `@adeptify/search-evidence-layer`、`search-intelligence-client.ts`（`@adeptify/intelligence-client` 的本地精确路由） | 保留；两个 vendored 包是否随公开仓库发布是用户决定（`dependencies-and-sdk-plan.md`）。[已确认，R] |
| SE-2 | Feed 的 RSS | `feed-source-runtime.ts`：白名单传输 | 同上。[已确认，R] |
| SE-3 | Alchemist 的市场脉搏（`alchemist.pulse.start` 的后台任务） | `bootstrap/local-runtime.ts:118-130` 直接建 `ToolifySource`、`WatchaSource`、`GitHubSource`，经 `SafePublicHttpClient`（固定主机名单、跳转最多 3 次且每次复验、12 秒、8,000,000 字节上限）出站，不走 Search Evidence Layer 也不走连接器；`GitHubSource` 的令牌是 `process.env.GITHUB_TOKEN` | 保留来源，但令牌的读法要改：令牌应是 Settings 里连接器的密钥引用，或者干脆不带令牌（AGENTS.md「密钥只给引用」）。见 E-16。[已确认，R] |

### 3.8 外部 Agent 运行时与本地模型（暂缓）

| ID | 入口 | 调用链 | 说明 |
| --- | --- | --- | --- |
| EX-1 | 实验的 `grok` 参试者 | `experiments-executor.ts` → `experiments-grok.ts`：用 `--cwd` 临时目录、`GROK_*` 环境关掉记忆、插件、MCP、网页搜索、子代理，执行前后核对会话记录证明隔离，实际模型不是 `grok-4.6` 就判无效 | 暂缓；`CALL-CHAINS.md` §10.1 已登记。绕过 agent-host，凭据是本机 `~/.grok` 登录，不经 Home 的凭据存储。[已确认] |
| EX-2 | 实验的 `laya` 参试者 | `experiments-process.ts` 起 Python 子进程跑 `apps/local-host/tooling/experiments/laya-worker.py`，180 秒加载与推理上限，输出上限 1,000,000 字符 | 暂缓；只在设了 `MOLIS_LAYA_PYTHON`、检查点目录和固定 revision 后可用。[已确认] |
| EX-3 | Shelf「对话」里的外部终端 Agent | `modules/shelf/src/runtimes.ts` 的 `SHELF_ENGINES`（grok、claude、gemini、opencode、cursor-agent、codex、kimi、codebuddy、qwen）与自定义运行时，只用 `spawnSync` 探测本机有哪些（`--help` 只在显式作业时探）；对话本身是 `plugins/native/shelf/src/terminal-client.ts` 接 `/pty` 的终端，用户和所选 Agent 在终端里说话 | 暂缓；模块里的注释写明「Manual terminal discovery. Automatic recipes use the independent AI port」，自动配方走 TX-12（Prologue），两者互相独立。[已确认] |
| EX-4 | 角色的「用本机 Agent 运行」 | `plugins/native/characters`：`characters.launch` + 角色导入读 `~/.codex`、`~/.claude`、`~/.cursor`、`~/.grok` 等（只读扫描） | 暂缓。[已确认] |
| EX-5 | Sessions 的终端与外部 Runtime 会话 | `plugins/native/work/src/terminal`、`horizontal/runtime-host/src/adapters/terminal-pty.ts` | 暂缓；用户在终端里自己运行的 Agent。[已确认] |
| EX-6 | agent-host 的 `CliAgentAdapter`（`claude`） | `agent-host-composition.ts:87`、`:101` | 默认注册、没有内置调用方，见 §1 第 5 项与 §7 第 2 项。[已确认] |

### 3.9 开发用环境钥匙

`hostTextGeneration` 在 Home 里没有任何模型供应商时，会读环境变量配一个文字模型：`MINIMAX_API_KEY`（端点默认 MiniMax、模型默认 `MiniMax-M3`），或 `MOLIS_WORK_TEXT_API_KEY` 加 `MOLIS_WORK_TEXT_BASE_URL`、`MOLIS_WORK_TEXT_MODEL`、`MOLIS_WORK_TEXT_API_FORMAT`（`host-complete-text.ts` 的 `environmentModel`，注释写「Development and tests only」；`docs/platform/PROLOGUE-AI.md` 第 147–148 行有记录）。Home 里一旦有任何供应商记录，环境钥匙就不再生效，禁用或失效的已存供应商也不会悄悄换成环境钥匙。这是开发与实测用的路径，不是产品配置路径。[已确认]

## 4. 分类与迁移

每一项「共享」「下沉」说明消费者、合同、依赖方向、迁移顺序、验证（任务书 §8 的要求）。

| 项 | 分类 | 消费者 | 合同 | 依赖方向 | 迁移顺序 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| `hostCompleteText`/`hostTextGeneration`（模型目录选择、凭据快照、派出前复查、配置变化拒绝、错误翻译） | **共享**，不下沉：它依赖 Molis Work 自己的模型目录与密钥存储 | 约 17 个宿主绑定文件、Coding 起草、记忆、上手、信息助手、Alchemist、Shelf、生成插件 | `HostCompleteText`、`HostTextGeneration`（`apps/local-host/src/index.ts` 导出）；`PrologueTextResult`（agent-host） | 宿主 → agent-host → SDK；插件只拿函数 | 已定方向（路线 W3-06）：做成 Runtime 插件服务 `services.model`，由 agent-host 支撑，登记指令、并发调度、`beforeEffect`，不是 typed capability；之后 W5-11 删掉按插件写的 AI 适配文件（`alchemist-prologue`、`cognia-prologue`、`jelly-model`、`shelf-ai`、`experiments-grok`、`typesafe-prologue`） | `tests/host-inference-completion.test.ts`、`tests/prologue-inference-native.test.ts`、`tests/action-model-scheduling.test.ts` |
| 推理端口 `PrologueInferenceClient`（文字、图片、判断） | **已下沉**到 SDK，端口在 agent-host | 上一行的全部消费者 | `horizontal/agent-host/src/inference.ts` | agent-host → SDK | 已完成 | 同上，加 `tests/prologue-inference-images.test.ts` |
| JSON 输出解码 | **已下沉**：SDK 的 `decodeJsonOutput`，agent-host 只再导出 | Jelly、Shelf、Alchemist | `decodePrologueJsonOutput` | 业务 → agent-host → SDK | 已完成 | `tests/alchemist-structured-output.test.ts`、`tests/jelly-model.test.ts` |
| Agent 工具循环、审批队列、检查点、压缩、子代理 | **已下沉**：SDK；角色与提示词是业务 | 助理、Coding、Schedule、创作台 | `services/agent-host` 合同 | 宿主 → agent-host → SDK | 已完成；助理就地拆分后搬包是路线 W4/W5 的事（决定 #3） | `tests/agent-host*.test.ts`、`tests/prologue-*.test.ts` |
| 动作网关工具（`find/read/change-capability` 等） | **共享**：适配器在 agent-host，目录、受众、权限语义来自业务 | 助理、Coding、其他 Agent | `prologue-action-gateway.ts` 导出的工具名与 `ActionView` | 业务目录 → 网关 → SDK 工具 | 不迁；§6 的描述与受众问题在目录那一侧修 | `tests/agent-action-tools-prologue.test.ts` |
| 指令登记与用户覆盖（`InstructionPrompt`、`resolveModelPrompt`） | **保留**：产品身份与体验，设置页要给人看和改 | 全部入口 | `packages/contracts` 的 `platform/model-prompts` | 业务 → 合同 | 不迁 | `tests/prompt-registration.test.ts` |
| 各插件的提示词正文与领域校验（Pages 命令、Todo 整理、Cognia 引用、Alchemist Zod、Jelly 计划校验、Shelf 配方） | **保留** | 各自插件 | 各插件的 `prompts.ts` 与动作合同 | 插件 → 合同 | 不迁 | 各插件 README 的必跑测试 |
| 判断规则语义（Functions 模块：规则、绑定、历史） | **保留**；协议适配已在 SDK | Inbox、Feed、首页、实验、创作台 | `modules/functions` | 宿主 → 模块 → SDK | 不迁 | `tests/workflows-judgment-link.test.ts`、`tests/inbox-automatic-scenes.test.ts` |
| 本机 OCR 与语音转写 | **暂缓** | Shelf、Jelly | `material-native.ts` 的 `MaterialExtraction` | 宿主 → 原生进程 | 不动；只有「本机模型纳入 Prologue」的口径变了才议 | `tests/jelly-native-material.test.ts` |
| 外部终端 Agent、实验的 grok/laya | **暂缓** | Shelf、实验、角色 | 无统一合同 | 宿主 → 子进程 | 不动 | `tests/experiments-*.test.ts`、`tests/shelf-*.test.ts` |

## 5. 旁路与绕过核查

任务书 §8：检查供应商直连、旧执行器和绕过约束的 fallback，检查 Runtime 结束、权限撤销或配置变化后是否仍产生副作用。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 供应商直连 | 没有（§1 第 1 项） | 全仓源码搜索，命令见 §8 |
| 旧执行器 | `CliAgentAdapter` 是唯一一个：默认注册、没有内置调用方 | §3.8 EX-6 |
| 带绕过的 fallback | 没有「模型失败就换别家」；固定模型不可用时明确拒绝、不切供应商（Alchemist、Cognia、Shelf、生成插件都一样）；`actions.configuration_changed` 把「生成期间模型或连接变了」当失败，结果不提交 | `host-complete-text.ts`、`alchemist-prologue.ts`、`shelf-ai.ts` |
| 撤权、取消、配置变化后的副作用 | 有界调用：派出前后各复查，返回后再核一次快照，被取消、撤权、停用的不再写任何记录；宿主作业（HJ-1 至 HJ-3）没有按次授权，靠「项目还在」和写入门 | `tests/action-before-effect.test.ts`、`tests/action-model-scheduling.test.ts`、`memory-learning.ts` 的 `stillWanted` |
| 旧的假数据路径 | Pages 的 `stub` 已经是死字段：处理器只返回 `stub: false`，目录输出合同写死 `{ const: false }`（`plugins/native/pages/src/actions.ts:107`），但编辑器里仍有「未接模型」标签分支（`editor-browser.ts:3333`）和 `actionItemsFromText` 里剥除 `【未接模型…】` 行的正则（`ai.ts:85-86`）。已经不会再产生占位文稿 | 读码 |
| 自动触发 | 只有用户启用的场景（Feed 捕捉、Inbox 下一步、首页下一步）会在事件到达时调判断；没启用就不调；定时的 Agent 任务只在用户创建后按钟点跑 | `scenes.enable:*`，`schedule-task-runner.ts` |

## 6. 工具能否被理解与选对

任务书 §8：名称、描述、约束与副作用清楚；工具不严重重叠；按需发现，避免全塞；失败结果可处理；结果关联真实产物与记录。

事实（P 探针，agent 受众，全权限，临时 Home）：

- **按需发现，不是全塞。** 助理只有 `find-capabilities` 一个入口找动作，每次最多返回 8 条（`prologue-action-gateway.ts` 的 `FIND_LIMIT`），描述截 600 字，带 `effect`（read、change、reversible-change、irreversible-change）；外部 MCP 只列用户逐项授权过的动作。agent 受众的目录有 537 个动作，不会一起进提示词。[已确认]
- **输入输出合同齐全。** 537 个动作都有输出合同；没有一个缺失。
- **描述质量。** 描述长度中位数 31 字，最短 6 字。`description` 与 `title` 完全相同的有 4 个，都是首页的判断动作（`home.judgment.evaluate`、`home.judgment.read`、`home.judgment.write`、`home.recommendations.read`，`apps/local-host/src/home-actions.ts` 的 `define` 把 `title` 同时写进 `description`）；少于 14 字且与标题不同的有 17 个（如 `pages.get`「读取当前项目的一篇文档」、`shelf.jobs.cancel`「取消运行中的处理任务」，信息够用但没写副作用与前置）。
- **同名工具。** 16 组动作有相同的 `title`：每个插件的 `search.entries` 与 `subject.read` 同名（如 `pages.search.entries` 与 `pages.subject.read` 都叫「文档」），另有 `images.jobs.get` 与 `pages.generations.get` 都叫「读取生成任务」、`todo.batch.subject.read` 与 `todo.organize.list` 都叫「整理结果」、`todo` 的三个读取都叫「待办」。助理靠 `capability_id` 区分，但标题相同会让搜索结果里分不出哪个是搜、哪个是读。
- **无模型时的可发现性不一致。** 目录里把「没有模型」标成不可用并写明原因的是 13 个动作（Pages 2、Inbox 1、PPT、Form、Dataset、Todo、灵光、Cognia 2、Jelly、Shelf、信息助手）；Alchemist 的 5 个、Workflows 的 `instances.continue`、实验的 `experiments.run`、`images.jobs.start`、`coding.runs.start` 在目录里可用，调用时才失败，助理会选它们、调用、拿到错误才知道。

这几条不是缺陷清单里最重的，但它们是「AI 能否理解并选对」的直接证据，修起来也便宜（描述、标题、可用性声明），收进 §7 第 4 项。

## 7. 发现与待决

按建议顺序。需要用户决定的标 **决定**，其余是我按日常取舍可以直接做的。

1. **决定：agent-host 的 `CliAgentAdapter`（`claude` 命令行）。** 默认注册、没有内置调用方、只有测试用它，约 730 行（`cli-runtime.ts`、`cli-node-process.ts`、`cli-stream.ts`），在公开 API 快照里。选项：（a）删掉并把它从 agent-host 的公开入口移走，`pnpm api:update` 记录；（b）留着但不再默认注册，由将来「外部运行时」方案启用；（c）保持现状。**推荐 (a)**：用户口径是外部 Agent 运行时暂缓，现有代码没有人用，留着只会让「Runtime 列表」里多一个永远不被选中的选项，也算一条「不留旧执行器」的尾巴。
2. **决定：实验里的 grok/laya 要不要进 AGENTS.md。** `CALL-CHAINS.md` §10.1 已登记为长期例外，但 AGENTS.md 的硬约束写的是「模型调用只经 `horizontal/agent-host`」，没有例外条款。选项：（a）AGENTS.md 加一条独立的短说明，指向 §10.1；（b）只在 CALL-CHAINS 登记（现状）；（c）把实验的本地调用也迁到 agent-host 的外部运行时适配器（和上一项一起做）。**推荐 (a)**，一行就够，且把「例外要有登记和删除条件」写成规则。本片按「只加一条、不改已有条」的约束没有动 AGENTS.md。
3. **清理：Pages 的 `stub` 死字段与「未接模型」残留**（§5）。删 `PagesAiResult.stub`、输出合同里的 `stub` 属性、`editor-browser.ts` 的标签分支与 `actionItemsFromText` 的剥除正则；输出合同变了要 `pnpm api:update` 并在说明里写「`pages.ai` 的输出少了 `stub` 字段（本来恒为 false）」。
4. **清理：工具描述与可用性。** 给 4 个首页判断动作写真正的描述；给 17 个短描述补上副作用与前置；`search.entries` 与 `subject.read` 的标题改成「搜索文档」「读取文档」这类动词开头的名字；给 Alchemist、`workflows.instances.continue`（按步骤是否 AI）、`experiments.run`、`images.jobs.start`、`coding.runs.start` 声明「没有模型或连接时不可用」的可用性，让助理在发现阶段就看到原因。改标题与描述属于合同文字变化，要刷新 API 快照与动作合同快照（W2-15）。
5. **补：Schedule 创建时的就绪检查。** 创建与启用任务时现在不查 Prologue 与项目工作区，到点才失败（§3.1 AG-3）。建议创建对话框在没有模型或没有绑定工作区时就给提示，并保留创建（用户可能稍后配置）。属产品行为，先问；我倾向「提示但不挡」。
6. **补：`TYPESAFE_API_KEY` 的说明与优先级。** 它盖过 Home 里选的连接，界面会写「来自 TYPESAFE_API_KEY」，文档没有。建议在 `docs/platform/PROLOGUE-AI.md` 第 147–148 行旁补一句，说明它与 `MINIMAX_API_KEY` 同属开发与实测变量、会盖过界面选择。
7. **留意：宿主作业没有按次授权**（HJ-1、HJ-2）。记忆提炼与整理在模型调用前后只查项目还在不在，不像动作调用那样复查授权；写入由记忆服务的写入门兜底，目前没有已知的越权路径，所以不单独开片，写在这里让将来改记忆时记得。
8. **留意：Cognia 的「检索」是关键词子串打分**（`plugins/native/cognia/src/ai.ts`：把问题分词后数标题与正文里包含的词），没有向量或 BM25；README 与界面把它叫「带来源检索问答」。结果有引用、可核对，但召回质量是 BL-036 一类的后续事项，不在本轮范围。
9. **文档：`docs/platform/PROLOGUE-AI.md:57` 与代码不符。** 它写 Jelly「每次分段摘要或合并都在派出前复查原 Action 的 `beforeEffect`」；现在 Jelly 只剩拆解计划一条登记指令，没有摘要或合并调用，原生素材 README 也写明已删除没有生产调用方的本机 summarize 分支（`apps/local-host/native/materials/README.md`）。改那一句，留拆解的守卫说明。

## 8. 复现方法

- **直连搜索**：`git grep -nE "api\.openai\.com|api\.anthropic\.com|api\.x\.ai|minimax|openrouter|generativelanguage|dashscope|api\.deepseek|moonshot|ollama|lmstudio" -- apps packages modules horizontal plugins server tooling ':!**/tests/**'`，和 `git grep -nE "(^|[^.A-Za-z_])fetch\(|https?\.request\(|node:https|undici" -- apps/local-host/src apps/mcp/src apps/cli/src apps/desktop/src plugins modules horizontal 'packages/*/src' server/src ':!**/*.test.*' ':!apps/workbench'`（**不要排除名字带 `client` 的文件**；浏览器里跑的 `*-client.ts`、`*-ui.ts` 要逐个看是不是服务端）。前者命中的只有设置里的占位文字、注释与「暂缓」那几个文件；后者命中的是 §1 第 1 项列的八类，没有模型厂商。
- **SDK 导入者**：`git grep -l "@prologue/sdk" -- ':!vendor' ':!pnpm-lock.yaml'`，源码文件都在 `horizontal/agent-host`。
- **目录探针**：在 `tests/` 下临时放一个测试文件，`new MolisWorkLocalHost({ homeDirectory })` 开临时 Home，建项目并加全部项目插件，先用空权限 `inspectActions` 收集全部动作的权限并集，再以该并集为权限、`audience` 分别取 `"user"` 与 `"agent"` 重读；筛 `action.execution?.cost === "metered"` 或权限含 `model:invoke`、`functions:invoke`、以 `:generate` 结尾的；可用性看 `view.availability`。用完删文件。本文的 38 个与 537 个就是这样数的。
- **门禁**：`node scripts/run-tests.mjs tests/action-model-scheduling.test.ts tests/prompt-registration.test.ts tests/host-inference-completion.test.ts`。
