# S-state-machine-transitions

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-state-machine-transitions | SDK 拒绝从未知状态或终态迁移、缺失规则和过期的比较交换。写入前复查调用授权，拒绝的调用不触发写入。状态与写入端口归各自的主人。 | `packages/plugin-sdk/src/state-machine.ts`、`packages/plugin-sdk/src/state-machine-declaration.ts` | `tests/security-invariants-state-machine-declarations.test.ts`「definitions check edges」「state changes keep CAS and the caller's authority」 | — |
