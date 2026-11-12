# BL-golden-assertions-weak

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-golden-assertions-weak | UPG2-01 的前半「金样只经主人的动作和设置入口生成」没有直接断言：`tests/golden-home.test.ts:301` 只测了后半「真实 Home 与临时目录外拒绝」，生成侧（`scripts/golden/populate.mjs`、`scripts/golden/session.mjs`）没有门禁或测试证明没有绕过动作直接写 SQL/文件。另一处曾偏弱的 UPG2-05 已随 #1998 补上：`scripts/replay-golden-homes.mjs:238-239` 记录 `restart-structure`/`restart-read`，`tests/golden-home.test.ts:465` 断言这两个步骤确实跑过 | 第 05 批复核（2026-11-11 代码质量复审）；[金样回放设计](../upgrade-continuity/golden-replay-design.md) §7 | 已知缺口 | 要证明「只经主人动作」得给生成侧加一条静态检查（数据写入调用的白名单）或让每个写入点可断言，比回放断言重，且不影响当前回放正确性 | U2 金样；下一次改生成脚本时 | 中 | U2 金样（执行会话待分配） |
