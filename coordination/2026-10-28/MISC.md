# 零碎单

状态：现行。统筹记账（README 第 130–131 行）。PR 已经可合、只剩措辞或小改建议的，照合，建议记在这里；统筹每天收一次，攒成一份丙档的「零碎」任务。做进任务后删行。

| 来源 | 文件:行 | 要改的 | 记于 |
| --- | --- | --- | --- |
| T-007 二审 @924fe28ef 建议 1 | `specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md:713`（PR #1340 正文同句） | 「（多次恢复失败会进隔离）」与 Runtime 不符，改成：「恢复次数到上限（默认三次，成功的也算；安装、升级或显式解除隔离才清零）后再恢复就进隔离」。依据 `packages/plugin-runtime/src/index.ts:571-592`、`:262`、`:368` | 2026-10-28 |
| T-007 二审 @924fe28ef 登记 2 | `apps/local-host/src/project-plugin-enablement.ts:35-38` | 刷新关掉一个正在启动或恢复的插件时，`PluginRuntime.stop()` 在排锁前同步撤掉激活上下文（`index.ts:441-444`），监督器的 `revoke` 在插件忙时不排停止（`supervisor.ts:269`、`:285`）：在途启动可能拿着已撤销的上下文失败、记 `crashed`。main 上早就如此，不是 #1340 引入的；没复现，读代码得出。先查证再定修法 | 2026-10-28 |
| T-004 二审 @b2ac90ba5 登记 2 | `tests/ci-product-subset.txt` | Feed 只有 `feed-sync-concurrency.test.ts` 在子集里；RAC-1214（调度器行为变化）、RAC-1215 所在的 `feed-inbox-lifecycle.test.ts`、`feed-runtime-plugin.test.ts` 在 PR 的 CI 上不跑，只靠【验证】和 Full。定要不要挪进子集：先看在 Linux 上稳不稳、快不快（AGENTS「几秒、Linux 上稳、走用户动线」） | 2026-10-28 |
| T-018 二审 @e77799332 登记 1 | `specs/repository-anti-corruption/slices/pg017-sandbox-services.md:109`、`specs/repository-anti-corruption/privileges.md:179`（PG-102）、可选 `slices/pg022-manifest-declarations.md:25` | BL-490 已做，三处「BL-490/491」改成只写 BL-491（pg022 那处可写「BL-490（已做）、BL-491」）。不改：`pg017-sandbox-services.md:210`（10-24 历史记录）、`slices/feed-inbox-runtime.md:117`（已注记）；`packages/plugin-sandbox/src/model.ts:23`、`services.ts:133` 的注释留给碰那两个文件的人 | 2026-10-28 |
| T-028 统筹答 | `tests/ci-product-subset.txt` | 加 `tests/feed-item-tags.test.ts`（T-028 新建，纯 node、离线、本机 3.6 s）。T-025 有条件锁着这个文件，所以没让 T-028 加；和 T-004 那两条一起加，加之前确认 T-025 已不再锁它 | 2026-10-28 |
