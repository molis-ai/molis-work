# 最近三天 PR 复审确认问题的修复

状态：实现中（2026-10-20）。审计范围是 2026-10-17 至 2026-10-20 合入 main 的 227 个 PR；完整报告见 [docs/reviews/pr-review-2026-10-17-to-20.md](../../docs/reviews/pr-review-2026-10-17-to-20.md)。本 spec 只收**经本次复核确认**的问题；报告里仍是 concern、但本次没有确认的项不在这里扩成实现，见 §1.4。

审计基线是 `origin/main` `3ba9185d7`（2026-10-20 16:07 UTC）。本 spec 的编号前缀是 `PRR`，实现时把编号写进测试名或测试旁注释。

实现进展（2026-10-20）：PRR-01、02、04–11、13–21 已实现并通过对应定向测试；PRR-03（平台目录服务，需用户定交互）、PRR-12（灵光 UI 迁移）未做；PRR-07 的分栏撤销 e2e、PRR-10 的进度计数、PRR-21 的 QA-017 真实打开仍待补；PRR-22 已写进 PR 模板与并行开发文档，执行仍是人工。代码在分支 `fix/pr-review-remediation`（基于 `3ba9185d7`），`pnpm health:check --base origin/main`、`pnpm boundary:check`、页面资源与动作合同快照均通过；本机 `apps/local-host` 的 Swift 原生构建被沙箱拒绝，TypeScript 构建与相关测试通过。

## 1. 确认结果

### 1.1 已确认、当前仍需处理

> 其中 PRR-15（#857）与 PRR-20 的 #764/#762/#828/#703 在报告里原为 concern；本次按代码或文档行复核后提升为确认问题。其余 PRR 项来自报告的 issue。

| 编号 | 来源 PR | 级别 | 确认方式 | 证据 |
| --- | --- | --- | --- | --- |
| PRR-01 | #839 | P1 | 代码路径 + 纯函数复现 | `knowledge-actions.ts:131-135` 把 plugin 的 `reader` 换成 owner；`workspace.ts:25-27,78` 工作目录读用 `access.reader`；复现脚本显示 `discover`/`invoke` 都以 owner 身份调用，并读出了 `workspace_file` |
| PRR-02 | #733 | P1 | 代码 + 裁定 11 | `cognia/src/directory.ts:1-2,7-9` 直接 `node:fs`；`actions.ts:11` 的 `directory.scan` 受众含 agent/mcp/workflow；`specs/repository-anti-corruption/spec.md:3063` 要求平台服务与同意流程 |
| PRR-03 | #733 | P1/P2 | 同上，需用户定交互 | 平台目录服务尚不存在；Cognia 自己读绝对路径 |
| PRR-04 | #629 | P2 | 纯函数复现 | `announce-guard.ts:125-128` 的 `ACTING_TOOLS` 含 `suggest-action`/`suggest-memory`；复现脚本确认两者返回后 `actedThisRound=true`；`prologue-stop-guard.ts:99-101` 在 `changed` 为真时直接放行，不跑 `reviewEnding` |
| PRR-05 | #839 | P2 | 纯函数复现 | `coding/src/manifest.ts:71` 只 consume `knowledge.read`；`knowledge-tools.ts:33-38` 却调 `knowledge.list`；复现脚本确认 `invoke` 抛 `actions.forbidden`、catalog 为 null |
| PRR-06 | #839 | P2 | 动作字段核对 | `packages/contracts/src/services/knowledge.ts:408` 的 `knowledge.locate` 是 query/read、权限只有 `knowledge:read`，没有 `model:invoke` 或 `metered`；`prologue-checkers.ts:171-176` 因此允许它被登记成外部等待 |
| PRR-07 | #765 | P2 | 纯函数复现 | 复现脚本：固定 Goals 插件标签后打开 Goals 条目，`pluginGroup` 同时含固定插件标签和散条目，`closePluginGroup` 把两者都关掉；分栏里 `close` 在 `embedded` 时直接返回，没有撤销芯片/⌘⇧T |
| PRR-08 | #819 | P2 | 词典检查 | `ISSUE_ASK` 只有中文；`RENDERER_GAP_EN` 没有该键；`capture-client.ts:50`、`review-client.ts:35` 用 `L(result.question)`；`specs/issue-home-v0/spec.md:64` 却写有英文 |
| PRR-09 | #822 | P2 | 执行器复现 | `prologue-after-write.ts:48` 按原始路径做 `startsWith(cwd + "/")`；复现脚本 `src/a.js` 得到命令，`./src/a.js` 得到「没有适用于 .js 的检查器」 |
| PRR-10 | #729 | P2 | 代码核对 | `plugins/native/lingguang/src/plugin.ts:26-33` 把 `caller.on_progress` 作为 `request.onProgress`；`materials-service.ts:45` 又调用一次 `caller.on_progress` |
| PRR-11 | #729 | P2 | 代码核对 | `plugins/native/lingguang/src/manifest.ts:9,28-36` 所有 POST 路由都用 `BODY_BYTES = 36_000_000` |
| PRR-12 | #729 | P2 | 代码核对 | `apps/workbench/src/ui-composition.ts:324`、`renderer.ts:106-111`、`goals-page-renderer.ts:97,298` 仍在构建期手写渲染灵光工作面 |
| PRR-13 | #681 | P2 | 身份复现 | `installIdentity(todoManifest)` 得到 `plugin-install-<sha>`，不等于 `io.molis.work.todo`；`agent-question-surfaces.ts:48-49` 的 `builtinOf` 因此返回 undefined |
| PRR-14 | #835 | P3 | spec 行核对 | `specs/repository-anti-corruption/spec.md:283-284` 的 RES09 是探索恢复；`:309` 又把 RES09 给 Pulse 取消 |
| PRR-15 | #857 | P3 | 代码核对 | `project-database.ts:217` 的 `ROLLBACK` 可能盖掉原错误；`:167` 的 `JSON.parse` 没有映射成 `shape_mismatch` |
| PRR-16 | #718 | P3 | 行对照 | `docs/reviews/anthropic-capability-assembly-2026-10-18.md:25` 写两个 role、四项 host_tools；实际是三个 role、六项（`assistant-agent.ts:144-150`、`plugin-agent.ts:25`）；2026-10-18 修订记录仍未补 |
| PRR-17 | #771 | P3 | 行对照 | `docs/product-operations/产品介绍.md:198` 说打开/保存面板总在另一个进程；`specs/computer-use/open-decisions.md:5-11` 说可能是同 pid sheet，真机事实未定 |
| PRR-18 | #847 | P3 | 计数/文件对照 | `specs/repository-anti-corruption/spec.md:1627` 写 86 个源文件、15,982 行、`client.ts` 1,118 行；当前 90 个 `.ts`、`client.ts` 1,114 行；CHANGELOG 没有 Pages 迁移的升级须知；spec 说 Pages 已声明 runtime，但 `registration.ts` 没有 |
| PRR-19 | #766 | P3 | 行对照 | `specs/visual-ui-experience/spec.md:27,86,280` 把附件状态归 UIV；`specs/unified-input-voice/spec.md` 没有附件状态条文；`:30` 仍钉在 482149c7e；`:234` 对测试的描述不准确 |
| PRR-20 | #764/#762/#828/#703 | P3 | 行对照 | `产品介绍.md:40` 的「预览/开发中」与 `:27`、`:36`、`:288` 不一致；`privileges.md:143-144` 的 PG-018/019 仍写「待做」；`ai-development-handbook/spec.md:11,29-35` 的交接事实/头不一致；`actions.ts:448-455` 的注释错位 |
| PRR-21 | #831 | P3 | 测试行核对 | `shelf-side-links.e2e.test.ts:87-97` 比较 `[data-tab-workspace] [role=tab]` 的 29 个内部控件，不是可见的 `[data-titlebar-tabs] [data-tab-id]`；`:85` 固定「等你处理 · 1」；`:94` 只转义第一个点；`context-pick-result.e2e.test.ts:173` 仍拦截 `molis:side-open` |
| PRR-22 | 多个 PR | P1 流程 | 评论/拓扑核对 | #717 在统筹评审前自行合并，公开仓库历史含约 4.1 万行快照与本机路径；#733 无评论自行合并；#703 自行入队、未跑全量；#721/#757/#765/#766/#815/#839 在评审完成前或要求未落实时入队；#650/#708 共享核心未跑全量 |

### 1.2 已确认、已由后续 PR 修复（不重复修）

| PR | 原问题 | 后续修复 | 当前 main 核对 |
| --- | --- | --- | --- |
| #634 | S-35：放置服务关闭后移回仍提交 | #740 | `placement-call.ts` 的最终同步检查已带 assertAlive |
| #650 | 换 vendored SDK 后 `SECURITY-INVARIANTS.md` 的当前包名未更新 | #814 | 当前行指向 `after-write-check-marker` 包 |
| #667 | `coding.runs.control` 升 v6，SKILL/Coding README 仍教 v5 | #800 / #793 | SKILL 不再钉 v5；Coding README 到 v7 |
| #675 | `#follower` 把所有读失败当工作不存在 | #754 | `assistant-jobs.ts:161-163` 只把 `assistant.not_found` 当不存在 |
| #700 | `beforeEffect` 前核来源，撤回竞态可写入 withdrawn 输入 | #711 | `session-actions.ts` 在 `fresh(call)` 之后核 origin |
| #713 | 三个业务角色 host_tools 变了但 role version 没升 | #795 | assistant 2、assistant-delegated 2、todo organizer 3 |
| #721 | 模型输入直接编译成正则，ReDoS | #735 | `computer-act.ts` 无 `new RegExp` |
| #757 | 检查器 cwd 在 normalize 前检查，存得进跑不了 | #770 | `write-checker-actions.ts` 在 normalize 后检查 |
| #815 | 未运行的浏览器用例合入，main 夜间变红 | #859 | 测试修复；AC-10-2 的口径变化已在 spec 记录 |

这些不进入 §4 的实现清单；PRR-22 只把“评审完成后再入队”作为流程要求。

### 1.3 已确认、只是流程或历史

- **#717**：公开仓库历史里的快照/本机路径无法撤回，树已由 #719 清理；不写代码修复，PRR-22 记流程教训。
- **#650 / #708**：共享核心未跑全量/全量被取消后合入；PRR-22 记门禁要求。
- **#703**：作者自行入队、未跑全量；合同注释错位归 PRR-20 的文档项。
- **#720**：承诺的全量没有跑成就合入；PRR-22。

### 1.4 未确认 / 不纳入本 spec

- **#701**：`always_on` 在非 personal 声明者上的条件不一致，当前唯一声明者是 Shelf（personal），没有现网触发；等出现第二个声明者再修。
- **#826**：`clientFrom` + `clientUses` 并存时派生只处理一层，当前目录没有这种条目；等目录生成器支持嵌套时一并修。
- **#877**：`validate_authority` 选库条件与 `installOf` 不一致，但 `scopeMatches` 与世代比较使其 fail-closed；属于清理项，不是当前缺陷。
- **#882**：`outside_project` 完全听宿主，当前两个监督器都不传 `redemption`；等 S0-2b-2 接线时加交叉检查。
- **#843**：connections 决策行仍预计 S-43，未来会撞号；等那个服务实现时再取号。
- **#854 / #856 / #860**：是 stacked 到 `feature/visual-ux` 的 PR，不在 main；父 PR #851 仍 OPEN。它们的复制助手可选调用、首次按下改宽、page-assets 只在 stacked base 成立等问题，应在 #851 合入前处理，不并入本 spec 的 main 修复。
- **#661 / #743 / #747 / #753 / #839** 的未读部分：审计是抽样，不把“未发现问题”写成“没有缺陷”；这些部分不进入本 spec，除非后续确认。

## 2. 目标

1. 关掉两个 P1 安全/防腐边界：知识工作区的授权换主、Cognia 的目录私路。
2. 修掉已复现的 P2 功能/合同问题：收尾说法、Coding 资料目录、`knowledge.locate` 分类、标签组、英文追问、写后检查器路径、灵光进度/体量/装配、Todo 内建识别。
3. 修掉 P3 的可追溯性与文档事实：RES09 撞号、项目库错误路径、文档计数/说法/状态、QA 断言。
4. 把“评审完成后再入队”“共享核心必须 full-suite”“main 基线必跑”“stacked 不等于合入 main”落成可检查的合并流程。

## 3. 非目标

- 不重新审 227 个 PR，不把报告里的 concern 全部变成实现。
- 不修 #854/#856/#860 的 stacked 分支；它们由 #851 的评审处理。
- 不改 #701/#826/#877/#882/#843 的未来风险，除非实现时顺手。
- 不跑真实 Home、不迁移真实数据、不改用户已有的安装。
- 不为兼容旧数据加读取兜底；合同变化按 `docs/system/CONTRACT-CHANGES.md` 的现行规则做。

## 4. 验收标准

1. **PRR-01**（#839，P1）持 `knowledge:read`、没有 `workspace:read` 的插件，不能通过 `knowledge.glob`、`knowledge.grep`（带 `glob`）或 `knowledge.read`（`workspace_file`）读取项目工作目录；持 `workspace:read` 且用户已授权时照常。来源读取（卡片、搜索、分节、locate）保持 S-41 允许的 owner reader 行为。测试：`tests/security-invariants-knowledge.test.ts` 新增 `PRR-01 a plugin with knowledge:read but no workspace:read cannot read a workspace file`；`tests/knowledge-service.test.ts` 加 plugin + `workspace:read` 的正向用例。
2. **PRR-02**（#733，P1）在平台目录服务落地前，`cognia.directory.scan` 与 `cognia.import.directory_preview` 的受众只保留 `user`，不再向 agent/mcp/workflow 提供；`cognia:read-local-files` 也不出现在这些受众的目录里。测试：新增 `tests/security-invariants-cognia-directory.test.ts` 的 `PRR-02 the directory actions are user-only until the platform service exists`；既有 Cognia 用例按 user 受众调整。
3. **PRR-03**（#733，P1/P2）实现平台目录读取服务：由人选择/确认目录，平台做路径规范化、符号链接拒绝、只读、文件大小/类型上限和逐次授权；Cognia 改为调用该服务，插件里不再 import `node:fs`。测试：`tests/security-invariants-cognia-directory.test.ts` 的 `PRR-03 the platform directory service asks the person and reads only the chosen folder`；`[人工]` 目录选择/同意交互。需要用户先确认交互方式。
4. **PRR-04**（#629，P2）一轮只有 `suggest-action`/`suggest-memory` 返回、没有实际 keep/save 时，收尾仍核对 `kept`/`saved` 说法；只提议不再被当成“已记住/已保存”。测试：`tests/announce-guard.test.ts` 的 `PRR-04 a suggest-memory returned does not excuse "已记住"`；`tests/assistant-business-gateway.test.ts` 的 `PRR-04 a suggest-action returned does not excuse "已保存"`。不要误伤“已经给你一张卡”的说法。
5. **PRR-05**（#839，P2）Coding 的 Manifest consume `knowledge.list`（以及它实际用到的 knowledge 动作）；真实 `PluginActionClient` 不再以 `actions.forbidden` 拒绝，`knowledgeCatalogMaterial` 能拿到项目资料目录。测试：`tests/knowledge-round-fact.test.ts` 的 `PRR-05 Coding gets the project knowledge catalog from a real client`；`pnpm actions:update` 后快照不变或按实际更新。
6. **PRR-06**（#839，P2）`knowledge.locate` 已升到 `@2`，声明 `model:invoke` 和 `execution.cost: "metered"`；旧 `@1` 引用不再解析；Agent 不能把它登记成外部等待，每次调用都显式收费。测试：`tests/action-model-scheduling.test.ts` 的 `PRR-06 knowledge.locate is metered`；新拒绝用例 `PRR-06 locate cannot be registered as an external wait`。动作快照若显示同一版本权限变化，按 `CONTRACT-CHANGES.md` 升版本并改消费者。
7. **PRR-07**（#765，P2）固定/手动组的插件标签不再当自动组头，也不在关组时连带关闭散条目；分栏里的关组有撤销芯片或 ⌘⇧T，能原样恢复组内顺序和当前标签。测试：`tests/tab-workspace-ops.test.ts` 的 `PRR-07 a pinned plugin tab does not close loose tabs`；`tests/plugin-tab-groups.e2e.test.ts` 的 `PRR-07 split pane close can be undone`。
8. **PRR-08**（#819，P2）英文界面的固定追问 `ISSUE_ASK` 有英文词条，`L(result.question)` 在英文下不显示中文。测试：`tests/issue-naming.test.ts` 的 `PRR-08 the fixed follow-up question is English`；翻译门禁通过。
9. **PRR-09**（#822，P2）写后检查器在 `inside`/`relative` 前按 SDK 规则 normalize 写入路径；`./src/a.js` 与 `src/../src/a.js` 在 `cwd: "src"` 下都能命中，`./-rf.js` 仍按 `./-rf.js`。测试：`tests/coding-diagnose-after-write.test.ts` 的 `PRR-09 ./src/a.js is checked by cwd src`。
10. **PRR-10**（#729，P2）灵光的材料提取只走一遍 progress：`caller.on_progress` 与 `request.onProgress` 选一个，不重复。测试：`tests/lingguang-plugin.test.ts` 的 `PRR-10 one progress per extraction`。
11. **PRR-11**（#729，P2）灵光每条 POST 路由有自己的 `max_body_bytes`；只有上传/导入用大上限，小写入路由不再接受 36 MB。测试：`tests/lingguang-http.test.ts` 的 `PRR-11 each route has its own body limit`。
12. **PRR-12**（#729，P2）灵光的工作面由 Runtime 的 views 渲染，工作台删掉 `renderLingguangContribution`/`renderLingguangNativePluginSurface` 的构建期分支；保留现有视觉与交互。测试：`tests/lingguang-plugin.test.ts` 的 `PRR-12 Lingguang workbench view comes from the Runtime`；`[人工]` 侧栏/工作面视觉验收。若工作量过大，可拆成后续片，但不能把三处私路留在 main。
13. **PRR-13**（#681，P2）`builtinOf` 按 `provider.plugin_id` 与 `BUILTIN_PLUGIN_CATALOG` 识别内置；Runtime 内置插件（Todo）隐藏/未显示时不进对象引用题，内置在前排序成立。测试：`tests/agent-question-surfaces.test.ts` 的 `PRR-13 a hidden Runtime builtin is not a reference kind`。
14. **PRR-14**（#835，P3）Pulse 取消验收改用 `W5-01-ALC-RES11`；RES09 只保留探索恢复。更新 `specs/repository-anti-corruption/spec.md`、`tests/alchemist-pulse-cancel.test.ts`、`tests/alchemist-mcp.test.ts`、`tests/alchemist-actions.test.ts` 的注释和 QA 报告。测试：`tests/alchemist-pulse-cancel.test.ts` 的 `W5-01-ALC-RES11 …`；`[人工]` 编号一致性检查。
15. **PRR-15**（#857，P3）`openPluginProjectDatabase` 的回滚不盖掉原错误；`tables_json` 解析失败按 `plugin.project_database.shape_mismatch` 拒绝并带 `where`。测试：`tests/plugin-project-database-ledger.test.ts` 的 `PRR-15 rollback keeps the original error` 与 `PRR-15 corrupt tables_json is shape_mismatch`。
16. **PRR-16**（#718，P3）修正 `docs/reviews/anthropic-capability-assembly-2026-10-18.md:25` 的 role/host_tools 事实；补回 `specs/assistant-service-connections/spec.md` 的 2026-10-18 修订记录。`[人工]` 行对照；文档链接门禁通过。
17. **PRR-17**（#771，P3）把 `docs/product-operations/产品介绍.md:198` 的打开/保存面板说法改成与 `specs/computer-use/open-decisions.md` 的决定 A 一致：同 pid sheet 照常操作，只有独立进程才拒绝并请用户自己完成；同步 `功能全景.md` 与 `角色链路/D-专业服务与个人.md`。`[人工]` 行对照。
18. **PRR-18**（#847，P3）用 `node scripts/gates/package-inventory.mjs --table` 重生成 `specs/repository-anti-corruption/spec.md:1627` 的 Pages 行；`docs/releases/CHANGELOG.md` 补 Pages 迁移的升级须知（旧 `/api/pages` 404、三个动作权限变宽、已授权 MCP 要重新授权）；把 spec 里“Pages 已声明 runtime”的说法与 `registration.ts`/`native-plugin-api.ts` 对齐。`[人工]` 行对照 + 文档门禁。
19. **PRR-19**（#766，P3）附件状态与「@」「/」建议归 VUX 验收（UIV 没有这些条文）；`specs/visual-ui-experience/spec.md:30` 改成相对链接或 PR 链接并写明以合入 main 的 `plugin-tab-groups` 为准；`:234` 的测试描述改成实际规则。`[人工]` 行对照。
20. **PRR-20**（#764/#762/#828/#703，P3）统一 `产品介绍.md:40` 的“预览/开发中”标签；`privileges.md:143-144` 的 PG-018/019 改成 PR 号或“已做”；`ai-development-handbook/spec.md:11,29-35` 的交接事实/头更新；`packages/contracts/src/platform/actions.ts:448-455` 的注释移回 `BoundActionClient`。`[人工]` 行对照。
21. **PRR-21**（#831，P3）QA-018 比较 `[data-titlebar-tabs] [data-tab-id]` 的可见页签与选中项；QA-017 走到真实打开；铃铛 aria-label 不固定为 1；通知正则转义所有点。测试：`tests/shelf-side-links.e2e.test.ts` 的 `PRR-21 QA-018 compares visible titlebar tabs`；`tests/context-pick-result.e2e.test.ts` 的 `PRR-21 QA-017 opens the side panel`。
22. **PRR-22**（流程，P1）合并门禁：PR 只能在最后一轮评审的「要改」全部落实或被评审明确豁免后入队；共享核心（`packages/contracts`、`plugin-sdk`、`plugin-runtime`、`horizontal/agent-host` 等）必须在最终 head 上跑完 full-suite 且有绿灯证据；入队前在最终 head 上跑 main 的 health/assets/secrets；stacked PR 必须链父 PR，MERGEED 不等于在 main。`[人工]` 以合并队列日志、评审评论和 `git merge-base --is-ancestor` 记录为证据；把这条写进 PR 模板/并行开发文档。

## 5. 实施顺序

1. **P1 安全边界**：PRR-01、PRR-02；PRR-03 先与用户确认目录选择/同意交互，再实现服务。
2. **P2 功能/合同**：PRR-04、PRR-05、PRR-06、PRR-07、PRR-08、PRR-09、PRR-10、PRR-11、PRR-12、PRR-13。
3. **P3 可追溯与文档**：PRR-14、PRR-15、PRR-16、PRR-17、PRR-18、PRR-19、PRR-20、PRR-21。
4. **流程**：PRR-22 立即生效，不等待代码项。

PRR-01 和 PRR-05/PRR-06 都改 #839 的 knowledge 线；建议同一个 owner 按 01 → 05 → 06 做，避免三次改 `knowledge-actions.ts` 和契约快照。PRR-07 与 #851 的 stacked 分支有文件重叠，合入前先确认 #851 的状态。PRR-18 的 Pages 计数在 #847 后已经变过一次，重生成前先 `pnpm build` 并按当前树量。

## 6. 证据与限制

- 审计报告：[docs/reviews/pr-review-2026-10-17-to-20.md](../../docs/reviews/pr-review-2026-10-17-to-20.md)；逐 PR checklist 与 CSV 在同目录。
- 复现脚本（会话临时目录，未入库）的实测结果：
  - `tab-groups`：固定 Goals 插件标签后打开条目，`pluginGroup` 含固定插件标签 + 散条目，`closePluginGroup` 两者都关，剩余只有 home。
  - `after-write`：`src/a.js` 得到 `node --check a.js`；`./src/a.js` 得到 `{"unchecked":"没有适用于 .js 的检查器"}`。
  - `announce-guard`：`suggest-memory`/`suggest-action` 返回后 `actedThisRound=true`；只读 false。
  - `issue-ask`：`ISSUE_ASK` 在 `RENDERER_GAP_EN` 中没有键。
  - `coding-knowledge`：`consumes knowledge.list: false`，`invoke` 尝试 `knowledge.list`，catalog 为 `null`。
  - `knowledge-locate`：operation/kind/effect 都是 query/query/read，权限只有 `knowledge:read`，没有 `model:invoke`/`metered`。
  - `knowledge-workspace`：`discover`/`invoke` 的 caller 都是 `owner`，并读出了 `workspace_file`。
  - `todo-builtin`：`installIdentity(todoManifest)` 是 `plugin-install-6ed43d…`，不等于 `io.molis.work.todo`，`builtinOf` 条件为 false。
- 没有跑全量测试、浏览器用例、真实 Home 或真实模型；PRR-01 的端到端 host 调用因干净的审计工作树缺 `apps/workbench` 构建产物没有跑通，但 `KnowledgeWorkspace` 的 reader 行为和 `createKnowledgeHost.access` 的静态代码路径一致。实现时必须用真实 `PluginActionClient`/Host 测试补上。
- 本 spec 只覆盖当前 main 的确认问题；报告里 71 个 concern 不自动进入实现，未确认项见 §1.4。

## 7. 待用户决定

1. **PRR-03 的目录选择/同意交互**：是每次读取都弹一次目录选择，还是首次授权目录后按路径读、每次写入前再确认；目录服务放在 Host 的哪个入口。这个决定影响 PRR-03 的验收，不影响 PRR-02 先把非 user 受众关掉。
2. **PRR-06 的动作版本**：`knowledge.locate` 增加 `model:invoke`/`metered` 大概率会被动作快照记为「同一版本谁能调变了」。是保持 @1 并在 PR 里写明没有固定引用，还是升 @2 并改消费者，按 `docs/system/CONTRACT-CHANGES.md` 和实际引用决定。
3. **PRR-12 的灵光 UI 迁移**：工作面迁到 Runtime 视图可能是一整个迁移片；是否先合 PRR-10/11 的进度与体量修复，把 UI 迁移拆成后续片。无论怎么拆，三处构建期私路不能在 main 长期留着。
