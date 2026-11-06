# 观测和采集层：事实来源盘点（2026-11）

状态：只读盘点（2026-11-04，第 21 批），基线 main `aac9cfeec`。§1～§6、§8 只读代码，没有启动服务，没有碰真实 Home，也没有解包 vendored Prologue SDK；SDK 台账的内部表结构写「未核」。§7 是 2026-11-05 在一次性隔离 Home 里实测的现状负载（main `d82329833`）。行号会随 main 漂移，以文件和符号为准。设计见 [design.md](design.md)，评测案例见 [eval-cases.md](eval-cases.md)，需求见 [spec.md](spec.md)。

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

2026-11-05 实测现状（用户当天定：先量现有记录，给第 28 批选写入方式用；预算数字等第 28 批开始记录后再定，这里不写）。只量现有各类记录写多少、怎么写、写入耗时；采集层自己的写入与查询还没有，没法量。

### 7.1 方法

- **Home**：每次运行用 `mkdtemp` 建一个临时目录做 Home，设 `MOLIS_WORK_HOME`、`MOLIS_WORK_SECRET_BACKEND=file`、`NODE_ENV=test`；照 `tests/fixtures/test-home.ts` 的 `openTestHome` 起产品自己的宿主（`MolisWorkLocalHost` 加目录策略）和网页服务（`apps/desktop/launchers/web/server.ts`，回环地址、端口 0），经项目设置建项目、装 Pages、Todo、Workflows、Schedule。跑完关服务、删 Home。没连 4207/4208，没读 `~/.molis-work`。
- **模型**：本机假模型（Anthropic 消息格式，照 `tests/fixtures/issue-model.ts`、`configured-models.ts` 登记），每轮回 400 字左右，结尾复查与知识卡片的旁路请求照 `tests/fixtures/ending-review.ts` 回答。
- **驱动**：业务操作用 `host.actionClient(项目).invoke`，调用方是本人（`web-user`、audience `user`）；助理走产品路由 `POST /projects/<id>/api/assistant/send`，轮询 `/api/assistant/works/<id>` 到结束；定时照 `tests/schedule-task-runner.test.ts` 用 `scheduleServiceFor(store.db).tick()` 触发真实唤醒。各插件先读一次（打开插件库），不计入。
- **量什么**：每段前后对 Home 做快照（每个文件大小；每个 SQLite 表的行数与各列字节之和）。同一进程里给 `node:sqlite` 和 better-sqlite3 的写语句、`ActionCallLog.record`、`fs` 的写入与 fsync 计时计数（只在测量脚本里包一层，不改产品代码）。耗时取每次操作的合计，报 p50/p95。另对 `ActionCallLog` 单独做了微基准（空目录，2600 行，含两个写入方交替）。
- **跑了几次**：完整场景用假模型跑了 4 次（3 次直接跑，1 次经机器槽位），字节数各次一致，耗时差别大，下文给范围。机器：Apple M5、10 核、16 GB、macOS 26.3.1；同时有别的会话在构建和跑测试，负载均值约 10。
- **复现**：测量脚本不入库。要点：照上面起 Home；用 `node --import tsx` 跑（需要先 `pnpm build`）；在脚本最前面包 `DatabaseSync.prototype.prepare`、`StatementSync.prototype.run`、better-sqlite3 的 `Statement.prototype.run`、`ActionCallLog.prototype.record`（从 `apps/local-host/dist/action-call-log.js` 取同一个类）和 `fs` 的写入、fsync 函数，改完调 `module.syncBuiltinESMExports()`。

### 7.2 代表性工作

参照 [eval-cases.md](eval-cases.md) 的 EC-01、02、06、09、13：

| 段 | 对应 | 一次运行里做了什么 |
| --- | --- | --- |
| 手动编辑 | EC-01 | 新建 1 篇文稿，`pages.update` 100 次，正文从 200 字长到 4600 字；读 20 次 |
| 待办与目标 | EC-01 周边 | 待办新建 15、改状态 15；目标新建 1、便笺 10 |
| 工作流 | EC-06 | 两站（Pages→Pages）流程，函数交接；开始 5 次、交接 5 次 |
| 记忆 | EC-02 前提 | 写 3 条个人记忆，让后面的轮次用到它们 |
| 助理 | EC-02、EC-09 | 8 项新工作（带选区、3 份资料）；同一项工作追问 5 轮 |
| 定时 | 定时任务 | 建 1 个每日 Agent 任务，唤醒 4 次 |
| 界面选择 | EC-13 | 现在界面阶段不落任何记录（§2「没有的」），没有可量的 |

**一天的工作量（假设）**：一个人、一个项目。写作 2 小时，Pages 在停手 400 毫秒后自动保存（`plugins/native/pages/src/browser/document.ts`），按每 25 秒左右停一次算，约 300 次保存；助理 10 项新工作、20 次追问；工作流 5 次运行；定时任务 2 个、各跑 1 次；待办新建 20、改状态 20；目标便笺 10；记忆写入 2。这是为了换算量级的假设，不是观察到的使用数据。

### 7.3 每次操作写什么

字节是写入时交给系统的字节，或表里各列的字节之和；WAL 增量是 SQLite 实际写的页，比逻辑字节大得多。耗时是这次操作里该记录写入的合计。

| 记录 | 操作 | 每次写几条、多大 | 写法 | 落盘 | 写入耗时（p50 / p95） |
| --- | --- | --- | --- | --- | --- |
| 调用记录 `logs/action-calls.jsonl` | 每个命令 | 1 行，340～430 字节（失败的带错误信息，多 90 字节左右）；成功的读取不写 | 同步 `appendFileSync` 追加 | 不 fsync，只交给系统缓存 | 0.1～0.2 / 0.3～1 毫秒；进程里第一次 1.5～2.4 毫秒（整文件读一遍数行） |
| 同上 | 10 分钟内同一调用重复（自动保存、连续新建待办） | 不加行：截掉最后一行，重写成折叠行；折叠行带最近 20 个 call_id，长到 1.1 KB 左右 | 截断加追加 | 同上 | 同上 |
| 同上 | 超过 2000 行 | 留最近 1000 条命令和 200 条其他，整文件写临时文件再改名；2000 行时文件约 700 KB | 整文件重写 | 同上 | 一次 4.4 毫秒（微基准） |
| 同上 | 另一个进程写过之后 | 每次都把整个文件读一遍找最后一行 | — | — | 1000～2000 行时 0.6 / 1.0 毫秒，单写入方时 0.02 毫秒（微基准） |
| Prologue 台账 `agent-runtime/records` | 助理新工作一轮 | 约 52 个文件写，约 100 KB：运行记录 7 次 17.6 KB、发布的资源 10 个（正文块 10 次 55 KB、元数据 10 次 1.8 KB）、会话索引 5 次 11.7 KB、任务板 6 次 6.3 KB、谱系 10 次 5.5 KB、幂等 2 次 3.2 KB、会话 2 次 | 每次写一个整 JSON 文件；索引、任务板、谱系每次整文件重写 | 每个文件都 fsync | 每次 fsync 3.5～4.5 / 8～25 毫秒；负载高时到 150 毫秒，见过一次 3.4 秒。一轮合计约 50 次 |
| 同上 | 同一工作追问一轮 | 约 34 个文件写，约 117 KB；会话索引整文件重写，第 6 轮时每轮写 33 KB | 同上 | 同上 | 同上 |
| 同上 | 定时任务跑一次 | 约 24 个文件写，约 68 KB | 同上 | 同上 | 同上 |
| 助理 `assistant/assistant.db` | 新工作一轮 | 8 行约 13.3 KB（轮次 5 KB，含原话、选区、资料；请求 0.7 KB；工作 0.9 KB；通知、用量、关系各一行） | SQLite 事务，回滚日志（库用默认的 DELETE 模式） | 默认同步 | 5～8 / 6～34 毫秒 |
| 同上 | 追问一轮 | 4 行约 1.5 KB | 同上 | 同上 | 4～6 / 4～10 毫秒 |
| 提示词使用 `agent-definitions.db#prompt_uses` | 每轮 | 6 行约 580 字节；每个 key 留 200 条 | 同上 | 同上 | 1.8～4 / 4～57 毫秒 |
| 记忆 `memory/memory.db` | 写一条记忆 | 修订、变化、标记 5 行约 2.2 KB | WAL | 默认同步 | 0.6 / 2.9 毫秒 |
| 同上 `memory_uses` | 用到记忆的新工作一轮 | 1 行 660 字节；同一工作追问不再写 | WAL | 同上 | 0.1～0.4 毫秒 |
| 工作流 `workflows.db#instances` | 开始一次运行 | 1 行 1.4 KB；WAL 16 KB | 插入 | 同上 | 0.2 / 0.4 毫秒 |
| 同上 | 交接一次 | 整行重写，带交接正文：4600 字的文稿交接后整行 27 KB；WAL 45～120 KB；另经动作写 3 行调用记录 | 整行 UPDATE | 同上 | 0.5 / 1.0 毫秒 |
| 定时 项目库 `schedule_*` | 建任务 | 4 行约 630 字节 | better-sqlite3，WAL，`synchronous = FULL` | fsync | 0.5 毫秒 |
| 同上 | 跑一次 | 唤醒 1 行 160 字节、对话轮次 1 行 1.4 KB（随回复长度）、任务更新；另 2 行调用记录 | 同上 | 同上 | 0.4 / 0.5 毫秒 |
| Goals 工作事件（项目库） | 便笺一条 | `goal_work_events` 305 字节、`events` 383 字节、幂等 310 字节，共约 1 KB | 同上 | 同上 | 0.2～0.5 / 0.9～2.8 毫秒 |
| 同上 | 新建目标 | 7 行约 2.8 KB | 同上 | 同上 | 1.3～1.5 毫秒 |
| 宿主日志 | 整段工作 | 0 行（只有出错和告警才写，调试行默认关） | stderr 一行一条 | 由 LaunchAgent 写文件 | — |
| 参照：Pages 正文 | 自动保存一次 | 整行重写，4600 字时行约 16 KB；WAL 每次 18 KB | 整行 UPDATE | WAL | 0.1～0.25 / 0.2～0.8 毫秒 |
| 参照：待办 | 新建 / 改状态 | 2 行 470 字节 / 1 行 240 字节；WAL 每次约 25 KB | WAL | 同上 | 0.1～0.2 / 0.4～0.8 毫秒 |

另外：编辑与目标的写入会在后台带出检索索引（`search.db`）与知识卡片（`knowledge.db`）的写，每次几百字节到几 KB 的行、几十 KB 的 WAL，属于派生物，不在上表。

**整次操作的耗时**（四次运行的 p50 范围；同一机器负载重，p95 跨度很大）：自动保存 3～12 毫秒，待办 3～30 毫秒，便笺 24～80 毫秒，工作流交接 50～210 毫秒，助理新工作一轮 0.48～0.63 秒、追问 0.25～0.67 秒（假模型，几乎不等模型），定时唤醒 0.22～0.92 秒。上表的记录写入在这些操作里占：调用记录和 WAL 库都在 1 毫秒以内；助理一轮的两个回滚日志库合计约 10 毫秒；台账的 fsync 一轮合计约 50 次 × 4 毫秒。台账这些 fsync 是不是都在轮次的等待路径上，没量。

### 7.4 一天的量级（按 7.2 的假设换算）

| 记录 | 每天写多少次 | 每天交给系统的字节 | 留在盘上 | 增长与清理 |
| --- | --- | --- | --- | --- |
| Prologue 台账 | 约 1250 次文件写，每次 fsync | 约 3.5 MB | 每轮约 55 KB，一天约 1.7 MB | 没看到按时间或大小的自动清理（SDK 有删会话的 purge 和带期限的资源回收，宿主只在新会话建索引失败时 purge；只量了短跑）；同一会话越长，每轮重写的索引越大 |
| 调用记录 | 约 380 个命令 | 约 0.4 MB（自动保存的折叠行每次重写 1.1 KB） | 40～380 行，几十到一百多 KB；同一调用连续出现就折叠，所以行数不等于操作数（一次运行 175 次写只留下 33 行） | 文件长到 2000 行才裁，裁成最近 1000 条命令和 200 条其他；不折叠时最老的记录留 2.6～5.3 天 |
| 助理库 | 30 轮 | 约 165 KB；提示词使用 180 行约 17 KB | 同左 | 助理各表不清理；提示词使用每个 key 留 200 条 |
| 工作流实例 | 5 次运行、5 次交接 | 行约 140 KB；WAL 约 0.7 MB | 约 140 KB | 不清理，删项目才删 |
| 记忆使用 | 10 行 | 约 7 KB | 同左 | 遗忘一条记忆时一起删 |
| Goals 工作事件 | 10 条便笺 | 约 10 KB | 同左 | 跟着目标删除 |
| 定时 | 2 次 | 约 3 KB（另计入台账） | 同左 | 任务取消时删 wakeup |
| 宿主日志 | 0 | 0 | 0 | 没有滚动 |
| 参照：Pages 自动保存 | 300 次 | 行最多约 4.8 MB，WAL 约 5.4 MB | 当前态一行 | 只有当前态 |

### 7.5 局限

- **假模型**：每轮只回一段话、不调工具，几乎不等模型。真实模型会调工具、回得长、轮次多，台账的运行记录、助理轮次、定时对话轮次都会更大，经动作的工具调用也会多写调用记录。试过一次 MiniMax（一次性隔离 Home，同一脚本，助理 2 轮、定时 1 次）：第一项助理工作停在「已停止」，随后脚本连本机服务时连接被重置，没有留下可用的数字，所以真实模型每轮的台账大小没量；助理一轮发给模型的请求约 47 KB，这一部分与模型无关。
- **发布的资源**：台账里每轮重新发布角色说明（约 14.5 KB）和材料，同一大小的文件每轮都出现一次，但文件是加密的，没比内容是否相同。
- **没覆盖的入口**：工作台页面、MCP、命令行、桌面壳、插件页面路由都没走；业务操作直接调宿主的动作客户端，省掉了 HTTP 那一层（助理除外）。Coding、Feed、连接器同步、Onboarding、计算机使用没跑。EC-13 的界面阶段现在没有记录。
- **WAL 增量**：WAL 在检查点后从头复用，文件大小只增不减，所以长段里的 WAL 增量会少算；表里的 WAL 数字只作量级。
- **机器**：同机有别的构建和测试，负载均值约 10；耗时的 p95 与最大值主要反映这个负载。调用记录的追加不 fsync，在掉电时可能丢最后几行，这一点只从代码看到，没有做掉电测试。
- **一天的量**是假设乘以实测的单次量，不是观察到的使用数据。

### 7.6 对第 28 批写入方式的含义

只写测出来的事实推论，不定预算：

1. 按字节和落盘次数，现有记录里最重的是 Prologue 台账：每轮几十次带 fsync 的整文件写，一天约 3.5 MB、上千次 fsync，没看到按时间或大小的自动清理。助理一轮发给模型的请求约 47 KB；采集层若照台账的写法每轮另存一份完整请求，会在每轮约 100 KB 之上再加这么多，fsync 次数另算。
2. 每个命令同步追加一行、不 fsync 的写法，单写入方时每条 0.02～0.2 毫秒，一天几百条不成问题。问题出在两处：别的进程交替写时每条都要整文件重读（1000～2000 行时约 1 毫秒），和折叠让行数不再等于操作数。采集层如果有多个写入进程，或记录要逐次可数，不能照搬。
3. 回滚日志模式的 SQLite（助理库、提示词使用）每轮写入 2～8 毫秒，约是行数相近的 WAL 库的 4～13 倍（各库每次写的行数不同，只作量级）。
4. 整行重写的记录（工作流实例）写入量随正文变大：一次交接写 27 KB 的行、上百 KB 的 WAL。证据若按内容寻址只放引用，可以避开这一项。
5. 现有最频繁的写来自界面：自动保存每天几百次，每次都是一个命令。采集界面行为（EC-13，[design.md §9](design.md#9-待决与裁定) D3 的粒度）后，条数由事件粒度决定；单是保存这一种就已每天几百次。界面行为现在没有记录，没法量。

## 8 对设计的约束

1. 现有调用记录按安全规则不存输入输出，被拒的调用只留最小诊断（[AGENTS.md](../../AGENTS.md) 硬约束、S-35）。采集层不能复用它来存内容，也不能让它承担采集；被拒与取消的边界原样沿用。
2. 唯一的全局调用挂钩 `CallSettled` 只给上下文、描述和结果，异常被吞。采集挂在这里就要自己处理写失败，并把失败变成可见的缺口。
3. 往已有库的基线里加表，存量库会被结构检查拒绝；升级链（[升级后持续可用](../upgrade-continuity/spec.md)）还没有代码。采集层要用独立的新库，在 Home 库登记里声明。
4. 授权没有用途维度；跨项目读取只给本人、由宿主重算（S-74）。
5. 设置页新增一节要同时改分区表、导航类型、全局设置判定和渲染分发四处。
6. 没有统一的来源类别标记；Onboarding 导入与手动操作是同一个 actor。
