# Molis Work 代码修复交接给 Grok

交接日期：2026-09-22。仓库：`/Users/oreal/adeptify-home/repos/molis-work`。接手对象：Grok。

## 目标与当前结论

请修复下列 **10 项已确认问题：9 项逻辑问题、1 项安装打包阻塞**，再补齐可局部完成的边界门禁缺口。优先保护用户正文、有效授权、Goal 状态和宿主恢复。沿现有 owner 与调用链做最小完整修复，保留现有功能和未提交成果。

此前审查已完成源码追踪、独立复现及工程检查；只清理了 3 个文件的 31 行冗余代码，**下列 10 项问题尚未由审查 Agent 修复**。本轮用户要求“写一个 handoff，我让 grok 来修”，因此本轮只新增本文，没有继续修改业务源码。

这份交接可独立阅读；复现脚本和原始日志位于本机仓库外，位置见文末。所有定位行号都是审查时线索，接手时按函数名和当前实现重新核对。若当前问题已被并行工作修好，补齐验证并记录证据，不重复覆盖。

## 接手前保护边界

- 交接时分支为 `main`，HEAD 为 `f25ea171271ce3cfb417e19621de90194141fafd`。接手先重读 `git status --short`、当前 HEAD 和相关 diff。
- 工作树已有大量未提交改动，覆盖 Feed → Inbox → Pages、Pages 导入、Functions、工作台、Contracts、文档和依赖清单；也有未跟踪源码。这些是当前实现的一部分，不能只看 HEAD 或从 HEAD 恢复文件。
- 本次审查的源码改动仅为下文“已完成的清理”三处。其余已有改动不归本次审查所有。不要 reset、clean、整文件覆盖、全量暂存，或把别人的改动混进自己的修复说明。
- 交接范围是本地代码修复与验证。本文不授予提交、推送、合并、发布、覆盖安装用户 App、调用付费模型、向第三方发送内容或改写用户数据的权限。
- 验证使用独立临时 home、SQLite 或代表性 fixture。并行预览可能依赖当前 `dist`；构建前核对运行方，必要时用包含当前未提交源码的隔离副本。只复制 HEAD 的 worktree 不包含这些改动。
- [UI 修复交接](/Users/oreal/adeptify-home/repos/molis-work/docs/ui-audit-handoff-2026-09-22.md) 是另一份审计，编号与本文无关。修改 Pages/Workbench 前核对文件是否正在被该任务修改；不自动把那份任务并入本文。

先读唯一事实源：[SSOT-MATRIX](/Users/oreal/adeptify-home/repos/molis-work/docs/SSOT-MATRIX.md)、[ARCHITECTURE](/Users/oreal/adeptify-home/repos/molis-work/docs/system/ARCHITECTURE.md)、[PACKAGE-BOUNDARIES](/Users/oreal/adeptify-home/repos/molis-work/docs/system/PACKAGE-BOUNDARIES.md)、[HUGE-CLASS-MIGRATION](/Users/oreal/adeptify-home/repos/molis-work/docs/system/HUGE-CLASS-MIGRATION.md)。随后按修复对象读 `specs/goal-event-workflow-cleanup/spec.md`、`specs/plugin-platform-v2/spec.md`、`specs/pages-plugin/spec.md`、`specs/schedule-plugin/spec.md`、`specs/coding-plugin/spec.md` 及对应当前 Contract。

## 修复顺序与责任

| 顺序 | 问题 | 放置与依赖 |
| --- | --- | --- |
| 首先 | C01 正文丢失/串写；C02 旧授权复用 | Pages 客户端与 Goals owner 可独立修复；均需先补可失败的行为回归 |
| 随后 | C03 完成重评；C04 重启恢复；C10 安装阻塞 | C03 与 C02 同属 Goals；C04 属 Plugin Runtime；C10 完成后才能证明最终分发物可安装 |
| 合并相关改动 | C05 保存失败仍发布；C06 项目错写 | 与 C01 共用 Pages 保存/发布链，应由同一写入方协调；C06 同时检查 Host 与 publisher |
| 独立处理 | C07 Scheduler；C08 CLI 续接；C09 revoke | 分别在 Scheduler、Agent Host adapter、Plugin Supervisor 内处理；C09 与 C04 一起复查生命周期 |
| 最后收口 | B01 Repository 出口；B02 边界门禁；回归分类 | B01 先查兼容 caller 再改公开面；B02 补反例与扫描器测试，不做整体架构迁移 |

当前主链为：**入口适配 → Host 装配 → Native Plugin 用例 → Module owner → Repository**。Goal 完成由 Goals 决定，可信决定由 Governance 记录，Artifact 版本由 Artifacts 管理，技术调度由 Scheduler 管理。复用现有能力，不新增无现实需要的 Manager、Service、Coordinator，不按文件长度机械拆类，也不删除仍有生产 caller 的兼容门面。

## C01 · P1 · Pages 快速切换丢稿，旧保存响应导致跨文档覆盖

**触发与证据：** A 编辑后不足 400ms 就切到 B，`fillEditor` 清除 A 的保存定时器，保存次数为 0。另一条链是：A 保存已发出 → 切 B → A 响应返回 → 当前 `selected` 被改回 A，但编辑器仍显示 B → 下一次请求把 `B content` 发到 `/api/plugins/pages/A`。

**位置：** `plugins/native/pages/src/client.ts`：`onOpenPage` 约 389–391；`fillEditor` 约 407；`save` 约 447–456；`queueSave` 约 458；列表切换约 664–667。两个切换入口直接 `fillEditor`，保存响应无条件 `remember(payload.document, false)`。

**最小方向：** 所有切换入口遵守同一个草稿保存协议；捕获提交时的文档 ID、正文与编辑版本；异步响应只更新所属记录，不改写后续选择或较新草稿。处理未触发定时器和已在途请求。先参考 Forms/Dataset/PPT 现有保存序号保护，不引入全局状态框架。

**验收：** A/B 使用明显不同正文。覆盖列表点击、文内链接、新建和相关标签入口；快速切换、响应乱序、保存中继续输入均不丢稿、不串写；旧响应不改变当前文档。保存失败保留草稿及错误提示，后续恢复可保存正确文档。源码回归之外，在实际编辑器中操作复验。

**证据边界：** `pages-draft-races.mjs` 重放实际函数源码，模拟编辑器、网络与定时器；未做完整浏览器验收。

## C02 · P1 · 已撤回的 Concern 接受决定仍可再次解除阻塞

**触发与证据：** 用户对某 Concern 作出 `accept_concerns`，随后同范围 `reject_concerns`；Runtime 再用旧决定执行 `applyConcern(action=accept)`，结果仍为 `accepted`。对照正常 `citeDecision` 路径，同一旧批准会被拒绝并返回 `event_decision.superseded`。

**调用链：** MCP `event_concern` → Native Goals `GoalEventApplication.applyConcern` → `modules/goals/src/event-state-concerns.ts` 的 `assertCitedSources`（约 133–150）。它只核对旧效果与范围，未核对后续撤销或承诺变化。统一可复用性检查已存在于 `modules/goals/src/event-state-effects.ts:517` 的 `assertReusable`。

**最小方向：** 在正确 owner 内复用现有决定有效性判断，使 Concern 接受路径与正常引用路径一致；保留可信身份、范围、当前承诺和幂等约束，不另造一套授权判断。

**验收：** “接受 → 拒绝 → 引用旧接受”必须拒绝且不解除阻塞；承诺变更、范围不匹配同样不能复用；仍有效且范围匹配的批准正常生效。检查 MCP/HTTP 正式入口与 owner 结果一致，历史记录保留。

**证据：** `business-bugs.mts` 中 `probeRevokedConcernApproval`，使用真实 Goals/Governance 和内存 SQLite。

## C03 · P1 · 未生效的新收尾遮住有效完成，反证无法重开 Goal

**触发与证据：** 要求得到支持 → 正式完成 → 用新幂等键再提交缺少 result 的收尾（未生效）→ 提交反证。最终 `work_status=completed`、`completion_effect=true`，同时 `currently_satisfied=false`。

**位置：** `modules/goals/src/event-state-effects.ts:503` 的 `reassessAfterReports` 只取最新收尾；约 506–507 遇到 `completion_applied=false` 就返回。查询在 `modules/goals/src/event-state-repository.ts:431` 的 `latestClosure`。

**最小方向：** 依据当前仍有效的完成状态/记录做重评，后续未生效尝试不能遮住它。保留完整事件历史、幂等重放和显式关闭的语义，不能简单“取任意历史成功记录”而复活已失效决定。

**验收：** 上述序列收到反证后重开；多个未生效收尾也不能屏蔽反证；重放不产生重复重开副作用；已有正常完成、撤销/关闭和存储重开后状态一致。

**证据：** `business-bugs.mts` 中 `probeFailedClosureMasksReopening`，实际 owner + 内存 SQLite。

## C04 · P1 · 宿主重启后插件显示 running，进程内实际未启动

**触发与证据：** 同一个持久化 Runtime repository，先创建并启动 Runtime A，再创建 Runtime B。B 的 `start` 返回 running，但总启动次数仍为 1，contribution 为 null，`ensureStarted` 不可用。

**正式链：** `apps/local-host/src/coding-surface.ts:95` → `plugin-platform.ts:74` 的持久 Runtime → Supervisor → `packages/plugin-runtime/src/index.ts:217–219`。Runtime 看到持久状态 `running` 直接返回 replayed，但新进程的 contribution/context Map 为空。`coding-surface.ts:141–147` 因缺少 View 返回 null。

**最小方向：** 仅在本进程确有有效实例且持久状态一致时重放成功；进程重建后重新启动并注册 contribution/context。保留安装身份、grant 和恢复预算，不能清空安装表或无条件重置 crashed/quarantined。核对并发 start、失败清理、stop/restart 与 context 撤销，避免重复激活或遗留权限。

**验收：** 两个 Runtime 共用持久存储时第二个确实执行激活，contribution/实例可用；同进程重复或并发启动不重复注册。再用最终 Host 关闭/重开验证健康插件的 UI、路由、事件和输入恢复。既有失败插件恢复用例不能代替健康插件重启用例。

**证据边界：** `plugin-runtime-probes.mjs` 使用真实 Runtime/Supervisor 与 SQLite，模拟对象重建；尚未做最终桌面 App 进程重启。

## C05 · P2 · Pages 保存失败后仍发布旧内容并显示成功

**触发与证据：** 当前保存请求失败，随后仍调用 `/promote`，旧 Store 正文被发布，最后“已存成 Artifact”覆盖保存错误。

**位置：** `plugins/native/pages/src/client.ts:649–659` 列表发布、约 688–699 编辑器发布，都使用 `await save().catch(showNote)` 后继续执行。约 675/682 的返回与提取分支存在相同吞错形式，需一起核对，尚未分别实操。

**最小方向：** 必要保存失败就中止依赖该保存的操作，保留编辑内容与明确错误；与 C01 共用正确文档身份和在途保存规则，不再加独立补偿定时器。

**验收：** 两个发布入口在校验/网络/服务端保存失败时都不创建 Artifact、不显示成功；修正或恢复后重试只发布最新正文一次。返回与提取路径也不得静默丢稿或使用错误版本。

**证据边界：** `pages-promote-after-save-failure.mjs` 重放实际分支源码与模拟失败请求。

## C06 · P2 · Pages 项目参数不一致时把 Artifact 写到另一项目

**触发与证据：** Host 路由解析项目 A，query/body 声明 B，发布 B 文档。真实 handler + Pages Store + Artifacts owner 返回 HTTP 200，`pageProject=B`、`artifactProject=A`，在 B 查 Artifact 为 null，文档 Artifact 版本却已推进。

**调用链：** `apps/local-host/src/web-request.ts:199` 把 publisher 绑定 A → `plugins/native/pages/src/route-handlers.ts:163` 的 `projectIdOf` 从请求读取 B → `apps/local-host/src/pages-artifact.ts:14` 忽略输入项目，写入绑定的 A。

**最小方向：** 以 Host 正式解析的项目身份为准，在 Host/Plugin 边界拒绝不一致请求，publisher 也校验所属项目。核对既有 `project_id`/`board_id` 映射，不把旧库兼容映射误当作错误项目。

**验收：** URL/query/body 不一致时在写入前失败，两个项目都没有错误 Artifact，文档版本不推进；正常项目及合法旧库映射可发布，连续发布版本正确。由当前完整路由装配补测试，不能只测 publisher。

**证据边界：** `pages-project-mismatch-real-http.mjs` 使用真实构建后的 HTTP adapter、SQLite 与 owner，测试服务器由脚本装配，未运行完整 LocalHost 鉴权。**本项不是已确认远程鉴权绕过。** 另有较早的模拟组合脚本 `pages-project-mismatch.mjs`。

## C07 · P2 · 长周期处理超出租约后被再次并发执行

**触发与证据：** interval=5s，首次 handler 保持未完成，把时钟推进 31s 后再次 tick，同一任务启动两次，`maxConcurrentHandlers=2`。

**正式链：** `apps/local-host/src/web-server.ts:141` 每 30s 不等待地 tick → `schedule-runtime.ts:58` → `horizontal/scheduler/src/index.ts`。约 259 的 claim 接受过期租约；约 270 只把 next_due 前移一拍；约 291 等待 handler；约 303–307 的旧执行结束后还无条件清空租约。

**最小方向：** 明确执行身份，活动执行续租或以等价机制阻止重复领取；结束写回必须匹配自己的执行身份。兼顾异常退出后的接管，不能仅靠永久进程内锁或把 next_due 推远来掩盖问题。

**验收：** 同一任务执行时间超过周期和租约仍不重叠；旧执行结束不能清掉新执行的租约；真正崩溃后的过期任务可恢复；取消/停止不被迟到结果复活。用可控时钟和独立 SQLite 确认，再覆盖 Host tick 装配。

**证据：** `business-bugs.mts` 中 `probeOverlappingInterval`，实际 Scheduler + SQLite，时钟和等待 handler 为模拟。

## C08 · P2 · CLI 会话第二轮未恢复 Provider 会话

**触发与证据：** 首轮进程返回 `system.session_id`，完成并退出；同一 Host session 开始第二轮，spawn 参数仍没有 `--resume` 或首轮 Provider session ID。adapter 却声明 `session.resume=supported`。

**位置：** `horizontal/agent-host/src/adapters/cli-runtime.ts:104` 能力声明；约 204 每轮创建空 state；约 244 从新 state 读 sessionId；约 247/325 构造 resume 参数。Provider ID 只留在上一轮 state，没有持久于该会话记录。

**最小方向：** 将 Provider session ID 归属到正确 Host 会话记录，下一轮从该记录恢复；明确缺少 ID、失败和进程恢复时的能力边界。不同会话/Provider 不混用身份。

**验收：** 同一会话第二轮传首轮真实返回的 ID；不同会话隔离；没有 ID 时不伪造续接成功；失败、取消和重启遵守既有 Contract。模拟进程参数验证之外，真实 CLI/模型的上下文延续未实际操作就保持 `UNVERIFIED`。

**证据与范围：** `cli-session-resume.mjs` 直接运行实际 adapter，进程为模拟，不调用模型。当前 `composeAgentHost` 正式装配只有 CLI；不借机切换到 Prologue，也不把独立的审批/AskUser 类型或 UI 当作已接入功能。

## C09 · P2 · 公开 revoke API 未撤销启用状态

**触发与证据：** `revoke(id)` 后再次取 generation，会从 1 变为 3；enabled 列表仍包含插件，`ensureStarted` 返回实例且 active 为 true。

**位置：** `packages/plugin-runtime/src/supervisor.ts:171` 的 `generation` 自动分配；约 185–187 的 `revoke` 仅删除 generation；约 190/200/209 的 enabled、ensureStarted 和 active 判定没有一致的撤销约束。

**最小方向：** enabled/revoked 状态在 generation、枚举、启动与旧实例 active 判定中一致；明确重新启用入口和恢复行为，不破坏 restart 的代际失效规则。

**验收：** 撤销后旧队列/句柄失效、新投递与路由/输入不能获得活动实例；重复读取不自动重新启用；撤销与启动并发时，迟到的启动不能重新登记为活动实例；显式重新启用后恢复，C04 的重启恢复仍通过。

**证据边界：** `plugin-runtime-probes.mjs`。**未找到此方法的生产调用方，本项是公开 API 行为缺陷，不能写成当前 UI 禁用功能已失效。**

## C10 · P1 · htmlparser2 版本冲突阻塞实际安装打包

**触发与证据：** Pages 引入 `htmlparser2@10.1.0`，Feed 的 `sanitize-html` 依赖解析为 `htmlparser2@12.0.0`。源码能构建，但安装/分发器报：`运行时依赖存在无法平铺的版本冲突: htmlparser2@10.1.0 / htmlparser2@12.0.0`。

**位置：** `plugins/native/pages/package.json:38`；`apps/local-host/src/installer/home-dependencies.ts:68` 按包名收集平铺依赖，遇到不同版本拒绝。关联 `pnpm-lock.yaml`、`scripts/workspace-packages.mjs`、Pages 导入和 Feed 内容清理。

**最小方向：** 先核对 Pages 导入 API/行为是否兼容现有依赖树的统一版本，若可行按正常依赖工具更新声明与锁文件，并同步依赖清单。两支还带有不同大版本的 domhandler/domutils/entities，需要检查整个传递依赖树。若不能兼容，才评估分发器保留依赖层级的影响。冲突检查是保护机制，不能只手改 lockfile、任选第一份依赖、强制覆盖、删检查或绕过安装测试。

**验收：** Pages 导入和 Feed 清理行为不回归；正常构建、npm staging、离线 payload 安装、packed CLI 主链和相关卸载 fixture 都通过；打包产物脱离仓库 node_modules 仍能启动。使用临时 home，source manifest 和 vendor 源保留。不要执行会覆盖用户 App 的 `install:local` 或正式卸载来代替隔离测试。

**证据：** 初次安装失败混有 `source.build_stale`。刷新快照构建清单后，7 项安装/打包相关测试仍全部失败，集中为上述版本冲突，故该问题不是构建指纹误报。见 `安装打包复查.log`。

## B01 / B02 · 分包和自动门禁收口

### B01：Repository 从普通公开入口暴露

`modules/artifacts/src/index.ts:70` 导出 `ArtifactsRepository`；`modules/goals/src/index.ts:268` 导出 `GoalsRepository`，Module 也暴露 repo。与 `PACKAGE-BOUNDARIES.md:50` 的“Repository 仅内部可见，测试端口除外”不一致。`apps/local-host/sdk/sdk-store.ts` 仍有 GoalsRepository 的生产兼容使用。

先列公开面与真实 caller，能局部迁移的改用 Query/Command；不能直接删除兼容入口造成 SDK 破坏。区分业务 Repository、测试端口、公开数据库类型、具名迁移入口和 Runtime 自身技术 Repository，不能按名字批量删出口；保留同连接事务、原子性与恢复语义。若需要跨层迁移或改变公共 Contract，提出具体影响、兼容方案、回滚和验收，作为待决定事项，不在本次局部 bug 修复中擅自扩大。不通过改规范来掩盖现状。本轮未发现业务 Module 经该出口跨 Store 写入，不要夸大为已发生的数据越权。

### B02：边界门禁漏掉已有明文禁止项

`packages/test-kit/src/boundaries.ts:130` 对非 workspace 依赖提前返回，Contracts 导入 `node:sqlite`、`undici` 均未报违规；部分 platform/horizontal 反向依赖规则未编码。`extractImportSpecifiers` 漏掉带第二参数的动态 import 和模板插值内的 import。当前源码比对没有发现实际利用这些语法绕过门禁的依赖。

对明文规则补负例与合法依赖正例，覆盖 `import('x', options)`、模板内表达式、别名与现有导入形式；字符串/注释不能误报。先核对声明允许的 Host composition 和存储 adapter，再补规则。Desktop Panel 的 SQLite adapter 是平台 owner，不应一概判为业务 Store 越界。修复后既有 workspace 图继续通过，新增非法样例能失败；不新增没有规范依据的一刀切限制。

## 已完成的清理：保留，不重复改回

| 文件 | 本次审查实际改动 | 保留的行为 |
| --- | --- | --- |
| `apps/mcp/src/goal-event-commands.ts` | 删除无 caller 且非公开包接口的 `isGoalEventTool`、`isGoalEventWriteTool` 和专用重复 `WRITE_TOOLS`，23 行 | `ALLOWED_KEYS`、真正 handler 和包入口保留 |
| `apps/local-host/src/mcp-event-identity.ts` | 删除无 caller 的 `assertRuntimeGoalEventToolInput` 转发层，7 行 | 生产使用的 `assertRuntimeOrdinaryToolInput` 身份校验保留 |
| `modules/goals/src/event-state.ts` | 删除连续重复的一次 `requireGoal`，1 行 | 紧接着取得 Goal 的查询保留 |

已做全仓引用与公开入口检查；没有删除文件、SDK 公共接口、历史 schema 或迁移。三处源码与验证快照核对一致，交接前 `git diff --check` 通过。独立补丁保存在 `本次清理.patch`，是识别归属的证据，不要对当前树重复应用。

## 既有验证、失败与不能据此宣称的结论

审查用临时完整源码快照构建，纳入当时已完成的 Pages 导入接线更新。结果描述的是该时点，**不保证接手时仍是同一工作树内容**。

- `pnpm build`、全部 workspace 类型检查通过；既有边界/Workbench 注册测试 11 项通过。
- 最后一次工作树边界检查：59 个 package、1,047 个源文件、3,871 个 imports，0 errors。中途 Pages 并行开发曾短暂清单不同步，后已恢复，不另列成持久 bug。
- 串行选择了 223 个非 `*.e2e.test.ts` 测试文件，1,416 项中 1,376 通过、40 失败、0 跳过，约 16 分 41 秒。`tests/e2e.test.ts` 因命名被包含，主要检查 packed CLI 安装链；不能把这次选择称为完整浏览器/桌面 E2E。
- 刷新构建清单后定向安装复查 7 项，0 通过、7 失败；另有为恢复被截断详情而重跑的 13 项，7 通过、6 失败，均不重复累计到上述总数。
- 40 项失败没有与修改前的同状态基线逐项对照，**不能统称历史失败，也不是 40 个已确认独立产品 bug**。剩余涉及固定视觉/目录断言、翻译、历史迁移 fixture、服务设置客户端 mock、PATH 发现、导入预期、MCP 诊断等，需分类后处理。
- 两个名字为“工作台脚本仍能解析”的失败实际上先停在旧插件名单正则；生成脚本已单独解析成功，不要据此修不存在的 JavaScript 语法错误。服务设置的 8 项失败关联 mock 缺 `document.addEventListener`，须先分清测试替身与生产行为。
- 没有调用真实模型、改写真实用户数据、做最终桌面重启或真人验收。最终产品实操与用户验收仍是 `UNVERIFIED`。

## 复现资料与执行方式

原始完整报告：[代码审查报告](/Users/oreal/.codex/visualizations/2026/09/22/01a0c888-8bf3-79c1-a97a-4a5f48b8be91/代码审查报告.md)。证据目录：

```text
/Users/oreal/.codex/visualizations/2026/09/22/01a0c888-8bf3-79c1-a97a-4a5f48b8be91/代码审查证据
```

| 脚本/文件 | 用途 | 审查时断言语义 |
| --- | --- | --- |
| `pages-draft-races.mjs` | C01 丢稿和串写 | exit 0 表示 bug 复现 |
| `business-bugs.mts` | C03、C02、C07，按该顺序运行 | exit 0 表示三个 bug 均复现；修好前一项后应拆成独立回归，避免首个断言中断其余验证 |
| `plugin-runtime-probes.mjs` | C04、C09 | 断言正确行为，当前收集两项失败并 exit 1 |
| `pages-promote-after-save-failure.mjs` | C05 | exit 0 表示 bug 复现 |
| `pages-project-mismatch.mjs` | C06 早期模拟组合 | exit 0 表示 bug 复现；开头缺依赖注释只是审查中途状态 |
| `pages-project-mismatch-real-http.mjs` | C06 真实 handler/Store/owner | exit 0 表示错项目写入复现；默认读历史构建快照 |
| `cli-session-resume.mjs` | C08 | exit 0 表示缺 resume 已复现 |
| `回归失败清单.md`、`失败详情复查.log` | 40 项失败名称及部分根因复查 | 历史证据，不代替当前测试 |
| `安装打包复查.log` | C10 的 7 项复查 | 已排除构建指纹过期后的冲突 |
| `构建.log`、`类型检查.log`、`边界测试.log`、`本次清理.patch` | 工程记录与清理归属 | 不能证明待修问题通过 |

这些脚本是**诊断材料，不是修复后的通过门禁**。把触发序列转成仓库正式测试，断言正确结果，再验证修复前失败、修复后通过。源码片段提取脚本在重构后可能无法提取；这既不证明修好，也不证明业务回归。保留原始证据，另写行为测试。

在当前同一台机器、已具备现有依赖的仓库根目录，可分别执行以下诊断命令：

```sh
cd /Users/oreal/adeptify-home/repos/molis-work
AUDIT_EVIDENCE=/Users/oreal/.codex/visualizations/2026/09/22/01a0c888-8bf3-79c1-a97a-4a5f48b8be91/代码审查证据
node "$AUDIT_EVIDENCE/pages-draft-races.mjs"
node --import tsx "$AUDIT_EVIDENCE/business-bugs.mts"
node --import tsx "$AUDIT_EVIDENCE/plugin-runtime-probes.mjs" "$PWD"
node "$AUDIT_EVIDENCE/pages-promote-after-save-failure.mjs"
node "$AUDIT_EVIDENCE/pages-project-mismatch.mjs"
node --import tsx "$AUDIT_EVIDENCE/cli-session-resume.mjs"
```

除 Runtime 脚本支持 root 参数外，多数脚本含当前仓库绝对路径。跨机器/副本使用时先核对并调整副本中的路径，不能以为切换 cwd 就切换了被测源码。若 Grok 无法访问本机证据目录，将该目录与本文一并交给它；不能伪称脚本已运行。

真实 HTTP 脚本默认读取旧快照：

```text
/var/folders/j2/q_ctx69x57b2md26b1jclklh0000gn/T/molis-code-audit-20260922-hn5qfo4t/tree
```

它只证明审查时行为，临时目录可能被清理。验证 C06 修复时，应在正式测试或脚本副本中改为本次新构建的目标路径，并把数据库目录设为新临时目录。不要对旧快照重跑后声称当前补丁通过，更不要从快照覆盖工作树。

## 修复后的验证与交付

先跑每项新增行为回归和受影响的既有测试，再跑项目规定检查。测试候选：

| 改动组 | 既有测试入口 |
| --- | --- |
| Pages | `tests/pages-plugin.test.ts`、`tests/pages-import*.test.ts`、`tests/feed-inbox-pages-loop.test.ts`，再补真实编辑与完整 Host 项目路由用例 |
| Goals | `tests/goal-events-state.test.ts`、`tests/mcp-goal-events-state.test.ts`、`tests/goal-event-http.test.ts` 及受影响的历史/迁移用例 |
| Runtime | `tests/plugin-runtime-integration.test.ts`、`tests/plugin-platform-composition.test.ts`、`tests/coding-plugin-activation.test.ts` |
| Scheduler / CLI | `tests/scheduler.test.ts`、`tests/schedule-plugin.test.ts`、`tests/agent-host.test.ts`、`tests/agent-host-composition.test.ts`、`tests/agent-host-wiring.test.ts` |
| 分发 | `tests/install.test.ts`、`tests/npm-package.test.ts`、`tests/runtime-payload.test.ts`、`tests/uninstall.test.ts`、`tests/e2e.test.ts`，仅临时数据 |
| 边界 | `packages/test-kit/tests/boundaries.test.mjs`、`tests/workbench-registration-boundaries.test.mjs` 与受影响 owner 边界测试 |

在已协调好构建输出的验证目录中，基础命令如下；按实际改动和现有脚本核对，避免同一内容无理由重复构建：

```sh
pnpm build
pnpm workspace:typecheck
pnpm boundary:check
pnpm boundary:test
pnpm workspace:check
node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts tests/goal-events-state.test.ts tests/plugin-runtime-integration.test.ts tests/scheduler.test.ts tests/agent-host.test.ts
git diff --check
```

上面的定向测试只是入口示例，不能替代各项验收、实际安装链和最终回归。源码改动后应正常重建，让 `write-build-manifest.mjs` 记录对应输出；不要只刷新指纹来掩盖旧构建。审查复查是在已完成构建的隔离快照上修正指纹后才确认 C10。

审查中 pnpm 启动前依赖元数据校验曾对私有 vendor registry 返回 404；三个本地 vendor tgz 的 SHA512 已逐一与 lockfile 一致。若再次遇到同类**元数据检查**问题，先复核当前内容，才可在单条验证命令加 `pnpm_config_verify_deps_before_run=false`。这不能修复缺依赖/版本冲突，也不能改永久安全策略或代替正常锁文件更新。

最终逐项交付 C01–C10、B01/B02 的状态：已修复并验证、当前已不复现及证据、仍未解决及具体原因。说明修改文件、触发场景、正确行为及实跑命令；新失败先定位和处理，剩余审查时失败按证据分类，不删除/跳过测试换取全绿，不未经对照标成“历史问题”。

最终结论分开写：**工程验证通过了哪些；最终产品实际操作了哪些；哪些仍为 `UNVERIFIED` 或需要用户验收**。保留用户输入、授权和项目归属的反例必须有行为证据；没有真实模型或完整进程实操，就不宣称上下文续接或整套产品恢复已验收。交付本地修复结果和未解决项即可，不自动提交、推送或发布。
