# S-automation-adoption

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-automation-adoption | 本人从当前项目的最新 Host 卡才能开启建议，从原工作中的回执撤销。Agent、页面代办、委托、过时卡、跨项目请求与冲突选择均拒绝。Host 绑定受保护的 Web 请求、项目与确切的动作输入，后续效果沿原请求检查权限和取消信号。获准的技能改动留下准确修订与撤销回执。后一步失败时，仍获授权的原请求按修订补偿，并撤销本次新建且尚未开始的授权请求。撤权或取消后保留已提交效果及回执，用户可用新的本人请求继续恢复。连接准备只保存授权请求。 | `apps/local-host/src/automation-adoption-authority.ts`、`apps/local-host/src/automation-adoption.ts`、`apps/local-host/src/assistant/assistant-offers.ts`、`apps/local-host/src/assistant/assistant-outcomes.ts`、`apps/local-host/src/agent-definitions/skill-setting-receipt.ts` | `tests/security-invariants-automation-adoption.test.ts`「S-automation-adoption」 | — |
