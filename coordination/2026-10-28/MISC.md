# 零碎单

状态：现行。统筹记账（README 第 130–131 行）。PR 已经可合、只剩措辞或小改建议的，照合，建议记在这里；统筹每天收一次，攒成一份丙档的「零碎」任务。做进任务后删行。

| 来源 | 文件:行 | 要改的 | 记于 |
| --- | --- | --- | --- |
| T-007 二审 @924fe28ef 建议 1 | `specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md:713`（PR #1340 正文同句） | 「（多次恢复失败会进隔离）」与 Runtime 不符，改成：「恢复次数到上限（默认三次，成功的也算；安装、升级或显式解除隔离才清零）后再恢复就进隔离」。依据 `packages/plugin-runtime/src/index.ts:571-592`、`:262`、`:368` | 2026-10-28 |
| T-007 二审 @924fe28ef 登记 2 | `apps/local-host/src/project-plugin-enablement.ts:35-38` | 刷新关掉一个正在启动或恢复的插件时，`PluginRuntime.stop()` 在排锁前同步撤掉激活上下文（`index.ts:441-444`），监督器的 `revoke` 在插件忙时不排停止（`supervisor.ts:269`、`:285`）：在途启动可能拿着已撤销的上下文失败、记 `crashed`。main 上早就如此，不是 #1340 引入的；没复现，读代码得出。先查证再定修法 | 2026-10-28 |
| T-004 二审 @b2ac90ba5 登记 2 | `tests/ci-product-subset.txt` | Feed 只有 `feed-sync-concurrency.test.ts` 在子集里；RAC-1214（调度器行为变化）、RAC-1215 所在的 `feed-inbox-lifecycle.test.ts`、`feed-runtime-plugin.test.ts` 在 PR 的 CI 上不跑，只靠【验证】和 Full。定要不要挪进子集：先看在 Linux 上稳不稳、快不快（AGENTS「几秒、Linux 上稳、走用户动线」） | 2026-10-28 |
| T-018 二审 @e77799332 登记 1 | `specs/repository-anti-corruption/slices/pg017-sandbox-services.md:109`、`specs/repository-anti-corruption/privileges.md:179`（PG-102）、可选 `slices/pg022-manifest-declarations.md:25` | BL-490 已做，三处「BL-490/491」改成只写 BL-491（pg022 那处可写「BL-490（已做）、BL-491」）。不改：`pg017-sandbox-services.md:210`（10-24 历史记录）、`slices/feed-inbox-runtime.md:117`（已注记）；`packages/plugin-sandbox/src/model.ts:23`、`services.ts:133` 的注释留给碰那两个文件的人 | 2026-10-28 |
| T-028 统筹答 | `tests/ci-product-subset.txt` | 加 `tests/feed-item-tags.test.ts`（T-028 新建，纯 node、离线、本机 3.6 s）。T-025 有条件锁着这个文件，所以没让 T-028 加；和 T-004 那两条一起加，加之前确认 T-025 已不再锁它 | 2026-10-28 |
| T-029 二审 @652a95764 登记 1 | `docs/platform/PLUGIN-PLATFORM.md:138` | 「预览 8 个插件」改成「预览 6 个插件加 2 个宿主生产方」：6 个插件是 coding、dataset、feed、form、pages、ppt；2 个宿主生产方是 `artifact-type-registry.ts:67` 的 `HOST_ARTIFACT_PRODUCERS`。改之前自己再数一遍这 6 个 | 2026-10-28 |
| T-029 二审 @652a95764 登记 2 | `specs/BACKLOG.md` BL-132 | 已经做完（#1307，`artifactProducerSources()` 在 `artifact-type-registry.ts:134-147`），这一行还写着「已知缺口」。先确认行里没有没做完的部分，再删 | 2026-10-28 |
| T-029 交接 遗漏 1 | `docs/system/GLOSSARY.md:415` | R-A5 里的 `FunctionAuthoringBehavior` 已经失效；等 T-024（`:411`）合入以后再改 | 2026-10-28 |
| T-029 交接 遗漏 2 | `docs/system/EXTENSION-POINTS.md:193` | 「grok-build 11 个文件」「opencode 15 个文件，8 个包」：按不含测试的搜法现在是 12 和 15，先定按哪种搜法数，再改数字 | 2026-10-28 |
| T-029 交接 遗漏 3 | `docs/system/EXTENSION-POINTS.md:284` | `schedule-task-runner.ts` 已经在 #1018 删了，要找到替代它的文件，或者删掉这一句 | 2026-10-28 |
| T-029 交接 遗漏 4 | `tests/security-invariants-route-grants.test.ts:3` | 注释里还提 `HOST_OWNER_PERMISSIONS`。这是安全不变量测试，只改注释，不动断言 | 2026-10-28 |
| T-031 二审 @4f322bff2 后续 1 | `specs/repository-anti-corruption/spec.md:2918` | T-031 合入后，`renderPluginRailAccountFooter` 这一句改成「已删（#1353）」；`specs/repository-cleanup/inventory.md:168-169` 里的两个名字一并改。先等 #1101、#1335 不再锁这个文件 | 2026-10-28 |
| T-031 二审 @4f322bff2 后续 2 | `apps/workbench/src/i18n/gap-en.ts:54` | T-031 合入后 `"Dock 与插件"` 没人用了；先 grep 确认，再删这一条 | 2026-10-28 |
| T-031 二审 @4f322bff2 后续 3 | `apps/workbench/src/immersive-shell.ts` 的 `accountFooter` 参数 | T-031 删了唯一的调用方，参数已经没人传；等 T-006（#1348，锁着这个文件）合入后再删 | 2026-10-28 |
| T-032 【方案】问题 1 | `tests/installed-plugin-host.test.ts` | Runtime 在 `installed` 状态同样拒绝 `stop`（`packages/plugin-runtime/src/index.ts:496`），但活 Host 里找不到能稳定停在这个状态的办法，T-032 没补这条用例。找到造法再补 | 2026-10-28 |
