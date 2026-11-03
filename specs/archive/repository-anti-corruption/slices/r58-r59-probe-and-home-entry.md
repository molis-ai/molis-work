# R-58、R-59 Linux 探针分片与 Home 入口解析（ac-shell）

状态：执行中，2026-10-26，在 `claude/ac-shell-r58-r59`（从 `origin/main` 的 `2b3dc51de` 起）。用户 2026-10-26 弹窗定：R-59 选「入口先解析真实路径」，R-58 选「拆分片并装 uv」。不改合同、不改 SDK、不改动作。

验收编号：RAC-710～714、RAC-719（RAC-715～718 是 PG-053）。

## 1. R-59：经链接到达的 Home

W5-16 的离线 Home 快照与 `uninstall --purge-user-data` 把「存储路径等于它的真实路径」当作 S-11 的一部分（`snapshotFileStat`、`snapshotDirectoryInfo`、`inventorySnapshotStore`）。Home 自己的路径是各入口用 `path.resolve` 拼的，不解析链接：Home 的任何一级父目录是链接，purge 清单读不了安装库账本（报「快照文件不是稳定的普通文件，或带有链接」），快照也只在 `createHomeSnapshot` 里私自解析一次。

做法（用户 2026-10-26 定）：

- 解析只在一个函数里：`@molis-ai/molis-work-storage` 的 `resolveHomeDirectory(candidate)`（`packages/storage/src/adapters/local-security-paths.ts`）。存在的部分取 `realpath`，还不存在的部分接在最近的已存在祖先的真实路径后面。
- 入口都经它：`resolveMolisWorkHome()`（`MOLIS_WORK_HOME`、默认 `~/.molis-work`、宿主的作用域 `runWithMolisWorkHome`）和应用层的 `resolveConfiguredHome(explicit?)`（`apps/local-host/src/product-home.ts`；`--home`、宿主、快照、卸载、安装、项目目录、引导等十几处原来各自 `path.resolve(options.homeDirectory ?? …)`，现在都调它）。`createMolisWorkLocalHost` 与 Web 宿主也在启动时解析。
- 下游不再各自解析：`createHomeSnapshot` 里的 `realpathSync(Home)` 删掉；`cli-project.ts` 判断数据库是否在 Home 里时用同一个函数。
- 跨进程用 Home 算出来的标识（`actionGatewayHomeId`，宿主与 CLI、MCP 比较）也经同一个函数，否则宿主与客户端会给同一个链接 Home 算出两个 id。
- Home 内部不放松：Home 里的文件或目录是链接、硬链接、特殊文件，快照和清单照样拒绝（S-11 原有的拒绝，`tests/security-invariants-home-snapshot-inputs.test.ts`；本片在「Home 经链接到达」的条件下再断言一次，RAC-713）。

## 2. R-58：Linux 探针

手动跑的探针（run 40219623393）85 分钟的预算在最后 44 个文件开跑前就用完了，这 44 个文件是 `not-run`；`connector-managed-install` 的 ASC-06/17 在 runner 上没有 `uv`，`spawn uv ENOENT`。

- `scripts/ci-linux-probe.mjs` 加 `--shard <k>/<n>`：可运行的文件按排好序的名单轮流分给 n 个探针，各片相差至多一个文件；被排除的浏览器文件只在第 1 片报告一次，各片报告合起来每个文件恰好一次。分到的片里没有可跑的文件，退出 2，不当成跑完了。
- `.github/workflows/ci.yml` 的 `linux-probe` 作业改成 6 片的 matrix（`fail-fast: false`），每片装 uv（与 `full-suite.yml` 同一个固定的 action 提交和版本 `0.12.19`），产物名 `linux-probe-<k>`。1193 个可运行的文件每片约 200 个，原先一个作业 85 分钟里跑到约 1150 个。
- 不动别的作业，不放宽任何门禁；探针仍是 `continue-on-error`，仍不在 `verify` 的 needs 里。

## 3. 不在本片

- `connector-cli-setup.ts`、`connector-local-mcp-plan.ts` 里 `realpathSync(home)` 是连接器安装目录的算法，收到的 Home 不一定走过入口；它们不在快照与清除的路径上，没改。
- 进程内用 `path.resolve(home)` 做键的几个登记表（`home-side.ts`、`prologue-inference-host.ts`、`plugin-directory-service.ts` 等）拿到的 Home 来自入口，已经是真实路径；没改。
- macOS 上 `tmpdir()` 在 `/var` 下，而 `/var` 是 `/private/var` 的链接：单个测试文件的进程（`scripts/run-tests.mjs` 的单文件分支）把解析成真实路径的临时目录同时作为它的 `TMPDIR` 和测试 Home 的父目录交给子进程，测试里在 `tmpdir()` 下建的 Home 就和产品一样已经是真实路径（Linux 上两者相同，没有变化）。多个文件时每个文件由 `pool.mjs` 再起一个单文件的 `run-tests.mjs`，走同一条分支。

## 4. 验收

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| RAC-710 | Home 在一个函数里解析成真实路径：Home 的父目录是链接、Home 自己是链接、Home 或其父目录还不存在，都得到真实路径；宿主作用域把解析后的路径往下传 | `tests/security-invariants-home-entry.test.ts` |
| RAC-711 | 真实的 CLI `home snapshot --home <经链接的路径>` 成功，清单里的 `home_directory` 是真实路径 | 同上 |
| RAC-712 | 同样的 Home，装进来的插件库账本在场，`uninstall --purge-user-data` 能备好计划、确认后清除，计划里的 Home 是真实路径 | 同上 |
| RAC-713 | 同样的 Home，里面有一个链接：快照被拒（`host.home_snapshot.invalid`），不发布快照、不留暂存、链接指向的文件不动 | 同上 |
| RAC-714 | `--shard k/n`：每个可运行的文件恰好在一片里，各片相差至多一个，被排除的文件只在第 1 片，错误的写法退出 2 | `tests/ci-linux-probe.test.ts` |
| RAC-719 | `ci.yml` 的探针作业是 6 片的 matrix，除数与 matrix 一致，每片装与 `full-suite.yml` 同一个 uv，仍不挡合并 | 同上 |

## 5. R-59 解析失败的用户提示（I1，2026-10-25）

状态：Root 已派的非阻塞窄工单，I1 实现候选及作者定向验证完成，待固定 head 独立审验；唯一基点 `78abea0602238dcf01be823732b439f860d8b0ff`。接续[原评的错误信息建议](https://github.com/molis-ai/molis-work/pull/1308#issuecomment-6406465099)，不重开 R-58，也不改变原评无挡合并项的判断。原 ac-shell 工作树与在途 PR 已核，未发现同题写入；在独立 `feature/home-path-errors` 工作树实施，旧候选保持冻结。

同源基点构建下已真实复现 `EACCES` 与 `ELOOP`：CLI 的普通及 `--json` 调用最终都经 `dispatchCli` 显示英文系统错误，Web 启动显示原生错误堆栈，均退出 1。前者缺少处理建议，后者的失败位置可能只到循环的父链接，没有完整配置 Home。原行为已失败关闭，未建 Home、发布快照或留下暂存；本单只补用户能采取行动的信息。

只在共同 `resolveHomeDirectory` 捕获到这两个原生错误时，为原 `Error.message` 加上完整绝对配置路径、权限不足或符号链接循环/层级过多的原因、检查目录/父目录权限或路径中链接的建议，以及 `--home` / `MOLIS_WORK_HOME` 换到可访问目录的入口，并保留原系统消息。仍抛同一个原生错误，`code`、`path`、`syscall`、`errno`、`cause` 及原堆栈来源不换；既有 CLI/启动出口自然消费该消息。`--json` 对原生错误的现有纯文本 stderr 行为不变，不改为新结构化合同。`ENOENT` / `ENOTDIR` 的向上解析和正常 Home 的结果不变。

允许修改仅为共同解析器、原 `tests/security-invariants-home-entry.test.ts` 及本节。真实拒绝在自有临时目录制造：权限只改测试夹具并在清理时恢复；不得改真实 Home 权限、创建 Home、跟随错误继续业务、自动 chmod 或修链接。不开新 Error 子类/错误模型、公开导出、依赖、门禁、SDK、长期合同或全局缓存。作用域已有缓存；Root 本轮不实施热路径缓存或基准框架。

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| R59-ERROR-01 | 真实 `EACCES`、循环链接 `ELOOP` 下，共同解析器保留原系统诊断，CLI 与 Web 启动的显式 `--home` 和环境配置均显示完整 Home、不同原因及下一步；CLI 普通/原生错误 `--json` 和启动都退出 1。Home/快照/暂存不创建，原文件/权限/链接不变；宿主作用域不进入业务回调。 | 原 `tests/security-invariants-home-entry.test.ts` 增量拒绝用例，并保留 RAC-710～713 正向及内部链接拒绝。 |

验证仅点名上述入口文件与必要相关回归、health/boundary。基点原构建通过官方源码指纹匹配后只读复用做原入口复现；源码改完后按机器公共 FIFO 做必要构建，冻结后独立 REVIEW/TEST 复用同源产物，不跑 full、浏览器、Linux probe 或其它冻结候选。普通 feature push 已有授权，前置 fresh-fetch / secrets；固定 head 后直接交现有 REVIEW/TEST，I1 核收正式回执及原件后交 PIPE/Root并释放 writer。Memory/#734 保持暂停。

作者证据：唯一必要公共 FIFO 整体构建自然 0，官方源码指纹与本次 manifest 匹配；`security-invariants-home-entry` 6/6（原 RAC-710～713 和两类真实系统错误）、`home-snapshot-cli` 3/3、`storage-baseline` 2/2，三文件共 11/11、自然 0、零跳过。新增拒绝逐项检查实际 CLI/启动 stderr、退出 1、原系统诊断及无副作用，没有 mock EACCES 或 ELOOP。fixed78 health 和已构建树的包边界检查通过。未运行 full、浏览器或 Linux probe，也未声称用户本人验收；独立收据随固定候选交接。
