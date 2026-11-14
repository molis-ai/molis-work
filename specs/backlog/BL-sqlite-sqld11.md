# BL-sqlite-sqld11

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-sqlite-sqld11 | SQLD-11：用官方 Node 24.15 打正式包并跑打包冒烟，核对 `.nvmrc`、CI 版本、`sqlite_version()` 与 `PLUGIN_STATEMENT_SQLITE_VERSION` 一致；现有打包冒烟只在本机 `tests/runtime-payload.test.ts` 跑过 | [SQLite 第二步 §6、§14](../sqlite-driver-switch/spec.md) | 待你验收 | 驱动切换已随 #1979、锁 Node 随 #1917 合入；正式包需要发布窗口，尚未打 | 无 | 中 | C1／存储与发布（执行会话待分配） |
