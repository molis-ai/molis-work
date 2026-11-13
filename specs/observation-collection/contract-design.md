# 观测和采集层：合同设计稿（第 28 批第一片）

状态：设计稿（2026-11-13，第 28 批主会话），待本批评审台与公共合同台（C 轨）合审；合审结论写在本批 PR 评论里，代码照本稿写，和本稿不一样的地方回来改本稿。依据：[需求](spec.md)、[设计](design.md)（第 21 批）、[盘点](inventory-2026-11.md)、[评测案例](eval-cases.md)；main `b66112d0d7`。

本稿回答 21 设计里留给第 28 批合同的几件事：包与库叫什么、一条记录长什么样、事实怎样写进来、证据快照怎样存与删（D1 的三个追问）、覆盖登记写什么、安全边界怎样守。**读取与管理**（按版本取回、权限与用途、增量、保留与清理、占用与提醒、界面）是第 29 批，本稿只给它留出位置，不定它的动作。

## 1 范围

| 本批（28）交 | 留给 29 | 留给更后面 |
| --- | --- | --- |
| 记录形状与来源类别；写入（进程内端口、平台动作、动作结算出口）；证据快照的写入与去重；覆盖登记的写入；逐入口接入；删项目、清除用户数据时一起删 | 公开读取动作（按工作、对象、时间、版本）、用途开关与跨项目权限、增量与变化通知、保留期与手动清理、占用与提醒线、设置「工作记录」四个页签 | 主线（36）、智能呈现（53、64）、观察试用（64）按 design §5 接入；评测样本的留存（30、63） |

本批的验证读库用包自己导出的查询函数（在宿主进程内、测试里），不对外开读取动作，免得在 29 定权限与用途之前多出一个没人审过的读取面。

## 2 包、库与归属

- **包**：`horizontal/observation`，包名 `@molis-ai/molis-work-service-observation`。只依赖 contracts、plugin-sdk、storage（与 `horizontal/placement` 同层同向）；宿主只装配（用户 2026-11-01 定，design §9 D2）。错误码主人 `observation`（`defineErrorCodes("observation", …)`），在 `tooling/gates/error-owners.json` 加一条。
- **合同**：`packages/contracts/src/services/observation.ts`，子路径 `@molis-ai/molis-work-contracts/services/observation`，合同 id `io.molis.work.service.observation.v1`，`maturity: "partial"`（读取在 29）。系统提供方 `system.observation`。
- **库**：Home 级独立库 `<Home>/observation/observation.db`，在 `apps/local-host/src/home-stores.ts` 登记为 `OBSERVATION_HOME_STORE`（主人 `horizontal/observation`），进 `platform-upgrade-stores.ts` 的平台库登记（不能用时的说明页：设置，29 的「工作记录」页签出来之前先指到「诊断」）。版本从统一起点 1 开始（`tooling/versions.json` 加 `database.observation_baseline`），结构快照进 `tooling/gates/schemas/stores.tsv`。表只由本包读写；`tooling/gates/table-owners.json` 不需要共写登记。
- **Home 快照与清除**：普通快照（`ordinarySnapshot`，随 Home 备份与恢复）；`uninstall --purge-user-data` 随登记一起删。
- **SSOT**：`docs/SSOT-MATRIX.md` 横向服务表加一行（主人只拥有观察记录、关联、来源类别、覆盖与证据快照；业务事实留在原主人）；`docs/system/PACKAGE-BOUNDARIES.md` 现行包清单与 `scripts/workspace-packages.mjs` 登记加一行，成熟度 `slice`（读取在 29 之前）。

## 3 一条记录

字段名是合同里的名字。**粗体**是写入方给的；其余由采集层从可信上下文取或自己盖，写入方给了也不认。

| 字段 | 内容 | 来源 |
| --- | --- | --- |
| `record_id` | 采集层给的编号（时间有序） | 采集层 |
| `owner` | 事实主人：`{ kind: "plugin", id: <plugin_id> }`、`{ kind: "service", id: <服务名> }` 或 `{ kind: "shell" }`（工作台外壳） | 写入方的可信身份（§4），不读输入 |
| **`fact`** | 事实种类，`<主人前缀>.<名字>`，小写点连接，如 `action.call`、`ui.stage`、`agent.tool_call`、`workflow.step` | 写入方；插件写的必须以自己的 `plugin_id` 开头，平台服务的前缀在合同的 `OBSERVATION_SERVICE_FACTS` 里列明 |
| `actor` | `{ actor_id, actor_kind, audience, delegated_by?, delegated_audience? }` | 调用上下文 |
| `entry` | `workbench`、`desktop`、`assistant`、`mcp`、`cli`、`workflow`、`schedule`、`plugin`、`background`、`host` | 调用上下文：audience、MCP 客户端、user_action 的入口、后台任务；推不出时为 `host`，不猜 |
| `project_id`、`install_id` | 在哪个项目、哪个安装 | 调用上下文 |
| **`subjects`** | `{ kind, id, version? }[]`，至多 16 个 | 写入方 |
| **`occurred_at`** | 真实发生时间；缺省为收到时间；晚于收到时间按收到时间记，并在记录上标 `clock_adjusted` | 写入方 |
| `received_at` | 采集层收到的时间 | 采集层 |
| `work` | `{ call_id, invocation_id?, parent_invocation_id?, runtime_session_id?, run_id?, work_ref? }` | `call_id` 取调用上下文（同一次操作的嵌套调用共用）；`invocation_id` 每次动作调用一个；`parent_invocation_id` 取正在运行的处理器；`run_id`、`work_ref` 由写入方给（运行编号、助理工作编号），不知道就不填，记录即「未关联」 |
| **`stage`**、**`outcome`** | 阶段（自由词，按 `fact` 约定）；结果：`succeeded`、`failed`、`refused`、`cancelled`、`waiting`、`no_action`、`no_response`、`taken_over`、`unknown` | 写入方 |
| `source_class` | §5 的八类 | §5 |
| **`conditions`** | `{ platform_version, plugin?: {id, version}, prompts?: {key, version}[], skills?: {id, version}[], model?: {provider, model_id} }` | 写入方给引用；`platform_version` 采集层盖 |
| **`detail`** | 这一种事实自己的小字段：只收字符串、数字、布尔，至多 32 个键，每个字符串至多 512 字；放错误码、耗时、计数、序号这一类，不放正文 | 写入方 |
| **`evidence`** | `{ role, ref }[]`，至多 16 条；`ref` 是 §6 的三种之一 | 写入方给内容或引用，采集层存快照 |
| `coalesced` | 合并的条数与最后时间（只用于 §7 声明过的高频细节） | 采集层 |

**为什么 `detail` 只收标量**：正文都走 `evidence`，好按内容去重、随保留期删、受用途开关管；记录本身保持小而可数（OCL-10）。

## 4 三条写入路

| 路 | 谁用 | 身份 | 怎样调 |
| --- | --- | --- | --- |
| **动作结算出口** | 动作网关（kernel），覆盖页面、助理、工作流、定时、MCP、命令行经网关的每一次调用 | kernel 的调用上下文 | kernel `ActionService` 的 `effects` 新增 `observed?: CallObserved`，与诊断用的 `settled` 并列：`settled` 仍然不见输入和结果；`observed` 在同一处结算时拿到开始与结束时间、处理器是否已开始、原始输入与结果。宿主把它接到采集层，一次调用一次，不阻塞调用、不改结果；出口自己抛错照旧不影响调用，但会算进 §8 的「丢失」 |
| **进程内端口** | 平台服务（agent-host、scheduler、search、knowledge、memory 在宿主里的那一侧、assistant、onboarding、connector-host、授权） | 宿主装配时按服务给定 `owner: {kind:"service", id}`，服务改不了 | contracts 新增 `ObservationSink`：`record(fact)` 同步入队、不抛、不等；服务的 ports 里多一个可选 `observation?: ObservationSink`，没装配时什么都不做 |
| **平台动作** `observation.report@1` | 工作台外壳（界面阶段）、插件（含工作流、Schedule 插件、内置与第三方一样） | 外壳：Host 自己的「工作记录上报」入口给的 `user` 调用，`owner = shell`；插件：plugin audience 的调用，`owner = {kind:"plugin", id: calling_plugin_id}` | 命令，输入 `{ facts: ObservationFactInput[] }`，一次至多 100 条；返回 `{ accepted, rejected: {index, code}[] }`。插件的 `fact` 前缀不是自己的 `plugin_id` 就拒这一条；外壳只收 `ui.*`。不等模型，不声明 `concurrent`。audiences：`user`、`plugin`（不给 agent、mcp、workflow：它们的事实由出口与服务自己记，不能自报） |

`observation.report@1` 本身的结算**不进**动作结算出口（否则每次上报又生一条），在覆盖登记里写「不适用：上报通道本身」。

## 5 来源类别

`real`、`first_read`、`catch_up`、`imported`、`trial`、`replay`、`demo`、`system_check`（后四类是 design §3 的「模拟·试用／回放／演示／系统检查」）。按这个顺序定，前面的赢：

1. 项目 `data_class = "regenerable_demo"` → `demo`。采集层装配时从目录取，不信写入方。
2. 采集层的**来源范围**：kernel 新增 `withObservationSource(kind, fn)`（与 `withCallId` 同一个 AsyncLocalStorage 写法），宿主入口包住自己的工作：Onboarding 采用（`first_read` 或 `imported`，由入口按用户选的是「接入已有」还是「导入文件」定）、连接器首次同步与断线重连补读（`first_read`、`catch_up`）、平台自检（`system_check`）、评测回放（`replay`，30 批起用）。范围里发生的所有记录（含出口记的动作调用）都带这一类。插件进程外（沙箱）的回调不继承这个范围：沙箱插件自己报的事实默认 `real`，在覆盖登记里对「沙箱插件的首次同步」写「暂不可用」，不猜。
3. 写入方给的 `source_class`：只有 `owner` 是插件或服务时认，而且只认 `first_read`、`catch_up`、`imported`（主人最清楚一批条目是不是补读，例如 Feed 断线重连）；外壳报的一律 `real`。
4. 其余 `real`。

试用（`trial`）的入口在 64 批，本批只在合同里留这一类。

## 6 证据与快照（D1 的落地）

`evidence[].ref` 三种：

- `{ kind: "owner", owner, id, version }`：主人自己有固定版本（成果库版本、记忆版本、Todo 前后值、对象关系修订、工作流交接、Goals 事件、助理轮次的 revision）。只放引用，不复制。
- `{ kind: "snapshot", digest, bytes, media_type }`：主人留不住的（动作调用的输入与结果、Pages 正文、提示词与 Skill 生效正文、检索结果、模型收到的消息、呈现的候选）。写入方给内容（`{ kind: "content", media_type, text | json | base64 }`），采集层算 sha256、gzip 压缩后存进 `evidence_blobs`，同一摘要只存一份。
- `{ kind: "missing", reason }`：`not_obtained`、`truncated`、`redacted`、`by_rule`、`forbidden`（`expired` 由 29 的清理写）。

上限：一份快照解压后至多 4 MiB；超出只存摘要与长度，写成 `missing: truncated`，并在覆盖登记该事实下计一次截断。

**D1 的三个追问**（用户 2026-11-05 定 A 后由本稿回答）：

1. **共用快照什么时候删**：快照没有自己的保留期，只跟引用走。`record_evidence(record_id, digest)` 记谁引用了谁；29 的清理删掉记录后，在同一个事务里删掉不再被任何记录（和任何「留存」）引用的快照。共用不会延长某条记录的保留期：记录到期照删，快照只是因为别的还在引用而留着。
2. **评测样本**：库里先建 `evidence_holds(digest, holder, until)`，本批不写；30／63 批的评测样本经它「留存」所引用的快照与记录。清理只看引用与留存都没有了才删快照；留存到期前提示用户的流程归 29／30。
3. **删项目、卸载、导出、备份**：删项目（`ProjectDeletionService` 的提交里）删掉这个项目的全部记录，再回收无人引用的快照，覆盖登记里这个项目的行一起删；插件按「清除用户数据」卸载时删掉 `owner` 是它的记录（保留它的动作被出口记下的调用记录：那是平台的事实）；Home 备份与恢复带着这个库（普通快照）；导出归 29 的用途开关（默认关）。

**密钥**：动作的输入与结果按合同不含明文凭据（`AGENTS.md`：密钥只给引用）。出口仍做一道兜底：对已知的凭据形状先脱敏再存（与 SDK 的 `redactSecrets` 共用一份规则：私钥、认证与 Cookie 头、token／secret／password 值、已知令牌前缀、JWT），脱敏过的证据标 `redacted`。

## 7 动作调用记什么（出口一行）

| 情况 | 记录 | 证据 |
| --- | --- | --- |
| 处理器开始前被拒（`refused`） | `action.call`，`outcome: refused`，`detail.code` | 无。只有谁、什么动作、结果与错误码（S-35 的最小诊断；`missing: by_rule`） |
| 处理器开始后被取消、撤权、停用（错误的类别是 `cancelled`，或错误码是 `actions.provider_changed`、`actions.provider_replaced`、`actions.provider_stopped`、`actions.plugin_disabled`、`actions.reauthorize`、`actions.stopped`、`actions.host_closed`，或调用的 signal 已中止） | `outcome: cancelled`，`detail.code` | 无（`by_rule`）：不借采集之名新增被禁止的记录 |
| 处理器失败 | `outcome: failed`，`detail.code`，`detail.duration_ms` | 输入快照；错误信息不存（与诊断记录同一口径，它只留 200 字给命令，采集层不另存） |
| 成功的命令 | `outcome: succeeded`，`detail.duration_ms` | 输入与结果快照 |
| 成功的读取 | 同上 | 输入与结果快照；同一 actor、同一动作、同一输入与结果摘要，一分钟内重复的合成一条（`coalesced`），在覆盖登记里声明「成功读取：按一分钟合并相同的读」（OCL-10） |
| `observation.*` 自己的调用 | 不记 | — |

`invocation_id` 每次调用一个；`parent_invocation_id` 取 `runningHandlerContext()` 那次调用的 `invocation_id`，这样工作流一步、助理一次工具调用里套的动作能接回来。

## 8 覆盖登记

表 `coverage`：`(owner, fact, project_id)` 一行现在的状态，外加 `coverage_gaps` 记时间段。九种状态：`complete`、`not_connected`、`unavailable`、`lost`、`truncated`、`redacted`、`expired`、`not_applicable`、`by_rule`。

- 每接上一类事实，装配时登记 `complete`，带「从何时起」。合同里给出本批的**接入清单**（`OBSERVATION_COVERAGE_PLAN`：每个入口、事实、主人、本批状态与原因），没接上的写 `not_connected` 与原因，29 的页签照它显示；接入清单与真实装配不一致由测试拦下。
- **写失败**：批量落盘失败（磁盘满、库坏）时，那一批按 `(owner, fact, project_id)` 计数，记一段 `lost`（起止时间、条数）；登记本身也写不进去时留在内存，下次写成功时补上；进程退出前仍没写进去的，下次启动登记一段「原因未知的丢失」从上次最后一条记录到这次启动。业务调用照常完成，不因为记录失败报错（OCL-15，EC-10）。
- **截断、脱敏、按规则不记**：按事实计数，挂在同一行上。

## 9 调用次数、落盘与性能

- 写入只入内存队列，每 250 毫秒或满 200 条在一个事务里落盘（WAL，`synchronous = NORMAL`）；同一批里同一摘要的快照只算一次、只写一次。关库与宿主停止时先刷完。
- 出口与端口都不读库、不发请求；`observation.report@1` 一次请求带一批，外壳最多每 2 秒发一次，页面隐藏时（`pagehide`、`visibilitychange`）立刻发一次，不轮询。
- 不额外开库：整个 Home 一个连接，宿主装配时打开、停止时关。
- 预算数字等本批接完一周回放（eval-cases §4）实测后再定；本批先量出 EC-01、02、06、09 每轮多写多少字节、多花多少毫秒，写进盘点 §7。

## 10 合同改动清单

- `packages/contracts/src/services/observation.ts`（新子路径）：记录与输入类型、来源类别、结果、覆盖状态、`ObservationSink`、`observation.report@1` 定义、服务事实前缀、接入清单；`tooling/gates/api/` 新快照。
- `packages/contracts/src/platform/actions.ts` 不改：来源范围走 kernel 的 AsyncLocalStorage，不进 `ActionCallContext`（它不该是调用方能带的东西）。
- `packages/kernel`：`CallObserved` 类型与 `effects.observed`；`withObservationSource`、`currentObservationSource`。kernel 的公开导出变了，按共享核心跑全量（本批 CI 全量）。
- 动作合同快照：`tooling/gates/actions/host-actions.tsv` 多 `observation.report@1` 一行（`pnpm actions:update`）。
- DOM 事件：外壳上报不新增跨模块事件；若界面阶段要从插件页面传到外壳，用已登记的定位事件，新增的在 `dom-events.ts` 同一提交登记。

## 11 开工前检查

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 采集层只拥有观察记录、关联、来源类别、覆盖与证据快照；业务事实与版本留在原主人，记录里放引用。SSOT 加一行 |
| 2 | 插件同等待遇 | 插件只经 `observation.report@1` 报事实，内置与第三方同一条路、同一个前缀规则；沙箱插件不继承来源范围的差别写进覆盖登记，不给内置开私路 |
| 3 | 能力注册 | 上报注册一次成系统动作；出口与端口是平台内部装配，不是第二条能力路；身份全从调用上下文与装配来；不等模型，不 `concurrent` |
| 4 | 合同 | 改：新子路径、kernel 的出口与来源范围、动作快照一行。M1 之前不留兼容期；没有别的批在等，随本批 PR（轨道规则 1） |
| 5 | 放在哪个包 | 新包 `horizontal/observation`，宿主只装配 |
| 6 | 表与存储 | 独立 Home 库，登记进 Home 库与平台升级登记，版本 1，结构快照入库；表只由本包读写 |
| 7 | 兼容与迁移 | 不加。现有调用诊断、各主人的记录照旧，不迁入、不回填（盘点里的历史在覆盖登记写「取不到」） |
| 8 | 安全边界 | 碰动作网关的结算（新出口）。守 S-35：被拒与被取消的调用只留最小诊断、不存内容；身份不读输入；上报的前缀与 audience 校验；凭据兜底脱敏。同步改 `docs/system/SECURITY-INVARIANTS.md`，加拒绝测试：被拒调用的记录里找不到埋入的输入；插件冒用别人前缀被拒；agent／mcp 自报被拒；取消后的调用不存证据 |
| 9 | 调用次数 | 写入入队、批量落盘、一个连接；外壳每 2 秒至多一次上报；不轮询；出口不读库 |
| 10 | 升级与数据 | 新库从版本 1；结构变化走升级链（`upgrade-chain-design.md`）；金样随 Home 金样生成 |
| 11 | 成果与过程项 | 记录与快照不进成果库，也不是过程项 |
| 12 | 页面、外壳与文字 | 本批无新界面；外壳上报不改页面；新文字（覆盖登记的原因）存键与参数，不存译文 |
| 13 | 错误 | `defineErrorCodes("observation", …)`，不写 Error 子类 |
| 14 | 冲突面 | kernel（共享核心，C 轨）、宿主装配（`project-host.ts`、`home-stores.ts`、`platform-upgrade-stores.ts`）是枢纽；与 #2047（31 批，改 agent-host）在 agent-host 适配器上会交叠，收尾同步 main 时一次解 |
| 15 | 全局最优 | 见下 |

**第 15 项五个场景。** 插件：报事实只多一次动作调用，不用了解采集层的库；第三方与内置同一路；插件的业务动作已被出口记下，大多数插件什么都不用写。平台：出口挂在唯一的结算处，一处接上就覆盖页面、助理、工作流、定时、MCP、命令行；服务各自只在没有动作的那几处（运行事件、唤醒、检索）用端口。助理：助理与 Agent 的工具调用就是动作调用，出口自动记；运行事件由 agent-host 用端口记；助理不能自报事实（audience 不给 agent）。各类平台能力：评测（30、63）、主动助理（64）、报告读同一份记录，读取在 29 一次定权限；主线（36）与智能呈现（53、64）新入口用同一个端口或上报动作接入，不另建。后续开发：再加一种事实只是一个新的 `fact` 名字与接入清单一行；记录结构不随事实种类变。

**比较过的做法。** 出口：(a) 扩展 `CallSettled` 带上输入与结果——它是诊断用的，规则是「从不见输入和结果」，混在一起以后诊断记录容易被改坏，没选；(b) 采集层包装每个提供方的处理器——会漏掉处理器之前的拒绝，也要每个提供方都包，没选；(c) 与 `settled` 并列的 `observed`——选它。来源类别：(a) 进 `ActionCallContext`——调用方能带的字段要处处防伪，且会被嵌套调用传给不相干的工作，没选；(b) AsyncLocalStorage 范围——只有宿主入口能设，选它，代价是沙箱插件的回调拿不到，写进覆盖登记。

## 12 合审要点

请公共合同台重点看：`effects.observed` 是否放在 kernel 公开导出里合适；`ObservationSink` 作为服务 ports 的可选项是否会让 agent-host、scheduler 的端口膨胀；`observation.report@1` 的 audiences 只给 `user`、`plugin` 是否够 36、53、64 后续接入用。

## 13 决策记录

| 日期 | 决定 | 依据与没选的 |
| --- | --- | --- |
| 2026-11-13 | 包名 `horizontal/observation`，提供方 `system.observation`，错误码主人 `observation`；用户看到的名字仍是「工作记录」 | 与需求名「观测和采集层」一致；错误码主人名不许连字符，`work-records` 不行 |
| 2026-11-13 | 读取动作不在本批开，本批用包内查询函数验证 | 读取面的权限与用途在 29 一次定；先开一个会被改掉的读取面，是给后来留兼容包袱 |
| 2026-11-13 | 模型实际收到的完整消息：先按 D4 方案 A 从运行事件里取能取的（用户原话、工具入参与结果、用量、停止），完整消息在覆盖登记写「暂不可用：运行底座不提供」 | 第 24 批盘点没有核这一项；现在的事件流只有 `prompt`（用户这轮的原话），系统提示与历史消息不在里面。要不要请上游开读取口是红线，攒到本批中途一起问用户 |
