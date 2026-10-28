# 零碎单

状态：现行。统筹记账（README 第 130–131 行）。PR 已经可合、只剩措辞或小改建议的，照合，建议记在这里；统筹每天收一次，攒成一份丙档的「零碎」任务。做进任务后删行。

| 来源 | 文件:行 | 要改的 | 记于 |
| --- | --- | --- | --- |
| T-031 二审 @4f322bff2 后续 1 | `specs/repository-anti-corruption/spec.md:2918` | T-031 合入后，`renderPluginRailAccountFooter` 这一句改成「已删（#1353）」；`specs/repository-cleanup/inventory.md:168-169` 里的两个名字一并改。先等 #1101、#1335 不再锁这个文件 | 2026-10-28 |
| T-032 【方案】问题 1 | `tests/installed-plugin-host.test.ts` | Runtime 在 `installed` 状态同样拒绝 `stop`（`packages/plugin-runtime/src/index.ts:496`），但活 Host 里找不到能稳定停在这个状态的办法，T-032 没补这条用例。造法已找到：Supervisor 仍 `running` 时 `runtime.stop(id, { preserve_enabled: true })` 一句就停在 `installed`（T-035 第 1 节）。T-034 合入后（它让不带 `preserve_enabled` 的停止对 `installed` 记 `disabled`），按这个造法补 Host 层的停用用例 | 2026-10-28 |
| T-020 【方案】@637cea31e | `apps/local-host/src/web-request.ts:230-240` 的 `goals` 改写；BL-386 | Goals 已经由 Plugin Runtime 监督器装配，BL-386 等的前提（S9）成立了，这一行可以开单：删旧地址改写，客户端改打插件前缀，`check-package-boundaries.mjs` 的 goals-command-owner 规则跟着改认新的挂载处。注释「Goals has no Runtime installation yet」已过时。实测：旧地址在撤权、卸载后答 `404 actions.missing`（不看安装状态，由 `local-host.ts:182` 拒），仍是拒绝，不是漏洞 | 2026-10-28 |
| T-036 起草 第 8 节 | `scripts/run-tests/pool.mjs:133-140`（`runFile`） | `--bail`（main、`task/*` 的 Full）下，文件重试通过时只留第二次的结果，第一次失败的输出不打印，main 与 task 分支上的偶发因此看不见原因，所有偶发计数都是下限。改法：重试通过时也把第一次的输出打印出来，或写进结尾的 flaky 列表。#1101（草稿）在改 `pool.mjs`，等它不再锁这个文件再开单 | 2026-10-28 |
| T-039 起草 | `docs/system/EXTENSION-POINTS.md:284` | 调度以外的五个入口文件还在，但里面搜不到 `newCallId`、`call_id`；实际新开调用编号的是 `apps/local-host/src/web-server.ts:122`、`mcp-request-lifetime.ts:35`、`assistant/assistant-authority.ts:55`、`agent-host-composition.ts:255`、`cli-project.ts:55`。核对后把这一句的文件名改成实际位置；同一行「60 处 `console.*` 在 10 个文件」也重量 | 2026-10-28 |
| T-039 起草 | `docs/system/GLOSSARY.md:415` | R-A5 里 `behavior_id`「31 个文件、23 个」、`*_BEHAVIOR_ID`「5 个、3 个」两组数的口径没记下；起草时按 `git grep -l … ':!*.md' ':!tests'` 再加 `-- tests` 量到 40 与 29、8 与 6。先定口径、写进那一格，再改数 | 2026-10-28 |
| T-040 起草 | `apps/workbench/src/immersive-shell.ts` 的 `renderAccountGlobalItems`、`personalIsland` 参数和对应 CSS | `renderAccountGlobalItems` 在 T-040 之后没有生产调用方，只剩 `tests/plugin-market-catalog.test.ts:4`、`:36`；`personalIsland` 生产两处都传 `""`，只有 `tests/characters-appearance.test.ts:52` 传非空。等 T-040 合入再开单 | 2026-10-28 |
| T-044 起草 | `specs/post-anticorruption-roadmap/spec.md:181` | 这一行提到 BL-393。T-044 合入、BL-393 删行后，这一句改成已做完（#1324 在改这份文件，等它不再锁再改） | 2026-10-28 |
| T-046 起草 | `apps/local-host/src/connector-local-actions.ts:39-42` | `connectors.local.cleanup@1` 按 `installation_id` 删受管理安装，不核谁装的；对象是安装不是请求，T-046 不做。统筹查它的受众和调用者，再定要不要另开任务 | 2026-10-28 |
