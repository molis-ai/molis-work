# Alchemist Runtime 迁移计划（只读评估）

状态：Plan 已完成，尚未实施。负责人：主 Session 统筹；本文件由 Images Runtime 子代理只读核对。基线为 `wt-alchemist-runtime` / `feature/w5-01-alchemist-runtime`，创建于集成提交 `8e0152907`。2026-10-18。未安装、构建、运行模型、启动浏览器或改仓库源码。

## 结论和已决边界

**Alchemist 应迁到一个 Home Runtime 实例，但现有端口不足以原样接上它的持久工作室。** 不应因它依赖较多而宣布为构建期例外，也不能把 Host 类原封不动塞到插件工厂、继续持有 Home 路径和密钥适配器后称作迁移完成。

依据：防腐 spec 的 2026-10-07「插件平台范围」决定只批准 Goals、Artifacts、Sessions、插件创作台四个构建期例外；`docs/system/RUNTIME-MIGRATION.md` §2.2 与 §5.3 明确 Alchemist 是 Home 级、最后迁，有每项目工作室库。`roadmap-2026-10-07.md` W5-01 的 “per the core-plugin decision” 不能解释成 Alchemist 也获例外。当前 Manifest 为 native、目录 personal=true，没有 always_on；不改变它的产品地位、入口或按项目显示规则。`personal` 不是把每个项目的研究数据合并为一份。

保留：方向→讨论/炼化→Idea→市场与成本双 Lens 研究→决定/方法校准；既有对象 ID、版本、事件与检查点；已有工作室和搜索数据路径；个人 Taste/方法在当前工作室中的实际归属；不完整证据、未知费用、结果未知的原语义；原模型提示词与格式修正预算；UI 内容、导航、模型选择与 GitHub 账号显式选择；无模型时本人页面可提交并得到明确状态，而 Agent/MCP/工作流不可调用需要模型的动作。

替换：构建期 provider/页面装配、`/api/alchemist/studio/api/*` 特例、按插件命名的 Host 模型/搜索/账号业务适配、进程模块级 studios 表与裸路径打开连接；改为 Runtime 生命周期、统一动作/路由、可信有限服务、同一数据库主人。现有 worker 的业务队列/检查点不因迁移被另一套通用作业表复制。

不扩入：重写研究方法、升级真实模型、接入额外厂商、把单次推理改 Agent、完成尚未接线的固定成果发布、合并研究数据库、增加兼容读取或自动迁移、重新设计 UI。WorkReuse 的生产固定成果端口目前未接线，迁移继续如实不可用，不能拿 fixture 证明可用。

## 当前调用链与事实主人

| 边界 | 当前实现与行为 | 迁移影响 |
|---|---|---|
| Host 装配 | `apps/local-host/src/project-host.ts` 213–214 创建 `AlchemistHostService` 并在 Home actionRegistry 注册；406 关闭 | 换成 catalog 的 Home runtime 条目、Definition.start/stop，删手写注册。 |
| 产品目录 | `apps/workbench/src/builtin-plugins.ts` 358 起绑定 personal、instructions、构建期 contribution/style/client/searchRow | 保留目录/指令/样式/客户端，仅舞台由 Runtime contribution 供给；避免指令目录与 Definition 双注册。 |
| Web | `web-request.ts` 把可信项目与本地动作客户端交给 personal 路由；`alchemist-native-plugin-http.ts` 桥接 Hono `createAlchemistHttpApp` | Manifest 要声明真实路由，项目入口走现成 `/projects/<id>/api/plugins/<full-id>/…`；不能新增一层业务 HTTP server。 |
| 公共动作 | `plugins/native/alchemist/src/studio/shared/contracts/actions.ts` 单份 Zod/schema，`action-operations.ts` 分派，`actionsFor(actor)` 注入可信 actor；仅两个 pulse.github 选择动作是 Home scope，研究等是 project scope | 保留公共动作及对象语义。借 Runtime services 时增补实际权限/并发声明，改合同需统一快照及调用方说明，不靠更换 provider 放宽授权。 |
| 业务库 | `local-runtime.ts` 打开 better-sqlite3，创建多种 repository、seed identity/settings、恢复任务；`db/schema.ts` baseline v1 | 实际文件是 `{home}/alchemist/projects/<encoded-id>/studio.sqlite`。**未看到代码创建 `{home}/alchemist/alchemist.db`**，旧迁移表的概括不能当实现。 |
| 搜索材料 | Host `alchemist-search.ts` 打开同目录 `search.sqlite` v1、`search-content/`，经 `createSearchEvidenceRuntime` 的 AnySearch executeExact 得到材料，读取保留正文并选 excerpt | 搜索缓存与加密材料当前归 Host 搜索服务；不能让插件直接接触 SecretStore、db handle、路径或把 `materials.readSource` 当联网搜索替代。 |
| 工作室生命周期 | `alchemist-service-host.ts` 进程级 shared map＋owners；惰性打开，10 分钟无前台操作/排队运行任务后关闭；关闭期间新请求明确拒绝 | Home Runtime 保留单实例下按项目惰性工作室与 idle 回收；删多 Host owners 适配前核对测试嵌入入口，不能关闭还在执行的工作室。 |
| 持久 worker | `local-runtime.ts` 250ms drain；`SqliteJobRunner` 30s lease/续租、事件同事务；`LocalWorker` 用 SDK lifetime、withLease、checkpoint 与 stop | 是持久业务队列，不是 Scheduler 排期。不能用 Schedule 提醒代替，也不能仅用一个 setInterval 获得新 Runtime 授权。 |
| 删除 | Host deletion owner 离线 rm 项目目录；活服务 hook 先 evict/await runtime.close 与 search.shutdown，再 rm | 必须保持“停写/关闭库→清目录→收据”。现有 Runtime onProjectDeleted 仅同步取消，不提供 await 排空/close 的完成证明。 |

`ALCHEMIST_HOME_STORE` 目前只声明整个 `alchemist` 目录，登记为 Host owner；不能直接拿 `store_name: "alchemist"` 向现有 PluginDatabase 请求访问，owner 检查会拒绝。registry 归属切换需和新窄服务/项目删除能力同片完成，不删除门禁来放行。

## 公共能力复用与真实缺口

### 已足够的部分

- Runtime Home 监督器、Home 路由可信项目、统一动作目录、MCP、启停/升级、声明式舞台、项目可用性均已有。无需第二套 catalog、HTTP 协议或提供方名单。
- `services.model.complete` 已支持具体 provider/model 选择、登记指令、JSON 解码、usage、信号、180s/4096 tokens 所需上限。Alchemist 的领域 JSON 校验和一次格式修正仍在插件。`AlchemistAiPort.generate` 的包装提示可留插件，并用已有注册指令，不改提示语义。
- `services.background` 可保留**本进程已经受理动作**的授权，在 HTTP 结束后继续运行；不能保存临时 caller.beforeEffect。
- Plugin SDK lifetime 可继续作为取消、超时和监测原语。HTTP 二进制下载、NDJSON 有界进度亦已有，但既有 Hono route/事件读取必须逐条映射，不能默认所有输出都是同一种流。

### 必须先补或明确设计的部分

1. **按可信项目选择的多库存储与关闭。** 现有 PluginDatabase 只有固定 `store_name`，Home entry 打开一个库；files 也只有固定目录。Alchemist 需要同一 Home activation 对多个现有项目 studio 文件惰性打开、独立关闭，并保持原路径。不能改成每项目 Runtime（违反已决作用域），不能把项目 id 当业务输入借任意路径。先做窄的“本安装声明的项目库”服务：目录/filename/baseline来自可信 Host entry，项目来自当前可信 action 或保留后台 authority，close/delete fence 必须受 Host 生命周期控制。这里只需要 studio 数据访问，不一并发放 search.sqlite 给插件。
   同时，现有 repository 深度使用同步 better-sqlite3 的 prepare/transaction/immediate；当前 PluginDatabase 是异步 beforeEffect 后同步 transaction。不能 TypeScript 强转成 better-sqlite3。迁移必须把外层写事务变成等待授权的提交边界，内部同一事务读写经窄 SQL port，并保留 jobs+events 原子性。这是实际代码工作量，不是一个工厂适配。

2. **持久任务重新进入授权动作。** 当前 `recoverExpired()` 把 running→interrupted→queued，worker 可在下次 tick 继续。jobs 中保存 actorId，但未保存原安装世代或可重新核验的调用授权；续租只证明 worker 拥有 SQL lease，不证明原调用者仍可运行模型/来源。新 `model.complete` 必须处于本安装的并发动作中，裸 LocalWorker 回调没有这种上下文；`services.background` 不提供重启后的持久授权。必须先规定重启/重新启用时如何合法接续：原业务 queue/checkpoint 保持主人，Host 负责重建并核验安装世代、项目、调用者与当前权限，失效时不派出、不补失败业务记录、不借新安装补旧权。未知外部调用继续按照原 checkpoint 的核对/停止语义，不自动重发模型。不得构造 `actor-local` 的假动作来绕过这项检查。
   同一片还要核对三个 start 的声明：explorations.start、research.start 目前不是 concurrent 且仅 alchemist:generate；pulse.start 有 alchemist:collect，未声明 background_job。接 services.background/model 时需要按实际行为补齐并发、后台查询元数据与 model:invoke。它们不是纯 metadata rename。

3. **模型目录只读投影。** `model.availability` 只返回所选/默认是否可用；configuration.read 是指定 Home consumer 的配置动作，不能直接套到 Alchemist 按项目保存的模型与预算。当前 `runtime.models/settings/verify` 以及研究 workspace 要列出全部可选模型，使用 encodeURIComponent(provider)/encodeURIComponent(model) 的现行 opaque id。先扩窄 metadata model catalog（或确认现行公共动作可复用），只暴露名称/id/可用性，不给 endpoint/key；模型选择仍保存在 studio 原设置，不能迁成一个 Home 全局偏好文件导致项目设置互相覆盖。生成使用解析出的 exact selection，失效不回退。不得为“配置读”授予无关连接写权限。

4. **搜索证据与账号来源。** 当前 `services.materials` 仅已授权字节提取/公开URL读取，缺 AnySearch query→可引用正文材料。当前 `search.query` 是项目对象检索，不是互联网搜索。Connector management actions 提供账号查询/控制，但不是 `alchemist/pulse-github` 绑定与固定 GitHub API 签名请求。应以现有 Search Evidence Runtime、Connector owner 为唯一实现，补有限、具授权/取消的查询材料接口与声明式账号绑定/请求接口；先明确输入、输出、预算、origin与拒绝测试，再接插件。不要新造第二份搜索协议/通用任意fetch。保持 pulse 已定的行为：仅绑定的 token/OAuth，CLI不支持；无可用绑定时允许匿名；不会自动换另一个账号。Images 的“失效不匿名”不能直接套用到 Pulse。

5. **删除时的异步排空。** 当前 Home `onProjectDeleted` 只同步通知取消，而 Alchemist 原删除必须等待 worker 和 search关闭。需要同一 trusted deletion owner 的受控异步关闭流程，关闭后再调用离线清理。它是存储前置的验收条件，不是另建事件总线/锁系统。插件停用/卸载后也须能清原目录；重复清理幂等，清理失败保留收据重试。

## 第一片最小完整范围

推荐先做 **ALC-P1：现有工作室的可信项目库与生命周期端口**，不提前切生产 catalog，也不把部分迁移称 W5-01 完成。

- 输入：已决 Home 实例；现有 baseline v1、编码路径、项目删除收据；当前 trusted action/installation lifecycle。
- 交付：合同中的窄项目库读/事务服务及可信 entry 声明；Host 生命周期实现；Alchemist local-runtime/repository 在一个真实工作室 CRUD 路径中用该端口；关闭/删除覆盖到真实文件与后续同 id 重开。现有 production Host 仍可注入同一owner端口，第一片不改变 UI 路径/模型/队列语义。新服务不能发 raw path、raw db 或 secret。
- 不做：生产全部动作切 Runtime、持久任务跨重启授权、模型目录与搜索连接端口。这些是后续必要片，明确没有完成，不能靠 P1 通过就删旧 Host 服务。
- 文件边界：contracts/plugin-database（或明确独立项目库subcontract）、plugin-runtime 生命周期/权限gateway、local-host 通用项目库service与entry验证；Alchemist `db/open-database.ts`、`db/schema.ts`、受影响 repository/`bootstrap/local-runtime.ts`；registry及删除集成由主 Agent串行。不在功能片改门禁阈值。
- 验收编号建议（写正式 accepted spec 时沿防腐编号）：ALC-P1-01 同项目旧v1库原数据/ID不变，A/B隔离；ALC-P1-02 body/query/伪control不能指定项目或路径，非owner/错baseline/停用拒绝且无新文件；ALC-P1-03 await授权后撤权或删除，事务及晚到checkpoint无写入；ALC-P1-04 jobs+events同事务失败回滚；ALC-P1-05 idle关闭、关闭中拒绝、后续再开与删除同id空库均真实验证；ALC-P1-06 stopped实例仍可离线清理，失败收据可重试。

P1 后次序：持久worker授权/恢复合同 → 模型目录和搜索/绑定有限服务（可按清晰文件边界拆）→ 整个 Alchemist Home Runtime、HTTP/UI/client/manifest 一次切换 → 删除旧Host文件及例外名单。不能先只迁读动作，把写动作留另一个provider，让同一插件两份生命周期长期并存。

## 需要主 Session 裁决的事项

无需再问：是否 Home Runtime、是否保留原数据路径、是否改提示词、是否把 Alchemist列例外，现有决定已给答案。

需要在实施前明确的一项产品/授权行为：**旧持久 queued/running任务没有 Runtime installation generation 与可重建授权，首次切换后怎样处理？** 推荐保留所有对象/检查点、未知结果不重发，由新的本人显式“继续/核对”请求提供当前授权；正常新任务在同一activation内继续保留原请求授权。若要求旧任务无感自动接续，则必须定义可信旧任务归属的离线维护与核验方案，不能迁移代码自行假定所有旧actor-local任务归当前人且当前安装可补权。原 schema 或数据需要改动时，按仓库现行 baseline拒绝/维护规则处理，不新增读取兼容或开库自动迁移。这个决定影响用户可见恢复行为和权限，确实需要确认；不影响先做P1与read-only契约设计。

固定成果生产发布缺口不是当前迁移前置，也不需要为了本轮再问用户；继续显式不可用。若发现更晚的用户决定把Alchemist列例外，再回该事实源更新计划；本次已读材料未找到该决定。

## 验证与交接

本报告仅源代码证据，不代表工程/产品通过。实施前先有accepted spec并核对scoped diff。构建与Chrome由主Agent排独占时段。

P1定向：`node scripts/run-tests.mjs tests/alchemist-host.test.ts tests/alchemist-host-lifecycle.test.ts tests/alchemist-studio-idle.test.ts tests/project-deletion-studios.test.ts`，并新增窄服务拒绝/交错真实测试；涉及共享核心按既定统一集成全量，不由子代理重复跑。

完整迁移README门槛：`node scripts/run-tests.mjs tests/alchemist-actions.test.ts tests/alchemist-host.test.ts tests/alchemist-host-lifecycle.test.ts tests/alchemist-studio-idle.test.ts tests/alchemist-runtime.test.ts tests/alchemist-mcp.test.ts tests/project-deletion-studios.test.ts tests/alchemist-pulse-github.test.ts tests/model-unavailable-declarations.test.ts tests/network-notices.test.ts`；另保留 `alchemist-worker-process` 与 `alchemist-structured-output` 的持久重启/JSON语义，包内 `pnpm --filter @molis-ai/molis-work-plugin-alchemist test`。

UI真实路径：`tests/alchemist-workbench.e2e.test.ts`、`tests/alchemist-client-boundaries.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`；至少无模型→配置→保留本人消息/启动研究→进度→取消/停用→刷新/重启→项目删除。受控厂商证明真实传输与授权，不等于研究质量或付费账号验收。

统一构建后执行 API/动作快照更新、boundary、test-imports、health --base、page-assets；源码与资源只许下降的门禁不能靠改预算通过。扫描旧 `/api/alchemist` 消费者并同步测试/客户端/文档；移除只应由本迁移删除的 Host 文件及冻结名单行。`docs/system/RUNTIME-MIGRATION.md` 的旧数量与alchemist.db描述应由主Agent在正式迁移时一起修正。
