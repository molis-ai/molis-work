# BL-home-library-second-statement

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-home-library-second-statement | Home 里的库（插件的 Home 库、平台自己的几份）直接用 `node:sqlite` 的 `DatabaseSync`，不经项目库那层适配：一次给两句时，`node:sqlite` 只编译、只执行第一句，第二句悄悄丢掉，不报错。第二句从不编译、不执行，所以不是越权（S-91 的检查对象只有第一句），但插件写了两句只跑一句、没有任何提示。项目库的连接已经拒绝（`packages/storage/src/sqlite-statement-shape.ts` 的 `readSqlStatementShape`，一次一句、参数个数、命名参数）。修法是 Home 库的客户端在 `prepare` 之前用同一个扫描，拒绝的说法和项目库一样；改完把 `tests/sqlite-driver-conformance.test.ts` 里「SQLD-02 a library in the Home …」那条从「记录现状」改成断言拒绝 | [SQLite 第二步](../sqlite-driver-switch/spec.md) §3.3；#1959 实测 | 明确后续做 | 切换驱动那个 PR 只管项目库；Home 库这条路早于切换就存在，一起改会把 Home 库的客户端拉进同一个 PR | 无 | 中 | 存储（`packages/storage`）与插件平台（`apps/local-host` 的 Home 库客户端），执行会话待分配 |
