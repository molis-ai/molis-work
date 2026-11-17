# S-memory-candidate-expiry

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-memory-candidate-expiry | 候选query不得写候选终态、版本、操作或账注。到期由原维护入口在当前授权和取消检查下结算，读取取消不能变成后台写入。候选独存的角色仅凭当前项目可信归属开放本人management的候选manage-read/delete，不因此开放正式记忆、认可/晋升或别项目、非本人访问；target/before各自核归属。 | `horizontal/memory/src/candidates.ts`、`horizontal/memory/src/service.ts`、`apps/local-host/src/memory/memory-runtime-policy.ts`、`apps/local-host/src/memory/memory-effect.ts` | `tests/security-invariants-memory-candidate-expiry.test.ts`「QEA-51/QEA-52」（真实SDK、只读动作、HTTP断连及维护取消）；`tests/memory-runtime-policy.test.ts`「QEA-52 · candidate-only character management」（真实角色候选及跨项目/模型/正式写入拒绝）；`tests/memory-retention-roundtrip.test.ts`「QEA-5」（到期读取无写、实际中断与重启恢复） | |
