# 已删除或不在 main 的 BL 编号

本表只做墓碑，不重新打开事项。现行文档引用历史编号时先查这里；`specs/backlog/` 下没有对应文件，不代表事项仍未处理。

上半张表是关键历史编号和替代关系；末尾「缺失编号速查」是完整允许名单，按当前活文档生成，不是新的待办。两者重复的编号以替代关系为准。

| 编号 | 处置 | 依据 / 替代 |
| --- | --- | --- |
| BL-feed-sql-driver-name、BL-feed-run-now-missed-again、BL-missed-runs-never-expire | 已完成并删除 | 第 95 批（2026-11-18）：Feed 连接工厂改名 `fromProjectConnection`；「现在做」把来源放回错过的那一刻并在错过记录上留决定，睡眠或重启后照做一次、不再问；Feed、定时任务、助理跟进错过的事都从 `due_at` 起留七天，到期没处理的自动跳过（一次性提醒与任务一并结束），运行面板与首页汇总一次，「知道了」记在 `run/expired-seen.json`；见 [95.md](../specs/post-anticorruption-roadmap/reference/batches/95.md) |
| BL-plugin-cli-dev-uncoded-errors | 已完成并删除 | 2026-11-19：`molis-work plugin dev` 被拒时各给自己的码，不再一律报 `plugin.manifest_invalid`：普通非空状态目录 `host.plugin_development_directory_occupied`（目录原样不动）、标记不认得 `host.plugin_development_directory_unsupported`、漏写 `--allow-unsigned-development` 为 `plugin.unsigned_development_required`、dev 其余无码失败兜底 `plugin.development_failed`；`plugin.manifest_invalid` 兜底只留给 `validate`，手册与 Skill 的「误报」说明已删。归入 [48-1](../specs/post-anticorruption-roadmap/reference/batches/48.md#batch-48-item-1) 的 CLI 子项，已由 [#2152](https://github.com/molis-ai/molis-work/pull/2152)（`517c2c6716`）合入；48-1 其余照原排期。 |
| BL-attention-404-by-code | 已完成并删除 | 2026-11-19：宿主只在目录库说没有这个项目时回 404 并带 `catalog.project_not_found`，目录库读失败不再报成 404，不指向项目的地址仍是不带码的 404；工作台提醒（`attention.ts`）的读取与事件流只在这个码上停读，别的 404 当普通失败、照原节奏重连并自行恢复。归入 [56-1](../specs/post-anticorruption-roadmap/reference/batches/56.md#batch-56-item-1) 的提醒子项，已由 [#2160](https://github.com/molis-ai/molis-work/pull/2160)（`a462bf81f2`）合入；56-1 其余照原排期。 |
| BL-desktop-same-version-install | 已完成并删除 | 第 94 批（2026-11-19）：开发机重装同版本 App 后，打开就换上新构建——桌面在版本相同时比两边构建指纹 `dist/.molis-work-build.json` 的 `created_at`，只装更晚的构建，回退保留照旧先判（`apps/desktop/adapters/tauri/src/web_service.rs`）；隔离 Home 实操 DSV-01～05 见 [94.md](../specs/post-anticorruption-roadmap/reference/batches/94.md) |
| BL-knowledge-restore-partial-catalog | 已完成并删除 | 第 73 批 73-3 知识卡切片（2026-11-18）：Search 的 `indexedCatalog` 给出 `unsettled()`（主人登记但索引里没有完整一遍的来源），`KnowledgeOrganizer.reconcile` 不按这些来源判卡不在，打开卡片与后台整理两条入口都保住卡的行号、正文、手改与排除，不重复花额度；完整列过且主人确实删了的照旧清理。本项验收「恢复 Home、搜索索引还没追齐时保住知识卡，用缺失条目稍后重新出现的样本回归」由回归 `tests/knowledge-cards.test.ts`、`tests/knowledge-fresh-catalog.test.ts` 覆盖（条目在来源追齐前缺席、追齐后重新出现）；见 [73.md](../specs/post-anticorruption-roadmap/reference/batches/73.md#batch-73-item-3) |
| BL-980 | 已完成并删除 | 2026-11-18：`openHomeSqliteFile`（`packages/storage/src/home-sqlite.ts`）的注释分开写只读与可写两种打开——只读遇缺失文件报错且不建文件，可写会建空库，`file:` URL 带 `mode=rw` 不建；行为未变，来源 [#1255 评审](https://github.com/molis-ai/molis-work/pull/1255#issuecomment-6392998821) 不挡合并第 4 项。归入 [92-2](../specs/post-anticorruption-roadmap/reference/batches/92.md#batch-92-item-2)，已由 [#2145](https://github.com/molis-ai/molis-work/pull/2145) 合入。 |
| BL-917 | 已完成并删除 | 第 61 批（2026-11-18）：Feed 账号来源扩到 Home 能按账号拉取的每个服务——平台 `services.sourcePull.accounts()` 答已连接、能否拉取与服务名，Feed「其他服务的账号」一处选服务；见 [服务矩阵 §3](../specs/assistant-service-connections/service-matrix.md) |
| BL-action-card-outcome-text、BL-work-brief-source-name-text | 已完成并删除 | 2026-11-17：动作卡片结果与 Work Brief 来源名改存文字引用（`OwnedTextRef`），助理库 1→2、项目库 4→5、Work Brief 库 1→2 把旧句子转成 `{ literal }`（见 `docs/system/CONTRACT-CHANGES.md`「存下的句子改成文字引用」） |
| BL-359、BL-360 | 已完成并删除 | 第 39 批（2026-11-16）：`AgentReviewQueue` 在拒绝、取消、到期与结算后释放执行闭包与宿主签发 caller（`horizontal/agent-host/src/reviews.ts`、`apps/local-host/src/plugin-callers.ts`、`tests/agent-review-lifecycle.test.ts`、`tests/prologue-git.test.ts`）；待审投影携带 `AgentReviewDecisions` 可决定性，恢复或撤权后不再提供无效批准按钮且保留草稿与焦点（`tests/agent-review-decisions.test.ts`、`tests/agent-review-http.test.ts`、`tests/agent-review-presenters.e2e.test.ts`）；见 [39.md](../specs/post-anticorruption-roadmap/reference/batches/39.md) |
| BL-328 | 已完成并删除 | 第 30 批「最小真实评测路径」补齐隔离 Home 可复现评测命令 `pnpm eval:run`（`scripts/run-evaluation.mts`），严拒 `~/.molis-work`、默认 stand-in 可复现校验并支持 Gemini 在线模式内联读取密钥跑完删 Home；见 [30.md](../specs/post-anticorruption-roadmap/reference/batches/30.md) |
| BL-051、BL-182、BL-222、BL-540 | 已完成并删除 | 第 33 批（2026-11-14）：子任务尝试预算与「再给 3 次」、子任务重试带 `source: "host"`、命令未知结局与四节收尾报告及步骤进度扣除、Coding 经宿主公开启动时刻判断中断（不再调 `process.uptime()`）；实物走查集中收成 [BL-batch33-acceptance](../specs/backlog/BL-batch33-acceptance.md) |
| BL-041、BL-102、BL-112、BL-138、BL-910、BL-958 | 第 27 批验收集中跟踪 | 第 27 批 #2010 收成 [BL-batch27-acceptance](../specs/backlog/BL-batch27-acceptance.md)；原条目删除 |
| BL-091、BL-096、BL-103、BL-131、BL-367、BL-569、BL-701、BL-803、BL-819、BL-821、BL-901、BL-911、BL-913、BL-914、BL-915、BL-918、BL-919、BL-920 | 已完成并删除 | 第 27 批 #2010（`539d2d7d46`，2026-11-12）；验收余项见 BL-batch27-acceptance |
| BL-plugin-dev-state-dir-before-locale-check、BL-catalog-specimen-default-margin | 已完成并删除 | 第 14 批登记的两条小缺口，2026-11-13 14／27 收口 PR 修掉；见 [14.md 合入记录](../specs/post-anticorruption-roadmap/reference/batches/14.md#实现进度与合入记录) |
| BL-166 | 已完成并删除 | 第 42 批（2026-11-16）：通用技能「改一份我的」记住来源，`~~` 占位符换成自己用的，采用时可关掉原来的，原来的出新版时可看差别、带进草稿或先不管；见 [42.md](../specs/post-anticorruption-roadmap/reference/batches/42.md)。连接 MCP 仍在连接设置里做，技能只声明工具 |
| BL-goals-methods-as-skills | 已完成并删除 | 第 41 批第 2 项：规划与拆解方法是随系统自带的技能包，Goals 不再有方法库；见 [41.md](../specs/post-anticorruption-roadmap/reference/batches/41.md) |
| BL-376 | 已并入 BL-377 | [BACKLOG.md](../specs/BACKLOG.md) 顶部说明；Alchemist 由 [BL-377](../specs/backlog/BL-377.md) 整体重做，编号不复用 |
| BL-928 | 已完成并删除 | 真实 Home 干净重建，2026-11-07 #1914（`d125b36f5c`） |
| BL-linux-ci-browser-reds | 已完成并删除 | 2026-11-13 #2044 放宽首页截止、#2046 修其余 Linux 浏览器用例；批次 15 已记「BL 已删」 |
| BL-side-files-merged-reads | 已完成并删除 | 第 06 批 N52 已并入并完成；批次 06 与依赖表保留历史说明 |
| BL-b12-coding-executor-reads、BL-b12-secret-names-and-cut | 已完成并删除 | 第 12 批合后审计整改：Coding 执行改一次 `projectDirectories` 读、`shapes.ts` 改用合同类型、`readInstructions` 把回执带回页面；`contextFileSkip` 与 Rust 副本补常见密钥文件名，并钉住 vendored SDK 的截断句；2026-11-14 |
| BL-b12-onboarding-take-followups | 已完成并删除 | 第 12 批合后审计整改：承接失败/不可用时完成页说明原因并提供去插件页；2026-11-14 |
| BL-1074 | 已完成并删除 | [#2029](https://github.com/molis-ai/molis-work/pull/2029) 修复跨进程插件框架不跟随页面 reduced-motion；原生 Linux no-fail-fast full suite [43546443501](https://github.com/molis-ai/molis-work/actions/runs/43546443501) 的 shard 21 首轮 `coding-question-card.e2e` 6/6，无 CDP 超时；该 run 整体仍红在 shard 7／17（合并基线既有）与 shard 26 的 `workbench-frame-container.e2e`（该用例没有设页面 reduce，新逻辑只多一次页面读取，重试仍红，需在合并后的 main 上另核）；2026-11-14 删除 |
| BL-golden-prompt-uses-flaky、BL-materials-object-link | 已完成并删除 | 第 06 批合后审计（2026-11-13）：golden-prompt 偶发由生成期屏蔽知识整理 2 秒定时器稳定（`tests/golden-home.test.ts` 42/42）；资料对象链接恢复（`tests/appearance-side-windows.e2e.test.ts` 3/3，页面资源许可 +155 B）；见 [06.md 合入记录](../specs/post-anticorruption-roadmap/reference/batches/06.md#batch-06-audit) |
| BL-1071 | 已关闭；两个历史事项曾同号 | 2026-11-07 #1921 删除 S-102 的条目；Memory 的 SDK 采用随 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入。编号不再复用 |
| BL-memory-p0-closure | 已完成并删除 | Memory P0 经 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入；继续跟踪的事项已列在 [BACKLOG](../specs/BACKLOG.md) |
| BL-memory-p1-contract | 已完成并删除 | 第 31 批「SDK 窗口一」完成 Memory P1 合同四问拍板并落地 SDK / Host 接线（① 20 版计数历史覆盖整理撤销窗口且每条自动改动记结构化 `policy` + `trigger_evidence`；② `memory/memory.db` `2 → 3` 正文单一写主人；③ Export v2 嵌于 Molis 信封 v1 并整包拒绝旧 `goal_ids`；④ 适用条件切为通用对象引用 `applies.objects`）；见 [31.md](../specs/post-anticorruption-roadmap/reference/batches/31.md) |
| BL-1076、BL-1077 | 已按用户决定关闭 | 随 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入；[本人走查](../specs/backlog/BL-memory-own-app-walkthrough.md)另列，历史真实 Home 影响仍未知 |
| BL-161、BL-164 | 已完成并删除 | 第 12 批第一项（`4d8bc20bf2`）：计划卡与任务板按位置编号、「未开始」统一为「等待前一步」；见 [12.md 合入记录](../specs/post-anticorruption-roadmap/reference/batches/12.md) |
| BL-feed-wake-resets-page、BL-assistant-card-press-scrolls | 已修复并删除 | 随 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入，Feed FBR-07/FSS-35 与助理 AC-05 在[最终 Linux 全量](https://github.com/molis-ai/molis-work/actions/runs/43467505571)首轮通过 |
| BL-skill-hand-and-tools-consumers | 已关闭并删除 | 第 41 批：`find-skills`／`read-skill` 没有消费者，从 Molis 工具目录删掉，原因记在 `RUNTIME_TOOLS_NOT_OFFERED`；见 [Skill 策略 §10](../specs/prologue-strategies/skill.md) |
| BL-coding-skill-auto | 已完成并删除 | 2026-11-11 第 09 批审计整改补做，见 [specs/README](../specs/README.md) 与 [第 09 批](../specs/post-anticorruption-roadmap/reference/batches/09.md) |

其余在 git 历史中曾经出现、后来随事项完成或总表迁移删除的编号，按同一规则处理：先查对应 PR/提交，不为历史编号新建文件，也不复用编号。

## 已并入 BL-b16-server-text-residue

BL-455、BL-456、BL-457、BL-459、BL-460、BL-461、BL-462、BL-463、BL-464、BL-545、BL-546 已合并为 [BL-b16-server-text-residue](../specs/backlog/BL-b16-server-text-residue.md)。第 16 批 #2031（`206884b447`，2026-11-12）删除了所有 `plugins/native/*/src/en.ts`；旧条不再单独跟踪，残留服务端文案按新条逐插件核。

## 缺失编号速查（2026-11-13）

共 176 个编号在非归档文档里被引用，但 main 的 specs/backlog 没有对应文件。

| 编号 | 引用文件数 | 处置 |
| --- | ---: | --- |
| BL-915 | 13 | 已完成/并入/验收条目；见上表 |
| BL-411 | 11 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-701 | 11 | 已完成/并入/验收条目；见上表 |
| BL-491 | 10 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-910 | 10 | 已完成/并入/验收条目；见上表 |
| BL-1071 | 9 | 历史已删，Memory 分支复用；见上表 |
| BL-108 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-321 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-376 | 9 | 已完成/并入/验收条目；见上表 |
| BL-530 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-628 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-914 | 9 | 已完成/并入/验收条目；见上表 |
| BL-1076 | 8 | 只在 #2020 分支；见 BL-memory-p0-closure |
| BL-157 | 8 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-301 | 8 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-303 | 8 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-911 | 8 | 已完成/并入/验收条目；见上表 |
| BL-144 | 7 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-309 | 7 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-803 | 7 | 已完成/并入/验收条目；见上表 |
| BL-901 | 7 | 已完成/并入/验收条目；见上表 |
| BL-912 | 7 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-928 | 7 | 已完成/并入/验收条目；见上表 |
| BL-102 | 6 | 已完成/并入/验收条目；见上表 |
| BL-131 | 6 | 已完成/并入/验收条目；见上表 |
| BL-145 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-149 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-156 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-352 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-367 | 6 | 已完成/并入/验收条目；见上表 |
| BL-543 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-544 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-569 | 6 | 已完成/并入/验收条目；见上表 |
| BL-588 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-596 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-645 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-680 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-880 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-900 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-937 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-041 | 5 | 已完成/并入/验收条目；见上表 |
| BL-096 | 5 | 已完成/并入/验收条目；见上表 |
| BL-138 | 5 | 已完成/并入/验收条目；见上表 |
| BL-146 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-152 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-163 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-180 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-183 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-493 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-595 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-700 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-791 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-819 | 5 | 已完成/并入/验收条目；见上表 |
| BL-918 | 5 | 已完成/并入/验收条目；见上表 |
| BL-919 | 5 | 已完成/并入/验收条目；见上表 |
| BL-958 | 5 | 已完成/并入/验收条目；见上表 |
| BL-coding-skill-auto | 5 | 已完成/并入/验收条目；见上表 |
| BL-091 | 4 | 已完成/并入/验收条目；见上表 |
| BL-103 | 4 | 已完成/并入/验收条目；见上表 |
| BL-1058 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1077 | 4 | 只在 #2020 分支；见 BL-memory-p0-closure |
| BL-112 | 4 | 已完成/并入/验收条目；见上表 |
| BL-150 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-154 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-221 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-323 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-350 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-455 | 4 | 已并入 BL-b16-server-text-residue |
| BL-490 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-492 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-501 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-521 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-646 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-713 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-790 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-821 | 4 | 已完成/并入/验收条目；见上表 |
| BL-assistant-card-press-scrolls | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-feed-wake-resets-page | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-side-files-merged-reads | 4 | 已完成/并入/验收条目；见上表 |
| BL-121 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-130 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-141 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-143 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-151 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-172 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-181 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-300 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-354 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-356 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-366 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-379 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-388 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-403 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-404 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-459 | 3 | 已并入 BL-b16-server-text-residue |
| BL-470 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-545 | 3 | 已并入 BL-b16-server-text-residue |
| BL-546 | 3 | 已并入 BL-b16-server-text-residue |
| BL-581 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-583 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-589 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-691 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-710 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-711 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-715 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-802 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-814 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-913 | 3 | 已完成/并入/验收条目；见上表 |
| BL-920 | 3 | 已完成/并入/验收条目；见上表 |
| BL-935 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-936 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-browser-site-decisions-unreadable | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-composer-source-refresh | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-linux-ci-browser-reds | 3 | 已完成/并入/验收条目；见上表 |
| BL-golden-prompt-uses-flaky | 3 | 已完成/并入/验收条目；见上表 |
| BL-materials-object-link | 1 | 已完成/并入/验收条目；见上表 |
| BL-memory-p0-closure | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-083 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-088 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1036 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1067 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1074 | 2 | 已完成并删除；见上表 |
| BL-114 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-132 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-147 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-155 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-158 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-159 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-18 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-311 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-322 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-353 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-355 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-363 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-372 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-386 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-393 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-396 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-456 | 2 | 已并入 BL-b16-server-text-residue |
| BL-457 | 2 | 已并入 BL-b16-server-text-residue |
| BL-460 | 2 | 已并入 BL-b16-server-text-residue |
| BL-461 | 2 | 已并入 BL-b16-server-text-residue |
| BL-462 | 2 | 已并入 BL-b16-server-text-residue |
| BL-463 | 2 | 已并入 BL-b16-server-text-residue |
| BL-464 | 2 | 已并入 BL-b16-server-text-residue |
| BL-481 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-494 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-555 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-559 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-615 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-616 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-618 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-714 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-755 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-780 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-781 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-916 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-926 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-939 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-956 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-background-inherits-page-locale | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-catalog-specimen-default-margin | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-coding-write-check-row-acceptance | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-computer-records-shape | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-contract-comment-stale-versions | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-first-screen-gate-prework | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-json-parse-copies | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-local-protection-version-check | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-memory-p2 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-model-preference-save-overwrite | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-phone-home-tools-stay-visible | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-plugin-dev-state-dir-before-locale-check | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-020 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-090 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-099 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-100 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
