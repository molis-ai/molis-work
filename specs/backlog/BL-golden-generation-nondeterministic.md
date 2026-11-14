# BL-golden-generation-nondeterministic

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-golden-generation-nondeterministic | 金样**生成**不逐字节确定：`tests/golden-home.test.ts` 的「同一提交生成两次给同样字节」与「慢机器同样字节」两条在 `origin/main` `1a3a3ae1f7` 的干净基线上都失败（Node 24.15、SQLite 3.51.3 的正确环境）。**回放**本身是好的：`node scripts/replay-golden-homes.mjs --all` 四份金样全过（各 476 次读、58 次写，第三方与 Home 库都回放）。 | 第 31 批核账（2026-11-12）；`tests/golden-home.test.ts`、`scripts/golden-home.mjs` | 未实现 | 要查出哪一处字节随生成时刻、机器快慢或本机状态变化（时间戳、随机列、SQLite 页序、目录顺序之一）；不挡本批「通过全部金样回放」，挡的是「金样可以随时重建」这一条 | 无 | 中 | C1／升级线（执行会话待分配） |
