# BL-test-suite-unification

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-test-suite-unification | 测试面没有跟产品代码一起统一：16 个测试文件仍保留自写 oracle；5 个升级／快照测试直接 import `packages/storage` 的 `openSqliteConnection`（`tests/npm-distribution-smoke.mjs`、`tests/runtime-payload.test.ts`、`tests/security-invariants-upgrade-snapshot.test.ts`、`tests/upgrade-chain.test.ts`、`tests/upgrade-snapshot.test.ts`），同一个函数与「测试走 test-kit」的表述有差，门禁不拦。P2 结论（用户 2026-11-08 定）：测试不要求换 SDK，现状由本 BL 承接 | 2026-11-08 审计（N4）＋第 02 批审计复核 P2 | 明确后续做 | 测试迁移不在第 02 批范围；测试直接 import 同一函数不违反硬约束，只是口径不一致，不必为此改产品代码 | 无 | 低 | 测试基础设施维护人（执行会话待分配） |
