# S-delegation-actions

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-delegation-actions | 实际动作参数须与原轮次固定的工作世代、当前选择及原动作与目标的主人相符。无法解析的有限声明和明确人审标记禁止自动授权；只读方式拒绝写入。本人才能授予，旧候选无法覆盖已保存的选择。Pages 拒绝越界和写前已撤销的操作。MCP 的连接身份另由其主人核对。 | `horizontal/agent-host/src/delegation-actions.ts`；`horizontal/agent-host/src/delegations.ts`；`horizontal/agent-host/src/adapters/prologue-action-reviews.ts`；`apps/local-host/src/assistant/assistant-delegation-actions.ts`；`apps/local-host/src/assistant/assistant-action-delegation.ts` | `tests/security-invariants-delegation-actions.test.ts`「APR-08: declared unsupported」「APR-11/13: read-only writes」「APR-07/11: final control rejects」「APR-11/13: ongoing source」；`tests/security-invariants-assistant-pages-permissions.test.ts`「the selected Pages scope survives rounds and restart」「a saved delegation withdrawn while the real Pages write waits」「stopping the original work closes its permission across restart」 | — |

`WorkDelegationStore.actionDecision` 只接可信适配器传入的原 `prepareActionReview` 控制及目标 owner 检查，不是开放动作。准备时复制实际 JSON，生成输入指纹；持久选择来自现有 owner。同一工作重开产生新 epoch，原轮不能补读新 epoch 继续；持续委托的来源也使用实际工作 epoch。动作效果沿公共 `actionEffect`，并同时要求 `operation=query` 才按读取处理，不额外改变原默认合同。

只读模式先拒绝写；明确人审对读取同样有效。目标 owner 检查只绑定已命中的对象委托，不影响原策略、普通读取和交给本人确认的提案；命中后目标失效会拒绝原许可，不能改绑新目标继续。新增用例「APR-08/11: target fences guard」验证这个边界。

第一组用例经实际 ActionService 和 Pages SQLite 事务验证范围与拒绝；委托存储端口用受控内存记录。助理用例在临时 Home 走登记的权限动作、实际 Prologue 待批、可信来源保存和 Pages 写事务，并核对重启后的同一授权、越界待审和写前撤销的全部业务行。模型响应由测试固定。界面体验与本人验收在整批交付时验证。

同一用例文件还核对停止时拒绝迟到的原问题回答、撤销后用当前授权版本重试收口并拒绝旧版本和 Agent 调用、敏感精确参数不进入候选，以及原可撤销策略通过同一个 SDK effect 保存来源后才允许 Todo 写入。重启后读回原策略记录。工作管理的撤销结果区分授权已经失效与原停止回执待核对。
