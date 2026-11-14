# 观测和采集层：合同设计稿（第 28 批第一片）

状态：设计稿第 3 版（2026-11-13，第 28 批主会话）。第 1 版（`8e2e1e0f27`）经本批评审台兼公共合同台合审退回 11 处，第 2 版（`6284156165`）逐条改过；复核时其中两处（上报限额、缺失原因）还差一步，本版补上（见 §14、§15）；改后再交同一评审复核，结论写在本批 PR 评论里。代码照本稿写，和本稿不一样的地方回来改本稿。依据：[需求](spec.md)、[设计](design.md)（第 21 批）、[盘点](inventory-2026-11.md)、[评测案例](eval-cases.md)；main `b66112d0d7`。

本稿回答 21 设计里留给第 28 批合同的几件事：包与库叫什么、一条记录长什么样、事实怎样写进来、证据快照怎样存与删（D1 的三个追问）、覆盖登记写什么、安全边界怎样守。**读取与管理**（按版本取回、权限与用途、增量、保留与清理、占用与提醒、界面）是第 29 批，本稿只给它留出位置，不定它的动作。

## 1 范围

| 本批（28）交 | 留给 29 | 留给更后面 |
| --- | --- | --- |
| 记录形状与来源类别；三条写入路；证据快照的加密存储与去重；覆盖登记的写入；逐入口接入；删项目、清除插件用户数据时一起删 | 公开读取动作（按工作、对象、时间、版本，`seq` 做增量游标）、用途开关与跨项目权限、保留期与手动清理、占用与提醒线、设置「工作记录」四个页签、读取时核对对象主人能否解析 | 主线（36）、智能呈现（53、64）、观察试用（64）按 design §5 接入；评测样本留存（30、63，用升级段加「留存」表） |

本批的验证读库用包自己导出的查询函数（在宿主进程内、测试里），不对外开读取动作，免得在 29 定权限与用途之前多出一个没人审过的读取面。

## 2 包、库与归属

- **包**：`horizontal/observation`，包名 `@molis-ai/molis-work-service-observation`，依赖 contracts、plugin-sdk、storage；宿主只装配（用户 2026-11-01 定，design §9 D2）。错误码主人 `observation`，在 `tooling/gates/error-owners.json` 加一条。
- **合同**：`packages/contracts/src/services/observation.ts`，子路径 `@molis-ai/molis-work-contracts/services/observation`，合同 id `io.molis.work.service.observation.v1`，`maturity: "partial"`（读取在 29）。系统提供方 `system.observation`。
- **库**：Home 级独立库 `<Home>/observation/observation.db`，在 `apps/local-host/src/home-stores.ts` 登记（主人 `horizontal/observation`），进 `platform-upgrade-stores.ts` 的平台库登记（不能用时的说明页先指到「诊断」，29 的「工作记录」页签出来后改指它）。版本从 1 开始（`tooling/versions.json` 的 `database.observation_baseline`），结构快照进 `tooling/gates/schemas/stores.tsv`。表只由本包读写。
- **Home 快照与清除**：普通快照（随 Home 备份与恢复，证据是密文，见 §6）；`uninstall --purge-user-data` 随登记一起删，证据的密钥随 Home 的密钥库一起删。
- **SSOT 与包清单**：`docs/SSOT-MATRIX.md` 横向服务表加一行；`scripts/workspace-packages.mjs` 登记一行，成熟度 `slice`；`docs/system/PACKAGE-BOUNDARIES.md` 现行包清单与 `docs/horizontal/observation.md` 手册随包加。

## 3 一条记录

**粗体**是写入方给的；其余由采集层从可信上下文取或自己盖，写入方给了也不认。

| 字段 | 内容 | 来源 |
| --- | --- | --- |
| `record_id`、`seq` | 采集层给的编号；`seq` 是落盘顺序，29 的增量读取拿它做游标 | 采集层 |
| `owner` | `{ kind: "plugin", id: <plugin_id> }`、`{ kind: "service", id }` 或 `{ kind: "shell" }` | §4 |
| **`fact`** | `<前缀>.<名字>`，小写点连接。插件的前缀就是它的 `plugin_id`（如 `workflows.step`）；平台的前缀在合同 `OBSERVATION_SERVICE_PREFIXES` 列明（出口 `action`、外壳 `ui`、`agent`、`assistant`、`search` …） | 写入方；不是自己前缀的整条拒收 |
| `provider_id` | 动作调用记录：被调动作的提供方（清除插件用户数据时据此删，§6） | 出口 |
| `actor` | `{ actor_id, actor_kind, audience, delegated_by }` | 调用上下文 |
| `entry` | `workbench`、`cli`、`mcp`、`agent`、`workflow`、`plugin`、`schedule`、`background`、`desktop`、`assistant`、`host` | 调用上下文：本人的调用只经本机网页传输或管理命令进来，所以 `user` 受众是 `workbench`，`user_action.source = "management"` 是 `cli`；其余按受众；后台来源由装配给定；推不出是 `host` |
| `project_id`、`install_id` | 在哪个项目、哪个安装 | 调用上下文 |
| **`subjects`** | `{ kind, id, version? }[]`，至多 16 个 | 写入方；本批不核主人能否解析（design §2 写了要核，挪到 29 读取时核，见 §13 偏离） |
| **`occurred_at`** | 真实发生时间；缺省为收到时间；晚于收到时间按收到时间记并标 `clock_adjusted` | 写入方 |
| `received_at` | 收到时间 | 采集层 |
| `work` | `call_id`（同一次操作共用）、`invocation_id`（每次动作调用一个）、`parent_invocation_id`（发起这次调用的那次）、`runtime_session_id`；**`run_id`、`work_ref`** 由写入方给，不知道就不填，记录即「未关联」 | 前四项来自调用上下文与 kernel 的调用范围 |
| **`stage`**、**`outcome`** | 阶段；结果九种：`succeeded`、`failed`、`refused`、`cancelled`、`waiting`、`no_action`、`no_response`、`taken_over`、`unknown` | 写入方 |
| `source_class` | §5 的八类 | §5 |
| **`conditions`** | 插件、提示词、Skill、模型的版本引用；`platform_version` 采集层盖 | 写入方给引用 |
| **`detail`** | 这种事实自己的标量：至多 32 个键，字符串至多 512 字；放错误码、耗时、计数，不放正文 | 写入方 |
| **`evidence`** | `{ role, ref }[]`，至多 16 条，§6 | 写入方给内容或引用 |
| `coalesced` | 合并的条数与最后时间（只用于 §7 声明过的读取） | 采集层 |

正文都走 `evidence`：好按内容去重、加密、随保留期删、受用途开关管；记录本身保持小而可数（OCL-10）。

## 4 三条写入路

**出口：动作调用。** kernel 的结算改成收一组 `CallReports { settled?, observed? }`：`settled` 仍是诊断记录用的，照旧不见输入和结果；`observed` 是采集出口，同一处结算时拿到开始与结束时间、处理器是否已开始、原始输入与结果、`invocation_id` 与父调用。`ActionService.invoke/invokeSync` 和宿主里直接拒绝调用的 `refuseCall`（`local-host.ts`、`project-host.ts` 共七处）用的是同一组，所以被拒的也一条不漏。出口自己出错不影响调用，算进 §8 的「丢失」。页面查找自己没有的区域时预期中的拒绝（`refusalExpected`）不是用户行为，出口不记（与诊断记录同一口径）。

**端口：平台服务。** contracts 的 `ObservationSink` 只有 `bind(origin)`：服务在一件事开始时（一轮运行开始、一次唤醒、一次检索）用当时的调用上下文绑定一次，得到的记录器之后随时 `record(fact)`，不依赖回调发生时异步上下文还在不在（Prologue 的事件在发起它的动作结束后才到，那时调用范围已关）。没有调用上下文的事（定时触发）用 `ObservationBackgroundOrigin` 绑定，写明 actor 与入口。宿主装配时给每个服务一个只认它前缀的 sink；没装配的服务什么也不记。记录同步入队、不抛、不等、不读库。

**上报：`observation.report@1`。** 一个动作，两种调用方：

- **插件**（受众 `plugin`）：`owner` 取宿主签发的 `host_plugin.plugin_id`（`calling_plugin_id` 只在 Plugin Runtime 交给插件处理器时才有，system 提供方拿不到）；只收以自己 `plugin_id` 开头的事实。插件要在 Manifest `capabilities.consumes` 声明它，内置与第三方同一条路。
- **外壳**（受众 `user`）：只经宿主的「界面阶段」路由进来。路由每次请求签发一个冻结的入口凭据（照 `S-page-entry-actions` 的 `webEntryDoor` 写法），处理器只服务本人、没有 `host_plugin` 与 `delegated_by`、带着这次签发的凭据的调用；`owner = shell`，只收 `ui.*`。别的路由、插件页面（含插件页面拿自己的凭据调这条路由）、手写的 `user` 调用一律拒（新不变量 `S-observation-records` 配拒绝测试）。
- **处理器按受众分两条**：`webEntryDoor.define` 写死了 `audiences: ["user"]` 与 `scheduling: "concurrent"`，一个动作服务两种调用方用不了它。所以动作自己定义（`audiences: ["user","plugin"]`，不声明 `concurrent`：只入内存队列、不等外部），门只用来签发和核对：给门加一个只读的 `entryOf(caller)`，`user` 这一条照门的规则检查（与 `define` 用同一个函数），`plugin` 这一条查 `host_plugin`。

限额（数字都在合同的 `OBSERVATION_LIMITS`）：

- **单次**：至多 100 条、内容合计至多 1 MiB，超出整次拒收（`observation.report_too_large`）。
- **每分钟**：声明 `execution.max_calls_per_minute: 60`（按 actor＋项目＋安装计，平台已有）。这一层在处理器之前就拒（`actions.rate_limited`），看不到输入，所以只按次数记，不按条数。
- **每天**：每个上报方各算各的（每个插件安装一份，外壳单独一份，不共用）；一个 UTC 日至多收 20,000 条、64 MiB 内容，所有项目合计；计数存在库里（`report_quota`），重启不清零。到了任一项，当日余下的上报整次拒收（`observation.report_quota_exceeded`）。所以一个第三方插件一天最多写进约 64 MiB 正文（压缩加密前），写不满磁盘。
- **超限怎样记**：拒收的次数与条数只按上报方记一段覆盖缺口（`lost`，原因键 `report_quota`），覆盖登记里这一行的 `fact` 固定写 `observation.report`，不按插件给的事实名展开，所以覆盖登记的行数也刷不大。

受众不给 `agent`、`mcp`、`workflow`：它们做的事由出口与服务在发生处记，不能自报。

`observation.report@1` 自己的结算不进出口（否则每次上报又生一条），覆盖登记写「不适用：上报通道本身」。

## 5 来源类别

`real`、`first_read`、`catch_up`、`imported`、`trial`、`replay`、`demo`、`system_check`。按顺序定，前面的赢：

1. 项目 `data_class = "regenerable_demo"` → `demo`（装配时从目录取并缓存，不信写入方）。
2. **来源范围** `withObservationSource(kind, run)`：放在 observation 包里（不进 kernel、不进 `ActionCallContext`），只有宿主入口包得住自己的工作：Onboarding 采用（`first_read` 或 `imported`）、连接器首次同步与重连补读（`first_read`、`catch_up`）、平台自检（`system_check`）、评测回放（`replay`，30 批起）。照 `CallScope.open` 的写法，`run` 结束即关：范围里起的定时器、订阅、轮询在范围结束后再发生的事不带这一类；内层范围覆盖外层。出口在调用方自己的异步上下文里同步收到报告，所以宿主的出口能直接读到当前范围。沙箱插件进程外的回调拿不到范围，覆盖登记对「沙箱插件的首次同步」写「暂不可用」。
3. 写入方给的类别：只有插件和服务能说，只认 `first_read`、`catch_up`、`imported`；外壳一律 `real`。
4. 其余 `real`。

`trial` 的入口在 64 批，本批只在合同里留这一类。

## 6 证据与快照（D1 的落地）

`evidence[].ref` 三种：`owner`（主人自己的固定版本，只放引用）、`snapshot`（主人留不住的内容，采集层存）、`missing`。缺失原因各管一件事，分得开（OCL-09）：

| 原因 | 谁写 | 什么时候 |
| --- | --- | --- |
| `not_obtained` | 写入方或采集层 | 拿不到（密钥取不到、主人没给） |
| `truncated` | 写入方或采集层 | 太大，只留摘要与长度 |
| `redacted` | 写入方 | 内容是密钥一类，整份不留 |
| `forbidden` | 写入方 | 调用方无权看到 |
| `by_rule` | 写入方或采集层 | 规则就不存：处理器开始前的拒绝、本人页面读取的结果 |
| `expired` | 采集层（29 的保留期清理） | 到期删掉 |
| `purged` | 采集层 | 用户清除某个插件的数据时一起去掉 |

写入方只能给前五种（合同 `OBSERVATION_WRITER_MISSING_REASONS`），后两种只由采集层写。

- **加密存放**：快照正文先脱敏（与 SDK 的 `redactSecrets` 同一份规则；替换过的，快照上标 `redacted: true`——这是快照自己的标记，不是缺失原因 `redacted`），再 gzip，再用平台已有的本机正文保护（`createLocalPayloadProtection`，AES-GCM，密钥引用 `system:observation:evidence:v1` 存在 Home 的密钥库）加密后入库。这样主人那边是密文的内容（如 Feed 的证据正文）在采集层也不会是明文；密钥取不到时这批证据记 `missing: not_obtained` 并在覆盖登记计一段「暂不可用」，记录本身照写。
- **去重**：摘要用带密钥的 HMAC-SHA256（密钥引用 `system:observation:digest:v1`，与证据密钥放在同一个密钥库），按它存一份；`record_evidence(seq, digest)` 记引用。拿到库的人不能用猜出的短内容去验证（反推 Feed 正文、页面输入）。
- **上限**：一份快照至多 4 MiB；超出只记摘要与长度（`missing: truncated`），覆盖登记该事实下计一次截断。
- **调用路径上只做一次拷贝**：出口与端口只把内容序列化成字符串入队；脱敏、摘要、压缩、加密都在落盘的那一批里做。

**D1 的三个追问：**

1. **共用快照什么时候删**：快照没有自己的保留期，只跟引用走。29 的清理删掉记录后，在同一个事务里删掉不再被任何记录引用的快照；共用不延长某条记录的保留期。
2. **评测样本**：本批不建留存表。30／63 批用升级段加「留存」：留住的是记录本身（连同它引用的快照），清理只删没被留存的；到期前提示用户的流程归 29／30。
3. **删项目、清除插件数据、备份**：
   - **删项目**：采集层登记一个 `ProjectDeletedOwner`（`id: "observation"`），在目录提交之后由删除流程逐个 `clear(projectId)`，可重试、幂等：先丢掉队列里这个项目还没落盘的记录，再删库里这个项目的记录与覆盖行，回收无人引用的快照；`clear` 之后对这个项目 id 的写入一律丢弃，直到目录里再有同 id 的项目（演示项目重建）。`survivesRebuild` 为 `false`：演示项目重建时它的旧记录（都是 `demo`）一起清掉。
   - **清除插件用户数据**（卸载时选了清除）：删掉 `owner` 是它的记录；去掉两类动作调用记录的证据——`provider_id` 是它的（别人调它），和调用方是它的（`install_id` 是它的安装，它调别的动作时发出的输入与拿到的结果）。记录行保留谁在什么时候调了什么、结果怎样，证据改成 `missing: purged`，覆盖登记计一段 `purged`；再回收无人引用的快照。不选清除时照旧保留。
   - **备份与恢复**：随 Home 普通快照，证据是密文；导出归 29 的用途开关（默认关）。

## 7 动作调用记什么（出口一行）

| 情况 | 记录 | 证据 |
| --- | --- | --- |
| 处理器开始前被拒 | `action.call`，`outcome: refused`，`detail.code` | 无：只有谁、什么动作、结果与错误码（S-12、S-18 的最小诊断；`missing: by_rule`） |
| 处理器开始后以任何方式失败（报错、取消、撤权、停用、超时、被替换） | `outcome` 按错误类别：`cancelled` 类与 signal 已中止的为 `cancelled`，其余 `failed`；`detail.code`、`detail.duration_ms` | **无**：处理器开始后的失败一律不存输入与结果，也不存错误信息（中途撤权常以 `actions.forbidden`、`unauthenticated` 等抛出，按码列举会漏，所以不分码，一律不存；S-18） |
| 成功的命令 | `outcome: succeeded`，`detail.duration_ms` | 输入与结果快照 |
| 成功的读取，调用方是 agent、mcp、workflow、plugin | 同上 | 输入与结果快照（这是模型或流程实际拿到的材料，OCL-05） |
| 成功的读取，调用方是本人的页面 | 同上 | 输入快照；结果按规则不存，只记摘要与长度（`missing: by_rule`），覆盖登记计入「按规则不记」并声明「页面读取只留结果摘要」 |
| 成功的读取的合并 | 同一 call_id、同一 runtime_session_id、同一 actor、同一动作、同一输入与结果摘要，一分钟内重复的合成一条（`coalesced`） | 覆盖登记声明「成功读取按一分钟合并相同的读：答不了一分钟内每次读取的精确时刻」（OCL-10） |
| 预期中的拒绝（`refusalExpected`）、`observation.*` 自己的调用 | 不记 | — |

嵌套的同步调用若在外层事务里、外层随后回滚，它自己的记录仍是 `succeeded`；`parent_invocation_id` 连着外层那次失败的调用，读的人据此判断，本批不另加标记（§13）。

## 8 覆盖登记

- 表 `coverage` 以 `(owner, fact, entry, project_id)` 为一行，记现在的状态、从何时起、起始的平台版本、截断／脱敏／按规则不记的计数；`coverage_gaps` 记时间段（状态、起止、条数、原因键）。十种状态：`complete`、`not_connected`、`unavailable`、`lost`、`truncated`、`redacted`、`expired`、`purged`、`not_applicable`、`by_rule`。
- **接入清单**：observation 包里的 `OBSERVATION_COVERAGE_PLAN` 列出这一版每个入口、事实、主人与状态（没接上的写 `not_connected` 与原因键）；29 的页签照它显示，测试核它与真实装配一致。
- **写失败**：批量落盘失败（磁盘满、库坏）时，那一批按行键计数，记一段 `lost`；登记本身也写不进去时留在内存，下次写成功时补上；进程没来得及写进去就退出的，下次启动记一段「原因未知的丢失」，从上次最后落盘时间到这次启动。业务调用照常完成，不因记录失败报错（OCL-15，EC-10）。
- 原因存文字键，不存译好的句子。

## 9 调用次数、落盘与性能

- 队列每 250 毫秒或满 200 条在一个事务里落盘（WAL，`synchronous = NORMAL`）；同一批里相同摘要的快照只处理一次。关库与宿主停止时先刷完。
- 出口、端口、上报都不读库；合并读取用内存里最近一分钟的键，不查库。
- 外壳上报最多每 2 秒一次，页面隐藏时立刻发一次，不轮询。
- 整个 Home 一个连接，宿主装配时打开、停止时关。
- 预算数字等本批接完、照 eval-cases §4 回放一周后实测再定；本批先量 EC-01、02、06、09 每轮多写多少字节、多花多少毫秒，写进盘点 §7。

## 10 合同改动清单

- `packages/contracts/src/services/observation.ts`（新子路径）：记录与输入类型、来源类别、结果、覆盖状态、`ObservationSink`、`observation.report@1`、服务前缀；`tooling/gates/api/` 新快照。`ActionCallContext` 不改。
- `packages/kernel`：`CallReports`、`CallObserved`、`CallObservation`；`settleCall`、`settleCallSync`、`refuseCall` 收 `CallReports`；调用范围（`invocation_id` 与父调用）。kernel 公开导出变了，按共享核心跑全量（本批 CI 全量）。
- 宿主：`LocalHostOptions.actionObserved`。
- 动作合同快照：`tooling/gates/actions/host-actions.tsv` 多 `observation.report@1` 一行。
- 外壳上报经宿主路由，不新增跨模块 DOM 事件；外壳内部若要听已登记的定位事件，照登记表用。

## 11 开工前检查

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 采集层只拥有观察记录、关联、来源类别、覆盖与证据快照；业务事实与版本留在原主人，记录里放引用。SSOT 加一行 |
| 2 | 插件同等待遇 | 插件只经 `observation.report@1` 报事实，内置与第三方同一条路、同一个前缀规则与限额，都在 Manifest 声明消费；沙箱插件拿不到来源范围的差别写进覆盖登记 |
| 3 | 能力注册 | 上报注册一次成系统动作；出口与端口是平台内部装配，不是第二条能力路；身份全从调用上下文与装配来；不等模型，不 `concurrent` |
| 4 | 合同 | 改：新子路径、kernel 的结算报告与调用范围、宿主选项、动作快照一行。M1 之前不留兼容期；没有别的批在等，随本批 PR（轨道规则 1） |
| 5 | 放在哪个包 | 新包 `horizontal/observation`，宿主只装配 |
| 6 | 表与存储 | 独立 Home 库，登记进 Home 库与平台升级登记，版本 1，结构快照入库；表只由本包读写 |
| 7 | 兼容与迁移 | 不加。现有调用诊断与各主人的记录照旧，不迁入、不回填（接入以前的历史在覆盖登记写「取不到」） |
| 8 | 安全边界 | 碰动作网关的结算。守 S-12、S-18：被拒只留最小诊断，处理器开始后失败的一律不存内容；身份不读输入；外壳只经签发的入口凭据、插件只写自己前缀、agent／mcp／workflow 不能自报；证据加密存放、兜底脱敏；上报限额。新增 `docs/system/security-invariants/S-observation-records.md` 并配拒绝测试：被拒调用的记录里找不到埋入的输入；处理器中途撤权后的记录里找不到输入；插件冒用别人前缀被拒；没有入口凭据的 `user` 上报被拒；agent／mcp 自报被拒；库里查不到明文证据 |
| 9 | 调用次数 | 写入入队、批量落盘、一个连接；出口与端口不读库；外壳每 2 秒至多一次上报；不轮询 |
| 10 | 升级与数据 | 新库从版本 1；结构变化走升级链；金样随 Home 金样生成 |
| 11 | 成果与过程项 | 记录与快照不进成果库，也不是过程项 |
| 12 | 页面、外壳与文字 | 本批无新界面；外壳上报不改页面；覆盖原因存键，不存译文 |
| 13 | 错误 | `defineErrorCodes("observation", …)`，不写 Error 子类 |
| 14 | 冲突面 | kernel（共享核心）、宿主装配（`local-host.ts`、`project-host.ts`、`home-stores.ts`、`platform-upgrade-stores.ts`、`project-deleted-owners.ts`）是枢纽；与 #2047（31 批，改 agent-host）在 agent-host 适配器上会交叠，收尾同步 main 时一次解 |
| 15 | 全局最优 | 见下 |

**第 15 项五个场景。** 插件：业务动作已被出口记下，大多数插件什么都不用写；要报自己的过程只多一次动作调用，第三方与内置同一路。平台：出口挂在唯一的结算处，页面、助理、工作流、定时、MCP、命令行经网关的调用一处接上；服务只在没有动作的那几处（运行事件、唤醒、检索）用端口。助理：助理与 Agent 的工具调用就是动作调用，出口自动记；运行事件由 agent-host 在一轮开始时绑定的端口记；助理不能自报。各类平台能力：评测（30、63）、主动助理（64）、报告读同一份记录，读取在 29 一次定权限；主线（36）与智能呈现（53、64）新入口用端口或插件身份接入，不另建。后续开发：再加一种事实只是一个新名字与接入清单一行；记录结构不随事实种类变。

**比较过的做法。** 出口：扩展 `CallSettled` 带上输入与结果——它是诊断用的，混在一起诊断记录容易被改坏，没选；包装每个提供方的处理器——漏掉处理器之前的拒绝，没选；与 `settled` 并列、同一组 `CallReports`——选它。来源类别：进 `ActionCallContext`——调用方能带的字段要处处防伪，且会被嵌套调用带进不相干的工作，没选；放 kernel 的范围——kernel 只需要知道调用自己，来源是采集层的事，没选；放 observation 包的范围——选它。外壳身份：通用动作路由加受众判断——本人页面和拿着会话的脚本分不开，没选；宿主路由直接写 sink——绕过动作目录，上报不再是一份能力，没选；路由签发入口凭据——平台已有写法，选它。

## 12 合审要点

第 1 版合审的三问已答：`observed` 放 kernel 公开导出合适；`ObservationSink` 作为服务端口的可选项不算膨胀；上报受众只给 `user`、`plugin`，对 36、53、64 够用，前提是这些入口用端口或插件身份接入。本版请复核 §4 外壳入口凭据、§6 加密与清除、§7 失败一律不存内容三处。

## 13 决策记录与偏离

| 日期 | 决定 | 依据与没选的 |
| --- | --- | --- |
| 2026-11-13 | 包名 `horizontal/observation`，提供方 `system.observation`，错误码主人 `observation`；用户看到的名字仍是「工作记录」 | 与需求名「观测和采集层」一致；错误码主人名不许连字符 |
| 2026-11-13 | 读取动作不在本批开，本批用包内查询函数验证 | 读取面的权限与用途在 29 一次定 |
| 2026-11-13 | **偏离 design §2**：「对什么」一栏原写「采集层核对主人能否解析」，本批不核，挪到 29 读取时核（解析不了的显示成「对象已不在或读不到」） | 写入时逐条找主人解析，一次界面操作要多发好几个读取请求（N42～N56），而且对象之后还会删改，写入时核过也不代表读取时还在 |
| 2026-11-13 | 嵌套同步调用随外层回滚不另加标记，靠 `parent_invocation_id` 判断 | 加标记要在事务提交处回写已入队的记录，多一层耦合；读的人顺着父调用就能看到外层失败 |
| 2026-11-13 | 模型实际收到的完整请求：先按 D4 方案 A 从运行事件取（事件流里有 system 与 user 的 prompt、工具入参与结果、reasoning、memory-context、用量与停止），缺的是运行底座组装好的完整请求，在覆盖登记写「暂不可用：运行底座不提供组装后的请求」 | 第 24 批盘点没有核这一项。要不要请上游开读取口是红线，攒到本批中途一起问用户 |
| 2026-11-13 | **用户定：改上游。** Prologue 加 `CreateRuntimeInput.onModelRequest`（[molis-prologue#119](https://github.com/molis-ai/molis-prologue/pull/119)，合并 `c764d970`）：一轮循环的每次请求在结局定下时交一次，交的是给 Host 的原字节（附件仍是占位）、这一跑、会话、调用号、目标与结局，地址只给协议、主机与路径。agent-host 记成 `agent.model_request`，覆盖登记改为「完整」；压缩摘要的请求运行时不交，写「按规则」（`runtime_reports_loop_turns_only`）。本批随之换上上游 main 的官方构建（`vendor/prologue-sdk/`，同时带进 #116、#117，两者都不改 Molis 用到的默认行为） | 方案 A（宿主在 Host 端口上按调用号拼）要靠事件反推是哪一跑，压缩与单次调用也走同一端口，拼不准；在本地重组的请求与实际发出的不一定一致。上游交的是运行时自己交给 Host 的那一份 |
| 2026-11-13 | **评审 B1（PR #2059）：子代理的一轮。** 子运行由 Prologue 在父运行里起，App 收不到它自己的事件流，只有父运行的 `subagent-started`／`subagent-ended` 与每次请求的 `onModelRequest`。记法：父一轮记 `agent.subagent`（开始、结束与结局，带子运行与子会话）；子运行的每次模型请求按运行库里派出登记的上下级（`runLineage`，子运行在第一次请求前就已登记）交给最近一个被跟着的上级一轮的记录器，记成子运行自己的 `agent.model_request`（`work.run_id` 是子运行、主体是子会话、`parent_run_id` 是派它的那一跑）；子运行自己的回复、工具与用量不记，覆盖登记写「暂不可用」（`agent.subagent.events`，`child_stream_not_followed`）；它调用的动作仍是出口的记录 | 方案 (b) 只把子代理标成暂不可用，而请求本身拿得到，丢掉它第 30 批的评测就少了子代理实际收到的内容；方案 (a) 全做要上游给子运行的事件订阅，本批不改上游第二次 |
| 2026-11-13 | **评审 B2（PR #2059）：`ActionMetadata.draft`。** 这一项随 `batch/28-services` 进来，合同稿第 3 版原来没有，这里补记：动作可以声明输入是本人还没发出的草稿；出口只在调用方是本人（`user` 受众）时按规则不记它的输入与结果，别的受众经同一动作写入的照常留内容，拒绝用例 S-observation-records 7。三个声明它的动作：`assistant.panel.works.draft@1`、`assistant.panel.works.question_draft@1`、`onboarding.context.draft@1`（受众都只有 `user`） | 原写法只看声明，沙箱或第三方插件声明了就能让 Agent、MCP、工作流对它的调用都不留内容，与 OCL-05 冲突；在声明时拒掉「draft + 非 user 受众」也行，但出口一处判断就够，且不改 Manifest 校验 |
| 2026-11-13 | **用户定：每次唤醒自成一次操作。** 项目时钟每次唤醒用自己的调用号（`eachWakeup`），它起的动作、运行与 `scheduler.wakeup` 记录都在这一号下；同一轮到期的两个任务是两次操作，不再并成这一轮的号。旧用例 SYS-15-A1/S4 原断言唤醒起的那一轮沿用这一轮的号，改为断言它有自己的号、与这一轮的不同、两次唤醒彼此不同（`tests/schedule-task-runner.test.ts`） | 沿用这一轮的号时，生产里每轮本来就新起一个合成的号，同轮的几个任务会在工作记录里并成一次操作，按操作回看、评测都会把无关的任务连在一起 |

## 14 第 1 版合审退回的改法

| # | 退回的点 | 本版怎么改 |
| --- | --- | --- |
| 1 | 七处直接 `refuseCall` 漏记 | §4：`settleCall`、`refuseCall` 收同一组 `CallReports` |
| 2 | 按错误码判断取消会漏，中途撤权的会存下输入 | §7：处理器开始后的失败一律不存内容 |
| 3 | 不变量引错（S-35 是放置移回） | §7、§11 改引 S-12、S-18；新增 `S-observation-records` |
| 4 | 外壳可被冒充；插件身份取错字段 | §4：外壳只经签发入口凭据的宿主路由；插件身份取 `host_plugin.plugin_id` |
| 5 | 证据明文落盘；清除插件数据后证据还在 | §6：证据加密存放；清除时去掉其动作调用记录的证据 |
| 6 | 上报可写满磁盘 | §4：单次 100 条、1 MiB，每分钟 60 次，每个上报方每天 20,000 条、64 MiB，超限按上报方记一段缺口 |
| 7 | 来源范围漏进后续定时器 | §5：结束即关、内层覆盖外层；范围移到 observation 包 |
| 8 | 端口在 Prologue 回调里拿不到身份 | §4：`ObservationSink.bind(origin)`，一件事开始时绑定 |
| 9 | 读取合并会把两项工作并成一条、没声明代价 | §7：键加 `call_id`、`runtime_session_id`，覆盖登记写明答不了什么 |
| 10 | 删项目写法和代码不符 | §6：走 `ProjectDeletedOwner`，先丢队列再拒写，`survivesRebuild: false` |
| 11 | 覆盖登记缺入口与版本 | §8：键加 `entry`，行上记起始平台版本 |

## 15 第 2 版复核的改法

| # | 复核的点 | 本版怎么改 |
| --- | --- | --- |
| 1 | 每次 1 MiB、每分钟 60 次仍能一天写进约 86 GB；插件自起事实名能刷大覆盖登记 | §4：加每个上报方每天 20,000 条、64 MiB 的总量上限（库里计数，重启不清零），超限当日整次拒收；缺口只按上报方记一行（`fact = observation.report`），数字进合同 `OBSERVATION_LIMITS` |
| 2 | 缺失原因借错词：页面读取记成 `truncated`，清除插件数据记成 `expired` | §6 列出七种原因各管什么；页面读取改 `by_rule`，清除改新原因 `purged`（覆盖登记加同名状态，共十种）；写入方只能给前五种（`OBSERVATION_WRITER_MISSING_REASONS`） |
| 建议 | 去重摘要可被猜测验证 | §6：改 HMAC-SHA256，密钥与证据密钥同库 |
| 建议 | `webEntryDoor.define` 写死受众与 `concurrent` | §4：动作自己定义、不声明 `concurrent`，门加只读 `entryOf` 给 `user` 一条核对；拒绝测试加「插件页面拿自己的凭据调外壳路由」 |
| 建议 | 插件作为调用方发出的调用记录也带它的数据 | §6：清除时一起去掉 `install_id` 是它的调用记录的证据 |
| 建议 | 限流在处理器前，看不到条数 | §4：每分钟一层只按次数记 |
| 第 3 版复核 | 快照的 `redacted` 标记与缺失原因同名易混；外壳会不会和插件共用每天的额度 | §6 写明是快照标记；§4 写明外壳单独一份额度。20,000 条够不够，接完回放实测后再定（§9） |
