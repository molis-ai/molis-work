# Prologue 能力矩阵（P12，AC28）

核对日期：2026-09-28。对象是本分支实际使用的 SDK：`vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-assistant.tgz`，源码在 `~/code/prologue-assistant` 分支 `feat/molis-assistant-app-mode`（核对时最新提交 `4702abe3`）。

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
| Refine（`RefineBudget` 等） | — | 助理用委托的验收标准＋追加（最多 2 次）做核对与修正 | — | ⛔ SDK Refine 未接；真实“评审发现问题→补改→复查”循环未实测（§11 未做） |

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
| `memory`、`memoryInbox` | — | — | — | ⛔ P8 未做。SDK 作用域只有 user/app/character/session，没有真正的项目隔离（规格第 11 节已点明），需 SDK 补项目作用域后接 |

## 8. 上下文整理、压缩、历史与预算

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| 上下文整理（compaction） | `runtime.compaction`，角色可开 | 助理角色未开 | ✅ | ⛔ 助理长工作的上下文整理未开（目前靠每轮只带本轮材料与会话历史） |
| 每轮预算（`maxTurns/maxTokens/maxWallClockMs`） | `startAgentRun` 的 budget | 每轮 24 步，到上限说人话、可继续 | 同 | ✅ `assistant-business-gateway`（步数上限）；§12 第二片 |
| 用量（`usage/usageEntries`、`UsageBudget`） | 轮次视图带 run 用量 | 未汇总、未设上限 | — | ⛔ 用户可设的整体预算（按工作／按天）未做 |

## 9. Character、Skill、Scenario Pack、Harness

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `characters.create/publish` | 项目 Character | 项目工作可选 Character，冻结版本 | ✅ | ✅ §8（P5 实测） |
| Scenario Pack（会话包工具） | 能力网关包 `molis-action-gateway` | find/read/change/suggest＋委托工具 | — | ✅ §5 P1、§11 |
| `skills.register`、`discoverSkillsIn` | Coding 技能库 | SDK app 模式起跑即拒绝 skills | ✅ | ⛔ 助理用插件方法（Skill）未接（P5 余项） |
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
| `parseDocument/parseResource`、`beginIntake`、`collectResources`、`resourceLeases` | — | PDF、图片附件未做 | — | ⛔ P2 余项（PDF 与图片） |
| `sources/extractFromSource/ingestWebPage/ingestSourceFrom`、`collections`、`webSearch` | — | 新资料由插件首页事项提供；网页检索未接 | — | ⛔ 助理自带网页检索与来源摄取未接；业务来源归 Feed/Inbox |

## 12. 多模态；13. 界面观察与计算机操作

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `images` | 推理客户端 `images.generate` | 插件出图经 Host；助理的图片输入未做 | — | 🟡 |
| `speech` | — | — | — | ⛔ 语音输入／转录未接 |
| `surfaces`（UiControl） | — | 助理读页面经插件上下文协议，不直接看屏幕 | — | ⛔ 未接（目前以插件声明的上下文代替界面观察；计算机操作不在当前范围） |

## 14. Workspace、文件、命令、检查点与回退

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `workspace`、`createSystemToolRunner`、`checkpoints`、回退 | Coding | ➖ 按设计无目录；撤销业务修改只用能力本身能恢复的操作 | ✅ | ✅ Coding（§5 P4）；助理撤销的说法 §12 第二片（AC26 实测） |

## 15. Effects、策略、Hooks、Guardrails

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `effects`（prepare/dispatch/pendings/inspectDispatch/reconcile/whenSettled） | 审查队列桥 | 每次修改停在确认；拒绝、停止、撤权、升级 | ✅ | ✅ `assistant-business-gateway`；§12 第二片（AC21 实测） |
| 策略规则（`rules`、`permissionMode`、`posture`） | `createRuntime` 装配 | 网关修改一律 ask | ✅ | ✅ |
| `hooks.register`（含 session-stop、dispatch 前检查） | 是 | 自动续做一次；网络派发前检查 | ✅ | ✅ `announce-guard`、§2.1 |
| Guardrails | 未装配自定义 guardrail；运行循环里 guardrail 触发的停止按“停止”而非“失败”显示（`prologue-stream.ts`） | — | — | ⛔ 未配置产品自己的 guardrail |
| 结果未知需核对（`EFFECT_RECONCILE_REQUIRED`、`settleDispatch`） | 恢复路径 | 助理不用此通道：已派出未回话的修改由 Host 记下结局并告知下一轮 | ✅ | 🟡 SDK 只接受执行回执或“确认没发生”，缺“人已核对它发生了”的收口（Prologue 缺口，§2.1） |

## 16. Artifacts、观测、审计、模型与用量

| SDK 公开面 | Host 接入 | 助理 | Coding | 状态与证据 |
| --- | --- | --- | --- | --- |
| `artifacts`（ArtifactRegistry） | — | 成果归各业务插件（Pages、Artifacts 插件等），工作只记关系 | — | ➖ 不在 SDK 另存一份业务成果 |
| 审计 | 动作服务按 `assistant:<工作>` 记审计身份 | ✅ | ✅ | ✅ |
| `capabilityReport/assembly/identity/state` | Host 运行时描述 | 未给用户看 | — | ⛔ 开发者诊断里未显示实际装配与版本 |
| `ledgerFailures` | — | — | — | ⛔ 未显示 |

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

按对完整度的影响排序：

1. Memory（P8）：需 Prologue 提供真正的项目作用域。
2. 助理的 Skill（插件方法）与 SDK Subagent：均被 app 模式拒绝；分别对应 P5 余项与 P9 的替代实现。
3. 助理长工作的上下文整理（compaction）与用户可设的整体预算。
4. PDF／图片等附件（`parseDocument/parseResource`、`images` 输入）、语音。
5. 会话分支、受控导出、跨会话搜索（后者待“系统级搜索”合入）。
6. SDK Refine 与真实“评审—补改—复查”循环。
7. MCP 资源／Prompt、MCP Elicitation、SDK Functions、网页检索与来源摄取。
8. 装配与版本诊断（`capabilityReport`、`ledgerFailures`）给开发者看。
9. Prologue 缺口：结果未知的修改只能凭执行回执或“确认没发生”收口。

以上缺口都未标为“不适用”；标“不适用”的只有：SDK Goals（业务 Goal 归插件）、SDK Artifacts／collections／migrate（业务成果与主数据归模块）、助理的目录与命令（按设计由 Coding 承担）、heartbeats（到点执行已由持久队列承担）。
