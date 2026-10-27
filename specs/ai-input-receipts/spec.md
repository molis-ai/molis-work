# AI 对话的输入回执：这句话被怎么处理、在哪里处理、改变了什么、还差什么

状态：执行中（2026-10-20，回执线收尾交接）。阶段 1、阶段 3 与 SDK 一侧的 S1～S4 已合入 main；阶段 4 合入了一半（交接时在途的 #829、#837 也已合入），后一半没开工（BL-314）；阶段 5、6 没开工。工程通过，#837 的时间线、详情与定位已补真实浏览器验证；其余实走及英文内容缺口见 §12.6，用户本人还没验收。接续入口是下面的「交接（2026-10-20）」。

> 2026-10-15 需求补充、2026-10-16 用户已接受（D20）：有效要求跨摘要、跨轮和恢复的保留合同见 §20；归本线 Claude。R1 做了 RCPT-101/102（§20.5），其余随各片做。

覆盖所有 AI 对话场景里「用户输入的处理反馈」。Coding 是验证样本，全局助理是第二个首批场景；同时给出个人助理等对话场景的深化方向，以及其他 AI 场景的适用性判断。界面上的 Option、推荐动作和交互卡片归 `specs/ai-interaction-experience`（主检出里未入库的需求书，分工见 §13.2）；本文只拥有「输入」这条生命周期，以及它与任务、结果的关联。

## 交接（2026-10-20）

回执线（⑥）按用户 10-20 的安排在这里收尾。本节是**唯一的接续入口**，取代：

- `coordination/2026-10-18/lines/` 里回执线那份；
- 本文更早的「远端交接」（§17、§19）与「统筹更正」段落。

开头那两段提示已删去；§17、§19 只留标题和一句指向这里的话，原文在 git 历史里。§16「进度」和各片的实现记录是当时的记录，照旧保留；与本节不一致的，以本节为准。

**现状。**

- 已合入 main：
  - 阶段 1 与阶段 3：Coding 与助理的补充回执、托盘、撤回与纠正、报告、步骤板来源、AI 记下的约定、交付说明（3e-2a）；
  - SDK 一侧的 S1～S4。
- 阶段 4：只合入了一半，余下的没开工（交接时在途的 #829、#837 已由 ⑤ 合入）。
- 阶段 5、6：没开工。
- 证据等级：工程通过。用户 10-20 授权的合并验证已补 #837 的中英外壳、390/1024/1440 宽与交错明暗主题实走，24 张截图核对时间线 → 处理说明详情 → 原话定位；历史类型与详情仍有中文，未宣称英文体验完整。其余实走及本人验收仍待补（§12.6）。
- 所以本文不归档。

**已合入。**

- **Molis（PR 与合入提交）：**
  - 阶段 1：#531 `9a8839669`（1a）、#552 `2c91cd36c`（1c）、#564 `bd2472ae7`（1d）、#589 `ca36cb959`（1e）；
  - R1 与 A：#601 `54cf1dd80`（R1）、#605 `f9989ea51`、#610 `4ffa88cc3`（A）；
  - 3a、3c、B、C1、D1：#614 `ea396a276`（3a）、#622 `bf33f5ef3`（3c）、#628 `446c05218`（B）、#639 `d7a572133`（C1）、#643 `7a55444fd`（D1）；
  - 测试修复：#645 `f63f9945f`、#646 `b3c549aa8`；
  - 3b：#649 `a77407868`（3b-1）、#667 `e49f6a558`（3b-2a）、#671 `4b063bf98`（3b-2b）、#687 `1483a9f2c`（3b-2c）；
  - 3d：#682 `62e52c373`（3d-1）、#688 `877dc7626`（3d-2）、#700 `e128c1203`（3d-3）、#706 `149faac7d`（3d-4）、#711 `eb3bf7131`（3d-5）；
  - 3e：#713 `0ffa9842d`（3e-0）、#714 `e5adc24c2`（3e-1）、#726 `f28088b2b`（3e-0b）、#803 `bca2e3bf1`（3e-2a）；
  - 评审修复：#778 `380d365e1`；
  - D3 与 D32-b：#795 `fbc826b68`（D3）、#807 `7d1cc4bfa`（D32-b）；
  - 阶段 4 的前三片：#793 `2a9ff71d7`（BL-144，RCPT-368）、#813 `914a64982`（S2-1）、#818 `fba58a068`（S3-1，RCPT-390）。
- **Prologue（`molis-ai/prologue`）：**
  - #4 `55b0c85ae`、#5 `f5ef12e60`（S1～S3）；
  - #10 `c9a6e7749`（S4）；
  - #54 `27daa94ea`、#55 `26a86ff3b`（BL-162 的调用归因）。

**交接时在途、现已合入 main（2026-10-20 核对）。**

| PR | 片 | 合入提交 |
| --- | --- | --- |
| #829 | S3-3：Agent 一轮的工具调用及本人点击建议带宿主核过的会话（S-17，RCPT-391～395） | `ad5a60abb` |
| #837 | S2-2：`goals.events.acknowledge`，外部 AI 会话对笔记、要求、决定说明处理方式（RCPT-376～383）；同一 PR 带 P7 的显示名表，事件读取动作升到 @2 | `ed090054e` |

两片已包含在 [Full suite #39444644367](https://github.com/molis-ai/molis-work/actions/runs/39444644367) 的完整回归中；1176 个测试文件通过（2 个按现有规则重试通过），最终 main `2571a328` 的完整文件树与被测树相同。补修、定向验证和未覆盖项见 [#829](https://github.com/molis-ai/molis-work/pull/829) 与 [#837](https://github.com/molis-ai/molis-work/pull/837) 评论。

**分支与工作树。**

- 仓库启用了合入后自动删除远端分支；上表两条已随合并删除。
- 本机还有两个工作树，都留到它们的 PR 合入后，由 ⑤ 或 ① 问过用户再删：
  - `receipts-line-f48952`：S3-3 与本交接 PR；
  - `receipts-3e-fixes`：S2-1、S2-2。
- `ai-input-receipts` 工作树（`feature/handoff-ai-input-receipts`）是 10-13 交接用的，内容已过时。删不删由 ① 问用户。

**没做完、没开工的。** 每项一行，都在 `specs/BACKLOG.md`，负责人「未分配」：

- 新写的：
  - §5「插件」：BL-310（QA-009）、BL-311（QA-010）、BL-312（QA-011）、BL-313（QA-012）、BL-314（S3-2，Goal 页「来自对话的输入」）；
  - §3「助理、记忆与动态交互」：BL-315（3e-2b）、BL-316（3e-2c）、BL-317（RCPT-103～107 与真实模型评测）、BL-318（阶段 5、6）、BL-319（§12.6 浏览器验证）；
- 原有的：BL-148、BL-161、BL-162（Molis 一侧）、BL-164、BL-175。

修 QA 的 PR 标题写「修 QA-0xx」，回归用例按 Codex 的断言写或更严。不改 `specs/qa-acceptance-2026-10/`，不回复 Codex。

**阶段 4 余下的设计**（S3-2，BL-314；已定的不再讨论）：

- **四个动作。**
  - `goals.conversation_inputs.propose`（受众 agent、mcp，`plugin` 关）：AI 把**自己会话**里的一条输入提议关联到 Goal，可以顺带挂本 Goal 现有的约定变更请求或目标树提议。
  - `list`（受众 user、agent、mcp）。
  - `accept`：只给本人。
  - `release`：本人拒绝或移除；AI 只能撤回自己会话的提议。
  - 错误码 `defineErrorCodes("goals.conversation_input", …)`。
  - 没有会话的 Agent 上下文报 `session_required`。S3-3 合入后 Coding 也有会话。
- **边。**
  - 类型是 `goal.conversation_input` 与 `goal.conversation_input.proposal`。
  - 目标是 `{ module: "agent-host", object_type: "agent_input", id: "<会话>/<输入>", version: null }`。版本永远为 null：Ledger 把版本当作引用身份的一部分。
  - 只经 `ContextLedgerApi` 写，复用宿主已经交给 Goals 的 `deliverables.ledger` 端口。
- **信任边界**（用户 10-19 定 U1、U2）：
  - `input_id` 不核对，作为 AI 的说法存，页面标「AI 说」。
  - 外部 MCP 会话也能提议，页面标「AI 转述」。
  - 认可关联不等于批准变更：变更仍由本人在现有的决定界面里定。`goals.inputs.confirm` 不改（D12）。
- **页面。**
  - Goal 页「来自对话的输入」显示四样：待确认、AI 说、会话来源、挂着的提议「等你决定」。
  - 新的页面请求用 `molisWorkRequest`（照 `plugins/native/goals/src/event-document-deliverables.ts`）。
  - S3-2 的新路由直接写成 PluginRouteBinding（`goalsRoutes` 的一条，照 `plugins/native/goals/src/http/inputs.ts`），并在 Manifest 里声明（`plugins/native/goals/src/manifest.ts` 的路由表），PR 里点名（① 10-23 定，不再等 S7b）。
- **验收编号。**
  - RCPT-384：提议写边、Goal 不变、同一条再提会回放。
  - RCPT-385：能挂的提议与被拒的几种。
  - RCPT-386：accept 只给本人。
  - RCPT-387：拒绝、撤回自己会话的。
  - RCPT-388：被拒时 Ledger 一行不多。
  - RCPT-389：页面（浏览器用例，待用户恢复）。
  - RCPT-390 已随 #818。

**已定的取舍（D20 之后，统筹与本线）：**

- P1：动作叫 `goals.events.acknowledge`。
- P2（2026-10-20 合同复核后修正）：`goals.events.list`、`latest`、`read` 的严格输出 schema 增加了处理说明分支，三条均升到 @2，不留 @1 兼容；固定授权、MCP 工具名与调用方须更新，见 S2-2 实现记录。
- P3：S2 切两个 PR。
- P4：AI 能调的写动作给 agent、mcp，`plugin` 关；本人的动作只给 user。
- P5：`ObjectRef.module` 加 `agent-host`。
- P6：边的类型另起名字。
- P7：Runtime 显示名的单一来源在 contracts；桌面壳与角色导入已改读它，安装器、Work 终端与 Shelf 的表外余项见 BL-392（③ 防腐线）。
- P8：Agent 一轮带会话，见决定表末行。

**风险与不能碰的。**

- **真实 Home 与真实数据。** 不碰本机常用的 Home，也不碰 4207 的服务；测试与实走只用临时 Home，用完删掉。
- **钥匙串。** Home 主密钥的钥匙串条目不能删。MiniMax 的密钥只从钥匙串 `minimax-api-key` 行内读，不进聊天、文件或日志。
- **S3-3 合入后的两处变化，要告诉用户：**
  - 升级前在某个会话里准备、还没完成的连接器接入，要在原会话里重新准备；
  - Goals 的作者与幂等按会话分开，升级前用过的幂等键不会回放。

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
  不再按固定规则自动判断（改掉助理现行规则）。「写进问卷」落地之前，1e 的芯片是「回答上面的问题 ↔ 补充这一轮」两态，默认回答（D14a）；没有芯片的发送一律是补充（D14b）。
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
- 一轮结束时，结束卡片带同一个列表。人开的下一轮会把排着的一并带上，开始之前可以在列表里逐条撤回；不另问带不带（D4，用户 10-17 改定）。

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

提交后发生三件事（D34、D39：「改处理方式、改关联目标、补一句」都是选项填出的原话，发成一条带 `about` 的补充；撤回见 §4.3。3b-2a 做到第 1、2 件，第 3 件随 3d、3e）：

1. 原来那条的回执显示「你改为：…」，读自纠正的 `about`，Molis 不另存。
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
   - D4（用户 10-17 改定）：人开的一轮一律带上排着的（Molis 开跑传 `queued: "carry"`），不问，也没有开关；开始之前可以逐条撤回（`withdrawQueuedInput`）。子任务完成后 SDK 叫醒的续跑一律不带，由 SDK 保证（Prologue `input-queue-node.live.test.ts`「会话排队：子任务完成不等于获准消费」）。SDK 的 `setQueuedInputCarry` Molis 不用。
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
7. **TaskBoard 与 todo。**（2026-10-12：SDK 第四刀合同 `docs/slices/input-board-refs.md`（分支 `feature/input-receipts-s4`，基于 P2a）是这一项与第 8 项的权威，草稿已写、未实现。）
   - 节点加 `origins?: InputRef[]`（有界）。字段由 P2a 给（每节点 / 每报告最多 8 条，超出整次拒绝），本线只写「谁写进去、怎么核」：引擎盖章，模型只给这一跑读到的输入编号。
   - `board-plan`（每个节点）、`board-revise`（含 `add`）可带 `forInputs`；`board-report` 可带 `inputs`。
   - `update-todo` 接受模型给的 id，整批替换时同一 id 保留原状态；换批结果逐条回编号。
   - `acknowledge-inputs` 的目标多 `board-node`（带 `board`）、`todo`、`pending`，引擎核存在。
8. **pending。** 加 `about?`（`{ session, input }`）；问它的那一跑账上记 `pending-settled`、`pending-expired`，以及本线补的 `pending-cancelled`（被取消的问题不能在回执上永远是「待答」）；回执投影多 `questions`，账说不清的记 `unresolved`。

9. **被打断的回复标成已丢弃。**（2026-10-16，回执线 1e 提出。）现在 `interrupt` 生效后，丢掉的那段部分回复在记录里仍是一段普通的 assistant 回合，没有任何事件或字段说它被丢弃（只有 `text-delta`、`steer-applied`、`steer-read`；`steer-read` 不算被打断的回复）。需要：投影里那段回复带「被哪一条补充打断、已丢弃」的标记，事件带账内序号。在那之前 Molis 只在发起打断的那个页面上标（RC-16），不按回合顺序猜。

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
| 读、排队、撤回、纠正、关联、带到下一轮 | agent 侧现有能力都是 typed `agentHostCapabilities`（`agent.run.control.v1` 等） | 新操作照 `services/memory.ts` 的写法登记统一动作（`ActionDefinition`，系统提供方），id 用 `agent.inputs.*`；`pnpm actions:update` 刷新 `tooling/gates/actions/` | 门禁不许新增 typed 宿主能力，新能力注册成动作 |
| 「带到下一轮」 | SDK S2 是开跑参数 `queued`，不是单独的操作 | Molis 的「带到下一轮 / 核对并继续」= 用 `agent.run.start.v1` 开下一跑并传 `queued`（全带或点名）；开始输入里的这一字段同样定义在 `agent-inputs` 里由 agent-host 引用 | 一个事实一个主人：带走与开始记录同进同退由 SDK 保证，Molis 不另写「已带走」 |
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
  - Goals 增加一个动作 `goals.events.acknowledge`（受众只有 agent、mcp，插件调用者不可用），让外部 Agent 对具体的笔记、要求、决定（`gevt-` 引用）声明「已读到，处理方式是…」，身份取 MCP 会话。
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
| AI 记下的约定 | 随时看到 AI 说这项工作采纳了哪些约束和决定，每条能点回是哪句话说的；要改就从那条发更正 | 从回执里 AI 自称采纳为 constraint / objective / acceptance 的项派生：AI 自称、未核对、不可编辑，改它就是发一条更正（D41：Goals 的「当前约定」是 Goals 记下的事实，这里只是 AI 的自称，哪里都没有记，所以不叫这个名字） | 阶段 3 |
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
| 1a 抽取，行为不变 | 把 `applyPrologueEvent` 里补充相关的分支抽到 `prologue-inputs.ts`（W5-10 形状）；把助理的发送路由与回执抽成协作者 `assistant-inputs.ts`（W4-05 形状：≤25 个方法、≤300 行，只依赖自己的端口）（Coding 的回执渲染抽到 `input-receipts-client.ts` 挪进 1d，原因见 §16 2026-10-15） | agent-host、助理 |
| 1b 合同 | 新子路径 `services/agent-inputs`（L0/L1 与来源）；`AgentRunControl.steer` 加 `key`、`interrupt`、`source` | contracts |
| 1c agent-host | 见下方列表 | agent-host |
| 1d Coding | 回执条与补充发送抽到 `input-receipts-client.ts`，抽取的字节在同一片里省出来；措辞改成 §3.3；发送方式菜单（补充 / 打断 / 下一轮）；「发送中」气泡与同键重发；宿主说明不再显示成你的话；「核对并继续」带上没读到的输入；计划轮次不再未经核实就写「已体现」 | Coding |
| 1e 助理 | 工作视图显示每条输入的回执（新模块；用删掉的重复渲染抵消资源字节）；回答 / 补充由用户点选；重试键跨刷新保存；运行中补充的原话按 person 来源记录（供「你说过」） | 助理 |

1c agent-host 的内容：

- ~~会话条目记录收下的输入~~：删去（统筹 2026-10-15）。收下的输入（键、来源、方式）只有一个主人：Prologue 会话的输入记录（补充的账与会话排队）。Molis 不在会话条目里另存一份；回执从 SDK 读——补充回执（`agent.inputs.send`）、运行视图里每条补充的状态、恢复报告里排着的输入。
- 每个 Run 的补充串行处理，按落账顺序把键对应到 steerId。阶段 2 改为由 SDK 直接返回。
- 6 处宿主代写的 steer 标上来源。
- 「读到」从账内顺序推出：applied 之后，同一 Run 内的第一条模型产出。合同里注明这是推导。
- `RUN_NOT_RUNNING` 竞态改成排队或保留。
- `runViewVersion` 纳入输入状态。
- 恢复报告列出输入：挪到 1d（统筹 2026-10-15；1c 已审定在跑全量，不再加提交）。

验收：四问的前半段在 Coding 与助理上真实——送达没有、读到没有、没读到的去哪了；§12 的强杀与竞态用例通过。

1c 的通道（统筹 2026-10-15 定，方案 A）：补充不再走 typed 能力 `agent.run.control.v1`，改为统一动作 `agent.inputs.send.v1`（系统提供方，只给插件调用；合同在 `services/agent-inputs`），回执 `AgentSteerReceipt`；`AgentRunControl` 去掉 steer 分支，不留兼容。助理在宿主内经运行时端口 `AgentRuntimeAdapter.inputs` 发。验收编号：

- RC-01：Coding `coding.runs.control` 第 3 版：补充带页面的键（`AGENT_INPUT_KEY_PATTERN`）与发送方式（`next-boundary` / `interrupt` / `after-run`），由动作 schema 先拒；回执随回包给页面。
- RC-02：补充以键、来源、方式交给运行时；同键同文回原编号（`replayed`），不落第二笔；宿主代写的说明以 SDK `app` 交，不打断。
- RC-03：一轮已结束、要求留到下一轮、或读后到交之间结束（`RUN_NOT_RUNNING`）的补充，用同一个键进会话排队，回执 `delivered: queued`，不开新轮；运行时没有会话排队时拒绝；写入排队前再复查一次授权，被撤权的什么都不留。
- RC-04：`runViewVersion` 含每条补充的状态，回执前进时页面马上重画。
- RC-05：`agent.inputs.send` 的受众只有插件；schema 拒绝错误的键、方式、来源、空文本与多余字段；调用被取消或撤权时不交给这一轮、不写会话排队；别的会话的一轮够不着。
- RC-06：助理以 `send.<request_id>` 为键；排进下一轮的结果是 `queued`，页面说「已保存，下一轮开始生效」，不说已补充到这一轮；助理开下一轮带上会话里排着的补充（`queued: "carry"`）；回答问题用问题自己的版本号，没有版本号的不发，不再默认 1。

1d 的验收编号（Coding，含从 1c 挪来的恢复报告）：

- RC-07：计划的原任务之后列出规划时补充的意见，写明「没有逐条核对是否已写进计划；以确认的计划为准」，不说「已体现」（G14）。
- RC-08：恢复报告列出会话里排着的输入（`AgentRecoveryReport.inputs`，读 SDK 的输入记录）：编号、原文、来源（`person` / `host` / `peer`）、键，以及没读到它就结束的那一轮；没有就是空列表，会话打不开时不给这一项（不知道不是空）。Coding 的中断核对面板列出它们，并说下一轮开始时带上。
- RC-09：Coding 的每一轮开跑都带上会话里排着的补充（`queued: "carry"`）：选了「下一轮再做」的、一轮刚结束才到的、以及一轮结束时没读到的（SDK 在一轮结束时把没读到的补充放回会话排队，编号不变）。所以「核对并继续」也带上没读到的输入。D4 的「询问」指的是不自动开下一轮；人开的下一轮带上排着的补充。
- RC-10：一轮进行中，发送按钮旁是发送方式菜单（共用的 `mw-select`），三项各自说清后果：「补充：这步做完后读」「打断：丢弃当前回复」「下一轮再做」；补充带页面的键（`send.<uuid>`）与方式交给 `coding.runs.control`；回包后状态行按回执说「已送达…」「正在写的回复已丢掉…已执行的操作不撤销」「已存好，下一轮开始时带上」，一轮刚结束才到的说「这一轮刚结束，已存好…」，同键重发的说「之前已送到，没有重复发送」；每次发送后方式回到默认。
- RC-11：发出后到宿主回包之前，这一轮下面显示「发送中…」气泡；回包丢了（断网或回包读不出）时气泡写「没确认送到 · 再按发送，同一条不会重复」，原文与方式留在输入框，同文同方式再发用同一个键；宿主拒绝时气泡消失；宿主收下后由这一轮自己的记录显示这句。
- RC-12：回执条只说运行账里的事实（已送达 / 已放进上下文，等 AI 回应 / AI 已读到 / 这一轮结束时 AI 没读到，留给下一轮 / 已撤回），悬停说明读到不代表已遵循；宿主代写的说明（`notice` 且带补充编号）写「Molis 的说明，不是你发的话」、换样式、没有回执条。
- RC-13：输入框里按 Esc 不再停止这一轮（D3），停止要按「停止」按钮。

1e 的验收编号（助理，含统筹 2026-10-15 从 1d 交来的两项）：

- RC-14：一轮等着回答唯一一道自由文本题时，助理输入框旁出现目标芯片，默认值写在芯片上（「回答上面的问题」），点一下换成「补充这一轮」，悬停说明点了会变成什么；新的问题回到默认值，问卷题（有选项的）不出芯片（只有一道文本题的问卷算自由文本题，出芯片，回答交成这道题的 `value`；哪一题出芯片由宿主判，在视图上标 `from_composer`：`specs/ai-interaction-experience` D34），没有问题等回答时芯片不出现。页面把选择作为 `target` 交给宿主，宿主不再自己判断：不带 `target` 的一律是补充；`target: "answer"` 时问题已不在等的以 `assistant.stale` 拒绝，带材料的以 `assistant.invalid` 拒绝，都什么也不发。补充下面有回执条，措辞与 RC-12 相同；问题还在等时发的补充写「已补充到这一轮；问题仍在等你回答」。删掉「已补充到正在进行的这一轮」提示（事实已在对话里）。
- RC-15：回执状态前进时屏幕阅读器读到，不抢焦点：助理换掉那一行（对话区本来是 `role=log`、`aria-live=polite`、只播新增），状态没变的重画不换行；Coding 在已有的状态行（`role=status`、`aria-live=polite`）说「你的补充：…」，第一次画页面不说。
- RC-16：没确认送到的那一次发送（`ui_host.outcome_unknown`）把键、原文、工作存进页面的本地存储（`molis.assistant.unsent`），刷新后同一工作、同一句话再发沿用这个键，宿主只收一次；宿主回包或拒绝后删掉。本地存储读写都包在 try/catch 里，没有本地存储时照常发送，只是刷新后保不住键。Coding 里「打断」生效时，把页面上正在写的那段回复变淡并写「这段回复已丢掉（你打断了它）」；这是页面自己的状态，刷新后没有（SDK 的记录不标，见 §6.1 第 9 项）。
- RC-17（走查 B，D30）：运行视图的回执带补充发送时的键（`AgentTurnSteer.key`，取自运行时的输入记录）。Coding 回包丢了、气泡写「没确认送到」时，只要这一轮的记录里出现同一个键，就收掉本地气泡（同一句话不再一处说「已送达」、一处说「没确认送到」），状态行说一次「之前已送到，没有重复发送。」（与运行时认出的重发同一句）；输入框里仍是那句原话才清空，人改过就不动。之后再发同一句是新的补充。
- RC-18（走查 C1，D31）：会话里有排着等下一轮的补充、又没有正在跑的一轮（已结束，或停下等核对）时，Coding 对话末尾放一条「排着 N 条补充，下一轮开始时带上」，用宿主说明的样子画（不像人说的话），展开看原文；同一份排队重画时不换节点，展开的保持展开。数据来自运行时自己的排队（`AgentSessionView.queued_inputs`），只在没有正在跑的一轮时读，读会话不另跑整份核对；有一轮在跑时不读、不显示。「核对并继续」按钮文案不变。
- RC-19（走查 D，D32）：写入门没直接记住、又是人要求记的（`remember` 被拦成建议），助理工作面板的卡片写「你刚才让我记住：X」，下面只写范围，主按钮「记住」一下记住；为什么没直接记住（记忆服务自己的 `hold_reason`）只在详情里。`remember` 工具回给模型的结果「没有直接记住，已作为建议放在工作面板，等用户认可」，不带门槛原文。D32-b（10-19，#800 的评测里模型自己编了「允许记住还没开」）：这句后面再加「这个范围的“允许记住”是开着的，没直接记住的原因写在卡片的详情里」。记忆服务在「允许记住」关着时直接拒绝、不留建议（`horizontal/memory/src/service.ts` 的 `commit`），所以只要结果是建议，这句就是实话；关着时回给模型的仍是「没有记住：你关掉了“允许记住”…」，不出这一句（`tests/assistant-memory.test.ts` 的 RC-19 两处断言）。门槛本身（`horizontal/memory/src/spoken.ts`）不动；合同 `AssistantMemoryCandidate` 加 `held`（只在人要求记、被拦下时有，是记忆服务给的原因）。2026-10-25 BL-323：这一段从抛 `assistant.invalid` 改成按成功的形状返回——`memory_id` 为空、带回本次受控 write 结果中候选卡片的 `candidate_id`（不另读建议列表），上面两句放进 `note`（模型读成「没直接记住、卡片在等用户」，不是出错）。
- G13（「你说过」）：运行中补充的原话算本人说过的：记忆的「原话」与一轮结束交给学习的话，都从运行视图读（SDK 的输入记录，`kind: "user"` 且带 `steer` 的回合，截掉宿主加的选区与材料），Molis 不另存。只覆盖助理自己的运行时；交给 Coding 执行的工作里的补充不在内（读 Coding 会话要另走 Coding 的动作，留待以后）。

**BL-144 实现记录（2026-10-19，补 D14c 的缺口；统筹 DISPATCH-1019-0710 第 6 项）：**

- **缺口。** 页面代写的话（交还浏览器的说明、插件交来的请求，助理按 `written_by: "page"` 收）交给正在跑的 Coding 一轮时，`coding.runs.control` 的补充没有 `source`，助理转给 Coding 的端口只好把它去掉，Coding 那边就记成本人的话：回执条照人的话画，R1 的摘要也把它当「用户补充」带走（§20.5）。
- **做法。** 合同 `services/agent-inputs` 加 `AGENT_INPUT_SOURCES`（`person`、`host`），`agent.inputs.send` 的 schema 与 Coding 补充分支的 schema 都从它取，只写一份。Coding 的补充分支多一个可选的 `source`，`runControl` 原样交给 `agent.inputs.send`；按 `docs/system/CONTRACT-CHANGES.md` 升到第 7 版，第 1～6 版解析不到。助理调 Coding 的客户端（`assistant-coding.ts`）钉第 7 版，`assistant-service.ts` 不再去掉 `source`。`host` 到运行时还是原来那条路：Agent Host 交给 SDK 的 `app` 来源，记成 `notice`，Coding 画成「Molis 的说明，不是你发的话」（RC-12），R1 不计入。本人的话照旧不带 `source`。
- **调用方。** `coding.runs.control` 只给本人（`user`），MCP 不暴露。固定版本的引用只有助理一处，同一个改动里改完。Coding 页面上人自己打的字照旧不带 `source`；但「重试这个子任务」（`plugins/native/coding/src/subagent-cards-client.ts`）是页面代写的话（拼进了上次的错误和模型写的分工），现在仍记成本人的话，这一片没修，记为 BL-182。
- **验收编号与证据：**
  - RCPT-368：`coding.runs.control` 第 7 版的补充收 `person`、`host` 两种来源，拒别的值、拒空串，也拒别的控制带来源；`runControl` 把来源原样交给 `agent.inputs.send`（`tests/coding-run-control-contract.test.ts`）。第 1～6 版解析不到（`tests/coding-actions.test.ts`）。页面代写、交给正在跑的 Coding 一轮的话带 `source: "host"` 到 Coding 的控制，本人的话不带（`tests/assistant-coding-executor.test.ts`）。

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
| 3a 投影 | 投影模型的处理说明（自称）、为输入问的问题、报告引用的输入；回执改由 SDK 的 `projectInputReceipts` 一处投出（观察到的影响见 D21，组合视图见 D22，节点来源见 D23） |
| 3b 动作 | 读、撤回、纠正、关联、带到下一轮，登记为统一动作 |
| 3c 共享组件 | 回执条、详情、托盘、纠正菜单进设计系统，并登记到 `/__ui/catalog`；Coding 与助理改用它，删掉各自重复的渲染 |
| 3d Coding | 板上来源徽标、新任务提议、报告一节、变更集归因；登记处理说明的使用指令（`prompts.ts`，用户可看可改） |
| 3e 助理 | 处理说明与 AI 记下的约定；交付说明 |

验收：Coding 与助理上四问全部能答，每个回答都有依据；真实模型下的说明率与归类一致率达到 §12.5 的观察值。

**3a 实现记录（2026-10-16）：**

- **一份投影。** SDK 只有整账投影 `projectInputReceipts(events)`，没有按事件增量的入口；运行视图是逐事件建的。所以每一轮留下这份投影要读的那些事件（带编号的补充、`steer-*`、`inputs-acknowledged`、`awaiting-input`、`pending-*`、终态），每来一条就整份重投，把结果挂回补充那一行。阶段 1 自写的推进与收尾（`applySteer*`、`closeUnreadSteers`）删掉。宿主只补一件账上写不下的事：恢复时账在终态前断了、由宿主收口的一轮，没读到的记「没读到」，还开着的问题记 `unresolved`。
- **入口。** 视图只经 `applyRunEvent`（`prologue-stream.ts`）：先走原来的流投影，再投回执；`applyPrologueEvent` 不再导出，巨大单元一行没加（删了四行）。
- **自称在类型上分得开。** `AgentTurnSteer.state` 是账上的事实；`model_claim`（`AgentInputModelClaim`：处理方式、类别、目标、自称的影响、说明、修订次数、出自哪次调用）只是模型说的，不改 `state`。`questions` 是为它问的问题及其落定。报告引用的输入在 `AgentStepBoard` 报告的 `inputs` 上。
- **验收编号与证据**（`tests/prologue-input-claims.test.ts`）：
  - RCPT-301：真 Prologue 运行时，模型对同一条补充说明两次，视图给最新一次、修订 2、出自哪笔工具调用，`state` 仍是「读到」；重启后从存下的账重建，结果相同。
  - RCPT-302：为输入问的问题挂在那条输入上，开着是 `open`，回答后 `settled`。
  - RCPT-303：一轮回报某一步时引用了补充，板上那条报告带着它（节点来源见 D23）。
  - RCPT-304：同一份事件账，视图与 SDK 投影逐条一致（修订、撤回在另一条读到之后、为输入问的问题、带进来的输入、读到前结束）；宿主收口的那一种单独一条。
- 阶段 1 的两个测试文件里，喂给它的账有「读到」而前面没有「放进上下文」，SDK 从不这样写（它只读已放进上下文的，`control.js` 的 `appliedUnread`）：补上 `steer-applied`，断言不变。

**3b-1 实现记录（2026-10-17，D34、D35）：**

- **撤回**是 `agent.inputs.withdraw.v1`，受众只有插件，参数是 `runtime_id`、`session_id`、`run_id`、`input_id`；`run_id` 是调用方看见那条补充的那一轮，或会话最近的一轮。
  - 还在跑的那一轮里、还没放进上下文的，由那一轮交还（SDK `withdrawSteer`），回 `from: "run"`。
  - 排在会话里的，由会话交还（`withdrawQueuedInput`），回 `from: "queued"`。
  - 已撤回的再撤一次，回同样的结果。
  - 已经放进上下文的拒绝，错误码 `agent.input_applied`，提示改发纠正。会话里已经没有的拒绝，错误码 `agent.input_not_queued`：被带进了一轮，或会话里没有这一条。
  - 一轮已经结束、但进过上下文没等到回复的那条，会回到会话的排队里（SDK `settleRunInputs`），所以还撤得回。
- **纠正**用 `agent.inputs.send.v2`，比 v1 多一个可选的 `about`。`about` 原样交给 SDK（一轮里的补充和排在会话里的都一样），回执（`AgentTurnSteer.about`）和排队（`AgentQueuedInput.about`）都从 SDK 自己的记录读出来。宿主不判断 `about` 指的那条在不在：它只是账上的一个指向。
- **落点。** 合同在 `services/agent-inputs`；处理器在 `session-actions.ts`；撤回的判断在 `prologue-inputs.ts` 的 `withdrawInput`。宿主口子把会话排队合成一个 `queue: { add, withdraw }`，一轮的补充控制合成 `RoundInputs`（含 `withdrawSteer`）；`prologue.ts` 是巨大单元，这样改它少了一行。
- **验收编号与证据：**
  - 真 Prologue 运行时（`tests/agent-input-withdraw.test.ts`）：
    - RCPT-311：模型请求挂起时撤回一条，回执变成「撤回」，后面的请求里都没有它；再撤一次结果相同。
    - RCPT-312：放进上下文以后撤回被拒，回执照常走到「读到」。
    - RCPT-313：排在会话里的撤回后，下一轮只带走还排着的那些；会话里没有的 id、被带进一轮的那条都被拒。
    - RCPT-314：纠正的回执和排队都带 `about`。
  - 动作层（`tests/agent-input-delivery.test.ts`）：
    - RCPT-314：一轮的补充和会话的排队里，`about` 都原样到了 SDK。
    - RCPT-315：两份 schema；被取消、撤权的调用什么都不撤，包括读完那一轮之后、交给运行时撤回之前才撤权的；别的会话的那一轮够不着。每次请求一轮或会话交还之前都再核一次调用是否还有效（`beforeWithdraw`，和 `send` 的 `beforeQueue` 一样）。

**3b-2a 实现记录（2026-10-17，D37–D40）：**

- **回执详情里的动作。** 共用回执（设计系统 `createInputReceipts`）的 `line(turn, round, act)` 多了可选的第三个参数：页面给的撤回与纠正。没有它，回执只显示。
  - **撤回**只在这一轮说还没交给模型时出现（`received`）。放进上下文或读到以后，详情写「AI 已看到，不能撤回；要改口就发更正。」。一轮结束时没读到、回到会话排队里的那条，由会话交还，入口放在 3b-2b 的托盘里，回执上不出撤回。
  - **更正…**打开回执下面的一个小表单。三个选项各填出一句可改的话：「不是「AI 说的处理方式」，而是：」（AI 没说明时是「不是这个意思，而是：」）、「这条针对的是：」、「补充一句：」。人没改过的选项会被下一个替换，改过的话保留，选项接在后面。只有选项、没写内容不发。发出去的是人的原话，`about` 指向这一条。
  - 表单在重画时原地不动：重画只换掉它前面的摘要和详情，焦点和写到一半的字都不受影响（§4.9）。焦点在详情的按钮或摘要上时，重画后落到新画的那一个上，不掉回页面。Esc 和「取消」关掉它，焦点回到「更正…」。
  - `/__ui/catalog` 的回执样张接上了演示用的撤回与更正，两头的指向在样张上都看得见。
  - 同一份话在丢了回复以后再发，用同一个键，运行时只算一次（§7）；改了字就是新的一条。
  - **两头的指向**都从账上的 `about` 读：原来那条的摘要写「你改为：「…」」，纠正那条写「纠正：针对「…」」（原来那条页面没画过时写「纠正：针对更早的一条」）；详情里各有一个按钮跳到另一头。第一次见到纠正时，原来那条的回执当场重画。Molis 什么都不存（D34）。
- **Coding。** `coding.runs.control` 升到 v6：`steer` 多了可选的 `about`，新增 `withdraw`（只带 `input_id`）。路由把它交给 `agent.inputs.withdraw`，和补充一样走 `codingActionControl(beforeWrite)`。v5 及更早不再解析（`tests/coding-actions.test.ts`）。助理调 Coding 的客户端（`assistant-coding.ts`）跟着钉 v6。页面的 `inputReceipts.act(id, run)` 把两个动作接到这一轮的控制上；`client.ts` 只在原来那一行多传一个参数。
- **助理。** Send 多了可选的 `about`（`AssistantSendInput` 取自 `AgentInputSend`）：只用于已有的工作，不能用来回答问题。带 `about` 的话总是作为补充交给最近的一轮：还在跑就进这一轮，已经结束就排在会话里等下一轮（`queued`），不另开一轮。撤回经工作的控制（`AssistantControl` 的 `withdraw`，带 `run_id` 与 `input_id`）：Coding 承接的工作交给 Coding 的控制，助理自己的那一轮先核对这一轮属于这项工作，再交给运行时的 `inputs.withdraw`。判断写在 `assistant-inputs.ts` 的 `withdrawInput`；`AssistantService` 是巨大单元，为它腾地方删了只转调一次的 `explain`，把 `startOfToday` 挪到 `assistant-usage-ledger.ts`，类和文件都比 merge-base 短。
- **字节。** 抵消以后还多：`molis-work-workbench.js` +5043、`molis-work-plugins/coding.js` +684、`molis-work-workbench.css` +136、`molis-work-arrival.css` +136（已复用详情的底板与 `mw-textarea` 自带的尺寸）。按统筹要求列进 PR，由统筹问用户。
- **验收编号与证据：**
  - RCPT-321：`coding.runs.control` v6 的 schema 收 `about` 与 `withdraw`，拒空的 `about`、不带 `input_id` 或多带字段的撤回；`runControl` 原样交出（`tests/coding-run-control-contract.test.ts`）；v1–v5 解析不到（`tests/coding-actions.test.ts`）。
  - RCPT-322：真 Prologue 运行时经 Coding 的路由：撤回还没读的那条，后面的请求里都没有它；纠正的回执带 `about`；读过的撤回被拒（409 `agent.input_applied`）；一轮结束后的纠正排进会话，再从会话撤回（`tests/coding-input-correct-http.test.ts`）。
  - RCPT-323：真 Prologue 运行时经助理：同上的撤回与纠正；别的轮次够不着、空的 id 被拒；结束后的纠正 `queued`、不开新的一轮、排队里带 `about`，并能撤回（`tests/assistant-input-correct.test.ts`）。
  - RCPT-324：回执的撤回只在 `received` 出现，读过的写为什么不能撤；纠正表单的选项、原话、键、失败留字、重画不丢、Esc 与取消（`tests/input-receipts-client.test.ts`）。
  - RCPT-325：「你改为」与「纠正：针对」从 `about` 读出，原来那条当场重画，按钮跳到另一头（同上）。
  - RCPT-326：两个页面把动作接到各自的路由：Coding 的控制，助理的工作控制与 Send（`request_id` 就是回执的键）；丢了回复说「没确认送到」（`tests/coding-input-receipts-client.test.ts`、`tests/assistant-receipts-client.test.ts`）。助理底栏的发送点从两处变成三处，第三处是回执的更正，带的是人自己写的字，所以不标 `written_by`；守着这件事的用例点名这一处（`tests/assistant-island-script.test.ts`），别处新加的发送没有页面标记照样失败。
  - 浏览器（本机）：Coding 页上，一轮结束后从「/v2/login」的回执发更正，排队条变成 2 条；下一轮带上它，原来那条的回执写「你改为：…」；这一轮还没读的补充从回执撤回，变成「已撤回」，模型的请求里都没有它（`tests/coding-input-receipts.e2e.test.ts`）。助理页上，一轮结束后从回执发更正：发出去的是人的原话、`about` 指向那条补充、没有页面标记，状态区说「已保存，下一轮开始生效」，不开新的一轮（`tests/assistant-input-receipts.e2e.test.ts`）。
- **已知缺口（不在本片修）：** Coding 页上，正在写的回复后面一旦出现补充，它就不再标「正在写」，之后再打断，页面不会把那段回复标成已丢掉（RC-16）。这是页面按「最后一个回合」判断正在写的老做法，`client.ts` 是巨大单元，留给后续一片。

**3b-2b 实现记录（2026-10-17，D37、D38；助理一侧在 3b-2c）：**

- **托盘。** 共用回执多了 `tray(queued, round, act)`：会话里排着的输入，加上最近一轮账上还没了结的，画成一行「N 条还没处理完」，点开分类列出。没有就不画。
  - 只分账上已有的四类（D37）：排着，下一轮开始时带上（会话的 `queued_inputs`）；AI 读到了，没说怎么处理（`read`、没有 `model_claim`）；AI 说暂不采纳或需要你澄清（标明是 AI 自己说的）；为它问的问题还没回答（`open` 或 `unresolved`）。后三类只看最近一轮，每条输入只看它最后一次画出的回执；排着的那条只在第一类出现一次。
  - 每一类是一个带名字的列表，每一项是按钮：有回执的打开回执、焦点移过去（和回执里「看原来那条」同一个做法）；排着的另有「撤回」，走页面自己的撤回；直接排进会话、没有回执的，「撤回」就是它的按钮。
  - 同一个元素跨重画保留，展开的托盘不会收起；焦点在托盘里的按钮上时，重画后落到新画的那一个上。条数变了，经页面那一个礼貌状态区说一次，第一次画不说。
- **Coding。** 托盘取代 C1 的排队条（D38、RC-18）：`inputReceipts.waiting()` 与 `.coding-queued-inputs` 删掉，`client.ts` 在原来那一行改调 `host.receipts.tray`，撤回走 v6 的 `withdraw`（会话里的那条，运行时从会话交还，见 RCPT-322）。托盘和对话那一栏同宽，宽度规则和 `.coding-turn` 共用一条。`craft-finish.ts` 里助理回执的那条规则（右对齐、88% 宽、上移 8px）原来写成整页的 `.mw-receipt`，连 Coding 气泡里的回执也被它管着，这不是 3c 想要的样子；现在只管 `.assistant-round` 的直接子元素。
- **代码位置。** 托盘是设计系统里单独的 `createInputTray`，借用回执的几个小工具和「每条输入最后一次画出的回执」；回执的措辞表挪成静态数据 `RECEIPT_WORDS`，随页面程序一起交过去。`createInputReceipts` 在 3b-2a 时正好 150 行，不这样拆就成了新的巨大单元。
- **字节（对照 3b-2a 的预算）。** 用户 10-17 经统筹弹窗一次性批准：`molis-work-workbench.js` +2838、`molis-work-workbench.css` +163、`molis-work-settings.css` +91、`molis-work-arrival.css` +86；`molis-work-plugins/coding.js` −512（删掉的排队条）。收窄助理规则、托盘行间 4px 与行内居中都加上以后，四个 `margin:0` 并成一条 `:where` 规则，三份样式表实测是 +102、+57、+64，都在批准的数以内。已复用回执的底板、按钮与「AI 自己说的，Molis 没有核对」这句。
- **助理。** 等交互线的 re-ask 把 `contracts/services/assistant.ts` 拆出一块以后，再给 `AssistantWorkView` 加 `queued_inputs` 并接上托盘（统筹 10-17：不自己拆，免得两处拆分冲突）。到时把 3b-2a 删掉的 `AssistantControl` 那行文档注释加回来。
- **验收编号与证据：**
  - RCPT-331：托盘只列账上有的四类，后三类只看最近一轮；更早的轮次、AI 说会采纳的、撤回的、还没交给模型的都不列；排着的只列一次；没有就不画（`tests/input-receipts-client.test.ts`）。
  - RCPT-332：一项打开它的回执并把焦点移过去；「撤回」走页面的撤回、带输入 id；没有页面动作时只列不撤（同上）。浏览器：Coding 页上，一轮结束后托盘列出排着的那条和读到没说明的那条，点后者打开它的回执、焦点在那里；从托盘撤回排着的一条，下一轮的请求里没有它（`tests/coding-input-receipts.e2e.test.ts`）。
  - RCPT-333：跨重画是同一个元素；条数变了只说一次，第一次画和没变的重画都不说（`tests/input-receipts-client.test.ts`）。

**3b-2c 实现记录（2026-10-17，§4.4、D31、D37；BL-158；统筹 10-17 定）：**

- **助理的托盘。** `AssistantWorkView.queued_inputs` 是这项工作自己的会话里排着的输入，按运行时读出的原样给（`assistant-inputs.ts` 的 `queuedInputs`）。规则同 D31：只在它的轮次都不在跑时读。不给值是「这次没读」（有活轮，或这项工作由 Coding 承接）；`[]` 是「读了，确实没有」。运行时的 `readSession` 也照这个分开：以前读了、但为空时不给值，现在给 `[]`（`AgentSessionView.queued_inputs`，Coding 的路由与页面跟着原样传）。
  - 岛上的回执工厂（`assistant-send.ts`）多了 `tray(thread, put, view)`：在轮次之后放共用托盘，取最近一轮，撤回走这项工作的控制（3b-2a 的 `withdraw`）。岛上只多一处调用；为抵它，把摆放子节点的 `placer` 挪进 `assistant-stage.ts`，岛短了 9 行。
  - `AssistantService` 是巨大单元：读取挪进 `assistant-inputs.ts`；把 Send 记关联的 `linkSent`（连同 `revisionOf`）挪到 `assistant-relations.ts`，类短了 9 行、少了一个方法。
  - 共用托盘的 `queued` 可以不给：不给时不画「排着」这一类；最近一轮里没有没了结的，也不说「没有还没处理完的了」。读了且为空才说。
  - 托盘按画它的那个面各一个（统筹 10-17 定）：`tray(owner, queued, round, act)`，`owner` 是调用方的容器（助理传对话线程，Coding 传那一轮的块），内部用 `WeakMap` 存，面没了就随之回收。Coding 页和旁边的助理用的是同一份共用回执；助理的工作交给 Coding 执行时，两边画的还是同一轮，按轮次取会拿到同一个元素、被两边抢来抢去。轮次换了，就把上一轮的条数与播报清掉，新一轮的第一次画不当成条数的变化来说。
  - 合同里 `AssistantControl` 的文档注释加回来（3b-2a 删掉的那一行）。
- **措辞表一份（BL-158）。** 设计系统导出 `RECEIPT_WORDS`，用 `satisfies` 按合同的闭集写全；Coding 报告（`report-inputs.ts`）改用它，删掉自己那份。报告的措辞因此与回执一致（「已放进上下文，等 AI 回应」「这一轮结束时 AI 没读到，留给下一轮」「验收条件」），RCPT-341 的期望值随之改了（预期变化，断言没放宽）。共用回执里对闭集的 `??` 兜底一并去掉：闭集按现行取值读。
- **字节。** `molis-work-workbench.js` 比 3b-2b 量得的多 +313（按面的托盘状态、工厂的 `tray`、岛上的一处调用；回执、托盘的样式与措辞都复用；改成按面取后，把回执里两处一样的「更正两头」查找合成 `ends` 抵掉一部分），`molis-work-plugins/coding.js` −1，样式表不变。用户 10-17 在回执线会话的弹窗里一次性批准 workbench.js 至多 +325；开 PR 时按那时的 merge-base 定键，写成单独的放行提交。
- **验收编号与证据：**
  - RCPT-334：没读的排队不当空：托盘不画「排着」，最近一轮清空时不说「没有还没处理完的了」；读了且为空才说。换了一轮，开头的条数不播报（`tests/input-receipts-client.test.ts`）。
  - RCPT-337：同一轮在两个面上各画一次，是两个元素，各自的 `queued` 互不影响，也不重复播报（`tests/input-receipts-client.test.ts`）。
  - RCPT-335：助理在轮次之后、以对话线程为面放最近一轮的托盘；视图没有 `queued_inputs` 时交给托盘的是「没读」，`[]` 原样交；没有工作就不画；撤回走这项工作的控制（`tests/assistant-receipts-client.test.ts`）。
  - RCPT-336：真 Prologue 运行时经助理：一轮在跑时视图没有 `queued_inputs`；一轮结束后排着的更正带着 `about` 出现在视图里；撤回后是 `[]`（`tests/assistant-input-correct.test.ts`）。浏览器：一轮结束后从回执发更正，托盘的「排着」列出它；从托盘撤回，排队变空、不开新的一轮（`tests/assistant-input-receipts.e2e.test.ts`）。
  - RC-18 的一条断言从「不给值」改成 `[]`：一轮结束后读了、确实没有（`tests/prologue-recovery.test.ts`，变严）。

**3d-1 实现记录（2026-10-17，§4.7；统筹 10-17 定）：**

- **报告的「补充要求」一节**改成每条补充一段（`plugins/native/coding/src/report-inputs.ts`，`report.ts` 只调它）：
  - 第一行是账上的事实（送达、放进上下文、读到、没读到、撤回）。
  - 更正的两头都写：「这是一条更正，针对补充 N」（这一轮里没有那条时写「更早的一条」），原来那条写「后来由补充 M 更正」。
  - 「AI 说：…」是模型自己的说法（处理方式与它说会改变的方面，都是闭集里的词，多次说明时写第几次），只当引述，不推出任何状态。读到了却没说明的写「AI 读到了，没说怎么处理」；为它问的问题还没回答的写个数。
  - 节首说清：放进上下文、读到都不证明 AI 照做了；「AI 说」是它自己的说法，Molis 没有核对。没有观察到的结果，所以不写「已生效 / 部分生效」，那要等 3d 的变更集归因（D21）。
- **事实从哪里读。** 只读这一轮的运行视图：报告本来就经 `agent.runs.read` 拿到它，回执是运行时自己的 `projectInputReceipts` 从账上投出来的（3a）。Coding 不查别人的表，也不另存一份。
- **不可信的话。** 人的原话和 AI 的说明各放进一个围栏（`literal`，围栏比正文里最长的反引号还长）：页面经插件 SDK 的 `renderRichText`（`/rich-text`，原 Feed 的 `renderFeedRichText`）消毒后显示成代码块；报告交给后面的模型时是一份材料（`agentTextMaterialContent`，带来源的数据资源，不进提示词），里面同样是引述。
- **措辞表。** 处理方式与影响的词和共用回执（设计系统）同义；共用回执的表在 3b-2b 才挪成模块级数据、还没导出，所以这里先各留一份。#671 合入后合成一份，放在两边都能引用的地方，回执线的下一片先做（BL-158，统筹 10-17 定）。处理方式与影响都是合同里的闭集，按现行取值读，不兜底不认识的值。
- **验收编号与证据**（`tests/coding-report-persistence.test.ts`，经 Coding 的报告路由保存）：
  - RCPT-341：五种状态、更正的两头、AI 说的处理方式与影响（标明是它说的）、读到没说明、没回答的问题，各一行；节里没有「已生效」。
  - RCPT-342：原话和 AI 的说明里夹带的标题、`<img onerror>` 都留在引述里：报告自己的话里没有它们，页面上只有一个「执行状态」标题，图片标签被转义。
  - RCPT-343：交给后面的模型时，报告是带来源的材料，夹带的话仍在引述里，不多出一个标题。

**3d-2 实现记录（2026-10-17，§4.5 第三条；统筹 10-17 定）：**

- **报告与输入两头都看得见。** 依据是板上报告已有的 `inputs`（3a 投好的），合同不动。
  - 回执详情：板上某一步的报告提到这条补充时，在「AI 自己说的，Molis 没有核对」下面加「步骤报告提到它」，一条报告一行：步骤的键加报告原话，和「AI 的原话」同一种引号、同样不截断。它是 AI 的说法，不改事实那一行，也不据此说「已生效」（D21）。
  - 步骤的键和计划卡上一致：`S` 加它在板上的位置，插入的那一步写「插入」。
  - `round.step_board` 和 `queued_inputs` 一样分两种：不给值是这次没读，不画任何一行；给了而没有报告提到它，也不画。Coding 把每一轮视图里的板原样交给回执；助理的轮次现在不画这一行：`roundView`（`assistant-service.ts`）不带 `step_board`，`AssistantRound` 也没有这个字段，所以这一行目前只在 Coding 的页面上出现。助理要不要画，归 3e-2c。
  - Coding 的步骤详情：报告提到的补充，在这个页面上画出了回执的，才出一个「关于补充「…」」按钮。共用回执的 `link(inputId, first)` 只在找到回执时给按钮，否则给 null，所以没有点了没反应的按钮（更早的轮次没画出来时就是这样）。点它先关上步骤对话框（`first`），再打开回执，焦点落在它的 summary 上（复用 `reveal`）。
  - 服务端报告：每条补充下面列出提到它的步骤报告，「步骤报告提到它（S2，AI 的说法）」，原话放进围栏。
- **回执按画它的面各一份（统筹 10-17 定）。** 3b-2a 起回执按「轮 + 输入」在整页共用一份：助理的工作交给 Coding 执行时，助理的对话线程和旁边的 Coding 页画同一轮的同一条补充，拿到同一个元素，来回挪（浏览器里复现过：Coding 先画，助理拿走，Coding 下一次重画又拿回去，助理那条补充下面就没有回执了）。`link` 找的是最后画的那一份，可能在另一个面上。现在 `line(owner, turn, round, act)`、`link(owner, inputId, first)`、`tray(owner, …)` 都以画它的面为准：助理传对话线程，Coding 传对话容器（`[data-coding-turns]`，托盘也从 3b-2c 的每轮的块改成它，Coding 只在最后一轮下画托盘，换一轮就重置）。每个面各自记它画的回执、每条输入最近的那一份和它见过的更正（`WeakMap<Element, …>`，面没了就回收）。更正第一次出现在哪个面上，就重画那个面上的原来那条；两个面都画这一轮，所以两份都会更新。`/__ui/catalog` 的样例原来用两个实例绕开这个问题，现在是同一个实例的两个面。
- **代码位置。** 回执多了这几行以后，`createInputReceipts` 超过了 150 行，所以把更正的表单拆成单独的 `createCorrection`，和托盘一样随页面程序交过去。回执、托盘、更正三处共用一份小工具（`InputReceiptParts`）；撤回的「说一次、拒绝时留下原因」（`attempt`）和「重画时焦点跟到新的那个按钮」（`redraw`），原来在回执和托盘里各写一遍，合成一份。Coding 的回执脚本里，两处「连接断了还是回复读不出」的判断和控制路径也合成一份。
- **字节。** 对照 3b-2c：`molis-work-workbench.js` +602（回执里的那一行、`link`，以及拆出 `createCorrection` 本身约 130 B；合并重复的撤回与重画已抵掉一部分），`molis-work-plugins/coding.js` +169（步骤详情的按钮；合并 Coding 回执脚本里的两处重复已抵掉一部分），样式表不变。用户 10-17 在回执线会话的弹窗里一次性批准这两项；回执改成按面各一份后再多 workbench.js +198、coding.js +32（每个面的记账、五处调用多一个参数；托盘不再往上找面、每条输入最近的一份直接存元素，抵掉 148 B），用户同日在同一个弹窗里再批一次，合计 +800、+201；放行写成单独的提交，按 merge-base 定键。
- **验收编号与证据：**
  - RCPT-344：回执引用提到它的步骤报告，放在 AI 自己说的那一组里，键与计划卡一致；没提到它的报告不出现；板没读时什么都不画；事实一行不变；新来一条报告时重画同一个元素（`tests/input-receipts-client.test.ts`）。
  - RCPT-345：`link` 对页面没画出的回执给 null；按钮先跑调用方的那一步，再打开回执、焦点落在 summary 上（同上）。
  - RCPT-346：服务端报告在每条补充下引用提到它的步骤报告，标明是 AI 的说法，原话在围栏里；夹带的话留在引述里（`tests/coding-report-persistence.test.ts`，与 RCPT-342 同一份夹带）。
  - RCPT-347：步骤对话框只为 Coding 对话里画出了回执的补充出按钮；点它时对话框先关上（`tests/coding-step-receipt-link.test.ts`）。
  - RCPT-348：同一条补充在两个面上各画一份，是两个元素，重画时各自保留；更正之后两份都更新；`link` 只找自己那个面上的，没画过的面给 null；托盘只列自己那个面上的回执；不重复播报（`tests/input-receipts-client.test.ts`）。助理把对话线程交给回执当面，而不是回执所在的那一轮（`tests/assistant-receipts-client.test.ts`）。

**3d-3 实现记录（2026-10-18，§4.5 前两条、D2、D23；统筹 10-18 定）：**

- **AI 说的新任务先是提议（D2）。** AI 对一条补充说「作为新任务」（`model_claim.treatment` 为 `new-task`），计划卡在步骤下面加一行虚线的提议：「AI 说这是新任务，待你确认」、补充原话、「加进计划」。它是 AI 的说法，和回执里「AI 自己说的」同一类，不是步骤，不改事实。只有计划还能改（这一轮在跑，或是最新一轮、图没结束）才出现；已有步骤指向它的不再出现。点「加进计划」打开和「在后面插入一步」同一张表单，标题先填补充原话，完成条件由人写，提交走人插入步骤的同一条路，接在最后一步后面。AI 没有任何路径能自己加步骤：一轮自己的 `board-revise` 仍被 `molis-confirmed-plan-scope` 拒掉，说法本身也不加步骤。
- **步骤指向它来自的补充（D23）。** 人的插入可以带 `origin`：一条输入的编号，只能一条。宿主在 `agent.collaboration.revise` 的处理器里核：读这一轮自己的记录，它必须是这一轮的补充、没有撤回；伪造的、别的会话或别的轮次的、撤回了的都拒（`agent.input_not_origin`），拒在碰板之前，板上和业务记录里什么都不写。核过的交给 SDK 的 `addNode` 作为节点的 `origins`（会话取这一轮的 SDK 会话，不信请求里的会话或项目）。`AgentStepBoard` 的节点投出 `origins`，照 SDK 板上记的原样，不给就是没有，这就是 D23 说的「这时再投」。
- **徽标。** 指向补充的步骤，在计划卡和 TaskBoard 上都显示「来自补充「…」」，点开回到对话里那条回执。两处用同一份：Coding 的回执脚本给一个 `from(node, first)`，里面是共用回执的 `link`（3d-2 的那个按钮，加了 `lead` 参数，换成「来自补充「」）；对话里没画出那条回执就没有按钮。从 TaskBoard 点时先关上 TaskBoard、回到对话。
- **合同。** `agent.collaboration.revise` 的输入加了 `amendment.origin`，按 `specs/prologue-adoption` §4.6.9「形状变了就升 version」升到 v2（快照删 v1 行、加 v2 行）；唯一的调用方是 Coding 的计划修订路由，同一个 PR 里改。`AgentStepBoard` 节点加 `origins?`（`pnpm api:update`）。
- **字节。** 先在片内抵：计划卡的 `stepOf`、`skipped`、`settled` 和 TaskBoard 的一模一样，改成计划卡用 TaskBoard 的那一份（经端口交过去，`client.ts` 里计划卡的构造挪到 TaskBoard 之后，行数不变），「在后面插入一步」和「加进计划」共用一个插入表单，提议行与样式各压成一条，计划卡的样式挪到卡旁（`styles.ts` 不再变长）。剩下的对照 3d-2：`molis-work-plugins/coding.js` +737（提议行与「加进计划」、徽标、`origin` 校验），两份样式表各 +147（虚线提议行），`molis-work-workbench.js` +10（`link` 的 `lead`）。用户 10-18 在回执线会话的弹窗里一次性批准；放行写成单独的提交，按 merge-base（main 8fcff0442，#688、#696 之后）定键，3d-2 的两条移进用过的名单。
- **BL-161。** TaskBoard 按 `node.id` 编号、计划卡按位置编号，插入一步后两边对不上；按统筹要求只记进 BACKLOG，不在这一片里改。
- **验收编号与证据：**
  - RCPT-349：插入只能带一条输入的编号，别的写法在 schema 和 Coding 的路由就被拒；宿主拒伪造的、别的会话的、撤回了的，拒时修订一次都没交下去；这一轮自己读到的照常交下去（`tests/agent-collaboration-revise.test.ts`、`tests/coding-plan-amend-http.test.ts`）。
  - RCPT-350：真实运行时里，人加的步骤在板上指向那条补充，会话是这一轮的会话，运行视图读回同一份（`tests/prologue-board-origins.test.ts`）。
  - RCPT-351：反例。AI 说「作为新任务」、再自己用 `board-revise` 加一步并指向它，宿主拒掉，板上还是原来那一步，没有指向（同上）。
  - RCPT-352：计划卡只为还没有步骤指向的新任务出虚线的提议，别的说法和已加过的不出；说法本身不加步骤；只有点「加进计划」才发人的插入，带着那条补充；计划结束后不再提议（`tests/coding-board-origins.e2e.test.ts`）。
  - RCPT-353：指向补充的步骤在计划卡和 TaskBoard 上是同一个「来自补充「…」」按钮；从 TaskBoard 点时先关上它再打开回执（同上；`link` 的 `lead` 在 `tests/input-receipts-client.test.ts`）。

**3d-4 实现记录（2026-10-18，§4.3「改变了什么」、D21；统筹 10-18 定）：**

- **记录里的步骤。** 回执详情在事实一侧加「为它加的步骤」：板上 `origins` 指向这条补充的步骤，写它在计划卡上的编号（S1、S2…，人插入的写「插入」）、标题、人加的（节点的 `inserted`）、现在的状态（节点的 `state`，措辞和计划卡一样：完成和失败写「模型报告完成」「模型报告失败」，是报告，不是核对）。每一项都只取板记录里现成的：没有标题就不写标题，不是人插入的就不写「你加的」。加入的时间和板版本不写：板上不记一个节点在哪一版、什么时候加入，从报告的时间或次序推算就是猜。不写「已生效」。
- **两边各自标明。** 详情里同时有 AI 的说法（处理说明或步骤报告）时，事实一侧加「记录里的」小标题，AI 一侧仍是「AI 自己说的，Molis 没有核对」；只有事实时不加。
- **一处读板。** 读板的部分（步骤编号、引用它的报告、为它加的步骤）挪到 `readBoard`，和托盘、纠正一样交给回执的页面程序（`createInputReceipts` 不再变长）。步骤状态的措辞放进共用措辞表 `RECEIPT_WORDS.STEP`，是合同里的闭集。Coding 不用改：它交给回执的就是这一轮的整个 `step_board`。规格板的 Coding 示例加了一个为补充插入的步骤。
- **字节。** 对照 main（#702、#701 合入后为 a56a2763d）：`molis-work-workbench.js` +889（为它加的步骤、「记录里的」小标题、步骤状态的措辞表与读板，加上交给计划卡的 `step`）；`molis-work-plugins/coding.js` −253（计划卡删掉自己的措辞表）。片内试过：英文词典里已有的几条不重复（它不在这份脚本里，字节没少）、两次遍历板合成一处（多 1 B，撤回）。用户 10-18 在统筹的弹窗里一次性批准 +889（替换先批的 +860）；放行写成单独的提交，按 merge-base 定键，3d-3 的四条移进用过的名单。
- **没做的。** 文件归因（一条补充改了哪些文件）记为 BL-162：审查记录不带步骤、调用和时间，要上游给调用归因，这一片不绕路。`prompts.ts` 的处理说明使用指令记为 BL-163，交 AI 手册线评估（统筹 10-18 定）；评估后不写，BL-163 已删，数字与理由见[手册 §9.5](../ai-development-handbook/spec.md)「BL-163 与 coding-base 补充半句」。
- **验收编号与证据：**
  - RCPT-354：为补充加的步骤在事实一侧，写编号、标题、你加的、现在的状态；有 AI 说法时两边各有标题，步骤不在 AI 一侧；状态变了原地重画；只有事实时不加标题（`tests/input-receipts-client.test.ts`）。
  - RCPT-355：只写板记录里有的：没有标题、不是人插入的就都不写；不写板版本、加入时间和「已生效」；为别的补充加的步骤、这次没读到的板都不显示（同上）。
  - RCPT-356：步骤状态只有一份措辞：回执把 `RECEIPT_WORDS.STEP` 经 `host.receipts.step` 交出去，Coding 的计划卡删掉自己的 `LABEL`、改用它（统筹 10-18 定，属防腐；coding.js 只变小）（`tests/input-receipts-client.test.ts`、`tests/coding-state-rings.e2e.test.ts`）。TaskBoard 的状态表把未开始写成「等待前置」，和这里不一样，记为 BL-164。

**3d-5 实现记录（2026-10-18，D2、D23；统筹 10-18 定，不记 BL）：**

- **缺口。** 3d-3 的宿主在 `agent.collaboration.revise` 等调用变成现行（`beforeEffect`）之前就核了来源；等的时候那条补充被撤回，插入照样成功，板上的 `origins` 指向一条撤回了的输入。防腐线复查时复现。
- **两处核。** 处理器先等调用现行，再按这一轮的记录核来源。运行时在插入里再核一次：读这一轮自己的输入账本（适配器按运行时推来的事件维护的那份），紧贴着 `addNode`，中间不隔 `await`。核不过都抛 `agent.input_not_origin`，板上和业务记录都不写。核来源的函数只有一份（`horizontal/agent-host/src/input-origin.ts`），宿主和运行时共用；运行时那一次经内部端口的 `revise` 把账本交下去，合同不变。
- **照实写的边界。** SDK 的 `addNode` 把写入排在同一张板上更早的写入后面（`serially`），排队时会跨 `await`。在它排队之后才撤回的，算「撤在之后」：步骤留着，回执照实显示那条补充已撤回、这一步指向它。适配器的账本跟着运行时的事件走，运行时撤回了、事件还没推到时也算之后。
- **验收编号与证据：**
  - RCPT-357：插入在等调用现行时那条补充被撤回，宿主拒（`agent.input_not_origin`），板的版本和步骤都没变、没有步骤指向它；绕过宿主直接交给运行时，运行时按自己的账本同样拒、同样不写（`tests/prologue-origin-withdraw-race.test.ts`）。

**3e-0 实现记录（2026-10-18，3e 的前提；统筹 10-18 定选 A）：**

- **缺口。** SDK 只在一轮的工具名单里列了 `acknowledge-inputs` 时，才给模型看每条补充的编号、才收它的处理说明（`offersAcknowledgement`）。助理的两个工作角色只能列 `BUSINESS_HOST_TOOLS`，里面没有它，所以助理从来给不出处理说明，回执里的「AI 说」和 3e-1 的「当前约定」在真实使用里都是空的。
- **做法。** 把 `acknowledge-inputs` 加进 `BUSINESS_HOST_TOOLS`，名单仍只有一份（`packages/contracts/src/platform/plugin-agent.ts`）。四处校验读的都是这个常量，不用改。这个工具不碰目录、不执行命令，只在 SDK 自己的输入账上记一条「AI 自称」，和业务角色的限制不冲突。提示词不动，用法由 SDK 的工具描述来讲；够不够，交手册线评估。
- **影响。** 展开这个常量的业务角色都会多看到这个工具：助理的两个工作角色、Todo 的整理角色；Character 的工具许可也认它。不想要的角色可以不列。公开 API 快照随之更新（`plugin-agent`、`plugin`）。这三个角色的版本当时没跟着升，同一个「角色@版本」在冻结记录里对应过两套工具；2026-10-19 补升（D3 片，与 `board-wait` 一并算）：助理的两个工作角色 1 → 2，Todo 的整理角色 2 → 3，提示词不动。
- **验收编号与证据：**
  - RCPT-362：助理的工作轮次，模型请求里列着 `acknowledge-inputs`，看得到运行时给的补充编号；它的说明落成回执上的 `model_claim`，账上的状态不变（`tests/assistant-business-gateway.test.ts`；常量去掉这一项时这条会红）。
  - RCPT-363：业务角色仍然拿不到碰目录或执行命令的工具，`read-file`、`list`、`search`、`write`、`edit-file`、`run-command` 都在开轮前被拒，模型一次都没被调用；只列业务工具的照常开轮（`tests/prologue-start-refusal.test.ts`）。
- **顺带查到的。** Coding 的角色（`plugins/native/coding/src/roles.ts`）也没有列 `acknowledge-inputs`，所以真实的 Coding 轮次同样给不出处理说明。这不是业务名单的事，记为 3e-0b（统筹 10-18 定）：#713 合入后再开，归回执线；Coding 的角色是 workspace 角色，在 `roles.ts` 里自己列这个工具，不碰 `BUSINESS_HOST_TOOLS`；用例要证明 Coding 的轮次看得到补充编号、处理说明落成 `model_claim`。

**3e-1 实现记录（2026-10-18，§9.2「AI 记下的约定」，10-19 前叫「当前约定」，见 D41；统筹 10-18 定）：**

- **在哪里。** 助理侧栏多一块「AI 记下的约定」（10-19 前叫「当前约定」），排在路径之后；没有可列的就藏起。它从对话线程里这项工作画出的回执派生，只算这项工作现在显示的轮次（共用回执的 `latest(owner)` 按轮的 `run_id` 筛），不另存一份。
- **列什么。** AI 对一条补充的处理说明里，影响写了约束、目标或完成条件（或种类就是约束）的，按发送顺序一条一项：本人原话（点开回到那条回执，更正在那里），下面是「AI 说采纳为约束、目标…」。说了不采纳、已回答、要澄清的，撤回了的，影响只写了别的的，没有说明的，都不列。后来有更正指向它的，只写「后来有一条更正指向它」，不说更正改了什么。
- **AI 的说法和事实分开（统筹 10-18 定）。** 「AI 说」用回执里 AI 说法那一行同一种虚线样式，没有表示核对过的颜色或图标；底下一句「AI 自己说的，Molis 没有核对；要改，打开那条发更正。只看了最近 N 轮」。宿主只留最近 30 轮，N 是这次读到的轮数，所以超出时如实写「只看了最近 30 轮」，不再多读（统筹 10-18 定）。不写「已生效」「已遵循」。删改走更正：§9.2 说的「本人编辑等于纠正输入」，就是打开那条回执发更正。
- **代码位置。** 列表在共用回执里，`createAgreements` 和托盘、更正一样随页面程序交过去，回执多一个 `agreements(owner, runs)`。助理在画完各轮之后调它（工厂原来的 `tray()` 改名 `after()`，托盘之后接着画约定），文字没变就不重画，侧栏里的焦点不跳；所以每一项在点的时候才找这条输入最新的回执，没读的补充按 D28 带进下一轮、换了回执元素，留着的那一项也打开新的那份（托盘同样受益）。`assistant-island.ts` 行数不变：各块的查找改成一处按 `data-assistant-block` 收集。措辞都过翻译函数：列表的英文在回执自己的词典里，侧栏块的名字是助理的，英文在 `apps/workbench/src/i18n/assistant-en.ts`；底下那句由整句组成，轮数那句 1 轮单独一句（3e-r）。
- **字节。** 对照 main（0ffa9842d，#713 合入后）：`molis-work-workbench.js` +1,434（列表、侧栏块与它的英文 1,413，加上点击时再找最新回执的 21；两句说明合成一句已抵掉一部分）。是新加的一块，抵不回去；统筹 10-18 按新口径一次性放行，放行写成单独的提交，按 merge-base 定键，W5-01 的那一条移进用过的名单。
- **验收编号与证据：**
  - RCPT-358：约定按发送顺序列 AI 说采纳为约束、目标、完成条件的补充，原话在前，AI 的说法在后、标明没核对；不采纳、要澄清、撤回了、别的影响、没有说明的都不列；没有「已生效」一类的话（`tests/input-receipts-client.test.ts`）。
  - RCPT-359：只算这个面现在显示的轮次；后来的更正写在它指向的那条旁边；每一项点开它自己的回执（同上）。
  - RCPT-360：助理画完各轮后把约定放进侧栏的块，面是对话线程、只给这项工作的轮次；文字没变不重画；没有工作就没有这一块（`tests/assistant-receipts-client.test.ts`）。
  - RCPT-361：浏览器里，模型对用户经补充发的「别直接发邮件给客户，我自己发」说作为约束采纳，侧栏的「AI 记下的约定」出现这一项和 AI 的说法、只有一句说明，点它打开对话里那条回执（`tests/assistant-input-receipts.e2e.test.ts`）。

**3e-0b 实现记录（2026-10-18，3e-0 顺带查到的；统筹 10-18 定）：**

- **缺口。** Coding 的角色是 workspace 角色，不展开 `BUSINESS_HOST_TOOLS`，自己列工具；原来没有一个列了 `acknowledge-inputs`，所以真实的 Coding 轮次看不到补充编号、给不出处理说明，回执里的「AI 说」在 Coding 里也是空的。
- **做法。** 在 `plugins/native/coding/src/roles.ts` 里，和人对话的七个角色（规划者、阅读者、评审者、协作、并行写入、构建者、改写者）都列上 `acknowledge-inputs`，版本各 +1。派出去的三个子角色不列：人的补充不直接交给它们。提示词不动。
- **并行写入（统筹 10-18 定选 A）。** 给子任务独立目录的父角色，运行时有一份写死的工具名单（只能读和分派），原来在 `prologue-run.ts` 里是一行字面量，只此一处。收成有名字的常量 `WORKSPACE_PARENT_TOOLS`，加上 `acknowledge-inputs`：它不执行、不碰目录，和名单里的 `ask-user`、`session-send` 同一类。能写或能执行的工具仍然被拒。
- **验收编号与证据：**
  - RCPT-364：真实的 Coding 宿主里，一轮的模型请求列着 `acknowledge-inputs`，看得到运行时给的补充编号；它的说明落成回执上的 `model_claim`，账上的状态不变（`tests/coding-input-acknowledge-http.test.ts`）。
  - RCPT-365：并行写入的父角色带 `write` 或 `run-command` 仍然开不了轮，模型一次都没被调用；Coding 自己的并行写入角色带着 `acknowledge-inputs` 照常开轮，请求里列着它（`tests/prologue-workspace-parent-tools.test.ts`）。

**3e-r 评审跟进记录（2026-10-19，防腐 spec §10.28 的三条小修，合成一片；统筹 10-19 派）：**

- **本人标记的步骤（#706 P2）。** 回执里「为它新加的步骤」只按状态选「模型报告完成／失败」。板上节点本来有 `owner`，但回执的节点类型没带它，所以本人亲手标完成或失败的步骤也写成了模型报告的。现在节点类型加上 `owner`（只取 `kind`，类型用合同的 `AgentStepOwner`）：本人持有的步骤成功或失败时，写「你标记完成」「你标记失败」，和 Coding 计划卡的措辞相同；进行中、排着的仍用状态词。这两句和步骤的状态词放在同一张词表里（`RECEIPT_WORDS` 的 `MARK`，挨着 `STEP`），由同一个取词函数按持有人选。owner 换了人，这一行就重画。
- **约定块的英文与整句（#714 P3）。** 侧栏块名字的英文原来写在回执自己的词典 `INPUT_RECEIPTS_EN` 里，现在挪到助理的 `apps/workbench/src/i18n/assistant-en.ts`。底下那句原来拆成「…只看了最近 」、轮数、「 轮」三段分别翻译，英文在 1 轮时用了复数。现在由整句组成：「AI 自己说的…打开那条发更正。{seen}」是一句，`{seen}` 填轮数那一句；轮数那句 1 轮单独一句，其余是带 `{n}` 占位的一句。占位都由页面的翻译函数 `L(key, vars)` 填，回执程序的 `L` 类型随之带上 `vars`。两段碎片的词条已删。长的那句只出现一次，不随轮数重复。
- **改名（防腐 spec「统筹裁定」第 3 条，D41）。** 侧栏的「当前约定」改名为「AI 记下的约定」，英文 "What the AI noted as agreed"。Goals 的「当前约定」是 Goals 记下的事实，这里只是 AI 的自称，哪里都没有记。§9.2、3e-1 记录、GLOSSARY、功能全景都已同步。
- **角色越权的错误码（#726 P3）。** 父角色持有执行工具时，`prologue-run.ts` 原来抛一个不带码的 `Error`；现在改用 `agentErrors.role_execution_exceeded`。RCPT-365 的拒绝断言也改为同时核对错误码和原因。
- **不在本片。** 两个助理角色与 todo 角色的版本补升（§10.28 的 #713，裁定第 4 条）另开一片，等手册线先把规则写进 `skills/molis-prologue-ai`。
- **字节。** 对照 main（#765 合入后为 `3f816873f`）：`molis-work-workbench.js` +195（1,129,869 → 1,130,064），其余资源不变。多出来的是本人标记的判断与两句措辞、按轮数的整句，以及侧栏块名字变长的 6 字节。先省过的：长的那句只出现一次，不随轮数重复（−47）；两句措辞放进共用词表，用同一个取词函数（−50）；第一版是 +292。`readBoard` 函数体里的注释改成了 `//` 行：发出去的脚本经 esbuild 压缩，注释本来就不发，所以这一项对 `workbench.js` 没有影响，只让不压缩、直接内联这段程序的到达页少带几行注释。剩下的是本人标记和整句本身需要的代码，在同一个资源里省不回来。统筹 10-19 定：这片不并进 3e，就绪就拿下一把 `workbench.js` 的键（+195 在 10 KB 以内，不问用户）；`APPROVED_CEILINGS` 的一次性条目由评审会话在评审时按 merge-base 的准确数字加。
- **验收编号与证据：**
  - RCPT-366：模型持有的步骤，成功、失败分别写「模型报告完成」「模型报告失败」；本人持有的写「你标记完成」「你标记失败」；本人持有、还在进行的写「进行中」。owner 从模型换成本人时，这一行重画成本人的标记。英文是 "You marked it done" / "You marked it failed"（`tests/input-receipts-client.test.ts`）。
  - RCPT-367：约定底下那句由整句组成：1 轮、2 轮的中文各自正确；英文 1 轮写 "Only the latest round was read."，2 轮写 "Only the latest 2 rounds were read."；旧的碎片词条已不在词典里（同上）。
  - RCPT-365（加强）：拒绝带错误码 `agent.role_execution_exceeded`，原因仍是协调者只能读取和分派（`tests/prologue-workspace-parent-tools.test.ts`）。
  - RCPT-361：浏览器用例的标题已随改名更新，本地没跑（用户 10-19 暂停浏览器验证，见 §12.6）。

**3e-2a 实现记录（2026-10-19，§9.2「交付说明」；统筹 10-19 定）：**

- **回答什么。** 一项工作最近一轮结束以后，人想问两件事：我中途补充的话怎么样了，这项工作留下了什么、还差什么。交付说明把这些放在一处，每一条都来自账或这一轮的视图。
- **何时出现。** 最近一轮在跑，或还不知道结果（`unknown`、`reconcile-required`）时不出现，结果槽也不给结果步。已经结束就出现，并且在题目里写明「截至最近一轮」。没有补充，也不出现。失败的最近一轮也画，但结果槽只留「重试」。
- **题目只看最近一轮。** 题目是三种之一：最近一轮已结束、失败、已停止，只由最近一轮的相位定，不看工作的状态。续做要核对时，工作状态是需要核对，可最近一轮照样结束了：题目仍写「最近一轮已结束」，「去核对」由步骤行的等待位给出，排在交付说明前面。更早的某一轮读不到（`unknown`）也不挡，只看最近一轮是否已有结果。
- **放在哪。** 助理对话线程里，托盘之后，作为一条记录 `delivery:<work_id>`，不折叠，读屏不播报。内容由 Host 写成 `delivery_html`，页面不再另算一遍。文字变了才整块重画，成为新元素，所以步骤行会为新按钮再绑一次。记录的外层（键、类名、`aria-live`）也由 Host 写，键只写一处。页面不调用 `bindText`，由步骤行按 `data-ix-record` 绑。
- **分几组。** 「记录里的」、「AI 自己说的，Molis 没有核对」、「做了什么」、「这项工作做出的结果」、「还差什么」。
  - 每条补充是一个按钮，点它打开它自己的回执，沿用共用回执的 `link`。
  - AI 报告的步骤只在「AI 自己说的」里，写成「模型报告完成」，不写成已经做完。
  - 结果按钮和回复里的结果按钮是同一个样子。打不开的结果只写名字和状态。
  - 「还差什么」列没读的补充、没回答的问题、没做完的子任务、没确认结果的改动、读不到的结果和排着的队。
- **步。** 结果槽先放「看交付说明」，再放「打开「…」」，一共最多两步。两步用同一个判断：`isOpenable`（`assistant-delivery.ts`，结果槽从这里取），页面上的结果按钮和槽里的步骤不会各说各的。「打开」按钮的 `data-ix-press` 是 `open:<kind>:<id>`，步骤行点的就是这个按钮。
- **和原计划不同的地方。**
  - 「Molis 写的」「别的会话写的」只标在排队的那些行上。Host 写的补充在轮次里是 `notice`，不列出来；`steer` 本身不带来源。所以补充行上标不出来来源，这不是漏做。
  - 最近一轮结束时还是「已开始」的改动，也算「结果没确认」，和「未知」同样写在「还差什么」里。
  - 英文多了十八个键，都是整句标签；用户写的话在 `say` 之外拼接，不进占位符。
- **字节。** 3e-2a 与 #789（结果按钮由下一步行接上，`specs/context-program` §21.9 SLOT-03）合成一个 PR、用一次放行（统筹 D10，评审方案甲）。对照 main（`06e7ff4ac`）：`molis-work-workbench.js` +442 B（1,130,033 到 1,130,475），其余资源不变。3e-2a 自己的页面脚本里只有放置、换新和点补充按钮这几行；记录的键、类名和 `aria-live` 由 Host 写在 `delivery_html` 里，页面不再自己拼，比页面自己拼省了 139 B，也省去了键的第二份写法；评审时把放置与点按的两处写法改短，又省 28 B。英文词典不在这个资源里。`APPROVED_CEILINGS` 的一次性条目是 `[1130033, 1130475]`，#778 那条的起点进了已用名单。
- **没做的。** 助理的步骤板（3e-2c）、活动里的交付入口、侧栏约定里的补充。
- **验收编号与证据：**
  - RCPT-369：最近一轮在跑、结果未知、没有补充时没有交付说明；结束以后才有，题目跟着最近一轮的结束方式走，不跟工作状态走，说明里没有「已采纳」「已完成」一类的话；最近一轮是 `reconcile-required` 时没有说明、结果槽也没有结果步（`tests/assistant-delivery-note.test.ts`）。
  - RCPT-370：账上的事实和 AI 自己的说法分成两组，每条补充是通向它回执的按钮；纠正指回原来那条，通知不列，Host 和别的会话写的排队项带标记；AI 报告的步骤只在 AI 的一组（同上）。
  - RCPT-371：结果只取这项工作的结果边，按视图里的顺序，用结果槽同一个判断决定能不能打开；不说哪个结果出自哪条补充，也不按时间去猜（同上）。
  - RCPT-372：「还差什么」列出没读的补充、没回答的问题、没做完的子任务、没确认结果的改动和读不到的结果；没读队列和队列为空是两回事（同上）。
  - RCPT-373：结果槽先放交付说明，再放打开结果，最多两步；失败的一轮只留重试；回复带着说明，没有说明就是空的（同上）。
  - RCPT-374：用户的话和所有标题都是文字，不当标记；说明里每一句都有英文，新增的都是整句标签（同上）。
  - RCPT-375：页面把说明放在托盘之后，同样的文字不重写，变了换成新元素，另一项工作是另一条记录，没有说明就移除；补充的按钮打开它的回执；槽里的步骤按下说明自己的结果按钮（`tests/assistant-delivery-page.test.ts`）。

### 阶段 4：产品对象与 Goals 层

依赖已满足：#340 已合入；W3-01 调用编号已在 #421 落地。

- 输入与 Goal、待办、定时任务、成果之间的 Context Ledger 边；Goal 页显示「来自对话的输入」。
- 目标与验收类的影响走 Goals 提议（Candidate Goal、约定变更），本人决定后才生效。
- 外部 Runtime：Goals 新动作让外部 Agent 对笔记、要求、决定说明「已读到 / 处理方式」（§8.4；`goals.events.acknowledge`，S2-2，见下面的实现记录）。
- 验收：Goal 页能回答「这条要求被哪个会话读到、怎么处理、改了什么」。
- 验收（插件 Agent 一轮的会话，S3-3，D42；`tests/security-invariants-agent-run-session.test.ts`）：
  - RCPT-391：一轮的工具调用带宿主核过的那条会话（`runtime_session_id`、`audit_actor_id` 为 `agent:<runtime_id>:<会话>`，`actor_id` 不变），启动请求里自带的会话或作者不算；人点一轮的建议（`agent.offers.run`）执行的动作也带这条会话（RCPT-395）；Goals 记的作者与幂等按会话分开，同一插件另一条会话准备的接入继续不了（S-37）。
  - RCPT-392：Runtime 自己的会话记录与请求不符（另一条会话、另一个插件、安装、人或项目）的启动被拒（`agent.session_unknown`），没有建出工具，没有写任何记录。
  - RCPT-393：工具输入带会话或作者被拒（`actions.input_invalid`），动作没有运行，没有提案。
  - RCPT-394：会话不授予权限：撤权后这一轮照样被拒，动作没有再运行，没有提案。
  - RCPT-395：人点一轮的建议（`agent.offers.run`）时，动作的上下文带点的那一轮所在的会话（宿主刚用 Runtime 的会话记录核过的那条）：处理器看到 `runtime_session_id` 为这条会话、`audit_actor_id` 为 `agent:<runtime_id>:<会话>`，`actor_id` 不变，点击里自带的会话或作者不算；点名别条会话的轮次被拒（`agent.run_unknown`），什么都没执行；一条会话里点建议准备的接入，同一插件另一条会话里点建议继续不了（`connector.setup.foreign_request`），没有连上任何东西，准备它的那条会话自己能过发起者检查（S-17、S-37）。

**S2-2 实现记录（2026-10-19，§8.4；回执线，D20 P1、P2、P7）：**

- **动作。** `goals.events.acknowledge@1`：外部 AI 会话对本 Goal 上的一条笔记、约定、配置或本人的决定，说「读到了，打算这样处理」。输入是 `goal_id`、`event_id`（`gevt-`）、`treatment`（和回执的 `AgentInputTreatment` 同一份八个词）、`note`（1 到 300 字）、`read_cursor`（它读到时的游标）、`idempotency_key`。受众只有 agent、mcp，声明 `plugin: false`：页面、工作流、插件调用者都拿不到。MCP 工具名 `molis_work_v1_action_goals.events.acknowledge__v1`。
- **记录。** 写成 Goal 事件里的一条 `system` 记录，操作 `input_acknowledged`，载荷是被引用记录的 `reference`（id、种类、操作、标题、游标）、`treatment`、`note`、`read_cursor` 和 `by`。被引用记录的这些字段由宿主从那条记录抄来，不读输入。它是 AI 的说法，不是 Goal 的事实：不改工作状态，不进约定，不生效；取消了的 Goal 照收，仍是取消（和笔记、进展同一类普通记录），回收站、归档的沿用 `goals.goal.trashed`、`goals.goal.archived`。
- **谁说的。** 作者和 `by` 只从调用上下文来：MCP 调用取运行时 id 与稳定会话（`runtime:<id>:<会话>`），助理取助理身份，其他取 agent；输入里带 `actor_id`、`project_id`、`session_id`、`actor_kind`、`by` 一律 `actions.input_invalid`。没有稳定会话的 MCP 调用在派发时被拒（`kernel.runtime_identity_missing`），什么都不写。这是 S-17 的一个新入口，测试已进 S-17 与 S-18 两行。
- **能说明什么。** 笔记、约定（含配置）、本人的决定。进展、请求决定、报告、建意图、别的处理说明都不能：`goals.event_acknowledgement.reference_kind`；不存在的、别的 Goal 的、别的项目的统一 `…reference_missing`。`read_cursor` 必须是项目里已有的整数游标且不小于被引用记录：`…cursor_invalid`、`…cursor_before_reference`。空的说明复用 `goals.event_note.body_required`。游标是会话自己的说法，宿主只核它存在、不早于那条记录，不核它真读了什么。
- **时间线。** 一行「处理说明」：「Claude Code 会话 X 在游标 N 读到了你的笔记「标题」」，下面是处理方式和它写的话，再一句「AI 自己说的，Molis 没有核对」，带定位按钮回到被说明的那条。「你的」只在被引用的记录是本人写的时候写，否则只写「这条笔记」。运行时的显示名取 `RUNTIME_DISPLAY_NAMES`（P7：安装检测、桌面启动、角色导入原来各留一份，现在读同一张表）。英文在 `plugins/native/goals/src/document-en.ts`。页面在服务端画，工作台脚本没有变。
- **对已有读法的影响（2026-10-20 合同复核）。** `goals.events.list`、`latest`、`read` 的严格输出 schema 中，`systemPayload.anyOf` 新增 `input_acknowledged` 分支；三个动作统一升到 @2，删除 @1 登记，不留并行兼容。HTTP 与插件内调用从 `goalsActions` 取同一份当前定义；固定 MCP 工具名改为 `molis_work_v1_action_goals.events.{list,latest,read}__v2`，安装用例的固定授权同步升版，Skill 与 MCP 文档写明新名字。既有外部授权与工作流程固定引用要重新选择 @2；本次不修改真实 Home。只改语义标签的动作不升版。验证覆盖 MCP 发现与旧工具拒绝、HTTP 读取、分页、原文回读、处理说明主路径与动作快照；复用此前已通过且不涉及固定版本消费者的回归证据。
- **验收编号与证据：**
  - RCPT-376：有稳定会话的 MCP 调用方对本人写的笔记说明处理方式：一条 `input_acknowledged` 系统记录，作者是会话的审计身份，`by` 来自上下文，`reference` 指向那条笔记；`goals.events.read`、`list`、`latest` 读得回，时间线照常显示；同键重试回放，换了内容的同键报 `goals.request.idempotency_key_reused`（`tests/goals-event-acknowledge.test.ts`）。
  - RCPT-377：只接受笔记、约定、配置和本人的决定；进展、请求决定、报告、处理说明本身都拒，报 `reference_kind`；不存在、别的 Goal、别的项目的 `gevt-` 报 `reference_missing`；取消的 Goal 照收且仍是取消，回收站、归档的沿用原码；每次被拒，事件数与游标都没变（同上；`tests/goal-event-write-rules.test.ts`）。
  - RCPT-378：游标非整数、为负、超过项目游标报 `cursor_invalid`，小于被引用记录报 `cursor_before_reference`；游标恰好等于那条记录、等于当前游标时收（同上）。
  - RCPT-379：输入里带 `actor_id`、`project_id`、`session_id`、`actor_kind`、`by` 报 `actions.input_invalid`；`runtime_session_missing` 的 MCP 调用被拒，什么都不写；`by` 对 MCP、助理、agent 三种来源各自正确（同上）。
  - RCPT-380：agent、mcp 看得到、调得动；`plugin`、`user`、`workflow` 即使带 `goals:write` 也报 `actions.forbidden`；另一个项目的上下文报 `actions.scope_mismatch`；都不写（同上）。
  - RCPT-381：取消、撤权、停用三种，处理器没开始就被拒：不写事件、不写幂等记录，调用记录里只有「未执行」一行，不含说明原文，之后同键的允许调用仍是第一次写（同上）。
  - RCPT-382：时间线的 HTML 写出会话、游标、被说明的笔记、处理方式、它写的话、「AI 自己说的，Molis 没有核对」和定位按钮；被引用的笔记不是本人写的就不写「你的」；英文页有英文（同上；英文页由真正的英文 `L` 调同一个渲染函数得到）。
  - RCPT-383：动作快照新增 `goals.events.acknowledge@1` 一行：受众 agent、mcp，`plugin` 关；`goals.events.list/latest/read` 各只有 @2 一行，真实 MCP 只发现 @2 并拒绝旧 @1 工具，三条新版本均能读回 `input_acknowledged`（同上；`tests/action-contract-snapshot.test.ts`）。

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

### 12.6 浏览器验证与剩余缺口

本表起于用户 2026-10-19 暂停浏览器验证时。10-20 的合并验证已补 S2-2 时间线 → 详情 → 原话定位，中英外壳 × 390/1024/1440 宽、明暗交错共六组通过；历史类型与详情仍有中文，列为剩余缺口。完整回归还包含现有浏览器用例，但不替代下表逐场景的人工证据和本人验收。

| 来自 | 要补的 |
| --- | --- |
| 3e-r（RCPT-361） | 跑 `tests/assistant-input-receipts.e2e.test.ts`：侧栏块的标题是「AI 记下的约定」，点开那一项仍会打开对话里那条回执 |
| 3e-r（RCPT-367） | 英文界面下，块名是 "What the AI noted as agreed"；底下那句 1 轮和多轮都读得通，两句之间有空格 |
| 3e-r | 标题改长之后，三种宽度加深色下看侧栏块不折行、不溢出；重拍 `assistant-agreements.png`（写进已忽略的 `.impeccable/qa/review/`，不入库） |
| 3e-r（RCPT-366） | 真实页面里，本人在计划卡上标完成或失败的步骤，回执的「为它新加的步骤」写「你标记完成」或「你标记失败」 |
| S2-2（RCPT-382，#837） | 时间线、详情、原话定位和上述六组界面实走已补。剩余：英文页的历史类型与详情仍显示中文，需要统一显示语言上下文，不能直接翻译用户写的标题或内容 |

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

## 14. 决策记录

2026-10-09 用户回复「按你推荐，开工」：下表九项都按「推荐」一列定下。

| # | 事项 | 选项 | 推荐（即结论） |
| --- | --- | --- | --- |
| D1 | 处理说明工具放哪 | 放 Prologue 系统工具；先在 Molis agent-host 做宿主工具 | 放 Prologue：要和输入身份、提醒在同一账里，其他嵌入 App 也需要 |
| D2 | AI 判为新任务时怎么进 TaskBoard | 先提议、你点头才进；允许 AI 直接加步骤 | 先提议：与计划确认、Candidate Goal 一致 |
| D3 | 运行中的默认发送方式；Esc 的含义 | 默认补充，Esc 不再直接停止（停止要按按钮）；维持现状 | 默认补充；Esc 不直接停止 |
| D4 | 一轮结束时还有没处理的输入 | 询问后再带到下一轮；自动开下一轮 | **用户 10-17 改定：** 人开的下一轮一律带上排着的，开始之前在托盘里逐条可撤回；不问，也不设自动开关。原结论「询问；会话里可以设成自动」作废。不自己开轮照旧 |
| D5 | 助理的回答 / 补充怎么区分 | 用户点选目标；保留自动规则 | 用户点选（2026-10-12 修订，见 D14：默认值显示在芯片上，不必每次点选） |
| D6 | 与 ai-interaction-experience 的关系 | 两份并列、共用本文的输入合同；合成一份 | 并列，共用合同 |
| D7 | 开工顺序 | 等 prologue-adoption 合入、换成 Prologue 主线包后再开阶段 1；在现包上先做 | 等：避免与它在同一批文件上抢改，并直接用会话条目 |
| D8 | AI 是否必须说明每条读到的输入 | 必须，提醒有界、不阻塞收工；可选 | 必须，提醒有界 |
| D9 | 助理每项工作是否引入常驻 TaskBoard | 引入（阶段 5）；只用 `update-todo` | 引入；先在 Coding 验证关联，再上助理 |

**2026-10-12 统筹按用户的拍板规则（技术决策按防腐线、功能决策选界面与日常体验最好的）补记：**

| # | 事项 | 结论 | 理由 |
| --- | --- | --- | --- |
| D10 | 输入回执与「情境条」（情境线助理输入框上方的「手上的东西 + 落点」）的边界 | `AgentInputView` 只记用户的话、来源（`source`）和发送方式（`mode`），**不带附带的情境和材料**。情境条走现有的 `AssistantSendInput.context` 和 `materials` 字段，仍归各自的主人 | 单一事实主人：回执回答「这句话被怎么处理」，情境和材料不是这句话的一部分；塞进回执就有两份真相。与 §6.2 草案一致（`AgentInputView` 本来没有这两项），无冲突 |
| D11 | S2 排队的 D4 开关放哪 | **用户 10-17 改定（随 D4）：** 不设开关。Molis 开跑一律传 `queued: "carry"`，不调 `session.setQueuedInputCarry`，也不存任何设置；子任务唤醒的续跑一律不带，仍由 SDK 保证 | 单一事实主人；防止子任务完成偷渡未读用户输入的消费权限（需求书 §17 的约束） |
| D12 | S3 说明工具的可见性 | 常驻（不按有没有输入切换），plan / ask / App-tools 模式可用；Character 或开跑名单没列它就不提醒不挡。Molis 若显式列工具，要把 `acknowledge-inputs` 加进去，并在 `createRuntime` 注入 `app-ref` 解析器（对接 Context Ledger 的对象引用） | 跑中增删工具会让提示缓存整段失效；不绕过 App 的名单 |

**2026-10-12 与交互线的三件跨线约定**（统筹按用户的规则定，源头是 `specs/ai-interaction-experience`）：

| # | 事项 | 结论 | 理由 |
| --- | --- | --- | --- |
| D13 | 回答（选项点选、卡片按下）作为输入的身份 | 回答也是输入：身份类型与格式由本线 `services/agent-inputs` 定义，交互线只引用。回答的 `key` 与 steer 的 `key` 同一规则（steer 必填就都必填，可选就都可选；SDK S1 里 steer 的 `key` 是可选的，所以回答的也是可选）。回答的「读到」回执在本线 S4 做，S4 要覆盖 pending 的 `about` 与「已回答 / 已过期」事件；在那之前，交互线只在 Molis 侧做幂等 | 单一事实主人：输入合同只在一处定义。注意回答走 pending 的结算、不走 steer 账，所以 SDK 现在没有它的「读到」事实，不能由 Molis 猜；这也是 S4 仍等采用线 P1 的原因之一 |
| D14 | D5 修订：问题待回答时输入框怎么选目标 | 目标芯片三种状态、默认值显示在芯片上（见 §4.1）：「写进问卷：补充要求」（交互线）、「补充这一轮」（本线 1e，一条 steer，排在回答之后，带回执）。有自由文本题默认第一种，没有默认第二种；无问题时芯片不出现 | 比 D5 原来的每次点选少一次点击，默认值一直看得见，也不会把补充误当成回答。SDK 侧「补充排在回答之后」已是现行行为（S1：补充与回答分开，等人时补充排着队，回答后的下一个模型边界才放进上下文） |
| D14a | 1e 的芯片先做哪两态（统筹 2026-10-15） | 「回答上面的问题 ↔ 补充这一轮」两态，默认回答；或只做「补充这一轮」一态，等交互线 | 两态：今天宿主「一道自由文本题、没带材料就当回答」的自动判断马上去掉，默认值摆到明处。交互线的「写进问卷」落地时，由那个 PR 把「回答」这一态换掉（问题合同归交互线）；1e 只留一个可替换的地方：`assistant-send.ts` 回执工厂里的 `CHOICES` 与 `target()`，宿主侧是 `assistant-inputs.ts` 的 `deliver` 里 `target === "answer"` 一支 |
| D14b | 没有芯片的发送（统筹 2026-10-15） | 一律按补充发；或照旧自动判断 | 一律按补充发，不让它悄悄变成回答：回执条写「已补充到这一轮；问题仍在等你回答」。注意：助理唯一的输入框就在底栏里（`assistant-dock.ts` 的 composer），芯片就放在它上面；没有芯片的是页面代写的发送（交还浏览器的说明、插件交来的请求）与定时轮次，它们都不带 `target`。底栏以后要不要再分别处理，由情境线定 |
| D14c | 页面代写的补充交给 Coding 时的来源 | 已知缺口，不在 1e 修；2026-10-19 由 BL-144 补上：`coding.runs.control` 升第 7 版，补充带 `source` | 原来 Coding 的 `runs.control` 补充 schema 没有 `source`，助理转给 Coding 的端口把 `source` 去掉，所以页面代写、交给 Coding 一轮的补充在 Coding 那边记成人的话（助理自己的运行时按 `host` 记）。修法与证据见阶段 1 的「BL-144 实现记录」（RCPT-368） |
| D20 | §20「有效要求跨摘要与续做保留」是否接受、怎么排 | 接受并先修摘要丢补充；或先做 3a | 用户 2026-10-16 经统筹弹窗接受 §20；顺序 R1 → 3a → 3c → 3b/3d/3e，RCPT-103–107 随各自的片做 |
| D15 | `AgentRunControl` 的搬迁先后 | 交互线 C1 搬出 `answer` 分支，本线搬出 `steer` 分支（见 §6.2「改现有控制合同」）；先就绪的一方先合，后合的一方在同一个 PR 里改完所有消费者 | 两边改同一个联合类型，API 快照与调用方都会动；不并行抢改 |

**2026-10-16 统筹定（阶段 3a 方案）：**

| # | 事项 | 结论 | 理由 |
| --- | --- | --- | --- |
| D21 | 「观察到的影响」（板版本差、逐轮变更、调用归因）放在哪一片 | 挪到 3d；3a 只投模型自称的影响，类型上标明是自称 | 它离不开 Coding 的变更集与计划板，只在界面里与自称的影响并排才有意义。3d-4 做了板记录里的那一半：为补充加的步骤写在回执的事实一侧；文件归因要上游给调用归因，记为 BL-162（统筹 10-18 定） |
| D22 | §6.2 的完整 `AgentInputView` 组合视图 | 放到 3c，按组件实际读的形状定 | 不在合同里先落一块没人读的东西 |
| D23 | 板节点的 `origins`（这一步因哪条输入而来）投不投 | 3a 不投，只投报告的 `inputs` | Molis 不许一轮改它确认过的计划（`molis-confirmed-plan-scope` 拒 `board-revise`），节点在 Molis 里还不会因输入而来；3d 的「新任务提议」定下一步怎么落到板上时再投（实现时发现，统筹认可的方案里原有此项）。3d-3 投了：人为一条补充加的步骤带 `origins`，由宿主核过（统筹 10-18 定） |

**2026-10-16 统筹定（阶段 3c 方案；字节一项由用户 10-16 弹窗批准）：**

| # | 事项 | 结论 | 理由 |
| --- | --- | --- | --- |
| D24 | 3c 做到哪儿 | 3c 只做回执条和原地展开的详情；托盘和纠正菜单随 3b | 先让 Coding 与助理用同一个回执组件，再加新的操作入口 |
| D25 | 页面资源增量 | 用户 10-16 批准一次性放行：workbench.js +4,113，workbench.css、arrival.css 各 +2,062，coding.js −558；按 1e 的做法，功能与门禁放行分两个提交，以后仍只许变小 | 共用组件进了工作台的公共资源；Coding 里删掉的旧回执抵掉一部分 |
| D26 | 390 宽的详情 | 原地展开，不做底部抽屉 | 回执就在那句话下面；抽屉会把人从对话里带走 |
| D27 | 助理里宿主代写的说明 | 也标「Molis 的说明，不是你发的话」，与 Coding 一样 | 宿主的话不能读成人的话（§3.3），两处一致 |
| D28 | 回执的播报键 | 「轮 + 输入 id」 | turn id 只在一轮内有效，页面画出所有轮；这一轮没读到的补充会以同一个输入 id 带进下一轮（SDK `settleRunInputs`），只用输入 id 会让两轮轮流误播（走查第 6 项，PR #605） |

**2026-10-16 统筹定（隔离 Home 实走的发现 A–D）：**

| # | 事项 | 结论 | 理由 |
| --- | --- | --- | --- |
| D29 | A：留给下一轮的补充在新一轮不露面 | 是缺陷，单独一片先修。宿主包 `session.startRun` 的那层（`prologue-effects.ts`）丢了第三个参数 `{ carry }`，补充从没被带走，每一轮开场都又读一遍排队却不记账。改成原样转发，加一条真 SDK 用例（RC-09）。已经积在排队里的旧补充，修好后在下一轮带一次就清掉，不另写处理：还没有装到开发机之外的版本，按规则不写兼容代码 | 实走第 3 轮模型又提「README 用法段」，就是这条 after-run 一直被带进开场；带一次就清掉，是止损 |
| D30 | B：丢回复后同一句话显示两次、说法相反 | `AgentTurnView.steer` 加可选的 `key`，页面见到同键就收掉本地气泡、状态行说一次「刚才那条已送到」；排在 3a 之后，一次 `api:update`，PR 写对调用方的影响 | 页面只有键，运行视图只有输入 id；键是两边都有的那一个 |
| D31 | C：「核对并继续」看不到排着的补充 | 选 C1：会话排队有东西时，对话末尾常驻「排着 N 条补充，下一轮开始时带上」，可展开看原文；`queued_inputs` 只在会话没在跑时读；按钮文案不变。跨轮接上（旧一轮写「已带进第 N 轮」）先不做，记 BL-148 | 一处看得见就够；跨轮说法等 A 修好后看实际会不会让人困惑再定 |
| D32 | D：「另外请记住：…」进建议卡，卡片和模型复述门槛规则 | 选 D1：写入门的门槛（`horizontal/memory/src/spoken.ts`，整条消息才算原话）不动；`memory.remember` 工具只回「已作为建议、等认可」，不再把门槛原文回给模型；卡片写「你刚才让我记住：X」，主按钮一下记住，没直接记的短理由收进详情 | 门槛是记忆主人六轮评审定的；要改的是我们自己塞给模型和人的那段话。D32-b（10-19，⑥ 定、① 认可）：被放成建议时再告诉模型「允许记住」是开着的、原因在卡片详情里，免得它自己编原因；仍不给门槛原文 |
| D33 | 走查 C1（对话末尾的排队条）放在哪一片 | 单独一片，排在 3c 之后，可以和 B 并行；字节先在同一片里抵消，抵不完再把差额和理由报统筹去问用户，不并进 3c 的放行（统筹 10-16 定） | C1 要动合同（`AgentSessionView.queued_inputs`），字节也超出 3c 批的数 |

**2026-10-17 统筹定（阶段 3b 方案）：**

| # | 事项 | 结论 | 理由 |
| --- | --- | --- | --- |
| D34 | 纠正、关联记在哪 | 都是一条带 `about`（指向原输入）的补充：SDK 的输入账已经收、也已经投 `about`；「改处理方式、改关联目标」的选项生成纠正的原话，人确认后再发。Molis 不建表，也不存第二份 override 或关联 | 单一事实主人。另建一张人这边的纠正或关联表，就和 §20.2「不另建输入状态表」冲突；真要结构化的关联，走 Prologue 扩展（采用线） |
| D35 | 3b 怎么切 | 3b-1：`agent.inputs.withdraw.v1`，加上带 `about` 的 `agent.inputs.send.v2`，不做界面；3b-2：托盘与纠正菜单。读的动作挪到 3e，到那时才有调用方。两片各开 PR，各跑全量 | 不管 D36 怎么定，撤回和 `about` 都要有；页面现在经各自的运行视图读回执，没有调用方的动作先不登记 |
| D36 | 带到下一轮：维持一律带，还是照 D4 缺省先问 | 用户 10-17 弹窗选「一律带，可撤回」：人开的一轮带上排着的全部，托盘里逐条可撤回，没有带不带的设置（D4、D11 改定）；`agent.inputs.carry-setting` 不做 | 现行产品本来就一律带（Coding 与助理开跑都传 `queued: "carry"`，C1 的排队条也写「下一轮开始时带上」）；每轮都问会多一步，而人几乎总会选带 |

**2026-10-17 统筹定（阶段 3b-2 方案）：**

| # | 事项 | 结论 | 理由 |
| --- | --- | --- | --- |
| D37 | 托盘分几类 | 只分账上已有的：没读到 / 排着等下一轮；读到没说明；AI 说暂不采纳或需要你澄清（标明是 AI 说的）；为它问的问题还没回答。「说要做还没完成」要观察到的结果，等 3d | 没有依据的类别不画 |
| D38 | 托盘和 C1 的排队条 | 托盘取代 C1 的排队条（RC-18）；Coding 和助理共用一个托盘 | 同一件事只有一处列表 |
| D39 | 纠正菜单的形态 | 几个选项填出一句可改的话，发出去的是人自己的话加 `about`；不存任何结构化的东西 | D34：纠正就是一条带 `about` 的补充 |
| D40 | 3b-2 怎么切 | 3b-2a：回执详情里的撤回与纠正、Coding `runs.control` v6、助理 Send 带 `about`；3b-2b：托盘。各开 PR、各跑全量。v6 按 `docs/system/CONTRACT-CHANGES.md` 升版本，v5 及更早不再解析 | 字节和浏览器检查各自一份 |

**2026-10-19 统筹裁定（防腐 spec「统筹裁定」第 3 条）：**

| # | 事项 | 结论 | 理由 |
| --- | --- | --- | --- |
| D41 | 助理侧栏那块约定叫什么 | 「AI 记下的约定」，英文 "What the AI noted as agreed"（原来叫「当前约定」）。§9.2 写明：AI 自称、未核对、不可编辑，要改就从那条发更正 | Goals 的「当前约定」是 Goals 记下的事实，这里只是 AI 的自称，哪里都没有记；同一个词指两样东西，人会把 AI 的自称当成已经记下的约定。GLOSSARY 记下两者的区别 |
| D42 | 插件 Agent 一轮的工具调用带不带会话（P8 = A，S3-3） | 带，取宿主在 `agent.run.start` 核过归属的那条会话（Runtime 自己的会话记录，不取请求里的），所有插件一样，不只 Coding：`runtime_session_id` 为这条会话，`audit_actor_id` 为 `agent:<runtime_id>:<会话>`，`actor_id` 仍是授权的客户端 `agent:<runtime_id>`。人点一轮的建议（`agent.offers.run`）执行的动作同样带，取点的那一轮所在、宿主刚核过归属的那条会话（点击里自带的不算） | S-17 只认宿主给的身份。不给会话时，同一插件的各个会话共用 `agent:prologue`，一个会话能继续另一个会话准备的接入，与 S-37「别的会话的一律拒」不符（点建议执行的动作也一样，不带会话时一条会话里点建议准备的接入，可被同一插件另一条会话里点建议继续）；给了之后变严。`connectors.setup.resolve` 从对 Coding 一律拒，变成只认同一会话自己发起的，与助理一样。Goals 的作者与幂等按会话分开。定的人是 ⑥（按防腐后果，① 指派 P8 给 ⑥） |

**待办（归本线，D7 之后接 S3 时定；2026-10-12 统筹交来）：**

| # | 事项 | 现状 | 本线的方向（接 S3 时再定稿） |
| --- | --- | --- | --- |
| D16 | S3 的系统工具 `acknowledge-inputs` 在助理面板里怎么显示、用什么措辞 | 它在 `APP_MODE_SYSTEM_TOOLS` 里；采用线暂时在助理面板活动行（`assistant-service.ts` 的 `presentActivity`）里把它藏了，因为裸工具名不能直接给人看 | 处理说明显示在**对应那条输入的下面**（回执条与详情里的「AI 的理解」，§3.3 措辞规则：只用「AI 的理解」，不写「已生效」），不作为独立的活动行；活动行上永远不出现裸工具名。R0 预览已按这个口径画（说明行只写「助理说明了 N 条输入怎么处理 · 它自己的声明，不是执行记录」，用例逐检查点断言页面上没有 `acknowledge-inputs`）。真正的措辞、是否在时间线上留一条弱提示、`appRefs` 解析器怎么接 Context Ledger，要等 Molis 接 S3 时按当时的产品形态定；接之前不动采用线的隐藏 |
| D17 | 阶段 1 的「读到」从哪来（统筹，2026-10-13） | 按原计划从账内顺序推（applied 之后的第一段模型产出）；直接用过渡包里 SDK S1 的 `steer-read`、`steer-withdrawn` 事件 | 直接用 SDK 事件。D7 满足时 Molis 的包已带 S1–S3，再写一份推导就是同一事实的第二个主人，阶段 3a 还得删掉它。运行视图的补充回执是 `received → applied → read`，一轮结束还没读到是 `unread`，放进上下文之前撤回是 `withdrawn`；旧的 `unconfirmed` 删掉，不留兼容 |
| D18 | 宿主代写的补充怎么标（统筹，2026-10-13） | 只在 Molis 侧标；交给 SDK 的 `source` | 交给 SDK：新合同子路径 `services/agent-inputs` 的 `AgentSteerControl` 带 `source: "person" \| "host"`，宿主转告的那几处（审查拒绝的转告、会话间来信与板的更新、Coding 改计划后的说明）一律 `host`，映射成 SDK 的 `app`；SDK 以数据入模、不冒充人的话，运行视图把它显示成 `notice`，Coding 的报告不再把它列进「补充要求」 |
| D19 | R0 预览改成现场调用 `projectInputReceipts` 放在哪一步（统筹，2026-10-13） | 本次换包后马上改；等有合适入口再改 | 等：预览是 `scripts/` 下的独立脚本，直接 import `@prologue/sdk` 会让 agent-host 之外多一个依赖 SDK 的地方（AGENTS 硬约束）。等 agent-host 的公开入口给出投影（阶段 3a 在 agent-host 里投影 L2–L4 时一起出），预览改用它，同一个改动删掉录好的投影文件 |

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
- 2026-10-12（再续）：R0 独立回执体验预览实现并工程通过（见 §18.8）。脚本 `scripts/preview-input-receipts.mts`（端口 4292）读 `scripts/input-receipts-slice/recorded/` 里用 Prologue S3 末端（`37427d09`）的真实 SDK 录下的事实，只做展示，不计算状态。非浏览器用例 12 条、浏览器用例 10 条（三宽度 × 浅深色 × 两种布局 × 四个场景、键盘、输入法、托盘、纠正、结束卡与重启分支）通过；健康门禁 `--base origin/main` 通过，新文件 Biome 0 诊断、类型检查干净、secrets 干净。**真实产品实操不适用（预览不连 Home）；用户本人验收未进行。**
- 2026-10-12（统筹交来）：Prologue S2/S3 已随 Prologue #5 合入 Prologue main（合并提交 `f5ef12e6`），采用线正在把这个包换进 Molis。新增待办 D16（§14）：`acknowledge-inputs` 在助理面板里的显示与措辞归本线，D7 之后接 S3 时定。
- 2026-10-13：S4（任务图、待办与问题引用输入）在 Prologue `feature/input-receipts-s4` 上实现并工程通过，PR [molis-ai/prologue#10](https://github.com/molis-ai/prologue/pull/10)（基于已合入 main 的 P2a / P2b / P2c）。合同 `docs/slices/input-board-refs.md`，决策 I1–I15。板工具 `forInputs` / `inputs` 经引擎盖章（只认这一跑读到的输入）写进图的 `origins` / `report.inputs`；`acknowledge-inputs` 多 `board-node` / `todo` / `pending` 目标，绑定了节点的跑只能指绑定的那块板；`update-todo` 保住模型给的 id；`ask-user` 带 `about`、问题落定记 `pending-settled/expired/cancelled`，投影多 `questions`（账说不清的 `unresolved`）。证据：内存 Host 19 条、真实 Node Host 2 条（含 SIGKILL）、六份干净包消费者、12 个变异、SDK 全量 340 个文件 3 764 条通过。**未跑：真实 Provider、Molis 生产入口、用户实操。** Molis 一侧（`services/agent-inputs` 投影、界面）等 D7。同日按用户决定，R0 并入本交接 PR，#438 关闭。

- 2026-10-13（防腐复查）：合 main `fc18d5f62`（merge-base `fc18d5f62`，合并提交 `e7c2d6b38`，无冲突）后复查本线自己的 diff（27 个文件、`scripts/` 与 `tests/` 与 spec，不碰 `apps/`、`horizontal/`、`plugins/`、`packages/`）。**通过，无待修项。** M2 `check-health-gates.mjs --base origin/main` 通过（新文件最长 219 行，没有新的巨大单元；录制的两份 JSON 不在源码计数里）；M7 对本线 23 个文件 `biome lint` 0 诊断（`pnpm lint` 全仓的既有诊断里没有本线文件）；M10 `test-imports.mjs --check --chains` 分裂进程数 164，与 main 基线同（两个新测试文件都不在任何链里）；`pnpm boundary:check` 无错误；doc-citation、根目录白名单、翻译门禁在 health 里通过。人工项：测试走公开入口（只经 `scripts/input-receipts-slice/` 自己的模块与设计系统根入口 `packages/design-system/src/index.ts`，不进别的包内部）；没有新增包内部引用；`scripts/` 里的预览与录制件放法与 I0、W0 同；没有 `console`、`as unknown as`、空 `catch`；预览里的中文文案在 `scripts/` 内、不属于产品界面字典（翻译门禁 0 缺失）。唯一要留意：页面服务用相对路径从设计系统源码取部件（根入口，非内部文件），换包 PR 里与「现场投影」一起复核。
- 2026-10-13 晚（统筹，阶段 1 第一片）：D7 三项满足（#408 已合 main，过渡包带 S1–S3，默认路径在换包时验证过），阶段 1 开工。本片：
  - 1a 的第一处抽取：补充回执的投影从 `prologue-stream.ts` 的巨大函数 `applyPrologueEvent` 里搬到 `horizontal/agent-host/src/adapters/prologue-inputs.ts`，走 `HANDLERS` 表。
  - 1c 的「读到」直接用 SDK 事件（D17）：新增 `steer-read`、`steer-withdrawn`，一轮结束没读到记 `unread`。
  - 1b 的第一块合同：新子路径 `services/agent-inputs`，`AgentSteerControl` 带 `source`、`key`；`AgentRunControl` 的 steer 分支改为引用它，`agent-host.ts` 不加行。
  - 1c 的来源标记（D18）：宿主代写的补充交 SDK `app`，运行视图显示成 `notice`。
  - 1d 的第一处措辞：Coding 回执条与报告按 §3.3（「已送达」「已放进上下文，等 AI 回应」「AI 已读到」「这一轮结束时 AI 没读到」「已撤回」）。
  - 用例：新增 `tests/prologue-input-receipts.test.ts`（编号 AC-R1–R3，经包入口）；`prologue-recovery`、`coding-report-persistence` 的期望从 `unconfirmed` 改成 `unread`（D17 的预期变化）。
  - 还没做：阶段 1 的其余抽取（`assistant-inputs.ts`、`input-receipts-client.ts`）、键与同键重发、`RUN_NOT_RUNNING` 改排队、`runViewVersion`、恢复报告、助理侧（1e）、R0 现场投影（D19）。
- 2026-10-14（统筹，第一片的全量与合 main）：全量（`node scripts/run-tests.mjs`，`32c9364f`，约 113 分钟）6,240 条：6,226 通过、5 失败、9 跳过。5 条的归类：
  - `prologue-review-feedback` 两条（packed SDK 的审查反馈）：**预期变化**。宿主转告的拒绝意见按 D18 以 `host`（SDK `app`）交给 SDK，运行视图显示成 `notice`；它的回执在模型读到后从 `applied` 走到 `read`（D17）。断言改成找 `notice` 且回执到 `applied` 或 `read`（`c100dd8b`），不是放宽：顺序上 `read` 在 `applied` 之后。单独重跑通过。
  - `agent-action-selection.e2e` 一条：全量负载下的时序。本分支与干净基线（`fc18d5f6`）上单独重跑都通过。
  - `touch-targets.e2e` 两条：main 上已有的失败，与本线无关。
  - 合 main `2768dd71`（#491）后重新构建：相关用例 56/56（`prologue-stream`、`prologue-model-controls`、`prologue-input-receipts`、`prologue-review-feedback`、`prologue-recovery`、`coding-report-persistence`）；健康门禁对照 merge-base 通过；边界检查与页面资源通过。

- 2026-10-14（回执线会话，现状核对）：按 origin/main `393e8958` 的代码与用例逐项核对原始需求（§0 四问）与阶段 1–3 的验收。只读代码与跑过的用例；隔离 Home 实走见下一条。等级：「已实现」= 有代码且有用例；「部分」= 有一半或只有某个入口；「未做」= 没有代码。

  | 项（§11） | 状态 | 证据 / 缺什么 |
  | --- | --- | --- |
  | 1a 补充回执投影抽出 | 已实现 | `horizontal/agent-host/src/adapters/prologue-inputs.ts`（#409）；`tests/prologue-input-receipts.test.ts` AC-R1–R3 |
  | 1a `assistant-inputs.ts` | 未做 | 发送路由（回答 / 补充 / 开新轮）仍在 `AssistantService.dispatch` 与 `codingDispatch` 两处各写一份（`assistant-service.ts` 的 `freeTextQuestion`、`steerText`） |
  | 1a `input-receipts-client.ts` | 未做 | 回执条与补充发送仍在 Coding `client.ts` 主模板里 |
  | 1b 合同 `services/agent-inputs` | 部分 | `AgentSteerControl` 有 `source`、`key`；没有 `interrupt`、`about`；`control()` 返回 `void`，调用方拿不到输入编号与 `replayed` |
  | 1c 键与同键去重 | 部分 | `prologue.ts` 的 `control()` 把 `key` 交给 SDK（SDK S1 已去重）；但 Coding `run-inputs.ts` 的 `runControl` 与助理两处 steer 都不带键，所以页面断线重发仍会落两笔 |
  | 1c 宿主代写标来源（D18） | 已实现 | `prologue-node.ts` 的活动跑句柄以 `source: "app"` 转告（审查拒绝、会话来信、等待唤醒、任务图更新）；助理审查转告、Coding 改计划说明带 `source: "host"`；`prologue-stream.ts` 把 `app` 显示成 `notice`；`prologue-review-feedback` 用例 |
  | 1c 读到（D17） | 已实现 | SDK `steer-read`、`steer-withdrawn` 直接投影；一轮结束未读到记 `unread` |
  | 1c `RUN_NOT_RUNNING` 竞态 | 未做 | Coding 路由先读一次相位再发（`routes.ts` `coding.control-run`），读后到发之间的竞态仍抛错；助理把错误原样给页面。现用包已有 `session.queueInput`（S2） |
  | 1c `runViewVersion` 纳入输入状态 | 未做 | `capability-registration.ts` 的版本串不含任何 `steer.state`：早先一条补充从 `applied` 变 `read` 不改版本，页面要等别的变化才刷新 |
  | 1c 恢复报告「输入」一类 | 未做 | `AgentRecoveryReport` 只有跑、阻塞与操作 |
  | 1c 会话条目记录收下的输入 | 未做 | 等 W4-06（#498）拆完 `prologue-node.ts` 再接 |
  | 1d 措辞（§3.3） | 已实现 | Coding `client.ts` 回执条、`report.ts` 的 `STEER_WORDS`（#409） |
  | 1d 发送方式菜单（补充 / 打断 / 下一轮） | 未做 | 运行中只有一种发送（steer），合同没有 `interrupt` |
  | 1d 「发送中」气泡与同键重发 | 未做 | 发出后只在状态行写「补充要求已交给执行引擎」；失败只显示错误 |
  | 1d 宿主说明不显示成你的话 | 部分 | 转告是 `notice` 轮、不套用户气泡样式；但 `notice` 轮也挂了补充回执条（`steerOf` 只看 role），读着像你发的补充；没有「Molis 转告」的样式 |
  | 1d 「核对并继续」带上没读到的输入 | 未做 | `continuation.ts` 只从首条任务与宿主事实重建 |
  | 1d 计划轮次不写「已体现」 | 未做 | `plans.ts` 的 `planTask` 仍写「已体现在确认的计划里」 |
  | 1e 助理工作视图回执 | 未做 | `assistant-island.ts` 不读 `turn.steer`，只弹「已补充到正在进行的这一轮」 |
  | 1e 回答 / 补充由用户点选（D14） | 未做 | 仍按「恰好一条自由文本题、没带材料」自动当回答 |
  | 1e 重试键跨刷新保存 | 未做 | 页面的 `unsettled` 只在内存里；宿主的 `request_id` 去重只覆盖开新轮，补充不带键 |
  | 1e 补充原话按 person 记录（G13） | 未做 | 助理只为开新轮存 round |
  | 阶段 2（SDK S1–S4） | S1–S3 已在现用过渡包；S4 未进包 | 现用包 `interim-p1-cu-image` 里有 `queueInput`、`inputQueue`、`steer({interrupt,key,source,about})` 回 `SteerReceipt`；S4 等 P3 换包 |
  | 阶段 3（处理说明、关联、影响、纠正） | 未做 | 依赖 P3；D16 仍由采用线暂时隐藏 |

  对四问的回答程度：「被怎么处理」只答到送达、放进上下文、读到、没读到（Coding 有，助理没有）；「在哪里处理」「改变了什么」都没有；「还有什么没处理」只有 Coding 回执条上的「这一轮结束时 AI 没读到」，没有托盘、没有带到下一轮。

- 2026-10-14（回执线会话，**暂停点**；统筹按用户 10-14「当前任务完成后，先暂停需求的线，让防腐线先继续」叫停，整机让给防腐线）：
  - **已完成（都已推送，没有只在本地的东西）**：
    - 现状核对（上一条）。
    - 分支 `receipts/1a-extract`（基于 main `393e8958`）：1a 抽取，行为不变——助理两处发送路由合成 `apps/local-host/src/assistant/assistant-inputs.ts`；Coding 的回执条与补充发送搬到 `plugins/native/coding/src/input-receipts-client.ts`；Coding 页面脚本的四段注释移出模板，按源码算约 −470 字节。另一个提交修了一个现存缺陷：`coding.runs.control` 自 `ed5acdfe` 升到第 2 版后，助理的 Coding 执行者仍只找第 1 版，从助理给正在跑的 Coding 轮次补充或回答会报「这个项目还没有可用的 Coding 插件」；改为按动作写明版本，`tests/assistant-coding-executor.test.ts` 的替身改读 Coding 自己发布的版本，并加一条补充走到 `runs.control` 的用例。本地 `check-health-gates --base origin/main` 通过（巨大单元下降，已 `--update` 本地快查）；`tsc --noEmit` 只有旧 dist 带来的既有类型错，新文件无错。
    - 草稿分支 `receipts/1c-agent-host`（叠在 1a 上，WIP 提交）：合同 `AgentSteerControl` 加 `mode`（`next-boundary` / `interrupt` / `after-run`）与键的写法 `AGENT_INPUT_KEY_PATTERN`（与 SDK 的 SEGMENT 一致），`control()` 返回 `AgentSteerReceipt`（`input_id`、`replayed`、`delivered: run | queued`）；`prologue-inputs.ts` 的 `deliverSteer`：已结束或 `after-run` 进会话排队、`RUN_NOT_RUNNING` 用同一个键 `queueInput`；`prologue.ts` 接上（文件行数不变、类缩 2 行）；`runViewVersion` 纳入每条补充的状态；Coding `coding.runs.control` 升第 3 版（`key`、`mode`），路由对已结束的轮次放行补充并回传回执；助理用 `send.<request_id>` 作键、竞态时结果为 `queued`（合同 `AssistantSendResult.outcome` 加 `queued`，底栏提示「这一轮刚结束 · 已排到下一轮」，英文已加）。用例 `tests/agent-input-delivery.test.ts`（RC-02–RC-04）、`coding-run-control-contract`（RC-01）。
    - 草稿分支 `receipts/1d-coding`（叠在 1c 上，WIP 提交）：Coding 发送方式下拉（补充要求 / 打断并改向 / 这一轮结束后再做）；「发送中」气泡与同键重发（只有断网或回包读不出才算「没送到」，被拒的不留气泡）；宿主转告的 `notice` 轮不再挂补充回执条，改标「Molis 的说明，不是你发的话」并换样式；输入框 Esc 不再直接停止（D3），停止按钮去掉 Esc 提示；`plans.ts` 的规划补充不再写「已体现在确认的计划里」（RC-07，G14）。
  - **没验证的**：三条分支都**没有构建、没有跑任何用例**（构建锁一直被别的会话占着）；没有在隔离 Home 实走（准备了慢速替身模型脚本，未启动）；没开 PR。1c 还缺：`prologue-node*.ts` 一侧的接线（活动跑句柄 `steer` 要把 SDK 的回执交回、`createNodePort` 加 `queueInput`）——等 W4-06（#498）合入后在拆开的 `prologue-run.ts`、`prologue-node-port.ts` 里做；恢复报告的「输入」一类；`pnpm api:update`、`pnpm actions:update`；页面资源字节与巨大单元按 merge-base 复核。1d 还缺：「核对并继续」带上没读到的输入（要 1c 给 `agent.run.start` 加 `queued` 带入），以及三宽度与深色截图。1d 的界面字节没有量过。
  - **恢复时第一步**：在 `receipts/1a-extract` 上并入最新 main → 拿构建锁 `pnpm build` → 跑 `node scripts/affected-tests.mjs` 选出的 1a 定向用例（含 `assistant-coding-executor`、`coding-client-scripts`、`assistant-*`、Coding 浏览器用例，浏览器用例拿浏览器锁）→ `node scripts/gates/page-assets.mjs --update --base origin/main` 把 Coding 资源字节降到实测 → 在隔离 Home（`MOLIS_WORK_HOME=<临时目录>`、不用 4173/4207/4208 端口、慢速替身模型）把 Coding 与助理的补充回执各实走一遍，结果补进现状核对 → 开 1a PR。之后 1c 等 #498 合入、并入 main 再续写，1d 叠在 1c 之后。
- 2026-10-15（回执线会话，恢复，只做 1a；1c、1d 继续等 P3a）：
  - `receipts/1a-extract` 并入 main `e8218714`（#523 I8 整树、#489）；冲突按 main 的现行形状解：助理的错误改用 `assistantErrors`，两处发送仍只经 `assistant-inputs.ts`。
  - **Coding 的 `input-receipts-client.ts` 退出 1a，挪进 1d。** 宿主发页面脚本前用 esbuild 压空白与语法（`apps/local-host/src/served-page-text.ts` 的 `tightenServedJs`），模板里的注释本来就不下发；所以「注释移出模板约 −470 字节」是按源码量的，不对。按下发的字节量，抽成工厂反而多出包装：原样抽取 +229 字节，最省的写法（只抽回执条、补充发送留在原处）也 +46，`page-assets` 门禁对照 merge-base 不放行。1d 要给这个模块加发送方式、发送中气泡与重发，本来就得在 Coding 页面脚本里省出字节，抽取和省字节放在同一片里做。量法：取 `CODING_CLIENT_FACTORY_SCRIPT`，按 `tightenServedJs` 的选项压缩后比字节。
  - 验证：`pnpm build` 后跑 `node scripts/affected-tests.mjs` 选出的 82 个非浏览器文件，加 `coding-run-control-contract`、`assistant-image-restart-http`、`assistant-memory-error-model`、`assistant-undo`、`assistant-delegation`、`prologue-input-receipts`，全部通过（`install.test.ts` 第一次因只重建了 Coding 包、构建指纹落后而失败，整体重建后 22/22）。Coding 页面脚本与 main 相同，不选浏览器用例。`check-health-gates --base origin/main` 通过（`AssistantService` 1814 → 1796 行、112 → 110 个方法），`page-assets --base origin/main` 通过。
  - 隔离 Home 实走（临时 `MOLIS_WORK_HOME`、端口 4391、慢速替身模型 4392，每次回复流 20 秒）：① 助理自己的一轮进行中再发一句 → `outcome: steered`，替身模型下一次调用的最后一条 user 正是这句；助理页面仍没有回执条（1e）。② 把同一项工作「交给 Coding 继续」，Coding 一轮进行中从助理再发一句 → `outcome: steered`（main 上这条路报「这个项目还没有可用的 Coding 插件」），替身模型下一次调用收到这句；Coding 页面的这句下面先显示「已放进上下文，等 AI 回应」，这一轮结束后变「AI 已读到」。③ 一轮已经结束后再发的话开了新的一轮（`outcome: started`），与现行规则一致。
  - 防腐复查（统筹 10-15 起每个 PR 都要过，清单 `coordination/2026-10-13/ANTI-CORRUPTION-REVIEW.md`）：2026-10-15 · main `e8218714` · merge-base `e8218714` · **通过**。机器项 M1、M2、M4–M10、M15 全过，M14 不适用。人看 27 条里适用的都符合，逐条结论与依据写在 PR #531 的「防腐复查」一节。已修一项（第 1 条）：助理找 Coding 动作的版本改成逐个写明现行版本（`runs.control` 为 2，其余为 1），去掉「没写就当第 1 版」的默认值。暂缓一项：`codingDispatch` 回答 Coding 问题时的 `pending_revision ?? 1` 是 main 上已有的行为，1a 原样保留，归 1c（1c 本来就要改这条控制的合同）。

- 2026-10-15（回执线会话，1c 按 P3a 之后的 main 重做，本地未推送）：统筹看过对照清单（P3a 后要改的点）后定下：通道选 A；P3a 后的 1–8 条照做；助理下一轮带上排着的补充（Coding 的放 1d）；新底栏提示挪 1e，但 1c 不许把排队的说成「已补充」。新分支 `receipts/1c-send`（基于 main `7fe8ee65`，旧草稿 `receipts/1c-agent-host` 只作参考）：
  - 合同 `services/agent-inputs`：`AgentInputSend`、`AgentSteerReceipt`、`AgentInputsPort`、`AgentQueuedInputs`、`AGENT_STEER_MODES`、`AGENT_INPUT_KEY_PATTERN`、动作 `agentInputActions.send`；`agent-host.ts` 去掉 `AgentRunControl` 的 steer 分支，加 `AgentRuntimeAdapter.inputs` 与开始参数 `queued`，行数不变。
  - agent-host：`prologue-inputs.ts` 的 `deliverSteer` / `inputsPort`（已结束、`after-run`、`RUN_NOT_RUNNING` 进会话排队，排队前调 `beforeQueue` 复查授权）；`prologue.ts` 的 `case "steer"` 换成 `inputs` 字段，文件行数不变（968）；新文件 `session-actions.ts` 收等待与接续的两个动作和 `agent.inputs.send`，巨大函数 `registerAgentHostCapabilities` 变小；`prologue-node-port.ts` 的 `queueInput`、`prologue-run.ts` 交回 SDK 回执并把 `queued` 交给 SDK（这两处在交互线 H3 改的文件里，H3 合入后按它的形状再落）。
  - Coding：`runs.control` 第 3 版；补充经 `agent.inputs.send`，已结束的轮次也放行补充；改计划的说明同样经它（`routes.ts` 行数不变，W4-07 拆完后按新位置落）。
  - 助理：`RunningRoundPort` 拆成 `answer` 与 `send`；键 `send.<request_id>`；`queued` 结果；下一轮 `queued: "carry"`；`exactRevision` 去掉 `pending_revision ?? 1`（两处）。页面：三句提示合成一张表，`queued` 复用已有的「已保存，下一轮开始生效」；删掉没人用的 `cardHint`，工作台脚本比 main 小 28 字节（`page-assets.json` 已降）。
  - 验证：`pnpm build` 后定向 11 个文件全过（含新的 `agent-input-delivery` RC-02–RC-05、`coding-run-control-contract` RC-01、`assistant-coding-executor` 与 `assistant-delegation` RC-06）；健康门禁对照 merge-base 通过（巨大单元与 typed 能力位置变少，`baseline.json` 已更新）；`api:update`、`actions:update` 已刷新（`coding.runs.control` 2→3，新增 `agent.inputs.send.v1@1`，受众 plugin）；页面资源、边界、页面事件、测试引用检查通过。
  - 变基到 ac47ed78（#536，W3-A1）：只有 `baseline.json`、`page-assets.json` 两个生成文件冲突，取 main 的再整体构建、`--update`。#536 已删掉 `cardHint`，第三句提示的字节改由 `assistant-send.ts` 里三处 `a && a.b` 写成 `a?.b`（结果相同）抵掉，工作台脚本比 main 小 10 字节。`affected-tests` 选出的 218 个非浏览器文件：216 过，2 个是本片的预期变化——`coding-actions` 断言 `runs.control` 第 2 版（改为第 3 版，并断言第 1、2 版都已不在），`coding-plan-amend-http` 的替身拦的是旧的 `controlRun` 补充（改为登记 `agent.inputs.send`，并断言说明以 `host` 来源发出）；改后两个都过。
  - 还没做：恢复报告列出输入（读 SDK `inputQueue()`）；会话条目记录收下的输入——SDK 的输入记录已带键、来源，按一个事实一个主人不在 Molis 另存，待统筹确认后从 1c 清单删去；隔离 Home 实走。
  - 变基到 424256ef（H3 #546、W4-07 #549 合入后）：Coding `routes.ts` 已按资源拆开，原来的改动只搬到新位置——`coding.control-run` 在 `routes-sessions.ts`，`coding.plan-amendments` 在 `routes-timeline.ts`，别的不动。H3 改的是 `prologue-node-port.ts` 的 `answerPending`（缺版本的答案直接拒），本片加的 `queueInput` 在 `createNodePort`，文本不冲突，语义与助理这边删掉 `?? 1` 一致。门禁数字先取 main 的再整体构建、`--update --base origin/main` 重新生成，结果与变基前相同（工作台脚本比 main 小 10 字节；`PrologueAgentAdapter` 606 → 604 行，`registerAgentHostCapabilities` 385 → 372 行，typed 能力 192 → 190）。
  - 防腐复查：2026-10-15 · main `424256ef` · merge-base `424256ef` · **通过**（变基后 `affected-tests` 的 218 个非浏览器文件加 `security-invariants-object-references`，219 个全过）。机器项 M1–M10、M13–M15 已跑，M11、M12、M16 不适用；人看 27 条逐条结论与依据写在 PR 的「防腐复查」一节。各项决定照统筹 10-15 定的做：`agent.inputs.send@1`、不留兼容、`beforeEffect` → `assertAuthorityCurrent` → 排队前再查一次、措辞说真话。

- 2026-10-15（回执线会话，1d，变基到 #553 合入后的 main `2897ae04`）：1c #552 合入（main `2c91cd36`）后从最新 main 开 `receipts/1d`，照统筹 10-15 的几点做：
  - 恢复报告列出排着的输入（从 1c 挪来）：合同 `services/agent-inputs` 加 `AgentQueuedInput`（键、来源、哪一轮结束时没读到），`AgentRecoveryReport` 只加一行 `inputs?`；`prologue-recovery.ts` 读 SDK 会话的 `inputQueue()`，Molis 不另存（事实归 SDK 的输入记录）。Coding 恢复面板列出「下一轮开始时带上 N 条排着的补充」。
  - Coding 开新一轮带上排着的补充：`start-round.ts` 给 `agent.run.start` 传 `queued: "carry"`（D4：不自己开轮，人开的那一轮带上）。计划里补充的意见改说「没有逐条核对是否已写进计划」，不说已体现（G14）。
  - 发送方式与发送中气泡：Coding 的补充逻辑抽到 `input-receipts-client.ts`（发送方式、键、回执条、发送中气泡、同键重发），`client.ts` 变短（1643 → 1641 行）。一轮进行中输入框旁出现发送方式菜单（补充：这步做完后读 / 打断：丢弃当前回复 / 下一轮再做），用共同的 `mw-select`；每次发送后回到「补充」。没确认送到时字和方式留在输入框，气泡说「再按发送，同一条不会重复」，同字同方式沿用同一个键；宿主拒绝的清掉气泡。宿主发的说明显示为「Molis 的说明，不是你发的话」，不带回执。D3：输入框里按 Esc 不再停止这一轮，停止只用按钮。
  - 页面资源：`coding.js`（diff、files、git、text-stats 四个包与它逐字节相同）比 main 多 1751 字节、两份样式表各多 33 字节（删了确证没人用的 `cooperation-client` 两个字段、`subagent-cards-client` 的 `svg`、死规则 `.coding-composer-sep`，合并 h2–h4 规则之后的数字；多出的主要是中文文案）。统筹按用户 10-15 的口径（小而必需的增长按先例一次性放行）定 A，用户 10-15 在回执线会话里批准改门禁：`page-assets.mjs` 的 `APPROVED_CEILINGS` 在 #553 的三条后面加七条（键是 merge-base `2897ae04` 的确切字节，值是实测新大小，只用一次），`page-assets-budget` 补用例；合入后由防腐线删掉。
  - 验证：整体 `pnpm build` 后，`affected-tests` 选出的非浏览器文件加 `coding-input-receipts-client`、`prologue-recovery`、`page-assets-budget`，变基后 155 个全过；浏览器用例 `coding-input-receipts.e2e`（RC-10、RC-11、RC-13）过，截图三张在 `.impeccable/qa/review/ai-input-receipts/`（不入库）。`api:update` 刷新 `agent-host`、`agent-inputs` 两份快照；`actions:update` 无变化（`coding.runs.control` 仍是第 3 版，形状没变）。没做：隔离 Home 实走；被打断的那段回复仍留在页面上，没有标成已丢弃（另记）。
  - 防腐复查：2026-10-15 · main `2897ae04`（含 H4-1 #554、W3-B1 #553）· merge-base `2897ae04` · **通过**。机器项 M1、M2、M4、M5、M8–M10、M13 过；M6（第 19 条）按统筹定的 A 与用户批准的一次性放行过；M11、M12、M14、M16 不适用。人看 27 条：第 20 条按 Coding 页面脚本的现行写法（没有词典，`client.ts` 的回执文字原本就是中文字面量），没新建词典；第 21 条沿用页面已有的 `api`；第 25 条 `agent-host.ts` 只加一行；其余适用的都符合，逐条写在 PR 的「防腐复查」一节。

- 2026-10-16（回执线会话，1e，基于 main `cca71e02`，W3-A2 #573 已合）：统筹 10-15 批准方案（笔记夹 `receipts-1e-plan.md`），照做：
  - 宿主：`AssistantSendInput` 加 `target?: "answer" | "steer"`；`assistant-inputs.ts` 的 `deliver` 按它走，不带的一律是补充，去掉「一道自由文本题、没带材料就当回答」的自动判断；`target: "answer"` 而问题已不在等的以 `assistant.stale`（类别 `conflict`）拒绝，带材料的以 `assistant.invalid` 拒绝；HTTP 先拒 `answer`、`steer` 之外的值。G13：`typedWords` 从运行视图读本人的补充原话，记忆的「原话」与一轮结束交给学习的话都用它，`assistant-store.ts` 的 `typedTexts` 删掉；记忆工具读运行视图时取存储里最新的工作（第一轮开始前工具拿到的工作还没有会话编号，读不到）。`assistant-service.ts` 只就地改，行数不变（2080）。
  - 助理页面：回执工厂放在 `assistant-send.ts`（不新开文件，岛脚本少一行 import），`assistant-island.ts` 只就地接线（2276 行不变）。补充下面一行回执；问题还在等时写「已补充到这一轮；问题仍在等你回答」；目标芯片在底栏输入框里（复用 `assistant-executor` 的样式）；删掉「已补充到正在进行的这一轮」提示；重发键存 `molis.assistant.unsent`，读写都经页面已有的 `store`（try/catch）。
  - Coding：回执状态前进时在状态行说「你的补充：…」（第一次画不说）；打断生效时把正在写的那段回复变淡并写「这段回复已丢掉（你打断了它）」，只是页面状态；`client.ts` 只改一行（1641 行不变）。完整的标记作为 Prologue 需求记在 §6.1 第 9 项。没动 agent-host 的运行视图投影（SDK 没有这项事实，与 2a、P3c 不重叠）。
  - 验证：整体 `pnpm build`；`affected-tests` 的 204 个非浏览器文件加 `assistant-island-script`、`page-assets-budget`：204 过，`page-assets-budget` 因下面的字节增长失败；浏览器用例 `assistant-input-receipts.e2e`（RC-14–RC-16，新）、`coding-input-receipts.e2e`（加 RC-16）、`assistant-send-intent`、`assistant-stale-refresh`、`assistant-error-recovery`、`assistant-dock-ime`、`assistant-page-written`、`issue-clarification-page`、`coding-timeline`、`touch-targets` 全过。`check-health-gates --base origin/main` 通过；`api:update` 刷新 `services/assistant`；`actions:update` 无变化。截图三张在 `.impeccable/qa/review/ai-input-receipts/`（不入库）。
  - 页面资源（先抵后报）：抵掉的是删去的提示与它的英文、没人用的 `.assistant-materials` 选择器（回执条复用那条规则）。#584（Coding 的伴随插件借 Coding 的包，diff、files、git、text-stats 不再单发）合入后对 merge-base `cf954a0a` 实测还多：`workbench.js` +2145、`workbench.css` 与 `settings.css` 各 +136、`arrival.css` +112、`coding.js` +411，主要是新中文文案和它们的英文。用户 2026-10-16 批准「#584 合入后一次性放行」（统筹转达，在回执线会话里确认）：`page-assets.mjs` 按 1d 的写法恢复 `APPROVED_CEILINGS`，只有本片五条（键是 merge-base 的确切字节，值是实测新大小，只用一次），`page-assets-budget` 加本片的用例；下一次改这个门禁时删掉。
  - 没做：隔离 Home 实走（统筹在 W3-A2/1e 合入后一起走）；刷新后输入框里还是同一句时，状态行不另提示「上次没确认送到」（键照样沿用）；交给 Coding 执行的工作里的补充不算进「你说过」（D14c、RC-16 G13 说明）。回执条在 Coding 里画在气泡里面（1d），在助理里画在气泡下面，两处不一致；统筹 10-16 定：不挡合并，以后统一回执组件时再定一种。

- 2026-10-19（回执线会话，§10.28 评审跟进，基于 main `520db6d52`）：三条小修合成一片 3e-r，记录写在阶段 3e 下：本人标记的步骤（RCPT-366）；约定块的英文与整句（RCPT-367），并改名（D41）；角色越权的错误码（RCPT-365 加强）。按用户 10-19 定的轻测试：只构建改过的包和工作区，跑相关的非浏览器用例；浏览器验证记进 §12.6 待补。

## 17. 远端交接（2026-10-11，已取代）

> 已被开头的「交接（2026-10-20）」取代，原文在 git 历史里（`8b9df4e7a` 及以前）。

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
2. 在预览里另写一份投影——这是「用 UI 猜测或模拟状态代替真实 SDK 回执」，§3.6 第 1、2 条不许。
3. **（选这条）用真实 SDK 把事实录下来，预览只读录好的事实。** 在 Prologue S3 末端（`37427d09` 及以后）上用 SDK 自己的测试替身（内存 Host + 脚本模型）把 §8.1、§8.2 各一组场景真跑一遍，录下每一跑的事件账、`projectInputReceipts` 的输出、`session.inputQueue()` 的输出，连同来源（Prologue 提交、录制脚本、时间）一起写成 JSON 放进 `scripts/input-receipts-slice/recorded/`。预览启动时只读这些文件，不再计算任何状态。录制脚本 `scripts/input-receipts-slice/record.mts --sdk <已构建的 @prologue/sdk 目录>` 只在开发时手动跑，不进 CI、不进产品依赖。

选 3 的理由：事实全部出自真实 SDK（同一个投影函数、同一套账），不另写第二份状态机；不等 #408；S1/S2/S3 一次覆盖。代价：录下的是某个提交的输出，SDK 改了要重录——用一条检查兜住（每个录制文件带来源提交，界面上显示出来）。**换包的那个 PR（Molis 的 vendored SDK 含 S3 之后）里，预览改为现场调用 `projectInputReceipts` 与 `session.inputQueue()`，同一个 PR 删掉录好的投影文件**，只留事件账；不留两条路。

Molis 层的事实（L0「发送中」、页面代写来源、本人的纠正与关联记录、`call_id`）SDK 没有。预览里这几样由预览自己的状态给出，并在界面上标「Molis 层（模拟）」——它们本来就归 Molis agent-host 写，R0 只是先画出来；TaskBoard 步骤、产品对象、观察到的影响（S4 / 阶段 4）一律不画假数据，按 §3.4「没有事实的维度只显示 AI 的说法」。

交互动作（撤回、带到下一轮、纠正、打断）落到哪份事实：每个场景录成若干分支（例如「撤回」「不撤回」各录一跑），用户在预览里点哪个，就切到录好的哪一份；没录的分支按钮置灰并说明。不在页面里伪造事件。

### 18.3 页面上怎么标

- 页面顶部常驻一条：「预览：事件来自 Prologue `<提交>` 的真实 SDK 用脚本模型录下，不是真实运行；Molis 层为模拟」。
- 每条回执的「依据」写清事实来源：SDK 事件（带序号）、SDK 投影、会话排队、或「Molis 层（模拟）」。
- 不出现「已生效」：R0 没有 L4 回执。结论只到「AI 已读到 · AI 的理解：…」「说要做，还没完成」等，与 §3.3 措辞规则一致。

### 18.4 落点与边界

- 分支：R0 的代码并入本交接分支（PR #409）。2026-10-13 用户决定各线只在交接 PR 里提交（有防腐线在改代码质量与架构，另开 PR 容易与它的改动冲突），所以原先单开的 #438 已并入 #409 后关闭。文件：`scripts/preview-input-receipts.mts`（启动与路由，端口 4292）、`scripts/input-receipts-slice/*`（录制、读取、两种布局的渲染、浏览器端行为）、`tests/input-receipts-slice.test.ts`（非浏览器）、`tests/input-receipts-slice.e2e.test.ts`（浏览器，持 browser 锁跑）。
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

一个 PR（实际：先在 #438 做完，2026-10-13 按用户决定并入交接 PR #409，#438 关闭），内容按顺序：录制脚本与录好的事实 → 读取与展示状态的纯函数（附非浏览器用例）→ 两种布局的页面 → 浏览器端行为 → e2e 与走查记录。交互线 #423 合入 main 后，芯片的「写进问卷」占位改用它的部件（小改动，另起提交）。

### 18.8 实现记录（2026-10-12）

**落点（并入交接 PR #409；原 `feature/ai-input-receipts-r0` / #438 已关闭）。** `scripts/preview-input-receipts.mts` 起一个只读的内存服务（127.0.0.1:4292）；`scripts/input-receipts-slice/` 下：`record*.mts` 与 `record-child.mjs`（开发时手动跑，用 SDK 的内存 Host 和脚本模型真跑五个场景，录事件账、`projectInputReceipts` 输出与 `session.inputQueue()`，重启场景用被 SIGKILL 的子进程）、`recorded/{assistant,coding}.json`（两种体裁各一份，带来源提交）、`scene-state.ts`（把账投影成页面行、托盘、阶段，纯函数）、`ui-state.ts`（点击怎样移动游标或切到录好的分支，纯函数）、`headline.ts`/`labels.ts`（措辞规则：「读到」只给 read，「AI 的理解」只给模型的声明，不出现「已生效」）、`render*.ts`/`styles.ts`/`client.ts`（页面）。测试：`tests/input-receipts-slice.test.ts`（11 条，不开浏览器）、`tests/input-receipts-slice.e2e.test.ts`（10 条，真 Chrome，持 browser 锁）。

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

**证据三层分开记。** 浏览器用例在合入 main `05c46f67` 之后的末端（`ca8d2262`）持 browser 锁跑，10/10；**并入 #409 之后（2026-10-13）浏览器用例没在交接分支上重跑**：browser 锁被统筹的 Molis 全量回归占着，排队 40 分钟没等到；R0 的 `scripts/` 与 `tests/` 内容与跑过 10/10 的那份一致（合并只带进 main 的其他改动），单元用例 12 条与健康门禁在交接分支上通过。锁放开后补跑；`--base origin/main` 的健康门禁在同一末端通过。

- **工程通过（做了）：** 上表；`node scripts/check-health-gates.mjs --base origin/main` 通过；新文件 `biome lint` 0 诊断；用临时配置对新文件做了类型检查（仓库根 tsconfig 不含 `scripts/` 与 `tests/`）；`pnpm secrets:check`（`node scripts/check-secrets.mjs`）干净。
- **真实产品实操：** 不适用。预览不连 Home、不跑真实模型；开发者在内置浏览器里走查了主场景、被停下、问题、重启四个场景在 1440 / 1024 / 390 与浅深色下的样子，并在走查中发现并修了上面的 2、4。截图由 Chrome 用例按宽度与主题生成。
- **用户本人验收：** 未进行。给用户看实物时按 §12.4 的问法逐条答四问。

**没做 / 风险。** 「写进问卷」那一半仍是置灰占位（等问卷有自由文本题，归交互线）；录制绑定 Prologue `37427d09`，SDK 再改要重录（界面上显示了来源提交）；Molis 层（发送中、页面纠正）全是模拟；预览没有真实的「回执更新」，所以 RCPT-R0-07 里「更新时不跳」只覆盖了非回放重绘；全量回归未跑（统筹批量跑）。

**合 main 后复跑（2026-10-13，合并提交 `e7c2d6b38`，main `fc18d5f62`）。** 单元 `tests/input-receipts-slice.test.ts` 12/12 通过；浏览器 `tests/input-receipts-slice.e2e.test.ts` 10/10 通过（真 Chrome，持 browser 锁 `receipts-r0-e2e`，约 15 秒）。**有一处与常规做法不同，要如实写：** 当时整机唯一的 build 槽被另一个会话的全量回归占着（已持续一小时以上、还在跑），本线没有拿到槽，所以没有 `pnpm build`。本用例唯一需要构建产物的是 `@molis-ai/molis-work-test-kit/browser`（它只依赖 Node，没有别的包依赖），所以用与 `scripts/run-tests.mjs` 相同的参数与环境（隔离 Home、`NODE_ENV=test`、`--test-concurrency=1`）直接跑 `node --test`，仅多挂一个模块解析钩子，把这一个包名指到 `packages/test-kit/src/browser/index.ts`（同一份源码；不改任何断言、不改测试文件；钩子在会话临时目录里，不入库）。设计系统部件本来就是预览服务从源码取的。这个办法只适用于这一个文件，其他依赖构建产物的用例不能这样跑。失败 0，所以没有基线比对要做；main 带来的 `renderInteractionComposerTarget`、设计系统与助理面板的改动没有影响 R0 的断言。

## 19. 远端交接（2026-10-13，已取代）

> 已被开头的「交接（2026-10-20）」取代，原文在 git 历史里（`8b9df4e7a` 及以前）。

## 20. 有效要求跨摘要与续做保留（2026-10-15 补充，2026-10-16 已接受）

本节来自 Coding Harness 诊断及用户要求“用户纠正相关的缺口补进 Claude 现有需求，避免重复开发”。**需求与实现归属仍是本线 Claude**，补充阶段 1 的 Coding 摘要/续做接入和阶段 3 的“当前约定”；不新建纠正工作线，不重复 S1–S4，也不改变既有阶段的完成声明。优化总需求已随本次交接收录在 [Coding 与平台性能需求书](../coding-harness-optimization/spec.md)；总需求只引用本节验收。

### 20.1 问题与现有覆盖

§3.6 已要求输入不静默消失，§4.8 已覆盖未读/未完成输入恢复，§9.2 已有“当前约定”。这次补充的是：**一条已经读到、仍然适用的要求，不应因为已读或模型声称已处理，在后续上下文中消失。** 回执、保存历史、有效要求入模和实际遵循是不同证据，不能互相替代。

诊断基线：Molis 主检出 `9da180833` 的生产摘要函数实验中，同一轮第一条任务后加入六条补充，第一条补充未进入模型摘要材料；备用摘要没有执行中的补充。2026-10-15 对 `origin/main` 的 `f86a0895a` 及本线 `receipts/1d-coding` 的 `fe80cfe90` 复核，`plugins/native/coding/src/history-digest.ts` 仍使用 `added.slice(-5)`；`codingHistoryDigest` 经 `round` 只带首条任务、最终回答、文件及停止原因。SDK 一轮内的 compaction 保护不覆盖 App 另起摘要材料时丢掉的信息。以上是源码/函数证据，不冒充真实模型已经违反要求的产品复现。

### 20.2 行为与职责

- 持续有效的目标、范围、禁止项、验收要求与用户更正，在适用任务继续执行时仍进入上下文，保留可追溯的原输入引用。已读或已说明不使要求失效；一次已回答的问题不因此变成永久约束。
- “当前有效”沿用本需求的输入、关联、本人纠正和处理说明事实派生。模型说明仍是声明；不能凭摘要模型一句话删除、覆盖或提升为用户授权。不另建第二份输入状态表或约定账。
- 后续更正只替换其明确针对的范围，其余约束保留；原话留在历史，当前执行使用更正后的适用要求。不确定关联或矛盾无法从现有事实确定时显式澄清，不静默选一个版本。
- 模型摘要成功、失败转备用摘要、跨 Run/会话接续、宿主重启后核对继续，都遵循同一保留合同。原有未读输入的消费许可不改变：未获准带到下一轮的输入不能借“保留约束”偷偷入模；跨任务只带明确适用的要求，不把原任务全部历史带给另一任务。
- 预算不足不能静默裁去仍有效的要求。优先压缩可重读材料与非关键历史；仍装不下时明确报告无法满足当前上下文预算，保留原事实并提供调整/澄清入口。摘要失败不清空约定，也不凭旧摘要恢复已经被更正的内容。
- Prologue 提供输入身份、队列/消费权限、上下文压缩与续接的通用机制；Molis agent-host 投影和接入这些事实；Coding 修正摘要材料、备用摘要和 continuation 的消费路径。必要 SDK 扩展随原采用线协调，不在 Coding 私写新的压缩/输入引擎。
- 本节负责用户输入与有效要求；测试失败、命令退出、代码差异、未知副作用等客观执行事实由 Coding 的完成验证需求处理。两类信息可共同进入一次续做上下文，但不能把工具输出伪装成用户要求。

### 20.3 补充验收标准

以下 RCPT 编号属于本需求，其他需求只引用。全部为待实现/待验证，测试在名称或注释中写明编号。

| 编号 | 验收行为 | 证据 |
| --- | --- | --- |
| RCPT-101 | 同一轮至少六条补充，第一条仍适用且未被更正；模型摘要成功后继续，第一条与其他有效要求都在下一次实际请求中，带来源 | 调用生产摘要和 SDK/Host 请求路径，不能只断言历史库或页面里仍有文字 |
| RCPT-102 | 摘要超时、模型失败或结果不合格转备用摘要，保留与成功路径同一组有效要求；不能退回仅首条任务和最终答复 | 故障注入生产摘要接缝，检查后续请求；没有发出额外未授权模型调用 |
| RCPT-103 | 已读且已说明的约束跨多轮压缩、跨 Run 和宿主重启后仍适用；未读输入仍受原 carry 授权控制，重试不重复落账 | 真实 Node 进程中断/恢复＋可控模型；分别核对持久事实、请求和副作用 |
| RCPT-104 | 用户纠正某个范围后，旧版本不再作为该范围的当前要求；其他未改约束保留，原话可追溯；模型单方面说明不能替用户改要求 | 修改范围、部分替换、冲突待澄清及模型错误声明用例 |
| RCPT-105 | 从 Coding 页面、助理委派与核对继续入口接续同一工作，拿到相同的适用要求；无关任务与未获准消费的输入不会混入 | 真实公共动作/服务链路，比较实际入模上下文；不只测试输入投影函数 |
| RCPT-106 | 有效要求超过当前预算时不静默截断，不伪报已完整带入；调整预算或澄清范围后可恢复，原输入不丢 | 边界用例检查拒绝/待澄清状态、原记录及恢复后的请求 |
| RCPT-107 | 用户先要求完成代码任务，中途明确“不改公共接口/不改现有 fixture”，继续补充并触发摘要或备用摘要；后续实际改动遵守仍适用要求，或准确停在冲突处 | [人工] 隔离 Home、真实模型重复实操；工程入模正确与模型实际遵循分别记录，失败不得记通过 |

### 20.4 接续与验证安排

先在本线核对已有 SDK/输入事实可直接消费的接口，再修 Coding 的三个消费点：摘要材料、备用摘要、核对继续。阶段 3 的当前约定 UI 复用同一事实；不能等 UI 全做完才修已确认的丢失路径，也不为赶修复在插件新增独立状态表。

定向起点：`tests/coding-history-summary-http.test.ts`、`tests/prologue-input-receipts.test.ts` 与现有 Coding/助理恢复用例；新增断言必须走实际请求路径，测试数据须区分早期要求、后续更正及无关输入。涉及 SDK 时沿原采用线做公开入口、打包消费者与 Host 接入验证；整机构建/浏览器和全量安排遵守现有统筹。

证据状态（2026-10-15）：仅完成需求补充、当前实现核对与先前诊断实验；本节工程回归、真实产品实操和用户验收均未进行。Claude 现有工作状态、责任与未完成清单保持原含义。本补丁在总需求工作树与 Claude 当前工作树是同一路径的同一补充，集成时只合一次。

### 20.5 R1 实现记录（2026-10-16，RCPT-101/102）

- **「仍然有效」怎么推**：从各轮 run view 里带 `steer`（SDK 的输入记录）的 `user` 行推出，状态为 `applied` 或 `read` 的算，范围是会话的全部轮次（含上一次摘要之前的）。同一条补充被带进后一轮时按最新状态算、按首次发送排序。不另建表。
  - 不算：`withdrawn`；`unread` / `received`（它们由 SDK 的 `queued: "carry"` 带进下一轮，这里再列等于声称模型读过）；`notice`（宿主的话）；没有 `steer` 的 `user` 行（任务本身、材料包装、续做说明）。
- **写法**：一节「用户在执行中补充过、仍然有效的话（原话，按发送顺序；后面说的与前面冲突时以后说的为准）」，每条是「用户在第 N 轮补充（输入 <id>）：“原话”」。是本人原话的引用，不是宿主给模型的指令；冲突那一句是事实说明。按范围的纠正（RCPT-104）留给 3a 的「当前约定」。
- **放在哪**：`plugins/native/coding/src/history-digest.ts` 的三处用同一节：模型摘要材料（取代原来只留最后五条的那一行，排在各轮之前，裁剪碰不到）、模型摘要的宿主事实之后（模型摘要漏了也照样进下一次请求）、备用摘要（纯代码，不多调模型）。
- **预算**：这一节上限 16 000 字；超出时最早的让位，写明条数和输入 id，不悄悄丢；各轮内容先缩。
- **原来的缺口（2026-10-19 已补）**：页面代写、经助理交给 Coding 的补充，原来在 Coding 里记成本人的话（D14c），R1 会把它们也当作「用户补充」带进摘要。BL-144 让 `coding.runs.control` 第 7 版的补充带 `source`，这些话在 Coding 里记成 `notice`，R1 本来就不计入，R1 没有另绕（RCPT-368）。
- **证据**：`tests/coding-history-requirements.test.ts` 用 `tests/fixtures/coding-product-host.ts`（真 HTTP、目录、Agent Host、装好的 SDK，只拦 provider 的 `fetch`）跑两轮：第一轮扣住模型回复时发六条补充，读完后 compact，第二轮先摘要再开跑；断言落在第二轮真正发给 provider 的请求体上。RCPT-101 是模型摘要只提最后一条的情形；RCPT-102 是摘要调用被拒（400）与返回空两种，另核对 provider 请求数正好是一次摘要尝试加本轮自己的一次。`tests/coding-long-session.test.ts` 覆盖排除规则、跨轮最新状态与预算让位。真实模型与 RCPT-107 的人工实操未做。

## 混合补充原件接入（2026-10-23）

本片沿现补充输入主人保存受保护 HTTP 收到的本人原话；外层拼接 text 仍是唯一模型输入。附材、选区和宿主包装不变成本人正文，不拆中文标记。Host stamp 的 `use: supplement` 限定本次安装、确切外层动作及 `send.<input_id>`；缺省 stamp 仍只供初始输入，两个用途不能互借。无 stamp 的补充 Action 即使自报 person 也只按 host 收下，业务 schema 不收 original。`agent.inputs.send` 升 v3、`coding.runs.control` 升 v8，所有实际消费者同步。

可信 Host 在当前 Session/Run 归属及原调用检查通过后，才把 raw text 投影为 `source: host, original: {text, source: person}`；Adapter 映射 SDK app，正文、原件、key 一起进入现 InputBook/Run，不建 App 正文账。队列、重试、取消回队、carry 和重启沿原 inputId/acceptedAtMs；SDK 原件不会额外进入模型上下文。来源 Port 使用 raw 原件并复查当前撤回、Run 状态、安装、偏好及遗忘；旧记录不推断历史 stamp。

- MIX-IN-01：真实 Assistant HTTP 普通执行和 Coding 执行的附材/选区补充保留精确原话；实际模型仅收到原拼接 text，来源只收到 raw。
- MIX-IN-02：同 key 重试、排队/carry/重启沿同一 inputId 和首次时间；改原件拒绝；同源跨 Run 不增加独立证据，撤回拒绝形成。
- MIX-IN-03：无 stamp、伪 original/person、错用途/安装/Action、结束后复用、page/Host/peer 不成为本人来源；初始输入授权和取消/撤权零新输入保持。
