# 06-3 N44 展示读取与 BL-943 逐操作授权

状态：方案和改前实测已齐，等待 N43／46 写手交接（2026-11-10）。目标为功能可用。需求见[第 06 批](../post-anticorruption-roadmap/reference/batches/06.md#batch-06-item-3)和 [BL-943](../backlog/BL-943.md)。

隔离 Home 同项目并发读两份 Goal 文档，BCC-04 三次中位数为 70 次项目插件目录读取、68 次 SQLite 开库。`projectWebView` 为 Goals 可见性和展示名单分别读目录，`projectPluginStages` 在展示路径等待项目插件刷新。动作准备、回调后发现和执行还有各自的当前授权读取。

用真实 Home grant 路由、MCP 网关、外装插件执行器和声明的项目 SQLite 表复现原调用权限遗漏。并发查询先成功进入处理器，在下一次 `project_database.get` 前暂停。只撤此原 MCP client 的精确动作 grant，独立获准的 client 仍调用成功，安装代及 `storage:private` 和数据库 read grant 保持有效。解除暂停后，撤权的调用仍执行一次带唯一标记的原生 SQL 并返回结果。隔离用例 1/1，零跳过。产物 `9e8583022`，相关实现到 `origin/main c7873a0f2` 未改变。脚本 `/private/tmp/molis06-bl943-read-baseline.test.mjs`，日志 `/private/tmp/molis06-bl943-read-baseline.log`。

同一产物另测真实 MCP 写动作。正向控制提交一条业务行、一个 journal 事件及一张幂等收据。第二次调用在传入库的等待中已经通过原 `caller.beforeEffect()`，暂停后只撤写动作 grant，独立授权的读取仍通过。恢复后返回 `mcp.action_revoked`，实际项目库零 BEGIN／COMMIT，目标业务行、事件与收据均为零。写前围栏已有此项拒绝，改后须保留。隔离用例 1/1，零跳过。脚本 `/private/tmp/molis06-bl943-write-baseline.test.mjs`，日志 `/private/tmp/molis06-bl943-write-baseline.log`。

## 实施

- **展示观察。** 在当前 Web Catalog owner 内按实际项目和运行实例合并已排队的展示读。同步读开始时摘除本轮，现读成员、隐藏与常开，用同一次观察选择 Goals 展示分支和显示名单。完成、失败或关闭后下一请求重新读。项目替换、切换或停用期间，展示刷新仍经现有串行更新和 await 后现读，晚到的旧代结果不能留给后续。Catalog 事务中的 `project.plugin_added/removed` 是普通、个人显隐及伴随项的提交信号，回滚无新事件。若实现保留跨 await 的共享观察，沿同一 owner 的变动与实际安装代失效；不得将 HTTP 返回、定时广播或调用方提交的 revision 当当前事实。只共享同步观察时，开始后的借用现读，不保留已完成的快照。最终统一同步 main 时接回 #2000 的成员事件查询、CAS、串行队列和已提交失败恢复，不提前同步或另造版本。执行、页面直达、`goalsHere`、回调后 `snapshotForDiscovery` 及 stage 读取保留当前授权与实际 owner。
- **开库。** 先量合并观察的收益。若还需减少常开插件库的开库，在同一长驻 Catalog owner 内复用一条只读连接，每次读走短同步事务，重新核当前 Home、实际文件身份、版本、结构、安装与 consent ledger。异常也结束读事务。换库、关闭、损坏与不存在按现有语义处理，拒绝返回上一成功结果。独立 owner 与生命周期仍使用原开关路径。
- **逐操作。** 原生项目与 Home 库的独立 `get/all`、项目 journal 读及沙箱声明库都在执行前按当前安装读权及原调用检查。优先沿用 Runtime 的 `assertCapturedPluginActionCurrent(currentPluginInvocation(), instance)`，证明它到达真实原 caller 的授权并拒绝实例代变化、取消与已持结果失效。读检查不改变动作的写许可或已通过写检查状态。沙箱队列等待、worker 启动后，在发送读 IPC 前复查，返回后复查；已发出的读可以结束，撤权后不交结果。启动与直接路由无动作作用域时保留原安装及路由准入，事务内的读写保持原事务检查。写前 `beforeEffect` 返回后、BEGIN 前、每条写和提交前保留现有检查。个人插件隐藏由当前 Catalog reach 拒绝下一次路由、调度及写前检查；原动作 grant 在途撤回由逐操作测试单独证明。

## 验收

- **BCC-04**。沿真实并发双 Goal 夹具，各读回自己的文档。用原六项计数及实际 owner 成员读取计数证明下降，另记连接打开和刷新轮数。重复真实成员读的受控反例触发原预算。最终同步后如因上游改变调用形态，另外列集成基点与候选值。
- **BCC-09**。展示读取后，经当前 owner 提交普通启停、个人显隐及伴随项，下一次展示和目标路径消费新状态。常开 ledger、安装撤权、晚到、失败、关闭与另一项目／Home 分隔各有拒绝与恢复证据。保留旧的 brief 链接或 contextual key，按实际入口重放，验证目标内容和业务副作用仍由当前准入决定。只有实施复用连接时补同路径换库与失效结构的拒绝。
- **BCC-10**。真实原 MCP client 已进入处理器时撤精确动作 grant，下一次原生读拒绝，匹配语句执行数为零，结果未交付。沙箱排队时同样拒绝发读；另覆盖安装读权撤回及仍获准调用成功。真正的写处理器先通过原 `beforeEffect`，在数据库客户层 await 后恢复前撤权；断言无 BEGIN、业务语句或 COMMIT，实际业务行、journal、收据及副作用未变化。继续保留现有的结构化调用诊断语义。

先跑 `tests/call-budget.test.ts`、`tests/typed-effect-authority.test.ts`、`tests/security-invariants-plugin-project-database.test.ts`、`tests/security-invariants-plugin-project-journal.test.ts`、`tests/installed-plugin-execution.test.ts`，再跑实际修改触及的成员、常开、显隐、项目刷新、Web 与 contextual 夹具。命令为 `node scripts/machine-slot.mjs run browser --label '06 N44' -- node scripts/run-tests.mjs --jobs 1 <测试文件>`+。共享核心的 Full 在整批 CI 最终头上跑。

## 开工前检查

沿[主需求](spec.md#开工前检查)的 15 项。目录及成员由 Catalog／Projects 持有，安装、常开与原 caller 授权继续问各原 owner。所有插件走同一数据库服务，不新增能力、动作、公开合同、表、版本或兼容路径。只改隔离验证范围，保留成果及过程项、UI、文案、现有错误码。改动面集中在 Web 展示、Catalog 刷新与 Host 数据库客户及进程，避开同步切换写手边界；最终接回 #1999、#2000 和 #2004。共享同轮观察降低所有调用方的展示成本，直接调用和撤权路径保持逐操作可证。
