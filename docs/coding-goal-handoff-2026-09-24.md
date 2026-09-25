# Molis Work Coding App 完整 Goal 交接

核对日期：2026-09-24。代码快照：`e24454b6e5f952ab8c199a5fab630e1a4c4d52b2`。本文是交接快照，不是新的需求书或第二套进度账；持续实现仍更新 `specs/coding-plugin/spec.md`。

## 1. 先读结论：完整 Goal 没有完成

已经有能真实工作的 Coding 产品链路，绝不是只有静态页面或 Mock。模型设置、会话、真实模型读写、宿主审查、命令回执、部分恢复、固定报告/变更、材料与 Goal 回流，以及 Character、Plan、子任务、TaskBoard 的若干完整切片，都已有实现和指定路径实操记录。

但原 Goal 要求的完整 FlyLeaf 能力对齐、完整 Git 与协作、长任务可靠性、角色/子代理带来的实际质量收益、集中体验验收，以及“核心体验一流”，**没有全部达成**。不能按功能数量给出可信的整体完成百分比。

最新一次自开发验证是：在产品里使用 MiniMax-M3，为真实 Molis Work 隔离工作树修复低高度导航遮挡。Agent 读源码、提出改动；外部操作者多次审查退回并补充具体要求；Agent 实施局部修改并跑相关检查；通过 UI 保存固定成果；服务重启后继续原会话。它证明“有人审查和纠正时，可以开始用它做小范围开发”，不证明已经稳定承担日常开发，更不证明无人值守交付或用户认可。

### 必须纠正的完成状态

1. 用户先要求完整 Goal，后来明确说先做到“能用 Coding Agent 开发 Molis Work”。这是当时执行优先级和验收范围的收敛，不是原清单已全部完成。
2. 上一轮 Agent 将原 Codex Goal 标为 `complete`，并把收敛目标称为完成。这个操作和表述过度；随后已向用户承认：首个自开发闭环跑通，稳定性和用户验收仍不足，完整 Goal 未完成。
3. 本次用户要求的是“基于完整 Goal 如实写 handoff”，不是自动恢复全部开发。本次只进行事实核对和文档交接，不启动模型任务、不替用户验收、不合并或发布。
4. 本次 `get_goal` 返回 `goal: null`，没有可直接改回 active 的当前 Goal 对象；工具也没有修改旧 objective 或恢复完成状态的接口。没有通过数据库或另建一个假完成记录修正它。接手者应以本节和用户意图为准，实际恢复推进时再使用宿主支持的 Goal 创建/恢复方式。
5. `spec.md` 顶部保留了用户收敛决定；旧阶段表和历史段落有过期“未接通”。不能只读其中一张表就宣称全做完，或反过来将后续已有实现说成没做。

## 2. 权威范围、必读资料与授权

完整目标原文由用户在本轮重新提供：

`/Users/oreal/.codex/attachments/80a6b70e-1e70-4fe1-96fa-77a85ec2b0eb/已粘贴的文本.txt`

这份附件是本交接的逐项核对基准。它要求端到端实现全部既定 Coding 能力，能力对齐 FlyLeaf，使用 Molis 自己的 UI，并验证真实任务、恢复、协作和成果回到 Goal。不能把“控制复杂度”用来删减已有要求，也不能把 SDK 有能力当作产品接通。

在下述工作树中依次读：

- `specs/coding-plugin/spec.md`：尤其 §0 最新记录、C12/C13 与参考来源；区分日期和历史切片。
- `specs/coding-plugin/design.md`、`ui/01-session.html`、`02-taskboard.html`、`03-files.html`、`04-new-session.html`：既定设计。不要重做产品外壳、三栏职责或主导航。
- `packages/design-system/README.md` 的硬规则。
- `docs/system/PACKAGE-BOUNDARIES.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`skills/molis-plugin-dev/SKILL.md`：声明、权限、Host/Plugin/Module 归属。
- Prologue 的 `docs/slices/model-facing-gaps.md`，以及实际安装 SDK 的公开接口。源码 checkout 不等于运行中的依赖。

会话已有授权：每完成并验证一个任务，单独 commit 并 push 功能分支。没有授权合并主线、发布、替换正式安装、删除其他工作成果、改变生产凭据后端。FlyLeaf 始终只读。当前这份文档沿用逐项提交规则；后继独立任务仍须核对自己的授权。

## 3. 当前仓库、运行位置和可继续入口

### Molis Work

| 对象 | 本次核对结果 |
| --- | --- |
| 实现工作树 | `/Users/oreal/.codex/worktrees/molis-work-goal-continue/molis-work` |
| 分支 | `codex/molis-work-goal-continue` |
| 本文记录的实现 HEAD | `e24454b6e5f952ab8c199a5fab630e1a4c4d52b2` |
| 基础主线 | `0387c9b8405246884b4e496372f1291fc253003b` |
| 远端 | `https://github.com/molis-ai/molis-work.git` |
| 本次远端只读核对 | `git ls-remote` 确认功能分支为 e24454b，main 为 0387c9b；没有在交接时拉取、合并或改写代码 |
| 文档写入前工作树 | 干净 |
| 主 checkout | `/Users/oreal/adeptify-home/repos/molis-work`，main 在 `6930912`；不是这次实现工作树 |
| 主 checkout 未跟踪文件 | `docs/acceptance-handoff-codex-2026-09-22.md`、`docs/plugin-builder-handoff-2026-09-23.md`，本任务没有更改 |
| 旧 Coding 工作树 | `/Users/oreal/.codex/worktrees/molis-coding-complete/molis-work` 已不存在；不能直接沿用旧命令或假定证据目录仍在 |

主 checkout 落后于本次实现基础，不要在那里直接继续写代码，也不要为了“恢复环境”覆盖用户文档。其他 worktree、prunable 登记、基线副本均未清理；接手时重新看 `git worktree list` 和状态。

### 可用预览

- URL：<http://127.0.0.1:4198/projects/project-4f6275b5-24a0-4ad6-a6e2-f55dd3b04335/>
- 项目：**Molis Work 自开发**。
- 会话：**自开发续作：低高度导航修复**，App Session `3b53c655-8113-4f43-a5d9-c7a53ffd5f44`。
- 当前服务 Home：`/Users/oreal/.codex/working-data/molis-coding-selfhost-20260924`，与生产数据隔离。
- 本次只读检查：4198 有 Node 监听，正式会话 API 可读；4 轮状态为 stopped / completed / completed / completed，没有这条会话仍在跑的证据。
- 旧诊断会话 `0237ed91-a288-465a-abc4-86b5907c926f`，标题“自开发：修复插件栏入口遮挡”，保留失败/停止历史，不删除、不改写为成功。
- 服务日志：`/tmp/molis-coding-selfhost-server.log`。当前服务由上一轮启动，本次交接没有重启。

预览使用隔离文件凭据后端。MiniMax-M3 已经真实运行；OpenAI 测试曾得到 `insufficient_quota / credit_balance_exhausted`，不能写成可用备用模型，也不要无变化重复请求。凭据继续由 appkey/SecretStore 管理；不要打印 secret 文件、Web 控制 token、API key 或命令环境值。

如后续需要重启，先确认没有活动 Run、保存证据并识别本服务进程；不要按端口猜测并杀别人的进程。既有启动方式如下（只适用于上述隔离 Home，不能用于切换生产后端）：

```sh
cd /Users/oreal/.codex/worktrees/molis-work-goal-continue/molis-work
task_state=$(cat /tmp/molis-goal-continue-state-path)
PATH="$task_state/guard:$PATH" MOLIS_WORK_SECRET_BACKEND=file \
  node dist/web/server.js \
  --home /Users/oreal/.codex/working-data/molis-coding-selfhost-20260924 \
  --port 4198 > /tmp/molis-coding-selfhost-server.log 2>&1
```

临时 guard 目录必须先确认仍存在；它用于拦截测试/预览中意外的 security 调用，不是生产凭据修复或验收。恢复启动不等于构建正确，改代码后需重新构建并核对运行版本。

### FlyLeaf 与 Prologue

| 对象 | 当前只读检查 |
| --- | --- |
| FlyLeaf | `/Users/oreal/adeptify-home/repos/flyleaf`，main `a0267d3`，干净；完整参考提交 `a0267d39d5860575efd0ab080fb0f6887234759b` |
| Prologue 主 checkout | `/Users/oreal/adeptify-home/repos/prologue`，main `a8ac8e1e`，干净 |
| SDK 实现工作树 | `/Users/oreal/.codex/worktrees/molis-coding-receipts/prologue`，`codex/molis-coding-receipts`，HEAD `a7e785b8`，干净 |
| Molis 实际声明依赖 | `horizontal/agent-host/package.json` → `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-compaction-growth.tgz` |
| tgz SHA256 | `a00d705a28b94894682a5dea78887ac295e78dfc21fd08e8555307a3400cf61f` |
| 安装位置 | 当前 Molis 工作树 `node_modules/.pnpm/@prologue+sdk@file+vendor+prologue-sdk+prologue-sdk-0.0.0-rc.1-compaction-growth.tgz/node_modules/@prologue/sdk` |

本次只确认声明、文件摘要和安装解析位置，没有重新逐文件比对整个 SDK dist。历史 spec 保存过若干阶段逐文件一致性证明，但它们不是对所有未来构建的保证。修改 SDK 必须重新打包、核对 Molis 真正消费，并运行兼容性验证；不能只修改 Prologue main 就宣称产品生效。

## 4. 证据等级：哪些能据此判断

- **本次重新核对**：工作树/远端、参考仓库版本、SDK 文件摘要、当前正式 API 中的会话和固定成果、既有日志存在及摘要。交接时未重跑全量或发送模型任务。
- **上一轮本任务直接实操**：自开发改动、审查反馈、相关测试、固定保存、重启与续作；下面有具体 Run 和文件定位。
- **历史 spec 实操记录**：2026-09-20～22 的 Character、Plan、协作、Goal/Shelf、恢复等。源码仍有对应实现，本次核对了相关声明/代码入口，但没有重新走完每条产品路径，也没有逐一重新读取全部历史证据文件。
- **工程验证**：模拟 Provider、HTTP/SDK 用例、构建/类型/边界检查不能替代真实模型表现和用户手感。
- **用户验收**：目前未获得用户对整个 Coding App 或收敛目标的明确验收。中文 IME、主观手感、真机触控等保持 `UNVERIFIED`。

旧 `.impeccable/qa/coding/evidence/` 路径属于旧工作树。本次新工作树不存在该目录；旧工作树也不存在。历史 spec 中列出的 JSON 名称是追溯线索，不能把它们说成本次已打开的证据。先找已有副本/归档；找不到就标“历史记录，原件当前未定位”，必要时重新验证，不能生成替代历史证据。

## 5. 对照完整 Goal：做到哪里、还欠什么

### 5.1 设计、基础会话与正式执行（Goal 1；C0–C8、C11、C15）

**已有实现与指定实操**：既定三栏；Coding 作为 Plugin Runtime app 实际启动；新建、重命名、标题搜索、续聊、草稿保存；模型供应商/凭据配置和测试；授权工作区选择；MiniMax 真实读取、文件编辑、命令执行；流式回答和工具活动；结构化问题、回答与运行中补充；停止；历史与冻结配置恢复。C11 四层 Prompt 和 protocol 映射已有实现，不能再报成“只有界面”。

文件/命令副作用由 Host Review 决定，SDK 持有执行事实，Coding 不自行批准。拒绝反馈可回到原模型任务；最新真实自开发再次证明了该路径。问卷、草稿、自然过期、进程中断后的历史保留在历史 spec 有实操记录。

**尚欠**：连续复杂开发任务的稳定性、低人工负担、更多会话组织/导航的完整验收；部分恢复状态和连续提问的质量反例；不能依据一个成功任务断言普遍可用。CLI adapter 的编辑/命令因宿主审批未接而明确不支持；MCP/Character 也不能默认跨运行时等价。主要完整写入路径是 Prologue，不能通过直接启动 CLI 绕过 Host 审查。

### 5.2 FlyLeaf 全能力与五个配套插件（Goal 2；C9/C10）

**已经接通**：Workspace、Files、Diff、Git、Text Stats 包和默认端口图；工作区目录/正文、before/after/selection 固定版本、两份快照对比与正文统计；Git 真实状态、已暂存/未暂存固定差异；普通文本逐项暂存/取消暂存的审查与执行；固定 Git 结果进入 Coding 材料；Coding 固定变更、行级反馈、成果目录和返回原任务。

**已有恢复切片**：Git 原回执缺失时明确未知；可重新读取当前 index 与原审查，在有独立可靠依据且符合限制时确认“未发生”，再准备一笔新审查。不会把当前内容相同当成功、不会重放旧批准。已发生但缺回执的情况不能用该窄路径一概收口。

**仍未完成的实质能力**：

- Git 分支创建/切换、完整提交、fetch/pull/push、冲突读取与 ours/theirs/manual 解决、继续合并等正式产品路径；不能把本 Agent 用 shell commit/push 当成 Git 插件已支持。
- Git filter/attributes 内容转换、更多文件类型、跨进程并发及完整未知结果恢复。
- 选定子工作树文本整合已有实现；完整类型、冲突和部分成功边界还未全部完成。
- 文件/工作区变更事件驱动的完整刷新、配套插件脱离 Coding 后的独立入口和通用命令可用性，需要继续核对真实调用链；当前不能宣称全部完成。
- 大仓库、大差异、全部历史成果选择和任意大文件分页仍未完整验证/实现。
- FlyLeaf 能力矩阵需结合最新切片刷新；旧表有已过期“未接”，也有仅基础实现被误读为完成的风险。

### 5.3 方法、MCP、上下文、检查点、报告与缓存（Goal 2/7/9；C9/C14）

**已有**：方法发现、查看、安装、显式选择及本轮冻结；stdio/HTTP MCP 配置、连接、版本选择与审查；短资料和固定长资料分页；schema 延迟加载；上下文原文选择式整理；文件检查点预览、审查回退、冲突检查及活动 Run 互斥；终态报告/用量、固定成果、恢复已知与未知状态；运行中补充的接收/应用回执和结束竞态处理。

最新补齐三处实际阻塞：普通任务明确 60 轮预算；完整但无效的整理选择最多再纠正一次；工具观察从默认 200 行/32 KiB 调至 1000 行/64 KiB。仍是有界机制，不是无限任务预算或任意大文件读取。

**尚欠**：自动方法选择和质量收益、真实 MCP 大目录按需 schema 验证；更长任务中关键要求/已完成动作/未知结果连续保真；重复整理的消耗和效率；通用大文件读取；更完整的副作用恢复。文件回退不等于撤销命令或 MCP。

缓存已有配置透传与真实非零缓存读取回执；缓存写入、未开启/未命中/命中对照尚未完整实操，费用缺失仍未知。上下文整理用量已按原回执汇入父轮；旧文“未汇总”不再适用于后续实现，旧缺失记录也不能回填。

### 5.4 Character 管理与真实行为（Goal 3/5；C12）

**已经做了**：独立 Character 管理插件、个人草稿、编辑修订冲突、停用/墓碑、项目 Artifact 发布与精确版本；Coding 明确选版本或不用角色；调用方范围声明、发送前验证、Host 冻结、有效工具取子集；更新/停用不改正在跑或历史任务；不可用引用阻止新执行并保留草稿；报告保留原角色正文/来源。管理、发布、版本切换、停用与重启有历史真实 UI/模型记录。删除墓碑主要是工程覆盖，没有把未做的 UI 永久删除说成实操。

**未完成的关键验收**：角色是否改善复杂任务结果或降低人工负担。已有同任务、同模型三组比较，证明版本进了模型且回答有差异，但批准次数没有减少，“最少介入”角色仍不遵循要求、会错报证据。去掉默认流程后的复测也没证明改善。C12 不是从零未做，但也不能整体标完成。

### 5.5 Plan → SubAgent → TaskBoard（Goal 5；C13）

**已经做了**：

- Plan 草稿形成、查看/调整、修订冲突、阻塞、确认固定 Artifact、按确认版本执行；普通任务直接执行。真实跨文件夹具改动和测试有历史实操，但最初计划条件需要人工修正。
- 只读子任务的范围、角色、分派、停止/失败、评价与返工；完整报告分页回传。父任务仍须独立核对，子任务结束不等于验收。
- 独立工作树准备经过正式审查，授权和回执持久化；并行任务冻结各自目录/权限，两份写入独立审查；有一项批准、一项拒绝的真实样本。
- 原父失败后选定已结束子任务文本成果的预览、审查和整合；同步子任务等待超过 103 秒仍正确等待的实际样本。
- TaskBoard 原计划/Run/子任务导航；SDK 图步骤状态与版本回报；用户评价绑定原报告版本；needs-work 带入下一版计划，旧图/评价不变。
- 最新固定报告带步骤完成条件、模型回报、用户评价和过期/不可读边界。

**尚欠**：并行子任务与步骤的明确认领关联，完整阻塞/变更回流，更多 Git 类型与协调失败恢复，以及真实协作能改善结果或减少人工负担的证明。模型曾错引任务、反复等待耗尽轮次、未遵循内容要求；步骤两次返工仍误报行号/覆盖，第三轮整理失败，不能算 C13 质量通过。

历史阶段表中“步骤回报未接”已经过时；“所有协作与验收完成”同样不成立。TaskBoard 的模型 succeeded、用户接受某一步、原 Goal 验收是三个不同事实。

### 5.6 Goal → 材料/Character → Coding → 成果/进展（Goal 9）

**已有指定闭环**：

- 选择原 Goal，固定完整目标上下文；目标变更需重新确认；会话换绑不改变旧 Run/报告归属。
- Files、Git 固定差异/结果、Shelf 固定文字材料进入 Coding，精确版本冻结，不自动跟随新输出。
- 保存固定报告/变更，显式选择输出端口；成果目录与通用阅读面打开原版本，返回原会话。
- 报告写回原 Goal 的进展，服务端核对身份/版本并幂等；Goals 时间线打开准确报告再返回会话继续；不自动接受 Goal。
- 固定成果转 Shelf 副本再转 Coding 材料的文字路径已有实操。
- 原目标来源不可读时仍保存已有执行报告、明确无法确认归属；该特殊路径的证据以工程为主。

**尚欠**：全部组合在同一个代表性真实开发任务里的端到端验证，尤其同时带 Goal、材料、Character、计划/协作、完整审查、成果与人审；长材料、多模态、全部历史版本选择、持久化故障下的原子恢复，以及长期使用。每份材料 20,000 UTF-16 字符、每轮最多 30 份是现有边界，不能通过暗中截断伪装支持。

因此不能再写成“Goal/Shelf 回流完全没做”，也不能把几个分散样本拼成整个产品验收。

### 5.7 Harness 研究与架构规范（Goal 4/6/7）

10 个要求的 reference 仓库均在 `/Users/oreal/reference/`，本次只读 git HEAD 与 spec 记录吻合：

| 目录 | 提交短值 | 来源性质 |
| --- | --- | --- |
| codex | c9d13e8 | 官方开源 CLI |
| cline | 2755adf | 官方开源实现 |
| opencode | fee476b | 官方开源实现 |
| claude-code | bf7d404 | 官方仓库，不等于完整执行内核 |
| pi | c596d09 | 官方开源实现 |
| maka | 0117d76 | 官方开源实现 |
| grok-build | 4247f66 | 官方开源 Harness |
| claude-code-sourcemap-main | 577611a | 社区历史 source maps，不能当当前官方源码 |
| claude-code-system-prompts | f7e985f | 社区 Prompt 提取，不能当产品机制或权限来源 |
| deer-flow | aa4e43a | 官方开源实现 |

完整 URL/SHA 在 spec“参考来源与版本”。已有具体取舍：Codex 同轮补充竞态、Cline 恢复前保护、Pi 关键上下文、Maka 中断事实、OpenCode 计划与实施分离、Grok 整理要点、deer-flow 报告证据。克隆和这些初步取舍不等于全名单研究全部完成，更不等于产品行为已全部对齐。

实现沿用 Plugin Manifest、公共 Contracts、Host 权限/Review、SDK Session/Run/Effect/TaskBoard、Artifact 与 Goals 原协议。没有为本次自开发新建调度器或任务账。最新构建/边界/类型检查通过，只支持该快照工程结论；没有完成全产品安全审计或所有契约路径验收。

### 5.8 三栏阅读、一流体验与执行质量（Goal 8/9/10）

安全 Markdown、代码复制、流式更新、折叠工具、草稿、报告阅读和若干滚动/切换/重启路径已有实现和实操。历史有深浅主题和窄屏检查，最新导航遮挡有实际页面复核。

**仍未达标的质量证据**：模型重复搜索/读取；没有动作却承诺执行；误报行号、测试覆盖、已发生事实；长上下文整理失败/反复整理；最终回答混入被拒绝旧补丁；把 pnpm 的脚本输出误解为宿主没运行 pnpm。人需要多次提供精确定位和修正。这些不能被“测试通过”抵消。

集中长内容、大差异、持续多任务、后台不抢焦点、上翻不抢位置、窄屏低高度各路径的完整验收尚未完成。中文输入法候选、主观手感、真机触控、VoiceOver 等未可靠实操项保持 `UNVERIFIED`；没有用户本人最终验收。

## 6. 最新真实自开发样本的完整边界

任务：低高度桌面下，固定上方卡片和底部入口挤压插件列表，Shelf 中心被底部按钮覆盖。原工程测量 756×469 时中间列表仅 8px，footer 超出底部。

产品内 Agent 最终修改：

- `apps/workbench/src/styles/linear-density.ts`：28 行，限定宽 >600、高 ≤600、细指针；收紧纵向空间，保持原入口和结构。
- `tests/cross-plugin-recovery.e2e.test.ts`：50 行，固定回归视口，检查列表高度、footer 边界和精确点击命中；原 Characters/Shelf/Schedule 流程保留。
- 外部操作者只补需求/证据文档、给审查反馈、独立验证并 commit/push，没有外部代写这两份最终代码再冒充产品输出。

实际过程有失败：第一次旧会话反复定位；默认预算提前结束；整理输出不合法；源码尾部被观察窗口截断。修复 Host 后在新会话续作，仍拒绝了一份尺寸不符方案和一份会截断源码的整文件写入，之后才批准局部 edit。不要删掉这些反例。

第 2 轮 `2-40g7a` 的宿主原始命令为：

```text
pnpm --filter @molis-ai/molis-work-app-workbench build  → exit 0
pnpm test:run tests/cross-plugin-recovery.e2e.test.ts → exit 0，3 passed / 0 failed
```

`$ tsc -p tsconfig.json` 是第一条的脚本输出，不是证明该 pnpm 调用不存在。模型最后的正文和后续纠正都曾误读证据；必须按原命令回执判断。

正式 UI 保存的固定成果（本次 API 再次读到）：

| 类型 | 精确引用 | 保存时间 UTC |
| --- | --- | --- |
| 报告 | `coding-report:3b53c655-8113-4f43-a5d9-c7a53ffd5f44:2-40g7a` v1 | 2026-09-23T19:02:26.061Z |
| 变更 | `coding-changeset:3b53c655-8113-4f43-a5d9-c7a53ffd5f44:2-40g7a` v1 | 2026-09-23T19:02:51.935Z |

报告保留当时模型错误，不能静默修成“历史一直正确”；固定变更包含拒绝与批准记录，查看时选择“已批准/已执行”。两份固定成果及完整会话在服务重启前后逐项相同；后续只读续作后，原成果仍逐项相同。

更新构建后的页面实操：实际 CSS 756×469、pointer:fine 下列表约 87px、footer 底部约 465px；Shelf、末尾图片与底部 Characters 分别打开。390×844 抽屉展开，Shelf 按钮约 44px 高，点击成功并收起。浏览器缩放影响请求尺寸，最终以 DOM 实测 CSS 尺寸为准；这是浏览器模拟，不等于真机触控或所有低高度都验证。

这个自开发会话没有把完整 Goal、Character 和 C13 全部塞进同一次任务。不要把它作为全链路综合验收。

## 7. 已提交内容与验证账

以下 7 个提交位于 `0387c9b..e24454b`，已逐项推送功能分支。本次远端读取确认分支包含最终实现，未合并 main。

| 提交 | 实际内容 | 证据/限制 |
| --- | --- | --- |
| e8e1e65 | 恢复合并时被截断的 AgentHost 执行回归 | 恢复测试加载；不是新用户功能 |
| 104ac6a | 被动 CLI 可用性检查不启动 CLI；Shelf 被动快照不跑 help | 已捕获 Claude CLI → security 调用链并定向验证；未替换正式安装 |
| 063247a | 固定报告保留原步骤回报与用户评价 | HTTP/固定版本/页面样例；不把样例说成新模型计划成功 |
| 44a051e | Coding 普通任务显式 60 轮预算，计划取更大值 | 原默认 8 轮实阻塞；不是无限预算 |
| d1f2812 | 无效原文选择最多一次严格纠正 | 不放宽坐标验证，不对网络/截断/取消盲重试，用量仍归父轮 |
| daa7883 | Host 工具观察 1000 行/64 KiB | 真 Node adapter 测试确认末尾哨兵进入模型请求；不是完整分页 |
| e24454b | 产品 Agent 的低高度导航修复与回归，记录自开发边界 | 上述真实样本；独立工程检查及页面实操 |

更早的 Character、Plan、步骤回报等不是这 7 个提交才全部开发的；它们通过原功能分支/主线整合进入本次基础。spec 记录步骤回报曾经由 `84af3d4` 进入主线。不要重复实现，也不要把最新 7 个提交当作全部历史成果。

### 全量回归并未全绿，也未达到原 Goal 的零新增标准

| 快照 | 总数 | 通过 | 失败 | 跳过 |
| --- | ---: | ---: | ---: | ---: |
| 0387c9b 独立基线 | 2057 | 1977 | 75 | 5 |
| 本轮中间完整回归 | 2080 | 2003 | 72 | 5 |

第二行在后续预算/整理纠正/观察窗口/导航改动之前运行，**不是 e24454b 的全量结果**。其后各块做了定向验证，最终 build、boundary:check、workspace:typecheck 通过，但没有重新跑最终 HEAD 的完整全量。交接文档修改不需要重跑产品测试，本次也没有补跑。

失败总数下降不等于零新增：出现一个新增 Goal 连续事件页面测试失败，名称为 `event document writes planning, report, concern, decision and closure through the production UI`，表现为点击菜单目标隐藏。独立原基线两次通过，当前两次失败，加入只读观测又通过；等待 menu.open 的尝试一过一败，已撤回，不能把猜测写成根因。Alchemist 一项由失败转通过但未改该模块，不算本任务修复。原 Goal 要求零新增，因此这个门禁尚未满足。

其余大量失败分布于既有 UI/Goal/Feed/Functions 等；不能统称“都是无关环境问题”。恢复完整目标推进时应按准确快照重新跑基线/当前，修核心阻塞和新增失败，保留失败名称与原日志，不能删断言。

### 证据文件

当前可定位的临时状态目录：

`/var/folders/j2/q_ctx69x57b2md26b1jclklh0000gn/T/molis-goal-continue-bd5gdl2_`

指针：`/tmp/molis-goal-continue-state-path`。目录包括 `baseline.json`、`final-regression.json`、`png-manifest.json`、`selfhost-{session,report,changeset}-before-restart.json`、对应 `*-reopened.json`、`selfhost-session-final.json`。这些是本机临时证据，不保证系统清理后仍存在；没有将含本地运行数据的整个目录盲目提交远端。

日志：

- `/tmp/molis-goal-continue-baseline-tests.log`
- `/tmp/molis-continue-final-full.log`
- `/tmp/molis-selfhost-budget-{build,tests}.log`
- `/tmp/molis-selfhost-compaction-{build,package,tests,final-tests}.log`
- `/tmp/molis-selfhost-observation-{build,tests}.log`
- `/tmp/molis-selfhost-final-{build,boundary,typecheck}.log`

上轮最终检查确认 698 个受保护截图/文件与运行前摘要一致；测试生成图片曾被恢复，其他本次生成内容移入临时目录保留。后续测试可能再次改写跟踪截图，要先保护实际已有字节，不执行 broad reset/clean。完整回归用 `pnpm test:run` 的隔离入口，不直接 node --test 跑全仓，避免访问生产 Home/钥匙串。

## 8. 钥匙串：已修的触发与尚未交付的部分

已经有三类修复：SecretStore 失败在本进程缓存，避免状态轮询重复读取；Functions 等装配使用懒加载，单纯列表/说明不打开凭据库；最新被动 runtime/Shelf 探测不再运行 Claude CLI 的 version/help。

最后一类已有实际调用栈：Shelf snapshot → runtime catalog → CLI help → Claude CLI → security。旧 AgentHost 另有 CLI version 探测，一并去掉。被动检查现在只确认可执行文件存在，不假装已登录。

但用户以前所有弹窗是否同源未知；正式 App/MCP 曾运行未含这些修复的安装版本；当前 4198 使用隔离文件后端，不能据它不弹窗宣称生产钥匙串修好。首次真正读取、不同进程各自首次授权、三秒超时/恢复手感仍需实际安装验证。不要擅自把生产切成文件密钥来掩盖问题，也不要关闭系统保护。

## 9. 接手时最容易读错的地方

| 容易误读 | 正确处理 |
| --- | --- |
| 原 Goal 显示 complete | 是上轮误标，完整范围未完成；本次工具没有活动 Goal |
| 自开发测试通过 | 只证明有人多次指导的一项真实修复，不是稳定日常开发验收 |
| C12/C13 仍写待做 | 管理/发布/消费、计划/子任务、步骤回报有实现；质量和完整协作仍欠 |
| 报告/Goal/Shelf 端口未接 | 后续切片已接指定路径；按日期和源码核对，不重复造轮子 |
| 旧 spec 写不提交或旧分支 | 后来的用户逐任务 commit/push 已授权；当前分支见 §3，不动 main |
| 72 个失败比 75 少 | 有新增失败，且不是最终 HEAD 全量；不得说零新增/全绿 |
| 模型总结里的代码/测试 | 按实际 diff、Review 和 command receipt 判断，已发生多次错误复述 |
| 一个 Git helper 存在 | 不等于正式 UI、权限、审查、恢复、文件类型都接好了 |
| SDK 主库 HEAD | 不等于 Molis tgz；按实际依赖核对 |
| 旧证据文件名在 spec | 不等于当前能打开；旧工作树缺失必须显式标记 |

## 10. 下一位执行者的建议顺序

以下是交接建议，不是本次已经排期或执行的新任务，也不自动扩大用户最新授权。

1. **恢复准确状态与环境。** 先确认用户要继续完整 Goal，还是先验收自开发阶段；恢复开发时建立正确的 active Goal。核对当前分支/远端/修改/活动 Run、SDK 实际依赖和预览版本。不要再次把局部成功标成原 Goal 完成。
2. **整理原 spec 的当前汇总。** 以 §0 较新实操和源码为依据刷新过期能力表，保留历史证据。优先消除“步骤回报未接”“报告输出未接”等陈旧结论；不要把未完成质量门槛删掉。
3. **先解决影响自开发的实质可靠性。** 固定仓库、任务与模型，做有限的新任务样本；专门核对总结与实际 diff/回执、重复无效行动、长上下文后已批准/已拒绝/未执行的保真。记录外部指导、返工和消耗，不能用操作者代写补丁让样本通过。扩大读取窗口/预算是已有补丁，不是这些质量问题已解决。
4. **完成工程门禁。** 对目标代码快照跑最终全量并与同基线比对，定位新增 Goal 事件测试及核心阻塞。不得以“偶发”替代诊断；不得为通过测试改宽验收或删除真实点击检查。
5. **按原依赖补全 C10/C13。** 明确 Git 缺失操作、文件类型与恢复边界；复用 Host/SDK 审查和 Effect；补步骤认领/并行关联/阻塞与变更回流，验证失败、停止、部分成功和整合，避免另造调度/任务库。
6. **完成 Character/协作收益验证。** 复用已有精确版本和有限对照任务，证明实际结果/人工负担改善；如仍无收益就如实记录，不能只验证启动成功。
7. **做一个覆盖原产品价值的综合任务。** 真实 Goal 和材料，选择 Character，按需要使用 Plan/协作，执行修改、反馈、检查、固定成果、回到原 Goal 留进展，再从成果恢复继续。测试旧版本/换绑/失败/重启，不自动验收 Goal。
8. **集中体验与交付。** 真实长内容、深浅主题、窄屏低高度、草稿和后台切换；修明显阻塞与丢失问题。更新实际可用构建后再测正式入口。生产安装/钥匙串交付需对应授权；中文 IME、真机和主观手感交用户判断，其余独立工作不要等待人审才做。

每完成一块仍按原要求写清做到/验证/剩余，检查实际 diff，单独 commit/push 已授权功能分支。交付时明确工程通过、指定产品路径通过、用户验收三个层次。原 Goal 只有在全部必做能力、真实任务质量、工程门禁和规定验收都达到后才能关闭。

## 11. 主要代码入口

路径均相对于 §3 的实现工作树，可作为检索起点，不表示单个文件承担全部责任。

| 领域 | 入口 |
| --- | --- |
| Coding 声明/路由/会话 | `plugins/native/coding/src/{manifest,routes,store,client,ui}.ts` |
| 正式 Host 装配 | `apps/local-host/src/coding-surface.ts` |
| 材料/Goal | `plugins/native/coding/src/{materials,goal-context,goal-versions}.ts` |
| 报告/变更/步骤 | `plugins/native/coding/src/{report,report-steps,changeset,taskboard,steps-client}.ts` |
| 计划/角色/协作 | `plugins/native/coding/src/{plans,characters,delegation,writers}.ts` 与各自 client |
| Prologue 消费 | `horizontal/agent-host/src/adapters/prologue-node.ts`，以及 `prologue-{approvals,compaction,checkpoints,git,methods,mcp,subagents,taskboard,stream}.ts` |
| Git 状态/暂存/整合 | `apps/local-host/src/{workspace-git,workspace-git-index,git-writer-integration,git-worktrees}.ts`、`plugins/native/git/src/` |
| 本次自开发补丁 | `apps/workbench/src/styles/linear-density.ts`、`tests/cross-plugin-recovery.e2e.test.ts` |

**交接结论：保留已有实现与证据，继续补真实缺口；不从零重做，也不把一个自开发样本当作完整 Goal 完成。**
