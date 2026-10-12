# AI 对话的输入回执：这句话被怎么处理、在哪里处理、改变了什么、还差什么

> 远端接续请先读文末「远端交接」；历史路径、授权及未提交状态以该节为准。

状态：执行中（2026-10-12；SDK S1–S3 工程通过、待采用线整合；R0 独立回执体验预览已实现并工程通过（§18.8），待用户看实物；S4 等采用线 P1；Molis 生产接入等 D7）。§14 的九项已按推荐定下（用户 2026-10-09「按你推荐，开工」）。阶段 2 的 Prologue 通用能力按刀推进：S1（输入身份与读到回执）已收尾并进了采用线整合分支；S2（会话级持久排队）在 Prologue `feature/input-receipts-s2` 上工程通过、待采用线整合；S3（处理说明与提醒）在 `feature/input-receipts-s3` 上工程通过、待采用线整合；S4 等采用线 P1 的统一合同。阶段 1 与之后的 Molis 生产接入仍按 D7 等待（正式 SDK 来源、默认包路径验证、采用线合入 main），在那之前 Molis 侧只改本需求书与合同设计。进度记在 §16。

覆盖所有 AI 对话场景里「用户输入的处理反馈」。Coding 是验证样本，全局助理是第二个首批场景；同时给出个人助理等对话场景的深化方向，以及其他 AI 场景的适用性判断。界面上的 Option、推荐动作和交互卡片归 `specs/ai-interaction-experience`（主检出里未入库的需求书，分工见 §13.2）；本文只拥有「输入」这条生命周期，以及它与任务、结果的关联。

## 0. 一句话与核心验收

AI 执行期间，用户发出的每一条输入都能当场回答四个问题，每个回答都指得出一条真实执行事实：

1. **被怎么处理**：送达没有、AI 读到没有、AI 打算怎么处理（立即改当前一步 / 留到后面某一步 / 作为新任务 / 需要澄清 / 暂不采纳 / 只记下）。
2. **在哪里处理**：哪一轮、TaskBoard 的哪一步或哪个子任务、哪个产品对象（Goal、待办、定时任务、成果）。
3. **改变了什么**：目标、范围、优先级、实现方案、验收条件、已有成果、约束，哪几项实际变了，各自依据是什么。
4. **还有什么没处理**：没读到的、读到但没说明的、说了要做还没做完的、没采纳待你决定的。

AI 的说法和执行事实分开显示。AI 的说法标「AI 的理解」，可以纠正；一条输入显示「已生效」，只能凭回执、TaskBoard 状态、动作调用记录和文件变更。

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
| 人工修订 TaskBoard（插入、跳过、换序、指派、解除阻塞、裁定），带版本 | `agent.run.step-board.amend.v1`；Coding 计划修订 | 真；修订后用一条 steer 告诉运行中的这一轮 |
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

## 3. 概念：输入、四层事实与派生状态

### 3.1 什么算一条输入

| 类 | 例子 | 进回执 | 来源 |
| --- | --- | --- | --- |
| 本人打字的补充、纠正、约束、新需求、提问 | 「别改现有 fixture」 | 是 | person |
| 本人对问题的回答 | ask-user 的回答 | 是，关联那个问题 | person |
| 本人点选的 Option、卡片动作 | 交互形式归 ai-interaction-experience | 是，走同一条生命周期 | person |
| 本人对回执的纠正、撤回、改关联 | 「这条是给第 4 步的」 | 是，挂在原输入下 | person |
| 页面替本人写的话 | 浏览器交还、卡片失效后的重做提示 | 是，标「页面代写」 | page |
| 宿主通知 | 「任务图有更新」、等待唤醒、审查拒绝转告、会话间来信 | 不算用户输入；时间线上显示成系统说明 | host |

只有 person 算「你说的话」，与 `written_by` 同一口径；记忆写入门的「你说过」也按这个来源判断。

### 3.2 四层事实，各有写主人

| 层 | 事实 | 写主人 | 依据 |
| --- | --- | --- | --- |
| L0 送达 | 宿主收下（键、来源、方式、调用编号） | Molis agent-host，代可信调用方写 | 宿主记录 |
| L1 运行时接收 | 进入运行队列（以及在等什么）、放进上下文、AI 读到（某次模型调用基于它产出的回复已入账）、本轮结束仍没读到 | Prologue | 运行事件账 |
| L2 处理说明 | AI 声明的类型、处理方式、目标、影响维度、理由 | 模型经 Prologue 系统工具声明；引擎落账、盖身份；**没有权威** | 运行事件账 |
| L3 纳入 | 关联到 TaskBoard 节点、子任务、问题、产品对象 | TaskBoard（节点来源与报告引用）、对象 owner、本人 | 板版本、对象记录、关系边 |
| L4 生效 | 关联节点的终态与回执、文件变更、动作调用、成果版本 | 各回执的主人 | 回执 |
| 人 | 纠正处理方式、改关联、撤回、确认 | 本人（可信身份） | 宿主记录；同时以纠正输入交给 AI |

用户看到的那一句状态从这些事实派生，不另存一份「输入状态表」。

### 3.3 对用户显示的状态（派生）

| 显示 | 条件 | 依据 |
| --- | --- | --- |
| 发送中 | 页面已发，宿主还没确认 | 页面 |
| 已送达 · 排在「当前回复 / 这批工具 / 你的审批 / 你回答问题 / 暂停 / 休眠」之后 | L0 加 L1 queued，加等待原因 | 事件与运行相位 |
| 已放进上下文，等 AI 回应 | applied，还没 read | 事件 |
| AI 已读到 · 还没说明怎么处理 | read，没有 L2 | 事件 |
| AI 的理解：「处理方式」→「目标」 | L2 | 事件；带「AI 的理解」标记 |
| 处理中：步骤 3 进行中 | L3 的目标还没终态 | 板 |
| 已生效 / 部分生效 | L4：全部或部分目标成功且有回执 | 回执 |
| 需要你：澄清 / 确认新任务 / 决定要不要坚持 | L2 为 needs-clarification、new-task 提议或 not-adopted | 事件与问题 |
| 没读到就结束了 · 带到下一轮 / 撤回 | Run 终态时还没 read | 事件 |
| 结果待核对 | 关联执行的结果未知 | 恢复报告 |
| 已撤回 / 已被你后来的纠正替代 | 人的操作 | 宿主记录 |
| 你改为「…」· 等 AI 采纳 / 已按你的纠正处理 | 人的纠正，加后续的 L2 | 两者 |

**措辞规则：**

- 「读到」只用于 read 事实。
- 「已生效」只用于回执。
- AI 的说法一律带「AI 的理解」或「AI 说」。
- Coding 现在的「已加入后续模型上下文」要换掉。

### 3.4 处理方式与影响维度（闭集）

**处理方式**（AI 声明，人可以纠正）：

| 值 | 含义 | 必须带 |
| --- | --- | --- |
| `apply-now` | 立即影响当前执行 | 目标（当前步骤或本轮） |
| `later-step` | 在后续某一步处理 | 目标步骤 |
| `new-task` | 作为独立任务推进 | 新任务提议，或已建的节点 / 对象 |
| `needs-clarification` | 需要澄清 | 关联的问题（ask-user） |
| `not-adopted` | 暂不采纳 | 理由 |
| `answered` | 这是个问题，已在回复里回答 | 无 |
| `noted` | 记下，不改变执行 | 无 |
| `merged` | 与另一条输入一起处理 | 另一条输入 |

**影响维度**：objective 目标、scope 范围、priority 优先级与顺序、approach 实现方案、acceptance 验收条件、outputs 已有成果、constraint 约束。

每个维度分两栏：「AI 说」和「观察到的事实」。可以观察的事实如下：

| 维度 | 可以观察的事实 |
| --- | --- |
| 目标 | Session objective 变更；Goal 提议（Candidate Goal、约定变更） |
| 范围 | TaskBoard 节点增删、跳过、取消；子任务派出或收回 |
| 优先级 | 节点顺序、依赖重连 |
| 实现方案 | 只有 AI 的声明；计划修订前后对比 |
| 验收条件 | 计划步骤的验收改动；Session objective 的条件；Goal 要求提议 |
| 已有成果 | 已完成步骤的成果被改写（逐轮变更 `turn_changes`）、成果出新版本、撤销 |
| 约束 | 只有 AI 的声明；违反时被审查或策略拦下的回执 |

没有事实的维度只显示 AI 的说法，不显示「已变化」。

### 3.5 多对多关联

- 一条输入可以关联多个目标（步骤、子任务、问题、产品对象）；一个目标也可以关联多条输入。
- 关联有三种来源，并列显示，互不覆盖。可信度从高到低：
  1. 本人；
  2. 引擎盖章：节点因这条输入新增或修订、节点进展报告引用了它、某次动作调用声明为它而做；
  3. AI 声明。
- 不为每条输入建任务：`apply-now`、`noted`、`answered` 不产生任务，只有 `new-task` 产生提议。
- 关系写在哪：
  - 产品对象（Goal、待办、定时任务、成果）的关系写在 Context Ledger，与 `goal.input` 同一机制，对象 owner 只存引用。
  - TaskBoard 内部的关系由 Prologue 落在板上。

### 3.6 不变量

1. 没有事实就没有状态。每个显示状态都能点开看到依据：事件、回执、板版本或调用编号。
2. AI 的声明不晋升为事实；「已生效」只能由回执给出。
3. 宿主与页面写的话不显示成「你说的」。
4. 输入不静默消失。Run 结束、取消、失败、重启之后，没处理完的输入都出现在「还没处理的」里。
5. 撤回只在 AI 读到之前有效。读到之后只能发更正，回执上写明这一点。
6. 结果未知不显示成功，也不自动重做。
7. 被取消、撤权、停用的调用不写任何记录（沿用硬约束）。回执自身的写入同样要过 `beforeEffect`。
8. 回执不改变执行：显示、纠正、改关联都不扩权，也不等于批准副作用。纠正本身就是一条新输入。

## 4. 关键交互

### 4.1 发送方式

运行中，发送按钮默认是「补充」，在下一个模型边界生效（当前回复或这批工具结束后）。旁边有一个方式菜单，键盘可以操作：

| 方式 | 何时生效 | 对应 |
| --- | --- | --- |
| 补充（默认） | 当前回复或这批工具结束后 | steer |
| 打断并改向 | 当前回复立刻作废，同一轮接着走；已执行的不撤销 | steer interrupt |
| 这一轮结束后再做 | 排到下一轮开头 | 会话级排队 |
| 只问不改 | 单独回答，不进这一轮 | 旁问（Coding 下一阶段 C4） |

- 有待回答的问题时，输入框上方显示目标芯片，**默认值一直显示在芯片上，一下切换**（D5 于 2026-10-12 按使用体验修订，见 D14）：
  - 「写进问卷：补充要求」：只改问卷草稿，不交回、不发给 AI；只在问卷有自由文本题时出现（交互线做）；
  - 「补充这一轮」：一条 steer，排在回答之后，带回执（本线 1e 做）；
  - 有自由文本题时默认第一种，没有时默认第二种。没有问题等回答时芯片不出现，回车照常发送。
  不再按固定规则自动判断（改掉助理现行规则）。
- 有待审批的操作时，提示「这条会在你决定上面那一步之后读到」。

### 4.2 每条输入下的回执条

- 一行：图标 + 派生状态 + 目标，例如「AI 的理解：新任务 → 步骤 4（待你确认）」。
- 状态变化用 `aria-live=polite` 播报，不抢焦点，不移动阅读位置。
- 宿主通知换一种样式，没有回执条。

### 4.3 回执详情（回答四问）

点回执条在原地展开，窄屏用底部抽屉：

```text
补充 #2「顺便把注册接口也覆盖一下」                      14:02
怎么处理    AI 的理解：新需求 · 作为新任务                [纠正]
在哪里      步骤 4「注册接口失败路径测试」（你 14:05 加入）
改变了什么  范围 +1 步（任务板 v7→v8）；验收新增 1 条
还差什么    步骤 4 未开始
依据        送达 14:02 · 排在这批文件改动之后 · 14:03 第 9 次模型调用读到 · AI 说明 14:03
            [关联到…]  [撤回：已读到，不能撤回，可发更正]
```

### 4.4 「还没处理的」托盘

- 输入框上方一行：「2 条还没处理完」。点开是列表，分五类：没读到、读到没说明、说要做还没完成、没采纳待你决定、需要你澄清。
- 一轮结束时，结束卡片带同一个列表，以及三个操作：带到下一轮、全部撤回、逐条处理。

### 4.5 任务侧

- TaskBoard 节点显示来源徽标，例如「来自补充 #2 #5」，点开回到对应输入。
- AI 提出的新任务先以提议形式出现在板上（虚线，待你确认），确认后才成为节点（待决 D2）。
- 节点的进展报告引用了某条输入时，那条输入的回执里显示「步骤 2 报告：已按 #1 改用新 fixture」。

### 4.6 纠正

回执的「纠正」菜单可以：

- 改处理方式（例如「不是新任务，是对当前步骤的纠正」）；
- 改关联目标；
- 补一句说明；
- 撤回。

提交后发生三件事：

1. 立刻记为本人的决定，显示「你改为：…」。
2. 同时作为一条纠正输入交给 AI，带原输入的引用。
3. AI 重新说明后显示「已按你的纠正处理」。如果 AI 仍坚持别的做法，并列显示双方说法与理由，由你决定停下、坚持还是接受。

### 4.7 轮次结束与报告

- 结束卡片里，每条输入一行结论：已生效 / 部分生效 / 未采纳 / 没读到。
- Coding 报告的「补充要求」一节改成同样的结论加依据；助理的工作总结也一样。

### 4.8 恢复

- 宿主重启后打开会话，顶部提示「这一轮被中断，3 条输入需要确认」，逐条标明：已送达未交给 AI / 已交给 AI 未读到 / 已读到但相关步骤结果待核对。
- 可做：带到核对后的下一轮、撤回、先核对。
- 「核对并继续」默认带上没读到和没完成的输入；新一轮的回执显示「接续自上一轮的 #3」。

### 4.9 工艺要求

- 沿用 `DESIGN.md` 与 `specs/ui-craft-floor`：浅色深色、窄屏、键盘、中文输入法（组合输入时发送键不触发）、减少动态效果。
- 状态刷新不覆盖正在编辑的纠正内容。
- 长会话里回执更新不让布局跳动。
- Coding 输入框里的 Esc 现在会直接停止这一轮（没有确认），容易和「打断并改向」混淆，见待决 D3。

## 5. 能力归属

### 5.1 判断依据

- Prologue `AGENTS.md` §3.4：消费 App 拥有 UI、产品对象、用户任务和展示状态；Prologue 拥有 Session / Run / Agent / Effect / Receipt 和公开事件；一个事实只有一个写主人。
- Prologue `engines/agent/control.md` 已经拥有「人怎么推正在跑的 Agent」：停、暂停、转向、排队、打断。持久排队记为「应有」。
- Prologue 工作台场景：产品对象与执行对象分开，用引用和回执连，禁止双写；App 的 Task 只存对 TaskBoard 的引用。
- Molis `docs/platform/PROLOGUE-AI.md` §1：与业务无关、多个消费者需要的放 Agent Host；跨产品稳定的再下沉 Prologue。

### 5.2 归属表

| 能力 | 归属 | 理由 |
| --- | --- | --- |
| 输入身份（调用方给的幂等键）、来源（person / app / peer）、送达方式（下一边界 / 打断）、读到之前撤回 | Prologue `agent`（control） | 只有运行时能保证同一账里的顺序与幂等；任何嵌入的 App 都需要 |
| 生命周期事件：接收、放进上下文、读到、本轮结束没读到、撤回；事件带账内序号 | Prologue `agent`、`session` | 「读到」只有循环知道；事件序号是引用的前提 |
| 会话级持久排队（跨 Run、跨重启） | Prologue `session`、`agent` | 本来就在 `control.md` 的「应有」里，升为必须 |
| 处理说明工具（AI 声明类型、处理方式、目标、影响），以及没说明时的确定性提醒 | Prologue `tool`（系统工具闭集）、`context/reminder` | 与 `update-todo` 同类，是没有权威的声明；要和输入身份在同一账里对齐；提醒只有引擎能写 |
| 纠正作为一类输入（带 about 指向原输入） | Prologue `agent` | 纠正是人推 Agent 的一种方式 |
| TaskBoard 节点来源、进展报告引用输入；todo 的 id 跨整批替换保持不变 | Prologue `orchestration`、`agent` | 板是执行真相，引用落在板上才不双写 |
| 问题（pending）带 about；已回答 / 已过期事件 | Prologue `effect-policy` | 等人实体的主人 |
| App 私有事实随会话存 | Prologue `session.appendEntry`（主线已有） | Molis 换包即可用 |
| 统一的输入视图、投影、恢复、版本，以及可信身份下的纠正与关联动作 | Molis `horizontal/agent-host` | 所有对话界面共用，不让 Coding 和助理各写一份状态机 |
| 动作调用归因（这次调用是为哪条输入做的） | Molis agent-host 动作网关，加调用编号（W3-01） | 动作目录与调用记录归 Molis |
| 输入与产品对象的关系 | Molis Context Ledger；对象 owner 只存引用 | 跨模块关系的唯一机制 |
| Goal 层的目标与验收变更 | Goals，经提议与本人决定 | 业务 Goal 不被静默改写（`PRODUCT.md`） |
| 文案、组件、托盘、纠正菜单 | Molis 设计系统与各界面 | UI 归 App |
| 场景语义：Coding 的计划提议、助理的工作计划、报告 | 各插件 / 助理 | 领域含义 |

- **不归 Prologue 的**：用产品语言描述的影响；Goal、待办、定时任务；通知与提醒怎么展示；哪些新任务需要人确认（这是政策）。
- **不归 Molis Agent Host 的**：业务结论、Goal 状态。

### 5.3 权威来源、持久化与同步

| 事实 | 写主人 | 存在哪 | 公开契约 | 怎样到页面 |
| --- | --- | --- | --- | --- |
| 宿主收下的输入（键、来源、方式、调用编号） | agent-host | Prologue 会话条目 `molis.input`：加密，随会话 fork 与导出，模型看不见 | `AgentInputView.delivery` | 运行视图版本 → 等待口 / 订阅 |
| 接收、放进上下文、读到、没读到 | Prologue | 运行事件账 | SDK 事件 → 投影 | 同上 |
| 跨轮排队 | Prologue | 会话持久队列 | `session` 公开入口 | 同上 |
| AI 的处理说明 | 模型经系统工具声明，引擎落账 | 运行事件账 | `handling` | 同上 |
| 本人的纠正、撤回、关联 | 本人经动作发起，agent-host 写 | 会话条目；纠正同时作为输入进账 | `override`、`targets[origin=person]` | 同上 |
| 节点来源与报告引用 | Prologue TaskBoard | 板记录（registry `taskboards`） | `targets[kind=step]` | 读板 |
| 产品对象关联 | 对象 owner / Context Ledger | 各自的库与 ledger 边 | `targets[kind=goal/todo/…]` | 读 owner |
| 生效依据 | 各回执的主人 | 事件账、调用记录、成果库 | `outcome.evidence` | 读 |
| 派生状态 | 不落库 | — | `headline` | 计算 |

- Molis 不建「输入状态表」。Molis 自己落的只有 Prologue 无从知道的事实：键与调用方的对应、页面或宿主来源、本人的纠正与关联。
- 这些事实放在会话条目里，经同一个执行进程写入，不碰 `assistant.db` 和项目库的结构版本，因此不需要真实 Home 维护。
- 会话条目只在主线包里有，所以阶段 1 排在主线 SDK 换入之后（待决 D7），中间不另存一份。
- 页面只读一份 `AgentInputView` 列表，版本随输入状态变化。页面怎么拿到它：
  - 轮询与订阅按 W4-10 合并成按可见面订阅的一个通道，不新增轮询。
  - `runViewVersion` 纳入输入状态。

## 6. 公开契约草案

### 6.1 Prologue（先写需求册与切片合同，再实现）

1. **送达入口。**
   - 签名：`control.steer({ text, key?, source?: "person"|"app"|"peer", interrupt?, about?: InputRef })`，返回 `{ inputId }`。
   - 幂等：同键同文返回同一条；同键异文冲突。
   - `source` 决定这句话在模型上下文里的身份：人说的，还是应用通知。插入册已有同类规则：人说的话不能标成 system。
2. **撤回。** `control.withdraw(inputId)`：放进上下文之前撤回，零变化；之后拒绝并说明原因。
3. **生命周期事件**（都带账内序号）：
   - `input-accepted`：接收。
   - `input-applied`：放进上下文。
   - `input-read {inputIds, modelCall}`：带着它的那次模型调用，回复入账后才发。
   - `input-unread {reason}`：Run 终态时仍没读到。
   - `input-withdrawn`：已撤回。
4. **会话级排队。**（2026-10-12 按 SDK S2 实际入口改写；SDK 切片合同 `docs/slices/input-queue.md` 是这一项的权威。）
   - 一跑结束时没读到的补充自动进会话排队，编号不变；`session.queueInput({ text, key?, source?, about? })` 是 App 直接交来的那一种，回 `{ inputId, replayed }`，整条会话同键同文只算一次、同键异文冲突。
   - `session.inputQueue()` 回 `{ carry, queued, settled }`：排着的每条带 `from`（留下它的那一跑、进没进过上下文、那一跑的终态）；离开队列的记「带进了哪一跑」或「撤回」。`session.withdrawQueuedInput(inputId)` 撤回一条排着的。
   - `startAgentRun({ queued: "carry" | "leave" | [inputId…] })` 决定这一跑带不带；带进来的排在本轮任务之后、开场即在上下文里，账上同一个编号、`prompt.carried` 标出来源，第一段被留下的回复把它记成读到；又没读到就回队列。
   - D4：会话缺省 `ask`（不带，App 先问人）；`session.setQueuedInputCarry("auto")` 之后 App 开的跑默认全带。子任务完成后 SDK 叫醒的续跑一律不带。这个设置只存在 SDK 会话里，Molis 不另存一份。
   - 历史可见不等于获准消费：没读到的那一句在后续入模历史里只留一条不带正文的说明（`input-unread`），对话投影仍给 App 全文并标 `unread`。
   - 持久化；重启后仍在；重启收口那一笔里入队；**绝不自动开新 Run**。分叉、导入、导出不带队列。
5. **处理说明工具 `acknowledge-inputs`。**（2026-10-12：SDK 第三刀合同 `docs/slices/input-handling.md` 是这一项与第 6 项的权威，草稿已写、未实现。与下文的差别：类型 `kind` 定为 5 值闭集 `supplement / correction / constraint / request / question`；事件是一次调用一条 `inputs-acknowledged { items }`、整次原子，不是每条一件；只能说明这一跑里已读到的输入；S3 的 `targets` 只收 `input` 与 `app-ref`，`board-node / todo / pending` 留到 S4；`app-ref` 经 App 在 `createRuntime` 注入的解析器核对；每条输入放进上下文时后面跟一条带编号的运行时说明，模型凭它点名。）
   - 入参：`{ items: [{ input, kind?, treatment, targets?: [{ kind: "board-node"|"todo"|"pending"|"input"|"app-ref", id }], impacts?: Dimension[], note }] }`。
   - `safe-read`，只记声明，不改世界。
   - 引擎核对：输入已被本轮读到；目标存在；`app-ref` 只接受 App 注册的解析器认可的引用。
   - 事件 `inputs-acknowledged`。
6. **提醒来源 `unacknowledged-input`。**
   - 读到后，模型的下一次回复仍没说明，就附一条提醒。
   - 可配置「有读到未说明的输入时不自然收工」。提醒次数有界，到上限照常收工，并在账上留「未说明」。
7. **TaskBoard 与 todo。**
   - 节点加 `origins?: InputRef[]`（有界）。
   - `board-plan`、`board-revise`、`addNode` 可带 `forInputs`；`report` 可带 `inputs`。
   - `update-todo` 接受模型给的 id，并在整批替换时保持。
8. **pending。** 加 `about?: InputRef`；新增 `pending-settled`、`pending-expired` 事件。

每一项都按 Prologue 规则：落点在已有模块（agent、session、tool、context、orchestration、effect-policy），不新增第 30 个模块。系统工具闭集的增项登记在 `modules/tool/system.md`；完成门要过真实 Node Host 回归与变异验证。

### 6.2 Molis 合同

放在新子路径 `services/agent-inputs`。不再往 `services/agent-host.ts` 里加：它已经到门限，并且会在 W5-09 拆分。

```ts
type AgentInputSource = "person" | "page" | "host" | "assistant";
type AgentInputMode = "next-boundary" | "interrupt" | "after-run" | "answer" | "start" | "side";
type AgentInputTreatment =
  | "apply-now" | "later-step" | "new-task" | "needs-clarification"
  | "not-adopted" | "answered" | "noted" | "merged";
type AgentInputDimension =
  | "objective" | "scope" | "priority" | "approach" | "acceptance" | "outputs" | "constraint";

interface AgentInputView {
  key: string;
  call_id?: string;
  session: AgentSessionRef;
  run?: AgentRunRef;
  source: AgentInputSource;
  mode: AgentInputMode;
  text: string;
  at: string;
  delivery: {
    state: "accepted" | "queued" | "applied" | "read" | "unread" | "withdrawn" | "carried";
    waiting_on?: "model" | "tools" | "review" | "question" | "pause" | "sleep" | "run-end";
    read_by_call?: number;
    carried_to?: string;
    evidence: EvidenceRef[];
  };
  handling?: {
    treatment: AgentInputTreatment;
    kind?: "supplement" | "correction" | "constraint" | "new-request" | "question";
    impacts: AgentInputDimension[];
    note: string;
    at: string;
    evidence: EvidenceRef[];
  };
  override?: { treatment?: AgentInputTreatment; note?: string; at: string; adopted: boolean };
  targets: Array<{
    kind: "step" | "subtask" | "question" | "todo-step" | "goal" | "todo" | "schedule-task" | "artifact" | "input";
    ref: string;
    label: string;
    state?: string;
    origin: "person" | "engine" | "ai";
    evidence: EvidenceRef[];
  }>;
  impact: {
    declared: AgentInputDimension[];
    observed: Array<{ dimension: AgentInputDimension; summary: string; evidence: EvidenceRef[] }>;
  };
  outcome: {
    state: "open" | "in-progress" | "realized" | "partial" | "not-adopted" | "withdrawn" | "unresolved" | "needs-check";
    evidence: EvidenceRef[];
  };
}
```

- **改现有控制合同。** `AgentRunControl` 的 steer 加 `key`、`interrupt`、`source`，返回 `{ input_id }`。改 typed 能力的合同按 `docs/system/CONTRACT-CHANGES.md`：刷新 API 快照，并写明影响。
- **新操作登记成统一动作。** 读、撤回、纠正、关联、带到下一轮都登记为动作，因为门禁不许新增 typed `agent.*` 能力。页面、助理、MCP 共用同一个处理器。
- **合同只放类型与常量。** 合同包不许有 20 行以上的函数，也不许有副作用；派生逻辑放在 agent-host。

### 6.2a 落点核对（2026-10-12，D7 之前可独立做的准备）

按合入 main `02ceba8c` 的现行 contracts 核对 §6.2 的落点，结论写在这里，代码等 D7：

| 项 | 现状 | 落法 | 理由 |
| --- | --- | --- | --- |
| `services/agent-host.ts` | 1,732 行，巨大单元；W5-09（按领域拆）未做 | 不在里面加行。`AgentRunControl` 的 steer 分支改成引用 `services/agent-inputs.ts` 里定义的 `AgentSteerControl`（带 `key`、`source`、`interrupt`、`about`），`control()` 的返回改成引用那边的回执类型；这一文件净行数不增 | `pnpm health:check` 对照 merge-base：巨大单元不许变大，PR 里没有登记放行的路 |
| 新子路径 `services/agent-inputs` | 不存在 | 和第一个使用它的改动同一个 PR 建：类型（`AgentInputView` 等）、动作定义、常量；`package.json` exports、API 快照（`pnpm api:update`）一起改 | 占位子路径门禁（只导出描述符、仓内无人引用即失败）；合同改动单独成 PR 并写影响（`docs/system/CONTRACT-CHANGES.md`） |
| 读、排队、撤回、纠正、关联、带到下一轮、会话自动设置 | agent 侧现有能力都是 typed `agentHostCapabilities`（`agent.run.control.v1` 等） | 新操作照 `services/memory.ts` 的写法登记统一动作（`ActionDefinition`，系统提供方），id 用 `agent.inputs.*`；`pnpm actions:update` 刷新 `tooling/gates/actions/` | 门禁不许新增 typed 宿主能力，新能力注册成动作 |
| 「带到下一轮」 | SDK S2 是开跑参数 `queued`，不是单独的操作 | Molis 的「带到下一轮 / 核对并继续」= 用 `agent.run.start.v1` 开下一跑并传 `queued`（全带或点名）；开始输入里的这一字段同样定义在 `agent-inputs` 里由 agent-host 引用 | 一个事实一个主人：带走与开始记录同进同退由 SDK 保证，Molis 不另写「已带走」 |
| 会话自动设置（D4） | SDK S2：`setQueuedInputCarry` 存在 SDK 会话记录里 | 动作 `agent.inputs.carry-setting` 只转给 SDK，不在 Molis 存第二份 | 同上；子任务唤醒不带由 SDK 保证 |
| `RUN_NOT_RUNNING` 竞态（§7） | 现在 Coding 回「这一轮已经结束」、助理显示原始错误 | agent-host 收到它就用同一个键 `session.queueInput`，回执里写「这一轮刚结束 · 已排到下一轮」 | SDK S2 的键整条会话去重：补充其实已落账时回原编号，不出两条 |
| `delivery.state` | §6.2 草案有 `queued`、`carried`、`withdrawn` | `queued` / `carried`（带 `carried_to`）/ `withdrawn` 取自 `inputQueue()` 与带进来那一跑的 `prompt.carried`；`withdrawn` 分两种依据：一跑里放进上下文之前撤回（`steer-withdrawn`），或离开队列时撤回（`settled.outcome = withdrawn`，可能进过上下文），`evidence` 写明是哪一种 | 两种撤回的事实不同，不能合成一句「模型没见过」 |

### 6.3 动作网关归因

- 助理与 Coding 的动作工具（`change-capability`、`change-reversible`、`suggest-action`、委派）加可选参数 `for_inputs`。
- 调用记录带调用编号（W3-01）。输入的 `targets` 里会出现「为 #3 创建了待办 X（调用 ab12）」。
- 这一条同时包含两件事：调用发生了（事实），以及 AI 说它为哪条输入而做（声明）。显示时分开。

## 7. 取消、失败、断线与重启

| 情况 | 输入当时在哪 | 之后 | 用户看到 | 可做 |
| --- | --- | --- | --- | --- |
| 页面发出后断线 | 发送中 | 重连后按同一键重发，宿主去重 | 发送中，然后恢复正常状态 | — |
| 宿主收下，还没交给运行就崩了 | 只在会话条目里 | 重启后发现「收下了，但账上没有」 | 已送达，未交给 AI | 交给下一轮 / 撤回 |
| 在排队，用户停止或运行失败 | 运行队列 | 终态时发 `input-unread` | 没读到就结束了 | 带到下一轮 / 撤回 |
| 已放进上下文，模型还没回应就中断 | 在历史里 | 发 `input-unread` | 同上，并说明已放进上下文 | 同上 |
| 读到了但没说明，本轮结束 | — | 账上记「未说明」 | AI 读到了，但没说明怎么处理 | 下一轮先让 AI 说明 / 我来归类 |
| 说明为后续步骤，本轮结束前没做到 | 板上目标还没开工 | 留在板上 | 说要做，还没做 | 继续 / 改关联 / 撤回 |
| 关联步骤执行中宿主崩溃 | 板上 running | 恢复报告：结果未知 | 结果待核对 | 核对后继续；不自动重做 |
| 澄清问题没答，宿主重启 | pending 开着 | 问题失效 | 问题已失效 | 回答改作下一轮的补充 |
| 轮次刚结束时发补充（竞态） | — | 宿主收到 `RUN_NOT_RUNNING` 不报错，按发送菜单里的默认排到下一轮或保留 | 这一轮刚结束 · 已排到下一轮 | 开始下一轮 / 撤回 |
| 两个页面同一键；纠正冲突 | — | 按键去重；纠正带回执版本，后到的报冲突 | 已由另一处提交 | 刷新后再改 |
| 发送这次调用被撤权或停用 | — | 不写任何记录（硬约束） | 输入原样留在草稿 | 重新发送 |

恢复入口：agent-host 的恢复报告加「输入」一类，与 Prologue `listOpenWork` 的三类（未终态 Run、打开的等待、未知副作用）并列。重启后只分类：不自动带入，不自动开新轮。

## 8. 场景路径

### 8.1 Coding（验证样本）

**起点：**

- 会话绑定 Goal「登录接口有失败路径测试」。
- 用户发「给登录接口补失败路径测试」。计划轮给出三步：读代码 → 写测试 → 跑检查。
- 用户确认后，执行轮建 TaskBoard v1。

| # | 用户做的 | 看到的回执 | 依据 |
| --- | --- | --- | --- |
| 1 | 步骤 2 正在写文件时，发「别改现有 fixture，新建一个」 | 已送达 · 排在这批文件改动之后 | `input-accepted`；相位 running，工具批次进行中 |
| 2 | — | AI 已读到（第 9 次模型调用） | `input-read` |
| 3 | — | AI 的理解：约束 · 立即影响步骤 2 · 影响实现方案、已有成果 | `inputs-acknowledged` |
| 4 | — | 改变了什么：`tests/fixtures/login.json` 本轮先改后还原；步骤 2 的报告引用 #1 | `turn_changes`；节点报告带 inputs |
| 5 | 发「顺便把注册接口也覆盖」 | AI 的理解：新需求 · 作为新任务 → 提议步骤 4（待你确认） | 处理说明，加板上的提议 |
| 6 | 点「加入」 | 在哪里：步骤 4（来源 #2）；改变了什么：范围 +1 步（v7→v8） | 板版本、节点 origins |
| 7 | 发「测试改用 vitest」 | AI 的理解：暂不采纳 · 理由：仓库统一用 node:test，`scripts/run-tests.mjs` 不认 vitest | 处理说明 not-adopted |
| 8 | 点「纠正 → 坚持」 | 你改为「采纳」· 等 AI 采纳；AI 重新说明，提出「迁移测试框架」步骤并写清代价 | 纠正记录，加新的处理说明 |
| 9 | 步骤 2 的写入等审批时，发「这步可以批准，但以后改 fixture 前先问我」 | 排在你的审批之后；审批后读到；AI 的理解：约束 · 后续步骤 | 相位 awaiting-review |
| 10 | 步骤 3 跑检查失败，轮次结束 | 结束卡片：#1 已生效（步骤 2 成功，有文件回执）；#2 未开始（步骤 4）；#3 按你的纠正待做；#4 已记为约束 | 板终态、回执 |
| 11 | 「核对并继续」 | 新一轮的回执：接续自上一轮 #2，步骤 4 开工 | 会话排队、板 |
| 12 | 某一轮中途宿主重启 | 「这一轮被中断，1 条输入没读到」→ 带到下一轮 | `input-unread`、恢复报告 |

**Goal 层：** 如果 #2 超出 Goal 原本的范围（Goal 只说了登录），回执里出现「已提议扩大 Goal 范围（待你决定）」，经 Goals 的提议与本人决定后才生效。这与 `PRODUCT.md`「执行发现的新需求先作为 Candidate Goal」一致。

**用户最终能做到：**

- 每条补充落在哪一步、有没有被吸收、为什么没采纳，一眼看清。
- 报告、变更集和 Goal 进展引用的都是这些事实。
- 中断后不丢话。

### 8.2 全局助理

**起点：** 用户说「帮我准备周四和 A 客户的季度回顾会」。

1. **立项。** 助理起草工作目标与完成标准：议程文档、上季度数据摘要、会前提醒。用户确认后，这项工作有一块常驻 TaskBoard：
   1. 收集上季度数据（搜索、Dataset）；
   2. 起草议程（Pages）；
   3. 设会前提醒（Schedule）；
   4. 发邀请邮件。
2. **中途输入与回执：**

| 输入 | 回执 | 依据 |
| --- | --- | --- |
| 「客户改到周五下午了」 | AI 的理解：纠正 · 立即影响步骤 3，并修改目标时间。改变了什么：定时任务已改到周五 13:30（调用 ab12） | 动作调用记录、Schedule 对象 |
| 「议程里加一项续约报价」 | AI 的理解：补充 · 步骤 2。改变了什么：议程文档 v3（成果版本） | 成果版本 |
| 「别直接发邮件给客户，我自己发」 | AI 的理解：约束 · 立即影响。改变了什么：步骤 4 已取消，没有发出任何邮件 | 板上节点取消；没有对应调用 |
| 「上次他们提到的预算问题也要准备」 | 需要你澄清：「你指 8 月邮件里的预算削减，还是 9 月会上的？」回答后：纳入步骤 2 | 问题，加 about 关联 |
| 用户关掉应用一晚 | 次日打开：步骤 1–3 完成；「还没处理的」里没有遗留 | 板、回执 |

3. **交付。** 交付说明列出做了什么、每句话的结论、成果链接，以及「会后发纪要」这条新待办。待办关联到这项工作和对应输入。

### 8.3 插件创作台

- **现状：** 构建中发消息会暂停当前阶段并重新开始修订；修订只把最新一条当作需求。连发两句只认后一句，进行中的那一轮被丢掉。
- **改后：**
  - 消息作为补充，在当前阶段的下一模型边界送达；用户也可以选「打断并改向」。
  - 回执显示「纳入修订 3 / 操作『加导出按钮』」。
  - 两条快速补充一起送达。
- **前提：** 专用适配器要接上补充与回答。现在它遇到等人就直接停下。

### 8.4 外部 Runtime 经 Goals（Claude Code、Codex）

- **现状：** 用户在 Goal 上写笔记、改要求、做决定，外部 Agent 要等下次读状态才知道，没有任何「读到 / 怎么处理」的事实。
- **改后：**
  - Goals 增加一个动作，让外部 Agent 对具体的笔记、要求、决定（`gevt-` 引用）声明「已读到，处理方式是…」，身份取 MCP 会话。
  - Goal 时间线显示「Claude Code 会话 X 在游标 N 读到了你的笔记 · 处理方式：…」。
  - 进展报告引用这些输入。
- 这是 Goals 拥有的新事实，不经 Prologue。干预只能是提示性的：外部 Agent 下次拉取时才读到。Codex 可以经 `sessions.message` 推送。

## 9. 个人助理与对话场景的深化

### 9.1 个人助理的现状

**已有：**

- 每项「工作」是一个 Prologue 会话，每次发送开一轮或补充。
- 工具来自动作目录网关：查找、读取、改动（逐个审批）、可撤销改动免审批、建议卡。
- 委派给 Coding 只能一层（最多 6 个，3 个同时进行）。
- 定时跟进：每项最多 5 个，只在进程活着时运行。
- 记忆召回，每轮最多 30 块上下文。
- 恢复：需核对时只关闭、不续做。

**不足：**

- 工作没有目标与完成标准。
- 步骤是 `update-todo` 的建议清单，不跨轮。
- 补充看不到回执。
- 事件不会推动下一步。
- 只显示最近 30 轮，没有摘要和历史搜索。
- 恢复后不能接着做。
- 靠轮询。

### 9.2 深化方向：用户最终能完成什么

| 方向 | 用户能新做到的 | 机制 | 依赖 |
| --- | --- | --- | --- |
| 工作有目标与完成标准 | 说一次「帮我把 X 办成」，AI 起草目标与完成标准，你确认；没做成前它不自称完成 | 工作级目标，可绑 Goal 或待办；Prologue Session objective 只认回执 | 阶段 3；BL-034 |
| 跨轮的工作计划 | 看得到、改得动这项工作的步骤：谁做（助理、委派给 Coding、你自己）、在等什么、何时跟进 | 每项工作一块常驻 TaskBoard；委派与定时跟进是板上的节点 | 阶段 5；待决 D9 |
| 当前约定 | 随时看到这项工作已经采纳的约束和决定，每条能点回是哪句话说的，能删改 | 从回执里已采纳的 constraint / objective / acceptance 项派生；本人编辑等于纠正输入 | 阶段 3 |
| 输入回执 | 本文主体 | — | 阶段 1–3 |
| 结果归因与撤销 | 每个改动知道是为哪句话做的，可以按输入撤销相关改动 | 网关归因，加撤销记录 | 阶段 3；W3-01 |
| 中途干预 | 暂停、补充、打断、调整步骤顺序、把一步收回自己做、停掉委派 | 现有控制，加 TaskBoard 人工修订 | 阶段 1、3 |
| 失败与中断后接着做 | 重启后看到哪些做完了、哪些待核对、哪些话没读到；一键「核对并继续」 | 与 Coding 同一套续做：从板、回执和没读到的输入重建 | 阶段 5 |
| 有界的主动推进 | 材料到了、委派完成、Goal 变化时，助理提出下一步建议，但不自己执行副作用 | 事件触发的建议卡（ai-interaction-experience），按用户设定的策略 | 阶段 5；BL-030 |
| 交付 | 工作结束时拿到一份交付说明：做了什么、每句话的结论、成果链接、还差什么 | 回执、板、成果 | 阶段 3 |
| 历史与跨工作上下文 | 搜得到以前的工作；新工作可以引用旧工作的约定 | Prologue 会话搜索（BL-034） | 阶段 5 |

### 9.3 其他对话场景的深化

- **Coding：**
  - 旁问（C4）。
  - 普通轮次（没有计划）也显示「这轮在做什么」：用 todo，并带上输入关联。
  - 子任务的输入：给子任务补充时，回执挂在子任务名下。
  - 报告与变更集按输入归因。
- **插件创作台：** 修订和操作按输入归因；补充不再丢掉进行中的一轮。
- **炼金术士 Copilot：** 研究开始前可以编辑计划（参照 Gemini Deep Research），研究中的补充作为下一阶段的约束；报告里的结论标明出自哪段讨论。
- **灵光：** 回复生成中可以先写下一条（排队），回复以流式呈现；冲突时说明哪句没用上，不再只弹错误。

## 10. 其他 AI 场景的适用性

### 10.1 三种形态

- **A. Agent 运行**（steer、TaskBoard、Prologue 事件）：Coding、助理、插件创作台、Schedule 对话任务、Characters（它的内置执行转到 Coding）。完整复用本文。
- **B. 作业与单次调用**：不需要补充与 TaskBoard。需要的是「请求回执」：
  - 每次请求一行记录加 `request_id`；
  - 进度（`on_progress` / `onProgress`）；
  - 中断状态；
  - 结果「用上了 / 没用上 + 理由」（参照 Todo 整理候选的 `decision` 与 `evidence`）。

  状态由插件 owner 存，展示复用同一套回执组件。
- **C. 外部 Runtime 经 Goals**：Goals 层的「读到 / 处理方式」事实（§8.4）。

### 10.2 适用性

| 场景 | 形态 | 判断 | 用户价值 |
| --- | --- | --- | --- |
| 插件创作台 | A | 调整后复用：消息加身份与「纳入哪次修订」；补充不再丢掉进行中的一轮 | 用户本来就在构建中途纠正；现在两句连发只认后一句 |
| Schedule 对话任务 | A | 调整后复用：每轮保留 run 引用、改走 `agent.run.*`、补充排到下次运行、运行中可看可停、错过和中断的有重试 / 跳过 | 知道改过的指令有没有用在今早那次运行 |
| 外部 Runtime 经 Goals | C | 新的 Goals 事实 | Goals 是权威来源，用户在 Goal 上写的每一句都能看到被哪个会话读到 |
| 灵光 | B | 调整：加请求行、排队、流式；冲突改成「没用上 + 理由」 | 不丢话，回复时可以先写下一条 |
| 炼金术士 | B | 调整：讨论关联到研究计划；所有作业都能取消 | 知道哪段讨论影响了哪份研究 |
| Shelf 作业、开项目引导 | B | 调整：真实进度、中断后可继续、可取消 | 几分钟长的作业不再像卡死 |
| Jelly 计划拆解 | B | 调整：反馈轮次持久化，标出用上 / 没用上；进度条接上 | 多轮修订不白费 |
| Images、Pages 生成、Inbox → Pages | B | 基本已有（`request_id`、中断不重放）；补 `background_job` 声明与状态展示 | 生成状态一致 |
| Todo 整理 | — | 作为任务侧目标，以及「未采纳 + 理由」的形状来源 | — |
| Form、Dataset、PPT、Cognia、Pages 行内改写 | — | 不适用：单次调用，已有接受 / 拒绝；不为统一硬改成 Agent（ai-interaction-experience §7.4） | — |
| Feed、Inbox、首页与情境判断、判断函数、记忆整理 | — | 不适用：没有用户输入流 | — |
| Workflows | — | 不适用：用户推进，没有对话；「可审阅的 AI 草稿」另议 | — |
| Experiments | — | 不适用：按设计隔离，冻结快照 | — |
| 项目讨论 IM | — | 不适用：没有 AI | — |

### 10.3 优先级

| 优先级 | 场景 | 理由 |
| --- | --- | --- |
| 首批 | Coding、全局助理 | 本文阶段 1–3 |
| P1 | 插件创作台 | 唯一一个用户已经在执行中途干预、而且当前会丢工作的地方 |
| P2 | 外部 Runtime 经 Goals | 产品的核心承诺是 Goal 为权威真相源 |
| P3 | Schedule 对话任务 | 后台无人值守，最需要「有没有用上我的话」 |
| P4 | 灵光、炼金术士（形态 B） | 对话型、单次调用 |
| P5 | Shelf、开项目引导、Jelly、Images（形态 B 的反馈与恢复部分） | — |

## 11. 分阶段实现

### 阶段 0：方案与对齐（文档）

- 评审本文，定 §14 的待决事项。
- 与 ai-interaction-experience 定分工（§13.2）。它 §7.5 的「历史记录兼容读取」与现行 `AGENTS.md`「合同读写都只认现行取值」冲突，要改掉。
- Prologue 需求册：
  - `engines/agent/control.md` 加「输入回执」一节，持久排队从「应有」升为必须；
  - `modules/tool/system.md` 登记 `acknowledge-inputs`；
  - `engines/orchestration/taskboard.md` 加节点来源；
  - `kernel/context/reminder.md` 加提醒来源；
  - 以上排进执行队列。
- 验收：用户确认归属与待决；Prologue 负责人认可需求册改动。

### 阶段 1：用现有 SDK 做到「不丢、不混、说真话」（Molis）

依赖：`feat/prologue-adoption` 合入，并换成 Prologue 主线包（有会话条目）。

| 片 | 内容 | 落点 |
| --- | --- | --- |
| 1a 抽取，行为不变 | 把 `applyPrologueEvent` 里补充相关的分支抽到 `prologue-inputs.ts`（W5-10 形状）；把助理的发送路由与回执抽成协作者 `assistant-inputs.ts`（W4-05 形状：≤25 个方法、≤300 行，只依赖自己的端口）；把 Coding 的回执渲染抽到 `input-receipts-client.ts` | agent-host、助理、Coding |
| 1b 合同 | 新子路径 `services/agent-inputs`（L0/L1 与来源）；`AgentRunControl.steer` 加 `key`、`interrupt`、`source` | contracts |
| 1c agent-host | 见下方列表 | agent-host |
| 1d Coding | 措辞改成 §3.3；发送方式菜单（补充 / 打断 / 下一轮）；「发送中」气泡与同键重发；宿主说明不再显示成你的话；「核对并继续」带上没读到的输入；计划轮次不再未经核实就写「已体现」 | Coding |
| 1e 助理 | 工作视图显示每条输入的回执（新模块；用删掉的重复渲染抵消资源字节）；回答 / 补充由用户点选；重试键跨刷新保存；运行中补充的原话按 person 来源记录（供「你说过」） | 助理 |

1c agent-host 的内容：

- 会话条目记录收下的输入：键、来源、方式，并给调用编号预留位置。
- 每个 Run 的补充串行处理，按落账顺序把键对应到 steerId。阶段 2 改为由 SDK 直接返回。
- 6 处宿主代写的 steer 标上来源。
- 「读到」从账内顺序推出：applied 之后，同一 Run 内的第一条模型产出。合同里注明这是推导。
- `RUN_NOT_RUNNING` 竞态改成排队或保留。
- `runViewVersion` 纳入输入状态。
- 恢复报告列出输入。

验收：四问的前半段在 Coding 与助理上真实——送达没有、读到没有、没读到的去哪了；§12 的强杀与竞态用例通过。

### 阶段 2：Prologue 通用能力

可与阶段 1 并行。依赖 Prologue 负责人认可，以及推送上游的授权。

- 按 §6.1 的第 1–8 项推进，顺序：
  1. 输入身份与事件（1、2、3）；
  2. 会话排队（4）；
  3. 处理说明与提醒（5、6）；
  4. TaskBoard / todo / pending 的引用（7、8）。
- 每项先写短合同与切片，跑内存 Host 与真实 Node Host 回归，做变异验证。
- 合入 Prologue main 后，按 `vendor/prologue-sdk/README.md` 出包：来源记录、sha256、最多再留一份在途包。
- 验收：Prologue 各册的「怎样才算这块可用」；在干净包上走通公开入口。

### 阶段 3：处理说明、关联、影响与纠正（Molis）

依赖：阶段 2 的包已换入。新合同在独立子路径，W5-09 拆分前后都可以做。

| 片 | 内容 |
| --- | --- |
| 3a 投影 | 投影 L2–L4 与观察到的影响（板版本差、逐轮变更、调用归因）；同一个 PR 里去掉阶段 1 的推导，改用 SDK 事件 |
| 3b 动作 | 读、撤回、纠正、关联、带到下一轮，登记为统一动作 |
| 3c 共享组件 | 回执条、详情、托盘、纠正菜单进设计系统，并登记到 `/__ui/catalog`；Coding 与助理改用它，删掉各自重复的渲染 |
| 3d Coding | 板上来源徽标、新任务提议、报告一节、变更集归因；登记处理说明的使用指令（`prompts.ts`，用户可看可改） |
| 3e 助理 | 处理说明与当前约定；交付说明 |

验收：Coding 与助理上四问全部能答，每个回答都有依据；真实模型下的说明率与归类一致率达到 §12.5 的观察值。

### 阶段 4：产品对象与 Goals 层

依赖：PR #340 合入；W3-01 调用编号。

- 输入与 Goal、待办、定时任务、成果之间的 Context Ledger 边；Goal 页显示「来自对话的输入」。
- 目标与验收类的影响走 Goals 提议（Candidate Goal、约定变更），本人决定后才生效。
- 外部 Runtime：Goals 新动作让外部 Agent 对笔记、要求、决定说明「已读到 / 处理方式」（§8.4）。
- 验收：Goal 页能回答「这条要求被哪个会话读到、怎么处理、改了什么」。

### 阶段 5：个人助理深化

依赖：阶段 3；W4-05 / W5-10 助理拆分；W4-10 订阅合并。

- 内容：§9.2 列出的工作目标、常驻计划、续做、有界的主动推进、历史搜索。
- 验收：§8.2 全路径用真实模型、在隔离 Home 跑通。

### 阶段 6：其他场景

每个场景一份小 spec。顺序：插件创作台（形态 A）→ Schedule 对话任务（形态 A，改走 `agent.run.*`）→ 灵光、炼金术士（形态 B）→ Shelf、开项目引导、Jelly、Images（形态 B）。

### 切 PR 的规则（防腐门禁）

- 先抽取，后加功能。任何 PR 都不让巨大单元变大；新写的单元拆到阈值以下。
- 合同改动单独成 PR：API 快照加影响说明。
- 界面 PR 同时删掉被替换的重复渲染，保证 `/assets/` 字节不增。翻译键按 `apps/workbench/README.md`「界面文字」的稳定键做法。
- 源码不出现 `legacy`、`compat`、`backfill`；新测试只引用公开入口。
- 改了 agent-host：跑它 README 列出的用例，以及 `agent-*`、`prologue-*`；动到真实 SDK 路径时，用本机替身模型服务跑一次。

## 12. 验收方法

### 12.1 核心验收（四问）

- Coding 与助理各一套脚本化场景，即 §8.1 与 §8.2 的步骤。
- 检查器对每条输入读 `AgentInputView`：四问各自要么有内容，要么明确写「无」。
- 每个非空字段至少有一条依据，能解析到事件、回执、板版本或调用记录。
- **硬门：「没有依据的状态」数为 0。**

### 12.2 工程验证

| 项 | 怎么验 |
| --- | --- |
| 事实不伪造 | 变异删掉某个事件，对应状态必须消失；只有 AI 声明时，`outcome` 不能是 realized |
| 强杀 | 在 §7 每一行的时间窗口强杀真实 Node Host，重启后的状态与可做的事符合表格；同一个键不产生两条 |
| 竞态 | 真实交错，不能只顺序调用：补充与轮次结束；同一边界两条补充（被同一次调用读到）；审批中、问题中、暂停、休眠时补充；两个页面同一个键；纠正与 AI 说明交错 |
| 来源 | 6 处宿主代写不再显示成本人；记忆的「你说过」只认 person |
| 门禁 | `pnpm health:check`（巨大单元、合同纯度、资源字节、翻译）、`pnpm boundary:check`、API 快照 |

### 12.3 真实模型与产品实操

- 用 MiniMax（anthropic-messages）把 §8.1、§8.2 的脚本各跑至少 10 次，记录说明率、与人工标注的归类一致率、纠正率。
- 浏览器里把主路径点一遍：加载、成功、失败、取消、没配置模型、窄屏、深色、中文输入法。
- 用隔离 Home，不动真实 Home。

### 12.4 用户验收

用户按脚本自己用 Coding 和助理，事后不看日志，逐条回答四问。答不出或答错的条目就是缺陷。工程验证、真实实操、用户验收分别记录，前两者不能代替用户验收。

### 12.5 指标

| 指标 | 要求 |
| --- | --- |
| 丢失的输入 | 0（硬门） |
| 没有依据的状态 | 0（硬门） |
| 读到后、本轮结束前有说明的比例 | 先观察两周再定门 |
| 归类与人工标注的一致率 | 先观察两周再定门 |
| 用户纠正率 | 先观察两周再定门 |
| 从发送到读到的中位时长 | 先观察两周再定门 |
| 「还没处理的」里超过一天的条目数 | 先观察两周再定门 |

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

阶段 4 的 Goals 关联与外部 Runtime 回执要在它合入之后再做（同改 `modules/goals` 与 `project-capabilities.ts`）。

### 13.5 Coding 下一阶段

`next-requirements.md` 的 C4 旁问与本文的「只问不改」是同一件事，由本文的发送方式菜单承载。

## 14. 决策记录

2026-10-09 用户回复「按你推荐，开工」：下表九项都按「推荐」一列定下。

| # | 事项 | 选项 | 推荐（即结论） |
| --- | --- | --- | --- |
| D1 | 处理说明工具放哪 | 放 Prologue 系统工具；先在 Molis agent-host 做宿主工具 | 放 Prologue：要和输入身份、提醒在同一账里，其他嵌入 App 也需要 |
| D2 | AI 判为新任务时怎么进 TaskBoard | 先提议、你点头才进；允许 AI 直接加步骤 | 先提议：与计划确认、Candidate Goal 一致 |
| D3 | 运行中的默认发送方式；Esc 的含义 | 默认补充，Esc 不再直接停止（停止要按按钮）；维持现状 | 默认补充；Esc 不直接停止 |
| D4 | 一轮结束时还有没处理的输入 | 询问后再带到下一轮；自动开下一轮 | 询问；会话里可以设成自动 |
| D5 | 助理的回答 / 补充怎么区分 | 用户点选目标；保留自动规则 | 用户点选（2026-10-12 修订，见 D14：默认值显示在芯片上，不必每次点选） |
| D6 | 与 ai-interaction-experience 的关系 | 两份并列、共用本文的输入合同；合成一份 | 并列，共用合同 |
| D7 | 开工顺序 | 等 prologue-adoption 合入、换成 Prologue 主线包后再开阶段 1；在现包上先做 | 等：避免与它在同一批文件上抢改，并直接用会话条目 |
| D8 | AI 是否必须说明每条读到的输入 | 必须，提醒有界、不阻塞收工；可选 | 必须，提醒有界 |
| D9 | 助理每项工作是否引入常驻 TaskBoard | 引入（阶段 5）；只用 `update-todo` | 引入；先在 Coding 验证关联，再上助理 |

**2026-10-12 统筹按用户的拍板规则（技术决策按防腐线、功能决策选界面与日常体验最好的）补记：**

| # | 事项 | 结论 | 理由 |
| --- | --- | --- | --- |
| D10 | 输入回执与「情境条」（情境线助理输入框上方的「手上的东西 + 落点」）的边界 | `AgentInputView` 只记用户的话、来源（`source`）和发送方式（`mode`），**不带附带的情境和材料**。情境条走现有的 `AssistantSendInput.context` 和 `materials` 字段，仍归各自的主人 | 单一事实主人：回执回答「这句话被怎么处理」，情境和材料不是这句话的一部分；塞进回执就有两份真相。与 §6.2 草案一致（`AgentInputView` 本来没有这两项），无冲突 |
| D11 | S2 排队的 D4 开关放哪 | 放 SDK 会话（`session.setQueuedInputCarry`），Molis 不另存一份；缺省 `ask`，设成 `auto` 后只作用于 App 开的 Agent 跑，子任务唤醒的续跑一律不带 | 单一事实主人；防止子任务完成偷渡未读用户输入的消费权限（需求书 §17 的约束） |
| D12 | S3 说明工具的可见性 | 常驻（不按有没有输入切换），plan / ask / App-tools 模式可用；Character 或开跑名单没列它就不提醒不挡。Molis 若显式列工具，要把 `acknowledge-inputs` 加进去，并在 `createRuntime` 注入 `app-ref` 解析器（对接 Context Ledger 的对象引用） | 跑中增删工具会让提示缓存整段失效；不绕过 App 的名单 |

**2026-10-12 与交互线的三件跨线约定**（统筹按用户的规则定，源头是 `specs/ai-interaction-experience`）：

| # | 事项 | 结论 | 理由 |
| --- | --- | --- | --- |
| D13 | 回答（选项点选、卡片按下）作为输入的身份 | 回答也是输入：身份类型与格式由本线 `services/agent-inputs` 定义，交互线只引用。回答的 `key` 与 steer 的 `key` 同一规则（steer 必填就都必填，可选就都可选；SDK S1 里 steer 的 `key` 是可选的，所以回答的也是可选）。回答的「读到」回执在本线 S4 做，S4 要覆盖 pending 的 `about` 与「已回答 / 已过期」事件；在那之前，交互线只在 Molis 侧做幂等 | 单一事实主人：输入合同只在一处定义。注意回答走 pending 的结算、不走 steer 账，所以 SDK 现在没有它的「读到」事实，不能由 Molis 猜；这也是 S4 仍等采用线 P1 的原因之一 |
| D14 | D5 修订：问题待回答时输入框怎么选目标 | 目标芯片三种状态、默认值显示在芯片上（见 §4.1）：「写进问卷：补充要求」（交互线）、「补充这一轮」（本线 1e，一条 steer，排在回答之后，带回执）。有自由文本题默认第一种，没有默认第二种；无问题时芯片不出现 | 比 D5 原来的每次点选少一次点击，默认值一直看得见，也不会把补充误当成回答。SDK 侧「补充排在回答之后」已是现行行为（S1：补充与回答分开，等人时补充排着队，回答后的下一个模型边界才放进上下文） |
| D15 | `AgentRunControl` 的搬迁先后 | 交互线 C1 搬出 `answer` 分支，本线搬出 `steer` 分支（见 §6.2「改现有控制合同」）；先就绪的一方先合，后合的一方在同一个 PR 里改完所有消费者 | 两边改同一个联合类型，API 快照与调用方都会动；不并行抢改 |

**待办（归本线，D7 之后接 S3 时定；2026-10-12 统筹交来）：**

| # | 事项 | 现状 | 本线的方向（接 S3 时再定稿） |
| --- | --- | --- | --- |
| D16 | S3 的系统工具 `acknowledge-inputs` 在助理面板里怎么显示、用什么措辞 | 它在 `APP_MODE_SYSTEM_TOOLS` 里；采用线暂时在助理面板活动行（`assistant-service.ts` 的 `presentActivity`）里把它藏了，因为裸工具名不能直接给人看 | 处理说明显示在**对应那条输入的下面**（回执条与详情里的「AI 的理解」，§3.3 措辞规则：只用「AI 的理解」，不写「已生效」），不作为独立的活动行；活动行上永远不出现裸工具名。R0 预览已按这个口径画（说明行只写「助理说明了 N 条输入怎么处理 · 它自己的声明，不是执行记录」，用例逐检查点断言页面上没有 `acknowledge-inputs`）。真正的措辞、是否在时间线上留一条弱提示、`appRefs` 解析器怎么接 Context Ledger，要等 Molis 接 S3 时按当时的产品形态定；接之前不动采用线的隐藏 |

以上与本线 SDK 的 S1/S2/S3 合同无冲突。

仍需用户另行授权的：两仓的提交（Prologue `AGENTS.md` §8 要求明确授权）、推送 Prologue 分支并合入它的 main、开 PR、替换正式安装版。

## 15. 附：调研中发现的文档与代码不符

| 文档里写的 | 代码里的实际情况 |
| --- | --- |
| `docs/platform/PROLOGUE-AI.md` §3 写了 Jelly 的分段摘要与合并 | 只有计划拆解 |
| `docs/platform/PROLOGUE-AI.md` §2 把 Characters 当作 Agent 示例 | 它的执行转到 Coding 或本地终端，也不声明 agent 角色 |
| `docs/platform/PROLOGUE-AI.md` §2 的表暗示 Agent 场景都经 `agent.run.*` | Schedule 的到点任务在进程内直接 `agentHost.start`，不经 `agent.run.*` |
| Prologue 执行队列把 intervene、card 标为 `[x]` | 运行时没有接线 |
| 插件创作台的 Manifest 声明了 run 类能力 | 源码不调用 [推断] |
| `specs/ai-interaction-experience` §7.5 写「历史记录兼容读取」 | 与现行 `AGENTS.md`「合同读写都只认现行取值」冲突 |

## 16. 进度

- 2026-10-09：方案写定（§0–§15），用户按推荐定下 §14 九项。阶段 0：本文改为执行中；Prologue 侧开工作树 `~/code/prologue-input-receipts`（分支 `feat/input-receipts`，基于主线 `4f7110fe`，未推送、未提交），基线核对：`tsc` 通过；14 个相关用例文件（控制、待办、任务板、提醒、会话续接、Run 恢复）在构建后全部通过。按 Prologue `AGENTS.md` §4 先写切片合同再实现：S1 输入身份与读到回执、S2 会话级持久排队、S3 处理说明与提醒、S4 任务板与待办引用输入；pending 的 about 与已回答事件推后（另一分支正在改 effect-policy）。阶段 1 的 Molis 代码等 `feat/prologue-adoption` 合入（它已把 Coding 的运行控制解析抽到 `plugins/native/coding/src/run-inputs.ts`，阶段 1 的 Coding 改动落在那里）。

- 2026-10-12：接续开工（receipts 会话）。Prologue：S2 分支 `feature/input-receipts-s2` 先合 main `69ccfa94`、跑 S1 回归，按统筹要求换基点到采用线的干净 S1（`edb8ec86` = `c4b9fde3` + S1 `4acfb445` + main `69ccfa94`），之后整合是快进。S2 切片合同 `docs/slices/input-queue.md` 先写后做：会话级持久排队、获准才带（默认 `ask`，`auto` 只作用于 App 开的跑）、历史可见不等于获准消费（没读到的原话不进后续入模历史）、子任务唤醒续跑不带、键整条会话去重、重启收口时入队。工程证据（三级分开）见 SDK 合同的验收记录；真实 Provider、Molis 生产入口、用户实操都未跑。Molis 分支合入 main `02ceba8c`；§6.1 第 4 项按 S2 实际入口改写，§6.2a 记下按现行 contracts 核对的落点。

- 2026-10-12（续）：S3（处理说明与有界提醒）在 Prologue `feature/input-receipts-s3` 上实现并工程通过（基点：采用线整合末端 `a13bf067` 合入 S2 得 `c0194228`）。切片合同 `docs/slices/input-handling.md`，决策记录 H1–H15。要点：模型只能说明这一跑里已读到的输入；说明没有权威、不改 `state`；提醒有界、只写编号、不挡死收工；`later-step / new-task / needs-clarification` 暂用 `note` 补足，S4 有了步骤与问题目标再收紧。Molis 侧准备：D10–D12 写入 §14；§6.2 `AgentInputView.handling` 的字段取自投影的 `handling` / `handlingRevisions`（`impacts` 为模型自称，观察到的影响仍由 S4 / Molis 投影）。
- 2026-10-12（再续）：R0 独立回执体验预览实现并工程通过（见 §18.8）。脚本 `scripts/preview-input-receipts.mts`（端口 4292）读 `scripts/input-receipts-slice/recorded/` 里用 Prologue S3 末端（`37427d09`）的真实 SDK 录下的事实，只做展示，不计算状态。非浏览器用例 11 条、浏览器用例 10 条（PR #438；三宽度 × 浅深色 × 两种布局 × 四个场景、键盘、输入法、托盘、纠正、结束卡与重启分支）通过；健康门禁 `--base origin/main` 通过，新文件 Biome 0 诊断、类型检查干净、secrets 干净。**真实产品实操不适用（预览不连 Home）；用户本人验收未进行。**
- 2026-10-12（统筹交来）：Prologue S2/S3 已随 Prologue #5 合入 Prologue main（合并提交 `f5ef12e6`），采用线正在把这个包换进 Molis。新增待办 D16（§14）：`acknowledge-inputs` 在助理面板里的显示与措辞归本线，D7 之后接 S3 时定。

## 17. 远端交接（2026-10-11，当前接续入口）

用户已授权四条 Codex 任务及 SDK 依赖分别提交、推送。本分支 `feature/handoff-ai-input-receipts` 基于 Molis `7b4a92287`，保存本完整需求及最新交接；本分支没有 Molis 产品实现。前文的旧主线、旧分支、绝对路径和“提交/推送待授权”只描述当时状态；本文为本线唯一需求书。本次未合并 main、发布或改动正式安装。

- S1 实现已保存到 [Prologue 提交 c1473141](https://github.com/molis-ai/prologue/commit/c147314129f495f6a177782f27906cfba592f7a7)，分支 `feature/handoff-input-receipts-s1`，基点 `4f7110fe`。合同与具体证据在该树 `docs/slices/steer-receipts.md`。
- S1 收尾已经验证输入参数在异步落账前固定、终态撤回拒绝；16 项控制回归、6 项 Node Host/公开面测试和独立安装包的真实 HTTP/磁盘回放通过。真实 Provider、Molis 生产入口、用户实操及收尾后的 SDK 全量未跑；10-09 全量只属于当时版本。
- [A0 SDK 整合提交 820eeca9](https://github.com/molis-ai/prologue/commit/820eeca947c208dd8b37f9e57671ce81ec04e34e) 已包含完整 S1，供 [Molis 完整采用](https://github.com/molis-ai/molis-work/tree/feature/handoff-prologue-adoption/specs/prologue-adoption) 使用；不要重复叠加 S1。该候选默认 Molis build/回归尚未完成，包的 dirty 来源还需正式收口。
- D7 定义不变：正式 SDK 来源、Molis 默认包路径验证、采用线合入 Molis main 三项都满足后，再写相应的 Molis 生产接入。远端分支可取回不等于 D7 通过。
- S2 尚未实现。下一位先按 SDK 合同补持久队列：只保存输入，不自动开始下一 Run；历史材料、读到回执、子任务完成与获准消费输入必须区分。D4 仍默认先询问，会话显式设置才可自动；子任务的完成续跑不能偷渡未读用户输入的消费权限。（2026-10-12 更新：S2 已在 Prologue `feature/input-receipts-s2` 实现并工程通过，基于采用线的干净 S1；待采用线整合。见 §16。）
- S3 的处理说明与有界提醒、S4 与任务板引用、Molis 发送方式/展示/后续验收继续按本文全范围做。TaskBoard 拥有所有 Agent 协调，Run/message 只管执行与投递；不另起平行协作状态。真实 SDK 回执是事实来源，不能用 UI 猜测或模拟状态代替。

接手先克隆本分支读完整需求，再取 SDK S1 分支读切片合同与可复现命令；S2 独立 SDK 工作按其依赖推进，Molis 生产接入遵守 D7。源码、构建、浏览器与全量资源按两仓 AGENTS 协调，不干预别人进程或真实 Home。

## 18. R0 独立回执体验预览（2026-10-12，规划；实现记录见 18.8）

**为什么现在做。** S4 等采用线 P1，Molis 生产接入等 D7。R0 让用户提前看到实物，同时把 §4 的交互走一遍：放在 `scripts/` 下，不碰产品源码、合同、宿主和 SDK，所以不受 D7 约束（同 I0、W0 的做法）。统筹 2026-10-12 按「功能线按体验走」定下。比 R0 更值得先做的事，我核过一遍没有：Molis 合同（`services/agent-inputs`）在 D7 之前合不进 main（占位子路径门禁要求同 PR 有使用方，§6.2a），能做的落点核对已在 §6.2a。

### 18.1 范围

| 部分 | 做什么 | 对应 |
| --- | --- | --- |
| 回执条 | 每条输入下一行：图标 + 派生状态 + 目标，状态变化 `aria-live=polite` 播报，不抢焦点、不移动阅读位置；宿主说明换样式、没有回执条 | §4.2、§3.3 |
| 回执详情 | 点开在原地展开（窄屏底部抽屉），回答四问：怎么处理（AI 的理解，带「纠正」）、在哪里、改变了什么、还差什么，外加「依据」一行（送达、排在什么之后、哪次调用读到、AI 说明的时刻），每一项能点到它引用的那条事件 | §4.3、§3.6 不变量 1 |
| 「还没处理的」托盘 | 输入框上方一行「N 条还没处理完」，展开分五类：没读到、读到没说明、说要做还没完成、没采纳待你决定、需要你澄清；一轮结束时结束卡片带同一个列表和三个操作（带到下一轮 / 全部撤回 / 逐条处理） | §4.4、S2 |
| 纠正 | 回执的「纠正」菜单：改处理方式、改关联、补一句、撤回；提交后显示「你改为…」，再作为一条带 `about` 的新输入发出；读到之后撤回按钮换成「已读到，不能撤回，可发更正」 | §4.6、§3.6 不变量 5 |
| 轮次结束与报告 | 结束卡片每条输入一行结论；Coding 报告「补充要求」一节同口径 | §4.7 |
| 恢复 | 顶部「这一轮被中断，N 条输入需要确认」，逐条标「已送达未交给 AI / 已交给 AI 未读到」，可带到下一轮或撤回 | §4.8、S2 收口 |
| 目标芯片（D14 的「补充这一轮」那一半） | 有问题等回答时芯片出现，默认值显示在芯片上；本片只做「补充这一轮」（一条 steer，排在回答之后、带回执）；「写进问卷」那一半由交互线做，本片放一个标明「交互线」的占位，交互线 #423 的输入框标记合入 main 后改用它 | §4.1、D14 |
| 发送方式菜单 | 补充（默认）/ 打断并改向 / 这一轮结束后再做；「只问不改」标「Coding 下一阶段」不可选 | §4.1、D3 |
| 两种布局 | 助理面板（窄列）与 Coding（工作台主区）共用同一份展示与状态逻辑 | §8.1、§8.2 |
| 工艺 | 1440 / 1024 / 390 三个宽度；浅深色；键盘可达（Tab 顺序、Enter/Space、Esc 收起详情与菜单、焦点回到触发处）；中文输入法组合期间回车不发送；减少动态效果偏好；长会话里回执更新不让布局跳动 | §4.9 |

不做：真实模型、宿主、Home、产品页面与资源；「只问不改」；TaskBoard 节点与产品对象关联的真实数据（S4 / 阶段 4）；「已生效」（只能由回执给出，R0 没有 L4 回执，见 18.3）。

### 18.2 数据从哪来（取舍）

统筹的原意是「固定事件，经 SDK 公开的纯函数 `projectInputReceipts` 投影」。核下来有一个现实约束：**Molis main 现在 vendored 的 SDK 是 `9fc3b173`（S1 之前），没有 `projectInputReceipts`**；采用线的包（A0 + S1 + 问卷，在 #408）有 S1 版本，但没有 S2 的 `carried`、会话排队，也没有 S3 的 `handling`。会话排队本身是 Session 方法，不是纯函数。

可选的三条路：

1. 等 #408 合入再做，S1 部分现场投影，S2/S3 部分另想办法——要等，而且仍要处理 S2/S3。
2. 在预览里另写一份投影——这是「用 UI 猜测或模拟状态代替真实 SDK 回执」，需求书 §17 明确不许。
3. **（选这条）用真实 SDK 把事实录下来，预览只读录好的事实。** 在 Prologue S3 末端（`37427d09` 及以后）上用 SDK 自己的测试替身（内存 Host + 脚本模型）把 §8.1、§8.2 各一组场景真跑一遍，录下每一跑的事件账、`projectInputReceipts` 的输出、`session.inputQueue()` 的输出，连同来源（Prologue 提交、录制脚本、时间）一起写成 JSON 放进 `scripts/input-receipts-slice/recorded/`。预览启动时只读这些文件，不再计算任何状态。录制脚本 `scripts/input-receipts-slice/record.mts --sdk <已构建的 @prologue/sdk 目录>` 只在开发时手动跑，不进 CI、不进产品依赖。

选 3 的理由：事实全部出自真实 SDK（同一个投影函数、同一套账），不另写第二份状态机；不等 #408；S1/S2/S3 一次覆盖。代价：录下的是某个提交的输出，SDK 改了要重录——用一条检查兜住（每个录制文件带来源提交，界面上显示出来）。**换包的那个 PR（Molis 的 vendored SDK 含 S3 之后）里，预览改为现场调用 `projectInputReceipts` 与 `session.inputQueue()`，同一个 PR 删掉录好的投影文件**，只留事件账；不留两条路。

Molis 层的事实（L0「发送中」、页面代写来源、本人的纠正与关联记录、`call_id`）SDK 没有。预览里这几样由预览自己的状态给出，并在界面上标「Molis 层（模拟）」——它们本来就归 Molis agent-host 写，R0 只是先画出来；TaskBoard 步骤、产品对象、观察到的影响（S4 / 阶段 4）一律不画假数据，按 §3.4「没有事实的维度只显示 AI 的说法」。

交互动作（撤回、带到下一轮、纠正、打断）落到哪份事实：每个场景录成若干分支（例如「撤回」「不撤回」各录一跑），用户在预览里点哪个，就切到录好的哪一份；没录的分支按钮置灰并说明。不在页面里伪造事件。

### 18.3 页面上怎么标

- 页面顶部常驻一条：「预览：事件来自 Prologue `<提交>` 的真实 SDK 用脚本模型录下，不是真实运行；Molis 层为模拟」。
- 每条回执的「依据」写清事实来源：SDK 事件（带序号）、SDK 投影、会话排队、或「Molis 层（模拟）」。
- 不出现「已生效」：R0 没有 L4 回执。结论只到「AI 已读到 · AI 的理解：…」「说要做，还没完成」等，与 §3.3 措辞规则一致。

### 18.4 落点与边界

- 分支：R0 的代码单独走 `feature/ai-input-receipts-r0`（PR #438，从 main 起，Draft），本需求书分支 #409 只放文档。文件：`scripts/preview-input-receipts.mts`（启动与路由，端口 4292）、`scripts/input-receipts-slice/*`（录制、读取、两种布局的渲染、浏览器端行为）、`tests/input-receipts-slice.test.ts`（非浏览器）、`tests/input-receipts-slice.e2e.test.ts`（浏览器，持 browser 锁跑）。
- 只用设计系统现有公开部件与令牌，样式不进 `/assets/` 冻结资源；新文件各自守健康门禁的单元上限（拆到阈值以下，不登记例外），Biome 规则从 0 起算（不用 `console`、`as unknown as`、空 `catch`）。
- 不改 `apps/`、`horizontal/`、`plugins/`、`packages/` 下任何产品代码；与交互线只在设计系统部件上交汇（#423 合入后改用，不复制）。

### 18.5 验收（编号）

- **RCPT-R0-01** 每条输入有回执条，状态文字与 §3.3 表一致；同一状态在助理与 Coding 两种布局里文字相同。宿主说明没有回执条、样式不同。
- **RCPT-R0-02** 回执详情回答四问，每个非空字段至少一条依据，点开能看到它引用的事件（SDK 事件序号或「Molis 层（模拟）」）；没有依据的状态数为 0（§12.1 硬门）。
- **RCPT-R0-03** 托盘五类的计数与录制的 SDK 事实一致（S1 读到、S2 排队、S3 说明）；结束卡片三个操作各走到录好的分支；没录的分支置灰并说明。
- **RCPT-R0-04** 纠正：读到之前撤回成功（对应 `steer-withdrawn`），读到之后撤回按钮换成「可发更正」；更正作为带 `about` 的新输入出现，回执显示「你改为…」。
- **RCPT-R0-05** 目标芯片：有问题等回答时出现，默认值显示在芯片上、一下切换；「补充这一轮」发出的是排在回答之后的补充，回执与普通补充同一套；「写进问卷」标明交互线；没有问题时芯片不出现，回车照常发送。
- **RCPT-R0-06** 恢复：中断场景顶部提示、逐条标「已送达未交给 AI / 已交给 AI 未读到」（出自 S2 收口的录制事实），可带到下一轮或撤回，收口不自动开新轮。
- **RCPT-R0-07** 工艺：1440 / 1024 / 390 无横向溢出、触控目标 ≥44px（390）；浅深色；全程键盘可达，Esc 收起后焦点回到触发处；组合输入期间回车不发送；减少动态效果时无过渡；回执更新时阅读位置不跳。
- **RCPT-R0-08** 来源诚实：页面常驻模拟标识；每个录制文件带来源提交且与界面显示一致；页面上不出现「已生效」；预览不连 Home、不发真实网络请求。

### 18.6 证据怎么记

- 工程通过：非浏览器用例（录制文件的形状与来源、每个展示状态都能追到一条事实、措辞规则）；浏览器用例（上面八条里能自动化的部分，三宽度、浅深色、键盘）；健康门禁 `--base origin/main`；secrets。
- 真实产品实操：不适用——预览不连 Home、不跑真实模型（与 I0 同口径），只有开发者在内置浏览器里的走查记录。
- 用户本人验收：给用户看实物，按 §12.4 的问法逐条答四问；未进行前一直写「未进行」。

### 18.7 切法

一个 PR（实际：从 main 另开的计划内 PR #438，与 #409 谁先合都不冲突），内容按顺序：录制脚本与录好的事实 → 读取与展示状态的纯函数（附非浏览器用例）→ 两种布局的页面 → 浏览器端行为 → e2e 与走查记录。交互线 #423 合入 main 后，芯片的「写进问卷」占位改用它的部件（小改动，另起提交）。

### 18.8 实现记录（2026-10-12）

**落点（PR #438，`feature/ai-input-receipts-r0`）。** `scripts/preview-input-receipts.mts` 起一个只读的内存服务（127.0.0.1:4292）；`scripts/input-receipts-slice/` 下：`record*.mts` 与 `record-child.mjs`（开发时手动跑，用 SDK 的内存 Host 和脚本模型真跑五个场景，录事件账、`projectInputReceipts` 输出与 `session.inputQueue()`，重启场景用被 SIGKILL 的子进程）、`recorded/{assistant,coding}.json`（两种体裁各一份，带来源提交）、`scene-state.ts`（把账投影成页面行、托盘、阶段，纯函数）、`ui-state.ts`（点击怎样移动游标或切到录好的分支，纯函数）、`headline.ts`/`labels.ts`（措辞规则：「读到」只给 read，「AI 的理解」只给模型的声明，不出现「已生效」）、`render*.ts`/`styles.ts`/`client.ts`（页面）。测试：`tests/input-receipts-slice.test.ts`（11 条，不开浏览器）、`tests/input-receipts-slice.e2e.test.ts`（10 条，真 Chrome，持 browser 锁）。

**本线定下的几处（与 18.1 的差异，记在这里）。**

1. **回执详情在所有宽度都原地展开，不做「窄屏底部抽屉」。** 详情是回执条的延续；抽屉会盖住输入框和时间线，390 宽实测原地展开不溢出、焦点与 Esc 也更简单。
2. **「预览不是真实运行」从标题栏挪到常驻的整行说明。** 标题栏里它在 1024 被省略号截断、在 390 被整个藏起来，违反 RCPT-R0-08；整行说明在任何宽度完整显示、窄屏换行（浏览器用例逐宽度断言）。
3. **助理面板后面的工作区用设计系统的 `--scrim` 压暗**，不另造颜色；它标明「示意，不可操作」且 `inert`。
4. **两个检查点共用一个账位置时（队列变了、账没变，如「被停下」与「全部撤回」）以人跳到的那个为准**：`Ui.checkpointId`，游标一动就忘。这是走查时发现的缺陷（点「全部撤回」页面不变），已修并补用例。
5. 纠正只记「你改为…（Molis 层，模拟）」；唯一有录制分支的是「坚持采纳」，其余不播放 AI 的回应。「只问不改」不可选，「写进问卷」是标明归交互线的置灰占位。#423 合入 main（`05c46f67`）后，问题等回答时输入框里的「内容往哪去」标记已改用它的 `renderInteractionComposerTarget`：页面服务端用它渲染好再嵌入，浏览器端不抄一份标记，用例核对页面显示的就是嵌入的那份。

**验收对照（工程通过；每条的自动化部分）。**

| 编号 | 自动化 | 说明 |
| --- | --- | --- |
| RCPT-R0-01 | 单元：两种布局同一条输入同一文字；宿主说明无回执条。浏览器：重启场景 | |
| RCPT-R0-02 | 单元：每个展示状态都追到账上的事实、独立于投影再核一遍；浏览器：纠正显示为 Molis 层（模拟） | |
| RCPT-R0-03 | 单元：托盘计数、两个检查点分辨；浏览器：托盘展开、从行里打开输入、带到下一轮 / 全部撤回各走录好的分支 | 没录的分支置灰 |
| RCPT-R0-04 | 单元：撤回只在账里有撤回处给出，读到后不能撤回；浏览器：输入法组合中回车不发送 | |
| RCPT-R0-05 | 单元：芯片只在有问题等回答时出现；浏览器：问题场景先排队、回答后被读到 | 没有问题时回车照常发送：单元 |
| RCPT-R0-06 | 单元：被杀的宿主；浏览器：重启并核对后的横幅、不自动开新轮 | |
| RCPT-R0-07 | 浏览器：3 宽度 × 浅深色 × 助理/Coding × 4 场景无横向溢出、输入框在视口内、回执条存在；390 下触控目标 ≥44px；Tab 进入回执条、Enter/空格开合、Tab 进详情、Esc 收起并还焦点；减少动态效果时详情无动画；非播放的重绘不移动阅读位置；390 下详情与托盘展开不溢出 | 「回执更新」在 R0 只有演示回放；回放按设计跟到末尾，所以阅读位置只对非回放重绘断言 |
| RCPT-R0-08 | 单元：录制文件来源提交一致、页面无「已生效」；浏览器：说明整行在每个宽度完整、全程无页面错误；预览服务只读、不连 Home、不出网 | |

**证据三层分开记。** 浏览器用例在 PR #438 合入 main `05c46f67` 之后的末端（`ca8d2262`）持 browser 锁跑，10/10；`--base origin/main` 的健康门禁在同一末端通过。

- **工程通过（做了）：** 上表；`node scripts/check-health-gates.mjs --base origin/main` 通过；新文件 `biome lint` 0 诊断；用临时配置对新文件做了类型检查（仓库根 tsconfig 不含 `scripts/` 与 `tests/`）；`pnpm secrets:check`（`node scripts/check-secrets.mjs`）干净。
- **真实产品实操：** 不适用。预览不连 Home、不跑真实模型；开发者在内置浏览器里走查了主场景、被停下、问题、重启四个场景在 1440 / 1024 / 390 与浅深色下的样子，并在走查中发现并修了上面的 2、4。截图由 Chrome 用例按宽度与主题生成。
- **用户本人验收：** 未进行。给用户看实物时按 §12.4 的问法逐条答四问。

**没做 / 风险。** 「写进问卷」那一半仍是置灰占位（等问卷有自由文本题，归交互线）；录制绑定 Prologue `37427d09`，SDK 再改要重录（界面上显示了来源提交）；Molis 层（发送中、页面纠正）全是模拟；预览没有真实的「回执更新」，所以 RCPT-R0-07 里「更新时不跳」只覆盖了非回放重绘；全量回归未跑（统筹批量跑）。
