# S-surface-composition

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-surface-composition | 确定组合不能在父调用取消或读取权限撤销后交付对象值；整次截止会取消子读取，网关先返回超时不能使仍运行的提供方释放槽位，迟到结果不能恢复派发。最多四个真实在途读取；未完成读取不伪装成已确认的空内容。此行先覆盖组合服务端口上的拒绝；Host 身份、安装目录与签名插件的真实链路仍须分别接入并验证。 | `horizontal/surfaces/src/values.ts` 的 `startDeadline`、`readRuleValues`；`horizontal/surfaces/src/ports.ts` 的 `checkCurrent`；`horizontal/surfaces/src/composition.ts` 的 `compose` | `tests/security-invariants-surface-composition.test.ts`「one whole deadline cancels four real in-flight reads」「cancelling the parent rejects the call」「revoked authority prevents a completed value read」 | — |
