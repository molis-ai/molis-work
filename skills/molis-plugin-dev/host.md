# 接到本仓库产品

Manifest 写完不等于底栏插件切换里有入口：内置插件还要在自己包里写 `registration`（目录条目）和 Plugin Runtime 监督器条目（见「内置插件：经 Plugin Runtime 装配」）；第三方插件看 [authoring.md](authoring.md)。不要抄冻结名单的短名 HTTP。

## 内置插件：经 Plugin Runtime 装配

新的内置插件（任何 kind）只走 Plugin Runtime：由监督器启动，得到安装记录、升级检查、崩溃恢复和每个安装独立的私人存储。不再新增 `apps/local-host/src/<插件>-native-plugin-http.ts`，也不再往构建期名单加条目；冻结的旧名单只许减少（门禁 `tests/builtin-plugin-assembly-gate.test.ts`）。

典型目录：`plugins/native/<id>/src/{manifest,ui,client,styles,en,routes,index}.ts`。私人库对照 Pages / 灵光；不要新建第二张业务 Module 表。

包：`@molis-ai/molis-work-plugin-<id>`。`pnpm-workspace` 已含 `plugins/**`。还要登记依赖，否则 workbench / local-host 解析不到。

### 个人 Home 插件

个人数据跨项目一致、无项目也可用时，Manifest 写 `runtime: { scope: "home" }`（运行范围是 Manifest 的），插件自己的 `registration` 再给 `runtime: { create, package_name, factory_export }`（Home 实例的代码，只来自这份宿主登记；两者必须同时有，宿主启动时检查）。只有随宿主发布的插件能这样用：装上的或生成的插件 Manifest 写了 `runtime`，安装时以 `plugin.home_scope_unavailable` 被拒，等沙箱宿主能跑 Home 实例再放开。Host 统一装配 Home Supervisor、安装授权、SQLite 与路由；不要在 `project-plugins.ts` 再启动它（双实例插件的项目一半除外，见下面「双实例」）。实际例子是 `plugins/native/issues`；合同、关闭、取消与持久化约束见 [开发手册的 Home Runtime 部分](../../docs/platform/PLUGIN-DEVELOPMENT.md#个人-home-runtime-与插件-sqlite)。Home 视图的 `render` 只拿到 `model: { primitives: { escape, text } }`（转义函数与页面语言翻译函数），形状写在上面那份手册的公共页面一段，合同类型还没有（补它归 ② 平台）。

Home 级插件的数据按项目放、删项目时整份一起走（如 Alchemist 的工作室）时，在 Manifest 的 `databases.home` 写 `partition: "project"`，Home 存储登记里同一个库的 `library.partition` 也写 `"project"`，并在目录条目声明 `project_data`（`label` 必填，`purge` 可省：平台删这个项目的库）。插件拿到的 `services.database` API 不变，宿主按调用所在的项目给它那个项目的库：只有在项目里调用的动作和场景回调能读写，`start`、路由处理器本身、Home 路径下的动作答 `actions.project_required`；后台作业写进受理它的那个项目。打开、闲置关闭、停用关闭、删项目都归平台，插件不自己拼目录、不自己管连接。项目级插件不能声明。规则与验收见 `specs/plugin-project-partition/spec.md`。数据放在同一个库里、按列记项目的，在 `databases.home` 写 `project_rows`（标签、要删的表与列），删项目时平台照声明删行，插件不写清除代码；写法见 `docs/platform/PLUGIN-DEVELOPMENT.md`「Home 消费者的模型配置、生图与项目清理」。

`personal: true` 不等于已经迁到 Home Runtime。业务库与 SQL 归插件，连接来自 `context.services.database`；写入必须 `transaction(caller.beforeEffect, tx => …)`，回调同步。Home 不提供项目 artifacts、端口和事件，不能用假项目补齐。只有可信 bundled 定义对象用插件 ID，其余用安装 ID；Home/项目执行器共用此规则，安装记录和 generation 仍约束执行；MCP 保留自己的 caller，不伪装成 owner。

Home 的 `services.storage` 是 v2 Home Runtime 库里的安装隔离 KV；升级校验只读，候选失败恢复原值，停止/撤权/重装后的旧句柄失效。业务数据继续在插件原 SQLite，不迁到 KV。Home 的动作与场景若声明项目 scope，必须经真实项目客户端；Home HTTP 不带项目前缀时没有项目；带真实项目前缀时，Host 核对项目存在且显示该插件，发出的执行控制使动作保留该项目；不得从 body/query 自报项目。通用 operations 保留控制令牌、断开取消、beforeEffect、client_reported 页面上下文与上传限额，不借项目 Files/wiring 钩子。库失败不挡 Goals；普通读取不自行重试，显式 POST retry 共用一次启动。

项目里宿主自己运行的内置插件（`project-plugins.ts` 的启动名单）要有 Home 里的库，也是同一个 `context.services.database`：在 Manifest 写 `databases.home`（条目上不再有 `database`）；库名由 Manifest 决定，动作入参选不了。名单上的定义对象拿登记里的库；不在名单上、由宿主自己运行的插件（开发中的、装进来的）经 `plugin-libraries/` 的账本拿：首次打开记下发布者（取自安装记录）、版本和表，之后换了发布者、版本、表或库名都拒绝启动，库名不能是宿主已有的存储或目录，也不能按项目分开。库必须在 Home 存储登记中归该插件所有、与登记的基线一致，并列入 `docs/releases/CHECKLIST.md` 的各库版本表；Manifest 声明 `storage:private` 和库的读写权限，沙箱插件拿不到。数据由插件自己按项目分区，写入必须 `transaction(caller.beforeEffect, tx => …)`。Dataset、Form、灵光、Pages、PPT、Workflows 已这样装配。

项目库里插件自己的表（`specs/plugin-project-database`）：Manifest 写 `databases: { project: { store_name, version, schema, read_permission, write_permission } }`，`parsePluginManifest` 检查形状，两个权限必须在 `permissions` 里，自己的表两项都写 `storage:private`。`schema` 只能是 `CREATE TABLE` 与 `CREATE [UNIQUE] INDEX`，外键只指自己的表或 `project_root(project_id)`，不用 `AUTOINCREMENT`，名字不能和库里已有的对象重。宿主开库时为内置的项目级插件经平台的打开函数第一次建表、在账本 `plugin_project_databases` 记下发布者和版本，之后每次打开核对，不符只停这个插件（动作不进目录，页面说明原因），不修补、不重建；经 Plugin Runtime 启动的插件（项目里的 Runtime 插件、装进项目的插件、沙箱插件）启动时由平台用同一个打开函数建表或核对，被拒就不启动。Home 级插件没有项目库。改表就升 `version`，同时改 `docs/releases/CHECKLIST.md` §3 那一行并写维护。例子：`plugins/native/coding/src/database.ts`。

运行时读写自己的表用 `context.services.project_database`，与 Home 库同一个 `PluginDatabase` 接口，经 Plugin Runtime 启动、Manifest 声明了 `databases.project` 的插件才有：读用 `get`、`all`，只认 `SELECT`、`WITH`；写只在 `transaction(caller.beforeEffect, tx => …)` 里，回调同步，`tx.run` 一次一句，只认 `INSERT`、`UPDATE`、`DELETE`。每一句运行前平台用 `EXPLAIN` 带着参数核对它的步骤：只许碰本插件声明的表与索引，`project_root` 只许读（外键检查读它也算）；建、删、改表与索引，`PRAGMA`，事务控制，别的插件或平台的表，`temp` 与附加的库，都以 `plugin.project_database.statement_refused` 拒绝，语句一步也不运行。表结构只能升 `version` 走维护，运行时改不了。停用、撤权、取消之后句柄写不进去，与 Home 库相同。沙箱插件在操作的 effects 里写 `projectDatabase: ['read']` 或 `['read', 'write']`（查询只能读），人批准后经 `sdk.projectDatabase.get(sql, parameters)`、`all(sql, parameters)`、`transaction([{ sql, parameters }])` 走同一份检查；参数只许 null、有限数和字符串，BLOB 与超出 2^53 的整数传不回来，一个事务 1 到 64 句，一句被拒整个不写。沙箱侧由宿主接到异步 `services.project_statements`（不给同步 `project_database`），其中 `get(sql, parameters, { bytes }, signal)` 与 `all` 都传 512 KiB 上限，超限在 SQL Worker 内拒绝，插件收到 `sandbox.database_result_too_large`。子进程主线程独立执行单句与含提交的事务截止时间，宿主断开也杀整个进程；提交中断可能返回结果未知，不能自动重试。创作台生成的 Manifest 写不出 `databases.project`，所以生成插件用不上它；创作台防腐收尾后删除（BL-377）。

原生插件自己的文件只有一套服务：`services.ownerFiles`，声明在 Manifest 的 `owner_files`（下面一节）。旧的启动条目 `files` / `services.files` 已删（PG-102/104）；单文件字节上限、文件名规则由插件自己守，Images 在它的 provider 里限 20MB。

Home 或项目里宿主自己运行的插件要调模型：Manifest 声明 `model:invoke`，用 `context.services.model.complete(instructed(自己的指令, 数据))`，不再写宿主里的绑定文件。只要模型列表和能不能用、不发请求的（比如让人选模型），声明只读的 `model:read`：它只开 `choices()` 与 `availability()`，`complete()` 仍只认 `model:invoke`。只在自己的、声明了 `model:invoke` 且 `scheduling: "concurrent"` 的动作处理器里能调（其余位置 `plugin.model_*` 拒绝，动作返回之后是 `actions.expired`）；指令在 `PluginDefinition.instructions` 里声明（没有目录条目时），`owner_id` 是自己的插件 id；写入之前仍要自己 `await caller.beforeEffect()`。沙箱插件没有它。细则见 `docs/platform/PROLOGUE-AI.md` 第 4 节。

模型原图用 `images: [{ bytes, label? }]`，不传路径或 URL；可选模型从只读 `choices()` 获取。结果保留实际推理 `execution` 与同步 `validateResult()`：先等待本次 `beforeEffect()`，再调用结果自己的 `validateResult()`，紧接同步提交。平台也替你核同一项（PG-047）：拿到结果之后，这次调用每次经平台服务写入（库事务、私有存储、文件、成果、事件）、每次嵌套调用与每次 `beforeEffect()` 结束时都再核一次，结果失效（换了模型或连接、取消、撤权）就带原错误码拒绝，忘了调也提交不了。可记账失败同样检查，不补造未知用量或复用已结束动作的结果。原图限额、失败回执与完整写法见上述手册。

下面的目录、资源、英文和公开包登记仍适用；第 3 步只给实际导入者登记依赖（Home 的可信工厂来自 Workbench 目录，不必给 Local Host 增加插件专属 import），第 6、7 步的项目监督器名单由 Home 声明和实际启动测试代替。第 8 步使用通用 Home 页面与运行实例 contribution；不再添加插件专属 Host 渲染函数。

### 双实例：同一个插件的 Home 实例和项目实例

个人数据在 Home、又要在每个项目里读成果与过程项、接端口或事件时，不拆成两个插件：同一个 `plugin_id`、同一份 Manifest，Home 那一半的 Manifest 写 `runtime: { scope: "home" }`，登记里写 `runtime: { dual_instance: true, create, … }`，项目那一半照旧是 `project-plugins.ts` 启动名单里的条目。设计与验收见 [`specs/dual-instance-plugins`](../../specs/dual-instance-plugins/spec.md)。

- **标记只在 Home 那一半、只来自宿主**：目录条目登记里的 `runtime.dual_instance`（Manifest 的 `runtime` 只认 `scope`，写 `dual_instance` 被拒）；测试夹具写成 Home 夹具 `{ definition, dual_instance: true }`，项目夹具不带。Manifest、安装记录和项目条目都说不了，项目条目自己带标记在启动前被拒。同一个 `plugin_id` 不带标记出现在两份名单里、带标记却没有项目那一半，也都在启动前被拒。
- **两半要么都随宿主发布（`host` 信任），要么都不是**，这样两半登记同一个提供方，钉死的引用和 MCP 授权不分叉；不一致在启动前被拒，目录条目在评审时由门禁 `scripts/gates/dual-instance.mjs` 查。
- **每一项各归一半**：Manifest 的每个动作、场景、路由、视图恰好由一半的 `start` 返回处理器，互相引用的（撤销、后台任务、片段与事项目标）放在同一半。端口、事件、成果与过程项归项目那一半：Home 那一半启动时不因 Manifest 有这些声明被拒，也拿不到这些服务。运行时只放宽「声明了没提供」，「提供了没声明」照旧拒绝。
- **权限全部 `required: true`**（用户 2026-10-20 定，U1），门禁 `scripts/gates/dual-instance.mjs` 检查（`pnpm health:check`）：每条权限写成对象字面量、字面量 `required: true`，展开或算出来的它读不懂，也算失败。每个实例各一条授权记录，人只在 Home 那条上看和管，一个实例的授权不借给另一个。项目记录因此也持有只有 Home 一半才用的权限：项目一半没有那些处理器，用不到。
- **路由**：Manifest 声明过的路由，Home 正在运行的一半绑定了的由 Home 答，其余交给项目实例；Manifest 没声明的路径照旧由 Home 答 404。项目路径（`/projects/<id>/api/plugins/<插件>/…`）下两半各答自己的，都在那个项目里；不带前缀时只有 Home 一半的路由，项目一半的路由和别的不带项目的项目路由一样答 400、请人先选项目。Home 一半停了就不绑定任何路由：项目路径下请求交给项目实例，它不代答自己没绑定的路由（`actions.execution_failed`）。
- **服务句柄不互借**（S-48）：每个服务按正在运行的动作所属的实例（`install_id` 加 `installation_generation`）核对。在一半的动作里拿另一半的句柄写入或调用服务（存储、事件、动作调用、模型、材料、主人文件、后台等）都被拒，所以每一半只用自己 `start` 拿到的 `services`，不要把句柄放进两半共用的模块状态。读（如 `storage.get`）不按动作核对，也别拿另一半的句柄读。
- **只给宿主装配的插件**（用户 2026-10-20 定，U2）：第三方与沙箱插件不能声明。这和「插件待遇一样」之间的差距，是同一个平台缺口（外部插件还装不了 Home 实例），不是给内置插件开的私路，记在[防腐 spec](../../specs/repository-anti-corruption/spec.md) §1。

### Home 主人文件树

在 Manifest 里声明 `owner_files: { store_name, entries, read_permission, write_permission }`（和 `databases.home` 一样，宿主条目上不再写），其中 entries 固定顶层文件或目录，根须已登记归该插件所有；根可以同时放这个插件自己 Manifest 声明的库（`databases.home` 同一个 store），条目不能叫库文件（`<库名>.db*`）或分区目录 `projects`，别的插件的库不行。声明了却不在宿主启动名单上的定义启动被拒（`plugin.declaration_invalid`）；项目插件不能声明，双实例插件在项目里的那一半与 Home 那一半共用 Manifest、不拿服务。`services.ownerFiles` 提供 `stat/read/list` 与 `await write(writer => …)`；写回调同步完成，动作之内每个原语重查原动作和原调用者的权限，不能保存 writer 或跨 await 使用；动作之外（`start`、`start` 里设的定时器、路由）凭这个安装当前的授权（`storage:private` 加文件权限）决定，撤权、停用、卸载后拒绝，别的实例的动作里和场景里一律拒绝。Writer 支持 mkdir、独占 create/copy、存在文件 replace、原子替换、树删除与固定访问模式（只读 0o400/0o500、读写 0o600/0o700，不留组和其他人的位），接受 Unicode 相对路径但拒绝链接、硬链接和特殊节点。声明目录顶层不能删除。

没有启动钩子：初始文件由插件在自己的 `start` 里用 `await services.ownerFiles.write(…)` 写（写 grant 有效才写）。写回调同步完成，失败不回滚已写入的字节。原子替换在 rename 前失败保留原文件，树删除先预检；没有多文件事务或抵御同 OS 用户并发替换父目录的承诺。自报 id、project、sandbox 和升级预检不能取得此服务。Shelf 用它：Home 实例在自己的 `start` 里放一次首次示例（`createHomeShelfPlugin` 里 `files.write(initializeShelfFiles)`）；Images 用它存生成的图片（`images:files:write`），在自己的 `start` 里回收没人引用的图片。详情见 [开发手册](../../docs/platform/PLUGIN-DEVELOPMENT.md#home-主人的私有文件树)。

### Home 模型配置与生图

消费者的独立模型设置在 Manifest 里声明 `model_configuration`，得到 `services.model.configuration`；真实生图在 Manifest 里声明 `image_generation`，得到 `services.imageGeneration`（声明了却不在宿主启动名单上的定义启动被拒，`plugin.declaration_invalid`；项目插件不能声明），任务调度和图片校验仍由插件拥有。不要把 Home 路径或凭据解析器交给插件。生成返回的 revision 必须用于后续写入复核；失效时成功和失败记录都不能写。删项目时平台先停掉插件经 `services.background` 在这个项目里受理的执行和保留的作业，再按原可信 project_data 清理，插件不被通知。调用范围、声明字段和路由字节响应见 [开发手册](../../docs/platform/PLUGIN-DEVELOPMENT.md#home-消费者的模型配置生图与项目清理)。

### 本机命令行工具

插件要在这台电脑上找命令行工具（例如终端 Agent），在 Manifest 里声明 `local_tools`（PG-112）：`tools` 写工具 id 和文件名（裸名字，不含路径），`directories` 写 `PATH` 之外也找的目录（`~/…` 或绝对路径），人在设置里自己选的路径要问就加 `custom_executables: true`；再声明 `local-tools:read` 权限。得到 `services.localTools`：`find()` 回每个工具的可执行文件路径（找不到是 null），`isExecutable(path)` 只回是或否，`refresh()` 清缓存。宿主只做文件系统查询，**不起进程**；插件包里不读 `process.env`、不 import `child_process`。只给 Home 实例；沙箱插件声明了会在启动时被拒（`sandbox.service_not_given`）。隔离试用与测试用 `MOLIS_WORK_LOCAL_TOOLS=off` 或 `MOLIS_WORK_LOCAL_TOOLS_PATH=<目录>` 钉死。

### 问题卡、操作卡与下一步行

插件自己的页面要显示一轮 Agent 留下的问题、操作卡和下一步时，不自己画，也不等宿主替路由结果加料：用 `context.services.interaction` 的 `questionHtml`、`cardHtml`、`nextStepsHtml` 拿到与助理一样的 html，语言跟这次调用（页面的语言）走。卡先用 SDK 的 `actionCardView(card)` 变成人读的样子（`AssistantCard`）再交过去。它只画、不读不写任何记录，每个激活都有、不用声明权限；沙箱插件经 broker 拿到同一份（`sdk.interaction`）。交来的字符串都按文字画，结果链接只画本 Home 的路径，形状不对的值整个拒绝（S-56）。

### 已受理的后台执行

需要返回任务编号后继续运行时，在本安装的活跃并发 command 中 `await context.services.background.start(async control => …, { signal? })`；动作须声明 `background_job`，沙箱与升级预检没有服务。句柄的 `result` 交付结果，`cancel()` 取消等待；任务记录、幂等与重启恢复由插件自己拥有，平台不自动重放。回调可用既有模型与数据服务，但写入必须用这个回调的新控制 `await control.beforeEffect()` 并在提交前同步核 `control.assert_authority_current?.()`，不保留旧处理器的 caller。

正常 HTTP/MCP 断开不会取消已经受理的工作；原授权撤销、安装停用/升级、Host 关闭或显式取消后，成功和失败业务写入都拒绝。原身份、项目与注册一直保留，没有独立入口授权时仍沿用原 signal，因此不脱离 Agent 的取消。只受理一次有限执行，不在启动钩子、路由、过期计时器或后台回调里再开一轮。详见 `docs/platform/PLUGIN-DEVELOPMENT.md`「已受理的后台执行」。

### 随激活存活的后台作业

一件事要随插件这次激活一直跟着（等外部回信、跟一个会话到结束），先在 Manifest 写 `background: { jobs: [{ job_id, reason, permissions }] }`（`permissions` 只能是 Manifest 声明过的），再 `context.services.background.keep(job_id, async control => …)`。只在三处登记：本安装的命令通过了最后一次授权检查之后（自己的 `await caller.beforeEffect()` 返回过，或平台在它的一次写入前核过、它发的命令返回过），而且登记时这次调用还有效（提交后同步调 `keep()`，检查之后被取消或撤权就被拒）；激活的 `start()` 返回之前；同一激活的另一个还在跑的作业里（停了的作业登记被拒）。别处是 `plugin.background_job_origin`，命令还没通过检查是 `plugin.background_job_unchecked`。

作业只有安装自己的授权：control 里没有原调用者，发出的调用以安装身份、按 `plugin` 受众走。每次写之前 `await control.beforeEffect()`；平台在每次写和每 200 ms 重核激活、安装记录与权限，插件停止、项目关闭或删除、Home 关闭就停，之后经平台服务的写一律拒。单次调用取消、撤权不停它，这只为把已经受理的那件事跟到底、记下真实结果，不发起新的业务（`specs/repository-anti-corruption/spec.md` §12.10）。平台不落盘、不重放：要在重启后接着跟，插件在 `start()` 里读自己的记录再登记。沙箱没有这项服务。详见 `docs/platform/PLUGIN-DEVELOPMENT.md`「随激活存活的后台作业」与 `docs/system/SECURITY-INVARIANTS.md` S-52。

要让首页在各项目里读到这些还在跑的工作，把读它们的项目范围只读查询标 `home_aggregate: true` 并写 `output_type`（不调用模型、不计费）；首页只在打开的项目里、按那个项目的授权逐个调，调用是只读的。规则同上一处。首页标题栏的后台任务列表走这条路：用 SDK 的 `defineHomeBackgroundTasksAction` 声明、回答 `{ source: { surface }, tasks }`，宿主不认识具体插件（写法见 `docs/platform/PLUGIN-DEVELOPMENT.md`，例子是 `plugins/native/coding/src/home-background.ts`）。

### 流式路由

等待模型或外部服务时，动作声明 `scheduling: "concurrent"`，路由声明 POST 与 `stream: "ndjson"`，仍用 `bindPluginActionRoute`。动作通过 `caller.on_progress?.({ stage, progress, text_delta? })` 发进度，Host 将它编码为 NDJSON 的 `progress` 行，最后写唯一 `result` 或 `error` 行。不要让插件写末行，也不要复制或展开 `request.execution` 来补进度；SDK 用动作客户端第四个传输参数传 `on_progress`，保留可信控制对象的身份。直接路由可用 `request.emit`，它只在声明 stream 时存在。

进度单行至多 65,536 字节、10,000 行、总计 1,048,576 字节，超限取消；`max_body_bytes` 只给确需上传的路由声明，最大 45,000,000 字节。未声明时项目路由仍为 256,000、Home 路由仍为 12 MiB。断连、停用或撤权后结束等待；插件必须在外部等待后、写入前调用 `beforeEffect()`，并用原取消信号清理自己启动的外部工作。

### 必改（插件切换里能看见、点得动）

1. **合同类型**（有私人记录时）：`packages/contracts/src/modules/<id>.ts`，并在 `packages/contracts/package.json` 加 `./modules/<id>` export。
2. **插件包**：`package.json` 的 `molis-work` 块（path/kind/ssot），以及 `README.md`、`tsconfig.json`、`src/index.ts`（`workspace-packages.mjs` 缺一个就报错）。`index.ts` 必须再导出 Manifest、`createXPlugin`、contribution、stylesheet、client factory，Workbench / Host 从包根 import。
3. **`scripts/workspace-packages.mjs`**：加一条 `entry(...)`，并在 `apps/workbench/package.json`、`apps/local-host/package.json` 里加上这个插件包的依赖（这一步今天还是手写，`specs/repository-anti-corruption/privileges.md` PG-069 跟踪）。再在 `docs/SSOT-MATRIX.md` 对应的表里加这个包的一行，运行 `node scripts/package-owners.mjs --write` 生成「归属」列和 `.github/CODEOWNERS`。然后 `node scripts/workspace-packages.mjs` 核对（它也检查归属列与 CODEOWNERS）。
4. **包自己的 `registration`**：`plugins/native/<目录>/src/registration.ts` 导出 `registration: PluginRegistration`（类型来自 `@molis-ai/molis-work-contracts/platform/plugin-registration`），绑定 `project_plugin_id`、`catalog_order`、包导出的 `manifest`、可选 `personal`、`summary`（进内建市场还要有 `navigator` 或 `island` 视图）及 `agent` 正文；在包的 `package.json` 声明 `exports["./registration"]` 和 `"molis-work": { "registration": "./registration" }`。然后运行 `node scripts/generate-plugin-registry.mjs`，它写出 `apps/workbench/src/builtin-plugins.ts`，该文件不手改；`pnpm health:check` 跑它的 `--check`。它同时写出宿主那份 `apps/local-host/src/plugin-registry.generated.ts`；宿主加载时 `catalogProblems`（`apps/local-host/src/plugin-registry.ts`）自检重复的 id 与位置、悬空的 `companions` / `clientUses`。`personal`、`companions` 与启动名单只由宿主从这里读，再写到页面的目录上给外壳；`plugin-catalog.ts` 只派生外壳的导航与资源，不再维护第二份名单。
5. **同一份 `registration` 的 `workbench`**：声明 `order`（静态资源加载顺序）、`contributions`、`stylesheet`、`clientFactory`、可选 `settingsClient`、`searchRow`。`plugin-workbench.ts` 自动派生，无须另登记。Pages 族照 Pages；Feed/Inbox **没有**插件包里的 factory，客户端在 `apps/workbench/src/scripts/client/navigation-feed.ts` / `navigation-inbox.ts`。
   工作面还须在 `ui-composition.ts` 通过 UiHost 挂到它声明的 slot（`mountDeclared`），`renderer.ts` 注入 primitives，再由 `shell-page-renderer.ts` 渲染到主页面；只登记 pack 不会产生页面 DOM。对照图片插件 `renderImagesContribution`。
6. **监督器条目**：`apps/local-host/src/project-plugins.ts` 的 `startPlatform` 里，在 `entries` 加 `{ definition: createXPlugin(ports), trust: HOST_BUILD_TRUST, releaseArtifact: nativePluginReleaseArtifact(包名, "createXPlugin", factory => factory(ports)) }`。`trust: HOST_BUILD_TRUST` 让内置插件随宿主版本升级，不写 `upgrade_compatibility`。`start()` 要兑现 Manifest 的每一条（见下面「app 一等」一节）。
7. **门禁名单**：`tests/builtin-plugin-assembly-gate.test.ts` 的 `RUNTIME_ASSEMBLED` 加一行 `项目短名 → 包名`；短名要与第 4 步 `registration` 的 `project_plugin_id` 相同，包名要出现在 `project-plugins.ts` 里。
8. **HTTP**：写 Manifest `routes`，由 Plugin Runtime 挂在 `/api/plugins/<plugin_id>/`，处理器用 `bindPluginActionRoute` 转调动作；不写 Host 文件，也不要往 `web-request.ts` 的路由表加条目；宿主的 `*-native-plugin-http.ts` 是冻结的构建期旧路径（`tests/builtin-plugin-assembly-gate.test.ts` 里只许减少），不再新增条目。`project_id` 由 Host 从当前项目注入，不要从请求 body 或 MCP schema 收。工作面的渲染今天有两条现存路径，没有统一规则，照最接近的同类插件走：像 Shelf 那样在 workbench 的 `ui-composition.ts` 写 `render<X>Contribution`、由 `renderer.ts` 注入（同第 5 步）；或像 Coding 族那样在 `registration` 的 `workbench.contributions` 里列出自己的舞台页（`workbench` surface 指向主区），由 `apps/local-host/src/project-plugin-stages.ts` 从运行中的实例画；要把内容放进别的插件的页面，就在它的描述符里声明 `slots`，被嵌入的插件在 Manifest `ui.embedded_plugins` 里列出，并用 `target_slot_id` 指向那个槽（Coding 的目录与阅读器里的 Files、Git）。
9. **英文**：插件 `src/en.ts` 导出 `X_EN`，还要在 `apps/workbench/src/i18n/en.ts` `import` 并 `...X_EN`。只写插件文件，英文界面仍是中文 key。
10. **构建**：`pnpm --filter @molis-ai/molis-work-plugin-<id> build`。根目录 `pnpm build` 含 workspace。
11. **会点名插件名单的测试**：`tests/plugin-declarative-mounting.test.ts`（插件切换/常驻/个人插件）、`tests/creative-tools-plugins.test.ts` 的 `PERSONAL_PLUGIN_IDS`、`tests/uninstall.test.ts` 的 `{home}` 库名、有列表时 `tests/list-silent-refresh.test.ts` 的 factory 表。按需改 `tests/plugin-catalog-companions.test.ts`。

导航、设置位置、项目启用由 catalog 和 Manifest 推导；客户端与 i18n 仍需接线。公共动作注册后自动进入 MCP 目录，没有另外的 MCP 适配。

### 构建期 Native（冻结名单，只许减少）

`BUILD_TIME_ASSEMBLED` 里的旧插件仍是手写接线：Host 里的 `registerProvider(...)`（`project-host.ts`）、`apps/local-host/src/<id>-native-plugin-http.ts` 和目录条目（各包的 `registration`）。只有改这些旧插件时才看这一段，新插件不照抄。

- 手写 HTTP 文件：实现 `<id>-native-plugin-http.ts`。Alchemist 的 HTTP 由 `apps/local-host/src/web-request.ts` 里的显式直连路由处理（`handleAlchemistNativePluginHttp`，不经适配桥）；Pages、灵光、Feed、Inbox、Schedule 等也是 `web-request.ts` 路由表里的条目，各调自己的 `handle<X>NativePluginHttp`。
- Shelf 不属于这一份：它已由监督器启动（在 `RUNTIME_ASSEMBLED`，不在 `BUILD_TIME_ASSEMBLED`），路由从 Shelf S3 起是 Manifest 声明的插件路由（`/api/plugins/io.molis.work.shelf/…`），宿主里已没有 Shelf 名下的文件（Shelf S4：演示数据的示例由常驻宿主调 Shelf 自己的动作 `shelf.sample.seed` 放回），新插件不照抄。
- `project_id` 同样由 Host 从当前项目注入，不要从请求 body 或 MCP schema 收。

### 按需

| 有这个 | 再改 |
| --- | --- |
| 新的 MCP 能力 | 声明公共 `actions` 与处理器，`audiences` 含 `mcp`，经 Runtime 注册后由用户授权；不增加 Host 适配表 |
| `actions` / 判断消费场景 | 下面「接到统一判断场景」 |
| 插件事件总线 | 下面「接到插件事件总线」；构建期 Native 不要抄 |
| 新 Artifact 类型 | 合同 + Artifacts Module，不要只写在插件里 |
| 设置页 | contribution + `settings` 槽 + `settingsClient` |
| 图标名 | 必须是 SDK `/ui` 的 `PluginIconName`（`packages/plugin-sdk/src/ui/icon.ts`；design-system 的图标表 `icons.ts` 按它逐个画）（灵光用 `idea`）。写了不存在的名字，插件切换里那一行还在，图标是空的；不写 `icon` 才落到 `package`。不要往壳层塞 SVG |
| `agent` | 正文放在插件定义（`PluginDefinition`）的 `agent_prompts` / `agent_skills`，模型指令放 `instructions`、方法正文放 `methods`，不放在 `registration` 上；插件运行时由 Host 登记（PG-051）。Manifest 声明不等于已经提供正文，缺失由 `tests/builtin-plugin-agent-texts.test.ts` 拒绝 |
| 重编辑器 IIFE | `apps/local-host/src/web-assets.ts` 挂 `/assets/…`，页面再引 script。只打 bundle、不挂路径，浏览器 404 |
| 项目启用连带 | `registration` 上的 `companions`，写对方的短 id（今天只有 Feed→Inbox）；必选输入口的同伴由端口自动推出，不用写 |
| 全局搜索 | 内容一律经系统搜索：声明搜索来源（[search.md](search.md)），不改 `global-search.ts`。打开到具体对象：在 `registration` 的 `workbench` 声明 `searchRow`；按标签打开（`molis-work:select-item`）的插件在打开舞台的视图上声明 `accepts_objects: true`（[elements.md](elements.md#ui)），不改 `global-search.ts` |
| SSOT | `docs/SSOT-MATRIX.md` 加一行 owner |

## 接到统一判断场景

新能力声明 `actions` 并兑现处理器；判断消费者声明 `action_scenes` 并兑现真实绑定、触发和消费。不再为新场景增加 Host 白名单或 `functionAuthoringDestinations` 分支。合同与当前边界见 [开发手册](../../docs/platform/PLUGIN-DEVELOPMENT.md#统一动作与消费场景)。

1. 先确定业务事件、对象上下文、接受的判断结果，以及结果对产品的实际影响。
2. 注册 `ActionSceneDefinition`，输入输出 schema 与语义类型要能核对；manifest 场景与运行实例 handler 一一对应。
3. `bindings` 读取插件的真实配置；`bind` 校验配置写权限并写回原 owner。关闭时保留引用和版本。
4. 触发方使用同作用域 `ActionSceneClient.runScene`。事件仅带业务参数，可信调用者与项目由组合根绑定。需要读取对象时用 `prepare` 生成函数输入与私有状态。
5. `consume` 验证业务对象仍有效后落地；`failed` 可明确记录需人工处理的失败。共同内核在两条路径上都检查绑定、生命周期及授权；建议不自动授予操作权限。
6. 如果某个入口依赖判断绑定，用 `required_scene` 声明，让 Host 根据真实使用位置计算可用性。其他插件的兼容判断无需增加 ID 分支。

`bind`、`consume`、`failed` 接收真实 `ActionSceneExecutionContext`。异步等待后、写入前调用 `await caller.beforeEffect()`，再原子核对 owner 的对象版本；它重新检查原调用者、取消、场景与判断注册及权限，回调返回或抛错后不能继续写入。`bindings`、`targets`、`prepare`、`availability`、`configuration_availability` 是只读回调，允许普通查询及查看原授权目录里的判断/写动作元数据，拒绝直接写入、嵌套写动作和付费查询；宿主从已注册目标读取操作与费用，不接受插件自报的替代值。场景经 `services.actions` 发起嵌套调用时仍保留原场景控制。场景不是动作，不取得模型、后台执行或动作专属查询委托的资格。

Inbox 的显式判断与 Feed 入箱事件已这样接通，参考 `plugins/native/inbox/src/scenes.ts`、`apps/local-host/src/inbox-scene.ts` 及 `tests/inbox-automatic-scenes.test.ts`。Feed 各触发源通过组合根注入 `feedOptions.inboxJudgment`，共享绑定但不共享待处理队列。

要让用户在系统判断编辑器里直接启用，场景声明 `configuration_permissions` 并提供 `targets(caller)`，返回原配置位置、名称、链接和 revision。系统绑定会携带准确场景提供方及 `expected_revision`，原 `bind` 必须在同一存储中原子核对；null 只代表业务已提供但尚未绑定的固定位置。发现过程不新建规则，停用保留原引用。仅启用所需的额外权限用 `activation_permissions` 声明，详见 SDK。

迁移边界：Home、Inbox、Feed、工作流、角色与内置 Agent 及系统规则编辑器都经同一目录和共同场景；Manifest 不再有 `behaviors`、`function_scenes`、`judgment_subjects`；不要用 `requires: functions.evaluate` 作为接入方法。各消费者的现状与证据见迁移清单。

## 接到插件事件总线

只给经 Plugin Runtime 启动的插件。总线在 `apps/local-host/src/plugin-platform.ts` 的 `createPluginPlatform`，由 `project-plugins.ts`（内置）与 `installed-plugin-host.ts`（已安装）启动。

发布者：

1. 事件 id + payload 形状写进合同（`workspace-artifacts` 一类），让订阅方不 import 你的插件包。
2. Manifest `events.publishes`。
3. `PluginDefinition.event_types`：每种一个 `validate`。
4. `start()` 里 `context.services.events.publish(...)`。

订阅者：

1. Manifest `events.subscribes`，`from_plugin_ids` 写死来源，不许通配。
2. `start()` 返回 `onEvent`。

宿主事件（X-6，S-54）：宿主自己发的事件，现在有两条（类型与载荷在合同 `platform/plugin`）：

- `host.review.settled@1`（`HOST_REVIEW_SETTLED_EVENT`、`HostReviewSettledPayload`）：只发给发起这个审查的那个安装。
- `host.workspace.changed@1`（`HOST_WORKSPACE_CHANGED_EVENT`、`HostWorkspaceChangedPayload`）：插件发起、人批准的工作区操作执行完（成功、失败、不明）时，或 Agent 经人批准的写入在本项目的某个工作目录里执行完时，广播给本项目里订阅了它、持有 `workspace:read` 的每个安装。载荷只有 `{ workspace_id, cause }`；收到就重读那个工作区，不要按 `cause` 分支。

1. Manifest `events.subscribes` 写 `{ event_type_id: "host.review.settled", type_version: 1 }`（或 `host.workspace.changed`），不写 `from_plugin_ids`（写了读 Manifest 时就拒绝）。订阅 `host.workspace.changed` 还要在 `permissions` 里声明 `workspace:read`，没声明读 Manifest 时就拒绝；人关掉这项授权就收不到。
2. 同一个 `onEvent` 接收：`event.source_plugin_id` 是 `"host"`，`sequence` 是 0；`correlation_id` 在 `host.review.settled` 上是 `review_id`，在 `host.workspace.changed` 上是 null。
3. 只在插件运行时投、至多一次，不落库、不重投，停着就错过：拿 `operation_id` 读操作的现状，不要把这条事件当唯一的事实来源。

构建期 Native（Feed/Inbox/Pages/…）没有这条总线。不要为了「完整」给它们加 `events:`。Integration 的进来走 Signal，不是这条总线。Functions「事件去向」也不是。

Workbench 标签选中是另一种纯 UI 通知：Host 在当前插件根节点派发 `molis-work:select-item`，`detail.itemId` 为对象 ID，回到插件列表时为 `null`。Pages 等插件通过自己的公开 HTTP 读取对象并恢复编辑器；切换时要保存未落盘输入，忽略过期读取。要的对象读不到（已删除）时：在条目本来的位置用自己的话说明（`mw-alert`，留在页面上，不用会消失的轻提示），并在插件根上发 `molis-work:item-unreadable`（`{ itemId }`，冒泡），工作台就不会按标签名给这个面命名、助理也不会把它当「正在看」带上；`detail.quiet` 为真时是人没要的重开（重新载入、后退），只发事件、不出声。读被 Host 的路由拒绝（403、`actions.*` 码：没有授权，或项目停用了这个插件）不是「已删除」：对读取请求把 `host.readRefusal(status, code)` 的返回当作错误文字（空串表示不是这类拒绝），照样放在条目本来的位置、照样发 `molis-work:item-unreadable`，且重开时也要说（条目还在，人可以去授权）。这个 DOM 通知不承担跨插件业务写入，也不是 Plugin Runtime 事件合同。

## 信息整理的 Host 组合

Inbox 的 `GET/POST /api/inbox/pages` 由 Host 注入当前项目。POST 接收 `request_id`、`entry_ids`、`title`、`instructions`；Host 从 Attention 解析 Feed 正文，再调用 Pages 包的 `generatePagesFromMaterials`。Pages 自己保存输入快照、生成收据和文档，同一请求不能替换要求或覆盖后续编辑。失败可恢复，生成成功不自动完成 Inbox。

`POST /api/assistant/plan` 只产生规则或写作方案。Workbench 确认按钮调用既有判断规则 / Feed / Inbox 动作；不是外部 MCP，也没有第二份规则或文稿状态。真实写作模型由 `hostCompleteText` 提供；缺配置或网络失败明确报错，不能返回占位文稿。具体配置、实操与边界见 [闭环规格](../../specs/archive/feed-inbox-pages-loop/spec.md)。

## app 一等（Coding 族）

已注册到当前项目 Runtime 的路由按 Manifest 和实际 contribution 自动分发，Web 外层和内部适配器均不再维护插件 ID 白名单。业务 HTTP 使用 `bindPluginActionRoute` 转调统一动作；生命周期仍由 supervisor 管理。新实例追加注册不应覆盖已有路由；停用后的请求不得重新启用实例。内置项目启用检查、控制令牌、origin 与一次性请求键继续生效。`/restart`、`/release-quarantine`、`/upgrade` 保留给 Host 生命周期，业务路由避开这些路径；不要在 Host 为新插件增加同名字段的结果加工。

`kind: "app"` 必须真的经 Plugin Runtime `start()`。今天：Coding、Files、Git、Diff、Text stats（Shelf 是 `native`，同样由监督器启动）。启动在 `apps/local-host/src/project-plugins.ts` 的监督器条目；Coding 族的工作面由 `project-plugin-stages.ts` 按声明画（Shelf 的由 workbench 渲染）；`/api/plugins/<plugin_id>/` 由 `project-plugin-http.ts` 的 `handleProjectPluginHttp` 转给运行中的插件，它不认识任何插件，也不接受调用方塞进路由前后的步骤；工作区的变化（含项目设置里换目录）经 `host.workspace.changed@1` 广播给订阅的插件，Files 收到后重新确认浏览目录。插件跑没跑起来，按插件从监督器读（`projectPluginProblem`）。

`start(context)` 返回 `kind: "app"`，并且：

- Manifest 每条 `views` → `contribution.views`
- 每条 `routes` → `contribution.routes`
- 每条 `actions` → `contribution.actions`（缺处理器的声明会让启动失败）
- 有 `events.subscribes` → `onEvent`
- 有 `ports.inputs` → `onUpstreamReady` / `onUpstreamUnavailable`

缺一条或多一条都是启动失败，只影响自己。`stop` 不消耗崩溃恢复额度。

停止以后（BL-411）：`stop` 一开始，这次激活就已撤下，钩子里调服务照常被拒、照常抛错，钩子可以据此知道哪些事已经做不了。钩子返回以后，插件留下的定时器、监听器再调 `services` 上的方法，服务照常拒绝，但不抛错：同步方法返回 `undefined`，异步方法返回一个永远不结束的 promise。宿主按安装与世代计数，每个方法第一次写一行 `stopped_service_call` 日志，只记插件、安装、服务和方法名。停止前发出、停止后才结束的调用照常给它自己的结果；在处理器还没返回的动作、消费场景、作业，或还没答复的路由里调（停止前就在跑的那次调用，或重启后的新激活拿着旧激活的句柄调），被拒也照常抛错，那次调用的发起方会收到。所以漏清的回调不会让宿主进程退出，但仍要在 `stop` 一开始清掉会调服务的定时器和监听器：它们停用后白跑；要用返回值的同步方法（如 `storage.get`）拿到 `undefined`，插件自己接着用会出错。

路由也是一次调用（BL-403）：Plugin Runtime 派发路由时给它记一个和动作同样的作用域，处理器答复以后这次调用结束。激活撤下时（停用、崩溃、重启），还在等的请求由 Runtime 当场答 403（`actions.forbidden`），这次调用随之结束，处理器之后再调服务照上一段什么也不做；谁留着旧激活的路由再调，也是 403，处理器不会跑。流式路由（`stream: "ndjson"`）不提前答，由路由器取消那次调用（`actions.cancelled`）。路由处理器抛出带我们的码的错误（`defineErrorCodes` 声明的、`ActionError`，别的包里同样形状的也算），Runtime 按它的 kind 答，响应体带码和 `details`（BL-404），手写路由不用自己写 catch；没有码的错误交给宿主，答通用的「请求未能完成」，不带原消息。

Text stats 是最小完整 app：一个必选输入口、一个 `navigator` 入口加一个 `stage` 视图、无存储、无事件。新端口消费者先抄它的声明形状，再抄 Diff 的 `input_groups`。默认连线把它的输入口接到 Files 的 `before` 快照（它的输入口声明 `default_source`）；默认连线现在只在随 Host 发布的插件之间生效：已安装的插件即使照抄 `default_source` 也不会自己接上（用户 2026-10-16 定：暂只在随宿主发的插件之间；装插件时的同意流程有了再议；2026-10-18 改：这是只给内置的特权，要改成按声明与授权，见 `specs/repository-anti-corruption/spec.md` §1 的 2026-10-18 各行，改完之前仍按此）；不写 `default_source`，新插件的输入口也不会自己接上，要接就由人在成果库详情把某一版接给插件输入。端口何时投递见 [elements.md](elements.md)。

宿主动作由 Module/Host 自己登记（Goals、Agent Host），不是插件包自己登记一份。插件只 `requires` / `capabilities.consumes`，宿主动作（模型起草 `agent.draft-text.v1`、工作区读取、Git 的暂存与操作准备及两项读取、Agent Host 的会话与轮次）和调别的动作一样经 `services.actions.invoke` 调，调用之前可用 `services.actions.availability` 只读查它在不在，按本插件自己的授权（起草要 `model:invoke`，Git 的暂存与操作要 `review:git-index`、`review:git-operation`）；宿主那边只有 `registerAction` 一个登记口（R8 删掉了 typed 的 `register` / `registerCapability` 与 `services.capabilities`）。

Agent 会话的一步在等（回信、后台命令、别的会话那一步）时，等待和接续归 Agent Host 的任务图，插件不存副本：读与控制调宿主登记的动作 `agent.collaboration.read.v1`、`agent.collaboration.control.v1`（合同 `packages/contracts/src/services/agent-collaboration.ts`），接续由插件起下一轮来接；开跑被拒时不留言、不动接续。Coding 的 `plugins/native/coding/src/wake-loop.ts` 是现行写法，细节见 [molis-prologue-ai](../molis-prologue-ai/SKILL.md) 第 7 步。

## integration

不要在 Native 插件里写 GitHub/Gmail 分支。清单：

1. `plugins/official-integrations/<id>/`，`definePollingIntegrationPlugin`。
2. Connector Host / Listener Host 登记 Driver 与 Signal Adapter。
3. 设置 UI contribution（账号、whoami）。
4. 权限：`network:…`、需要凭据时 `secret:…`。
5. Feed 只消费 Signal/Item；来源任务留在 Feed。

OAuth、目录连接器：[integrations.md](integrations.md)。

## 数据落哪

| 内容 | 放哪 |
| --- | --- |
| Goal / 注意力 / Feed 消息 | 对应 Module，插件只调公开 API |
| 可同步、可打开的结果 | Artifact |
| 本机文档/问卷/表/置物架/灵光 | `{home}/<id>/<id>.db`，按 `project_id` 分区；不要冒充 Module |
| 凭据 | secret 引用 |
| 给别的插件的瞬时协调 | 事件总线（仅经 Plugin Runtime 启动的插件，≤16 KiB） |

卸载停代码和 binding；已形成的 Goal/Artifact/Signal 引用仍可显示。私人库默认不跟卸载清掉。

## 验证这一步

- `node scripts/workspace-packages.mjs` 无错误。
- 类型：`pnpm --filter @molis-ai/molis-work-plugin-<id> typecheck`
- 定向测试：`node scripts/run-tests.mjs tests/<id>-*.test.ts`
- 点名插件名单的测试仍过。
- 真开 Workbench：插件切换或底栏常驻入口出现、点进主路径、刷新后状态还在、增删后列表自己更新且不整页闪白。

## 项目设置

跨插件读当前项目配置，先在 `packages/contracts/src/modules/projects.ts` 定义具名动作，按项声明 consumes，经 `services.actions.invoke` 调，Host 在 `project-capabilities.ts` 根据 runtime.project_id 装配。当前只有关联目录与浏览目录。目录关联复用 catalog，浏览偏好由 Host 持有，UI 在 `project-settings-pages.ts` 及对应客户端；不要建立第二份目录库。完整归属表见 `docs/platform/PROJECT-SETTINGS.md`。


### 工作流内容交接

内容型插件通过 SDK `defineWorkflowContentActions` / `bindWorkflowContentHandlers` 注册内容列表、读取、接收及可选空白创建。角色、输入输出及语义版本来自规范合同；Host 不再维护工作流 SUPPORTED / BLANK_START 或按插件 ID 分发。存量 Feed、Inbox、Pages、灵光已经接入，插件实现位于各自 `content-actions.ts`。

平铺输入的命令（`audiences` 含 `workflow`）可直接作为流程的「动作步骤」，字段由用户映射，编辑器显示字段的 schema `title`，请写上用户看得懂的标题；保存了能力引用的插件用 SDK `defineActionUsagesAction` 上报使用位置，能力库「已用在哪」与 `actions.usages.read` 按合同类型发现，Host 不维护名单。

配置引用会固定提供方和动作版本；停用或升级不改写旧引用。普通 Runtime 插件只需 Manifest actions 与 start 返回 handlers，工作流目录即可发现。Native 仍由组合根注入数据 owner，不能把其业务实现放回工作流 HTTP。通用 schema 步骤映射仍未完成，不把该内容协议解释为所有能力都已可连线。

## 异步提交

等待模型/网络的动作按 `scheduling: "concurrent"` 执行，读快照 → 等待 → `await caller.beforeEffect()` → 版本比较提交。嵌套调用使用 `retainActionAuthority(caller, ownDefinition, caller.beforeEffect)`，同时保留外层注册、权限和生命周期约束；自己的动作可省略 `provider_id`，平台使用本次分发解析出的提供方，其他动作必须明确提供方。来源拉取还需逐来源独占，不能只把串行标记改掉。被撤权或取消后，不写失败记账；此前已发出的外部操作保留未确认状态供恢复。

### 已授权材料的提取

插件需要文字/HTML/PDF/OCR/媒体材料时，Host 执行的 Runtime 插件声明 `materials:read`，用 `context.services.materials.extract({ file_name, bytes }, options)`（上传的文档文件一批读出用 `readDocuments`，同属 `materials:read`）；取公开链接另声明 `materials:fetch`，用 `readSource(url, options)`；`imageTextAvailable()` 随 `materials:read`，只回答本机能不能识别图片文字。读本机页面声明 `materials:fetch_local`，用 `readLocalPage(url)`（只到 `127.0.0.1`、`[::1]`、`localhost` 的 HTTP，宿主自己的端口不行）；需要再读一次用户导入的原文件，声明 `materials:original`，导入的动作里 `claimOriginal(recordKey)`，之后 `readOriginal(recordKey, { maxBytes })`、`releaseOriginal(recordKey)`，路径只由宿主入口交来、插件给不出。各项方法独立暴露，沙箱与升级预检没有材料服务。只能在自己安装的、声明对应权限且 `scheduling: "concurrent"` 的动作内使用；身份、signal 和 beforeEffect 由运行时取，不从业务参数提供。上传的 Base64 用 SDK `decodeMaterialUpload` 解成已授权字节，不在插件再写校验。合同为 `contracts/services/materials`。输入已授权字节，系统解析器/原生进程归 Host；原件、SHA 引用、业务转换和引用规则留给消费者。检查 coverage 和 truncated，不能把扫描空页或截断当作全文。传递取消，异步返回后与业务写入前复查 beforeEffect；媒体模型下载的 `allowModelDownload: true` 仅在可信 user 调用时生效，agent/mcp/workflow/plugin 一律按 false。灵光的 Host 适配与 onboarding 是当前接入示例，不在插件复制解析器或绕过 Prologue 生成摘要。

Shelf 的 PDF 预览和 OCR 同样复用公共提取口。语言放在 `ocrLanguages`，逐行置信度读取页面的 `lines`；不能拿页平均值冒充每行置信度。用户提示与结果命名留在消费者，多选材料逐项提取，不按第一项忽略其他内容。异步提取完成后先复查原执行与输入 hash，再写结果；取消/撤权也不能被 catch 成失败成果。已终止执行的历史 running 标签不代表进程仍在运行，不自动恢复外部工作。

文档/ZIP 导入使用同一契约的 MaterialDocumentReader：Host 产出原名、格式、内容与 coverage，插件再执行编辑器/领域转换；不把 PagesBody 或产品的图片支持写入解析器。预览与提交使用同一注入端口，解析异步等待可声明 concurrent，写入仍走领域事务、幂等键和 beforeEffect。ZIP/DOCX 依赖仅归 Host，禁止插件再解析一遍或自行启动 worker。

网页捕获使用 MaterialWebsiteReader，Host 负责受限网络与同一 HTML 提取，插件保留材料命名、链接和内容组织。传递 signal / beforeDispatch，每次跳转复核派出，返回后 beforeEffect，再同步校验原对象版本后写入；不要在更早的异步检查中校验完版本便视为永久有效。Shelf 与 Artifacts 是现有消费者。失败保留链接是业务选择，取消/撤权不能被 catch 后当普通失败保存。

HTML 解析也通过既有 Host worker 生命周期执行，不能让主线程同步解析绕过网络超时。网页复用 SDK 的执行生命周期（`createExecutionLifetime`），把异步派出检查、网络和解析包含在同一取消/时限内；Artifacts 的异步 HTML 导入保留原文和自身容量合同，提交前再检查取消和权限。

导入等待网络或 worker 的动作显式声明 concurrent。端口保留 ActionExecutionContext 的 beforeEffect，不能只把 actor / validate_authority 传下去再自己查启用状态；完整检查还包含注册世代、当前权限、宿主生命周期与取消。

账号文档读取复用 Host 的连接器请求生命周期，向 Integration 传递 signal 与每次请求前的 beforeDispatch。元信息返回后读取正文、获取令牌或 OAuth 重试前仍需复查原调用；取消不能被映射成网络故障后重试。最终账号 revision 检查放在异步授权检查之后，保留最初选择的连接，不能接受读取途中重新授权的新账号。

### 动作目录委托：以原调用者的身份调目录里的动作

插件要替眼前这个调用者去调目录里的另一个动作（工作流程那样“目录里有什么就调什么”），Manifest 声明权限 `actions:delegate`，在自己的并发动作里用 `context.services.actions.directory`：`discover()` 列出能调的动作，`invoke(reference, input, control?)` 调其中一个，`check(reference, input)` 只核不调：按 `invoke` 会固定的那个提供方、同样的拒绝（够不到的目标是 `actions.dependency_missing`；原调用者对这个目标的复查也照样问，MCP 客户端撤回的授权是 `mcp.action_revoked`，助理被关掉的动作是 `assistant.action_revoked`），再用目标的入参 schema 校验（不合是 `actions.input_invalid`，与真调用时一样），不运行目标、不写调用记录，用来在记下“已尝试”之前先挡掉坏输入。这个服务和别的权限一样按安装授权，不因为是内置而有；没声明就没有 `directory`，声明了但没授权（写成可选权限、用户没勾上），每次 `discover` / `invoke` / `check` 都被拒（Home 实例是 `actions.forbidden`），撤权后正在等的调用也不交回结果。只能在本安装自己正在执行的动作里用，后台任务、别的安装的动作、动作结束后的迟到调用都拒绝（`actions.forbidden` / `actions.expired`）。嵌套调用的调用者是原调用者换成 `workflow` 受众，权限一个不多一个不少（用户 2026-10-20 定：不再收窄到插件自己的授权），调用记录行带 `delegated_by`（插件 id）。原调用者的 `allowed_actions` 和 `validate_authority` 也随它带过去，所以嵌套调用照样受原调用者的授权范围约束，到得了哪些动作取决于谁发起了原调用：本人在页面上发起的，`allowed_actions` 覆盖本人能到的全部动作，只剩“目标向 `workflow` 开放、原调用者有它要的权限”这两条，经插件自己的项目路由（`bindPluginActionRoute`）发起的也一样：插件只要持有它自己那个动作的权限，目标要的权限归本人（这只对持有 `actions:delegate` 的插件；没有它的插件，路由动作里的嵌套调用带的权限仍要插件自己也持有；`invokeQuery` 的查询委托不变，持有 `actions:delegate` 也照样收窄到插件自己声明并被授予的权限）；MCP 客户端发起的，`allowed_actions` 只含该客户端已授权且对 mcp / agent 开放的动作，每个目标还要过客户端自己的授权复查（拒绝码 `mcp.action_revoked`），所以只到得了它自己被授权的动作；助理发起的同样带 `allowed_actions`，只到得了对助理开放的动作。原调用者本身是 `plugin` 受众（别的插件用它自己的授权调进来）的一律拒绝，免得借这条路放宽成工作流受众。插件经 `services.actions.invoke` 调自己的动作时，调用者是 `user` 受众、权限是插件自己的授权，不在这一条之内被拒，但它的 `allowed_actions` 只含本插件的动作与 `required_actions`，所以从这样的自调用里进入的委托只到得了本插件自己的动作，委托到别的插件的目标被拒。目标动作要向 `workflow` 开放（只核这一个受众，与工作流程一样）；原调用者缺的权限、目录里没有或不止一个提供方的，同普通调用一样被拒。嵌套调用沿用原调用的调用号（`call_id`），按调用号查调用记录会同时看到原调用和它委托出的调用（后者带 `delegated_by`）。取消、停用、撤权都在每次 await 前后检查，交回结果和业务写入之前仍要 `await caller.beforeEffect()`。规则与测试见 `docs/system/SECURITY-INVARIANTS.md` S-43。

### 跨项目读取：`project_reach`

Home 级插件要在本人自己的页面里看到各个项目的内容（Todo 的“所有项目”），在动作上写 `project_reach: "person"`（只能写在 `scope: "home"` 的动作上），Manifest 声明可选权限 `projects:reach`（没声明就拒；用户确认时可以不给，不给时只处理当前项目）。宿主只在本机用户本人的调用里，把此刻在目录里、显示本插件的项目 id 放进 `caller.readable_project_ids`，每次调用现算；Agent、MCP、工作流和别的插件的调用没有这个字段，隐藏了本插件的项目和已删的项目不在清单里。插件只读这个字段，不自己比较 `audience`，也不把输入里的项目 id 当范围（宿主会剥掉调用方带来的同名字段，SECURITY-INVARIANTS S-74）。

插件调自己的动作（`services.actions.invoke`）沿用外层调用的受众（S-73）：Agent 的调用经过插件的代码不会变成本人的；`start` 和定时器里没有外层调用，自调用按 `plugin` 受众，目标动作的 `audiences` 不放行 `plugin` 的就被拒。

### 放置里的关联：`placement_relation`

插件要让放置面板（对象放在哪、关联到什么）列出、挂上、取消它自己保存的“对象挂在某个目标上”这种关系（Goals 的“挂到 Goal”），在同一个关联的五个动作上各写 `placement_relation: { relation, role }`：`list`（这个对象挂在哪些目标上，同时写 `target: { kind, noun }`：目标的对象种类和人读的名词）、`bind`、`release`、`candidates`（能选的目标）、`create`（把内容建成一个目标）。放置服务在目录里按这项声明找动作，不按能力 id，也不点插件的名字；缺哪个角色就是那个操作 `placement.target_unavailable`。一个项目里同一个关联只能有一个提供方在管：两个可用的插件声明同一个 `relation`，放置服务的每个操作都 `placement.relation_ambiguous`，不挑一个、也不混着取。`relation` 是小写词（今天线上只有 `goal`），同一个关联同一个角色只能有一个动作，SDK 的声明检查拦下写错的。不写这项声明的动作，放置服务不会碰。写 `goals.*` 这样的 Goals 动作用 `inGoalRelation(定义, 角色)`（`@molis-ai/molis-work-contracts/modules/goal-actions`）。

### UI 贡献里没有 `plugin_id`

`ui.register` 与启动返回的视图写的是 `UiContributionDeclaration`：没有 `plugin_id`。贡献属于哪个插件由平台按 Manifest 填（`ui:register` 用安装上下文的插件 id，内置的用登记项的 `manifest.plugin_id`），声明里自己写了 `plugin_id`（哪怕写对了）一律被拒（`ui_host.plugin_denied`；启动返回的视图是启动失败；内置的 `registration.workbench.contributions` 里写了，工作台装配直接抛错，信息里有插件和贡献 id）；贡献 id 不在 Manifest 的 `ui.contributions` 里同样被拒。

### 用本人的服务账号发请求

插件要以本人身份调某个服务（如读 GitHub 通知），不自己存令牌、不让人把令牌填进插件：Manifest 声明权限 `connections:use` 和 `connections.slots`（`{ slot_id, service_id, reason }`，`service_id` 只能是平台登记了的服务，名单是 `CONNECTOR_REQUEST_SERVICES`：GitHub、Gmail、目录里发到固定地址的服务，和按租户分地址的 Salesforce、Jira、Confluence——地址是所绑账号连接时的那个站点，用 `describe(slot_id)` 读 `origin`），在自己声明了 `connections:use` 的并发动作里调 `context.services.connections.request(slot_id, { url, method?, headers?, body? })`，返回 `{ status, headers, body, authenticated }`。槽绑哪个账号只由人选（`connectors.plugin_slot.bind@1`，只对 `user`）；绑了的由宿主加凭据、插件看不到，没绑就不带凭据。一条记录一个账号时槽写 `binding: "per_record"`：人按项目为一条记录选账号（`bind@2`），插件请求时写 `record_key`，用 `describe(slot_id, record_key)` 读有没有绑、`release(slot_id, record_key)` 在删记录时解除，不能自己绑。地址只能是该服务登记的来源之一，不能自己写 `Authorization`、`Cookie`、`PRIVATE-TOKEN` 一类收凭据的头，跳转原样交回，只读动作只发 GET/HEAD；拿到结果后、写业务记录之前照样 `await caller.beforeEffect()`。沙箱插件经 broker 用同一份客户端，操作要在 `effects.connections` 里写出用的槽（S-60）。写法见 [插件开发手册](../../docs/platform/PLUGIN-DEVELOPMENT.md#用本人的服务账号发请求servicesconnections)，规则与测试见 `docs/system/SECURITY-INVARIANTS.md` S-57、S-69、S-71。

### 项目插件的闹钟、后台 Agent 与通知

使用 [公共后台服务](../../docs/platform/PLUGIN-DEVELOPMENT.md#项目后台调度与投递)：自己的业务记录用 `services.project_database`，闹钟通过 `services.scheduler.join(transaction, writer)` 同笔提交；在 `background.wakeups` 声明向 plugin 开放的唤醒动作和理由。当前安装元数据用 `services.installations`，等待一轮已声明角色的 Agent 用 `services.agents.run`，同笔投递用 `services.notifications.deliver(transaction, input)`，提交后等待回执的 `settle()`。各自声明对应权限，不从业务输入拿身份或路径，不使用已移除的 typed Schedule 入口。

后台动态调用用 `services.actions.dependencies`（`actions:invoke`）：只持有本安装自己的权限与 plugin 受众，不能借用前台调用者的委托目录。输入校验、固定提供方和版本在保存业务记录前完成；派出和提交前再次复核权限。安装变化、停用、取消或只读上下文均不能写结果或失败账。Schedule 的 `createSchedulePlugin` 是实际消费示例，不能在宿主另开一个以插件命名的后台入口。
