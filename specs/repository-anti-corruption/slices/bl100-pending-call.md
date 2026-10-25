# BL-100：结束与重放时按原审批事实识别未执行调用

状态：实现中。范围仅 #1304 FIRST 非阻塞第4项；基点 `4db89e26d6d5740e3002dfcfa868b40876385ded`。原 #1267 候选450继续冻结，Memory接续暂停。本项目标为工程修复与真实SDK协议回归，不宣称产品实操、组合全量或main采用完成。

## 证据与行为

原 `prologue-stream.ts` 的 `closeAwaitingApproval` 只检查等待数组非空，再把最后一个started活动写为“等待批准时这一轮结束，没有执行”。这并没有证明该活动属于待批effect。当前正式包 `prologue-sdk-0.0.0-rc.1-retry-waiting.tgz`（上游 `2c7feba5a6ea85e81e4a263671fb5e68f536d86a`）公开 `Effect.proposal.origin.toolCall` / `Pending.origin.toolCall`；`tool/core/invoke.js:originNow` 从引擎的ToolCallRequest.callId盖章，`effect-policy/core/chain.js` 将同一origin写入审批Pending。effect编号与tool call编号不是同一编号。origin只用于关联，不授予执行权；SDK明确允许toolCall缺失、重复，以及同指纹复用effect时保留原origin。

真实顺序也会使最后一个started不对应等待：`agent/core/loop-model-call.js` 先发一批tool-call，`loop-tools.js` 再逐项消费；safe-read前缀可提前派出。当前模型循环的写调用串行等审批，不以此限制底层公开Effect/Pending支持多笔来源的事实，也不将tool-call/started当成已派发证据。

最小修复沿已有awaiting_approval保留原引用的revision，并通过内部Runtime只读观察端口在关闭时现查原Effect/Pending：引用对应、session/run归属一致、原待批尚未回答且effect未派发，才返回原toolCall。stream只匹配唯一一个同call_id且仍started的活动；缺失或重复关联保持未知，已完成活动不重写。已回答或已派发而无结果的其它活动仍未知。实时结束与完整/不完整重放共用这条投影；不靠事件顺序、工具名字、等待数组或批准按钮推断执行。读取不重新打开Pending，不重派副作用。

## 范围与取舍

允许修改stream、直接传递这项事实的Runtime port / Node port / RunStore / adapter状态读取入口，原stream和必要recovery测试及本文。保持SDK/public contracts、包/provenance、Memory、预算、CI、共享BACKLOG不变。内部观察端口缺失时不能断言“没有执行”，保留unknown。已有返回和完成凭据优先；不新增并行账本、解码器或持久化状态。

## 验收与验证

- **BL-100 / 原因对应**：待批调用不是最后started、同时有另一缺结束凭据调用时，只标确切待批调用；多个待批逐个对应，不误改其它活动。测试用生产投影，关联与effect编号明确不同。
- **BL-100 / 诚实未知**：缺关联、重复call编号、已回答但无返回、已派发无返回、已完成均不能被误写成未执行；不能通过修改fixture编号制造关联。
- **BL-100 / 重放**：原协议事件与现行SDK Effect/Pending记录一起经过生产Node入口；取消前后、冷重启与不完整prefix恢复一致，无重新模型请求或写入。工程用本机模型协议替身和临时Home，不接真实模型/Home。
- **BL-100 / 验证有效性**：新反例在原实现上确实失败；修后跑原完整stream、必要recovery/approval-attachment及展示词回归。原断言、时限和执行证据不放宽。

命令：`pnpm install --frozen-lockfile --offline`；公共FIFO内按需构建；`node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/prologue-stream.test.ts tests/prologue-recovery.test.ts tests/prologue-approval-attachment.test.ts tests/assistant-tool-words.test.ts`；边界、严格test-imports、API、相对准确基点health、diff检查与fresh-fetch后的secrets。Root限定必要定向/回放，覆盖本改动的实际调用链，不扩跑所有Agent/Prologue文件、full或browser。失败先保留原件再定位，不机械重试。
