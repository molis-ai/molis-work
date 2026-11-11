# 现有 SDK 能力盘点（路线书 24、31 批用，2026-11）

状态：盘点完成。2026-11-03 读包写成；2026-11-04 用三个一次性用例核完第 5.3 节的 K-1～K-3，结果已回填。为路线书[第 24 批](../post-anticorruption-roadmap/reference/batches/24.md)「核清 SDK 缺口」和[第 31 批](../post-anticorruption-roadmap/reference/batches/31.md)「只按 24 核出的缺口补」提供依据。没有运行真实模型（用例用脚本化的假模型）；能力「有」只说明公开包里有导出或系统工具，不等于 Molis 已接通或验收。

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
| 写后检查进时间线（原 BL-301，PA-35） | 回执键已有 | 第 24 批接上：写入那一行读回执 | **有**；已用上 |
| 写后检查浏览器证据（原 BL-303，PA-29） | — | 第 24 批补了审查卡与时间线的浏览器用例 | **有**；已补 |
| 子任务目录里的写入也跑写后检查（BL-302） | 写后检查只在会话绑了带 `afterWriteCheck` 标记的包、且有执行器时才开（`agent-run-tool-runner`）；包只能经 `sessions.create`/`sessions.open` 绑定、对下一跑生效。子会话由 SDK 在派出时建，`SubagentRunOptions` 没有给子会话包或执行器的字段，`onStarted` 到时子 Run 已经开跑 | 子任务会话由 SDK 派出，不经 `startPrologueRun`，没接执行器 | **上游缺**（K-1 已核）：子 Run 要能承接写后检查的配置 |
| 截图、进展进时间线 | `ScreenshotPolicy`、`surface-observe`/`surface-act`，`board-report` | `prologue-surfaces.ts`、`computer-driver.ts` 用 `surface-observe` | **有**；时间线呈现在 Molis（「既有呈现复用」） |
| 输入回执：接收、放进上下文、读到、没读到 | `acknowledge-inputs`、`projectInputReceipts`、`InputReceiptState` | `prologue-inputs.ts`、`coding/report-inputs.ts` 已接 | **有**，已接 |
| 输入回执：跨轮持久排队、撤回、纠正带 `about`（BL-314，阶段 4 后一半） | `inputQueueView`、`takeQueued`、`withdrawQueued`，排队条目和转向都带 `about` | 没有消费 `inputQueueView`/`takeQueued` | **有**；缺口在 Molis 的阶段 4 后一半 |
| 待答带 `about`，回答、过期、取消 | `PendingAbout`、`answerHeldPending`、`cancelHeldPending`、`reviveHeldPending` | 部分已接（问卷线） | **有** |
| TaskBoard：节点绑定、执行尝试、接续、等待、负责人 | `taskboard-*` 全套、`board-*` 工具、`driveBoard`；`waits` 支持 `all`/`any`；`external-checks` 的检查端口与时间表 | `prologue-collaboration.ts`、`prologue-node-port.ts` 已接 P1–P4 | **有**（K-3 已核，见 5.3）。§3.1 TaskBoard、waits、yield 三行的「必须补齐」已进包 |
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
| 子代理：用户直接对子代理说话（SAI-02、SAI-03） | subagent-interaction §5 | `runtime.subagents` 只给 `list`/`get`/`cancel`；但 `onStarted` 交给 App 每个子 Run 的 `AgentControl`，`steer` 缺省来源是人、带幂等键和 `about`、有回执；子会话也是普通 `Session`，可以 `queueInput` | **有**（K-2 已核）：运行中的子代理收到 App 代用户发的话，模型看到的是用户原话；结束后在子会话排一句、再开一跑，原话也带了进去。Molis 现在给子 Run 转话一律用 `source: "app"`（`prologue-run.ts` 的 `watchChild`），缺口在 Molis |
| 子代理：结束后继续同一逻辑子任务（SAI-05） | subagent-interaction | `taskboard-attempts`、`taskboard-continuations` | 图上的尝试与接续**有**。但 K-2 核出：App 在子会话上直接开的一跑是普通 Run，子代理句柄仍是 `completed`，不记成同一子任务的新尝试 | **上游缺**：要一个「继续这个子代理」的入口，沿原父子关系，记成新尝试 |
| 子代理：伪造身份、旧代次、已收回对象被拒（SAI-08） | subagent-interaction | `taskboard-ownership`、`BoardScope.generation`，派出前授权（第 2 项） | 派出时**有**。但 K-2 核出：App 在子会话上开的续跑，SDK 不按子代理原来收窄的权限求交（派出时只给 `read`，续跑带上 `write`、`run-command` 也照收） | **上游缺**，和上一行同一个入口：续跑沿原权限求交。补上之前，Molis 自己续跑子会话时必须自己收窄 |
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
4. **子代理的两项**（用例核实）：
   - 子 Run 承接写后检查的配置（K-1，BL-302）；
   - 「继续这个子代理」的入口：沿原父子关系、按原来收窄的权限求交、记成同一子任务的新尝试（K-2，SAI-05、SAI-08）。

受信 App 代用户给子代理发话（SAI-02、SAI-03）**不缺**：运行中用 `AgentControl.steer`，结束后用子会话的 `queueInput`（K-2）。

这些已列进 [31 批](../post-anticorruption-roadmap/reference/batches/31.md)「请 Prologue 补的清单」，范围仍要用户定（31 前置里的「要决策：具体换包／上游范围」）。

### 5.2 24 现在就能做、不等 SDK 的（缺口在 Molis）

- A5 逐项重核（原 BL-309；2026-11-11 做完，见 [A5 重核](a5-recheck-2026-11.md)）；
- 写后检查进时间线和浏览器证据（原 BL-301、BL-303；2026-11-11 做完）；
- 输入回执阶段 4 后一半（BL-314）；
- P5 协作与关联（BL-307）、P6 旧路径退出与恢复验收（BL-308）；
- 子 Run 转话改用人作来源：Molis 给子代理转用户的话时不再一律记成 `app`（SAI-03）；
- 逐项交付与证据关联合同（第 3 项）：合同在 Molis，执行证据引用 `EvidenceLedger`。

### 5.3 待核清单与结果

三项都用一次性用例在临时目录里核过：测试走机器槽位（`MOLIS_WORK_SLOT_DIR=/tmp/molis-work-slots-node-a`、`--jobs 1`），模型是脚本化的假回复，不碰真实 Home。用例断言的是现在的缺口或宽松行为，留下会挡住以后的修复，所以跑完删掉，没有入库。

| 编号 | 要核的 | 怎么核 | 结果 |
| --- | --- | --- | --- |
| K-1 | 子 Run 会不会发出写后检查 | 照 `tests/prologue-writer-authority.test.ts` 的独立目录写入：协调者把子目录交给子代理，项目对主目录和子目录都存了 `node --check` 检查器；子代理把 `bad.js` 写成语法错误，人批准写入 | **不会**。审查只有派出和写入两张，没有检查命令；写入结果里没有检查输出，文件照写。同一检查器在主轮里会发（`tests/coding-diagnose-after-write.test.ts`）。原因见 3.1 BL-302 一行：子会话拿不到包和执行器。**上游缺** |
| K-2 | 受信 App 能不能把用户的话投给子代理 | 直接用 SDK：父 Run 绑一个任务图节点后派出只读子代理；①子 Run 第一次调模型时，App 用 `onStarted` 给的 `control.steer` 发一句（不写来源）；②子代理结束后，App 在子会话 `queueInput` 一句，再在子会话上开一跑、带上排队输入，工具多给 `write`、`run-command` | ①**能**：有回执，子 Run 下一次调模型时这句作为用户消息出现。②**能投**：队列里来源记为人，开跑后记 `carried`，模型收到原话。**但**续跑是普通 Run：多给的工具照收，不按原来的收窄求交；子代理句柄仍是 `completed`，不算新尝试。前者不缺，后者**上游缺** |
| K-3 | §3.1 TaskBoard、waits、yield 三行的「必须补齐」是否已进包 | 读 `orchestration/core` 的类型，加上 K-2 用例里的现象 | **已进包**。协作节点强制绑定：`dispatch-subagent` 等在 `BOUND_ONLY_TOOL_NAMES` 里，K-2 用例里父 Run 没绑节点时根本拿不到这个工具。执行尝试：`NodeAttempt` 带代次、会话、Run、来源和请求键。接续：`Continuation`、`ContinuationClaim`。代次：`BoardScope.generation`。外部条件：四态（`pending`、`satisfied`、`failed`、`unknown`），首次间隔后翻倍退避、每次有时限、连续未知有上限。等待结算：`WaitSettlement`。消息：信封有 `scope`，兄弟之间的受限通信没有逐条核，留给 P5（BL-307）。App 模式那一行仍缺，见 5.1 |

## 6. 不在本文范围

- 不改 `vendor/prologue-sdk`，不提出新的 SDK 方法名（subagent-interaction §5 的要求：先核现行 API 再补真实缺口）。
- 不评估 Memory。
- 「有」只是包里有导出；Molis 接通、用例和真实动线分别按各原需求的验收编号另验。
