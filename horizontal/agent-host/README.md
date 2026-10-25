# Agent Host

## 同一 Run 按需展开（实施中，未验证）

依 [Memory spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定)，Adapter 将 SDK 现有 `started.memory.expand` 交现 `RunRecord` 持有。启动前的一次性可取消等待解决首工具早于 start 返回的时序，绑定成功才释放，启动失败拒绝；不新增 registry、不按 Session 最新 Run 找 control，历史恢复不补造控制。每次展开复用原 attempt authority 与当前派发检查，无正文回执保留 ref/version、预算和 queued/omitted 事实，正文只走下一实际模型请求的 Context。工具与现 Action client 传递同一可信窄口。

可配与可换：沿现 Runtime Adapter 装配和原 Run 预算；身份、授权、同 Run 预算/去重、取消/终态不能关闭。不新增 SDK API 或配置。源码按此合同接入，尚未运行验证。

专项验证：`node scripts/run-tests.mjs tests/memory-run-expansion.test.ts`。新增场景使用正式 SDK 的公开 Node Adapter、隔离存储和本机 HTTP：两个活跃 Run 交错读取时各自保留 scope、attempt authority、去重与预算，正文只进所属 Run 的后续请求；在真实 Host `storage.commit` 的本 Session `afterStart` 索引写入处设置异步屏障，验证首工具早于 App start 返回、正常释放、持久失败取消原工具信号及读取信号取消。屏障只延迟/拒绝该次提交，其余提交原样执行，不替换 SDK start/drive；原 fake Runtime 用例只证明 Adapter 窄口。SDK #96 既有 `memory-run-expand.live.test.ts` 已有预算、去重、撤权、版本、compaction 与 queued 取消场景，本片不复制其全矩阵。这些新增 App 场景目前只准备源码，正式依赖安装及运行结果待集成验证。

## Memory 有界管理查询

`AgentMemoryCapability.page` 只将当前 caller/ExecutionControl 下的 scope、owner、分类/状态/来源/期限过滤与 cursor 交 SDK `memory.page`，不先 hydrate/list。返回 canonical 条目、停止原因、exact/unknown 计数及真实/隐藏成本；snake_case 只作字段转换。查询范围许可与条目最终复核由 SDK 和现 App authority 承担，缺管理许可不查库，普通 task/explicit 许可不能冒充管理查询权。该页不写记忆、不增加索引。对应公开 Node 回归：`tests/memory-management-pages.test.ts`、`tests/memory-management-page-authority.test.ts`。


## Memory 维护命令边界

依 spec §9.4，Memory Capability 的 `previewMutation` 只将带原版本与原操作号的 update/pause/disable/resume/remove 真实命令交同一 SDK management.preview，不写条目，不替代执行时的当前授权。`tombstone` 委托 SDK 逻辑 remove，返回实际条目版本与原操作重放结果；现 `remove` 仍委托物理 purge。两口沿原 caller/ExecutionControl，不增加第二写主人、查询授权或恢复账。App 的维护补账只接受实际 SDK 提交确认；缺失、同文或版本加一不能作为成功证明。验证使用公开 Adapter 与真实隔离 Node 存储，覆盖取消/撤权、原操作重放和后继版本冲突。

已知目标的 `remove` / `candidates.purge` 将现有 ID、scope/owner、原版本和操作号直接交 SDK 的删除专用 identity locator，不先 hydrate/get。原 Session 永久结束不会为此获得正文读取许可；普通读取、逻辑删除和候选接受保持原边界。存在目标时，当前授权、取消、版本冲突和未决候选决定仍由同一 SDK/Host 拒绝，不扩大删除集合。冷启动时，给定 scope/owner 下不存在目标沿 SDK 既有幂等合同返回 void、零写入，不证明原删除曾成功；已缓存的同 ID 与给定身份冲突则拒绝。对应 §M4 与 `tests/prologue-memory-delete-locator.test.ts`：分别覆盖冷启动错身份的真实目标保留、已知身份冲突和存在目标的最终授权门。已在正式 SDK #99 上通过公开 Adapter 与真实隔离 Node 存储的定向工程验证；同进程关闭重开只证明持久语义，不冒充 OS 进程重启、完整 App 实操或真实 Home 验收。

Agent Runtime 的注册、能力矩阵、启动授权，以及宿主拥有的副作用 Review 队列。

Node 适配器类型与运行时都要求明确的绝对 `storageRoot`；缺失、空值、相对路径以 `agent.storage_root_invalid` 在 SDK 与磁盘初始化前拒绝，不回退到 cwd 或用户默认目录。适配器通过 storage 的同一 SQLite 独占端口取得所有权，或借用本 Home Host 已持有的 opaque owner；没有另一套锁、同 PID 放行或可复制的 proof。获取或第二借用失败报告 `agent.storage_busy`，不读取恢复记录。只有实际 SDK 关闭成功才归还借用；失败关闭保留所有权，下一次明确 close 可以重试。初始化失败先清理已创建的 Runtime 资源再归还自己的部分，父 Host 继续持锁。跨进程入口转发给常驻 Host，不能用多个 Runtime 直接共享目录。回归：`tests/security-invariants-home-storage-sdk.test.ts`、`tests/security-invariants-home-storage-host.test.ts`。

`createPrologueNodeAdapter(options)` 返回可等待的初始化句柄，`await` 仍取得原 adapter；从创建时保留该句柄，其 `close()` 即使初始化拒绝也可继续清理。初始化失败后的清理再次失败会继续占锁，显式重试只处理未完成项，全部成功才归还 borrow/独立 owner。成功 adapter 的 `close()` 复用同一入口；同次并发共享结果，失败后可以明确重试。Local Host composition 在初始化前保存句柄，dispose 总能关闭它；失败后的显式 ready 先完成旧实例清理，再创建新实例，关闭中的实例不登记为可用。回归：`tests/security-invariants-agent-initialization-cleanup.test.ts`。

离线记忆采用的 `openPrologueMemoryAdoption` 使用同一存储 owner 锁，只向显式范围开放 SDK 的 `adoptStorage`、整 App `verifyAdoption` 及固定目标清理，不装 Agent、模型或普通记忆写入口。维护配方保留 App taxonomy、版本与限额，但只装采用、读取及明确清理的维护配方；不要求安装普通 Runtime 的提炼、召回或晋升实例，也不把维护配方写回正常配置。调用方必须先停所有 owner 并备份，在关闭维护句柄后重新打开正常 Runtime；关闭等待在途页结束，SDK 关闭失败不释放写锁。旧 metadata 无法证明自然场景时保持未分类，不从 kind/namespace 猜测；原引用、版本、期限、来源与已完成候选关联由 SDK 保持。页中的 issues、未决决定、未知归属、取消与未知提交均不是完成；LocalHost 累计整次结果后才提交 ledger4。维护入口不改变正常 Runtime 的授权。真实隔离 Node 回归：`tests/prologue-memory-adoption.test.ts`；SQLite 编排故障回归：`tests/memory-adoption-maintenance.test.ts`。

包名：`@molis-ai/molis-work-service-agent-host`。工作区内部包，由 Host 装配使用。

## 项目清理的可信固定集合（内部 Port，定向工程验证通过）

现 Node Adapter 的内部 `projectDeletion.withHold` 由 Catalog 删除主人调用，不是插件 Action，也不接受 HTTP 提交的 plan。入口同步封项目的新创建/开始及指定个人业务 Session 的开始；普通启动还检查 App 提供的同步 `projectDeletionPending(projectId, sessionId?)`，重启后沿原收据保持关停。Memory 形成的关停及最终授权由 Memory 主人承担。活跃、prepared 或未知工作拒绝，不自动取消。pending/held 也封现 resume、steer、queue.add；暂停、取消、停止和撤回继续由原控制口收尾。异步输入接收在实际 Host 写前再次同步检查同一门。若 steer 的最终进度提交被拒绝，沿 SDK 原 `SESSION_LEDGER_COMMIT_FAILED`/未知恢复合同保留已提交历史，不把 cancel 当作已结束或允许清理。子派出门只拦新 child Run，不影响已接纳父 Run 正常完成；SDK 在 admit 前 fork/giveStep 留下的 child Session 仍沿公开 board 找回，不能声称零子 Session。

普通 archive/unarchive/purge 同样受 held/pending 约束，读取原生命周期不变。index 原 busy lane 先占用，实际 Host 写仍经同一 admission 检查；项目原清理仅通过当前 hold 内绑定固定 Session/operation 的 purge 闭包进入。经 SDK 公开父关系核验的集合扩入同一个 hold（包括个人根的子 Session），不会把相同 owner 的其它个人 Session 一并封住。闭包退出即无效，公开 Session lifecycle 不接收 bypass 参数。

`held.preview` 只读本 App 的完整 Host index，并沿 SDK 公共 subagents/boards 的精确父 Session/Run 关系补无 index 子会话，核持久父 owner 和实际 Run。结果只含原 owner/ref/preview/decision 与父关系，父到子顺序只确定一次。Catalog 先保存此原计划并完成全部 Memory 清理，再调用 `held.purge`。恢复只读取 Catalog 保存的原计划；父已清除后不重扫消失的 Run 或重建决定，不伪造 child index。indexed 项复用原 Session lifecycle，非 indexed 项以原 SDK preview 恢复。held 回调退出后能力失效，实际 SDK/Index Host 写前沿原 effects 同步复核，不能靠未 await 的调用逃逸。每项 `state` 记录预览当时的真实状态；已 purge 项仍带原决定，并明确标为 purged。Memory 主人另走当前在线无正文预览，不能以此状态或普通空列表证明原件不存在。缺 owner、冲突父关系和未知残留不算完整清空；旧 Home/MEM-40 仍待验。

边界不可配：原 owner、原决定、父子归属、当前取消/授权与唯一 SDK 写主人。App 传删除操作号、业务 owner 明确关联的个人 Session 和 Catalog pending 事实；用户决定仍归原项目删除入口。无新 SDK API、注册表、表、资源或设置。真实隔离 Node/磁盘与本机免费 loopback 定向验证 `tests/prologue-project-deletion.test.ts`，原 `tests/prologue-session-lifecycle.test.ts` 和相关 effect/输入/模型/子任务回归通过。原件只用合成测试数据；这不证明 Catalog/Memory/App 整体删除、旧 Home 或 MEM-40 已通过。

## 可信 Session 生命周期（M4 合同，定向工程验证通过）

单 Session 清除准备增量（基础定向工程验证通过）：`preparePurge` 沿原可信 owner、静止检查和 Index 写 lane 只保存原 `prepared`，返回 canonical Session/ref 与原 decision/preview，不清正文。`purgeWaits` 在同原 prepared 下有界投影 SDK 原 waits 的全部历史 ID，不从当前 collaboration/board 推断。两口使用正式 Host Action 和当前 invocation 身份；limit 1–200，cursor 绑定原 Session/decision，异常或交叉页拒绝。既有 Index schema1 和三个 phase 不变。exact hold 复用原 admission，仅封目标 Session，与项目 hold 互斥，原项目 hold 的同 Session/operation purge 许可可复用；不开放 bypass。

Memory 普通授权按 caller、target、before 的 Session 读取持久 Index pending，最终同步复核同一代际；准备与最终 purge 各占原短 lane，Memory I/O 留在 lane 外，不能持 lane 重入。专用 exact Memory inspection 尚未装配时拒绝，后继原 prepared 例外仍必须核 owner、原 operation 和当前 scope 权限。此片不含业务副本清除、私有 KV、UI 或 MEM-40，不将 AgentHost receipt 当作完整清除证明。不可配的是原身份、原决定、取消、代际与唯一写主人；Runtime adapter 可替换，App 传原请求和有界页，终端用户决定仍归业务入口。完整冻结合同见 [Memory spec](../../specs/prologue-memory-strategy/spec.md)「单 Session 清除基础」。

项目恢复的例外（定向工程验证通过）：实际 Memory 无正文 purge preview/逐项 purge 入口才建立调用局部的原参数证明。App 可选同步窄口仅核原 Project 删除 ALS、可信 Session 集合、scope 与固定 ref/version/child operation；缺席拒绝，普通接口无此证明。preview 的 SDK action 也是 delete，不能靠 action 名识别入口。实际删除还需原 clear 主人正在执行；formal purge 的原输入 N 保持固定，SDK 的墓碑 N+1 与物理移除仍归同操作，candidate 保持 N。每次仍完整执行原 authorize/assertCurrent 和 Index 代际，最终复核撤权/失效；项目 hold 或 person/ui 本身不构成放行。持久 schema/phase 不变。真实 Node 隔离恢复、旧 ALS 失效、并发普通拒绝和部分清除重开见 `tests/project-deletion-recovery.test.ts`，最终同步撤权见 `tests/prologue-memory-current-authority.test.ts`。

purge 还清除同 project/plugin/session 的 ReviewQueue 正文、处理器及本会话批准；无 Session 或其他会话的审查保留。迟到历史恢复和审批结果沿 Index 代际与原行身份拒绝发布。手动回退准备复用同一 admission，不在预检后插入新工作。

命令输出在 Adapter 与 Node 的最后一次读取等待后复核 Session 代际。清理中的异步等待后和每次 surface close 前复核原 effects 权限；撤权不继续后续清理，已完成部分保留、prepared 原决定可续。重启遗留启动意图沿现 recovery 的完整 SDK 账判断：无未认领工作且无 unavailable 才允许继续，意图不删、不伪造 refused。

2026-10-24 已在正式 SDK #100 上完成安装、构建与根/工作区类型检查。`tests/prologue-session-lifecycle.test.ts` 走公共 Action 和真实 Node 持久存储，20/20 通过；`tests/prologue-session-cache-lifecycle.test.ts` 用受控外部读 Port 验证公共 Adapter 的迟到结果拒绝，6/6 通过。影响面首轮失败及定向修复结果见下；完整集成、产品实操和用户验收另记。

M4 取消回归复用上述 Action 阶段用例：真实完成一轮后，在 SDK 根 `cleaning` 已持久化的下一次异步授权回调中取消原 signal，回调正常返回，由原 Host 同步门拒绝后续写入。断言取消点后的持久记录字节不变、Run 子记录与 Index 原决定/输入保留；关闭重开不自行继续，换 operation 被拒且零写，原决定重试才完成子记录清除与最小 Index。这里使用真实生产 Action 注册、Adapter 和 Node 存储，调用身份及取消门由测试提供的 `HostCapabilityInvocation` 承担；不等于完整本地 Host/插件入口实操。该例现已随 SDK #100 的生命周期文件通过；早先 SDK #96 缺少恢复入口、SDK #99 归档读取失败的记录仍保留在 spec。当前绿色不能表述为这条取消用例的先红后绿证据。

AgentHost 拥有业务主人与 SDK Session 的可信映射、SessionIndex 和本层 Run/观察/缓存生命周期。当前 actor/project/plugin/install 必须与 canonical Session 的 Index owner 一致；生命周期 Port 的 owner 由 Host 上下文绑定，普通 Memory 管理页不能用 raw session_ref 代替业务归属。`restore` 仍是历史装配，`unarchive` 才是取消归档。

每 Session 沿现 Index 写队列与 CAS 记录原 operation、观察到的 SDK canonical revision/状态及清除原 preview；pending 拒绝相反决定，旧归档重试不能撤销后来取消归档。沿 Assistant/Coding 现有忙碌拒绝语义，非终态/未对账工作或在途 prepared start 必须先经原入口处理，本能力不自动停止用户工作。previewPurge 纯读且仅允许静止 Session；预览后的新工作导致 busy/stale，零新清理。purge 原决定先持久化，封 start admission，停止该 Session 观察、清缓存，再沿 SDK 恢复入口完成清除。Index 仅保存决定/观察revision/阶段，不另存 SDK 状态真相。清正文仅保留最小 owner、canonical ref、原决定和阶段；迟到索引写回、历史恢复和缓存填充不得重新发布。缺失不等于清除成功，其他 Session 不受影响，不调用全局 close。

生命周期 `read` 的 `operation` 拷贝现 Index 的原 action/decision 与 completed，purge 另投影原公开 preview；仅 complete 阶段返回原 receipt。当前 canonical state/version 单独读取，消费者恢复必须使用原 decision/preview，不能用当前版本重造原请求。read 不续跑或修补，修改返回对象不影响原决定。现公共 Action 回归补了归档及 purge 故障后重开、从 read 恢复原请求、返回对象隔离、异 owner 拒绝、纯读零写，以及完成归档回执与后来取消归档的区分；上述回归已随 SDK #100 的生命周期文件通过，不代表 Coding 消费者接线已完成。

`read` 复用现 SessionIndex lifecycle lane，在同一 Session 的命令或读取进行中明示 busy，避免 SDK open 的状态与随后 previewPurge 的版本跨越归档提交；读取回调不调用 save，不新增锁或持久状态。并发回归经公开 Action 把真实 SDK 归档提交挂在下一 Index 完成前，检查 read 拒绝、其他 Session 仍可读写、完成后状态/版本一致；公开 Adapter 的同轮双读检查读期间互斥与零写。现 Node Adapter 无公开 SDK 读取暂停口，这些反例未精确重放旧 state/new revision 的内部拼接时序；这两份定向文件已在 SDK #100 上通过；该证据边界保持不变。

硬边界：可信 owner、版本/原决定绑定、唯一写门和永久清除不能配置关闭。可替换的是 Runtime adapter；未实现 lifecycle 就明确不可用。App 选择操作与业务 Session，终端用户的归档/取消归档/清除选择由业务 UI 承担，本片不新增阈值或设置。归档不改变 Memory expiry/paused，Run 终态不自动归档。公开回执只证明 `agent-host-session` 范围；Memory ledger、业务副本与 Project 删除依赖仍由各主人编排完成。完整短合同与下一片依赖见记忆策略 spec M4。

影响面验证：直接相关 3 文件、Review 4 文件、单列浏览器 2 文件通过；去重的其余 108 文件为 107 通过、1 失败，其中普通依赖安装文件有 1 条原环境开关跳过。`prologue-writer-authority.test.ts` 的 child stop 场景曾在 ReviewQueue 刷新时因 SessionIndex 并发版本变化报 `agent.session_busy`，单场景重跑同样失败；公开 Index read 复用原写队列后，未改原测试即 1/1 转绿。update 在已持队列时用 inspect，保留前后代际校验；生命周期已核 owner 后直接读 SDK 同 Session 后台状态，避免通用项目投影重入。新增真实后台命令用例验证 running 拒绝、stopped 后归档和重启后 purge，生命周期 20/20、缓存 6/6、Checkpoint 4/4、恢复 15/15 通过。108 文件未整体重跑，原失败与定向修复记录分别保留。真实供应商 live 未运行，Memory promotion 的既有取消时序由统筹单独处理。原始结果见 `/private/tmp/molis-memory-session-lifecycle-sdk100-20261024-remaining.results.json`；这些工程回归不等于 Coding/Assistant 生命周期完整产品入口或用户验收。

## 它拥有什么

- **哪些 Runtime 可用，以及它们真实支持什么**。能力矩阵由 adapter 如实申报；不支持的能力显示为真实不可用，不伪造成功。
- **一次 Run 允许在什么权限下开始**。角色必须是插件 Manifest 声明过的；角色需要的能力 Runtime 必须真的支持；目录必须是宿主授权且已核过 realpath 的。三条都过了才会把请求交给 Runtime。
- **Runtime 不能自己扩权**。启动后返回的冻结角色权限若与 Manifest 不一致，该 Run 会被立刻取消。
- **副作用的批准与回执**。批准是一次性的：消费过就不能再授权第二次写入；拒绝和过期都不能换个入口变成许可；停止一个 Run 会撤回它名下仍在等待的条目。

## 它不拥有什么

编码任务的业务含义、模型选择、凭据，以及批准决定本身——那是用户在宿主审查面里做的。
adapter 只报告事实并执行已批准的工作。

记忆使用投影由可选 `memoryUsage` Host 回调接收真实 SDK Context 回执，保留原 Session/Run、条目版本、retrieval receipt 与模型 call。`prepared` 不算派发；`dispatched-or-unknown` 与 `response-observed` 分开，后者也不证明模型采用。回调失败只报告 `memory.receipt_unrecorded`，不重发模型；读取原 Run 可再交同一事实，关闭 Runtime 时等待在途投影。历史事件到只读视图由 `prologue-restored-session.ts` 持有，SDK 存储读取与原不可恢复控制不变。验证：`tests/prologue-memory-run-context.test.ts` 使用真实 Node/SQLite/本机 HTTP 覆盖 ledger 故障、原 Run 重读和零网络补账；`tests/memory-use-receipts.test.ts` 覆盖单调摘要与遗忘屏障。

## 记忆晋升与可信原件桥

`AgentMemoryTools` 的保存、建议、查询与停用回调必须接收本次可信执行控制。gateway 保留实际工具/Run 的取消信号，并为一次执行生成固定操作号；模型参数或 tool-call id 不授予操作身份。LocalHost 将此控制贯穿实际 Host 提交与 ledger，未提供控制的旧直接调用拒绝；不新增跨重启工具重放保证。

Adapter 的实际 disable 调用在原 ALS 帧携带 operation=disable，作为 `PrologueMemoryOptions.authorize/assertCurrent` 可选第三参数交 App。它只说明这次调用的动作，不授予权限；caller/模型自报字段不能设置，普通写入及并发调用不继承。App 可将停用与形成分别授权，同操作重试仍核当前权限、固定输入和版本。公开 Node 回归 `tests/memory-runtime-policy.test.ts` 覆盖关闭形成后的停用/重启重试、普通编辑拒绝及并发隔离；助理真实调用另由 `tests/assistant-memory.test.ts` 覆盖。

形成沿 `memory.candidates.form` 委托同一 SDK 候选主人；Host extractor 只在既有 `memory-extractor` 槽执行一次提炼。固定 slots、replacement 原版本与 canonical 来源由 SDK 校验，Adapter 仅投影 snake case，不产生候选或批准。已有记忆（最多 30）及待审候选（最多 20）的授权展示快照随这次 ALS 调用传给 extractor，正文只传一次，不成为来源证明，不存第二份账；快照不能替代后续来源、权限、期限与目标 CAS。进程内 `validate_context` 与 caller/context 分开保存在本次 ALS 中，在真实模型 before_dispatch 前复核原 ref/version 与当前读取许可，不序列化、不落盘、不发模型；`none` 零调用。逐项 created/replayed/rejected/unknown、部分成功、取消和未知用量完整返回。正常返回的 reported usage 先交 SDK，再由来源与实际存储门拒绝迟到写入；Host 自身拒绝结果或取消竞速尚未交回结果时，usage 保持 unknown，不推算为零。`trigger:none` 委托 SDK 零来源/模型读取；缺 extractor 明确 unavailable。验证使用公开 Adapter、真实 Node 存储与本机 HTTP，不宣称真实模型质量已验收。

补充原件证明由 Host 绑定实际 install、Action 和 `send.<input_id>`；无证明的 Action 输入按 host 来源处理，不因自报 person 升权。混合输入的 raw 原件只原位保存，外层正文仍是唯一模型材料；初始输入与补充输入的证明用途隔离，不能互换。Adapter 只投影已核验原件，不从组合正文或分隔符反推本人原话。

已经接受的 Run 停止时，当前控制调用先通过原权限检查并持久化停止意图；随后取消和 SDK 终态收尾经现有 effects.detach 脱离该短调用。终态仍由 SDK 保存并发布，界面不提前伪报停止；普通迟到业务写仍受原调用检查。

Host 可注入版本化 `memory.promotion`，Adapter 将候选、来源、正式变更与 App 历史回执转换为纯 AgentHost DTO，只有这里依赖 SDK 类型。`decide` 只读返回 promote/hold；`undo.prepare` 保存当前操作的准备，`undo.record` 以 SDK 已提交的 canonical entry 补历史及撤销身份。回调首参只能来自当前 `withCaller` 的独立调用上下文，或 SDK 请求对应的可信 Session owner；prepare/record 没有来源上下文时要求原调用绑定仍在，缺失即拒绝，不从模型参数恢复身份，不新建操作账。 App 的 prepare/record 写账也复用原调用的 `PrologueEffects`：异步身份解析和 `beforeEffect` 后紧邻写入核 `assertCurrent` 及本次 `signal`，任一等待中取消不再调用 App 写账；撤权后不能留下准备历史，正式已提交而补账被拒时沿原操作恢复。

晋升 `promote` 与替换 `settleInto` 将各自本次 `input.signal` 显式传入现有 Memory effect 帧。`beforeEffect` 在纯调用授权等待前后检查取消，并只让这一段等待响应取消；监听在结束时移除，迟到授权拒绝被消费。等待解除后也不能续调 App prepare/record。此适配不竞速正式写入或整条晋升，不扩大其它 SDK authorizer 的取消承诺；提交前为安全固定的 `CANCELLED`，提交后仍由 SDK 返回原操作待补账事实。真实 Node 专项 `tests/prologue-memory-promotion.test.ts` 使用 durable reservation/commit 屏障，覆盖 create/replace、迟到 resolve/reject、原正文和版本保持及关闭重开后的原操作恢复。该专项属于工程验证，不代表真实 Home 或用户体验验收。

SDK 仍拥有来源、权限、期限、取消与正式 CAS 门。App 的回执必须保持原 operation、候选原版本、policy/version 和实际 memory/version；Adapter 不伪造成功，也不证明 App 的历史事务已实际可撤销。已提交而 record 未完成时，SDK 的 `MEMORY_PROMOTION_RECORD_PENDING` 映为 `agent.memory_promotion_record_pending`（conflict），保留`operation_id` 与无正文 `committed: { memory_id, version }`，可用完整原请求重试，不能报成零写入。未装完整晋升实例仍不可用。

分类限制依赖 SDK 最终授权 fence：App 在 `memory.assertCurrent` 同步核本次 target/before 的当前规则，可信 caller 使用各自调用/原 attempt 的 ALS 帧，不借另一个 Run 的最新快照。它只能收紧已完成的异步授权。Memory 专用 effect 帧将异步 `beforeEffect` 放在 authority 检查之前，最终 Host storage 包装只同步核执行令牌，避免分类检查后再等待；普通 Session/Run 写入和晋升 prepare/record 保留原完整门。真实 Node 在每次实际网络派发前执行该 fence；没有安装同步 App 检查时不承诺等待期间即时撤权。专项包含目标分类撤权后重启无候选及发送前关闭后零 HTTP；本片尚待新 SDK 包集成验证。

`AgentTurnSteer` 和 `AgentQueuedInput` 仅复制 SDK 可证明的 `acceptedAtMs` 为可选 `accepted_at_ms`，不把新 Run 或读取时刻当作原件时间；旧记录未知就省略。steer 的 `source` 同样从 SDK 原件投影，app 映为 host，peer 保持 peer，不凭 user-role 判断本人。carry、取消与重启不另造输入身份。

SourcePort 也只接 AgentHost 的 snake_case 引用、身份与短期正文快照，调用方来自同一可信绑定；来源内容不由模型自报。当前产品通过 SDK form/extractor 复用唯一 HostTextGeneration 提炼；来源与候选持久化仍由 SDK 核验。此桥不接第二模型循环或第二来源/历史表。回归使用公开 Node Adapter 与隔离真实存储，覆盖创建、替换、hold、故障补账、撤权及取消。

## 插件怎么够到它

有界模型结果由 SDK `collectRun` 从同一 Run 收集；Host 的 `completeTextResult` 返回原引用、终态、实际模型和 typed usage，并可显式请求结构校验或观察文字/用量进度。失败保留可用的运行回执，不自动重试格式。公共模型绑定、Coding 草稿、Cognia 的具体例子见 [AI 手册](../../docs/platform/PROLOGUE-AI.md)。

插件不持有 Agent Host，只能调它登记的动作：运行时列表、角色可用性、方法库与 MCP、会话创建与读取、
Run 的启动/读取/控制/等待、接续的等待。每一条只给插件、不要权限，宿主先检查插件在 Manifest 里声明消费了它；
是谁的会话、角色、方法库，只按调用者算，输入里不带插件名（R8）。

注册入口是 `registerAgentHostCapabilities`，已由 Local Host 的生产装配调用，Coding 经 `services.actions` 使用。
`agent.run.reviews.v1` 按当前项目、原 Session、Run 和生产者读取文本审查与原回执；读取先刷新 SDK 原恢复事实，失败明确报不可用。
它不会批准、派出或结算副作用。固定成果的保存与阅读由消费插件通过原 Artifact 服务完成，批准仍属于宿主审查面。

**批准刻意不是插件可调的动作**：那是用户在宿主审查面里的动作；开成插件可调的能力，
就等于让插件批准自己的副作用。

## 从哪里读代码

- `src/index.ts`：`AgentHost` 的注册、能力矩阵与启动授权。
- `src/reviews.ts`：`AgentReviewQueue` 的请求、决定、一次性消费与回执。
- `src/capability-registration.ts`：对外暴露的动作与它们的授权边界。
- `src/session-actions.ts`：关于会话轮次的统一动作——等待与接续（`agent.collaboration.*`），以及插件向一轮补充要求（`agent.inputs.send`，回执说这一轮收下了还是留到下一轮；纠正用 `about` 指向原来那条）、撤回还没交给模型的补充（`agent.inputs.withdraw`）。
- `tests/agent-host.test.ts`：授权与批准各条边界的断言。


维护桥另提供 `previewCleanup` / `purgeCleanupTarget`，只走 SDK 公开 `previewAdoptionCleanup` 与原 formal/candidate purge。配方仅在原 manage-read 上增加 delete，不开放保存、接纳、晋升或模型；原 scope、operationId、expectedVersion 不随恢复变化。同步当前授权接到 SDK 最终使用/提交的 assertCurrent，absence 也要经过桥自己的当前范围和取消检查。真实 Node 故障回归仍在 `tests/prologue-memory-adoption.test.ts`；新用例待正式 SDK 包集成后实跑。

## 开发要求

- 负责：Agent Runtime 注册、能力矩阵、冻结的启动授权、宿主审查队列与 Prologue 推理接线。
- 不负责：编码业务含义、角色与提示词正文、模型选择与凭据、批准决定本身。
- 公开入口：`@molis-ai/molis-work-service-agent-host`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/agent-host`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-storage`；第三方依赖见 `package.json`。方向：依赖合同、同目录适配端口与 storage 的排他所有权技术端口；不决定业务状态（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 目录 Action 的工具时限取提供方 `execution.timeout_ms` 与 Agent 入口上限中的较小者；完整声明参与冻结合同，不按能力名称猜测成本。
  - 仓库里唯一依赖 `@prologue/sdk` 的包。
  - Memory Adapter 将 SDK 的 `STORAGE_CONFLICT` 翻译为公开的 `agent.memory_conflict`（conflict 类别），适用于正式记忆与候选的同一访问出口；HTTP 状态继续由统一 Action 错误模型决定。不会把未知错误或回执丢失解释成可重放。
  - 前台 SDK 写入保留原调用控制到实际 Node storage commit；最终 checker 必须同步。只有初始 Run 持久记录提交后，drive 才脱离前台信号，派出仍核独立安装授权。Session 以 SDK 记录和 owner 索引都已提交为接受点；索引前拒绝时由 SDK 清理本次未接受 Session，清理失败明确报出。尚未接受的排队效果不会因包装函数返回而丢失原 checker。
  - thinking 与显式输出预算合成同一个 params；文档文本提取 finally 回收本次原件和派生资源，保留其他消费者持有的附件。
  - 每一轮的冻结记录带宿主给的调用编号（`frozen.call_id`）：来自启动权限 `AgentStartAuthority.call_id`，经 `AgentHost.start` 交给适配器；适配器不读请求体里的同名字段，所以插件塞的值不会成为一轮的编号。编号只写在这份冻结记录里，不交给 Prologue（用户 2026-10-10 决定）；它不是工具调用的 `call_id`。回归：`tests/agent-start-authority.test.ts`。
  - 原图输入经可信 Host 选定路径、Node Host intake 与 Session attachments；只读根不交给模型工具。支持 PNG/JPEG/GIF/WebP，单图 32 MiB、每次 50 张/128 MiB，共享资源总量仍限 128 MiB。完成/失败/取消撤销资源，关闭时等待实际清理。回归：`tests/prologue-inference-images.test.ts`。
  - 一个 Home 一个执行 owner；另一个进程得到 `agent.inference.home_in_use` 或 `agent.storage_busy`，经 `inferenceServiceUnavailableReason` 转成给人看的原因。
  - 派出前复核（`beforeDispatch`、凭据核对）拒绝时，调用方拿到复核自己抛的错误（`isDispatchRefusal` 为真），不得改写成模型或网络失败；SDK 侧对应 `EFFECT_NOT_AUTHORIZED`。
  - 角色必须是 Manifest 声明过的，能力必须 Runtime 真支持，目录必须宿主授权且 realpath 已核；`unsupported` 就是不能用，不降级不伪装。
  - 项目 MCP 配置由 SDK 保管；来源插件是来历，Host 共同动作允许助理在自己的授权下复用。启用的断线连接只在获准调用时重连，目录查询不启动进程；准备和实际派出都复核原工作区授权、配置版本及工具形状。`catalog()` 仅供 Host 管理列出项目归属，不赋予调用权限。`call` 的 Host 观察回调区分业务派出和结果，连接准备不算业务调用；SDK 的明确工具失败与结果未确认分别通知，原错误合同保留。回归：`tests/external-mcp-actions.test.ts`、`tests/external-mcp-dispatch.test.ts`、`tests/coding-mcp.test.ts`。
  - Runtime 不能自己扩权：批准一次性，拒绝与过期不能换个入口变成许可。
  - 插件 caller 的项目身份只取 Host；`HostPluginCaller.project_id` 为 `null` 的 Home caller 在原归属检查处以 `agent.session_unknown` 拒绝，不补造项目。通过检查后才窄化成项目 caller；回归见 `tests/home-plugin-platform.test.ts` 的 Home 消费身份与 Agent 拒绝用例。
  - 逐项能力回合（冻结的 `action_tools`）的角色 `host_tools` 带 `suggest-action` 时，这一轮多一个建议工具（`molis-suggest-<范围>`，与动作工具同一个包）：只能点名这一轮的动作工具，按动作此刻的状态与它自己的输入检查核过才记下，什么都不执行、不排审查；记下的建议原样进运行视图的 `offers`（`AgentRunView.offers`，从保存的事件回放，不重新生成），落成什么由调用方决定（D25）。只读角色带 `suggest-action` 开跑前就拒（`agent.role_execution_exceeded`）。`suggest-action` 不是 Prologue 的系统工具，不经 `prologueToolName`。建议工具按名字前缀免审查放行，所以别的工具来源都不能产生这个前缀（MCP 是 `mcp:…`、动作是 `molis-action-…`、其余是固定名字或 SDK 系统工具）；新增工具来源时要守住这一点。安全不变量 S-28，回归：`tests/security-invariants-agent-suggestions.test.ts`、`tests/agent-host-offers.test.ts`。
  - 逐项能力回合的包 id（`molis-actions-<范围>`）算进包里声明的一切：时限、有没有建议工具、每个动作的引用、操作、声明与提供方的显示名。SDK 在一个进程里按 id 只认第一次登记的声明，漏掉一项，两轮动作相同、声明不同时第二轮就被拒（`SCENARIO_PACK_INVALID`）；Coding 同一个会话先「执行」（可以建议）再「修改」（不能）就是这样撞的。范围按每轮记在会话索引的 `action_tool_scope` 里，读回时用记下的、不重新算，所以改算法只影响新的轮。回归：`tests/agent-action-tools-prologue.test.ts`、`tests/coding-mode-switch-pack.test.ts`。
  - 插件执行一轮的建议只经 `agent.offers.run.v1`（只给插件受众）：只执行这条建议记下的那个确切引用，且只在调用插件自己会话的这一轮里；用这一轮的授权此刻重新发现，合同与建议时的 `action_digest` 不同就拒；输入过动作自己的检查，`beforeEffect()` 之后才调。动作的上下文带点的那一轮所在、刚核过归属的会话（`runtime_session_id`、`audit_actor_id` 为 `agent:<runtime_id>:<会话>`，点击里自带的不算），与这一轮自己的工具调用一样。宿主不另记状态，重复执行由插件的卡自己认领挡住。安全不变量 S-29、S-17，回归：`tests/security-invariants-agent-offer-runs.test.ts`、`tests/security-invariants-agent-run-session.test.ts`。
  - 写后检查（`src/adapters/prologue-after-write.ts`，specs/prologue-adoption §6.0p，S-42）：Coding 一类有工作区的轮，包里带一样标了 `afterWriteCheck: true` 的 `safe-read` 工具（名字随包，不给模型）；工作区此刻已授权、存了检查器，这一轮才给它执行器，否则 SDK 零调用。执行器只照人存的配置答一条命令（第一个适用的、只查它 `cwd` 里的文件，`{file}` 是相对这个 `cwd` 的路径，以 `-` 开头的写成 `./…`），每次回答前再核这一轮的授权与工作区，一轮至多 10 次；自己不起进程，命令由 SDK 走同一道审查、Effect 和回执。答了哪个检查器、哪个版本，按 SDK 给的 `operationKey` 记在这一轮的索引里（`write_checks`），审查卡按同一个键读；读不到就不能批准。
- 改动后必跑：`node scripts/run-tests.mjs tests/agent-sdk-effects.test.ts tests/agent-budget-prologue.test.ts tests/prologue-documents.test.ts tests/agent-host.test.ts tests/agent-host-composition.test.ts tests/agent-host-wiring.test.ts tests/agent-start-authority.test.ts tests/agent-action-tools-prologue.test.ts tests/coding-mode-switch-pack.test.ts tests/agent-host-offers.test.ts tests/security-invariants-agent-suggestions.test.ts tests/security-invariants-agent-offer-runs.test.ts tests/host-inference-completion.test.ts tests/prologue-inference-native.test.ts tests/prologue-external-checks.test.ts tests/security-invariants-external-checks.test.ts tests/coding-checkers-settings.test.ts tests/coding-diagnose-after-write.test.ts tests/security-invariants-checkers.test.ts`
- 动作网关的调用与建议均以当前 input schema 校验；参数错误使用 SDK `TOOL_ARGUMENTS_INVALID` 返回有界合同与嵌套要求，不带用户值或任意异常正文，避免未知 Host 异常被截成 240 字后模型重复同一错误。输入合同已通过、却被能力的主人（或它调用的主人）以 `actions.input_invalid` 拒绝的，回执改为主人自己的原因（截到 600 字），说明输入符合合同，不再给合同让模型改形状。能力找不到时：这一轮确实见过、现在没了的确切身份（能力、版本、提供方）才说已关闭或移除；从没见过的身份按写错处理，提供方写错时说出这个能力实际由哪个提供方提供，并指回 find-capabilities。直接执行的可撤销修改（`change-reversible`）在运行前被网关钩子拒绝，回执同样写出完整的 input 合同并说明没有执行；它不算交互工具，模型一直不改时由运行时的重复调用保护停下。通用 input 明确声明 JSON 类型，继续由当前能力 schema 校验具体字段，不从按钮文案猜输入。其他失败不转成参数重试，写入结果未知仍先核对。真实 SDK 回归见 `tests/issue-assistant.test.ts`（ISSUE-25）、`tests/assistant-business-gateway.test.ts`。
- 补充提问沿用 SDK `ask-user`：自由文本只传 `why`，问卷选项为字符串数组。同一 Run 内同一种交互工具（`ask-user` 或 `suggest-action`）最多容许两次参数失败（首次及一次纠正），第二次 `TOOL_ARGUMENTS_INVALID` 回执触发原控制面停止，避免模型继续重复无效调用；成功的结构化待补充不算失败，原始参数与回执仍由 SDK 记录。
- 相关手册：[docs/horizontal/agent-host.md](../../docs/horizontal/agent-host.md)、[docs/platform/PROLOGUE-AI.md](../../docs/platform/PROLOGUE-AI.md)、[skills/molis-prologue-ai/SKILL.md](../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [Plugin Platform v2 需求书](../../specs/plugin-platform-v2/spec.md) 的 D5（命令行适配器已删除，现只有 Prologue；D5 开头有 2026-10 的更新说明）
- [Coding 插件 UI 与交互设计](../../specs/coding-plugin/design.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/services/agent-host`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
只有一个 adapter：Prologue。曾经的 `claude` 命令行适配器默认注册却没有内置调用方，已删除（2026-10），公开入口不再导出它；外部 Agent 运行时按口径暂缓。

Prologue（`src/adapters/prologue.ts`）接通了会话、Run、事件流投影，并且**可以挂上审批桥**：
不挂时写入报 `unsupported`，挂上之后才申报支持，且 Run 停下等的每一笔副作用都先进宿主审查队列。
命令只有同时接通宿主审批桥和持久回执读取端口才申报支持。Node 装配读取 SDK 固定命令审查资源，
并按 Session、Run、call 精确读取 SDK 回执；非零退出、取消和超时不伪装成功。
正式 Coding 入口已用 MiniMax 跑过仓库测试，范围与剩余验证见 Coding spec。

Prologue Node 将基础/内置角色、固定 Character、项目说明、选定方法与恢复上下文一起装入 SDK 指令资源。
组合正文上限为 64,000 字符（UTF-16 长度），SDK 使用相同上限；角色库合法的 20,000 字符正文不会因叠加基础指令而被默认上限截断。
超过组合上限时，在记录启动意图和请求模型之前明确拒绝，提示缩短指令或减少方法，不把部分指令冒充完整冻结输入。
该上限不改变工具权限、审查规则或模型窗口预算，不能证明模型必然遵循已送达的指令。


## 子任务观察与控制

Prologue Node 接上宿主审查队列时声明子任务能力 `partial`。同目录只读角色保留原路径；声明必须分配子目录的只读协调者可以冻结宿主已授权、互不包含的独立目录，以及各子角色的正文、版本和工具。未授权、重复、主目录或嵌套目录不能启动。SDK 在第一次子模型请求前再次核对本轮角色和目录归属；父 Character 只接收读取/分派工具，SDK 的运行工具上限额外包含子角色工具，不能让父任务直接调用写工具。

子任务沿用原 SDK Session、Run、Pending 和 Effect；Host 只在已有加密归属索引保存父子引用、固定角色和目录，将原待审操作送入同一个 Review 队列。文本与命令审查明确显示所属工作区；命令的相对 cwd 保持原值，命令输出按原子任务回执读取。审查桥失败停止子任务并保留宿主失败原因；重启只读取原记录，不能批准旧待审操作来重派执行。独立目录是工具根目录与命令 cwd 的边界，不代表获得操作系统级进程隔离；批准命令仍须审查其完整参数和执行范围。

此接口尚未接入 Coding 的工作树准备、选择、成果整合与 TaskBoard。现有正式角色不会因新增 Runtime 接口自动开放并行写入；需完成调用方的目录授权和产品流程后再启用。

`agent.subagents.list.v1` / `agent.subagents.cancel.v1` 先核对项目、安装、原 Session 与 Run，再读取或停止该父运行名下的子任务。SDK 登记与原事件拥有状态、正文、活动和用量；Host 只额外保存角色来源，关闭重启不重派。成功结束与用户接受分别记录，后者由消费插件拥有。完整报告通过原 SDK `await-subagents` 的 `reportOffset` 分页读取最后一段结果，默认回传明确为摘要。分派引用、搜索语义和输出质量仍需产品实操核对，能力 `partial` 不代表并行写入或整体协作已完成。

ReviewQueue.observeSettlement 是 Host 投影通知口：只通知执行 owner 新记录的成功、失败或未知回执，重复 settle 与 Prologue 恢复历史不重复通知。监听错误不改写已提交 Effect，也不触发执行重试；消费者必须按项目过滤并自行释放。插件发起的 Host 操作，监听者另收到发起时记下的 `ReviewAuthority`（只在本进程里，不写进审查记录）；它的 `holds()` 说那次激活是否还在。宿主据此把 `host.review.settled@1` 只发给发起的那个安装（X-6，S-54，`apps/local-host/src/review-settlement-events.ts`）；没有发起安装的（Agent 自己的改动、恢复出来的审查）不发。

目录状态读取在冷会话上使用原加密启动索引、SDK 运行/未结束工作与 checkpoint 恢复检查，只回放最后一轮的过程，并从索引定位最近计划轮的步骤。它不保留历史正文或创建历史控制句柄；打开详情和开始新轮仍走完整恢复路径。不支持内部轻量读取口的 Runtime 保留原恢复行为。回归见 `tests/prologue-status-projection.test.ts` 与 `tests/prologue-recovery.test.ts`。

中途换模型的原调用控制经现有 `withAgentEffect` 进入实际 Node Runtime；配置和凭据等待后复查异步授权，SDK 完成校验后的同步接受点再核原调用。待切换显示也在同一接受点更新，拒绝的候选不覆盖此前接受的目标。W2-18-MODEL-SWITCH-01/02 在 `tests/agent-sdk-effects.test.ts` 使用正式 typed Host、实际 SDK/Node Host、真实文件读取与受控供应商回复，核取消/撤权、B 后拒绝 C，以及后续模型请求确实仍为 B；真实供应商推理质量另列未验。

## 基础 SDK 采用

显式输出预算优先于思考默认值；只读工具必须同时声明 query 操作和 read 副作用。修改提议、委派、记忆的工具按写入处理，仍由原 Host 规则授权。SDK 状态投影保留 sleep 和每轮真实写入回执；sleep 不等于工作完成。命令额外路径/联网请求进入同一 Review，批准只适用于当前请求，不生成会话常驻规则。

输入回执 SDK 的 steer 返回值暂在装配边界等待后丢弃，Molis 输入产品合同与 UI 留给输入线。采用包的工程、安装与实操证据见 [采用 spec](../../specs/prologue-adoption/spec.md) §6，不能把基础采用当作 TaskBoard 统一协作已完成。

## 统一协作（P3a）

要协作的一轮（工具里有派子任务、发信、报告步骤、登记等待，或带确认计划）开跑前，宿主把它绑到这个会话在项目工作板上的那一块（`prologue-collaboration.ts` 的 `sessionBlock`）。项目根是 `project`，每个会话的块挂在它下面，所以同一项目的会话互为兄弟。这个会话有一条可以接着做的接续时，用接续的请求键开跑。确认计划的步骤挂在这一块下面，编号带前缀（`prologue-plan-steps.ts`），给 Coding 的视图仍是计划自己的编号。

没绑的跑拿不到这些工具。

每次派子任务之前，宿主协作口（`admitDispatch`）都会再跑一遍这一轮自己的派出前复核。让出（`yield`）、`board-wait`、带 `wait` / `park` 的简写，都只登记等待并结束这一轮，Runtime 不会自己起父跑。等待满足后，接续停在可以接着做；下一轮由宿主照常开跑时，才把接续接过去（`tests/prologue-adoption-guard.test.ts`）。

等待与接续的视图在 `services/agent-collaboration`，读与控制是两个动作，等到能接着做是一个宿主等待（`agent.collaboration.await.v1`）。

等外面的结果（P3c）：`board-wait` 的 `external` 条件由 `prologue-checkers.ts` 里的两个检查器去看，不经模型。`molis.action-query@1` 只查这一轮此刻能调用的只读查询（`operation` 与 `kind` 都是 `query`、effect 是 `read`）；模型给的是动作工具名，`remember()` 时用 `prologue-action-tools.ts` 的 `actionToolRefs` 按这一轮的冻结动作建好名字到引用的表，检查器不自己算名字；`molis.file-present@1` 只看这一轮授权目录里的相对路径。登记时一个 `tool-before` 钩子先拒掉写类、判断、声明了 `model:invoke` 的查询、导航和这一轮没给的动作；之后每次看都重新复核：轮次还被记得、这一轮自己的 `beforeDispatch` 通过、动作经统一动作服务用这一轮的授权重新发现，目录经宿主的 `checks.directoryAuthorized` 端口确认仍授权。不过就回 `refused`，等待停下（`docs/system/SECURITY-INVARIANTS.md` S-27，`tests/prologue-external-checks.test.ts`、`tests/security-invariants-external-checks.test.ts`）。

宿主还可通过 `checks.owned` 登记领域 owner 的只读检查；模型与插件没有登记入口。每次读取前后都用当前会话身份向 owner 重新证明权限，允许仅该窄读取在重启后恢复；通用动作和文件检查仍按 S-27 拒绝重启后的旧授权。读取暂时失败保留 unknown；撤权或归属不符是 refused，不展示原始错误正文。个人助理的 `molis.connector-setup@1` 只查看同一会话准备的接入请求，不能借它安装、调用业务工具或判断任务成功。回归见 `tests/security-invariants-owned-checks.test.ts`。

信的规则：agents 受众的信只在同一张板相邻的步骤之间走，宿主负责把信交给收件人正在跑的那一轮。同一项目的会话可以互相请求、答复、通知、交接计划步骤；跨项目的会话不在同一张板上，照旧拒绝。几个会话同写一张板靠 SDK 按节点判冲突（P2k）：只有要改的那一步在模型读过之后被人改过，才报冲突。

可信初始输入由受保护 Host 入口交给现 Session attempt 保存原件，后续同 Session 接续只带引用；业务 DTO 不能自证本人身份。`tests/coding-original-inputs.test.ts` 走真实 HTTP/Node 验证原文、首个时间、重启、失败重试同身份、并发拒绝及跨 Session/派生输入拒绝；这只证明原件桥，不代表学习形成已接通。

原件输入与输出对应的正式动作当前为 `agent.run.start.v1@2`、`agent.session.read.v1@3`、`agent.run.read.v1@3`、`agent.run.wait.v1@3`。启动旧 @1、三个读取口旧 @1/@2 固定引用被拒绝，不静默换版；消费者使用公开 definition 取得当前 version。`tests/agent-host-actions.test.ts` 经真实 PluginRuntime 验证拒旧，并走 Coding 生产 HTTP/Node SDK 验证原件、同 Session 接续及 session/run/wait 三读保留原件，原 owner/取消检查继续适用。

`readOriginalInput(ref)` 从该 Session attempt 读取首原件的精确正文、作者、身份和首次时间；`accepted_run` 则指向同原件最近一次已接受且未 refused 的直接尝试（排除 `frozen.continued_from`）。拒绝且未建立 Run 的尝试不阻挡后续真实重试，派生继续不能让失败原件取得学习资格。来源消费方仍检查定位 Run 的当前状态、Session owner、工作和权限；缺失或未接受不从拼接任务恢复。原时间和身份不因读取、继续或重试变化，不扫描 SDK 历史，不增加正文存储；Source Port 的 App 规则见记忆策略 §9.4。

`inputs.read(ref)` 先由 SDK 同 Session 的有界 InputBook 定位，再读该 Run 的原输入回执。当前 queued/withdrawn 优先于旧回执；未落定的直接补充仅可检查该 Session 唯一当前活跃 Run，记录缺失或已裁剪保持未知，不扫描历史。该定位不赋予读取或形成许可，产品 SourcePort 仍逐次核当前来源主人和用途。

通用 Agent Memory Action 和 SDK 内置工具共用同轮 recipe。AgentHost 在创建 action tools / gateway 前捕获快照，经现 actions Port 交 Host 绑定原插件与 Session；缺快照时 Memory 拒绝，不从 Session 最新 attempt 补权。真实生产组合回归见 `tests/agent-memory-action-class-policy.test.ts`。

分类控制接入 R8 后，`agent.session.read.v1`、`agent.run.read.v1`、`agent.run.wait.v1` 的 Action version 为 3：严格输出允许该轮冻结的 `class_restrictions` 与 `memory_scene`，分别位于 `latest_run`、直接 Run view 与 `view`。只登记现版本；插件固定旧版本时以 `actions.dependency_missing` 拒绝，不能自动换版。Coding 与 plugin-builder 的消费声明沿公开定义同步；公开插件 `actions.discover()` 仍只列本安装自身动作，已声明依赖由 `invoke` 按版本与提供方发现。`startRun` 业务输入不收 `memory_context`、`class_restrictions` 或冻结 `role`，由 Host 生成。回归为 `tests/agent-host-actions.test.ts`、`tests/agent-host-composition.test.ts` 与真实 Coding HTTP/SDK 的 `tests/agent-memory-action-class-policy.test.ts`。


### 明确续期（2026-10-24，实现中）

Memory renew 经现可信 caller、ExecutionControl 和 formal ref 解析直接调用公开 SDK memory.renew；Adapter 只映射 expires_at_ms，不修改状态、分类或来源，不补 Session 绑定。本片保留已采用的 SDK #96 交付包；接入新父后的验证结果见 Memory spec，不将旧父证据冒充本轮通过。

离线 Memory 采用由 `openPrologueMemoryAdoption` 持现独占 owner，成功后同步 `onOwned` 建立 App 屏障，再打开 SDK 专用 maintenance（省略 sessionPurges 时 Session 清除集合为空），没有普通 Runtime 恢复或 shutdown。关闭先等待维护调用并关闭 SDK，再在原 owner 内运行可选同步 `afterSDKClosed` 发布，最后释放 owner；SDK close 失败不发布且保 owner，发布失败释放已安全关闭的 owner 并抛错。回调只能在第一次 close 传入、必须返回 undefined；普通 close() 幂等。账本提交后若 owner 释放失败，账本不回滚，API 抛错且 owner 仍保持互斥。`openPrologueMemoryAdoptionInspection` 提供原孤儿 cleanup preview、Session/Index 无正文读取与 close，不取得 owner、不创建 SDK key 或目录；两者固定 App、scope、策略并保留同步当前授权。回归：`tests/prologue-memory-adoption.test.ts`、`tests/memory-adoption-maintenance.test.ts`。


verifyPurgeCoverage 是内部无正文薄桥；inspection authority 只取真实 bound caller，复用 execution control，并要求 App 提供异步授权与同步最终检查。缺口拒绝，普通管理许可不代替 owner coverage 许可。
## MEM-40 源 SessionIndex 读取

离线 `openPrologueMemoryAdoptionInspection` 从停写后的完整 T1 工作副本，通过 SDK existing-only inspection 读取固定 App Index kind；`inspectSessionIndexes({limit?,cursor?,signal?})` 返回有界 facts 与 cursor/exhausted。facts 仅含可信 owner、SessionRef 和原生命周期决定/阶段/预览/回执；不返回 title、attempt、task、original_input 或 raw storage。在线 Store 与离线读取共用唯一 decoder，在线写队列与生命周期状态不变。

已枚举行消失、墓碑、坏形状、版本变化或授权/取消/关闭检查失败，整页拒绝，不交付部分事实。原生命周期阶段不是恢复命令；缺失 actor 不猜补。调用者必须穷尽分页后再与 SDK/Catalog 可信 Session 事实联结；空页不能证明已知 Session 原件不存在，本前置不完成 MEM-40 覆盖判定或目标写入。限制沿 SDK list；本层没有新阈值或可绕过的检查。

同一 inspection 的 `sessionTerminations`、`inspectMemory` 和 `previewMemoryPurge` 薄映射 SDK 原无正文读取，供上层与 Index、Ledger、Catalog 联结；present/cleared/absent 保持原义，缺失不证明已删除。固定 scope、取消、当前权限和关闭生命周期不变，不开放原始存储或新写口。

直接回归：`node scripts/run-tests.mjs tests/prologue-session-index-inspection.test.ts tests/prologue-memory-adoption.test.ts tests/prologue-session-lifecycle.test.ts tests/prologue-session-cache-lifecycle.test.ts --jobs 2 --browser-jobs 1 --retries 0`，另保留本 README 的开发要求影响面。真实 Node 测试只使用临时存储，不触真实 Home 或外部模型。


## MEM-40 冷维护 Session 清除

`openPrologueMemoryAdoption` 可固定 `sessionPurges`，`purgeSessionTarget({session})` 仅执行该集合。独占 owner 内重核真实 Index/SDK 原决定，经在线共用 purge 用例保存 prepared、SDK 原清除、sdk-complete 与最小 Index complete；重试不换 owner/operation/version/preview。缺 Index、未知 owner、absent 或不一致的 SDK termination 拒绝。原空集合行为保留，未选对象不参与执行；inspection 的 `inspectSession` 仅映射 SDK 无正文 canonical 读取。

整 factory signal/current/close 覆盖存储提交，不增加单次取消假口。无普通 Runtime 启停、模型、空 effects 或第二状态机；在线 quiet/cleanup/effects、preparePurge/purgeWaits 和当前准入仍由原主人执行。最终 Index 逐字段构造，未知附加属性也不保留。此为 MEM-40 前置，缺失 Index 的完整联结与恢复验收仍待上层实现。直接回归 `tests/prologue-session-cold-purge.test.ts`，保留 lifecycle、cache、inspection、adoption 与开发要求的影响面。
