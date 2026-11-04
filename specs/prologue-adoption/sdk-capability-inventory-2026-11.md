# 现有 SDK 能力盘点（路线书 24、31 批用，2026-11）

状态：只读盘点，2026-11-03 写。为路线书[第 24 批](../post-anticorruption-roadmap/reference/batches/24.md)「核清 SDK 缺口」和[第 31 批](../post-anticorruption-roadmap/reference/batches/31.md)「只按 24 核出的缺口补」提供依据。没有运行构建、测试或真实模型；能力「有」只说明公开包里有导出或系统工具，不等于 Molis 已接通或验收。

## 1. 口径

- **包**：`vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-memory-p0.tgz`，来自 Prologue [#107](https://github.com/molis-ai/molis-prologue/pull/107)（`1cc80b05`），SHA-256 `6893801b…`，见 [vendor README](../../vendor/prologue-sdk/README.md)。
- **方法**：解包后读 `dist/**/index.d.ts` 的公开导出、系统工具注册名（`name: "…"`）和关键实现（如 `composition/core/agent-run-admission.js`）。Molis 的消费情况用 `horizontal/agent-host/src`、`apps/local-host/src`、`plugins/native/*/src` 里对符号或工具名的引用计。
- **和 [§3.1](spec.md#31-已有与待补的-sdk-边界) 的关系**：§3.1 写于 Prologue `c4b9fde3`。此后 P1–P4 与换包 #814、#887 已进 main，TaskBoard 的尝试、接续、等待、负责人等文件现在都在包里。§3.1 的「必须补齐」列要按本文重新核过，不能直接当作现在的缺口。
- **结论分三类**：**有**（包里已有，缺口在 Molis）、**上游缺**（包里没有，31 要请 Prologue 补）、**待核**（导出在，但不确定能不能满足需求，要写一个小用例才能定）。

## 2. 包里有哪些模块

公开入口是 `.`、`./node`、`./tauri`、`./testing`。和 24、31 相关的模块与主要导出：

| 模块 | 和本盘点相关的导出 |
| --- | --- |
| `orchestration` | 子代理（`createSubagentRegistry`、`SubagentControls.steer`、`MAX_STEER_CHARS`、`recoverSubagents`）；TaskBoard（`taskboard-attempts`、`-continuations`、`-waits`、`-ownership`、`-progress`、`-editing`、`-queries`，`driveBoard`、`readyNodes`、`planGoals`/`planTasks`）；等待（`waits` 的 `mode: "all" \| "any"`）、外部检查（`external-checks`：`ExternalCheck`、`CheckSchedule`、`CheckerDescriptor`）；后台（`createLocalQueue`、`createHeartbeatRegistry`、`BackgroundClaim`）；协作策略（`merge`、`BUILT_IN_STRATEGIES`）；验收（`verifyAcceptance`、`proposeRepair`、`createRefineEngine`） |
| `composition` | `createRuntime`；`runtime.subagents.{list,get,cancel}`；`SubagentRunOptions`、`subagentDispatcher`、`freezeSubagentWorkspaces`、`createSubagentWriteback`；写后检查（`checkAfterWrite`、`afterWriteCheckReceiptKey`、`afterWriteCheckOperationKey`）；恢复（`assemble-recovery`、`subagent-recovery`、`refreshClosedSubagentRun`）；App 模式（`APP_MODE_*`） |
| `session` | 输入队列（`inputQueueView`、`takeQueued`、`withdrawQueued`、`assertQueueInput`，条目带 `about`）；输入回执（`projectInputReceipts`、`InputReceiptState`）；待答（`createPendingLedger`、`answerHeldPending`、`cancelHeldPending`、`reviveHeldPending`、`PendingAbout`）；目标（`SessionObjective`、`judgeObjective`、`ObjectiveEvidence`）；导出、搜索、分叉、回退 |
| `agent` | `AgentControl`：转向（`SteerInput.about`、`SteerReceipt`）、暂停、`requestYield`/`takeYield` |
| `observability` | `createEvidenceLedger`（`ChangeEvidence`、`CheckEvidence`、`CompletionEvidence`、`EvidenceGap`、`EvidenceClaim`）；`listOpenWork`、`runtimeListOpenWork`（`OpenWorkItem`、`OpenWorkReport`） |
| `ui-control` | `ScreenshotPolicy`、观察结果 |
| `skill` | `createSkillRegistry`、`discoverSkills`、`installSkill`、`prepareSkillIntent`、`fillSkillBody`、`runRecipe`、`scanPackage`；`SkillCatalogEntry` 带 `humanInvocable`、`autoSelectable`；`SkillInvocationMode = "inline" \| "fork"` |
| `scenario-pack` | 官方场景包；写后检查一段明写「SDK 不内置语言服务器」，跑 tsc、eslint 还是 LSP 由执行器定 |
| `memory` | 129 个导出（CAS、分类、可信来源、采用与恢复）；本次不盘，见第 5 节 |

系统工具（模型可调）：`acknowledge-inputs`、`ask-user`、`await-commands`、`await-subagents`、`board-plan`、`board-read`、`board-report`、`board-revise`、`board-wait`、`dispatch-subagent`、`steer-subagent`、`hand-off`、`invoke-skill`、`find-tools`、`session-create`、`session-fork`、`session-inject`、`session-list`、`session-send`、`session-wait`、`session-archive`、`surface-act`、`surface-list`、`surface-observe`、`update-todo`、`sleep`、`web-search`、`fetch-page` 等。**没有** `find-skills`，**没有**代码智能（LSP）类工具。

## 3. 第 24 批逐项

### 3.1 第 1 项：Prologue 采用与任务能力核准

| 需求 | 包里 | Molis 现在 | 结论 |
| --- | --- | --- | --- |
| A5：按 main 重核原 1–23 项、存储与预算（BL-309，PA-12、PA-15） | 第 1–23 项涉及的 SDK 能力都在（预算、状态事件、副作用分类、微压缩回执、推理力度、换模型、逐轮变更、流式、变化等待、sleep、会话条目等） | §6.0b 是 10-14 的结果，之后 P3、P4、A2 改过多处 | **有**。缺口全在 Molis：逐项重标采用、验证或按边界不做。不需要上游 |
| 写后检查，主轮（A2-2，#822） | `checkAfterWrite`、`afterWriteCheckReceiptKey`，执行器只解析不执行 | `adapters/prologue-after-write.ts` 已接，回执在运行视图 `command_outputs` | **有**，已接 |
| 写后检查进时间线（BL-301，PA-35） | 回执键已有 | 时间线还没读回执 | **有**；缺口在 Coding 时间线 |
| 写后检查浏览器证据（BL-303，PA-29） | — | 审查卡截图未单独留 | **有**；缺口是 Molis 的浏览器验收 |
| 子任务目录里的写入也跑写后检查（BL-302） | 写后检查挂在写工具上（`system-tools-workspace`）；`SubagentRunOptions`、`subagent-dispatch` 的类型里看不到执行器或 `afterWrite` 的承接 | 子任务会话由 SDK 派出，不经 `startPrologueRun`，没接执行器 | **待核**：先在 Molis 用 `SubagentRunOptions` 给子 Run 接执行器，看写后检查会不会发出；发不出就是上游缺（子 Run 要能承接父 Run 的写后检查配置） |
| 截图、进展进时间线 | `ScreenshotPolicy`、`surface-observe`/`surface-act`，`board-report` | `prologue-surfaces.ts`、`computer-driver.ts` 用 `surface-observe` | **有**；时间线呈现在 Molis（「既有呈现复用」） |
| 输入回执：接收、放进上下文、读到、没读到 | `acknowledge-inputs`、`projectInputReceipts`、`InputReceiptState` | `prologue-inputs.ts`、`coding/report-inputs.ts` 已接 | **有**，已接 |
| 输入回执：跨轮持久排队、撤回、纠正带 `about`（BL-314，阶段 4 后一半） | `inputQueueView`、`takeQueued`、`withdrawQueued`，排队条目和转向都带 `about` | 没有消费 `inputQueueView`/`takeQueued` | **有**；缺口在 Molis 的阶段 4 后一半 |
| 待答带 `about`，回答、过期、取消 | `PendingAbout`、`answerHeldPending`、`cancelHeldPending`、`reviveHeldPending` | 部分已接（问卷线） | **有** |
| TaskBoard：节点绑定、执行尝试、接续、等待、负责人 | `taskboard-*` 全套、`board-*` 工具、`driveBoard`；`waits` 支持 `all`/`any`；`external-checks` 的检查端口与时间表 | `prologue-collaboration.ts`、`prologue-node-port.ts` 已接 P1–P4 | **有**。§3.1 TaskBoard、waits 两行的「必须补齐」看起来已进包，要逐条对一遍 P1–P4 的合并记录再划掉 |
| P5 协作与关联线集成（BL-307） | 同上，加 `session` 的输入与待答 | 没开工 | **有**；缺口在 Molis |
| Run 与恢复：重启后不补跑、不复活、不双唤醒（BL-308） | `assemble-recovery`、`subagent-recovery`、`recoverSubagents`、`refreshClosedSubagentRun`、`reviveHeldPending` | `prologue-recovery.ts` 已接一部分 | **有**；缺口是 Molis 的旧路径退出和联合恢复验收 |
| App 模式（无文件根的业务工具 Agent）带子代理 | `agent-run-admission.js` 仍然拒绝：App-tools Agent 不能带 `subagents`、skills、MCP、挂载 | 助理等 App 模式 Agent 不能派子代理 | **上游缺**（§3.1 已列，现包仍未补） |

### 3.2 第 2 项：Memory P0 非上游余项

按用户原暂停不动，本文不盘。包里的 Memory 能力见 [Prologue 记忆方案](../prologue-memory-strategy/spec.md)。

### 3.3 第 3 项：逐项交付与证据关联合同

| 需求 | 包里 | 结论 |
| --- | --- | --- |
| 一次执行做了什么、查了什么、做完的依据 | `createEvidenceLedger`：改动、检查、完成三类证据和 `EvidenceGap`（缺证据时明说缺） | **有**，Molis 还没消费。可以当作「执行证据」的引用来源 |
| 还没做完的事 | `listOpenWork`/`runtimeListOpenWork` | **有**；Molis 在 `assistant-present.ts`、`prologue-stream.ts` 等处用了 |
| 目标达成的判断 | `SessionObjective`、`judgeObjective`、`ObjectiveEvidence` | **有**，Molis 没用 |
| 逐项要求、产物版本、用户决定 | 不在 SDK：这些是插件的事实（Goal、成果库、各插件） | **不归 SDK**。合同在 Molis，由原主人关联；SDK 只给执行证据的引用。不需要上游 |

所以第 3 项不需要等 SDK：合同和关联都在 Molis 写，执行证据引用 `EvidenceLedger` 的条目，不另存一份。

## 4. 第 31 批逐项

| 需求 | 来源 | 包里 | 结论 |
| --- | --- | --- | --- |
| 后台协作 | prologue-adoption §4.6；Coding A4 | 后台队列、心跳、`hand-off`、`session-*` 工具、`await-commands`、`await-subagents`、`board-wait` 都在 | 普通 Agent **有**。**上游缺**：App 模式不能带子代理（见 3.1 最后一行），助理这类 App 模式 Agent 做不了有界后台协作 |
| 子代理：父代理转向 | subagent-interaction §5 | `steer-subagent`、`SubagentControls.steer`（下一个模型边界生效，2,000 字封顶） | **有** |
| 子代理：用户直接对子代理说话（SAI-02、SAI-03） | subagent-interaction §5 | `runtime.subagents` 只给 `list`/`get`/`cancel`。注释写明「给看、给掐，不给发话」，App 插话要走「插入动作那一册」 | **待核，多半上游缺**：要确认受信 App 能不能用会话级排队输入（`assertQueueInput`）投给子 Session，且回执来源记为用户、不经父模型代转。不能就是上游缺 |
| 子代理：结束后继续同一逻辑子任务（SAI-05） | subagent-interaction | `taskboard-attempts`、`taskboard-continuations` | **有**；Molis 侧接入未做 |
| 子代理：伪造身份、旧代次、已收回对象被拒（SAI-08） | subagent-interaction | `taskboard-ownership`，派出前授权（第 2 项） | **有**，要补拒绝用例 |
| 任务关联与恢复 | prologue-adoption P5、P6 | 见 3.1 | **有**；缺口在 Molis |
| LSP（代码智能） | Coding A4、A4-1 | 没有。官方场景包明写 SDK 不内置语言服务器 | **上游缺**：A4-1 要 SDK 的语言服务器模块（按文件类型按需启动、会话结束关闭）、只读工具「代码智能」，以及 Manifest `lsp_servers` 的声明式装配 |
| 首批 Skill 自动选用 | prologue-skill-strategy SKL-01～16 | 有 `invoke-skill`、`autoSelectable` 和 `humanInvocable` 两个开关、`inline`/`fork`、配方、权限岛。**没有** `find-skills`、选择器（`router`、`maxSelected`）；`SkillManifest` 没有 `description`、`when_to_use`、`when_not_to_use`、`applies_to`；参考与脚本没有按需读取 | **上游缺**：SKL-02（选择器）、SKL-03（只返回元数据的查找）、SKL-05（按需读取与路径校验）、SKL-07（回执带理由）、SKL-15（选中后工具可见）。SKL-01 的开关语义 SDK 已有字段，Molis 侧接入和点名优先可以先做 |
| Memory SDK 余项 | prologue-memory-strategy | — | 等原暂停解除，本文不盘 |
| 通过全部金样回放 | upgrade-continuity U2 | — | 不是 SDK 能力，见 [升级后持续可用](../upgrade-continuity/spec.md) U2（回放设计在分支 `claude/roadmap-05-u2-design`，随 U1 开 PR） |

## 5. 汇总

### 5.1 31 要请 Prologue 补的（上游缺）

1. **App 模式带有界子代理**：`agent-run-admission` 放行 `subagents`，同时给每个子 Session 装配业务工具，仍然没有默认的文件和命令权限（§3.1 原话：不能只删禁止条件）。
2. **语言服务器模块与「代码智能」只读工具**，Manifest 声明式装配（A4-1）。
3. **Skill 选择**：`find-skills` 只返回元数据、带上限的选择器和可解释理由、`SkillManifest` 补描述与适用条件、参考和脚本的按需读取与路径校验、回执带理由（SKL-02、03、05、07、15）。
4. **待核后可能要补的两项**：
   - 受信 App 代表用户向指定子代理投递输入（SAI-02、SAI-03）；
   - 子 Run 承接父 Run 的写后检查配置（BL-302）。

这些是 31 换包时「请 Prologue 改哪些」的候选，范围要用户定（31 前置里的「要决策：具体换包／上游范围」）。

### 5.2 24 现在就能做、不等 SDK 的（缺口在 Molis）

- A5 逐项重核（BL-309）；
- 写后检查进时间线（BL-301）和浏览器证据（BL-303）；
- 输入回执阶段 4 后一半（BL-314）；
- P5 协作与关联（BL-307）、P6 旧路径退出与恢复验收（BL-308）；
- 逐项交付与证据关联合同（第 3 项）：合同在 Molis，执行证据引用 `EvidenceLedger`。

### 5.3 待核清单（各需一个小用例）

| 编号 | 要核的 | 怎么核 | 核不过意味着 |
| --- | --- | --- | --- |
| K-1 | 子 Run 会不会发出写后检查 | 在隔离 Home 里用 `SubagentRunOptions` 给子 Run 接执行器，让子代理写一个文件，看有没有 `afterWriteCheck` 调用和回执 | BL-302 变成上游缺 |
| K-2 | 受信 App 能不能把用户输入投给子 Session | 用 `assertQueueInput` 投给子 Session，查回执来源是否为用户、子代理是否读到原文 | SAI-02、03 变成上游缺 |
| K-3 | §3.1 TaskBoard、waits、yield 三行的「必须补齐」是否都已进包 | 对照 P1–P4 合并记录和 `taskboard-*` 的类型逐条划掉 | 剩下的并入 5.1 |

## 6. 不在本文范围

- 不改 `vendor/prologue-sdk`，不提出新的 SDK 方法名（subagent-interaction §5 的要求：先核现行 API 再补真实缺口）。
- 不评估 Memory。
- 「有」只是包里有导出；Molis 接通、用例和真实动线分别按各原需求的验收编号另验。
