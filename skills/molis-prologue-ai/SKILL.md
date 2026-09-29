---
name: molis-prologue-ai
description: How to add or change an AI capability in Molis Work — anything that calls a model (text, structured output, images, TypeSafe judgments) or runs an Agent (tools, workspace, review) — through the Home's Prologue Runtime. Use when a change touches model calls, prompts, Agent roles or runs, model settings or credentials, AI budgets or usage, review of Agent side effects, or code in horizontal/agent-host. Not needed for plugin work that never calls a model.
---

# Molis Work 里的 AI 能力怎么做

架构与示例在仓库手册 [`docs/platform/PROLOGUE-AI.md`](../../docs/platform/PROLOGUE-AI.md)（只在源码仓库里，不随安装包发布）；本文是执行清单，单独也够用。插件本身怎么写仍按 [`molis-plugin-dev`](../molis-plugin-dev/SKILL.md)。

生成插件沙箱使用 [generated-ai.md](../molis-plugin-dev/generated-ai.md)：通过 `model.generate` 进入同一 Home Runtime；创作台设计与代码阶段都直接挂载该章。不要给沙箱套 Native 的 `caller.beforeEffect()` 接口。

## 什么时候读

- 动作或页面要调模型、生成图片、做 TypeSafe 判断。
- 插件要跑 Agent（Manifest 的 `agent` 块、角色、提示词、宿主工具、动作工具）。
- 改模型设置、凭据解析、预算、用量、审查队列，或 `horizontal/agent-host` 的任何代码。

纯界面、纯存储、不碰模型的插件功能不用读。

## 先读

1. 手册第 1–3 节（分工与调用链）。
2. `specs/action-architecture/spec.md` §3「基本合同」与 F1–F4（身份、副作用前检查、预算、交接）。
3. 你要仿照的现有实现：单次调用看灵光对话（`plugins/native/lingguang/src/actions.ts` + `apps/local-host/src/lingguang-actions.ts`）；Agent 看 Schedule（`plugins/native/schedule/src/roles.ts` + `apps/local-host/src/schedule-task-runner.ts`），复杂的再看 Coding。

## 判断放在哪

| 这段逻辑是… | 放在 |
| --- | --- |
| 提示词正文、选哪些材料、结果怎么写回、失败保留什么 | 业务插件 / 模块 |
| 模型选择、凭据、身份、授权、调用记录 | Local Host |
| 推理、Agent 轮次、角色冻结、审查、预算、MCP、任务板 | `horizontal/agent-host` |
| 与业务无关、多个产品都需要、契约稳定 | 下沉 Prologue（先和 SDK 负责人确认，改 vendored 包按 `vendor/prologue-sdk/README.md`） |

## 步骤

原图输入使用共享 `hostTextGeneration` 的 `images: [{ root_path, relative_path, label? }]`：路径须由可信 Host 从已授权材料解析，不能从模型或请求 JSON 直接授权。模型目录须声明 `vision: true`，旧环境变量模型不推定视觉能力、不自动换模型。Agent Host 复用 SDK Node Host intake/Session attachments，真实格式限 PNG/JPEG/GIF/WebP，单图 32 MiB、每次 30 张/128 MiB，并受共享资源限额约束；超限拒绝、不静默截断或替换为 OCR。成功/失败/取消撤销资源及 Host 暂存字节，关闭 owner 等清理；原 Action 的 signal/beforeEffect、模型快照和业务提交检查仍须保留。PDF/目录组织和领域结果由消费者负责，不把 SDK 已支持当成插件已迁移。

1. **选用法**（手册第 2 节）：单次有界调用 → Host 端口；多轮带工具 → Agent 角色；专门编排 → 新适配器。不要为统一而套 Agent 循环。
2. **定义动作**：权限写 `model:invoke`；等模型的动作写 `scheduling: "concurrent"`；`effect` 与真实效果一致（名字里有 delete/remove/trash 会被推断为不可撤销，不对就用 `withActionEffect` 显式声明）。
3. **处理器**：读快照 → 把 `caller.signal` 传给模型 → 返回后 `await caller.beforeEffect()` → 按快照/版本提交；嵌套动作/场景用 `retainActionAuthority(caller, originReference, caller.beforeEffect)` 保留外层执行检查；空结果、超时、错误都不制造成功结果，输入保留。
4. **Host 装配**：只注入函数端口（`completeText`、`modelAvailability`），未配置时 `actions.connection_required`。插件不拿密钥、不依赖 `@prologue/sdk`。
   需要执行引用、结构化结果、进度或用量时使用同一绑定的 `hostTextGeneration`，不要再组模型/凭据或轮询 Run。`structured` 显式指定 local/native 与可支持 schema，未知约束拒绝而不忽略；领域 parse 留在插件。仅需要 JSON 格式解码时 Host 使用 Agent Host 公开的 `decodePrologueJsonOutput`（SDK 所有），围栏容忍显式启用；插件消费 JSON 值并验证业务含义，不能各自复制 JSON/围栏解析。`onProgress` 只表示过程，不授权业务提交。完整用量保留 reported/estimated/unknown，未知不当零；未报实际模型不填请求模型。默认不自动纠正格式，允许额外调用必须有界且重新预算/授权。
   Coding 的提交说明/接续摘要用 `CODING_INSTRUCTIONS` 登记，短草稿传 `prompt` id 与独立 `material`，Host 只从原 invocation 取插件身份并解析用户覆盖；旧 inline `instructions` 仅供兼容，不能与命名引用并用。调用走 `agent.draft-text.v1` → `model-draft.ts` → 共享 inference，无临时 Runtime/目录；Cognia 复用 `hostCompleteText`，Alchemist 复用 `hostTextGeneration`，六类固定指令使用 `ALCHEMIST_INSTRUCTIONS`，研究维度经 `InstructedPrompt.data` 传递；一次格式纠正也使用登记指令，仍须原预算与授权显式允许。模型目录使用 `configuredModelChoices` 的元数据检查，不能为发现而调用会解密的 health。Host Capability 的可选 signal 经 Plugin SDK 传到 invocation，只能取消自身调用；`beforeEffect` 仍需在派出与业务提交前复查，异步检查结束后也要检查取消和时限。
   - **提示词要登记，用户能看能改**：指令写在插件的 `src/prompts.ts`，用 `defineInstructionPrompt({ owner_id, prompt_id, version, title, purpose, used_by, body })` 声明，从包入口导出 `<插件>_INSTRUCTIONS`；调用时传 `instructed(指令, 数据)`，端口类型写 `InstructedPrompt`／`ModelPromptInput`，不收裸字符串。指令只写要求，用户材料和本次参数放在数据里。
   - Host 适配器经 `resolveModelPrompt(home, prompt, 插件 id)` 取有效正文（用户在“Prompt 与 Character”里改过就用用户版，并记一次使用）；内置插件的 `*_INSTRUCTIONS` 在 `apps/workbench/src/builtin-plugins.ts` 的同一插件项声明 `instructions`，Host 从共同目录派生登记。
   - 不经 Agent Host 的 Agent（如插件创作台）也一样：Prompt 登记在同一处，运行时经端口取有效正文，版本里写出 `+user.<修订号>`。
   - 生成插件先按可信调用上下文选择安装发布版或创作构建，再解析该版本已声明的 prompt；不能先查 Home 设置登记来选择默认正文。安装版应用现有用户覆盖，创作试运行验证构建正文。多项目登记按安装隔离，用户覆盖仍按 Home/owner/prompt 共享；卸载一个安装不能移除其他安装的登记。
5. **Agent 角色**（如需要）：Manifest `agent` 块声明 `execution`（缺省 read-only）、`prompts`（按角色列出，读者角色不要拿到写者提示词）、`host_tools`；提示词正文随插件包导出并在 `apps/workbench/src/plugin-catalog.ts` 的 `BUILTIN_PLUGIN_AGENTS` 可见；在 Prologue 上登记钩子一律 `forSession`。
6. **错误**：执行服务不可用用 `inferenceServiceUnavailableReason` 如实说明；派出前被宿主复核拒绝用 `isDispatchRefusal` 识别，说明「没有发出」而不是网络问题；供应商 HTTP 错误按状态给可操作提示；不要把 SDK 细节透给用户。
7. **取消与恢复**：被取消/撤权/停用的调用不再写任何记录；长任务用持久记录 + `request_id` 幂等，重试不重复调模型。
8. **文档**：新能力写进对应插件 spec；改了本清单涉及的契约，同一任务更新手册与本 Skill。

## 验证与验收

- `node scripts/run-tests.mjs tests/action-model-scheduling.test.ts`（等模型的动作必须并发，例外要写理由）。
- `node scripts/run-tests.mjs tests/prompt-registration.test.ts`（定义的指令必须已登记、插件端口不收裸字符串、Host 直接调模型只能在带理由的过渡清单里）。
- 仿 `tests/action-before-effect.test.ts` 覆盖「等模型时撤权 / 停用 / 取消」不写入且可恢复。
- 模型替身放在生产接缝：`new MolisWorkLocalHost({ homeDirectory, completeText })` 或 `bindPrologueInference(home, client)`；不要 mock 全局 `fetch`。
- 改了 `horizontal/agent-host`：跑 `tests/agent-*.test.ts` 与 `tests/prologue-*.test.ts`；动到真实 SDK 路径时用本机替身模型服务跑一次（见 `tests/agent-budget-prologue.test.ts`）。
- 真实模型实测用用户配置的 MiniMax（anthropic-messages）；图片、TypeSafe 需要各自服务，做不到就写「未验证」。
- 界面有变：浏览器里把主路径点一遍（加载、成功、失败、取消、未配置模型）。
- 交付时分清：源码审查、替身、真实 SDK、真实模型、产品实操、用户验收。

执行结果驱动通知时，从 Agent Host 的 Run 投影或 Prologue Effect/dispatch 回执读取真实结果；批准不等于执行成功，reconcile-required/unknown 也不是成功。Coding/Git 的刷新通知不重试模型或副作用，SDK 重启恢复历史回执时不重新发布“新执行”。订阅使用当前插件 activation 的独立身份，等待后复查，停止时释放。


Shelf 的自动 recipe 是共享 Prologue 消费者：固定指令登记在插件 prompts.ts，模型选择与人工终端 engine 分离。AI Action 明确 model:invoke 和 metered；本机提取是独立的 none 成本 Action，旧混合入口不能绕过 AI 授权。保留完整执行回执的 reported/estimated/unknown，JSON 解码读取 SDK 的 ok/value，领域约束再校验。材料部分覆盖进入最终结果说明；最终业务提交仍复查原调用、材料 hash 和可信 Host 返回的模型配置校验，不让最后一次 await 留出失效结果写入窗口。
