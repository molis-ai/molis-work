# Prologue AI 开发手册

状态：2026-09-27 按 main（8b609527）之后的代码整理，示例与文件位置均为实际代码。执行时的步骤清单在 Skill：[`skills/molis-prologue-ai/SKILL.md`](../../skills/molis-prologue-ai/SKILL.md)；本文解释架构、调用链和为什么。插件的通用写法仍以 [`skills/molis-plugin-dev/`](../../skills/molis-plugin-dev/SKILL.md) 为准。

用户口径（不要扩大）：「AI 能力都用 Prologue」指**模型调用经过同一 Home 的 Prologue Runtime**，不是把模型搬到本地、也不是让 Prologue 管所有进程。Jelly 本机 OCR/Whisper、实验台本地模型、外部 CLI Runtime 暂不纳入。

## 1. 谁负责什么

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| 业务插件 / 模块（Pages、灵光、Coding…） | 用户意图、提示词正文、输入材料的选取、结果怎样写回自己的数据、失败时保留什么 | 选模型、拿密钥、直连供应商、构造 Runtime |
| Local Host（`apps/local-host`） | 把模型端口注入插件（`hostCompleteText`、`resolvePrologueInference`）；模型选择与凭据解析；项目/调用者身份；动作授权与调用记录 | 业务提示词、插件数据 |
| Agent Host（`horizontal/agent-host`） | 唯一直接依赖 `@prologue/sdk` 的包：有界推理、Agent 轮次、角色冻结、目录授权、审查队列、预算、MCP 接入、任务板、子代理、检查点、后台命令 | 业务含义、审批决定本身 |
| Prologue SDK（`vendor/prologue-sdk/*.tgz`，源码在 `molis-ai/prologue`） | 协议适配、流式事件、用量回执、取消、超时、会话/运行持久化、工具循环 | 产品身份、权限政策、界面 |

判断一段 AI 相关代码放哪：与业务无关、契约稳定、多个消费者需要的 → Agent Host，再稳定到跨产品的 → 下沉 Prologue；涉及产品身份、领域语义、权限政策或体验 → 留在业务层。

## 2. 三种用法，先选对

| 场景 | 用什么 | 例子 |
| --- | --- | --- |
| 一次有界的文字/结构化/图片/判断调用，没有工具 | Host 注入的端口：文字用 `hostCompleteText`，需要结构、进度和回执时用同一绑定的 `hostTextGeneration`（`apps/local-host/src/host-complete-text.ts`）；图片、TypeSafe 判断、需要用量时用 `resolvePrologueInference(home)` 的 `generateImages` / `evaluateTypeSafe` / `completeTextResult` | 灵光对话、Pages 写作助手与生成、Form/Dataset 的 AI 拟题拟列、Images、判断函数 |
| 有工具、工作区、审查的多轮工作 | Manifest `agent` 块声明角色，经 Host 能力 `agent.session.create.v1` / `agent.run.start.v1` / `agent.run.wait.v1` / `agent.run.control.v1` | Coding、Schedule 到点任务、Characters |
| 需要专门编排边界的新 Agent | 在 `horizontal/agent-host/src/adapters/` 为该场景新建适配器，仍用同一 Home Runtime | 插件创作台代码 Agent（`adapters/plugin-builder.ts`） |

不要为了统一把单次调用塞进 Agent 循环，也不要在插件或 Host 里直接依赖 `@prologue/sdk`——只有 `horizontal/agent-host` 声明了这个依赖（`scripts/workspace-packages.mjs`），其他包经它的公开入口使用。

## 3. 调用链

生成插件的 `model.generate` 使用 Action 上下文的项目和安装身份选择提示词来源：安装调用读取自己的发布版本，创作台实时试运行读取当前构建。只有该版本声明的 id 才能派出；不能使用 Home 设置页中的聚合默认来代替。安装版应用既有 Home/owner/prompt 用户覆盖，试运行使用构建正文，以便检查作者修改。覆盖的历史和共享范围不变，登记的启停与注销按项目/安装隔离。读取构建文件后先复查授权和取消，再记录使用、进入共享 Prologue；使用记录保留实际发布默认版本。

### 有界推理（以 Pages 写作助手为例）

```text
页面 → 插件 HTTP 路由（只转发）
  → 动作 pages.ai（plugins/native/pages/src/actions.ts，声明 model:invoke 与 scheduling: "concurrent"）
  → Host 组合适配 apps/local-host/src/pages-actions.ts：注入 completeText，未配置模型时报 actions.connection_required
  → hostCompleteText（apps/local-host/src/host-complete-text.ts）：固定这次的供应商与模型、读凭据快照、每次派发前复查配置与凭据、120 秒上限
  → resolvePrologueInference(home)（apps/local-host/src/prologue-inference-host.ts）：取该 Home 唯一的推理绑定，由 system-agent-service.ts 装配
  → createPrologueInference（horizontal/agent-host/src/adapters/prologue-inference.ts）：临时会话、借助 SDK collectRun 收集结果、取消与超时
  → Prologue Runtime → 供应商
  ← 处理器核对文档版本未变，再把候选正文交回页面
```

### Coding 草稿与 Cognia 的单次调用

Coding 的 `agent.draft-text.v1` 经 `agent-host-composition.ts` → `model-draft.ts` → `hostTextGeneration` → 当前 composition 的 inference。正文和写法由 Coding 提供，无工具、不建每次起草的 workspace 或 Runtime；用量仅在 input/output 都为 reported 时提供，否则为 null。调用的 signal 与 beforeEffect 经 Host Capability 合同传入，调用方可以取消自身操作而不能改变身份。

Coding 的提交说明与接续摘要定义在 `plugins/native/coding/src/prompts.ts`，共同目录登记 `CODING_INSTRUCTIONS`。请求传 `{ purpose, prompt: CODING_COMMIT_DRAFT.prompt_id, material, model_selection }`；Host 从原 invocation 的插件身份确定 owner，再读取用户修改后的有效正文，材料仍单独传递。输入不能冒充 owner；未知引用或缺失身份拒绝派出。请求必须带已登记的 `prompt`，不再接受 `instructions` 字符串。Prompt 使用记录在初次授权复查之后写入，原授权等待与模型执行共用两分钟生命周期；取消或撤权后的迟到检查不登记使用、不启动模型。

Cognia 的资料选择、提示词、Markdown 与引用校验由 `plugins/native/cognia/src/ai.ts` 拥有。`cognia-prologue.ts` 只固定目录中的模型并注入 `hostCompleteText`，使用 Home 已绑定的同一 Runtime；不再建立 cognia/runtime/runs。发现只读元数据，执行才解析凭据。

Alchemist 的 `alchemist-prologue.ts` 复用同一模型目录与 `hostTextGeneration`，不另行解密或复制配置比对逻辑；首次授权等待与模型执行复用 Kernel 的三分钟生命周期，固定模型不可用时明确拒绝，不切换供应商。Host 使用 SDK `decodeJsonOutput` 解码（显式允许整个响应的代码围栏），把语法成功/失败与原文、用量一起交给插件。`generateWithHost` 只做领域 parse；只有业务预算显式允许才纠正一次，纠正调用重新经过原派出授权。Zod 校验属于插件，不能把提示词中的 schema 宣称为 SDK 原生约束。

Alchemist 六类固定指令在 `src/prompts.ts` 登记为 `ALCHEMIST_INSTRUCTIONS`：方向生成、Copilot、研究交叉检查/综合、成果适用性和格式纠正。`systemPrompt` 接收 `InstructedPrompt`，研究维度作为 data，用户内容仍在 userPrompt；Host 在授权复查后解析当前 Home 的用户覆盖并记录使用。用户修改正文不改变领域校验或增加格式纠正次数；原预算/授权检查继续约束纠正调用。

Jelly 的 Host `completeJson` 同样使用 SDK JSON 解码，插件继续核实证据块 ID、逐字引用、章节顺序与计划内容。每次分段摘要或合并都在派出前复查原 Action 的 `beforeEffect`，返回后和持久化前再复查；不把取消或撤权写成成功摘要。

生成插件的 `model.generate` 经公共 Action → `plugin-builder/model.ts` → `hostTextGeneration`，返回既有 `{ text }`。模型派出和结果复查继续调用原 Action 的 `beforeEffect`；取消信号来自当前沙箱调用。无需 Builder Agent、工作目录或另一份运行 JSON，旧私有记录保持原位。只有设计和编码继续使用 Builder Agent，其 Run 也通过 SDK `collectRun` 有界收集全部终态，原检查、活动和业务记录仍由构建模块拥有。

`hostTextGeneration` 与 `hostCompleteText` 共用配置/凭据校验。前者返回 `value`、`run_ref`、`state: completed`、configuredModel、reportedModels 与 typed usage；`structured` 仅在请求的结构已通过 SDK 校验时出现。调用选项可提供 `system`、`structured: { mode: local | native, schema }`、`onProgress`、timeoutMs 和 maxOutputTokens。进度只用于展示，不代表结果已通过领域验证。失败的 `PrologueInferenceError.execution` 可带原运行与已发生的用量；取消和撤权仍由原错误说明，不能据此提交业务失败记录。

调用时限与取消同时覆盖 Runtime 准备、异步授权检查、模型执行和结果后的复查；检查等待结束后再次核对信号。调用方撤权的原因保持原有语义，不能被统一改写成供应商失败。

SDK 的 schema 支持明确的类型、nullable/anyOf、必填、enum、对象字段、数组项、字符串/数组长度及数值上下限。未知关键字发出前拒绝；native 不支持不会暗降级 local。领域校验和是否允许付费格式纠正由业务 owner 决定，默认没有格式自动重试。

可执行示例：`tests/coding-commit-draft.test.ts`、`tests/cognia-prologue.test.ts`、`tests/alchemist-host.test.ts`、`tests/prologue-inference-native.test.ts`，均有真实 SDK 路径；本地模型服务不代表商业供应商质量验收。

### Agent 轮次（以 Coding 为例）

```text
Coding 页面 → plugins/native/coding/src/routes.ts
  → agent.run.start.v1 → AgentHost.start（horizontal/agent-host/src/index.ts）
      冻结角色（Manifest + BUILTIN_PLUGIN_AGENTS 的提示词正文）→ 核对目录授权 → 核对原会话归属（project/plugin/install/actor）
      → 解析 Character 固定版本 → 组装宿主工具与动作工具（精确引用）
  → Prologue 适配器（adapters/prologue-node.ts）运行工具循环
      写文件/跑命令/调用写入动作 → AgentReviewQueue（reviews.ts）等人批准
  → 报告、变更集作为 Artifact 发布
  ← agent.run.wait.v1 长轮询把运行视图推给页面；agent.run.control.v1 暂停/继续/停止/追加指令
```

## 4. 新增一个 AI 能力：调用骨架与可执行示例

以下片段解释接缝，省略了输入合同、提示词构造和端口定义，不能单独运行。以「灵光对话」为蓝本（`plugins/native/lingguang/src/actions.ts`、`apps/local-host/src/lingguang-actions.ts`）。

**动作定义**：写明 `model:invoke` 权限；等模型的动作一律 `scheduling: "concurrent"`，否则它会占住整个项目的串行队列（门禁 `tests/action-model-scheduling.test.ts`）。

提供方还应在 `action.execution` 声明实际时限、费用类别和必要调用频率；这些事实经同一目录到达插件、Agent、Workflow 与 MCP，Kernel 执行明确声明的限额。生成插件的 `model.generate` 声明 120 秒、metered、每身份每分钟 20 次。Agent 的工具入口可以设置更短的上限。Native 的直接生成与 Coding/Images/Alchemist/Experiments 的后台启动都由提供方声明 metered，表示可能消耗计量额度；读取历史、配置和取消不因此标为收费。后台启动的 Action 返回后，任务自己的预算、取消和恢复继续有效，不能把整个任务时长填成处理器时限。计费未知保持 unknown，Action 超时不等于外部请求未执行，也不授权自动重试。完整字段语义见 [插件开发手册](./PLUGIN-DEVELOPMENT.md)。

```ts
message: define("conversation.message", "继续灵光对话", "结合所选灵光和历史生成回复；需要文字模型，失败保留原会话且不生成占位回复", "command",
  object({ id, body }), conversationState, [...read, ...write, "model:invoke"]),
// define() 里：...(name === "conversation.message" ? { scheduling: "concurrent" as const } : {})
```

**处理器**：先读快照 → 带着 `caller.signal` 调模型 → 返回后 `await caller.beforeEffect()` → 按快照提交。

```ts
bind(lingguangActions.message, async (input, caller) => {
  const snapshot = ports.withStore(store => store.conversation(input.id, projectId));
  if (!ports.completeText) throw new ActionError("actions.connection_required", "请先配置文字模型，再继续对话");
  const reply = (await ports.completeText(prompt, { signal: caller.signal })).trim();
  if (!reply) throw new ActionError("lingguang.empty_reply", "模型没有返回正文，输入已保留，可重试");
  await caller.beforeEffect();                        // 复查注册实例、授权、生命周期、作用域、取消
  return ports.withStore(store => store.addReply(input.id, input.body, reply, projectId, snapshot)); // 快照变了就拒绝
}, () => ports.modelAvailability()),
```

**Host 装配**：插件拿到的是函数，不是密钥或客户端。

```ts
const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
completeText: (prompt, options) => runWithMolisWorkHome(home, () => {
  const complete = model(); if (!complete) throw ...;
  return complete(resolveModelPrompt(home, prompt, "io.molis.work.lingguang"), options);
}),
modelAvailability: () => model() ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置文字模型…" },
```

**提示词登记与用户修改**：插件在 `src/prompts.ts` 用 `defineInstructionPrompt` 声明 owner、稳定 id、版本、用途、使用位置和默认正文，从包入口导出指令列表，在 `apps/workbench/src/builtin-plugins.ts` 的同一插件项声明 `instructions`；Host 从共同目录派生登记。插件端口接收 `InstructedPrompt`，调用传 `instructed(LINGGUANG_CONVERSATION, JSON.stringify(materials))`；Host 经 `resolveModelPrompt` 读取有效正文并记使用版本，之后才交给共享推理入口。用户材料与本次参数属于 data，不拼入可编辑的默认指令。材料中的指令不授予任何权限；超长先拒绝（灵光 18 万字符、Pages 10 万）。

生成插件声明 `export const prompts = [...]`，调用 `model.generate` 能力时传 `{ prompt: id, input }` 指定一段正文。Host 的 `plugin-builder/model.ts` 解析当前指令/用户覆盖，继续调用同一 `hostTextGeneration`；不接受写在代码里的 instructions。安装、停用、启用、版本切换、卸载与恢复的登记属于 `installed-plugin-host.ts`，不依赖打开创作台。设计与编码阶段则由 Builder 的 prompt 端口取有效正文，运行版本包含用户修订号。

Cognia 同时保留已登记的知识角色与回答指令：角色作为共享单次推理的 system 输入，回答指令与固定资料作为正文。可编辑的提示词必须真实进入调用，不能只有登记页面。`tests/cognia-prologue.test.ts` 与 `tests/plugin-model-generation.test.ts` 经真实 SDK 和本地 HTTP 核对用户覆盖、工具边界、取消和撤权；`tests/installed-plugin-host.test.ts` 核对真实安装生命周期。

### 在仓库里直接运行完整示例

先执行 `pnpm install --frozen-lockfile --offline` 与 `pnpm build`，再运行：

```bash
node scripts/run-tests.mjs tests/action-before-effect.test.ts tests/agent-budget-prologue.test.ts tests/agent-built-plugins-agent.test.ts
```

这三份可执行源码各有完整输入、端口、临时 Home 和清理逻辑：

- [`action-before-effect.test.ts`](../../tests/action-before-effect.test.ts)：真实动作注册 → 延迟模型端口 → 撤权/替换/取消 → SQLite 状态保持 → 正常恢复。适合复制 Native 单次调用的宿主装配；模型是端口替身。
- [`agent-budget-prologue.test.ts`](../../tests/agent-budget-prologue.test.ts)：真实 Prologue Runtime → 固定角色与预算 → 工具调用/最终消息 → 停止原因与用量约束。只在测试的独立 Home 创建 Runtime；HTTP 是受控替身，不访问外部模型。
- [`agent-built-plugins-agent.test.ts`](../../tests/agent-built-plugins-agent.test.ts)：创作台阶段的 Skill 正文及版本真正进入 Prologue 的模型请求，包括 [生成插件 AI 章](../../skills/molis-plugin-dev/generated-ai.md)。

这些示例证明工程调用和恢复边界，不代表真实供应商或生成质量已验收。产品接入复用常驻 Host 的 Runtime，不能把测试里新建 adapter 的做法复制到每次按钮调用。

## 5. 模型、凭据、上下文

- 模型来自设置里的 `catalog.models` 与服务连接；`hostCompleteText` 发现阶段只读元数据，执行前才解密，派发前与返回后都核对「这次固定的供应商/模型/凭据」没变，变了报 `actions.configuration_changed` 且不提交结果。
- 产品里只有模型目录配置模型；没配时提示去设置。密钥库里目录之外的旧凭据（`model:text:api_key`）不读。
- 环境变量只给开发与测试用，且仅在 Home 的模型目录为空时生效。已有目录记录或明确选择时，它不能绕过停用。
  - `MINIMAX_API_KEY`：MiniMax。端点默认 `https://api.minimaxi.com/anthropic`，模型默认 `MiniMax-M3`；实测用 `appkey exec minimax` 注入。
  - `MOLIS_WORK_TEXT_API_KEY`：不指定供应商，必须同时给 `MOLIS_WORK_TEXT_BASE_URL` 与 `MOLIS_WORK_TEXT_MODEL`，缺一个就不配置（不会默认成 MiniMax）。
  - 两者都可选配 `MOLIS_WORK_TEXT_API_FORMAT`（`anthropic-messages`，默认；或 `openai-chat-completions`）。`MOLIS_WORK_TEXT_BASE_URL` 也能改 MiniMax 的端点。
- 业务插件只拿 Host 注入的函数端口；Host 到 Agent Host 的输入才使用 `credential_ref` + `resolveCredential`。插件不拿凭据解析器或明文；日志、事件、错误和产物里不出现密钥。
- 一次调用只带这次需要的材料，不隐式读整个项目；用户正文是数据不是指令。

### 原图输入

可信 Local Host 可以给 `hostTextGeneration` 传 `images: [{ root_path, relative_path, label? }]`。根目录及相对路径必须由 Host 从当前已授权材料中解析，不能从模型输出或插件 JSON 直接授权。已配置模型必须声明 `vision: true`；环境变量配置的模型不推定具备视觉能力，也不自动换模型。配置、视觉声明和凭据在实际派出及返回时仍重新核对。

Agent Host 复用同一 Runtime 的只读 workspace、Node Host intake 和 Session attachments，按实际字节识别 PNG/JPEG/GIF/WebP，不把 OCR 文本冒充原图。单图最多 32 MiB，每次最多 30 张、合计 128 MiB，还受 Home 共享资源余量约束；超限拒绝整次派出。普通 `resources.stage().publishDurable()` 没有 Host 字节位置，不能用来伪造模型附件。附件不会向模型开放目录或文件工具。

读取前、异步等待后及网络派出前保留原授权检查，成功、失败、取消都撤销附件并销毁 Host 暂存字节，输入原件不变。取消可先释放调用方，关闭执行 owner 仍等待资源清理。任务材料如何选择、PDF/目录如何组织、结果何时写入仍归消费者；SDK 支持附件并不代表某个插件已完成迁移。真实协议和字节回归见 `tests/prologue-inference-images.test.ts`，模型视觉声明与变更见 `tests/host-configured-text.test.ts`。

## 6. 工具、权限、审批、预算、用量

- **角色执行等级**（`packages/contracts/src/platform/plugin-agent.ts`）：`read-only`（缺省）、`text-edit`、`workspace-write`（要求 Runtime 支持 text-edit 与 command）。角色不能在启动时自行加宽；`workspace: "none"` 的纯推理角色不能带目录、工具或子任务。
- **宿主工具**：角色声明 `host_tools`（如 `read-file`、`search`），实现和效果分类归 Host。
- **动作工具**：`action_tools` 只接受精确引用（capability_id + version + provider_id），调用仍走统一动作服务与逐客户端授权；动作的 `effect`（read/write/irreversible）决定是否要审查、是否对生成插件开放。
- **审查**：写文件、跑命令、调用写入动作都进 `AgentReviewQueue`，由人批准；批准不等于已发生，执行前再复查授权。
- **预算**：`AgentRunBudget`（`max_turns`、`max_output_tokens`、`max_total_tokens`、`max_duration_ms`），在 SDK 里真实执行（`tests/agent-budget-prologue.test.ts`）。
- **用量**：来自 SDK 的 `usage-recorded` 回执；供应商没报就显示未知，不填 0，也不按请求推断模型名（`reportedModels` 可为空）。

## 7. 注册、入口与事件

- AI 能力就是一个动作：注册一次，页面、工作流、内置 Agent、外部 MCP 共用同一处理器和授权（见 `specs/action-architecture/spec.md` §3「基本合同」）。不要另写 MCP 工具表或宿主分支。
- 只有 Runtime 托管的 app 插件（Coding 家族）有插件事件总线；Native 插件没有。
- 长任务用持久记录 + 查询（如 Images 任务、Pages 生成记录），不要把「已启动」返回成「已完成」。

## 8. 流式、结构化输出、错误、取消、超时、恢复

- **流式**：Agent 轮次用 `agent.run.wait.v1`（最长 25 秒的长轮询，按版本返回变化）；有界推理可用 `onProgress` 观察原 Run 的文本、模型和用量事件，最终结果仍需等待终态与领域校验。
- **结构化输出**：SDK `structured` 执行明确支持的 schema；`decodeJsonOutput` 只处理格式，不能替代领域验证。Alchemist 默认不纠正，仅在原业务预算明确允许时增加一次；Jelly 不自动重试。判断类用 TypeSafe（`evaluateTypeSafe`），返回 Choice/Score/Noul。
- **错误**：推理层抛 `PrologueInferenceError`（保留 `code`，文字统一为安全文案）。消费方先用 `inferenceServiceUnavailableReason(error)` 识别「执行服务被本机另一进程占用 / 未就绪」，如实告诉用户，不要改写成网络或厂商问题；宿主自己的派出前复核（`beforeDispatch`、凭据是否变了）拒绝时，SDK 报 `EFFECT_NOT_AUTHORIZED`，推理层把复核自己抛的错误原样交回，消费方用 `isDispatchRefusal(error)` 识别并说明「没有发出」；Agent 轮次的 `stop_reason` 同样以 `EFFECT_NOT_AUTHORIZED` 开头；HTTP 4xx/5xx 按状态给可操作提示。
- **取消**：`caller.signal` 一路传到 SDK（`run.cancel()`）；被取消、撤权、停用的调用**不再写任何记录**，包括失败记账（action-architecture F2，`tests/action-before-effect.test.ts`）。需要让用户能立刻重试的，用「发起者已结束即可接管」的设计，而不是在被拒绝后写记录。
- **超时**：文字 120 秒、`max_output_tokens` 5000（`host-complete-text.ts`）；Agent 用预算里的 `max_duration_ms`。
- **恢复**：Agent 会话用 `agent.session.recovery.v1` / `agent.session.recover.v1`；长任务靠持久记录与幂等键（`request_id`），重试不重复调用模型、不重复写入。

## 9. 常见错误（都真实发生过）

| 错误 | 后果 | 正确做法 |
| --- | --- | --- |
| 等模型的动作没声明并发 | 一次对话把整个项目的操作卡住数分钟 | `scheduling: "concurrent"` + 返回后按快照提交 |
| 在同一 Home 再起一个执行进程/宿主 | `inference.home_in_use` 或 `agent.storage_busy` | 一个 Home 一个执行归属；MCP 等入口转发给常驻 Web 宿主 |
| 在 Prologue 上登记全局钩子并对别人的会话回 `later` | 并发构建互相挂起 | 钩子一律 `forSession` |
| 被拒绝后仍写失败记录 | 违反 F2，撤权后仍改数据 | 被拒绝就不写；可重试性另行设计 |
| 把执行服务不可用报成网络问题 | 用户去查网络 | `inferenceServiceUnavailableReason` |
| 把派出前被拒（Character 停用、授权收回、密钥变了）报成网络或模型失败 | 用户去查网络；带备选模型时还会换目标再被拒一次 | SDK 报 `EFFECT_NOT_AUTHORIZED`、不换备选；消费方用 `isDispatchRefusal` 说明没有发出 |
| 协议名直传给 Prologue | 所有运行在到达模型前失败 | 用 `prologueProtocolFor`（`model-configuration.ts`）映射 |
| MiniMax OpenAI 兼容通道把 `<think>` 当正文 | 结果里混入推理 | 用 anthropic-messages 通道，或剥离后再解析 |
| 测试里 mock 全局 `fetch` 拦模型 | 模型已走 Prologue，测试失效 | 在 `bindPrologueInference(home, client)` 接缝替身，或给 Host 传 `completeText` |

## 10. 测试与验收

- 单元与动作层：`new MolisWorkLocalHost({ homeDirectory, completeText })` 注入受控模型；或 `bindPrologueInference(home, { completeText, … })` 在生产接缝替身。断言端点、协议、凭据真正到达推理边界，而不是只断言被调用。
- 副作用前检查：照 `tests/action-before-effect.test.ts` 覆盖「等模型时撤权 / 停用 / 取消」三种，验证不写入、可恢复。
- 并发：`tests/action-model-scheduling.test.ts`（门禁）；需要时像 `tests/lingguang-actions.test.ts` 那样验证等模型期间同项目读写照常完成。
- 真实 SDK：`tests/agent-budget-prologue.test.ts`、`tests/agent-action-tools-prologue.test.ts` 用本机替身模型服务驱动真实 Prologue。
- 真实模型：用户配置的 MiniMax（anthropic-messages）；`scripts/verify-model.mjs`。图片与 TypeSafe 无法用 MiniMax 测，需各自服务。
- 验收要分清：源码审查、替身、真实 SDK、真实模型、产品实操、用户验收；未做的写成未验证。

## 11. 通用、Coding 专属与其他场景

- 通用（所有 AI 能力）：第 4–8 节。
- Coding 专属：会话/轮次/计划/委派、子代理并行、跨轮摘要、Git 提交说明起草（`agent.draft-text.v1`）、协同与等待——见 `specs/coding-plugin/spec.md`，不要照搬到单次调用场景。
- 插件创作台：专用代码 Agent 与沙箱，见 `specs/archive/plugin-builder/work-items/studio-v3/spec.md`。
- 判断函数（Jev/TypeSafe）：系统级 `modules/functions`，场景绑定与消费见 `specs/action-architecture/spec.md`「函数调用与 Jev 判断」。

Coding 的后台 follower 按 activation 观察 Run，停止后取消等待并拒绝晚结果；Run 停止或待核对时发 `run-updated` 刷新提示。Git 从 Prologue Effect 与 dispatch 回执核对后的 ReviewQueue 新结果发 `operation-updated`，恢复历史保持静默。两者触发 Files/Git 重新读取现状，不声称一定改了文件，也不因通知失败重试原执行。


Shelf 自动动作经 `shelf.jobs.generate` → `ShelfAiPorts` → Host 配置模型 → 同 Home Prologue。模型选择与人工终端 engine 独立；固定指令按 recipe/option 登记，用户 shortcut 作为数据，材料使用冻结副本。任务保存完整回执、真实 reportedModels 及 unknown 用量，JSON 只复用 SDK 解码，领域拒绝非对象和纯进度文本。不自动修复或重跑计费请求。`shelf.jobs.extract` 继续本机提取，不要求模型权限。旧 jobs.run 只做兼容分派，AI 分支仍须 model:invoke；新消费者用成本明确的独立 Action。

### Builder 的界面截图

Builder `images` 是宿主持有的 PNG 字节（最多 9 张、总共 12 MiB），经授权目录的 Prologue Intake 发布为资源，再作为 `start.attachments` 传入。同一 Home Runtime 负责模型、凭据、取消与协议发送；运行 JSON 不保存 base64。临时文件与图片资源在结束后清除/撤销。`resources.stage` 的 JS 字节不能替代 Host-backed Intake 附件。

UI 复查只使用隔离验收数据，不截整个工作台；只使用当前选定且声明 `vision: true` 的模型，缺失或失败时不宣称视觉通过。
