# S-automation-adoption

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-automation-adoption | 开启项目建议只以本人身份、从 Host 放进本人工作的建议卡运行：Agent 看不到也调不到，插件代办、委托调用、别的身份与项目对不上的调用均拒绝；页面放的操作卡按助理能用的能力核对，带 `runs_as` 也不能以本人身份运行；只接受该项目最近一张卡列出的建议，同一条既开启又不再提、别的项目的建议均拒绝，拒绝时不改任何技能；撤销只认本项目自己的开启记录。连接只准备，不在卡里建立账户。 | `apps/local-host/src/automation-adoption.ts`、`apps/local-host/src/assistant/assistant-offers.ts`、`apps/local-host/src/automation-proactive.ts`、`packages/contracts/src/services/automation-recommender.ts` | `tests/security-invariants-automation-adoption.test.ts`「S-automation-adoption」 | — |
