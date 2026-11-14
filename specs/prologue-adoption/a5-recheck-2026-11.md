# A5：原 1–25 项按 main 重核（路线书第 24 批第 1 项，2026-11-11）

状态：重核完成（BL-309）。这是 [prologue-adoption](spec.md) §5.2 的 A5，取代 [§6.0b](foundation-records.md#60b-现状核对2026-10-14) 作为现状依据；§6.0b 留作 10-14 的记录。SDK 一侧（包里有没有）看[现有 SDK 能力盘点](sdk-capability-inventory-2026-11.md)，本文只回答 Molis 一侧：每项是已采用、已有工程证据，还是按已定边界不做，以及剩下的归哪一批。

验收编号：不新增。本文是 PA-12、PA-15 的对照依据，不是它们的通过记录：PA-15 还要 P5、P6 做完和真实动线（第 3 节）。

## 1. 口径

- **基点**：Molis main `7a39c25bc`（2026-11-11）。包是 `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-memory-p0.tgz`，和盘点同一个。
- **怎么核的**：逐项打开 §6.0b 点名的实现文件和用例，确认仍在、仍断言那件事；10-14 之后改过的（P3、P4、A2、防腐线）按现在的文件重新找。没有为这次重核单独跑测试、没有运行真实模型、没有碰真实 Home；下表点名的用例在 main 上，随每次合入的 CI 全量跑，并列进本批统一测试的清单再跑一遍。
- **三级证据分开**：「工程」指 main 上有断言这件事的用例。「实操」「本人验收」在本文里都是**没有新增**：采用线 10-20 停下后没有人在隔离 Home 里用真实模型走过这些路径，下表不把工程证据写成实操。
- **结果用词**：已采用（实现和工程证据都在）、部分（写明缺什么、去哪）、不做（写明谁、哪天定的边界）、暂缓（没有需求或验收环境，有了再开）。

## 2. 逐项结果

| # | 项 | 结果 | 现在的依据（main `7a39c25bc`） | 和 10-14 比 | 剩下的 / 去处 |
| --- | --- | --- | --- | --- | --- |
| 1 | 思考覆盖输出预算 | 已采用 | `horizontal/agent-host/src/adapters/prologue-run-params.ts` 的 `runModelParams`：显式 `max_output_tokens` 优先，没给才用思考上限；`tests/model-thinking.test.ts` | 不变 | — |
| 2 | 模型派出前授权 | 已采用 | `tests/action-before-effect.test.ts`：Form、Dataset、灵光、Pages、Cognia、**PPT** 六个插件 × 撤权、停用、取消，断言零派出、库不变 | 10-14 缺的 PPT 一行已由 §6.0h 补上 | — |
| 3 | 新状态与事件 | 已采用 | `prologue-stream.ts` 认 `sleeping`、`turn-changes`、`model-switched`、`agent-control`；`tests/prologue-stream.test.ts`、`tests/prologue-status-projection.test.ts` | 让出的投影已随 P3 接通（见 13） | — |
| 4 | 工具副作用分类 | 已采用 | `prologue-action-tools.ts`：只有 `operation=query` 且 `actionEffect=read` 是 `safe-read`；`prologue-action-gateway.ts` 的改动类工具都是 `mutate-external`；`tests/assistant-business-gateway.test.ts`、`tests/agent-action-tools-prologue.test.ts` | 不变 | — |
| 5 | 修改回执与微压缩 | 已采用 | `tests/assistant-business-gateway.test.ts`「a change's receipt survives micro-compaction…」：真实网关，压缩确实跑了，修改回执还在 | 10-14 缺的请求级证据已由 §6.0h 补上 | — |
| 6 | 推理力度 | 已采用 | `prologue-frozen.ts`；`tests/prologue-model-controls.test.ts`、`tests/coding-model-controls.e2e.test.ts`（PA-24） | 不变 | — |
| 7 | 运行中换模型 | 已采用，两个分支没有用例 | `prologue-model-switch.ts`；`tests/prologue-model-controls.test.ts` 覆盖下一边界生效、四种拒绝、停止时零请求、重启后冷读、从断点继续后重新解析模型与凭据 | 「接受之后撤权」「断点继续」两条已由 P3b 补 | 视觉、Runtime 不支持切换两个分支仍然造不出来（§5.6a），不算缺口，留记录 |
| 8 | 逐轮变更 | 已采用 | `prologue-stream.ts` 的 `turn-changes` 投影；Coding `turn-changes-client.ts`；`tests/coding-timeline.e2e.test.ts` | 不变 | — |
| 9 | 写后诊断（写后检查） | 已采用 | A2-1（Prologue）、A2-2（#822：`adapters/prologue-after-write.ts`、审查卡、S-42）、A2-3（#805：项目设置里的检查器）都在 main；`tests/coding-diagnose-after-write.test.ts`、`tests/prologue-write-checkers.test.ts`、`tests/write-checkers-settings-http.test.ts`、`tests/write-checkers-settings.e2e.test.ts`；时间线读回执与审查卡的浏览器验收在第 24 批补上（原 BL-301、BL-303，`tests/coding-diagnose-timeline.e2e.test.ts`） | 10-14 是「未做」 | 子任务目录里的写入（BL-302）上游缺，去 [31](../post-anticorruption-roadmap/reference/batches/31.md)。BL-160、BL-171、BL-220 都在等真实用量或上游，原样保留 |
| 10 | 文字增量、停止与错误 | 已采用 | 灵光的流式、Stop、断连取消；`tests/lingguang-plugin.e2e.test.ts` | 不变 | — |
| 11 | 结构化生成 | 不在本线做 | `apps/local-host/src/alchemist-prologue.ts` 仍把 schema 写进提示词再解码 | 仍未做 | 2026-10-27 并入 BL-377（Alchemist 场景重做），见 BL-306；去 [82](../post-anticorruption-roadmap/reference/batches/82.md)。本线不再单列 |
| 12 | 变化等待 | 已采用 | 助理 `assistant/assistant-wait.ts`；Schedule 的 `adapter.observe`；`tests/assistant-work-wait.test.ts`、`tests/schedule-task-runner.test.ts` | 协作视图的版本已随 P3 | — |
| 13 | Coding 子代理让出与续做 | 已采用 | `subagentYieldGuard` 已删（全仓无引用）；让出走 SDK 的等待与接续，Coding 只读协作视图（`plugins/native/coding/src/waits.ts` 现在是只读投影，不碰存储）；`tests/prologue-subagents.test.ts`、`tests/prologue-work-waits.test.ts`、`tests/coding-collab-handoff.test.ts` | 10-14 是「按 A0 边界拒绝」 | Coding 还留着 `last-start:<session>`、`wake-note:<wait>` 两个存储键（`start-round.ts`、`wake-loop.ts`）：是这一轮的启动参数和给人的留言，不是协调状态；P6 核对旧路径退出时一并看（BL-308） |
| 14 | 助理委派交回与续做 | 已采用 | 私有的 `handed_back_run`、`hand_back_held` 已不在 `apps/local-host/src/assistant/`；交回改用 SDK 的等待与接续（§6.0n）、每个 Work 一块任务图（§6.0k）、后台作业是图上的一步（§6.0o）；`tests/assistant-delegation-handback.test.ts`、`tests/assistant-handback.e2e.test.ts`、`tests/prologue-work-jobs.test.ts` | 10-14 是「私有实现在 main」 | — |
| 15 | 休眠 | 不做（工具不开放） | 投影见第 3 项；`horizontal/agent-host/src/tool-catalog.ts` 把 `sleep` 列为不给，理由写在表里：一轮等的是事情（`board-wait`、`await-commands`），不是时间 | 从「暂不开放」变成目录里的明确决定 | 有具体场景再按 §4.7 开 |
| 16 | 会话条目 | 不做 | 全仓没有 `appendEntry` 调用方 | 10-14 是「归回执线」 | 回执线 2026-10-15 删掉了这项（[ai-input-receipts](../ai-input-receipts/spec.md)「~~会话条目记录收下的输入~~」）：收下的输入只有 Prologue 会话的输入记录一个主人，Molis 不另存 |
| 17 | 记忆边界 | 已采用 | `tests/prologue-memory-boundary.test.ts`（S-13） | 不变 | — |
| 18 | 写前密钥扫描 | 已采用 | `plugins/native/coding/src/timeline-words.ts`；`tests/coding-timeline.e2e.test.ts` | 不变 | — |
| 19 | 副本血缘 | 暂缓 | 没有 `copyOf` 调用方 | 不变 | 依据 §4.7 |
| 20 | 租约排队 | 暂缓 | 没有用 SDK 的租约排队 | 不变 | 依据 §4.7 |
| 21 | 企业网络 | 暂缓 | 没接 Node Host 的代理与额外 CA | 不变 | 依据 §4.7；没有需求和验收环境 |
| 22 | 审计导出 | 暂缓 | 没有用 SDK 的审计 exporter | 不变 | 依据 §4.7 |
| 23 | 点名扩权 | 已采用 | `horizontal/agent-host/src/reviews.ts`；`tests/agent-review-surface.test.ts`、`tests/agent-review-standing.test.ts`（S-22） | 不变 | — |
| 24 | TaskBoard 统一协作 | 部分：P1–P4 已采用 | `adapters/prologue-collaboration.ts`、`prologue-node-port.ts`、`prologue-recovery.ts`；`tests/prologue-taskboard.test.ts`、`tests/prologue-project-board.test.ts`、`tests/prologue-board-origins.test.ts`、`tests/agent-collaboration-revise.test.ts`、`tests/prologue-recovery.test.ts` | 10-14 是「Molis 未接」 | **P5**（BL-307）、**P6**（BL-308）没开工，见第 3 节 |
| 25 | 外部条件等待 | 已采用 | `adapters/prologue-checkers.ts`（`molis.action-query`、`molis.file-present`），每次检查按登记那一轮的授权重新核；助理的 `watchJob`、`checkJob` 已迁成工作图上的一步（全仓无引用）；`tests/prologue-external-checks.test.ts`、`tests/prologue-work-jobs.test.ts` | 10-14 是「Molis 未接」 | — |
| — | 存储写声明 | 已采用 | `tests/prologue-storage-claims.test.ts` | 不变 | — |
| — | 墙钟预算 | 已采用 | `tests/agent-budget-prologue.test.ts` | 不变 | — |

合计 27 行：已采用 18，部分 2（第 9、24 项），不做 3（第 11、15、16 项，各有出处），暂缓 4（第 19–22 项）。

## 3. 输入、TaskBoard、Run 与恢复：还缺什么、归哪一批

盘点已经核过包里都有（[盘点第 3.1 节](sdk-capability-inventory-2026-11.md#31-第-1-项prologue-采用与任务能力核准)）。下面是 Molis 一侧没做的，逐项写去处；第 24 批只核清，不做这些实现。

| 缺口 | 现状（main `7a39c25bc`） | 去处 |
| --- | --- | --- |
| 输入回执阶段 4 后一半：Goal 页「来自对话的输入」（BL-314，RCPT-384～389） | 包里的 `inputQueueView`、`takeQueued`、`withdrawQueued` 只有 `adapters/prologue-node-port.ts` 在用；Goals 一侧没开工 | [53-1](../post-anticorruption-roadmap/reference/batches/53.md#batch-53-item-1)「Goal 对话输入」 |
| P5 协作与关联线集成（BL-307，PA-13）：同一输入键和节点能找到消息、Run 和成果 | 没开工 | [31](../post-anticorruption-roadmap/reference/batches/31.md) 的「任务关联」。不需要换包，按 31 写的「现有 SDK 可做的消费者不等本窗口」可以先于换包做；[32-1](../post-anticorruption-roadmap/reference/batches/32.md#batch-32-item-1) 的后台任务要用它定位 |
| P6 旧路径退出与恢复验收（BL-308，PA-14、PA-15、PA-21） | `prologue-recovery.ts` 接了一部分；存量会话在隔离副本里维护成现行形状的演练没做；Coding 的两个存储键见第 13 项 | [31](../post-anticorruption-roadmap/reference/batches/31.md) 的「恢复、退出旧路径」；关窗、重启、休眠后不补跑不双唤醒（PA-21）和 [25-1](../post-anticorruption-roadmap/reference/batches/25.md#batch-25-item-1) 是同一组行为，25-1 做常驻与休眠时一起验 |
| 给子代理转用户的话记成 `app` 而不是人（SAI-03） | `adapters/prologue-run.ts` 两处 `control.steer({ text, source: "app" })` | [58](../post-anticorruption-roadmap/reference/batches/58.md)「输入归属」 |
| 子 Run 的写后检查（BL-302）、继续已结束的子代理、App 模式带子代理、LSP、Skill 自动选用 | 上游缺 | [31](../post-anticorruption-roadmap/reference/batches/31.md)「请 Prologue 补的清单」，范围等用户定 |
| 执行证据（`createEvidenceLedger`、`EvidenceGap`）、会话目标（`SessionObjective`、`judgeObjective`） | 全仓没有引用 | 本批第 3 项没有接：证据取自 agent-host 已有的命令回执与轮次活动（`agent.evidence.check@1`），接 `EvidenceLedger` 留给 31 批（BL-goal-evidence-limits ④）；见[批次文件](../post-anticorruption-roadmap/reference/batches/24.md#batch-24-item-3) |

## 4. 对 PA-12、PA-15 的结论

- **PA-12**（§4.1–4.5、§4.7 的各项仍成立）：工程证据齐（第 9 项的时间线一半已在第 24 批补上），除第 11 项（已移出本线）。真实模型的证据没有新增。
- **PA-15**（整线内部完整）：**还不能标**。差 P5、P6（第 3 节），以及两仓工程之外的真实动线和重启恢复记录。本文只是它要的「逐条对照」那一半。
