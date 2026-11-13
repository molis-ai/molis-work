# BL-golden-replay-red-main

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BL-golden-replay-red-main | 金样生成与回放在 main 上就是红的：`node scripts/replay-golden-homes.mjs --all` 在四份金样上都在 `goals.list@1` 报 `golden.action_not_offered`；`tests/golden-home.test.ts` 12 条失败（含「同一提交生成两次逐字节相同」「慢机器同样字节」「`check` 说得出哪张表不同」）。在干净基线 `origin/main` `b819373250` 上同样失败，与本批换包无关。 | 第 31 批核账（2026-11-12）；`tests/golden-home.test.ts`、`scripts/replay-golden-homes.mjs` | 未实现 | 先要查出是金样数据过期、宿主打开金样时插件没起来，还是本机环境（Node 24.14 低于 `>=24.15 <24.16` 的引擎要求）造成的；第 31 批「通过全部金样回放」的出口证据被它挡住 | 无 | 高 | C1／升级线（执行会话待分配） |
