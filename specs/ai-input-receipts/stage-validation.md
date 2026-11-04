# 输入回执分阶段实施与验收对照

各子阶段的 RCPT 编号、绑定合同、定向测试与未覆盖项放在同一条记录中。产品验收方法见[主文 §12](spec.md#12-验收方法)。

[返回需求书](spec.md)

- [阶段 1：BL-144](#阶段-1bl-144)
- [平台投影与回答（3a–3b）](#平台投影与回答3a3b)
- [Coding 回执（3d）](#coding-回执3d)
- [助理约定和交付说明（3e）](#助理约定和交付说明3e)
- [阶段 4：S2-2](#阶段-4s2-2)

## 阶段 1：BL-144

**BL-144 实现记录（2026-10-19，补 D14c 的缺口；统筹 DISPATCH-1019-0710 第 6 项）：**

- **缺口。** 页面代写的话（交还浏览器的说明、插件交来的请求，助理按 `written_by: "page"` 收）交给正在跑的 Coding 一轮时，`coding.runs.control` 的补充没有 `source`，助理转给 Coding 的端口只好把它去掉，Coding 那边就记成本人的话：回执条照人的话画，R1 的摘要也把它当「用户补充」带走（§20.5）。
- **做法。** 合同 `services/agent-inputs` 加 `AGENT_INPUT_SOURCES`（`person`、`host`），`agent.inputs.send` 的 schema 与 Coding 补充分支的 schema 都从它取，只写一份。Coding 的补充分支多一个可选的 `source`，`runControl` 原样交给 `agent.inputs.send`；按 `docs/system/CONTRACT-CHANGES.md` 升到第 7 版，第 1～6 版解析不到。助理调 Coding 的客户端（`assistant-coding.ts`）钉第 7 版，`assistant-service.ts` 不再去掉 `source`。`host` 到运行时还是原来那条路：Agent Host 交给 SDK 的 `app` 来源，记成 `notice`，Coding 画成「Molis 的说明，不是你发的话」（RC-12），R1 不计入。本人的话照旧不带 `source`。
- **调用方。** `coding.runs.control` 只给本人（`user`），MCP 不暴露。固定版本的引用只有助理一处，同一个改动里改完。Coding 页面上人自己打的字照旧不带 `source`；但「重试这个子任务」（`plugins/native/coding/src/subagent-cards-client.ts`）是页面代写的话（拼进了上次的错误和模型写的分工），现在仍记成本人的话，这一片没修，记为 BL-182。
- **验收编号与证据：**
  - RCPT-368：`coding.runs.control` 第 7 版的补充收 `person`、`host` 两种来源，拒别的值、拒空串，也拒别的控制带来源；`runControl` 把来源原样交给 `agent.inputs.send`（`tests/coding-run-control-contract.test.ts`）。第 1～6 版解析不到（`tests/coding-actions.test.ts`）。页面代写、交给正在跑的 Coding 一轮的话带 `source: "host"` 到 Coding 的控制，本人的话不带（`tests/assistant-coding-executor.test.ts`）。

## 平台投影与回答（3a–3b）

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

## Coding 回执（3d）

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

## 助理约定和交付说明（3e）

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

## 阶段 4：S2-2

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
