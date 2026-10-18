# ALC-P1：工作室存储与关闭责任的精确切片

状态：只读 Plan，未实施、未安装、未构建、未跑 Chrome。2026-10-18；基线 `wt-alchemist-runtime` / `8e0152907`。本文件细化并修正 `alchemist-runtime-plan.md` 的第一片建议；不改变旧 queued/running 恢复语义。

## 结论：应把两个工作分开

“现有 Host 也注入同一 owner 端口”对**连接归属与关闭**可行；如果指立刻注入现行 `PluginDatabase`，则不是一个小适配。它需要调整整条事务调用链，不能在工厂里强转类型，也不能把异步 transaction 伪装成同步。

建议首片改为 **ALC-P1a：Host 拥有 studio 连接、业务 runtime 借用窄同步 SQL 接口**。这是当前构建期 Alchemist 的依赖/生命周期重构，不宣称已经接通 Runtime 数据库服务，不新增 `PluginHostServices`，不增加第二种长期公共数据库协议。其后 P1b 才把调用者写边界迁到 `PluginDatabase.transaction(beforeEffect, tx)`；完成后删除临时同步借用接口，不留两种输入自动选择的兼容构造器。

首片不切 catalog、不增 Runtime 入口、不改任务 schema/claim/recover/retry/model 调用方式。它解决实际问题：插件不再决定路径、开库、baseline或关闭连接；Host 对删除收据能证明工作室与搜索连接已关闭。若首片必须直接完成 PluginDatabase，则应按下面列出的完整 P1b 范围估算，不能仍称作只改两个构造函数。

## 数量与不能忽略的事务

在 `plugins/native/alchemist/src/**/*.ts` 排除 `*.test.*`，用 TypeScript AST 计 CallExpression：**24 处 `.transaction()`，15 个文件；139 处 `.prepare()`。** 其中直接链式 `prepare(...).run/get/all` 为62/40/30，其余7处 prepare 保存为局部 statement后使用；这些是调用位置数，不是执行次数。普通 repository.get 不能混算 SQL get。

| 文件（相对插件 src） | 事务数 | 调用者 |
|---|---:|---|
| studio/server/bootstrap/local-runtime.ts | 1 | seedLocalIdentity |
| studio/server/db/decision-repository.ts | 1 | create |
| studio/server/db/exploration-repository.ts | 1 | saveResult |
| studio/server/db/idea-repository.ts | 3 | keepCard / discardCard / restoreCard |
| studio/server/db/memory-repository.ts | 1 | revisePlaybookRule |
| studio/server/db/pulse-repository.ts | 3 | ensureDefaultSourceSettings / saveSourceCollection / saveReport |
| studio/server/db/research-repository.ts | 1 | saveReport |
| studio/server/jobs/sqlite-job-runner.ts | 6 | withLease / enqueue / claimNext / cancel / recoverExpired / readEvents |
| studio/server/services/calibration-memory.ts | 1 | applyProposal |
| studio/server/services/cancel-lens-run.ts | 1 | cancel |
| studio/server/services/create-exploration.ts | 1 | create |
| studio/server/services/opportunity-actions.ts | 1 | convert |
| studio/server/services/start-lens-run.ts | 1 | start |
| studio/server/services/start-pulse-run.ts | 1 | start |
| work-reuse/service.ts | 1 | recordConsumed |

24中有 **1个纯读事务** `SqliteJobRunner.readEvents`，它保证事件和终态来自同一快照，不能删掉transaction后用两次独立reader查询替代。6处 `.immediate()`：jobs的withLease/enqueue/claimNext/cancel/recoverExpired及startLensRun。其余默认事务不等于无事务。

关键嵌套：createExploration/startLensRun/startPulseRun 的业务事务→jobs.enqueue的immediate事务；worker.control.commit→jobs.withLease→repository.saveResult/saveReport自身事务；saveCheckpoint/finish也进withLease。better-sqlite3用嵌套保存点处理。不能让内层再开 `PluginDatabase.transaction`（异步且另一事务边界），也不能未经核对把所有内层事务静默变成no-op。迁移应显式将同一个tx向下传，整组业务失败回滚；若某处依赖局部回滚后继续，需保留该语义或单独设计，不能假定不存在。

## PluginDatabaseTransaction 的真实可复用范围

| 当前能力 | 现有公共tx能否承接 | 处理 |
|---|---|---|
| 参数化SELECT、INSERT、UPDATE、DELETE的SQL正文 | 能 | SQL、参数和值映射可保留，换成tx.get/all/run(sql, values)。 |
| 读取后立即写入、检查changes | 能，限同一个同步tx回调 | `changes`是number或bigint，当前 `!==1` 调用需确认统一转Number；不能让正确的1n被当失败。 |
| `prepare().get()`无行返回undefined | 不完全相同 | Plugin reader返回null；repository边界显式转换，不让 `hasActive() !== undefined` 对null返回true。 |
| `prepare` statement对象及局部复用 | 无此接口 | 不对外伪造driver statement；局部改为同一tx上的SQL调用。 |
| `.transaction(fn)()` / `.immediate()` / nested savepoint | 无此接口 | 外层await一次授权事务，内层同步组合并传tx；不能await嵌套事务。 |
| 独立只读一致快照 `readEvents` | 现有reader不够 | P1b必须明确读快照API或保留owner内部只读transaction；不要为了读快照索取写权限，也不要靠提升隔离级别猜测。 |
| pragma、baseline、mkdir、close | 不该交插件tx | Host owner处理。现有驱动配置为FK ON、WAL、busy_timeout5000。 |
| 写后 await模型/网络再继续写 | 绝不能保持一个tx跨await | 分成前后提交点，每次等待当前authority后同步检查版本/lease/关闭态。 |

现代码没有iterate/pluck/raw/backup/自定义SQL函数等业务依赖，不必为这些扩展接口。直接 `PluginDatabaseTransaction` 对象也不能作为旧 `SqliteDatabase` 的结构子类型：两个名字相似不表示合同兼容。

## P1a 最小生产链与准确 I/O

### 生产链

`MolisWorkLocalHost → AlchemistHostService.get(caller) → Host按可信caller.project_id打开studio owner → createAlchemistStudioRuntime({database,ai,…}) → 原repository/actions/worker → runtime.close排空 → Host关闭studio/search连接`。

所有业务动作继续走现有同一个provider。路径仍由 `alchemistProjectDirectory(home, projectId)` 编码，baseline仍v1。目录内 search.sqlite/search-content 仍归原Host搜索服务；P1a不合并两库，不把search数据库发给插件。

### 类型（拟议；是当前插件与Host的私有接缝，不放contracts/platform/plugin）

```ts
// plugins/native/alchemist：借用现有同步能力，移除路径、pragma与close权限。
// 可以先用已有storage包公开SqliteDatabase类型的Pick；不新依赖better-sqlite3到Host。
type AlchemistStudioSql = Pick<SqliteDatabase, "prepare" | "transaction">;

interface AlchemistStudioRuntimeOptions {
  database: AlchemistStudioSql; // required，替换databasePath；无旧字段fallback
  ai: AlchemistAiPort;
  // 其余现行workReuse、workerIntervalMs、jobLeaseMs、pulse等参数不变
}
// runtime.close(): Promise<void> 只停止/排空业务，不关闭借入连接。
// runtime.database 如仍为现行测试/嵌入所需，只暴露同一窄类型。

// apps/local-host内部，不导出给Runtime插件服务。
interface OwnedAlchemistStudioDatabase {
  readonly database: AlchemistStudioSql;
  close(): void; // Host唯一调用，幂等；不得与业务排空并行
}
function openAlchemistStudioDatabase(
  home: string,
  trustedProjectId: string
): OwnedAlchemistStudioDatabase;
```

Host使用现有storage公开 `LocalSqliteStorage` 打开driver；插件公开导出自己既有 `ALCHEMIST_STUDIO_BASELINE` 数据，Host经storage的 `applySqliteBaseline` 校验。保持路径和PRAGMA（LocalSqliteStorage已有5000ms/FK/WAL；其synchronous FULL也要核对当前driver默认，不悄悄改变持久性承诺）。初始seed/settings/pulse默认行仍由原业务初始化同步执行，不挪业务SQL到Host。

借出的对象应只含绑定后的prepare/transaction函数，不是带整个driver对象的类型断言；不含close/pragma/path。P1a保留现有同步事务/嵌套行为，所以无需把24处业务事务全改成async。新owner只负责连接和baseline，不负责研究、租约或模型。

Host构造顺序：打开连接→校验baseline→构造runtime（初始化可能抛错）→登记entry→start。任一步失败关闭已打开连接，不能把半初始化entry留在map。现`SharedStudio`补connection字段；删除、idle、最后一个owner关闭都走一份evict终结顺序。当前共享owners行为在本片保留，不能同时做单Home Runtime裁撤。

调用方需要同步改：`apps/local-host/src/alchemist-service-host.ts`；公开runtime factory的根测试fixture（`tests/fixtures/alchemist-actions.ts`、`alchemist-worker.ts`）、`tests/alchemist-runtime.test.ts`、host-lifecycle与workbench夹具等；包内所有创建工厂的测试按实际搜索更新。测试自己拥有连接，用finally在runtime.close后关闭；不要在生产factory保留databasePath分支只为旧测试不动。

最小源码模块：插件 `db/open-database.ts`仅保留/重命名窄类型；`db/schema.ts`的baseline数据导出（开库/baseline调用移走，已有apply wrapper若无调用即删除）；`bootstrap/local-runtime.ts`改借用与关闭；`bootstrap/actor-actions.ts`补可等待的inFlight归零；插件index公开最小类型/baseline；Host新增owner实现与现AlchemistHostService生命周期接线。**不新增通用project database API，本片不宣称PluginDatabaseTx已采用。**

## 关闭和删除：无需改同步 onProjectDeleted

已有 `ProjectDeletedHooks.register` 接受 `clear(projectId): void | Promise<void>`，同id栈上活owner覆盖离线owner；`clear`会await，失败保持收据pending。已有 `homeProjectOwners` 的alchemist离线owner只rm目录；活 `AlchemistHostService` 注册同id并在deleteProject里evict+rm。直接沿这条已经存在的Host链改，不引入任意插件async钩子。

1. `deleteProject(projectId)`同步把相应entry标为closing（当前closing map语义继续），从各owner可复用entries移出；关闭期间get拒绝，不能打开第二个同路径连接。
2. 停止tick与worker，等待draining、worker.whenIdle及前台action inFlight归零。
3. **现代码需要补的具体缺口：** `actionsInFlight`只有none/track，runtime.close目前未await前台action；不能仅等待worker就关DB。增加whenIdle，不改变业务处理与恢复语义。检查close重入与前台操作的finally减计数；runtime进入closed后拒绝新actionsFor。
4. `runtime.close`排空后Host关闭studio连接和search.shutdown；即使某一资源close失败，也尝试关闭另一个，但保留错误给删除收据。任一关闭失败不rm、不从防重开状态“成功退出”；下一次clear重试同一关闭，不启动新的worker来恢复。
5. 两连接成功关闭才rm项目目录；成功后移除closing entry。同id项目重建从新的连接与空库开始。停用/Host停止后的离线owner继续可清理；register返回的dispose或alive失活恢复先前owner，不重复追加不可回收owner。

不添加新的任意执行回调。将来Runtime切换时，`onProjectDeleted`仍只同步cancel；Host的数据库owner可通过其**可信构造时持有**的工作室资源等待已登记的关闭承诺，再清目录。不能把action输入或不受信任PluginDefinition里的任意Promise接到删除关键路径。这个将来的桥接不在P1a提前实现。

## P1b 中真正需要 await 的边界（本轮不改）

- 启动：seedLocalIdentity＋settings.ensureDefaults＋pulse.ensureDefaultSourceSettings＋recoverExpired。异步库事务会使runtime初始化/ready变成async；不能在返回ready前还没seed。
- 每次前台actor登记：`bindAlchemistActor`现在await caller.beforeEffect后直接INSERT；需变成受控事务且同步复核closed。不能忽略“query也有actor登记”的现状。
- 同步命令的外层提交：direction create/update/status、卡片keep/discard/restore、decisions、annotations/Taste/proposals/opportunity等。内部repository保持纯同步tx，不让每条SQL都独立await或事务拆开。
- 三种启动业务＋enqueue＋job event：createExploration/startLensRun/startPulseRun形成一个async外层提交，jobs.enqueue改为接受同一个tx的同步内部方法。cancelLensRun同理先原子更新job+run，再发取消信号。
- 前台含模型/网络的分段：sendConversationMessage先保存本人消息→await模型→成功/普通失败回复各一个受控提交；RuntimeSelector.update在listModels后提交；createResearchPlan/WorkReuse记录及reconcile在各外部等待后独立提交。不能包住整个async handler使模型期间持锁。
- worker控制：claimNext、renewLease、saveCheckpoint、complete/fail、recoverExpired、control.commit均需明确async顶层与同步tx叶子。现JobHandlerControl.commit返回T、saveCheckpoint返回void，改成Promise会穿透各job-handler的saveStage/业务提交调用点，必须一起await，不能丢promise。它与后台授权重建的前置有实际依赖，不适合塞进P1a。
- readEvents只读快照单独处理；不能当第24个写事务一起替换。

这些边界来自上述实际24事务及事务外run点。24并不是“只需加24个await”：同步repository复用、启动默认写、job控制回调都会把签名变化传到上层。

## 三个真实交错回归（P1a）

1. **关闭正在等待的前台操作。** 真Host+临时Home，controlledAlchemistAi在conversationSend保存本人消息后阻塞；并发Host close或deleteProject。断言关闭承诺未完成、未提前close连接；新同项目调用明确closing拒绝，不开第二库。释放模型后按既有关闭/授权语义收尾，runtime动作finally归零，然后两库关闭。删除路径直到此时才出现complete收据与目录消失；不通过延时猜测，使用可控gate和close观测点。
2. **嵌套事务失败保持原子性。** 真studio v1与现动作触发startLensRun/createExploration，在enqueue插job后的appendEvent或createRun点注入同步故障；断言job/event/run全部回滚，之后同一方向重试可成功且只有一份。证明新的借用SQL包装没有丢失this绑定或savepoint，而非只断言字段存在。
3. **删除关闭失败与重试。** 真Host两个项目，A同时已有studio和搜索资源；受控关闭A search失败一次，记录clear结果仍pending且目录未rm；B继续可读写。再次请求相同删除，重用closing资源完成释放再rm，收据complete；重建同id为空，旧资源无后续写入。对idle回收继续保留现`alchemist-studio-idle`的关闭窗口拒绝/再次打开测试。

命令（实施后由主Agent排时段）：整体build后 `node scripts/run-tests.mjs tests/alchemist-host.test.ts tests/alchemist-host-lifecycle.test.ts tests/alchemist-studio-idle.test.ts tests/project-deletion-studios.test.ts tests/alchemist-runtime.test.ts tests/alchemist-worker-process.test.ts`，新增交错优先并入对应真实fixture文件；按包README保留其余动作/MCP/包内vitest验证。P1a不改UI，不用为此新跑Chrome；既有队列重启用例必须保留，证明本片没有提前更改恢复语义。

本次只做源代码与AST核对。未产出实现/运行通过结论，也没有对旧任务恢复选项作新决定。
