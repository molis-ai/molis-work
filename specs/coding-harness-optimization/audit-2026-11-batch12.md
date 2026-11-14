# 第 12 批只读核查：Coding 调用链、真实材料案例与三个缺陷复现

状态：2026-11-04 只读核查完成，没有改产品代码；缺口的实现等第 12 批前置（04、06、07、09、11）合入、定样（目录／规则／恢复）定下以后再做。核查负责人：Claude（本机）B 轨会话。本记录是[需求书](spec.md)、[Onboarding 覆盖需求](../onboarding-coverage/spec.md) §3.14 和[产品流程治理](../product-flow-governance/spec.md) PF-A01／02／09 的证据附件，需求仍由那三份维护；本批怎么用它见[第 12 批](../post-anticorruption-roadmap/reference/batches/12.md)的「本批核账」。

## 1. 证据口径

- 基线：main `063b036bd`（2026-11-04）。方法是读代码、读 vendored Prologue 包（`prologue-sdk-0.0.0-rc.1-memory-p0.tgz`）的编译结果，并对三个缺陷在一次性隔离环境里复现。
- 复现：只用测试浏览器 `openStudioChrome` 的临时目录，把 Coding 打包好的页面脚本（时间线、TaskBoard、计划卡）挂进空白页面，喂入构造的运行记录读页面结果。没有启动 Home，没有碰 4207／4208 和 `~/.molis-work`，没有调用模型；用后即删。脚本与输出留在统筹的共享笔记目录，没有入库。构建经 `pnpm build` 的机器槽，浏览器经浏览器槽，`--jobs 1`。
- 这些复现证明「页面脚本在这些输入下画成这样」；不证明真实模型一轮会产出这些输入，也不是产品实操或用户验收。
- 没有测试用例带 `CHO-` 编号（全仓库只有 spec 文字出现），所以下面「已在 main」只指代码在、行为按代码读来对得上，验收编号对应的用例要在实现时补。
- 「目录」一词在本批有两个意思：一是**工作目录**（用户选的真实文件夹，需求书 R1），二是**技能／规则／模式的目录**（Coding 从哪里取方法、规则和执行方式，R2、R3 与第 08、09 批的共同技能目录）。下面两种都写。

## 2. 结论一屏

| 项 | 现状 |
| --- | --- |
| 助理交给 Coding 的入口 | **已在 main**：Coding 发布工作执行方的六个角色（#987），助理按这六个动作开会话、读会话、改方式、开始一轮、控制一轮；开始一轮时会带上会话里存着的方法、MCP 工具与来源。原需求 §2 说的「不带已选 Skill、MCP」已不成立。 |
| 工作目录选择器 | **已在 main**：`directory-picker.ts` 现在真等子进程结束，分选中、取消、窗口占用、不可用、超时（F109 整树合入，`f74e29d86`）。 |
| 项目规则（AGENTS.md）信任参数 | **未接**。SDK 公开了 `projectTrusted`，Molis 全仓库没有任何地方传它（R3、CHO-06）。 |
| 计划卡与 TaskBoard 编号（BL-161） | **复现**。同一步在计划卡是 S4，在 TaskBoard 是 S3。 |
| 计划卡与 TaskBoard 状态措辞（BL-164） | **复现**。「等待前一步」「等待前置」，还有第三种「等待前置步骤」。 |
| 没有退出码的命令显示成功（BL-222） | **复现**，而且比 BACKLOG 写的范围大：被取消、超时、被信号结束的命令也显示成功。Prologue 的 `exit none (…)` 措辞已在当前 vendored 包里。 |
| 材料进项目 | 材料读取、整理、存成果库和 Pages 文档**已在 main**；采用完成后**不接 Coding**：不加 Coding 插件、不问工作目录、也不带材料去 Coding。代码类文件进不来（ONB-37）。 |
| 未知结果核对 | Coding 一轮的重启核对（待核对的轮、检查点、`reconcile-required`）**已在 main**；插件通知恢复仍要用户手填处理依据（PF-A09），材料采用的重复提交靠请求编号去重，不核对「写成功但回执丢了」。 |

## 3. 调用链一：Coding 的执行、委派与可见状态

一段一行：入口在哪、谁是主人、断在哪、和原需求哪条对不上。路径相对仓库根。

### 3.1 工作目录：选择 → 授权 → 一轮在哪里跑

| 段 | 入口 | 主人 | 现状与断点 |
| --- | --- | --- | --- |
| 选目录 | `apps/local-host/src/directory-picker.ts` 的 `createDirectoryPicker`／`runDirectoryPickerCommand` | Host | 已在 main，对应 CHO-01 的实现；没有带 `CHO-01` 的用例，`tests/workspace-directory-picker.test.ts` 是起点。 |
| 项目里关联的目录与「当前目录」 | `apps/local-host/src/project-capabilities.ts` 的 `projectSettingsCapabilities.workspaces`、`browsingWorkspace`、`selectBrowsingWorkspace`；存放在 `ProjectBrowsingSettings` | Host（项目设置） | **断在这里**：现在只有一个持久的「浏览目录」，没有「多个输入目录 + 一个输出目录」，也没有「临时查看不改变执行位置」。R1 的 2026-10-27 决定（BL-023）与 CHO-36～39 都没实现，BACKLOG 标「部分实现」（BL-023 不是无人管：C、D 先交公共合同与选择器，B 接 Coding，见 §7 第 4 条）。 |
| Coding 取当前目录 | `plugins/native/coding/src/executor.ts` 的 `currentWorkspace`、`routes-sessions.ts` 的 `readState`：先取浏览目录，没有再取项目首选目录 | Coding 读、Host 给 | 因为只有一个浏览目录，在 Files／Git 里换了看的目录，助理新开的一轮就会在那里跑，和 R1「临时查看不改变执行位置」冲突（静态读出，未实操）。 |
| 一轮冻结目录 | `start-round.ts` 的 `startRound`：按 `body.workspace_id` 在 `workspaces` 里找，要求 `realpath_verified`，然后把目录交给 `agent.startRun` | Coding 调、Agent Host 执行 | 已在 main。冻结后下一轮才换目录，对得上「运行中不变」；但「与项目当前配置的差异」没有显示（CHO-38）。 |
| 并行写手的目录 | `start-round.ts` 里 `role === "writers"` 一段，经 `writerDirectoryCapabilities.list` 取已授权的工作树 | Coding／工作区 | 已在 main。 |

### 3.2 方法（Skill）、规则、模式：从哪里取、怎样进到一轮

| 段 | 入口 | 主人 | 现状与断点 |
| --- | --- | --- | --- |
| 包内方法 | `plugins/native/coding/src/skills.ts` 的 `codingSkills`（四个）、`plugin.ts`／`roles.ts` 的 `agent_skills` 声明 | Coding | 已在 main。四个方法是写死在包里的。 |
| 项目里发现／安装方法 | `routes-sessions.ts` 的 `readState` 里 `agent.listSkills`；`coding.discover-methods`、`coding.install-method` | Agent Host 的运行时方法库 | 已在 main，是 Coding 自己的一条路径。 |
| 共同技能目录 | 第 08 批（技能包基础能力）与 [skill-packs](../skill-packs/spec.md) §1 的三个断点 | 平台（08）→ Coding（09） | **断在这里，等 08／09**：助理只看见「有动作的插件」提供的方法，Coding 用自己的路径，两边没有共同目录；`AgentSkillDeclaration` 还没有 `description`／`applies_to`。第 12 批不重做，只接 09 做好的目录。 |
| 一轮选的方法 | `route-selections.ts` 的 `methodSelection`（`skill_id` + 精确 `version`，上限 20，不重复）→ `start-round.ts` 的 `skills:` | Coding 校验、Host 冻结版本 | 已在 main。 |
| 项目规则 | SDK 的 `projectTrusted`（vendored 包的 `context/core/instructions.d.ts`、`composition/core/agent-context.d.ts`） | Host 决定项目可信性 | **未接**：在 `horizontal/agent-host`、`plugins/native/coding`、`apps/local-host` 里搜 `projectTrusted` 没有结果。AGENTS.md 能否进模型请求取决于 SDK 的默认，既不可追溯也不显示「本轮实际来源与生效版本」（R3、CHO-06）。 |
| 模式 | `executor.ts` 的 `CODING_EXECUTOR_MODES`（讨论／规划／修改／执行／评审）；`start-round.ts` 里 `body.intent` → 角色：`discuss→reader`、`edit→writer`、`execute→builder`、`plan→planner`、`review→reviewer`、`collaborate→coordinator`、`parallel→writers` | Coding | 已在 main。 「发送前清楚显示只读限制并给切换入口」要看页面，本次未核。 |

### 3.3 委派：助理 → Coding，和 Coding → Coding

| 段 | 入口 | 主人 | 现状与断点 |
| --- | --- | --- | --- |
| 助理发现执行方 | `apps/local-host/src/assistant/assistant-executor.ts` 的 `executorProviders`（按六个角色的类型找，不按插件名）、`WorkExecutor.bind` | 助理 | 已在 main（PG-036，#987）。 |
| 助理开会话／开始一轮 | `WorkExecutor.createSession`／`start` → Coding 的 `executor.ts`：`session.open`、`run.start`（`roundOf` 带上 `methods`、`mcp_tools`、`mcp_sources`；`action_tools`、Character 在 `startRound` 里读会话存的值） | Coding | 已在 main。**需求书 §2 写的「助理继续 Coding 会话时不带已选 Skill、MCP」已不成立**，要在原需求的现状表里改。没有用例断言「方法与 MCP 随助理开始的一轮到达」。 |
| 不可用时的原因 | `WorkExecutor.bind`／`unavailableReason`：找不到时一句话「可能被停用、卸载或没有全套执行方动作」 | 助理 | **部分**：三种原因合成一句；未安装、停用、激活失败、无适配版本、缺模型、缺目录没有分开说（CHO-04、R2）。`executor.ts` 对缺模型、缺目录有分开的话（`executor_unprepared`）。 |
| 助理自己的子任务委派 | `assistant-delegation.ts`（`DELEGATION_LIMITS`、每个子任务一个步骤挂在父任务图上） | 助理 | 已在 main，属助理，不在第 12 批。 |
| Coding 会话委派给另一个 Coding 会话 | `routes-delegations.ts` 的 `coding.delegate` → `delegation-dispatch.ts` 的 `dispatchCodingDelegation`（两个会话之间发信，新会话把任务存成草稿） | Coding | 已在 main。**要统筹裁定**：新会话只继承 `configuration`（模式、模型、目录）、草稿、材料，不继承发起会话选的方法、MCP、动作、Character。这是有意还是漏，原需求没说；见 §6 问题 1。 |
| 子代理与检查点的呈现 | `delegation.ts` 的 `projectSubagents`、`projectCheckpoints` | Coding（用户判定）／Runtime（事实） | 已在 main，「完成不等于接受」已分开。 |

### 3.4 渲染、计划卡、TaskBoard、命令状态

| 段 | 入口 | 主人 | 现状与断点 |
| --- | --- | --- | --- |
| 时间线的稳定节点（R7、CHO-14／15） | `plugins/native/coding/src/timeline.ts` 的 `placeRow`、`renderGroup`（按调用号保留节点、变化签名、只改变化的文字；折叠由用户自己的选择记住） | Coding | **已在 main**（VUX-13，`d7077301f`）。需求书 §2 写的「新主线仍有 `innerHTML` 重建」已过时，行内文字用 `put` 只在变化时写。长会话性能目标（CHO-16）没有测量，未核。 |
| 计划卡 | `src/browser/plan-progress.ts`（`stepLead` 里 `"S" + (index + 1)`）；经 `src/browser/main/mount-board.ts:86` 挂载，措辞用 `host.receipts.step` | Coding | 编号按**在板上的位置**，含「你插入的」步骤。 |
| TaskBoard | `src/browser/taskboard-tree.ts:115`（`"S" + (Number(node.id.replace("step-", "")) \|\| position + 1)`）、`taskboard-words.ts` 的 `boardWords`、`panels-messages.ts` 的文案 | Coding | 编号按**节点 id**；措辞走自己的表。 |
| 步骤汇报对话框 | `src/browser/steps.ts`、`report-steps.ts` | Coding | 第三套措辞（见 BL-164）。 |
| 板的数据 | `taskboard.ts` 的 `codingTaskBoardPlans`：只认这个会话固定下来的原计划，步骤与固定计划不一致就不让评价 | Coding 读、Prologue TaskBoard 存 | 已在 main。 |
| 命令状态 | `timeline.ts` 的 `exitCode`（行 55）与 `outcome`（行 78 起）、一轮结束卡的 `lastCommand`（行 209、230） | Coding | **断在这里**，见 §4.3。 |
| 完成闭环（R5） | 一轮结束卡的 `left`／`stalled`／`completedFraction` | Coding | 已在 main：计划还有步骤没完成时写「部分完成」，只说了要做、没调工具的一轮写「没做事」。「测试通过」「用户接受」分开、验证绑定当前代码版本（CHO-11）本次未核。 |
| TaskBoard 估点与整体进度（R14、CHO-29～35） | `rg` 估点相关的字段：`story_point`、斐波那契 | Coding／Prologue | **未见**：Coding 的 `src` 里搜 `story_point`、`估点`、`斐波那契` 都没有结果；R14 依赖 Prologue 采用线，不在第 12 批两项交付里，只在此记一笔。 |

## 4. 三个缺陷：复现与代码路径

复现脚本把打包好的 `CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT`、`CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT` 和 `createCodingTimeline` 挂进一个空白页面，用构造的运行记录读结果（`--jobs 1`，约 2 秒）。

### 4.1 BL-161：编号

输入：计划三步，板上顺序为 `step-1`、`step-2`、`user-1`（用户插入）、`step-3`。

| 步骤 | 计划卡 | TaskBoard |
| --- | --- | --- |
| step-1 | S1 | S1 |
| step-2 | S2 | S2 |
| user-1（插入） | 插入 | 插入 |
| step-3 | **S4** | **S3** |

原因：`plan-progress.ts:180` 用板上位置，`taskboard-tree.ts:115` 用节点 id 的数字。BACKLOG 里写的文件 `taskboard-client.ts` 现在只是读打包文件的壳，代码在 `src/browser/` 下。回执、服务端报告按位置编（BACKLOG 称「按位置编与计划卡、回执、服务端报告一致」），所以多数地方一致，TaskBoard 是少数。要先定的事：改哪一边。BACKLOG 已倾向按位置编。

### 4.2 BL-164：状态措辞

同一个「还没开始」的步骤：

| 地方 | 文字 | 出处 |
| --- | --- | --- |
| 计划卡 | 等待前一步 | `packages/contracts/src/platform/ui.ts:764` 的 `RECEIPT_WORDS.STEP`，经 `host.receipts.step` |
| TaskBoard | 等待前置 | `panels-messages.ts:7` `coding.board.state.not-started` |
| 步骤汇报对话框 | 等待前置步骤 | `report-steps.ts:34`、`panels-messages.ts:351` |

BACKLOG 只写了前两种，实际是三种。其余板状态（进行中、模型报告完成、模型报告失败、受阻……）在 TaskBoard 里也是自己的表 `boardWords`，是否与回执措辞逐条一致本次没有逐行比，实现时一起核。要先定的事：「未开始」用哪一种说法。

### 4.3 BL-222：没有退出码的命令显示成成功

输入是一条已完成的 `run-command`，输出的第一行是 vendored 包 `command-outcome.js` 里 `exitOutcome` 产出的几种：

| 输出第一行 | 时间线行末状态 | 一轮结束卡的「最后一条」 |
| --- | --- | --- |
| `exit 0` | exit 0（成功） | → exit 0 |
| `exit 2` | exit 2（失败） | → exit 2 |
| `exit cancelled` | **空白，按成功画（完成标记）** | → exit ? |
| `exit timed-out` | **空白，按成功画** | → exit ? |
| `exit none (a signal ended it)` | **空白，按成功画** | → exit ? |
| 没有输出 | **空白，按成功画** | → exit ? |

原因：`timeline.ts` 的 `exitCode` 只认 `^exit (-?\d+)`，认不出就返回 `null`，`outcome` 在 `null` 时落到 `{ tone: "ok", label: "" }`。同一张卡片上方写着「这一轮完成」，最后一条命令却是 `exit ?`。

和 BACKLOG 比：

- BACKLOG 说「换上带 prologue#52 的包以后……起不来的显示失败，其余三种照旧」。当前 vendored 包（memory-p0）已经带 `exit cancelled`、`exit timed-out`、`exit none (a signal ended it)`（`exitOutcome`，`NO_EXIT_CODE`）。所以措辞这一半**已经就绪**，BACKLOG 里「Prologue #52 定下的措辞」这个前置可以划掉，剩下的只是 Coding 怎样读、怎样显示。
- 起不来的命令没有回执，按 SDK 注释两台 Host 都报 `COMMAND_FAILED`，工具状态应是 `failed`，`outcome` 对 `failed` 已显示「失败」（本次没有复现这一种）。
- 后台命令（`start-command`、`command-output`、`command-stop`）有同一类字面输出（`BackgroundOutput` 只有退出码、没有停下原因），`exitCode` 只认 `run-command`，后台命令的行从不显示结局。本次没有复现，列为同类。
- 「被信号结束」的措辞原定问采用线（BACKLOG），采用线已收尾；包里的措辞是 `a signal ended it`，页面要显示的中文由 B 轨定，写进第 12 批的定样。

## 5. 调用链二：真实材料 → 项目 → Coding → 返回

用一份真实材料能走到哪一步：

| 步 | 入口 | 现状 |
| --- | --- | --- |
| 1 选来源 | `apps/local-host/src/context-onboarding-sources.ts` 的 `supportedContextFile`：`/\.(?:md\|markdown\|txt\|csv\|json\|html?\|pdf\|docx)$/` | **断**：源码、配置、脚本、yaml、toml、无扩展名文本（README、LICENSE）一律被拒（`文件类型无效`），点开头的隐藏路径、`node_modules`、`vendor`、`dist`、`build` 也直接拒。ONB-37 要求代码目录能按实际内容读。另有 `material-extraction.ts` 是第二张支持表（`MATERIAL_EXTENSIONS`），两处各管一份。 |
| 2 清点、读取、整理 | `context-onboarding-service.ts`（读取分阶段保存、可继续；整理用当前模型，缺模型只阻止模型步骤） | 已在 main：中断后恢复、模型失败保留已读材料。 |
| 3 采用成项目 | `adoptContextJourney`：建项目、只加 Pages 插件、逐份存成果库（`importFile`）并分段转成 Pages 文档、写工作摘要和待办；每步带请求编号，重试接着做 | 已在 main：重复提交不重复建（ONB-45 的一部分）。 |
| 4 进入项目 | `apps/workbench/src/scripts/context-onboarding.ts:518` 起：有待办去 Todo，否则去 Pages 摘要 | 到这里就结束。 |
| 5 交给 Coding | 无 | **断**：采用时没有加 Coding 插件，没有关联工作目录（上面的整条采用代码里没有 workspace），也没有「带着这些材料去 Coding」。用户要自己装 Coding、自己选目录、自己在资料选择器里勾材料。ONB-44「代码根目录与仍有效授权能接续到 Coding，多来源只补选实际工作目录」未做；PF-A01 描述的「最后进入空项目且 Coding 仍要选目录」与此对得上。注意：材料目录不能自动升级为执行目录。 |
| 6 Coding 读材料 | `plugins/native/coding/src/materials.ts` 的 `resolveMaterials`：每份经 `knowledge.read` 读主人此刻的正文（12,000 字内，长的告诉 Agent 接着读），读不到整轮停下并说明；`start-round.ts` 另加知识目录 | 已在 main（项目资料目标，#839）；`tests/coding-material-consumption.test.ts`、`tests/coding-materials-http.test.ts` 是起点。 |
| 7 返回 | 一轮的报告 `coding.report.v1` 进成果库，变更集是过程项；报告可设为输出端口当前值、可回写 Goal 进展 | 已在 main（见 `plugins/native/coding/README.md`）。 |
| 8 未知结果核对 | Coding 一轮：`start-round.ts` 的 `follow`、重启后 `reconcile-required`、`agent.inspectRecovery`、`roundAfterParkedAnswer`；材料采用：请求编号去重 | **部分**：Coding 一轮的核对已在 main（CHO-12 对应的实现，没有带编号的用例）。「写成功但回执丢了」那种情形下，采用只靠请求编号让重试得到同样的结果，不先核实际结果；插件通知恢复页要用户手填「处理依据」并「接受重复执行的可能」（`apps/workbench/src/plugin-event-recovery.ts`），PF-A09 要改的就是这里，主人是 Plugin Runtime 事件恢复，不是 Coding。 |

测试：没有任何用例带 `ONB-35～46` 编号，也没有一条从引导采用走到 Coding 的端到端用例（`tests/context-onboarding*.test.ts` 管到采用，`tests/coding-material*.test.ts` 管 Coding 读材料，中间那一步没有用例）。

## 6. 缺口清单：每条落在第 12 批的哪一项

「已在 main」的已在 §2、§3、§5 标出提交或 PR。下面只列缺口。

### 交付项 1：Coding 执行、委派与可见状态（[batch-12-item-1](../post-anticorruption-roadmap/reference/batches/12.md#batch-12-item-1)）

| 编号 | 缺口 | 证据 | 需求 | 要先定 |
| --- | --- | --- | --- | --- |
| G1 | BL-161：计划卡与 TaskBoard 同一步编号不同 | §4.1 | R5／14 相邻；[回执线 3d-3](../ai-input-receipts/spec.md) | 按位置还是按 id；倾向按位置 |
| G2 | BL-164：未开始的步骤有三种说法 | §4.2 | 回执线 3d-4（RCPT-356） | 「未开始」用哪种说法；TaskBoard 板状态改从 `host.receipts.step` 取 |
| G3 | BL-222：取消、超时、被信号结束、没有输出的命令按成功画；后台命令不显示结局 | §4.3 | R5（结果真实性）、[CHO-11](spec.md#7-验收标准) | 「被信号结束」「结果未知」的中文；读不到退出码的显示成「结果未知」 |
| G4 | 项目规则（AGENTS.md）信任参数未接入，本轮实际规则来源不可见 | §3.2 | R3、CHO-06 | 项目可信性由 Host 决定的规则；在 12 的「规则」定样里一起定 |
| G5 | 工作目录只有一个浏览目录：没有多输入／单输出，临时查看会改变助理新开一轮的目录，运行中轮次与项目配置的差异不显示 | §3.1 | R1、CHO-36～39、BL-023、[WMD-07～12](../product-flow-governance/workspace-and-materials-design.md) | 统筹 2026-11-04 定：12 先修执行目录取值，05②、06、07 合入后再接输入／输出目录（§7 第 4 条） |
| G6 | 助理找不到 Coding 时，原因合成一句，未分未安装／停用／激活失败／无适配版本 | §3.3 | R2、CHO-04 | 与「恢复」定样一起 |
| G7 | 没有用例断言「方法、MCP 随助理开始的一轮到达」「助理与页面等价」（CHO-03） | §3.3 | R2、CHO-03 | 无 |
| G8 | Coding→Coding 委派不继承方法、MCP、动作、Character | §3.3 | R2 | 有意还是漏（见 §7 问题 1） |
| G9 | 需求书 §2 现状表有两条过时：助理委派「不带 Skill／MCP」「innerHTML 重建」 | §3.3、§3.4 | 需求书 | 实现时在原需求改 |
| G10 | 共同技能目录接入 | §3.2 | R2、skill-packs | 等 08、09，12 不重做 |

### 交付项 2：材料进入项目与 Coding 接续（[batch-12-item-2](../post-anticorruption-roadmap/reference/batches/12.md#batch-12-item-2)）

| 编号 | 缺口 | 证据 | 需求 | 要先定 |
| --- | --- | --- | --- | --- |
| M1 | 代码类、配置类文件进不了引导：两张扩展名白名单（`supportedContextFile`、`MATERIAL_EXTENSIONS`） | §5 步骤 1 | ONB-37、PF-A01 | 要读哪些、读不了的怎么说（04 定样的一部分） |
| M2 | 采用后不接 Coding：不加 Coding 插件、不问工作目录、不带材料 | §5 步骤 5 | ONB-44、PF-A01 | 沿 04 的 Onboarding 全程设计；不把材料目录升级为执行目录；接续目标由插件声明「可承接上手材料」，平台按声明调用，不写死插件名，Coding 是第一个声明者（12-2 先落最小形态），44 再把 Todo、Pages 迁到同一份声明（2026-11-13 按插件同等地位收口改，[决定 42](../post-anticorruption-roadmap/reference/decisions.md#decision-42)） |
| M3 | 引导到 Coding 的端到端用例不存在；没有 ONB-35～46 编号的用例 | §5 | ONB-46 | 无 |
| M4 | 未知结果核对：采用与 Coding 的接缝没有「先核实际结果」，通知恢复页让用户手填依据 | §5 步骤 8 | PF-A09、ONB-45 | 通知恢复部分已移到第 56 批第 1 项（统筹 2026-11-04 定）；12 只做 Coding 一侧 |

### 不在第 12 批两项里，核查时顺带看到的

- R4 上下文窗口：`roles.ts:49` 压缩阈值固定 `above_tokens: 12_000`，原需求 R4 要改成随模型窗口。`thinking` 与显式输出预算已修（`prologue-run-params.ts` 的 `runModelParams`，需求书已写）。归 R4 所在批次。
- R8 浏览器／桌面只挂给 business 工作区：`horizontal/agent-host/src/adapters/prologue-run.ts` 的 `roundSurface` 仍有 `business` 条件。归 R8 所在批次。
- R14 TaskBoard 估点：Coding 里没有。依赖 Prologue 采用线。

## 7. 统筹裁定（2026-11-04 定）

五条推荐已由统筹审过，结论如下；措辞类（2、3，以及 BL-222 的「结果未知」中文）仍随第 12 批「目录／规则／恢复」定样给用户看。

1. **Coding→Coding 委派不继承**发起会话选的方法、MCP、动作、Character（统筹 2026-11-04 定，同意推荐）。接收的人自己在页面里选。
2. **BL-161 按位置编号**（统筹 2026-11-04 定）：只改 TaskBoard 一处；「插入一步」后下面步骤的 S 号后移。
3. **BL-164 统一写成「等待前一步」**（统筹 2026-11-04 定）。
4. **BL-023 的分法**（统筹 2026-11-04 定，改正原稿「未分配」的说法）：[依赖图](../post-anticorruption-roadmap/reference/dependencies.md)已拆好——公共资料身份、目录授权与读写、选择器由 C、D 先交（05② 把 `is_default` 改成 `roles: input | output`，07 做选择器和定位，「临时查看是独立概念」由 07 交付，不再单独开一批）；B 的一半「Coding／Git 接入这套目录」留在第 12 批。第 12 批做两件事：修「执行目录取值」（助理开一轮取项目当前输出，不取浏览目录）；05②、06、07 合入后把 Coding 接到输入／输出目录上。
5. **通知恢复页（PF-A09 M4）移到第 56 批第 1 项**（Attention 唤醒、角标与系统通知，F 轨），不放进 12（统筹 2026-11-04 定）。

## 8. 没有核的

- 页面里「发送前显示只读限制并给切换入口」（R3）、目录选择在真机上选中文／空格路径（CHO-02）、模型层面的真实委派（CHO-03 的真实模型部分）、长会话性能（CHO-16）、Dataset（R9）、Git／PR／CI（R10）、Builder（R11）。这些要么在别的批次，要么要真实模型或真实 OS 选择器，本轮不做。
- 没有读真实 Home，没有调用模型，没有构建以外的写入。
