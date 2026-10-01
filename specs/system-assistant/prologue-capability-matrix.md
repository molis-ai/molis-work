# Prologue 能力矩阵（P12，AC28）

核对日期：2026-09-28，2026-09-29 按新包补核。对象是本分支实际使用的 SDK：`vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-assistant-intake.tgz`（`c63ea1a1`，由 main 的 resource-intake 线 `18a1c827` 与助理的记忆项目作用域 `ac4d1135` 合成，见 vendor README）。相对 9-28 核对的包，公开面新增 `collectRun`、`decodeJsonOutput`，以及结构校验、网络派出授权与原图摄取限额；这些都已补进下表。

**核对方法**
- SDK 公开面：`createRuntime` 返回的 `Runtime` 接口（`packages/sdk/src/composition/core/runtime.ts`）逐个成员，以及 `Session` 接口（`session/core/session.ts`）逐个方法；另查了 `LocalQueue`、`heartbeats`、`subagents` 等子面的方法。
- Host 接入：在 `horizontal/agent-host/src`、`apps/local-host/src` 里按 `runtime.<成员>` 与 Session 方法逐一检索调用处。
- 证据：自动测试（文件名）与真实场景（`implementation.md` 的章节号，MiniMax-M3 经 Prologue，隔离 Home）。

**状态**：✅ 已接入且有真实使用证据；🟡 已接入但只覆盖部分用途，或助理这条路径未用／未实测；⛔ 属于目标范围但未接通（缺口）；➖ 不适用（写明理由）。

助理的业务工作跑在 SDK `workspace: "app"`（无授权目录，只有会话包工具与不依赖目录的系统工具），这是有意的边界：目录、命令、检查点归 Coding（专业工作）。下表分列“助理”与“Coding”。

## 1. Session／Run、历史与搜索

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `sessions.create/open/restore`、`Session.startRun` | `prologue-node.ts` | 每项工作一个会话；继续、补充（steer）、回答、暂停、恢复、停止 | 同 | ✅ `assistant-business-gateway`、§5 P1、§5 P4 |
| `Session.replay/readRunProgress/terminalRuns` | 读轮次与进度 | 工作视图的轮次与步骤 | 同 | ✅ 同上 |
| `sessions.inspectRecovery/recoverRun`、`listOpenWork` | `inspectRecovery`、恢复关闭 | 重启后“需要核对”“查看实际发生了什么” | 同 | ✅ §5 P1（重启）、§12 第二片顺带（停在提问上重启） |
| `Session.archive` | 一次性推理会话、插件创作台会话用完即归档 | 工作归档只在 Host 工作表里标记，不归档 SDK 会话 | — | 🟡 助理工作归档未对应到 SDK 会话归档 |
| `Session.fork` | — | — | — | ⛔ 分支（从某一轮另起一项工作）未接通 |
| `Session.exportPackage`、`sessions.import` | — | — | — | ⛔ 受控导出／导入未接通 |
| `sessions.search`、`sessions.list` | — | 工作列表与搜索由 Host 自己的工作表提供 | — | 🟡 用 Host 工作表代替会话搜索；跨会话全文搜索待“系统级搜索”分支合入后接 |
| `Session.objective/setObjective/closeObjective` | — | — | — | ⛔ 会话目标未接；工作标题与业务 Goal 关系由 Context Ledger 记 |
| `Session.metadata/updateMetadata`、`previewPurge/purge`、`acceptInjected/pendingInjections`、`rewinds/noteRewound`、`adoptRun`、`conversation` | 回退由检查点路径使用 `rewinds` | — | 回退 | 🟡 回退已用于 Coding；清除（purge）与注入（injection）未接 |

## 2. 规划、Goal 关联与 TaskBoard

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `boards`（addNode/admit/assignedTo/get/handOver/report/rewire/subscribe） | Coding 步骤板 `readStepBoard/amendStepBoard` | 未用：助理用系统工具 `update-todo` 记步骤，用 Host 分工面板看子任务 | ✅ 确认计划后的步骤板 | 🟡 规格已写明 SDK 任务板偏向 Coding；助理的全局动态规划未接 SDK 任务板（⛔） |
| `goals`（GoalRegistry） | — | — | — | ➖ 业务 Goal 归 Goals 插件；不在 SDK 里维护第二份竞争状态（规格第 11 节） |

## 3. Subagent

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `subagents.list/get/cancel`、子代理工具 | `prologue-node.ts`、Coding 角色 | SDK app 模式起跑即拒绝子代理；助理用 Host 委托（同一人同一范围的独立工作，一层、6/3/2 上限） | ✅ | 🟡 助理这条路径是替代实现（§2.1“P9 分工”），已实测（§11）；SDK 支持 app 模式子代理后应迁回 |

## 4. 协同策略与结果裁决；5. 验收、修复与 Refine

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| 协同方式（Coding 的讨论／规划／修改／执行／评审／协作／并行） | Coding 会话方式 | 可把工作交给 Coding 并选方式 | ✅ | ✅ §5 P4 |
| Refine（`RefineBudget` 等） | — | 助理用委托的验收标准＋追加（最多 2 次）做核对与修正 | — | 🟡 SDK Refine 未接：业务工作的“评审发现问题→补改→复查”由 Host 委托实现，已用 MiniMax 实测（AC16，implementation §11），有追加上限做终止条件 |

## 6. Heartbeat、持久队列、消息与交付

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `queue`（LocalQueue：enqueue/find/list/cancel/claim，`onQueuedWork`） | Agent Host `schedule` 能力 | 定时跟进 | — | ✅ `assistant-followups`；§12 第一片修订（19:04:22 准时交回；重启后补处理） |
| `heartbeats` | — | — | — | ➖ 进程内、按会话周期唤醒；到点执行已由持久队列承担，暂无“每隔多久看一眼”的会话需求 |
| `delivery`（send/respond/record/complete…） | 会话间消息、优先级通知 | 未直接用 | ✅ | 🟡 Coding 已用；助理的跨会话协作走 Host 委托 |
| `waits`（park/resume…）、`background` | 等待与后台命令 | — | ✅ | 🟡 Coding 已用；助理没有长等待或后台命令 |

## 7. Memory 与候选记忆

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `memory`（write/list/update/purge/recall） | Agent Host `memory` 能力；SDK 补了 `project` 作用域（`ac4d1135`） | 明确要求的个人／项目记忆：记住、召回、查看、停用、删除 | — | ✅ `assistant-memory`、SDK `memory-project-scope.live`；§13（MiniMax 实测） |
| `memoryInbox`（候选提炼） | 不采用：候选只存在进程内存（重启即丢）、没有个人／项目范围 | 经验候选改由 Host 保存（`suggest-memory`，按个人／项目两个开关，默认关），用户认可后走同一个 `memory.write` | — | ➖ SDK 这一面不用；能力本身 ✅ `assistant-memory` 第三项，§13（MiniMax 实测） |

## 8. 上下文整理、压缩、历史与预算

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| 上下文整理（compaction） | `runtime.compaction`，按清单声明 | 已开：上下文估计超过 48,000 tokens 时按（2026-09-29 由 16,000 调高：运行时按整个上下文计，含本轮查找与读取，16,000 让几乎每个首轮都整理一次） `assistant-compaction`（登记在 Prompt 设置里，可改）挑选保留原文，整理失败时照常继续 | ✅ | ✅ 真实触发（§9 第二片：灵光交来的工作里“上下文整理 · 保留历史原文”） |
| 每轮预算（`maxTurns/maxTokens/maxWallClockMs`） | `startAgentRun` 的 budget | 每轮 24 步，到上限说人话、可继续 | 同 | ✅ `assistant-business-gateway`（步数上限）；§12 第二片 |
| 用量（run 用量回执） | 轮次视图带 run 用量；Host 按轮记账 | 今天用量与每日上限，到上限不开新轮 | — | ✅ `assistant-business-gateway`；§12 第三片（实测）。SDK 自己的 `UsageBudget` 未用（上限由 Host 在开跑前判断） |

## 9. Character、Skill、Scenario Pack、Harness

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `characters.create/publish` | 项目 Character | 项目工作可选 Character，冻结版本 | ✅ | ✅ §8（P5 实测） |
| Scenario Pack（会话包工具） | 能力网关包 `molis-action-gateway` | find/read/change/suggest＋委托工具 | — | ✅ §5 P1、§11 |
| `skills.register`、`discoverSkillsIn` | Coding 技能库 | SDK app 模式起跑即拒绝 skills；助理改用 Host 登记的插件方法（Manifest `methods`，“/”选定或经“读取方法”采用，只对那一轮有效） | ✅ | 🟡 助理不经 SDK skills，由 Host 内联（§8 P5 第三片，MiniMax 实测） |
| `harnesses` | — | — | — | ⛔ 低优先：只用 SDK 默认运行循环，尚无按任务切换运行配置的需求 |

## 10. 工具发现、MCP、Functions、TypeSafe 与 Code Tools

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `tools`、`createToolInvoker`、`find-tools`（延迟加载工具说明） | 是 | 系统工具 `find-tools` 可用 | ✅ | ✅ |
| `mcp`、`connectMcp/adoptMcpTools/readMcpResource/readMcpPrompt` | Coding MCP 与 MCP 库 | app 模式拒绝 MCP；外部 MCP 登记为 Host 动作后经网关可用 | ✅ | 🟡 助理经 Host 动作用 MCP 能力；MCP 资源与 Prompt 未接 |
| `functions/runFunction/replayFunction/inspectFunction` | — | — | — | ⛔ 未接；Molis 的“函数”是 Host 动作（`functions-actions.ts`），与 SDK Functions 的关系待定 |
| `typesafe` | 推理客户端 `typesafe.evaluate` | 插件结构化判断经 Host 推理 | — | ✅ 插件侧已用；助理本身未用 |
| Code Tools（文件、命令） | Coding | ➖（app 模式无目录，按设计） | ✅ | ✅ §5 P4 |

## 11. 资源接入、文档解析、检索、数据源与集合

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `resources.inspect/readChunk/revoke` | 本轮材料 | 文本附件、选区、对象材料 | ✅ | ✅ §5 P2 |
| `parseResource` ＋ `document-parser` 槽（App 提供 pdfjs 解析器） | Agent Host `documents` 能力 | PDF 附件读成有界文本材料 | — | ✅ `assistant-attachments`；§5 P2（MiniMax 实测） |
| `beginIntake` ＋ 运行 `start.attachments` | Agent Host `documents.intakeImage`；开跑请求 `image_materials` | 图片经 Host 私有目录吸入，随那一轮交给模型；标注不能看图时拒绝 | — | ✅ `assistant-attachments`；§5 P2（MiniMax 实测） |
| `parseDocument`（授权根里的文件）、`collectResources`、`resourceLeases` | — | 助理无目录，不适用于 `parseDocument`；吸入的临时文件发布后即删，资源回收暂按运行时默认 | — | 🟡 |
| `sources/extractFromSource/ingestWebPage/ingestSourceFrom`、`collections`、`webSearch` | — | 新资料由插件首页事项提供；侧栏浏览器的“交给助理”把用户看到的页面（选段或正文，带地址与时间）作为本轮材料，经资源通道进入 | — | ⛔ 未接：`ingestWebPage` 会匿名重抓，与用户登录后看到的页面不同；app 模式没有让模型检索资料源的工具，登记成资料源不产生可用引用（specs/archive/side-panel D20）。网页检索需要搜索服务的钥匙，未配置 |

## 12. 多模态；13. 界面观察与计算机操作

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `images` | 推理客户端 `images.generate` | 插件出图经 Host；助理的图片输入走 `beginIntake` ＋ `start.attachments`（见上） | — | ✅ |
| `collectRun`（有界收集一次运行的结果） | main 平台整合线：Host 的共享推理（插件的模型调用，如炼金术士、Jelly、置物架） | 助理的轮次走会话与事件流，不需要一次性收集 | — | ➖ 助理不适用；插件侧由 main 接入 |
| `decodeJsonOutput`、运行前结构校验 | main：炼金术士、Jelly 的结构化输出 | 助理的输出是对话与工具调用，不要求 JSON | — | ➖ 助理不适用 |
| 网络派出授权（`beforeNetworkDispatch`） | Host 对每次真实网络请求做可信复核（包括 MCP） | 助理的模型与 MCP 请求一样受它约束 | ✅ | ✅ SDK `network-dispatch-authority.live`；撤权场景见 §12 第二片 |
| 原图摄取限额（整批容量、原子发布、取消不复活） | `beginIntake` 所在的同一路径 | 图片附件经此吸入 | — | ✅ SDK `resource-intake*.live`；§5 P2 图片（合包后图片测试 `assistant-attachments` 通过） |
| `speech` | — | — | — | ⛔ 语音输入／转录未接 |
| `surfaces`（UiControl：`surface-list/observe/act`、按 origin 的规则、截图脱敏、`attach(owner)`、`effects.remember/forget`） | Agent Host `prologue-surfaces.ts`：侧栏浏览器的驱动（local-host `browser/surface-driver.ts`，CDP）按会话挂到业务轮次；规则=观察允许、每种动作各自问、用户允许的网站作为记住的批准（`effects.remember`，启动时也这样载入，撤销用 `forget` 当场生效；上传永远问）、禁止的网站由驱动在看和动手前当场拒绝（不写成启动规则：启动规则在重启前收不回）；脱敏器只放行驱动遮蔽过的截图；审批卡中文、输入文字显示全文；Coding 执行规则不再对界面效果与 surface-* 工具一律「问」（否则看也被拦、允许过的网站也照问） | 业务轮次在项目有侧栏浏览器时得到三件工具（只读轮次只能看；页面被另一项工作占用时不给并说明；设置可整体关闭） | — | 🟡 已接入并有 SDK 与真 Chrome 证据（specs/archive/side-panel §7）；SDK 补丁 `feat/molis-side-panel-surfaces`：app 模式放行、文字观察进模型、ask 时等批准、等批准时间不计入新鲜期、`forget`、输入文字作审查正文、Character 绑定界面工具同样放行、空白页 scope 为 `about:blank`。真实模型（MiniMax-M3）已跑通：空白页→确认打开→确认点击（选了「这个网站以后不用问」）→答对新页标题。桌面其他应用不接（specs/archive/side-panel D02） |

## 14. Workspace、文件、命令、检查点与回退

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `workspace`、`createSystemToolRunner`、`checkpoints`、回退 | Coding | ➖ 按设计无目录；撤销业务修改只用能力本身能恢复的操作 | ✅ | ✅ Coding（§5 P4）；助理撤销的说法 §12 第二片（AC26 实测） |

## 15. Effects、策略、Hooks、Guardrails

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `effects`（prepare/dispatch/pendings/inspectDispatch/reconcile/whenSettled） | 审查队列桥 | 每次修改停在确认；拒绝、停止、撤权、升级 | ✅ | ✅ `assistant-business-gateway`；§12 第二片（AC21 实测） |
| 策略规则（`rules`、`permissionMode`、`posture`） | `createRuntime` 装配 | 网关修改一律 ask | ✅ | ✅ |
| `hooks.register`（含 session-stop、dispatch 前检查） | 是 | 自动续做一次；声称记住却没记时拦一次；网络派发前检查 | ✅ | ✅ `announce-guard`、§2.1、§14 |
| 熔断（circuit breaker，`circuit-tripped`） | 运行事件流 | 连续失败被 Prologue 停下时，这一轮按“停下”结束并说明 | ✅ | ✅ `prologue-stream`；§9 第二片（MiniMax 实测撞到后补上） |
| Guardrails | 未装配自定义 guardrail；运行循环里 guardrail 触发的停止按“停止”而非“失败”显示（`prologue-stream.ts`） | — | — | ⛔ 未配置产品自己的 guardrail |
| 结果未知需核对（`EFFECT_RECONCILE_REQUIRED`、`settleDispatch`） | 恢复路径 | 助理不用此通道：已派出未回话的修改由 Host 记下结局并告知下一轮 | ✅ | 🟡 SDK 只接受执行回执或“确认没发生”，缺“人已核对它发生了”的收口（Prologue 缺口，§2.1） |

## 16. Artifacts、观测、审计、模型与用量

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `artifacts`（ArtifactRegistry） | — | 成果归各业务插件（Pages、Artifacts 插件等），工作只记关系 | — | ➖ 不在 SDK 另存一份业务成果 |
| 审计 | 动作服务按 `assistant:<工作>` 记审计身份 | ✅ | ✅ | ✅ |
| `capabilityReport/assembly/identity/state` | 适配器 `diagnostics()` | 设置 · 诊断 ·「助理与执行服务」（开发者看，不进对话） | — | ✅ `assistant-diagnostics`：装配指纹、各槽实现与版本、本机能力缺口 |
| `ledgerFailures` | 同上 | 同上：列出重启后回放不出来的运行 | — | ✅ 同上 |

## 17. 提问、表单与 MCP Elicitation

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `ask-user`（文字问题与问卷）、`restorePendings` | 是 | 回答接续原问题；过期回答不启动任何事 | ✅ | ✅ `assistant-answers`、§5 P1（个人工作问卷） |
| MCP Elicitation | — | — | — | ⛔ 未接 |

## 18. 模型目录、连通性、重试与缓存

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| 模型配置、`retryUnansweredModelCalls`、Prompt 缓存 | Host 模型设置（`model-configuration.ts`）＋ SDK 请求参数 | 同一模型设置 | ✅ | ✅（没有配置模型时如实说明，§5 P1） |
| `models`（ModelCatalog）、`probeModel` | — | — | — | 🟡 用 Host 自己的模型设置与检查；SDK 模型目录与探测未接 |

## 19. 插件贡献与安装生命周期；20. 作用域数据、集合、迁移与资源生命周期

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| 插件贡献（工具、Skill、MCP、Hook、Policy） | Molis 插件经 Host 登记动作、Prompt、Character | ✅ | ✅ | ✅ P13（§7）；SDK 层的插件包未用（➖：沿用产品自己的安装与授权事实） |
| `store`（ScopedStorage） | 会话索引、审查记录 | ✅ | ✅ | ✅ |
| `collections`、`migrate` | — | — | — | ➖ 业务主数据归各模块，不用 SDK 通用存储复制 |

## 21. Runtime／Host 装配与恢复

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `createRuntime`（preset `local-agent`）、`shutdown`、`readClock`、`credentials`、`random` | `prologue-node.ts` | ✅ | ✅ | ✅ |
| 存储独占（同一目录只能一个进程） | `acquirePrologueStorageOwner` | 被占用时如实报“执行服务正由另一个进程使用” | ✅ | ✅ 实测（重启预览时撞到，§12 第一片修订） |

## 缺口汇总（属于目标范围、尚未接通）

2026-09-30 更新。按对完整度的影响排序：

1. 助理的 Skill（插件方法）与 SDK Subagent：均被 app 模式拒绝；已分别由 Host 登记的插件方法（P5 第三片）与 Host 委托子任务（P9）替代实现并实测。
2. 界面观察与计算机操作（`surfaces`）：本分支未接，平台侧栏分支在接（见第 12、13 节）。
3. 语音（PDF 附件与图片输入已接通）。
4. 会话分支、受控导出、会话目标；系统级搜索已合入（按对象检索），会话历史本身的检索未接。
5. SDK Refine（业务工作的评审—补改—复查已由 Host 委托实现并实测，AC16）。
6. MCP 资源／Prompt、MCP Elicitation、SDK Functions、网页检索与来源摄取。
7. Prologue 缺口：结果未知的修改只能凭执行回执或“确认没发生”收口。Host 已补“交给插件的那一刻记一笔”，停止先于发出的修改如实显示“没有执行”（e58b1e6e）；真正发出后没回执的仍是“结果未确认”。

已从缺口移出：装配与版本诊断（2026-09-30，设置 · 诊断 ·「助理与执行服务」，见 implementation.md §2.1）；按工作的预算（25c1c711，已实测）；记忆的 Character 维度（按推荐不另设角色专用记忆库，角色轮次受同一组开关约束，AC34 实测；记忆整体迁到平台记忆服务 feature/memory-system）。

标“不适用”的只有：SDK Goals（业务 Goal 归插件）、SDK Artifacts／collections／migrate（业务成果与主数据归模块）、助理的目录与命令（按设计由 Coding 承担）、heartbeats（到点执行已由持久队列承担）。
