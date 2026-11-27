# BL-inbox-update-blocks-host

分组：7. 平台与架构

第50批本地结算：57文件607项、20项相关UI、构建与健康已过；最终增加collection请求断言的五样本亦过，其他工作树并发测试下p50=9,115ms，health在3–4/20条返回、最大事件循环延迟698–879ms。较空闲样本5,416ms与这次波动一并保留；最新main交集和准确头CI继续，本条尚不清除。

2026-11-17 审查第40/42/43/44/47/50批进展：平台按实际场景/依赖缩小目录读取，保留逐次授权；Inbox逐项之间让出事件循环；Storage复用严格结构比较，仍逐次读取版本和归属；单目标许可匹配不建立整名单索引。第50批再把后台Goal集合与不可见正文分开投影，平台提示和已应用游标各归原owner。固定规则20条建议五样本p50由前检查点14,127ms降到5,416ms，health在3–4/20条返回，最大事件循环延迟407–759ms；Inbox只重读一次，7–14次后台Goal请求均为collection。失败/取消/重试实际写入、隐藏输入、迟到选择及分栏恢复已有定向证据；最新57文件要求、性能断言复核和准确提交Full CI仍待结算。详见[QF-51追加](../quality-experience-audit/report.md)、[第50批](../quality-experience-audit/spec.md)。本条保留，不能用局部CPU下降、单次快样本或固定规则结果替代真实模型与最终CI验收。

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-inbox-update-blocks-host | Inbox「更新前 20 条建议」在规则固定返回、不调模型时，开发机上一次也要约 10 秒（5 个样本 p50 10.5 秒），期间宿主进程同步占满：CI 上测得事件循环连续忙 13～17 秒、空闲 0 毫秒，同一进程里的一切（其他请求、页面驱动）都等着。CPU 采样显示时间主要花在每条事项记录场景结果时整套重查动作：`plugins/native/inbox/src/scene-runtime.ts` 的 `record` → `apps/local-host` 的场景检查 `local-host-scenes`（`check`、`beforeConsume`）与 `local-host-availability` 的 `resolve` → `packages/kernel` 的 `action-service` `availability`/`discover`（约 34 秒 / 97 秒采样）→ 每个动作经 `plugin-install-records` 同步读 SQLite（`sqlite-connection` 的 `get`、`plainRow` 自身约 10 秒）。批 27 的性能书已记下「判断 POST 为何在 20 条固定结果下仍要数秒，留在空闲机上复测后再定」，本条是复测结果。**复现**：`node scripts/run-tests.mjs --jobs 1 tests/inbox-evaluate-reads.e2e.test.ts`，看诊断行 `BFP inbox update samples` 的 `notice`；加 `NODE_OPTIONS="--cpu-prof --cpu-prof-dir=<目录>"` 取采样，按调用方汇总 `action-service.js` 的 `availability`。CI 上的表现：这个用例在全量里每次都红（基线 run 43373326442 重跑才过，run 43380029353 两次都红），错误是 `CDP timeout: Runtime.callFunctionOn`，`cause` 里 `eventLoopIdleMs` 为 0。测试只断言读取次数与提示顺序，不断言耗时；不为它放宽测试的时限。同一段慢也让首页的 Inbox 卡难在截止内答完：在 1 秒截止下 `tests/home-offers.e2e.test.ts` 的 RAC-214 两次都红（Inbox 行 30 秒内连同「重试」都没出现）；#2044 把截止放宽到 3 秒后要再看一次全量 | #2046 的全量（`integration/full-suite-green-1113`）；[批 27 Feed 与 Inbox 性能](../visual-ui-experience/work-items/batch27-feed-inbox-performance/spec.md) | 已知缺口 | 不在测试一侧能修：要在一次更新里只查一次动作与授权（或按版本缓存安装记录），并决定是否把逐条记录移出同步路径；牵涉动作服务与场景检查，归平台 | 无 | 高 | 平台（动作服务）、Inbox |

## 2026-11-13 进展（14／27 收口 PR）

修了「一次检查里反复同步读安装记录」这一半：一次同步的授权或可用性检查现在是一次 directory pass，安装记录在检查内只读一次（`packages/kernel` 的 `assertCurrent`、`effectGuard`、注册表 `availability`、场景读回调检查；宿主 `localWebAuthority`），宿主依赖解析一次检查共用一份目录（`local-host-availability.ts`）。同一用例本机：读安装记录 145 万→30 万次（5 次更新），整次用例 CPU 47.9→43.4 秒，更新 p50 4.5→3.9 秒；`MOLIS_WORK_TEST_CPU_THROTTLE=3` 下通过，p50 6.2 秒。

还没做的另一半：每条事项的调用链里仍有约十次整目录 `discover`（`runScene` 的 `requireCompatible`、`beforeEffect` 里 `HostAvailability.check` 的依赖与 `usages`、`stageMetadataUsage`），一次 discover 要算全部动作的可用性。要么让一次更新共用一份目录快照（最后的同步授权检查仍每次现读），要么把逐条记录移出同步路径；两种都要动作服务主人定，不在收口 PR 里做。CI 全量上是否已不再红，看收口 PR 的全量。

## 2026-11-26 进展（`bl/f-scene-batch-discover` 平台窄查询与代际复用本地实测）

在独立工作树基于 `origin/main`（`82b9e61af4`）完成平台层窄查询与按「目录注册表代际 + 读取检查代际（安装记录/项目插件版本）」绑定的核验复用：
- `packages/kernel`：为 `CapabilityRegistry` 与 `ActionService` 增加单调递增 `directoryGeneration()`，提供单场景 O(1) `sceneViewOne` / `sceneBindingFunction` / `sceneBindingMatches`，对冻结 Schema 的 `actionSchemaAccepts` 与冻结 `allowed_actions` 的 `allowedAction` 做 `WeakMap` 复用，并将非 `subject-offers` 的 `stageMetadataUsage` 收窄为单能力查询；
- `apps/local-host`：在 `HostAvailability.check` 引入绑定 `(directoryGeneration, currentReadCheckGeneration)` 的 `VerifiedCheckPlan`（命中时仍对根动作、依赖动作与目标场景实时执行 `capabilities.availability`、`actionAvailability`、`sceneViewOne`、`sceneAvailability` 与 `sceneBindingMatches`，任何代际失效或不可用立即回退完整 `resolve`）；收窄 `local-host-scenes`（`check` / `runScene`）与 `PluginSceneService.registeredByThis` 的单场景查询，消除逐条 `usages` 与全场景扫描；预编译 `SqlitePluginRuntimeRepository` 与 `catalogDataStamp` SQLite 语句并在单次 directory pass 内共享安装列表；
- 安全围栏与回归：保留批处理步间 `setImmediate` 让出事件循环及每次写副作用前的同步 `assertCurrent` / `assertCurrentAuthority` / `beforeEffect`；在 `tests/inbox-action-scenes.test.ts` 新增批处理中途同步撤销权限与中途停用插件立即拒绝后续条目且零落库的回归断言。按顶部约定保留本文件，待开 PR 并在准确提交头上跑过 `full-suite` CI 后再统一销账删除。

| 指标（20 条固定规则 × 5 样本） | 改前（空闲） | 改后（空闲） | 改前（`CPU_THROTTLE=3`） | 改后（`CPU_THROTTLE=3`） |
| --- | --- | --- | --- | --- |
| `evaluate` 五样本 p50（含读页 p50） | 1,686 ms（2,067 ms） | 528 ms（728 ms） | 2,689 ms（3,214 ms） | 684 ms（842 ms） |
| 最大事件循环延迟范围 | 255～580 ms | 138～292 ms | 381～1,130 ms | 127～220 ms |
| `/health` 返回位置（第 N/20 条） | `[1, 1, 1, 1, 1]` | `[1, 1, 1, 1, 1]` | `[1, 1, 1, 1, 1]` | `[1, 1, 1, 1, 1]` |
| `ActionService.discover`（单样本 `evaluate` 中位 / 五样本总计；纯单次 POST 为 0） | 57 / 373 | 26 / 181 | 81 / 502 | 26 / 180 |
| `ActionService.discoverOne`（单样本 `evaluate` 中位 / 五样本总计） | 837 / 4,371 | 251 / 1,387 | 863 / 4,503 | 251 / 1,385 |
| `ActionService.discoverScenes`（单样本 `evaluate` 中位 / 五样本总计） | 305 / 1,564 | 23 / 150 | 307 / 1,574 | 23 / 150 |
| `ActionService.usages`（单样本 `evaluate` 中位 / 五样本总计） | 205 / 1,049 | 3 / 35 | 207 / 1,059 | 3 / 35 |
| `CapabilityRegistry.availability`（单样本 `evaluate` 中位 / 五样本总计） | 21,715 / 125,050 | 13,701 / 70,512 | 29,105 / 162,409 | 13,701 / 70,448 |
| `local-host-scenes` `checkActionAvailability` / `beforeConsume`（单样本） | 60 / 60 | 60 / 60 | 60 / 60 | 60 / 60 |
| 安装记录 `SqlitePluginRuntimeRepository.get`（单样本 `evaluate` 中位 / 五样本总计） | 27,414 / 163,091 | 11,294 / 90,845 | 30,405 / 186,952 | 11,294 / 90,607 |
| 安装记录 `SqlitePluginRuntimeRepository.list`（单样本 `evaluate` 中位 / 五样本总计） | 2,194 / 13,308 | 1,071 / 7,220 | 2,560 / 15,462 | 1,082 / 7,195 |
| SQLite `StatementSync.get` 总计（单样本 `evaluate` 中位 / 五样本总计） | 35,550 / 218,247 | 20,061 / 157,333 | 39,835 / 250,548 | 20,090 / 156,729 |

