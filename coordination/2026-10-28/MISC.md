# 零碎单

状态：现行。统筹记账（README 第 130–131 行）。PR 已经可合、只剩措辞或小改建议的，照合，建议记在这里；统筹每天收一次，攒成一份丙档的「零碎」任务。做进任务后删行。

| 来源 | 文件:行 | 要改的 | 记于 |
| --- | --- | --- | --- |
| T-007 二审 @924fe28ef 建议 1 | `specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md:713`（PR #1340 正文同句） | 「（多次恢复失败会进隔离）」与 Runtime 不符，改成：「恢复次数到上限（默认三次，成功的也算；安装、升级或显式解除隔离才清零）后再恢复就进隔离」。依据 `packages/plugin-runtime/src/index.ts:571-592`、`:262`、`:368` | 2026-10-28 |
| T-007 二审 @924fe28ef 登记 2 | `apps/local-host/src/project-plugin-enablement.ts:35-38` | 刷新关掉一个正在启动或恢复的插件时，`PluginRuntime.stop()` 在排锁前同步撤掉激活上下文（`index.ts:441-444`），监督器的 `revoke` 在插件忙时不排停止（`supervisor.ts:269`、`:285`）：在途启动可能拿着已撤销的上下文失败、记 `crashed`。main 上早就如此，不是 #1340 引入的；没复现，读代码得出。先查证再定修法 | 2026-10-28 |
