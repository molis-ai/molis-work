# Home 级插件的库按项目分开（S0a）

状态：执行中：S0a 本 PR（2026-10-20）。负责人：平台线 ②。本文记设计、取舍、用户的决定和验收。依据：用户 2026-10-20 定的 Alchemist 问题 1（按项目分区的插件库），[防腐 spec](../repository-anti-corruption/spec.md) 的决策表那一行与 §10 的第 15 条（Alchemist、Images 留在 Home 级，Home 级实例要能按调用所在的项目给出库）；方案底稿是本地笔记 `alchemist-platform-plan.md` §2.1（不在仓库里）。Alchemist 改用它是迁移线 ③ 的事，不在本片。

## 1. 要解决的事

Home 级插件只有一个实例，`services.database` 给它整个 Home 一个库。Alchemist 这类插件的数据是按项目放的：每个项目一个工作室，删项目时整个工作室一起走。今天它自己拼目录、自己管连接、自己写删除，平台不知道这些文件，也就管不到授权、关闭和删除的顺序。

本片让 Home 级实例声明「我的库按项目分开」，平台按调用所在的项目给它那个项目的库，打开、闲置关闭、停用关闭、删项目都归平台。插件看到的 API 与今天的 `services.database` 完全相同。

## 2. 设计

**声明。** Home 级插件 Manifest 的 `databases.home` 加 `partition: "project"`（PG-022 之前写在条目的 `runtime.database` 上）（合同 `HomePluginDatabaseDeclaration`）。Home 存储登记里同一个库的 `library.partition` 也是 `"project"`，两边不一致时整份启动名单不启动。只有 Home 级条目能声明：项目平台的插件带它，启动前拒绝（项目级实例本来就在项目里）。

**项目从哪里来。** 只从调用上下文：当前正在运行的、属于这个安装的动作或场景回调，它的 `caller.project_id`。不读动作参数、不读插件给的任何东西。项目里的页面路由（S-31，`/projects/<id>/api/plugins/<插件>/…`）经插件自己的动作走进来：路由交给插件的 control 带着宿主核过的项目，插件用它调自己的动作，动作就在那个项目里。路由处理器本身、`start`、`stop`、事件订阅都不在任何动作里，用不了分区库。后台作业在受理它的动作里开始，带着那个动作的项目。

**开始的先后。** Plugin Runtime 给每次动作、场景回调记一个开始的位置（`lastBegunPluginInvocation`）。在一个动作里面再调的动作、场景回调不另取位置，沿用外层那次的；后台作业沿用受理它的那次。所以「删除开始前就已开始的调用」把它们都算进去：删除之后才从这样的调用里发出的调用，也和外层一样老。

不在项目里的调用答 `actions.project_required`（平台码，与「项目范围的动作在项目外被调」是同一件事）。

**位置。** `{home}/<库名>/projects/<编码后的项目 id>/<库名>.db`。项目 id 用 `encodeURIComponent` 编码、点也换成 `%2E`，所以一定是一个目录名，不会是 `.`、`..` 或带斜杠。目录 0700、文件 0600，读写两个连接与今天一样。

**生命周期，归平台。**

- 一个项目第一次被用到时打开它的库，之后同一个实例的调用共用这对连接。
- 闲置关闭：每 10 分钟查一次，两次检查之间没有用过、也没有正在等的写事务的项目库关掉（闲置 10 到 20 分钟之间关）。下一次调用重新打开，数据还在。
- 实例停止时全部关掉。之后的旧句柄与今天一样被拒（S-18）。

**删项目。** 插件声明了 `project_data`（确认框要列出随项目删掉的是什么）。删除这一步在同一轮里依次：平台停掉插件经 `services.background` 在这个项目里受理的后台执行（插件不被通知，也不跑自己的代码；PG-038）、关掉这个项目的库、开始插件的 `purge`（有的话）；等 `purge` 完成后删掉整个项目目录。插件没在运行时，同一个主人照样先 `purge`（有的话）再删这个目录；宿主没开时（命令行、卸载器），目录条目声明的主人做同样的两步（`project-deleted-owners.ts`）。

删除开始之前就已开始的调用（包括它受理的后台作业、它里面再调的），之后再也碰不到这个项目的库：读写都答 `actions.missing`，也不会把删掉的目录重新建出来。从关库到删完目录之间新开始的调用答 `actions.unavailable`（「正在清理，稍后再试」）。删完之后才开始的调用照常用：演示项目用固定的 id 删了再建，新项目从一个空库开始。

这两样（删到哪次调用为止、哪些项目正在清理）记在宿主的 Home 插件执行器上、按安装分，不随实例走：`purge` 等待中插件被停用再启用、升级或恢复，或者删除开始时插件没在运行、清理中被启动，新实例照样答 `actions.unavailable`，不会打开一个随后被整个删掉的库。`purge` 失败或删目录失败时，这一步留在删除回执的待办里、清理中的标记放开，旧目录还在；能用回已删项目 id 的只有固定 id 的演示，它重建前先把待办的清理做完（`settleProject`），做不完就拒绝，所以不会从旧库开始。

**授权与检查。** 与 `services.database` 同一份代码（`openPluginDatabase`）：每次读写都复查实例仍在运行、授权仍在（`storage:private` 与声明的读写权限）；读只收 `SELECT`、`WITH`；写在 `transaction(beforeEffect, …)` 里，只收 `INSERT`、`UPDATE`、`DELETE`，等待前后、每条语句前、`COMMIT` 前都问原调用方（`assertPluginActionCurrent`）；事务体必须同步。实例运行中改不了授权（`runtime.grant` 在运行时拒绝），缺读写权限的情形由 `tests/plugin-project-database.test.ts` 对同一份代码证明，本片证明的是调用方在等待中失去授权。

**登记与卸载。** 分区库与别的插件库一样登记在 Home 的存储登记里，主人是插件；`uninstall --purge-user-data` 删整个 `<库名>` 目录，所以分区库也一起删。

## 3. 决策记录

| 定的事 | 谁定 | 选择与理由 |
| --- | --- | --- |
| 用不用按项目分区的插件库 | 用户 2026-10-20（Alchemist 问题 1） | 用。Alchemist 留在 Home 级，库按项目分开，生命周期归平台 |
| 拒绝码 | ② | `actions.project_required`，不另立 `plugin.database_partition_required`（底稿写的）：和「项目范围的动作在项目外被调」是同一个事实，平台码已有，不加新的错误码主人 |
| 路由要不要另带项目 | ② | 不要。路由经插件自己的动作走（S-31 的路由 control 已带项目），不给路由处理器开第二条拿项目的路 |
| 删了的项目要不要永久拒绝 | ② | 不要。演示项目用固定 id 删了再建，永久拒绝会让它再也用不了。改成拒绝删除开始前就已开始的调用：Plugin Runtime 给每次动作、场景回调记开始的先后，后台作业沿用受理它的那个动作的位置。取消这些调用本身是 PG-106 |
| `purge` 还是不是必需 | ② | 分区库的插件可以不写 `purge`：平台删目录。没有分区库的插件仍必须写 |
| 分区库要不要 `project_data` | ② | 要。确认框得告诉人随项目删掉的是什么，`label` 只能从声明来 |
| 测试夹具能不能分区 | ② | 不能。夹具不带 `project_data`，分区库的生产路径只有目录条目；测试照生产路径往目录里加一条再启动宿主 |
| 闲置关闭的时间 | ② | 10 分钟一查、两次之间没用过就关，平台统一的值，替掉 Alchemist 自己的 `watchIdle`（迁移时由 ③ 删） |
| 闲置检查的计时器放哪 | ② | 归这个实例的库服务，随实例开、随停止清掉，`unref` 不让进程多活。不登记进 `periodic-tasks.ts`：那里是 Web 服务的后台任务（`web-composition.ts` 建它，诊断页列出、关服务时等它做完），Home 插件宿主却由 `project-host.ts` 装配、不经 Web 服务；这个检查只是同步关几条闲置连接，和连接同生命周期，Alchemist 现在自己的闲置检查也是这样放的 |
| 动作里再调的动作算什么时候开始 | ② | 算外层开始的时候。另取新位置的话，删除前开始的动作在删除后再调一次自己的动作，就能把删掉的库重新建出来 |
| 清理中的调用答什么 | ② | `actions.unavailable`，稍后再试。这时库已关、目录还没删完；等它删完就是新库，不是「已删除」 |
| 删除的状态放在哪 | ⑤ 评审修，2026-10-20 | 放在 Home 插件执行器上、按安装分，不放在实例的库服务里：放在实例里时，`purge` 等待中实例一重启就丢了，新实例会打开一个随后被整个删掉的库，写进去的悄悄没了 |

## 4. 改了什么

- 合同（`pnpm api:update`）：`platform/plugin-database` 的 `HomePluginDatabaseDeclaration`、`HomeStoreDeclaration.library.partition`；`platform/plugin` 的 `PluginManifestDatabases.home` 用前者；`modules/projects` 的 `ProjectDataDeclaration.purge` 改成可选。
- Plugin Runtime：调用范围记开始的先后（`lastBegunPluginInvocation`），里面再调的、场景回调沿用外层的。
- 存储：项目库的路径与打开函数多一个可选的项目参数，`homeSqlitePartitionDirectory`；登记的 `libraryPath` 按分区方式要求或拒绝项目。
- 宿主：`plugin-database-partitions.ts`（新文件：按项目取库、闲置关、删项目）；`plugin-database.ts` 接项目与关闭原因；`home-plugin-executor.ts`、`home-plugins.ts`、`plugin-project-cleanup.ts`（运行中实例的删除顺序）、`project-deleted-owners.ts`（宿主没开时：分区库先 `purge` 再删目录；别的主人没有 `purge` 时，建删除名单那一刻就报错）、`plugin-database-entries.ts`、`home-stores.ts` 接线与检查。不碰 `project-plugins.ts`、`builtin-plugins.ts`。
- 测试夹具 `tests/fixtures/partition-probe.ts`：照生产路径往构建的目录里加一个分区探针条目。

## 5. 安全不变量（[SECURITY-INVARIANTS](../../docs/system/SECURITY-INVARIANTS.md)）

不新开边界：声明与授权仍是 S-15，取消、撤权、停用后不写仍是 S-18，项目只来自宿主核过的路由仍是 S-31。两条新的拒绝挂在已有的行下：S-31 补「不在项目里的调用用不了分区库，一个项目的调用碰不到另一个项目的库」（PART-04、PART-05）；S-18 补「删除开始前的调用不再读写、也不重建那个项目的库」（PART-10）。

## 6. 验收标准

测试名带编号；全部在本 PR 证明，文件是 `tests/plugin-database-partition.test.ts`，删除那几条另见 `tests/plugin-database-partition-deletion.test.ts`。

| 编号 | 标准 |
| --- | --- |
| PART-01 | Manifest 的 `partition` 与登记的 `library.partition` 不一致（任一方向），整份启动名单不启动、不建任何库 |
| PART-02 | 项目平台的条目声明 `partition`，启动前拒绝 |
| PART-03 | 分区库没有 `project_data` 时拒绝；有分区库时 `purge` 可省；没有分区库又没有 `purge` 时拒绝 |
| PART-04 | 不在项目里的调用（Home 路径下的动作；不在任何动作里的代码，以 `start` 为例，路由处理器本身、`stop`、事件回调同理）答 `actions.project_required`，不建任何文件 |
| PART-05 | 项目 A 的调用读不到项目 B 写的；输入里写别的项目 id 不起作用 |
| PART-06 | 位置是 `{home}/<库名>/projects/<编码>/<库名>.db`，目录 0700、文件 0600；含点、斜杠、百分号的项目 id 编成一个目录名 |
| PART-07 | 在项目里受理的后台作业，之后写进的是受理时那个项目的库 |
| PART-08 | 闲置的项目库被关掉，下一次调用重新打开、数据还在；正在等的写事务所在的库不关 |
| PART-09 | 实例停止关掉全部项目库；停止后旧句柄的读写被拒 |
| PART-10 | 删项目：同一轮里停掉这个项目里受理的后台执行（别的项目里的照常跑完，被停的不写结果）、关库（有写事务在等也关）、`purge`，`purge` 完成后删掉这个项目的目录，别的项目不动；清理中新开始的调用答 `actions.unavailable`；删除开始前就已开始的调用（含它里面再调的）之后读写都答 `actions.missing`，目录不被重建；删完之后开始的调用（同 id 再建）从空库开始；`purge` 等待中实例重启、或删除开始时插件没在运行而清理中被启动，新实例照样答 `actions.unavailable` |
| PART-11 | 插件没在运行时、宿主没开时，删项目照样 `purge` 并删掉这个项目的目录 |
| PART-12 | 检查与 `services.database` 相同：读只收 `SELECT`、`WITH`；写只收 `INSERT`、`UPDATE`、`DELETE`；异步的事务体被拒并回滚；调用方在等待中失去授权，写入被拒、什么都不留 |
