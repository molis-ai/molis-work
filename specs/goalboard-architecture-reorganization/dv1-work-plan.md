# DV1 — CLI / MCP 薄入口迁移

## 第十二条切片与整体验收（2026-09-05）

Board initialize/snapshot/create、V3 import、resume facts、trash list 的原 capability definitions 与输入输出已归官方 Goals Plugin，root 只保留兼容 re-export 与原实现注册。完整 BoardSnapshot 复用事实 owner，Goal/coverage revision 记录归 Goals Contract；V3 算法正文与迁移前逐字一致。删除一个类型迁移后未用的 import；其余业务未改。

44 项受影响入口回归通过；完整 `pnpm test` 构建及 601 项自动回归通过、0 跳过。边界 48 包、305 source files、778 imports、65 dependency edges、0 错误；根 TypeScript、`git diff --check` 通过。各项验收、caller inventory、旧职责去向及剩余整体工作统一见 [DV1 验收报告](dv1-validation.md)，下列各切片保留为历史记录，不再表示当前待办。

## 第十一条切片进度（2026-09-05）

已迁：Goals / Execution / Ready / Available / Explain 的实际 CLI/MCP caller 全部使用 Plugin 的有限 typed Client，root 不再获取 Coordinator/availability，旧 runtime 的 availability 字段删除。`GoalsEntryApi` 只含原入口已用的方法，Execution entry 明确排除可信人工 Review；同步领域接口与业务实现不改。所有 App handler await 后再展示，Evidence workspace 仍由宿主获取。

Host 在同一 handler 同步完成 Available+projection、trash+work state、planning methods+composition，不把写入和对应状态拆开，也不新增跨 Store 事务。`LocalHostProjectClient.withScope` 替换旧入口资源作用域：在 wire 转换前打开 Runtime，返回 Client 而非 Runtime，响应完成前不关闭；invoke 仍单独串行，不把 scope callback 放入队列。原同步 adapter factories 保留为有现有测试/消费者的兼容公开接口，不是生产入口的第二条业务实现。

验证：Contracts、Goals Plugin、Local Host、CLI/MCP build、根 TypeScript 与 `git diff --check` 通过；边界 48 包、303 source files、771 imports、65 dependency edges、30 Contract subpaths、0 错误。46 项 MCP/CLI/Host/跨入口回归通过、0 跳过。同步 App handler 测试改为 await 和 assert.rejects，仍检查相同字段、持久化快照及错误代码，未放宽业务断言。迁移中修正了一次机械类型替换漏项；未改业务规则。

新增 `tests/host-entry-consistency.test.ts` 两项通过：在真实 MCP Available 第一部分读取后，把真实新建 Goal 排入同 Host 队列，验证当前 Available 和 projection 都不含新 Goal，下一次查询两者都包含；在真实 trash 写入后排入恢复，验证当前 trash 返回的 work state 仍是 trashed，而最终持久化状态确已 restored。另验证 scope 先 open 再转换、pending response 阻止关闭、响应结束后才关闭、open 错误不执行转换。不是仅比较静态定义或空数组。

`node --import tsx --test tests/v1.test.ts tests/goals-app-adapters.test.ts tests/execution-validation-app-adapters.test.ts tests/host-entry-consistency.test.ts tests/mcp-protocol.test.ts tests/query-presentation.test.ts`：125/125 通过、0 跳过。当前 MCP 539 行、CLI 194 行、兼容 Host composition 294 行（具名注册与原组合，不是新业务 Coordinator）。剩余 initialize/snapshot/import/resume/trash-list/create 的旧 Host capability definitions 需公开收口，再进行 DV1 完整审计/测试；总目标的真实用户前后端 E2E、清理后复验和最初要求审计仍未完成。

## 第十条切片进度（2026-09-05）

已迁：官方 Goals Plugin 的 `proposal-capabilities.ts`（85 行）逐项公开 Draft / Goal Tree / legacy proposal 的原方法 capability，并通过 `createGoalProposalClients` 返回具名异步 client。输入/输出直接取原 application 的 Parameters/ReturnType；`AsyncApplicationMethods` 只表达同一接口的异步返回，不增加操作或任意名称的总线。Host 明确注册到同一个 Coordinator；原 runtime 三组字段已无 caller 并删除。

六个 CLI/MCP handler 接受同步 application 或正式异步 client，返回 promise，真实入口 await 后再输出/记录 Session 活动。历史分页仍先校验再调用写操作。源码核对发现 Draft resume 会保存/恢复 Claim 与 dialogue，Goal Tree check 会保存检查记录，二者均声明为 command；没有按方法名称把写操作误留成 query。

验证：Contracts、Goals Plugin、CLI/MCP build、根 TypeScript、`git diff --check` 通过；边界 48 包、300 source files、752 imports、65 dependency edges、30 Contract subpaths、0 错误。`node --import tsx --test tests/proposal-entry-chain.test.ts tests/mcp.test.ts tests/goal-read-entry.test.ts tests/command-entry-chain.test.ts tests/cli-protocol.test.ts tests/local-host.test.ts`：42/42 通过、0 跳过。

扩展真实提案链测试并通过：同一 Runtime 两个并发相同回答返回一新一重放、同 turn ID，持久化只有一个回答，CLI resume 保留完整历史和原 Run；CLI 检查提案后 MCP 同 key 重放返回原结果，检查记录与完整快照不变；后续确认、Candidate 拒绝、重放和 Host 重启恢复仍全部通过。原 App/Host/Plugin README 和 Local Host 说明已更新；清除了本轮类型文件改名留下的四个旧编译文件，源代码和新编译输出均保留。

当前 MCP 543 行、CLI 195 行。余下明确入口：`withProject` 中的 Goals / Execution application 和 availability；其中 Available+projection、trash+work state、planning composition 需要保留同一逻辑读取/写后状态的一致性，不能只拆成多个异步 invoke。兼容 initialize/snapshot/import/resume/trash-list capability 的最终公开收口与 DV1 整体验收也未完成。下一批按这些实际组合改造，整体真实前后端 E2E、清理后复验、初始要求审计继续保留在总目标中。

## 第九条切片进度（2026-09-05）

已迁：`GoalContractView` 从 root 唯一定义改为官方 Goals Plugin 的公开应用视图，复用 Goals facts 与 Execution/Evidence/Governance 记录。公开 `readGoalContractCapability`、`readProjectGuidanceCapability`、`setActiveGoalCapability` 由 Host 注册到原实现；真实 CLI/MCP 已调用 Client，不再直接读 `coordinator.goalQueries` 或调用 `setActiveGoal`。active-goal 原始输入与 write metadata 分开传递，MCP 旧 payload 的完整幂等语义保留，没有改原 SQL、状态或规则。

MCP App 接管回收站命令转换/结果提示、链接、Runtime 决定参数和 context response 组合；Local Host 仅组合可信宿主确认来源，保留既有 attestation 字段顺序/算法。Private Work Context 唯一声明原 Session read result，Host 继续负责 Registry。context presenter 按原顺序读 guidance→接纳连接→读 Session→读 resume，不新增绑定、自动 Claim 或跨读事务。

验证：Contracts、Goals Plugin、Local Host、CLI、MCP build 与根 TypeScript 通过；边界 48 包、299 source files、742 imports、65 dependency edges、30 Contract subpaths、0 错误。旧边界检查仍要求 root 含 `.goalQueries.`，旧 MCP 测试末尾仍要求入口直接 `.lifecycle.setTrashed`；已改为检查真实公开 Capability→Host→原查询与 public handler→原 lifecycle 的调用链，保留禁止直访，不删除行为断言。首次入口组合 42/43 通过，唯一失败是上述旧静态路径断言；更新后连同新增测试 45/45 通过、0 跳过，context presenter 迁入后再次 45/45 通过。

`tests/goal-read-entry.test.ts` 两项通过：Runtime 确认缺失/类型错误时不调用宿主来源，模型伪造身份被忽略，原 attestation 和链接输出保持；真实 CLI/MCP 检查草稿拒绝且快照不变、active-goal 持久化/重放、旧 MCP payload 变更仍拒绝同 key、完整 Contract 结果仅 URL 不同，重启后全快照一致。测试初次把同一数据库配置成不同 Project，原 Host 正确拒绝；已修正 fixture 为相同 Project，未改生产身份检查。

`node --import tsx --test tests/v1.test.ts tests/query-presentation.test.ts tests/mcp-protocol.test.ts tests/goal-command-wire.test.ts`：122/122 通过、0 跳过。补充的实际 `createMcpContextPresenter` 链验证 guidance 读取失败后缓存为空且不继续读 Session/resume；重试恢复同一绑定，Session unavailable 不吞主连接，读顺序和恢复输出保持，测试通过。最终 TypeScript 与 `git diff --check` 通过。

当前 root MCP 542 行、CLI 194 行、Coordinator 9,003 行。Coordinator 的 active-goal/其他业务实现没有在本切片迁出；CLI/MCP 其余应用组仍通过 `withProject` 取得公开 application，完整 Client 收口与 DV1 最终验收仍待完成。整个架构重组、全部开发后的真实用户前后端 E2E、清理后复验和初始要求逐项审计仍未完成，不能提交整体通过。

权威范围：`goal-reorg-dv1` revision 1、总 spec §24。完成等级为既有命令和工具功能可用、跨入口一致的无损迁移；不是整个项目的发布验收。

## 当前行为与问题

- `apps/cli` / `apps/mcp` 已绑定 Goals 和 Execution Validation 公开 API，但只是部分入口。
- `src/mcp/server.ts`（当前 3,443 行）混合 JSON-RPC、Tool schema/Runtime audience、结果裁剪、宿主身份、Project 连接、Session 活动以及命令路由。
- CLI `src/v1/cli.ts` 和 MCP 仍在入口检查/创建数据库目录；MCP resume / trash cursor 与 legacy import 仍访问 Store。多数命令通过 `withProject` 的兼容 Coordinator 调用，并非完整的公开 Host 能力。
- Local Host 已唯一创建 Store / Coordinator，并提供项目 client 和串行 Capability 调用；DV1 应迁移剩余 caller，不在 App 包复制一套 Store 或业务规则。

## 保留、替换、不做

保留命令名、参数/文件输入、Tool 名称与 schema、Runtime/management 的权限区别、宿主 `_meta` 身份优先级、错误文字/结构、JSON 输出、幂等和原恢复行为。

替换入口中混合的职责：协议/参数/展示放 App，项目连接/初始化/资源生命周期放 Local Host 或既有 Projects/Work owner，业务判断留各 Module 的公开 application。旧入口只保留 executable 启动组合和已列退出条件的兼容调用。

不改模型、不做安装市场、不扩充业务能力、不接管 Draft Dialogue / Goal Tree 语义规则、不修改 goal-advance Skill（DV2）或安装分发（DV4）。当前 root 中仍待独立 Goal 迁移的业务通过 Host 组合访问；不能为了 DV1 把它们塞进 apps/mcp。

## 实施顺序与模块边界

1. MCP 协议完整切片：`apps/mcp` 拥有消息协商、通知、工具列表/调用、资源空列表、未知方法和调用上下文解析；宿主注入实际工具执行、目录与错误格式端口。root `handleMessage` 改为公开适配器调用。先用无 Store 的协议测试和原 MCP 回归对账。
2. MCP Tool schema / audience 投影与 CLI 参数/输出移到相应 App，按职责分文件；真实启动 caller 切换，不只加导出。
3. 固定剩余 Store / Coordinator / Project / Session caller 清单；用现有公开 API 或 Host 能力替换业务和初始化直访。相同动作不允许 CLI/MCP/Workbench 各有一套事实或幂等规则。
4. 对账成功、错误、权限拒绝、重复提交和跨项目；验证同 Host 实例、资源关闭与入口输出。随后删除已清零的旧 facade，更新开发文档和矩阵。

## 第一条切片合同

输入：现有 JSON-RPC message；输出：原 reply 或通知的 null。App 不解析业务数据、不选择 Project、不写 Session、不创建 Runtime。

允许修改 `apps/mcp/src/protocol.ts` / public index、`src/mcp/server.ts` 的协议组合、`tests/mcp-protocol.test.ts` 及相应说明。不改变 tools/call 中模型参数与宿主 `_meta` 的信任边界；错误类型识别仍由宿主注入，避免 App 依赖具体 Module error class。

## 验收与验证

第十二条切片：将 initialize/snapshot/import/resume/trash-list/create 的既有 capability definitions 从 root composition 迁到官方 Goals Plugin 公开入口；原 import ID 保持兼容 re-export，CLI/MCP 改读公开声明与 Legacy V3 input/report。完整 BoardSnapshot 以已有 Execution snapshot 和各事实 Contract 组合，旧 root 类型变为别名；Goal Contract revision/coverage revision 记录移到 Goals Contract 唯一定义，不复制快照/SQL。V3 类型只迁既有字段，导入映射与拒绝覆盖行为不改。root 仅保留实现装配/注册；MCP 错误类型直接引用原轻量 errors 文件，不为取 error class 导入 Coordinator。允许上述类型/公开声明、别名、真实 caller、相关兼容测试和开发文档。此切片不迁 Coordinator 剩余业务、不改数据库或 V3 导入语义，之后仍须 DV1 整体验收。

第十一条切片：Goals 写入、Execution 命令、Ready/Available/Explain 的实际入口使用有限 typed capability 和异步 client，退出 CLI/MCP 的 Coordinator/availability scope。只暴露这些入口已经使用的方法，不增加 Runtime human-review 能力。Available+action projections、trash/restore+work state、planning methods+composition 各由一个具名 Host capability 同步调用原 owner 后返回，保持原顺序及写后状态，MCP 只裁剪/展示；不新增跨 Store 事务或改变业务语义。CLI/MCP 的参数转换仍在 App，异步结果统一 await，Evidence workspace 仍由宿主注入。

为保留原入口在校验 wire 前打开 Runtime、并持有资源直到结果序列化的行为，Host Client 增加 `withScope` 资源生命周期方法：先完成 Runtime open，在 callback 结束前阻止关闭，只传 Client，不暴露 Runtime/Store；具名 invoke 仍独立进入原串行队列，不能把整个 callback 放入队列造成嵌套死锁。这替换旧 `withProject` 资源作用域，不是业务执行总线。允许上述 Contract/Plugin capability/client、Host 注册、App handler/caller、边界检查实际调用链、定向跨入口/并发/关闭与错误顺序测试、开发文档。初始化、完整快照、V3 import 等旧 Host definitions 公开收口仍须后续完成。

第十条切片：将 Draft Dialogue、Goal Tree、legacy proposal 三组已有应用调用切到正式 Host Client。官方 Goals Plugin 按原方法的 Parameters/ReturnType 声明有限、具名的 capability 和类型明确的异步 client；不开放任意 operation 名称或 unknown payload 总线。Host 注册到原 Coordinator 的同一个方法，不复制验证、事务、幂等。CLI/MCP 原 handler 接受同步 application 或其异步 client，并 await 结果；MCP 历史分页仍先校验再写。现有同步领域 API 不改，业务 wire schema、错误、JSON 和持久化行为不改；仅 App 内部 handler 改为异步以匹配 Host Client。允许公开 Contract/typed client、Host 注册/去掉零 caller scope fields、六个 App handler、真实 root caller、相关测试与文档。其他 Goals/Execution/Available 组合不能简单拆成多个异步读写后宣称一致；它们另按真实原子用例收口。

第九切片补充：同一批收拢剩余 context response 展示组合。Private Work Context 声明原有 Session read result，Host 继续拥有读取；MCP presenter 通过公开端口依次生成 URL、读 guidance、接纳连接、读 Session、读 resume 并序列化。保留原失败顺序（guidance/URL 失败不能接纳新连接，Session 不可用仍返回已有主连接）、字段与格式，不增加绑定、自动 Claim 或跨读原子性。

第九条切片：完整 Goal Contract 的跨 owner 结果类型归官方 Goals Plugin，复用 Goals facts 与 Execution/Governance/Evidence 唯一定义；原类型保留别名，不改变查询算法。公开具名 Host capability 提供 Contract、项目说明和 active-goal，真实 CLI/MCP caller 使用 Client 调用原 application。MCP App 拥有链接、回收站命令转换/结果提示、Runtime 决定参数校验；Local Host 只按可信宿主身份组合既有确认来源。保留现有 attestation 算法、错误顺序、确认值转换、顶层 Board 优先以及 active-goal 原始 payload 对幂等的影响，不新增权限或业务规则。允许上述公开 Contract/capability、App helper、Host 注册、原入口替换、定向持久化/跨入口测试和开发文档；其余应用组的 Host Client 收口仍按实际剩余 caller 继续，不把本切片当作 DV1 全部完成。

第八条切片：现有项目连接 request/result 类型移到 Private Work Context 的公开 Contract，Local Host 平台声明有界 catalog application/provider 接口，旧 Catalog 仅保留类型别名。MCP 具名 context handlers 拥有七个既有工具的 wire 转换/列表展示，调用 Host 注入的同一 catalog 生命周期；Local Host 的连接状态对象统一管理 explicit connection、Session identity 连续性、清空和 resolve 后接纳，原 root 属性保留兼容访问。保持 catalog 在异步 response 组合结束前不关闭、失败 bind 不清空旧连接、resolve 先清空旧答案、Session 改变要求只读 resolve 后同 key 重试、解绑/删除的精确清空条件与原错误。Host 身份来自宿主，不开放给模型 args。允许公开类型/平台端口/Host 状态、MCP handlers、旧类型别名/真实 caller、定向跨 Session 与失败恢复验证、开发文档；不改变绑定算法、创建/删除存储规则或权限要求。

同一切片把 Panel alias→legacy reconcile→Session native ID 关联组合移入 Local Host，通过显式 scoped catalog ports 调用原 Desktop/Registry owner；alias 输入类型移到已有 App Host Contract、legacy migration 采用只含原 migrateLegacy 的公开接口。保留 catalog 跨 Registry 操作的生命周期、缺 Panel 错误仅由 root 注入原类型判断，其余错误继续抛出；不新增确认、自动重试或原子性承诺。

第七条切片：迁出 MCP 的 Session 宿主组合。现有宿主身份/工作目录/建议线索类型在 Private Work Context Contract 唯一定义；环境解析与 MCP 宿主组合归 Local Host，Session 查找规则归 Private Work Context。MCP App 只把已成功工具结果转换为原有活动描述，Local Host 调用正式 Registry 完成关联/事件写入、读取和关闭。旧 Session migration 仍通过显式 reconcile 回调连接现有 catalog，不把 catalog Store 搬进 App。保留原身份优先级、深度 4 的结果查找、非成功 select 不记活动、幂等 source_id、Session 与 Project 匹配、次级索引失败不吞主操作结果且下次 resolve 可见。允许上述 Contract/公开导出、兼容别名、MCP/Local Host 对应文件、定向测试和开发文档；Project 创建/删除与绑定策略本身不在本切片改动。

第六条切片：补齐 CLI/MCP 已有 Draft Dialogue、Goal Tree 和 legacy proposal 的公开应用 Contract。Clarification 记录移到 Governance Contract 唯一定义；跨 Goal/Execution/Governance 的调用接口归官方 Goals Native Plugin，原类型保留别名，Host 绑定原 Coordinator 方法。App 只做具名 wire 参数转换和已有历史展示，不复制语义、事务或权限规则；Runtime Goal Tree 的宿主确认来源仍由 root 先核实，再向公开接口传入既有 authority。保持历史参数转换、分页校验先于写入、错误与幂等、用户决定前 canonical 数据不变。允许修改上述 Contract、Host 组合、CLI/MCP handler 与 caller、相关测试及开发文档。最终 Host Client 收口和独立 Draft/Goal Tree 业务实现迁移仍须后续完成，不能以新接口冒充业务已迁完。

第五条切片：官方 Goals Native Plugin 接管既有 Ready / Available / Explain 查询 Contract（只迁移原字段和类型），旧 types/coordinator 保留别名，禁止复制第二份定义。Host 向入口公开三项具名 availability Query，暂时组合原 Coordinator 实现；不迁移/修改选择、依赖、阻塞或并行建议算法。CLI/MCP App 负责其 wire 参数转换；MCP 的方法目录、Available 摘要、澄清历史分页移入 `query-presentation.ts`，保留全量/精简字段、目录 ID、排序、分页游标、错误编码/文字/details 与 JSON 缩进。错误由 root 注入同一 MolisWorkV1Error factory；分页只要求输入 turn_index 并透传原结果字段，不在 App 重新声明 Draft 领域模型。允许修改 native Goals availability-contract/index、原类型别名、Host runtime 组合、两个 App 的 availability handlers、MCP 展示代码和 public index、真实 caller、相应测试与文档。非目标仍为 Draft/Goal Tree 语义、Session 生命周期和新功能。

第四条切片：CLI/MCP 将已有 Goals 与 Execution 公共 API 的 wire-to-command 转换迁入各自 App 的 `goal-commands.ts` / `execution-commands.ts`。每个 factory 返回显式命名、穷尽当前迁移操作的 handler 对象；不提供任意名称的 execute 总线，不把 Coordinator 搬进 App。root switch 只选择对应 handler，业务参数校验、权限、幂等仍由原 application 负责。MCP 顶层 board_id 覆盖嵌套 payload 的行为由 App wire helper 统一保持；Evidence locator_context 仅从宿主注入，并在 Evidence 操作发生时读取，不能被模型覆盖。Runtime audience / impersonation / connection 检查仍先于 handler，risk-state 的 actor_kind 保持由 audience 决定。允许修改四个新文件、MCP payload helper、公开 index、对应 CLI/MCP caller、命令转换和跨入口测试及开发说明；不迁移尚无公开应用端口的 Draft/Goal Tree/Project/Session 业务，不增加命令、重试、二次校验或新的授权规则。

第四切片中已有边界规则仍要求 root 直接含 `goalsAdapter.commands.`，与实际职责迁移冲突；更新 `scripts/check-package-boundaries.mjs` 追踪 root 构造公开 adapter → 新公开 handler factory → 具名 handler 调用 → handler 内正式 `goals.commands`，保留 App 禁止 Module implementation / Store / SQL 的检查。不能通过补一条无效 root 调用或删掉整个 owner 检查让它通过。

第三条切片：CLI App 接管 flag / JSON-file 输入、默认数据库参数、帮助和 JSON / URL 展示；真实 `src/v1/cli.ts` 消费公开函数。Local Host App 的 `prepareLocalProjectStorage` 统一解析路径与准备目录，返回 prepared/missing，由各入口保留原错误类型和文字；检查仍发生在 JSON 读取与 runtime 打开之前。兼容 Host 组合注册类型明确的 V3 import capability，由原 migration owner 实现，CLI/MCP 只传 legacy 数据和目标参数，不再拿 Store 做导入。允许修改 CLI App、Local Host App、`src/local-host/composition.ts`、CLI/MCP 对应 caller、定向测试与说明；不改 V3 映射、不扩展 CLI 命令、不搬安装业务。保持 `--json` 优先于 `--file`、重复 flag 首项优先、help 不碰存储、缺库和无效 JSON 的错误顺序，以及注入 Host 不被入口关闭。

同一切片继续清除 MCP 余下两个 Store 读 caller：Host 的具名 typed Query 组合一次 snapshot 和正式 action projections，MCP App 只对返回的 Goal 摘要 / projection 做原有恢复展示排序，不能领取 Goal；回收站 Query 在同一同步 handler 中返回 Goals Query 的列表和原事件 cursor。允许增加 `apps/mcp/src/resume-view.ts` 与公开导出；保持 host focus → session focus → 原恢复排序、排除 trashed fallback、next_goals 限制和 auto_claimed=false。这不迁移 Session 生命周期业务，也不新增恢复规则。

第二条切片：`apps/mcp/src/tool-schemas.ts` 管共享 wire schema 与 payload 包装，`goal-tools.ts` / `context-tools.ts` 管 Goal 工具与连接工具定义，`tool-catalog.ts` 管完整目录和 Runtime 投影。这些仅定义 MCP 输入展示，不实现业务校验或授权。public index 暴露目录及工具分类函数；root 的工具发现和调用分流消费同一个公开目录，原 root 导出保留兼容。允许修改上述文件、root catalog/分类 caller、MCP 测试和对应开发文档。迁移前后完整目录（含顺序、描述和嵌套 schema）直接对比，不生成长期重复 schema 快照；实际权限拒绝仍用生产 MCP 测试验证。

- `dv1-boundary`：App 无 Store、SQL、deep import、第二套业务判断；Module/Local Host 拥有正式事实与生命周期。
- `dv1-legacy-exit`：MCP/CLI 的 Store 访问和重复初始化清零；其余旧 facade 有清晰去向，不能以协议迁移代替整体 DV1 完成。
- `dv1-result`：命令/Tool schema/错误、幂等、跨入口一致性、关闭/恢复通过现有与补充测试。
- 命令：受影响 App build、根 TypeScript 检查、`tests/mcp-protocol.test.ts` / `tests/mcp.test.ts` / CLI 与 Local Host 相关测试、`pnpm boundary:check`、最终全量自动回归。整体真实用户 E2E 依总 spec §24 在全部开发后统一执行。

开放问题由实际 caller 触发后处理；已有公开 API 不足时先补其 owner 合同，不用任意 `execute(string, unknown)` 通道掩盖缺失的业务边界。

## 首条切片进度（2026-09-05）

已迁：`apps/mcp/src/protocol.ts` 接管实际 `handleMessage` 调用与 `_meta` 解析，root 只注入 audience-filtered tools、授权执行方法及错误 formatter。没有 Store / Runtime 初始化，不读取模型参数作为宿主身份，也不增加重试。

验证：MCP App build、根 TypeScript 通过；`tests/mcp-protocol.test.ts` 与原 `tests/mcp.test.ts` 合计 35/35 通过。测试核对握手版本/消息 ID、通知无响应、工具/资源发现不执行业务、精确 args 与 `_meta` 优先级、错误只返回一次，以及原真实 Goal/Project/Session/权限/幂等流程。

尚未完成：Tool schema/audience catalog、CLI 参数/输出、所有 Store 与重复初始化 caller 清理、跨入口 Host 一致性和最终完整回归。这是 DV1 的首条协议切片，不提交 DV1 完成。

## 第二条切片进度（2026-09-05）

已迁：完整 Tool schema、Goal / Context 工具声明和 Runtime 投影归 `apps/mcp`。真实 server 的 `tools/list` 与 `callTool` 分类消费同一 public entrypoint；旧 server 的 TOOLS / RUNTIME_TOOLS / SERVER_INFO 导出保留兼容。没有新增依赖、业务校验或授权来源。旧文件从 3,353 行降至 1,660 行，但剩余类职责并未据此宣称完成。

验证通过：

- 迁移前通过生产 server 导出捕获完整 catalog，迁移后直接比较全部 JSON：管理端 57 个、Runtime 44 个定义与 SERVER_INFO 一致，包含顺序、文字、required、嵌套 schema 和 audience 差异；基线只用于本次内存对账，没有另存重复 schema 或 digest。
- `pnpm --filter @molis-ai/molis-work-app-mcp build`、`pnpm exec tsc --noEmit -p tsconfig.json` 通过。
- `node --import tsx --test tests/mcp-protocol.test.ts tests/mcp.test.ts`：35/35 通过、0 跳过；实际 Runtime 直接调用隐藏管理工具仍被拒绝，原 Project / Session / 用户确认与 Goal 操作回归保持通过。使用 Node 的 tsx loader 避免沙箱中 tsx CLI 临时 IPC 权限限制，不改变测试内容。
- `pnpm boundary:check`：48 包、264 source files、65 dependency edges，0 错误；`git diff --check` 通过。

剩余范围：CLI 参数/输出、Project / Session 宿主组合、Store / 重复初始化 caller、跨入口 Host 一致性与 DV1 最终完整回归。第二切片只覆盖协议目录归属及兼容性，DV1 三项标准仍不提交整体通过。

## 第三条切片进度（2026-09-05）

已完成的职责迁移：

- CLI App 拥有真实 V1 flag、JSON/file 输入、帮助、JSON 和 Goal URL 展示；root 保留 command dispatch 和宿主组合，不再导入 fs/path。
- CLI/MCP 的路径解析、父目录准备和存在性检查调用 Local Host 公开 `prepareLocalProjectStorage`，入口保留原错误类型/文字与检查顺序。
- V3 import 调用 Host 的具名 typed capability，原 migration 映射未改；CLI 不再接收 Store。MCP 恢复事实与回收站列表/cursor 同样改走具名 Query，root Store 直访清零。
- MCP App 的 `buildMcpResumeView` 只处理已生成 projection 的展示排序，保留宿主/Session focus、回收站排除、五条建议和不自动 Claim。Host 在一次同步 handler 内取 snapshot 并调用原 execution-validation query，避免拆成两个异步读取而混用状态。

验证结果：

- CLI、MCP、Local Host App build 与根 TypeScript：通过。迁移中发现一条遗留未用 type import，已删除并重新通过。
- `node --import tsx --test tests/mcp-resume-view.test.ts tests/cli-protocol.test.ts tests/local-host.test.ts tests/mcp-protocol.test.ts tests/mcp.test.ts`：43/43，通过，0 跳过。新测试验证真实 CLI 文件输入、错误顺序、目录副作用、注入 Host 生命周期、V3 持久化映射、MCP 拒绝覆盖后完整快照不变与重启恢复；恢复展示核对独立预期顺序和原始 projection 不被修改。
- `node --import tsx --test --test-name-pattern='public CLI|CLI and MCP|revalidat|V3' tests/v1.test.ts`：所选 5 项通过。
- `pnpm boundary:check`：48 包、267 source files、65 dependency edges，0 错误；`git diff --check` 通过。

当前 MCP 1,598 行、V1 CLI 350 行；仍未退出的明确职责是命令 dispatch、Project/Session 宿主组合、部分结果裁剪和兼容 Coordinator 调用。兼容 Host capability definitions 仍在 root composition，完整公开入口收口也未完成。这些不能靠行数下降或当前测试通过宣称消失。接下来沿现有模块公开应用 API 迁移调用，不引入任意字符串 execute 总线。

DV1 仍进行中；最终全量回归、全部开发后的真实前后端用户 E2E、清理后复验和初始要求逐项审计尚未执行，不提交整体完成。

## 第四条切片进度（2026-09-05）

已迁：CLI 的 Goals / Execution 命令转换和 MCP 对应具名工具转换归各 App。四个 handler 文件分别 34/23/63/40 行，仅依赖公开 Contract / Goals Native Plugin application API；root switch 选择声明的 handler，不包含任意名称的 execute 路由。MCP Evidence workspace 仍在请求真正执行时由宿主提供，顶层 board_id 覆盖嵌套 payload；Risk actor_kind 仍由 audience 决定。原 Runtime user-impersonation 和连接拒绝在 handler 之前执行。

验证通过：

- CLI / MCP App build、根 TypeScript 通过。
- `node --import tsx --test tests/v1.test.ts tests/command-entry-chain.test.ts tests/goal-command-wire.test.ts tests/cli-protocol.test.ts tests/local-host.test.ts tests/mcp-protocol.test.ts tests/mcp-resume-view.test.ts tests/mcp.test.ts tests/goals-app-adapters.test.ts tests/execution-validation-app-adapters.test.ts`：163/163 通过，0 跳过，含完整 `v1.test.ts`，不是全仓最终测试。
- 新的真实 CLI/MCP 链最终达到 Goal satisfied、Claims 释放、Runs completed、单条 Evidence 和单条 Review；错误 actor 报告前后完整快照一致，重放 Evidence 返回同一记录/游标，伪造 nested Board 和 locator_context 不影响宿主选择。
- 新的 Goals wire 测试通过实际应用与持久化验证 CLI actor 字符串转换、MCP 顶层 Board 优先、Impact 幂等和 Risk audience：Runtime 即使 payload 声明 user 也不能接受残余风险，拒绝后快照不变；management 保留既有用户处理行为。
- 边界检查初次提示 root 不再含直接 `.commands`，已按新调用链更新检查：root 公开 adapter → public handler factory → 声明 handler → 正式 Command，并对 handler 继续禁止具体 Module、Store、SQL。更新后 `pnpm boundary:check` 为 48 包、272 source files、65 dependency edges，0 错误；`git diff --check` 通过。

当前 root MCP 1,480 行、V1 CLI 266 行。未完成：旧查询及部分结果裁剪、Draft / Goal Tree 与 legacy proposal 调用、Project / Session 宿主组合、兼容 Host definitions 的公开收口和完整 DV1 验收。新增测试证明当前已迁调用，不代表全部前后端 E2E或整个架构重组完成。

## 第五条切片进度（2026-09-05）

已迁：

- `plugins/native/goals/src/availability-contract.ts` 是既有 Ready/Available/Explain 请求、结果与子项类型的唯一声明位置；原 root definitions 替换为类型别名。没有新增 Query 算法、状态或数据表。
- Host 的兼容 runtime 提供类型明确的 `availability`，绑定同一个 Coordinator；CLI/MCP App 的具名 Query handlers 消费该公开接口，入口不再直调 queryReady/queryAvailable/explainGoal。仍使用 `withProject`，不是最终 Host Client 收口。
- `apps/mcp/src/query-presentation.ts` 接管方法目录 ID/摘要/正文、Available 全量与摘要、澄清历史分页；沿用原字段、顺序和数值转换。只读透传 Draft 其余字段，不复制领域类型。root 注入原 MolisWorkV1Error factory，错误 class/code/details 不变。

验证：native Goals / CLI / MCP build、根 TypeScript 通过；第四切片列出的完整 V1 与受影响入口组合再次 163/163 通过、0 跳过。`node --import tsx --test tests/query-presentation.test.ts` 两项通过：默认摘要不带历史 turns、保留最新 checkpoint，游标逐页返回原 turn 全部字段，排序不修改原输入；分页参数错误保持原类型、编码、details 及既有数字字符串转换。随后公开返回类型改为推导的分页结构，重新 build/TypeScript 和两项定向测试通过；没有运行时代码语义变化。

`pnpm boundary:check`：48 包、276 source files、65 dependency edges，0 错误；`git diff --check` 通过。当前 root MCP 1,246 行、CLI 240 行；Coordinator 9,087 行是当前测量值，DV1 此处只迁 Query 类型/入口，不能宣称它的查询算法已退出。

尚未完成：Contract URL/回收站结果展示、Draft/Goal Tree 与 legacy proposal 应用调用、Project/Session 宿主组合、兼容 Host public Client 收口、DV1 最终全量验证。整体开发后的真实前后端 E2E、代码清理后复验及初始要求审计仍保留在总 Goal 中。

## 第六条切片进度（2026-09-05）

已迁：Draft Dialogue、Goal Tree、legacy proposal 三组公开应用 Contract 归官方 Goals Plugin；Clarification 记录移到 Governance 的唯一定义，旧 root 类型为别名。Host 对每项具名方法绑定同一个原 Coordinator，CLI/MCP 的六个 handler 文件只转换既有输入/结果。真实入口不再直接调用这三组 Coordinator 方法。Runtime Goal Tree 的确认、宿主来源与 attestation 保持在调用前；MCP 历史分页仍先验证再写入，legacy 顶层 Board 保持优先。

验证：Contracts、Goals Plugin、CLI/MCP build 与根 TypeScript 通过；`pnpm boundary:check` 为 48 包、285 source files、65 dependency edges、0 错误。`node --import tsx --test tests/v1.test.ts tests/mcp.test.ts tests/cli-protocol.test.ts tests/command-entry-chain.test.ts tests/query-presentation.test.ts tests/local-host.test.ts` 157/157 通过，0 跳过。

新增 `tests/proposal-entry-chain.test.ts` 通过真实 CLI 和 Runtime MCP、共用 Host，再重启读取完整快照：CLI 开始草稿 → MCP 错误分页无写入/正确回答 → CLI 同 key 重放无重复并恢复完整历史/原 Run → CLI 提案在确认前不建 Goal → Runtime 伪造 authority 被拒且快照不变 → CLI 明确确认 Goal 和独立 relation 后物化 → MCP Candidate 顶层 Board 优先、CLI 拒绝后重放不改变已拒绝事实 → 重启后快照一致。编写测试时修正了错误的 callTool 返回值假设、缺少的显式 relation 和不完整 Candidate fixture；没有改生产语义或放宽断言来让测试通过。

当前 root MCP 1,220 行、CLI 193 行、Coordinator 9,003 行。此处 Coordinator 的变化只是迁出类型定义，不是 Draft/Goal Tree 业务完成迁移。仍须处理 Contract/回收站展示、active-goal 兼容调用、Runtime 决定来源、Project/Session 宿主组合与公开 Host Client 收口，再完成 DV1 整体验收。整体前后端真实用户 E2E、清理后复验和初始要求审计仍未执行，总 Goal 保持进行中。

## 第七条切片进度（2026-09-05）

已迁：

- Runtime/workspace/建议线索与 Host Signals 只在 Private Work Context Contract 定义；旧 Project/Session 类型和环境入口保留兼容别名。
- Local Host `runtime-context.ts` 接管原环境解析、MCP 宿主字段和 Signals 组合；Private Work Context `findSessionForHostSignals` 通过公开 Query 保持原身份优先级/冲突规则。旧 `src/sessions/compatibility.ts` 52 行，仅组合 legacy catalog→Registry migration。
- MCP `session-activity.ts` 负责已成功操作的活动描述，Local Host `RuntimeSessionHost`（80 行）负责 Registry 打开/关闭、显式注入的旧 catalog reconcile、Project/Session 匹配和既有关联/事件命令。它不拥有另一套存储或事务规则。次级写入错误保存在 Host，仍不改变主 Goal 返回结果，下次 context read 可见。

验证：Contracts、Private Work Context、Local Host、MCP build 和根 TypeScript 通过。`pnpm boundary:check`：48 包、289 source files、65 dependency edges、0 错误。`node --import tsx --test tests/mcp.test.ts tests/mcp-protocol.test.ts tests/session-migration.test.ts tests/session-registry.test.ts tests/session-adapters.test.ts tests/session-project-actions.test.ts tests/proposal-entry-chain.test.ts tests/command-entry-chain.test.ts` 50/50 通过、0 跳过。

新增 `tests/mcp-session-activity.test.ts` 两项通过：独立预期验证 wire 查找/字段优先级、深度上限、失败 select 与无关工具不记活动；真实 MCP 选择 Goal 和重放后只写一条活动，其他 Session 不变，临时把 Session home 指向普通文件制造真实存储故障后，主 Run 报告仍成功并持久化 completed。恢复 home 后 context 显示 Session unavailable，旧活动和关联保持，失败操作不伪造活动。最终 TypeScript 与 diff whitespace 检查通过。

当前 MCP 967 行、Project Catalog 1,857 行。边界工具报 legacyHugeFiles 从 7 到 6 只是越过行数阈值；未退出职责仍明确保留：Contract/回收站展示、active-goal、Runtime 确认来源、Project 连接/Panel alias 组合、Host Client 收口和最终 DV1 验收。整体前后端真实用户 E2E、清理后复验和最初架构要求审计仍未完成。

## 第八条切片进度（2026-09-05）

已迁：Private Work Context public Contract 唯一声明项目 context 输入/输出；平台 App Host 声明宿主配置、公开 catalog application/provider、连接缓存端口及 Panel alias 输入/组合端口，旧路径均保留别名。MCP 的七个具名 context handlers 处理原 wire 转换、列表展示和原清空触发点；Local Host 的 `RuntimeProjectConnection`（45 行）拥有原 connection/context-key/refresh-key，旧 MCP 公共属性通过 getter/setter 保留。`createRuntimePanelSessionLinker`（36 行）通过同一个 scoped catalog，依次调用原 alias、reconcile、Session native-link 并关闭 Registry；仅忽略宿主认定的原 missing-Panel 错误。

验证：Contracts、Local Host、MCP、Desktop build、根 TypeScript 和边界检查通过；最新边界 48 包、294 source files、65 dependency edges、0 错误。项目工具迁移后 MCP/Project/Session/跨入口相关回归先 60/60 通过。Panel 组合迁移后执行：

`node --import tsx --test tests/mcp.test.ts tests/desktop-tui.test.ts tests/session-migration.test.ts tests/mcp-session-activity.test.ts tests/project-catalog.test.ts`

初次 75/87 通过，其余 12 项全部在监听 127.0.0.1 时被沙箱 EPERM 拒绝，未到功能断言。经权限审批后仅补跑对应 Desktop/TUI test-name-pattern；筛选还命中一项 launch recipe，共 13/13 通过，覆盖原来全部 12 项失败。未改生产代码、放宽断言或绕过 token/PTY 规则。该结果是程序化回归，不是总目标要求的最终真实用户前后端 E2E。

`tests/runtime-context-entry.test.ts` 新测试通过：真实 catalog binding 配合新公开 handler/cache，字符串 user_confirmed 被原权限错误拒绝，旧连接和绑定记录保持；resolve 立即清空旧缓存，在异步 response pending 期间 catalog 仍可读，response 抛错后 catalog 已关闭、缓存未误接纳、绑定不变；再次 resolve 恢复原 Project，无重复绑定。模型传入的伪造 runtime_context 不影响宿主 Session。初次测试误用中文片段匹配权限错误，已改为精确检查原错误 class/code，未改生产错误文字。TypeScript 与 `git diff --check` 通过。

当前 MCP 770 行、Catalog 1,796 行。仍有 Contract/回收站/上下文展示组合、active-goal、Runtime 用户确认来源、完整 Host Client/Capability 收口、DV1 最终验收。总目标的整体开发、真实用户 E2E、清理后复验及初始要求逐项审计仍未完成。
