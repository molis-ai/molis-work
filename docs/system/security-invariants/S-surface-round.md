# S-surface-round

第 39 批的原轮 Surface 边界，设计见 [授权合同 §2.4–2.5](../../../specs/agent-approval/delegation-contract-design.md#24-surface-原轮绑定细化合同分项已合审sdk-最终释放已授权)。SDK 来源与同字节构建证据在 [vendor 记录](../../../vendor/prologue-sdk/README.md)。

本记录覆盖 Agent Host 的真实装配、SDK 原 target/effect/pending、审批与关闭，以及浏览器 CDP 和桌面 helper 的原轮派发。协议测试使用真实连接与持久记录，替代浏览器和桌面输入端；原生测试运行生产 Swift 输入与断连代码，捕获事件而不发送真实设备输入。这些工程证据不代表完整产品路径或用户体验已验收。

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-surface-round | 每次附着固定原轮的 context 与新 target，旧关闭不清理新轮；原轮已失效时，在进入 driver、完成原正文读取和审批展示/决定前拒绝，不读后来轮次补权限。完整输入、焦点或原节点无法核对的卡片只可拒绝，伪造本轮应用许可不落决定，已结束/过期等待不新建 pending 投影。停止保存失败不撤销原绑定；关闭失败不提前归还存储或把原未知写入改成成功 | `horizontal/agent-host/src/adapters/prologue-surface-binding.ts`、`horizontal/agent-host/src/adapters/prologue-surfaces.ts`、`horizontal/agent-host/src/adapters/prologue-surface-review.ts`、`horizontal/agent-host/src/adapters/prologue-surface-review-words.ts`、`horizontal/agent-host/src/adapters/prologue-review-documents.ts`、`horizontal/agent-host/src/adapters/prologue-approvals.ts`、`horizontal/agent-host/src/adapters/prologue-run.ts`、`horizontal/agent-host/src/adapters/prologue-node.ts` | `tests/security-invariants-surface-round.test.ts`「APR-11: each Surface round gets a new target」「APR-13 / BL-360: actual」「during approval」「APR-13: an otherwise approvable browser card refuses a forged app-this-round option」「APR-11: a dependent Git owner failing after Surface cleanup」；`tests/security-invariants-surface-close.test.ts`「APR-11: unknown original Surface」 | |
