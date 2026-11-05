# 观测和采集层：事实来源盘点（2026-11）

状态：只读盘点（2026-11-04，第 21 批），基线 main `aac9cfeec`。只读代码，没有启动服务，没有碰真实 Home，也没有解包 vendored Prologue SDK；SDK 台账的内部表结构写「未核」。行号会随 main 漂移，以文件和符号为准。设计见 [design.md](design.md)，评测案例见 [eval-cases.md](eval-cases.md)，需求见 [spec.md](spec.md)。

## 1 结论

现在的平台没有一份「工作记录」。和工作有关的事实散在十几处，各自为自己的用途留：调用诊断只留最近 1000 条命令，而且不存输入输出；助理和 Agent 的过程在 Prologue 台账里，只有调用插件自己读得到；插件内容大多只有当前状态。保留规则是写死的常量（200 条、2000 行、14 天、30 天、跟着对象一起删），用户设不了。没有占用统计，没有覆盖与缺口的登记，也分不出真实工作、演示、试用和回放。

所以采集层不能「接上现有日志就算完成」。现有的事实主人大多可以保留，采集层只需要引用它们已有的版本，不再复制一份；但是成功读取、界面呈现与反馈、Skill 实际生效的正文、关联键、来源类别、覆盖与缺口、保留与占用，这几样现在完全没有，要新建。

## 2 事实来源

路径相对仓库根；`ah` 是 `apps/local-host/src`，`pn` 是 `plugins/native`。

| 来源 | 位置 | 主人 | 记了什么 | 正文与版本 | 保留与清理 | 谁能读 |
| --- | --- | --- | --- | --- | --- | --- |
| 动作调用记录 | `logs/action-calls.jsonl`；`ah/action-call-log.ts`；写入挂在 `packages/kernel/src/action-settlement.ts` 的 `CallSettled` | local-host | 时间、call_id、动作 id 和版本、提供方、actor、audience、项目、成败与错误码、`refused`（处理器开始前就被拒的「未执行」行）、委托方 | 不存输入输出；执行过又失败的命令留 200 字错误信息。成功的读取不记（`recordedOperation`） | 超过 2000 行重写，留最近 1000 条命令和 200 条其他；10 分钟内相同结果折成一行。写失败被吞（`report` 的 catch） | 只有设置页「诊断」和「调用记录」页；没有动作或 MCP 接口 |
| 工作流运行 | `pn/workflows/src/database.ts` 表 `instances` | workflows | 实例状态、当时的链、每步交接的输入输出正文、判断结论、尝试错误、动作步骤结果 | 正文保留；动作结果超过 20000 字符只留大小（`step-runner.ts`）。没有 actor、call_id、平台或 Skill 版本 | 没有滚动；删项目才删 | 动作 `workflows.get`、`workflows.instances.get` |
| 定时任务 | 项目库 `schedule_wakeups`（`horizontal/scheduler/src/index.ts`）；插件库 `schedule_operation_occurrences`、`schedule_conversation_turns`（`pn/schedule/src/database.ts`） | scheduler；schedule | 应触发、开始、结束、状态，细节截 500 字；执行的重试与跳过决定；对话任务的轮次文本 | 摘要和错误；没有 actor、call_id | wakeup 随任务取消删除；被取消或撤权的执行不写 | 任务记录只带最近一次 wakeup；执行记录只经插件页面 |
| Agent／Prologue 运行 | `<Home>/agent-runtime/records`；宿主侧索引 `horizontal/agent-host/src/adapters/prologue-session-index.ts`；读视图 `packages/contracts/src/services/agent-host-run-view.ts` | Prologue SDK 与 agent-host | 对话轮次、工具活动、用量（tokens、cost_usd 与覆盖）、阶段、停止原因、冻结的角色与模型、召回的记忆 | 台账里有提示、工具入参、结果和用量（`prologue-stream.ts`）；读视图把入参压成目标摘要、输出截到 16384 字。图片只存引用，重启后过期 | 代码里没有保留期；`checkpoints/` 无上限（`docs/system/HOME-DATA.md`） | `agent.run.read.v1`、`agent.session.read.v1` 只给插件读自己的运行（`packages/contracts/src/services/agent-host.ts` 的 `pluginOnly`） |
| 助理工作与轮次 | `assistant/assistant.db`（`ah/assistant/assistant-store.ts`） | assistant | 用户原话、材料、选区上下文、Character、预算、记忆回执；`assistant_usage` 只有 tokens | 轮次带 revision；助理回复和运行态不在这里；用量没有模型和成本 | 只有项目删除和首轮失败的 discard 会清 | 工作台 HTTP `/api/assistant/*`，没有动作 |
| 提示词与 Skill | `ah/agent-definitions/agent-definitions.ts` | local-host | `prompt_history`：用户改写的各版正文；`prompt_uses`：key、时间、版本、调用方 | 默认正文和 method 正文只在内存；Skill 正文和使用都不落库。运行上冻结的是 id、版本和 model_id（`agent-host-start.ts`） | `prompt_uses` 每个 key 留 200 条 | 设置页 |
| 记忆 | `packages/storage/src/adapters/memory-ledger.ts`；条目本体在 SDK | memory | `memory_revisions` 各版正文；`memory_uses` 按工作和运行记用了哪一版；`memory_changes` | 有版本 | 遗忘一条记忆时一起删 | `memory.history`、`memory.changes.list`，只给本人 |
| 检索 | `packages/storage/src/adapters/text-search-index.ts`；`knowledge-cards.ts` | search；knowledge | 索引是派生物；`knowledge_receipts` 记谁读了哪块原文 | 查询、命中和进入上下文的结果都不记（`horizontal/search/src/index.ts`） | 回执 30 天、每项目 5000 条；索引结构变化即重建 | — |
| Pages | `pn/pages/src/database.ts` | pages | 当前正文和整数版本；`page_changes` 存 AI 或工作流改动前的副本 | 只有当前态；发布成成果后才有固定版本 | `page_changes` 14 天（`store.ts`） | Pages 动作 |
| Goals | `pn/goals/src/project-database-goals.ts`、`project-database-event-facts.ts` | goals | 目标当前态；`goal_work_events`（类型、载荷、actor、收到时间、journal_seq、配置版本）、指引修订 | 目标本身没有修订；历史靠事件 | 跟着目标删除 | `goals.history.list`、`goals.events.*`、`goals.timeline.list` |
| Todo | `pn/todo/src/database.ts` | todo | `todo_changes` 前后值、actor、revision | 有前后值 | 删条目即删历史 | Todo 动作 |
| Feed | `pn/feed/src/store/` | feed | `signal_revisions` 完整草稿；条目分 `source_created_at` 与 `imported_at` | 条目只有当前修订；正文按内容寻址，无人引用即回收 | 回收无人引用的正文 | Feed 动作 |
| 成果库与过程项 | `modules/artifacts/src/repository.ts` | artifacts | 不可变版本、摘要、supersedes、作者、来源、trace；大原件按 sha256 存文件 | 固定版本 | 归档不删 | `artifacts.*`，含 MCP |
| 等你与收件 | `modules/attention-resumption/src/index.ts` | attention | 收件当前态加 revision；`attention_events` 只有类型、对象和时间 | 没有详情历史 | 没找到保留规则 | — |
| 对象关系 | `modules/context-ledger/src/repository.ts` | context-ledger | 关系的完整修订、原因、actor；跨分区移动的回滚（S-35，`horizontal/placement/src/index.ts`） | 有修订；回滚本身没有单独记录 | 只追加 | `query.history` |
| 授权 | `packages/plugin-runtime/src/consent-ledger.ts`；`ah/plugin-directory-store.ts`；`config/mcp-tools.json` | plugin-runtime；local-host | 同意的授予与撤销时间；目录授权与读取记录（带来源：人、Agent、工作流、MCP、后台）；MCP 授权的当前状态 | 同意撤销留行；目录授权撤销即删行；MCP 授权没有历史 | 目录读取每个授权留 200 条 | `plugins.consents.list`；设置页 |
| 计算机使用 | `ah/computer/computer-records.ts` | computer | 每轮的步骤与脱敏截图 | 有 | 截图 30 天 | `GET /api/computer/records` |
| 插件事件与项目事件 | `packages/plugin-runtime/src/event-repository.ts`；`packages/storage/src/sqlite.ts` 的 `events` | 各自 | 类型、载荷、actor、correlation_id | 载荷照存；没有「来源类别」列 | 没有清理 | 包内 |
| 宿主日志 | `logs/web-service*.log`（`installer/web-service-platform.ts`）；`ah/host-log.ts` | installer；host-log | 区域、事件、call_id、错误名与码 | 明确不存消息与堆栈 | 没有滚动 | 只是文件 |

**没有的。** 前端行为、曝光、停留、定位、高亮的采集一处都没有（搜过 telemetry、analytics、impression、sendBeacon、IntersectionObserver）。`packages/contracts/src/platform/dom-events.ts` 里的定位事件（`molis:surface-landing` 等）只在页面里流转。唯一落库的界面反馈是 `memory.signals.report` 的计数。智能呈现只有判断规则的结论（`modules/judgment-rules/src/store-schema.ts`），没有「实际呈现了什么、选了什么」。观察试用（[主动助理 §6.1](../proactive-assistant/spec.md#61-主动规则的观察试用)）没有代码。Sessions 插件已下线。

## 3 历史内容与版本

| 能按当时版本取回 | 只有当前态或有限历史 | 完全取不回 |
| --- | --- | --- |
| 成果库固定版本；记忆各版；用户改写的提示词各版；Todo 前后值；Feed 信号草稿；对象关系修订；工作流每步的交接正文；Goals 事件载荷 | Pages（14 天的改前副本）；Goals 目标本身；Feed 条目；收件；模型设置；Agent 读视图（入参摘要、输出截断） | 默认提示词与 method 的旧正文；Skill 生效的正文；检索的查询与结果；界面上实际呈现的候选与顺序；重启后的图片引用 |

## 4 权限与读取面

- 读取面碎片化：调用诊断只在设置页；助理对话只走工作台 HTTP；Agent 运行只给调用插件自己；记忆历史只给本人。评测、Skill、MCP 用同一个接口读不到同一份事实。
- 授权没有「用途」这一维。现在只有调用方（`packages/contracts/src/platform/actions.ts` 的 audience：user、agent、workflow、mcp、plugin）、动作的作用（read、write、irreversible）和权限字符串。
- 跨项目读取的现行规则：系统搜索不跨项目；`readable_project_ids` 只给本人和持有 `projects:reach` 的安装（`docs/system/SECURITY-INVARIANTS.md` S-49、S-74）。采集层的跨项目查询要沿用这条。
- 真实与演示只有项目级的 `data_class`（user 或 regenerable_demo，`packages/contracts/src/modules/projects.ts`）。记录本身没有任何「试用、回放、系统检查」的标记；`pnpm studio:replay`、记忆评测、Coding 长会话基准都是离线脚本，不在运行数据里留痕。

## 5 保留、清理与占用

- 没有统一保留期，所有规则是写死的常量：调用记录 2000／1000／200 行；知识回执 30 天或 5000 条；目录读取与提示词使用各 200 条；Pages 改前副本 14 天；Onboarding 暂存 30 天（`context-onboarding-service.ts`，挂在 `periodic-tasks.ts` 的周期任务上）。`events`、`plugin_events`、`memory_uses`、`function_judgments`、助理各表、`attention_events` 没有任何清理，只随项目、插件或对象删除。
- 没有占用计算，也没有容量提醒。`statfsSync` 只用在连接工具安装（要求至少 512 MiB 空闲）和 Home 恢复预检。
- 磁盘满只有 Onboarding 翻成用户能懂的话（`context-onboarding-staging.ts`）；别处遇到 SQLITE_FULL 只回滚，调用记录写失败直接吞掉。所以今天「没记下」在任何地方都看不出来。
- 设置页没有「隐私」「数据」「存储」分区（`apps/workbench/src/settings-sections.ts`）。

## 6 对照需求 §2.2 的覆盖

| 信息范围 | 现在 | 主要缺口 |
| --- | --- | --- |
| 用户意图与约定 | 部分 | 助理轮次有原话与材料；插件内 AI 与工作流的原始请求各存各的，没有统一关联 |
| 使用行为与交互 | 没有 | 打开、停留、选择、采用、拒绝、撤销、呈现的候选与顺序都没记 |
| 插件内容与业务变化 | 部分 | Todo、Feed 信号、成果、对象关系有版本；Pages、Goals 目标、收件只有当前态 |
| 检索、上下文与记忆 | 部分 | 记忆使用有记录；检索查询、返回、入选与截断都没有 |
| 主动判断与 Skill | 没有 | Skill 正文、版本、组合、用户覆盖与判断依据不落库；只有提示词的使用 |
| 计划与执行 | 部分 | Prologue 台账有过程，读不到全；工作流有步骤；调用记录无输入输出、无开始时间与耗时、无运行关联 |
| 中断与恢复 | 部分 | 运行有停止原因，没有发起者；被取消或撤权的执行按安全规则不写（这是边界，不是缺口） |
| 交付与后续结果 | 部分 | 成果版本有；采用、修改、返工没有关联回原工作 |
| 条件、体验与成本 | 部分 | 运行冻结模型与角色；助理用量无模型无成本；没有平台、插件、Skill 版本的统一快照；没有耗时 |
| 评测与人工判断 | 没有 | 没有样本、预期、判定的记录 |

**关联键。** 调用记录的 call_id 只是一次操作的编号，记录里没有运行、会话、目标、安装和版本（动作上下文里有 `runtime_session_id`、`plugin_install_id`，没带进记录）。工作流实例、定时 wakeup、目标事件都没有 call_id。从一次操作追到判断、步骤、业务变化，现在做不到。

**首次接入与补读。** 连接器同步只有 normal 和 rebuild_cursor 两种模式（`packages/contracts/src/platform/plugin.ts`）；Feed 条目分源时间与导入时间，是少数例外。Onboarding 采用时以本人（`web-user`）身份写入，和手动操作分不开，只能事后靠成果的 `origin.kind: "imported"`、Todo 的 `origin: "onboarding"` 辨认。知识库补读只是索引追平。

## 7 负载

本次只读代码，没有量。现状的写入方式：每个命令同步追加一行 JSONL，别的进程写过以后要整文件重读；工作流每次交接整行重写 JSON；Prologue 每轮多次落盘；宿主日志约 87 处调用。采集层上线后最重的会是界面行为和 Agent 过程两类。代表性负载与预算按需求 OCL-15 在实现批里量：在一次性隔离 Home 里回放 [eval-cases.md](eval-cases.md) 的连续工作，测交互与执行耗时、每天写入量和查询耗时，再定数字，不在这里写猜测值。

## 8 对设计的约束

1. 现有调用记录按安全规则不存输入输出，被拒的调用只留最小诊断（[AGENTS.md](../../AGENTS.md) 硬约束、S-35）。采集层不能复用它来存内容，也不能让它承担采集；被拒与取消的边界原样沿用。
2. 唯一的全局调用挂钩 `CallSettled` 只给上下文、描述和结果，异常被吞。采集挂在这里就要自己处理写失败，并把失败变成可见的缺口。
3. 往已有库的基线里加表，存量库会被结构检查拒绝；升级链（[升级后持续可用](../upgrade-continuity/spec.md)）还没有代码。采集层要用独立的新库，在 Home 库登记里声明。
4. 授权没有用途维度；跨项目读取只给本人、由宿主重算（S-74）。
5. 设置页新增一节要同时改分区表、导航类型、全局设置判定和渲染分发四处。
6. 没有统一的来源类别标记；Onboarding 导入与手动操作是同一个 actor。
