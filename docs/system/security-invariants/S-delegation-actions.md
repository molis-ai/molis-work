# S-delegation-actions

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-delegation-actions | 实际动作参数须与原 Run 固定的工作 epoch、当前唯一选择及原动作/目标 owner 同时相符；无法解析的有限声明和明确人审标记不能退回精确参数自动授权。只读写入直接拒绝；在 owner 等待后撤权的许可不能写 Pages。MCP 不通过动作精确范围避开连接身份。 | `horizontal/agent-host/src/delegation-actions.ts`；`horizontal/agent-host/src/delegations.ts` | `tests/security-invariants-delegation-actions.test.ts`「APR-08: declared unsupported」「APR-11/13: read-only writes」「APR-07/11: final control rejects」「APR-11/13: ongoing source」 | — |

`WorkDelegationStore.actionDecision` 只接可信适配器传入的原 `prepareActionReview` 控制及目标 owner 检查，不是开放动作。准备时复制实际 JSON，生成输入指纹；持久选择来自现有 owner。同一工作重开产生新 epoch，原轮不能补读新 epoch 继续；持续委托的来源也使用实际工作 epoch。动作效果沿公共 `actionEffect`，并同时要求 `operation=query` 才按读取处理，不额外改变原默认合同。

只读模式先拒绝写；明确人审对读取同样有效。目标 owner 检查只绑定已命中的对象委托，不影响原策略、普通读取和交给本人确认的提案；命中后目标失效会拒绝原许可，不能改绑新目标继续。新增用例「APR-08/11: target fences guard」验证这个边界。

新增用例使用实际 ActionService、Pages handler/SQLite 写事务及 WorkDelegationStore，证明范围匹配和等待后拒绝的文稿前后状态。存储端口用受控内存记录；真实加密存储另由 `tests/security-invariants-work-delegations-node.test.ts` 验证。原 SDK pending 来源写入、原 Run 使用登记、Host 目标解析和产品权限选择仍须接线，不能以本组判定用例宣称整个自动授权已可用。
