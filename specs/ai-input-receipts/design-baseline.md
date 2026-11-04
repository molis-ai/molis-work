# 输入回执的起草依据与接入约定

原 §1、§2、§13 和 §15 记录 2026 年 10 月起草时的能力、差距、依赖与代码线索。跨线约定按原编号保留，交接后的进度从[主文](spec.md)查。

[返回需求书](spec.md)

- [1. 现场与依据](#1-现场与依据)
- [2. 现状评估](#2-现状评估)
- [13. 与在途工作的关系](#13-与在途工作的关系)
- [15. 附：调研中发现的文档与代码不符](#15-附调研中发现的文档与代码不符)

## 1. 现场与依据

- **Molis**：按 origin/main `11878059`（2026-10-09）核对。主检出的本地 main `d81b12cb` 落后 394 个提交，它的行号与门禁不作依据。
- **Prologue**：主线 `4f7110fe`。Molis 现用包来自 `9fc3b173`（主线祖先，落后 24 个提交）。`feat/prologue-adoption` 正在把包换到主线并适配新事件，见 §13.1。
- **调研方式**：只读源码、需求册与外部产品文档；没有跑测试，没有动真实 Home。标 [推断] 的结论从代码推出，未经运行验证。
- **会影响落地的在途工作**：
  - 防腐整理第 2–6 波：巨大单元只减不增、`/assets/` 字节冻结、合同 API 快照、调用编号 W3-01、助理拆分 W4-05/W5-10、空闲轮询合并 W4-10、agent-host 合同拆分 W5-09。
  - `feat/prologue-adoption`。
  - PR #340（goal-closure-identity）。
  - `specs/ai-interaction-experience`（未入库）。

## 2. 现状评估

### 2.1 已有、可以直接用的

| 能力 | 在哪 | 真实程度 |
| --- | --- | --- |
| 运行中补充（steer）的持久接收 | SDK `control.steer`：先落账 `prompt{steerId}` 再返回；Molis `agent.run.control.v1 {kind:"steer"}`（`packages/contracts/src/services/agent-host.ts` 的 `AgentRunControl`） | 真，宿主重启后仍在账上 |
| 三态回执 | SDK 发 `steer-applied`；投影成 `AgentTurnView.steer.state: received / applied / unconfirmed`（`horizontal/agent-host/src/adapters/prologue-stream.ts`） | 真；applied 只表示「放进了后续模型上下文」 |
| 补充的边界语义 | SDK `loop-boundary`、`loop-reply`、`compaction-history`：下一模型边界一次带上全部排队补充；有排队时不自然收工；压缩时保留补充 | 真 |
| 打断（当轮作废，同一 Run 继续） | SDK `steer({interrupt:true})` | SDK 有，Molis 没接 |
| 回答与补充分开 | `{kind:"answer", pending_id, pending_revision}` | 真 |
| 人工修订 TaskBoard（插入、跳过、换序、指派、解除阻塞、裁定），带版本 | `agent.collaboration.revise.v2`（2026-10-17 P4-C2 起以 v1 换下 `agent.run.step-board.amend.v1`；3d-3 起加 insert 的 `origin`，升到 v2）；Coding 计划修订 | 真；修订后用一条 steer 告诉运行中的这一轮 |
| 恢复 | `inspectRecovery` / `recoverRun`；Coding「核对并继续」 | 真：未终态 Run 标需核对、不重放；未读到的补充显示「未确认应用」 |
| Coding 的回执文案与报告里的「补充要求」一节 | `plugins/native/coding/src/client.ts`、`report.ts` | 真，但措辞容易被误读 |
| 助理发送幂等，失败保留草稿 | `assistant_requests` 表与 `request_id` | 真 |
| 页面代写的轮次标 `written_by` | 助理合同；记忆写入门的「你说过」只认本人原话 | 真，只覆盖助理开新轮的输入 |
| 「未采纳并说明理由」的领域先例 | Todo 整理候选 `decision: added/merged/updated/ignored` 加 `evidence`；情境推荐的 accepted/ignored/rewritten/undone | 真，可以借形状 |
| 外部 Runtime 消息的投递状态 | `sessions.message.*`：pending / uncertain / failed / accepted，投递前先标 uncertain | 真，只有 Codex 能原生投递 |
| 应用私有事实随会话存储，模型看不见 | Prologue `session.appendEntry` / `entries`（主线才有） | 换成主线包后可用 |

### 2.2 缺口

| # | 缺口 | 证据 | 后果 |
| --- | --- | --- | --- |
| G1 | 输入没有调用方可用的身份 | `steer()` 返回 void；`steer-N` 只在本 Run 内唯一；Molis 没把 `request_id` 传进去 | 断线重发会重复；助理的 `request_id` 对不上 SDK 的那一条 |
| G2 | 不知道 AI 真的读到 | `steer-applied` 只表示进了历史；同一边界随后取消就不会有模型调用；没有事件把 steerId 和某次模型调用连起来；事件没有序号 | 「已加入后续模型上下文」被读成「已处理」 |
| G3 | 没有「AI 打算怎么处理」 | SDK 与 Molis 都没有处理说明；Coding 只能在 tooltip 里写「不代表模型已遵循」 | 用户不知道它被当成约束、新任务，还是被忽略 |
| G4 | 输入与任务没有关联 | TaskBoard 节点、todo、pending 都没有引用字段；todo 每次整批替换都重发 id；普通轮次没有 TaskBoard（Coding 只有计划轮次有，助理没有） | 答不出「在哪里处理」 |
| G5 | 没有影响描述 | 无 | 答不出「改变了什么」 |
| G6 | 宿主代写的话混成用户的话 | 计划修订、「任务图有更新」、等待唤醒、会话间来信、审查拒绝转告、子任务重试都走 steer，渲染成用户气泡（`prologue-taskboard.ts`、`prologue-waits.ts`、`prologue-messages.ts`、`prologue-node.ts`、`assistant-service.ts`、Coding `routes.ts`） | 「你说过什么」不可信，记忆写入门也受影响 |
| G7 | 轮次刚结束时发的补充直接报错 | SDK 抛 `RUN_NOT_RUNNING`（原话「保留输入用于新的 Run」），Molis 不处理；Coding 回「这一轮已经结束」，助理显示原始错误 | 用户只能手动重发 |
| G8 | 没有跨轮排队，也不能撤回 | SDK 的队列只在一个 Run 内，重启后不重建；`engines/agent/control.md` 把持久排队记为「应有」 | 本轮一停，没读到的那条只剩「未确认应用」 |
| G9 | 恢复时不带上没读到的输入 | Coding 的续做摘要只从首条任务与宿主事实重建（`continuation.ts`）[推断] | 恢复后悄悄丢话 |
| G10 | 助理界面不显示任何回执 | `assistant-island.ts` 忽略 `turn.steer`，只弹一句「已补充到正在进行的这一轮」 | 助理场景完全看不到处理情况 |
| G11 | 助理的「回答 / 补充」由固定规则决定 | 恰好一条自由文本问题、又没带材料时，正文自动变成回答（`assistant-service.ts` 的 `dispatch`） | 想补充却被当成回答，无法纠正 |
| G12 | 运行视图版本漏掉补充状态 | `runViewVersion` 只看最后一轮的文字长度等（`capability-registration.ts`） | 回执变化可能晚一个周期才到页面 |
| G13 | 运行中补充的正文 Molis 不存 | 助理只为开新轮存 round；steer 只在 Prologue 账上 | 补充进不了记忆的「你说过」，也进不了学习 |
| G14 | Coding 计划轮次未经核实就说「已体现」 | `plans.ts` 把计划后的消息标成「已体现在确认的计划里」 | 不真实的回执 |
| G15 | Prologue 的插入（intervene）与卡片事件只是导出 | `session/core/intervene.ts`、`observability/core/card.ts` 没有调用方，执行队列却标 `[x]` | 不能当成已有能力来用 |

### 2.3 外部产品对照（2026-10）

| 机制 | 谁在做 | 取舍 |
| --- | --- | --- |
| 三种送达方式：打断 / 下一边界转向 / 等本轮结束再做；有默认值，单条可改 | Codex（Enter 转向、Tab 排队）、Claude Code、Cursor、Amp、Copilot CLI、Replit、Augment | 采用 |
| 排队可编辑、撤回、重排 | Codex、Cursor、Replit、Augment、Devin | 采用；只在读到之前 |
| 服务端持久队列，断线后照样送达 | Devin | 采用（Prologue 会话级排队） |
| 等用户回答问题时扣住后续消息，不把它当成回答 | Lovable | 采用；改成由用户明确点选目标 |
| 「接收 ≠ 已执行」的协议回执：accepted / pending / failed / steered | OpenAI Responses API steering | 采用这一诚实口径，再往前补「读到」与「处理说明」 |
| 计划先行，确认后再执行 | Jules、Gemini Deep Research、Replit、Factory | Coding 已有；按计时器自动批准不采用（Prologue「离开计划要专门点头」） |
| 带完成标准的目标 | Codex `/goal` | 采用（Session objective 只认回执） |
| 旁问，不打断主线 | Claude Code `/btw`、ChatGPT side chat | 采用（Coding 下一阶段 C4） |
| 「需要你」状态 | Microsoft Copilot Cowork | 采用 |
| 有消息就跳过待批动作 | Manus | 不采用：与回答 / 补充分开的原则冲突 |
| 回滚连同初始输入 | LangGraph rollback | 不采用：已发生的不靠回滚抹掉 |

**没有产品做好的：**

- **真实的「读到」。** Copilot 在 Agent 已经照做后仍显示「Queued」；Claude Cowork 吞掉或忽略消息时不给任何信号；Codex 卡在「sending」。
- **把 AI 的理解给人看。** Lovable 在内部把输入分成改方向、追加、提问，但从不展示。
- **输入与任务的多对多关联。** Cursor 明说 to-do 与消息队列互相独立。
- **影响前后对比**，以及**带理由的「未采纳」**。

另外，Claude Code 与 Codex 都把模型自写的清单默认关掉了，所以界面上显示的计划必须来自产品自己的账本，不能来自模型的工具调用。来源：[Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode)、[ChatGPT prompting](https://learn.chatgpt.com/docs/prompting)、[OpenAI steering](https://developers.openai.com/api/docs/guides/steering)、[Cursor agent](https://cursor.com/docs/agent/overview)、[Devin desktop changelog](https://docs.devin.ai/desktop/changelog)、[Lovable chat](https://docs.lovable.dev/features/projects/chat)、[Replit task system](https://docs.replit.com/core-concepts/agent/task-system)、[LangGraph double texting](https://docs.langchain.com/langsmith/double-texting)、[Copilot Cowork FAQ](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-faq)。

## 13. 与在途工作的关系

### 13.1 `feat/prologue-adoption`

- 它在做：换成 Prologue 主线包；投影 `sleeping`、`turn_changes`、`model-switched`；修正工具副作用分类；接通运行中换模型、等待口、子任务交回（它的 §4.3–§4.6）。
- 本文依赖它：
  - `turn_changes` 是「已有成果」维度的事实来源；
  - 会话条目只在主线包里有；
  - `applyPrologueEvent` 与 `AgentRunView` 正在被它改。
- 阶段 1 排在它之后（待决 D7）。它的「运行中发送变成追加要求」（第 7 项）与本文的发送方式菜单要用同一套界面语言。

### 13.2 `specs/ai-interaction-experience`（未入库，待开发）

- **分工：** 它拥有 Option、推荐动作、交互卡片、混合字段表单、对象选择；本文拥有「输入」的生命周期，以及它与任务、结果的关联。
- **共用：**
  - 点选、表单提交、回答都是输入，走 §3 的同一套来源、送达、读到、处理、关联、生效；
  - 草稿与正式提交分开；
  - 「需要回答才能继续」与「补充」分开。
- **建议（待决 D6）：** 两份 spec 并列，输入合同（§6.2）只在本文定义，那份引用。

### 13.3 防腐整理

| 防腐整理的项 | 对本文的影响 |
| --- | --- |
| W3-01 调用编号 | 输入的 `call_id` 用它，不另起编号 |
| W4-05 / W5-10 助理拆分 | 助理侧新代码按协作者形状写 |
| W4-06 | `prologue-node.ts` 拆分后再接会话条目端口 |
| W4-07 | Coding 路由按资源拆分后，再加输入相关路由 |
| W4-10 | 合并订阅，不新增轮询 |
| W5-04 | 浏览器代码打包，回执组件随之成为类型检查过的模块 |
| W5-09 | agent-host 合同拆分；本文的合同已经放在独立子路径 |
| W3-06 `services.model` | 形态 B 的插件经它调模型 |

### 13.4 PR #340（goal-closure-identity）

PR #340 已合入（`53b62b0f0`）。阶段 4 的 Goals 改动落在 `modules/goals`、`plugins/native/goals`，以及宿主的 `apps/local-host/src/goals-actions.ts`、`goal-project-application.ts`、`web-goals-read.ts`；`project-capabilities.ts` 已经没有 Goals 的引用，不再涉及。

### 13.5 Coding 下一阶段

`next-requirements.md` 的 C4 旁问与本文的「只问不改」是同一件事，由本文的发送方式菜单承载。

## 15. 附：调研中发现的文档与代码不符

| 文档里写的 | 代码里的实际情况 |
| --- | --- |
| `docs/platform/PROLOGUE-AI.md` §3 写了 Jelly 的分段摘要与合并 | 只有计划拆解 |
| `docs/platform/PROLOGUE-AI.md` §2 把 Characters 当作 Agent 示例 | 它的执行转到 Coding 或本地终端，也不声明 agent 角色 |
| `docs/platform/PROLOGUE-AI.md` §2 的表暗示 Agent 场景都经 `agent.run.*` | Schedule 的到点任务在进程内直接 `agentHost.start`，不经 `agent.run.*` |
| Prologue 执行队列把 intervene、card 标为 `[x]` | 运行时没有接线 |
| 插件创作台的 Manifest 声明了 run 类能力 | 源码不调用 [推断] |
| `specs/ai-interaction-experience` §7.5 写「历史记录兼容读取」 | 与现行 `AGENTS.md`「合同读写都只认现行取值」冲突 |
