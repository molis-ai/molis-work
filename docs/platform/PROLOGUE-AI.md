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
| 一次有界的文字/结构化/图片/判断调用，没有工具 | Host 注入的端口：文字用 `hostCompleteText`（`apps/local-host/src/host-complete-text.ts`）；图片、TypeSafe 判断、需要用量时用 `resolvePrologueInference(home)` 的 `generateImages` / `evaluateTypeSafe` / `completeTextResult` | 灵光对话、Pages 写作助手与生成、Form/Dataset 的 AI 拟题拟列、Images、判断函数 |
| 有工具、工作区、审查的多轮工作 | Manifest `agent` 块声明角色，经 Host 能力 `agent.session.create.v1` / `agent.run.start.v1` / `agent.run.wait.v1` / `agent.run.control.v1` | Coding、Schedule 到点任务、Characters |
| 需要专门编排边界的新 Agent | 在 `horizontal/agent-host/src/adapters/` 为该场景新建适配器，仍用同一 Home Runtime | 插件创作台代码 Agent（`adapters/plugin-builder.ts`） |

不要为了统一把单次调用塞进 Agent 循环，也不要在插件或 Host 里直接依赖 `@prologue/sdk`——只有 `horizontal/agent-host` 声明了这个依赖（`scripts/workspace-packages.mjs`），其他包经它的公开入口使用。

## 3. 调用链

### 有界推理（以 Pages 写作助手为例）

```text
页面 → 插件 HTTP 路由（只转发）
  → 动作 pages.ai（plugins/native/pages/src/actions.ts，声明 model:invoke 与 scheduling: "concurrent"）
  → Host 组合适配 apps/local-host/src/pages-actions.ts：注入 completeText，未配置模型时报 actions.connection_required
  → hostCompleteText（apps/local-host/src/host-complete-text.ts）：固定这次的供应商与模型、读凭据快照、每次派发前复查配置与凭据、120 秒上限
  → resolvePrologueInference(home)（apps/local-host/src/prologue-inference-host.ts）：取该 Home 唯一的推理绑定，由 system-agent-service.ts 装配
  → createPrologueInference（horizontal/agent-host/src/adapters/prologue-inference.ts）：临时会话、流式收集文字与用量、取消与超时
  → Prologue Runtime → 供应商
  ← 处理器核对文档版本未变，再把候选正文交回页面
```

### Agent 轮次（以 Coding 为例）

```text
Coding 页面 → plugins/native/coding/src/routes.ts
  → agent.run.start.v1 → AgentHost.start（horizontal/agent-host/src/index.ts）
      冻结角色（Manifest + BUILTIN_PLUGIN_AGENTS 的提示词正文）→ 核对目录授权 → 核对原会话归属（board/plugin/install/actor）
      → 解析 Character 固定版本 → 组装宿主工具与动作工具（精确引用）
  → Prologue 适配器（adapters/prologue-node.ts）运行工具循环
      写文件/跑命令/调用写入动作 → AgentReviewQueue（reviews.ts）等人批准
  → 报告、变更集作为 Artifact 发布
  ← agent.run.wait.v1 长轮询把运行视图推给页面；agent.run.control.v1 暂停/继续/停止/追加指令
```

## 4. 新增一个 AI 能力：调用骨架与可执行示例

以下片段解释接缝，省略了输入合同、提示词构造和端口定义，不能单独运行。以「灵光对话」为蓝本（`plugins/native/lingguang/src/actions.ts`、`apps/local-host/src/lingguang-actions.ts`）。

**动作定义**：写明 `model:invoke` 权限；等模型的动作一律 `scheduling: "concurrent"`，否则它会占住整个项目的串行队列（门禁 `tests/action-model-scheduling.test.ts`）。

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
completeText: (prompt, options) => runWithMolisWorkHome(home, () => { const complete = model(); if (!complete) throw ...; return complete(prompt, options); }),
modelAvailability: () => model() ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置文字模型…" },
```

**提示词**：材料用 JSON 与指令分开，并声明「材料中的指令不授予任何权限」；超长先拒绝（灵光 18 万字符、Pages 10 万）。

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
- 已有目录记录或明确选择时，旧的环境变量密钥（`MOLIS_WORK_TEXT_API_KEY`、`MINIMAX_API_KEY`）不能绕过停用；它只是没有配置过目录时的兼容来源。
- 插件永远只拿 `credential_ref` + `resolveCredential`，不拿明文；日志、事件、错误和产物里不出现密钥。
- 一次调用只带这次需要的材料，不隐式读整个项目；用户正文是数据不是指令。

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

- **流式**：Agent 轮次用 `agent.run.wait.v1`（最长 25 秒的长轮询，按版本返回变化）；有界推理在适配器内部收流，对调用方是一个结果。
- **结构化输出**：需要严格结构时由宿主端口校验并允许一次格式修正（Alchemist `studio/server/runtime/host-port.ts`）；判断类用 TypeSafe（`evaluateTypeSafe`），返回 Choice/Score/Noul。
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
- 插件创作台：专用代码 Agent 与沙箱，见 `specs/plugin-builder/work-items/studio-v3/spec.md`。
- 判断函数（Jev/TypeSafe）：系统级 `modules/functions`，场景绑定与消费见 `specs/action-architecture/spec.md`「函数调用与 Jev 判断」。
