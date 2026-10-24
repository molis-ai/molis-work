# PG-017：沙箱插件经 broker 拿到宿主服务（设计稿）

状态：设计已由统筹会话审定（2026-10-23，防腐线 ac-sandbox-sched 片，PG-017 组：PG-017、PG-102～104、PG-106 与 V-20）；P0 的一部分在 #1139 做了（Manifest 一半，见 §4 第 1 条与 RAC-238 的拆分），其余按分片排队；P2c（主人文件，S-65，项目里与 Home Runtime 里各一支，RAC-350～359）已在本地分支 `claude/ac-pg017-p2-owner-files` 做完（叠在 P2b #1144 之上，统筹 10-24 要求这条线在积压清掉之前不开新 PR），§3.6 已按用户 2026-10-24 的决定改写。原先叫 P2c 的“材料联网（BL-492）”改名 P2e（分支 `claude/ac-pg017-p2-fetch` 名字不改，统筹 10-24 裁定）。代码按 main `c68071cdc` 核过，`services.project_statements`（#1119，S-59）按已定稿算。

## 1. 现状

### 1.1 沙箱插件是什么、怎样拿到服务

`execution: "sandbox"` 的 `PluginDefinition` 现在只有一个来源：创作台生成的插件（`apps/local-host/src/plugin-builder/installed.ts` 的 `sandboxedPluginDefinition`；创作台随 BL-377 删除重做，沙箱这一项照旧，见 privileges.md PG-017 的状态格）。形状是两层：

- **宿主一侧的代理**：`start(context)` 是宿主进程里的代码，拿到的 `context.services` 和宿主内运行的插件是同一种东西（按 Manifest 声明和安装授权建出来，停了之后经 `servicesUntilStopped` 变成空操作并计数）。它把其中几项装进 `SandboxServices`（`storage`、`projectDatabase`、`interaction`、`capability`、`network`）交给 `createSandboxRunner`。
- **沙箱里的代码**：Seatbelt 进程，没有环境变量、不能写文件、不能起子进程、不能联网，只能经 `SandboxBroker` 调 SDK 方法。broker 的闸门是 `permit(key, value)`：这次操作的合同 `effects` 声明了，**并且**安装时人批准的 `grants` 也有，两样都有才放行（`packages/plugin-sandbox/src/broker.ts`）。

所以“沙箱插件拿不到某项服务”有两处原因，要分开看：① 宿主侧**没建**这项服务（条目检查遇到 `definition.execution === "sandbox"` 就抛错或不建）；② broker **没有**对应的 SDK 方法。PG-017 说的是 ①，要做的是 ① 和 ② 一起补。

### 1.2 每项服务的排除处与声明在哪

| 服务 | 排除处（main） | 宿主内运行的插件怎么拿到 | 声明在哪 |
| --- | --- | --- | --- |
| 模型 `services.model` | `plugin-model-service.ts:24` | Manifest `model:read`/`model:invoke` + 安装授权；`complete` 只能在**本插件自己的并发动作**里调（`packages/plugin-runtime/src/model-service.ts` 的 `currentPluginAction()`），提示词必须是登记过的指令（`InstructedPrompt`） | Manifest ✔ |
| 材料 `services.materials` | `plugin-materials-service.ts:19` | Manifest `materials:read/fetch/fetch_local/original` + 授权 | Manifest ✔ |
| 连接 `services.connections`（协调的清单里没列，同一批排除，S-57） | `plugin-connections-service.ts:14` | Manifest `connections:use` + 槽位 | Manifest ✔ |
| 后台作业 `services.background` | `plugin-background-service.ts:8` | Manifest `actions[].background_job` 或 `background.jobs` | Manifest ✔ |
| 插件指令与方法（V-20） | `plugin-instructions.ts:33` | `PluginDefinition.instructions`/`methods`（正文），Manifest `methods`/`agent`（声明） | 定义 + Manifest；PG-051 P2 归到唯一登记口 |
| Home 库 `services.database` | `plugin-database-entries.ts:34` | 宿主启动名单的 `databaseFor` | **只在条目上**（PG-022） |
| 私有文件 `services.files` | `plugin-files-entries.ts:12` | 条目 `files` | **只在条目上**（PG-102、PG-104） |
| 主人文件 `ownerFiles` | `plugin-owner-files-entries.ts:40` | 条目 `owner_files` | **只在条目上**（PG-102、PG-103） |
| 模型设置 `services.model.configuration` | `model-configuration-entries.ts:11` | 条目 `model_configuration` | **只在条目上**（PG-102） |
| 生图 `services.imageGeneration` | `plugin-image-generation-entries.ts:10`、`plugin-image-generation-service.ts:15` | 条目 `image_generation` | **只在条目上**（PG-102） |
| 项目清理 | `plugin-project-cleanup.ts:36` | 条目 `project_data`（`purge` 是宿主调的函数）；PG-106 的 `onProjectDeleted` 钩子已在 C4（10-21）删掉 | **只在条目上**（PG-022、§4 m） |

分两类，决定了能不能在这一组里做：

- **Manifest 已经能声明的**（模型、材料、连接、后台、指令/方法）：沙箱一侧缺的只是 broker 方法和去掉排除，权限仍按 Manifest 与授权查，这一组可以单独做完。
- **只在宿主条目上声明的**（Home 库、文件、主人文件、模型设置、生图、项目清理）：沙箱插件没有“条目”——它不是宿主的目录里的东西——所以没有地方写声明，这几项**要等 PG-022、PG-102 把声明搬进 Manifest** 才有东西可查；在那之前给它们开口，就得让宿主为沙箱插件手写一份条目，正是 10-18 要拆掉的私路。

## 2. 设计原则

1. **沙箱是安装信任，不是另一套权限**（10-18 同等待遇）。服务对象是同一份：同一段代码按同一份 Manifest 声明和安装授权建出来，宿主的 `pluginModelFor` 等去掉 `execution === "sandbox"` 这个分支；`execution` 留着，只管安装时要不要明确授权、跑不跑沙箱（`install` 对 `bundled` + `sandbox` 拒绝等现有规则不动）。沙箱代码拿到的不是服务对象，而是 broker 方法。
2. **两道门串联，缺一不可**：① broker：操作合同的 `effects` ∩ 人批准的 `grants`（现有 `permit`，新增服务各加一个效果键）；② 宿主服务自己的检查（Manifest 权限、`context.requireGrant`、`assertActive`、动作作用域、调用的 `beforeEffect`）。①不替代②：合同声明了、人批准了，但 Manifest 没声明权限或授权被撤了，照样拒绝。
3. **一张映射表，不再每项服务一个宿主分支**：`context.services` 里有什么、合同声明了什么效果，决定 `SandboxServices` 里放什么——由一个函数（暂名 `sandboxServicesFor(context, …)`）统一做，`installed.ts` 里现在手写的那几行（`storage`、`projectDatabase`、`interaction`）并进去。创作台特有的策略（能力依赖、慢操作分道）留在 `installed.ts`。
4. **跨通道只有有界 JSON**：参数形状在 broker 一侧先查（沿用 `projectDatabase`、`interaction` 的做法：参数个数、对象/字符串/数字的上限、未知方法 `sandbox.invalid_request`），结果也有界；不传函数、回调、流、句柄、文件路径、密钥明文；字节一律 base64 且有上限。形状上无法变成 JSON 的服务（§3 的主人文件、后台的回调）要么换成“按操作 id 回到沙箱”，要么不给，并写明理由。
5. **撤权、停用、取消的口径和宿主内插件一样（S-18、S-59）**：每次调用前后、每次写入前问原调用的 `beforeEffect`；卸载、停用、撤权之后，在途和新来的服务调用被拒、不写任何业务记录；沙箱的服务调用超时按 `outcome: 'unknown'` 处理，不重放。宿主侧的服务本来就经 `servicesUntilStopped` 在停后变空操作，沙箱的调用到了那里也一样被计数，不另写一套。
6. **花钱和写东西的效果只给命令**：沿用“查询操作不能声明存储、成果、项目库写入和事件”的规则，`model.invoke`、`connections` 的非 GET、`background`、文件写入、生图都只给 `kind: "command"`；查询只能有只读效果（`model.read`、材料 `read`）。
7. **不给就写明为什么、并且是拒绝而不是缺席**：沙箱定义或合同声明了一项现在不给的服务，启动时以带码的错误拒绝（不是静默忽略，也不是现在这种没有码的 `Error`），码里带理由。

## 3. 逐项设计

### 3.1 模型（`model.*`）——这一组里最重的一项

- **broker 方法**：`model.choices()`、`model.availability(selection?)`、`model.complete(request)`；效果键 `model: Array<"read" | "invoke">`，`read` 够前两个，`complete` 要 `invoke`，且只给 `command`。
- **提示词不由沙箱带文字**：`InstructedPrompt` 是 `{ instruction（登记过的指令，含正文）, data }`，宿主按本人在“Prompt 与 Character”里改过的版本取正文再拼 `data`。所以沙箱调用只传 `{ prompt_id, data }`（和可选的 `system` 指令 id），宿主侧按**本插件登记的指令**查回完整的 `InstructionPrompt`；查不到或属于别的主人，`plugin.model_instruction_refused`。沙箱代码送不进一段没登记过的文字。这也让模型依赖 V-20：不登记指令就没有可调的提示词。
- **动作作用域**：宿主内的规则是 `complete` 必须在本插件自己的、声明了 `model:invoke` 且 `scheduling: "concurrent"` 的动作里调用，路由、启动、定时器里调用一律 `model_action_required`。沙箱操作现在只经路由 `studio.call` 到达，所以直接开口会被这条规则拦住。设计：沙箱定义工厂（§2 第 3 条）为合同里**声明了 `model` 效果的每个操作**登记一个 Manifest 动作（`scheduling: "concurrent"`，权限含 `model:invoke`），操作经动作网关进沙箱，broker 的 `model.complete` 在原调用的异步上下文里（`AsyncResource`，已有）转给 `context.services.model.complete`，宿主的检查原样生效。不为沙箱放宽 `model_action_required`。
- **不带**：`onText`（回调）、`request.signal`（用 broker 的）、`images`（字节，第二批 base64 再说）、`configuration`（见 3.7）。结果文字有界（沿用 broker 的响应上限）。
- **授权在哪查**：broker `permit("model", "read"|"invoke")`；宿主 `createPluginModelClient` 的 `requireGrant(model:invoke)`、动作权限、`beforeEffect` 前后各一次。**撤权/停用/取消**：在途的请求被原调用的 signal 取消，结果由 `validateCall` 在提交前再查，迟到的结果不交付（宿主内一样）。

### 3.2 指令与方法（V-20）

- **指令（`instructions`）**：给沙箱插件登记，走 PG-051 之后唯一的登记口（`registerPluginAgentDefinitions`，P2）。理由：模型调用必须用登记过的指令（3.1），不登记就没有模型；指令只给**本插件自己的** `services.model` 用，登记后人能在设置里看到、改，登记表仍是“一个主人一份”，登记别的主人的指令照旧拒绝启动。来源：沙箱定义随包带，宿主不替它手写。
- **角色（`roles`）、方法（`methods`）正文**：**现在不给**（推荐）。它们会进**别的** Agent 的一轮（方法正文是别的 Agent 读到的文字），是提示注入面；宿主内的第三方插件靠“装的时候人确认了这个包”接受这一点，而沙箱插件今天没有对应的安装确认页（PG-001：外部插件没有统一安装确认）可以列出它们。所以条件是：安装确认能列出“这个包要给你的 Agent 加这些角色/方法”之后再给（BL-493）。这里是 10-18 同等待遇里“只有安装信任不同”的那一条的具体落点，**是要统筹拍板的一项**（第 6 节 Q2）。
- **与在途 PR**：#1124（PG-051 P1）已改 `plugin-instructions.ts`，P2 还要动同一处；V-20 这一项要排在 P2 之后写代码，设计里只定方向。

### 3.3 连接（`connections.request`）

- **broker 方法**：`connections.request(slot_id, request)`；效果键 `connections: string[]`（槽位 id）。请求/响应本来就是有界 JSON（`PluginConnectionRequest`/`Response`），形状最适合。
- **授权**：broker `permit("connections", slot)`；宿主 `createPluginConnectionsClient` 每次请求再读授权（S-57）、槽位绑定由人在设置里做。**密钥不入沙箱**：宿主按槽位取凭据，响应里含凭据的照旧拒（S-57 已有的检查）。
- **与沙箱自己的网络的关系**：`network.request` 是沙箱直接发请求、域名要批准；`connections.request` 是宿主用人绑定的账号发请求，目标由槽位决定而不是由沙箱代码给域名。两条路各自的闸门不互相替代。
- 只给 `command`（写请求）和 `query`（GET）的区分按请求方法：非 GET 要求操作是 `command`。

### 3.4 材料（`materials.*`）——要先过网络这一关

材料服务里的 `readSource`/`extract(url)`/`readLocalPage` 是**宿主替插件去抓网页**。沙箱的网络是“精确批准的域名、443、不跟重定向”（`createHttpsProxy`），如果把材料抓取原样开给沙箱，就绕过了这道门。设计：

- **第一批只给不联网的部分**：`imageTextAvailable()`（只读状态）和 `readDocuments`（字节来自沙箱已有的存储/成果，不联网）。
- **联网的 `readSource`/`extract(url)`**：只在 broker 额外对 URL 的主机做 `permit("networkDomains", host)` 之后放行，**且**材料读取器要接受“允许域名列表、不跟出列表外的重定向”这个选项（现在没有，要在 `material-source-providers` 里加）——这个宿主侧改动做完才开，登记为 BL-492（分片叫 P2e）。
- **不给**：`fetch_local`（读本机页面，等于让沙箱探本机网络）和 `original`（原文件登记表，句柄是宿主文件）——理由写进拒绝的码里。
- 授权：broker `permit("materials", "read"|"fetch")` + 上面的域名门；宿主 `createPluginMaterialsClient` 的权限与 `assertActive`。字节结果 base64、有界。

### 3.5 后台作业（`background.*`）

宿主内的 `background.start(work)`/`keep(job, work)` 收的是**回调**——宿主进程里跑的函数。沙箱里没有可交给宿主的函数。设计：沙箱版收的是**操作 id + 输入**，宿主侧的 `work` 是“回到这个沙箱的 runner 去调这个操作”（带上后台执行自己的 signal 与 `beforeEffect`）。

- **broker 方法**：`background.start({ operation, input })`（受理一次后台执行，返回执行编号）、`background.cancel(id)`；周期作业由 Manifest `background.jobs` 声明、绑定到合同里的操作（`keep` 由定义工厂在 `start` 里替它调，不由沙箱调）。效果键 `background: string[]`（操作 id），只给 `command`。
- **runner 要多一条道**：现在 runner 按 `quick`/`slow` 分道（模型调用不挡别的读写）；后台执行用自己的一条，进程退出后下一次受理再起，已受理的不重放（`outcome: 'unknown'`）。
- **删项目、卸载、停用时**：平台按项目停掉受理的后台执行（PG-038 已有），沙箱一侧的操作经同一个 signal 取消，沙箱进程随 `stop()` 终止；取消后不再写业务记录。
- 这一项依赖 runner 的新道，放在第三批。

### 3.6 私有文件（`files.*`）、主人文件（`ownerFiles`）

- **`files`**：形状是字节读写（`list/read/create/remove`），可以做成 base64 且有上限的 broker 方法；**但声明只在条目上**（PG-102），且有两套服务要合成一套（PG-104、§4 n）。所以：等 PG-102/104 把声明放进 Manifest、文件服务合成一套之后，沙箱经 broker 拿同一套（BL-491）；这一组里不给。
- **`ownerFiles`**（P2c，S-65，用户 2026-10-24 定：给，有界）：沙箱包在 Manifest 里声明 `owner_files`，经 broker 读写自己的文件。**不**把宿主的 `rootPath()` 和 writer 回调递进去：沙箱 SDK 只有 `stat`、`list`、`read`（一个文件，至多 256 KiB，没有就是 `null`）、`write`（至多 16 步，每步是 `mkdir`、`write`、`replace_atomic`、`copy`、`remove`、`set_access` 之一，字节是 base64，每个文件 ≤ 256 KiB，一次调用合计 ≤ 512 KiB，`list` 至多 1000 项），路径一律是相对路径，由宿主已有的 port 按声明的顶层条目查（越界、链接、硬链接、特殊节点、非严格相对路径全部拒绝）。效果键 `ownerFiles: ["read"]` / `["read", "write"]`，查询不能写；写在 broker 一侧先等这次调用的 `beforeEffect()`，宿主客户端自己再查一遍授权与动作作用域。
  - **根放哪里**（统筹 10-24 认可）：宿主内的插件根在 Home 里按插件的店名登记；沙箱包是装进来的，没有登记项，所以根是这个安装自己的目录，`<store_name>`（Manifest 的）是里面的一层。**项目里**：`<Home>/projects/<项目>/plugin-files/<安装>/<store_name>/`——按项目、按安装各一份，删项目时随项目目录一起删。**Home Runtime 里**（统筹 10-24 追加：用户定沙箱插件有主人文件，Home 级的也有）：`<Home>/plugin-files/<安装>/<store_name>/`，`plugin-files` 登记为宿主的 Home 库（`home-stores.ts`，owner `apps/local-host`），所以 `uninstall --purge-user-data` 覆盖它。项目 ID 与安装 ID 只许是普通目录名（`plugin-sandbox-owner-files.ts`）；没有 Home 的平台启动即拒。沙箱包不经启动名单，只走 `runtime.install`，所以 `assertHomeOnlyDeclarations` 与启动名单上对沙箱条目的拒绝（`assertOwnerFilesEntries`）与它无关；Home 执行器对沙箱定义不走 `ownerFilesGiven`（那是启动名单给的），走 `sandboxOwnerFilesFor`。
  - **卸载时的清理**（统筹 10-24 要求二选一，选“平台清理”：两个执行器的 `uninstalled` 钩子，不是创作台生命周期里的一行）：运行时存下卸载这一行之后调执行器的 `uninstalled(record)`，沙箱安装且这次卸载不留私有数据（`retain_private_data: false`，含装到一半失败被收回）就删这个安装的目录，只删这一个；留数据的卸载留着目录，重装沿用同一个安装 ID，找回的就是它，和私有数据同口径。重装时放弃上次卸载保留的数据（`discard_kept_data`）：运行时存下新的安装行之后调新增的可选钩子 `keptDataDiscarded(earlier)`（`PluginExecutor`，合同里多一个可选成员），执行器删目录，在新代码启动之前。删除前父目录解析到 Home 之外就拒，符号链接不跟（只解开链接本身）。不靠插件自己交 `purge`（RAC-239 的口径）。
  - **和宿主内同样待遇**：同一份 `PluginOwnerFilesClient`、同一个 port，所以 R1（动作之内凭动作与原调用者、动作之外凭安装现行授权）、`beforeEffect`、模式 0600/0700 都不另写一套。

### 3.7 Home 库、模型设置、生图、项目清理

这四项都属于“**Home 级**”：库在 Home、偏好文件在 Home、连接绑定在 Home、清理由宿主在删项目时调函数。沙箱插件今天只会作为项目里的实例运行（创作台的第二个平台 `home: null`，PG-083）。设计：

- **Home 库（`database`）**：项目库已经给了（`projectDatabase`，S-59）。Home 库要等 PG-022 把声明搬进 Manifest；之后沿用 S-59 的子进程语句执行（它只认“库文件路径 + 账本记录”，路径换成 Home 里的库即可），不另写一套（BL-490）。
- **模型设置（`model.configuration`）、生图（`imageGeneration`）**：形状都能变成 JSON（选择、状态、`generate` 的图片结果 base64），但声明只在条目上（PG-102）。等 Manifest 能声明之后，沿 3.1 的办法给；`generate` 是花钱的，只给 `command`。生图的字节结果有大小上限（BL-491）。
- **项目清理**：`purge` 是宿主调的函数，沙箱插件没有。设计：沙箱插件的数据（私有存储、项目库里它自己的表、`files`）都归平台按安装和声明清掉（删项目时平台先停它的后台，再关库、清分区，§4 a），不需要它交一个函数。这一项不是“给沙箱一项服务”，而是确认**声明式清理对沙箱插件同样成立**，测试里补一条；`assertProjectCleanupEntries` 里对沙箱的拒绝改成带码的错误并写明理由。

### 3.8 仍不给的清单

| 项 | 为什么 | 什么时候再看 |
| --- | --- | --- |
| 材料 `fetch_local`、`original` | 前者探本机，后者句柄是宿主文件 | 不打算给，除非有新的形状 |
| 方法与角色的正文 | 进别的 Agent 的一轮，没有安装确认页能列出 | 外部插件安装确认（PG-001）之后，BL-493 |
| Home 库、`files`、模型设置、生图、项目清理的 `purge` | 声明只在宿主条目上，沙箱插件没有条目 | PG-022/102 之后，BL-490/491 |
| `model.complete` 的 `onText`/`images`、材料的字节输入大对象 | 回调/大字节过不了有界 JSON | 第二批，视需要 |

## 4. 前提与顺序

- **#1119**（BL-395，S-59）：数据库那一条的前提，已开；本稿的数据库 Home 库那一项沿用它的子进程执行。
- **#1118**（W5-09，contracts 拆分）：把宿主服务的类型从 `platform/plugin.ts` 搬到 `platform/plugin-host-services.ts`。本组要加的合同（效果键、broker 方法类型）落在 `plugin-sandbox.ts`，和 `plugin-host-services.ts` 不重叠；但 `plugin.ts` 上 #1119 已加了 `project_statements`，和 #1118 同一处，谁后合谁变基。
- **#1124 / PG-051 P2**：V-20 的指令登记排在它之后。
- **PG-022、PG-102、PG-104**（②，声明搬进 Manifest、文件服务合成一套）：Home 库、文件、模型设置、生图的前提，不在这一组里做。
- **PG-083**（生成插件的第二个平台 `home: null`）：沙箱插件要用到 Home 级服务，得跑在有 Home 的平台里。创作台生成的插件现在跑在 `home: null` 的平台上，它们的 Manifest 也只声明 `storage:private`，所以**这一组不改变创作台生成插件今天的行为**；新开口先靠夹具里的沙箱定义验收，生产里要等外部插件有了安装路径（PG-001）才有第二个沙箱来源。

分片（每片一个 PR，S 号用到时先问）：

1. **P0 基础**（#1139 做了下面「做了」的两项，「没做」的三项顺延）：
   - 做了：`sandboxServicesFor` 一张映射（并入 `storage`/`projectDatabase`/`interaction`）；拒绝时的带码错误（§2 第 7 条）：宿主为激活建服务所认的权限名只在 `HOST_SERVICE_PERMISSIONS` 一处，宿主的每一项服务在 `SANDBOX_SERVICE_FATE` 里有一个决定，`NOT_GIVEN` 表覆盖所有不给的权限与 Manifest 声明（含项目成果、过程项、端口、事件），完整性测试看住；项目平台与 Home 执行器启动前共用一个检查。
   - 没做（顺延）：**broker 新效果键与通用的形状上限**——它们只在第一个要新效果键的 broker 方法那一片里才有用，没有方法时只是死代码，所以跟 P1 一起做；**沙箱定义工厂从 `installed.ts` 抽出**——要等创作台的策略和沙箱定义的通用部分能分开，创作台随 BL-377 重做，抽在它前面会抽错，所以不单独做，BL-377 时一并处理；**去掉宿主侧对 `sandbox` 的排除**——每个排除要和它的 broker 方法在同一片里去掉，所以随 P1～P3 逐个去（六个宿主条目里的抛错，等 PG-022/PG-102 把声明搬进 Manifest 时整体重写）。
2. **P1 模型 + 指令**（V-20 的指令部分，排 PG-051 P2 后）：3.1、3.2。
3. **P2 连接 + 材料（不联网部分）**：3.3、3.4 第一批。
4. **P3 后台**：3.5，runner 多一条道。
4a. **P2c 主人文件**（S-65，本地分支）：3.6 的 `ownerFiles`（项目里与 Home Runtime 里，含卸载清理），验收见下面「P2c 验收」。
5. 之后：**P2e 材料联网**（BL-492，分支 `claude/ac-pg017-p2-fetch`，原先误叫 P2c）、PG-022/102 之后的 Home 库/文件/模型设置/生图（BL-490/491）、方法与角色（BL-493）。

## 5. 验收与安全不变量

编号 RAC-230～239（统筹分配）：

| 编号 | 断言 |
| --- | --- |
| RAC-230 | 每项新服务各一例：合同没声明效果 → `sandbox.not_authorized`；声明了但人没批准 → 同；批准了但 Manifest 没声明权限或授权被撤 → 宿主服务自己的码；参数形状不对 → `sandbox.invalid_request` |
| RAC-231 | 停用、卸载、撤权之后：沙箱里在途的和新来的服务调用被拒（或在 `servicesUntilStopped` 里计数），不写任何业务记录（S-18 口径） |
| RAC-232 | 模型：在声明了 `model` 效果的操作所对应的并发动作里 `complete` 成功；在路由里调用被拒 `model_action_required`；`kind: "query"` 声明 `model.invoke` 的合同被拒；没登记的指令 id / 别的主人的指令被拒；沙箱代码不能送进自带文字的提示词 |
| RAC-233 | 指令（V-20）：沙箱定义登记本插件的指令成功，登记别的主人的指令拒绝启动；角色与方法正文按 Q2 的结论（默认不登记）有拒绝本身的断言 |
| RAC-234 | 连接：槽位没在这次操作声明的效果里、人没批准、批准成别的槽拒；非 GET/HEAD 的请求在查询操作里拒；槽位没绑定账号不是拒，是匿名发出（S-57）；凭据头由宿主的真实端口按固定头集合滤掉（S-57 的测试），沙箱一侧的用例用假端口，只断言答复在 broker 一侧重建成纯 JSON；响应超上限拒 |
| RAC-235 | 材料：`fetch_local`、`original` 被拒；联网读取的主机不在批准域名里拒（BL-492 之后补重定向离开域名拒） |
| RAC-236 | 后台：受理的沙箱操作在卸载、删项目、取消时被停，之后不写业务记录；进程死后不重放 |
| RAC-237 | 同一份 Manifest 声明，宿主内运行和沙箱运行，对同一输入得到同一个拒绝码（同等待遇，抽样每项服务各一例） |
| RAC-238（Manifest 一半，#1139 已做） | 现在不给的、由 Manifest 或定义声明的项（模型、指令、连接、材料、后台作业、角色/提示词/技能/方法、目录、唤醒、运行 Agent、通知、已装插件、调用别人的动作、项目成果/过程项/端口/事件）在沙箱定义里声明时，启动以 `sandbox.service_not_given` 拒绝，指明是哪一项、为什么，代码一行不跑；项目平台与 Home 执行器各一例；宿主认的每个权限名要么被给、要么有一行拒绝（完整性测试），没归类的变红 |
| RAC-238（条目一半，PG-022/PG-102 之后；`ownerFiles` 已由 P2c 给） | 现在只在宿主条目上声明的项（`ownerFiles`、Home 库、`files`、模型设置、生图）：声明搬进 Manifest 之后，沙箱定义里声明它们时同样带码拒绝或给出，不再是六处无码的 `Error`；在那之前它们在沙箱里根本没有入口，这一半不算做完 |
| RAC-239 | 声明式清理对沙箱插件成立：删项目时它的私有存储、项目库里的表、后台执行被平台清掉，不需要它交 `purge` |

**P2c 验收**（S-65，统筹 10-24 给 RAC-350～369：本片 RAC-350～359，P2d 用 RAC-360～369）：`tests/security-invariants-sandbox-owner-files.test.ts`

| 编号 | 断言 |
| --- | --- |
| RAC-350 | 沙箱包在项目里这个安装的目录里写、读、列、复制、删自己声明的文件，别处没有 |
| RAC-351 | 操作合同没声明、人没批准、批准成别的、只声明读却要写、查询要写，一律 `sandbox.not_authorized` 且没到宿主；宿主客户端自己的码（查询动作、动作没声明写权限、停用）照常在 |
| RAC-352 | 形状与大小逐项拒绝（路径、步数、字段、base64、单文件 256 KiB、一次 512 KiB），没到宿主的客户端；恰在上限内的通过 |
| RAC-353 | 宿主 port 的拒绝逐项断言：`..`、绝对路径、空段与点段、反斜杠、盘符、未声明的条目、文件条目带子路径、符号链接、硬链接、管道；根之外的文件不读不改 |
| RAC-354 | 服务对象只有 `stat`、`read`、`list`、`write` 四个成员，broker 对 `rootPath`、writer 等一律 `sandbox.invalid_request`，答复里没有宿主路径 |
| RAC-355 | 大文件（256 KiB 加一字节）不读进宿主，目录超 1000 项即拒；调用被取消、`beforeEffect` 拒绝，什么都不写 |
| RAC-356 | 各安装各一份目录；平台没有 Home 时启动即拒 |
| RAC-357 | 项目里：不留数据的卸载删这个安装的目录，同项目里别的安装的不动；留数据的卸载留着目录，同一个安装 ID 重装找回它；重装时放弃保留的数据（`discard_kept_data`）在新代码启动之前删目录；重装后是空的。清理时父目录解析到 Home 之外（`plugin-files` 是指向外面的链接）即拒，链接指向的东西不动 |
| RAC-358 | Home Runtime 里：沙箱包得到 `<Home>/plugin-files/<安装>/<store_name>/`，同一个有界服务、同样的拒绝（未声明的效果、查询写、根之外的路径、错误形状、`rootPath`）；没有项目目录、没有按登记的 Home 库建目录 |
| RAC-359 | Home Runtime 里各安装各一份；留数据的卸载留着，不留的删掉，别的安装的不动；`plugin-files` 登记为宿主的 Home 库（purge 覆盖，`homeStores()` 与钉死的清单一致） |

**安全不变量**：建议新增 S-60（沙箱经 broker 使用宿主服务的总规则：两道门、有界 JSON、撤权后不写、不给的拒绝）一行，承接 S-15 里“沙箱进程没有……”的那句和 S-59 的数据库一条；各项服务的测试挂在这一行的“拒绝测试”里。如果统筹希望每片各占一行（S-60 模型、S-61 连接与材料、S-62 后台），也可以，**请定**。S-15、S-46 里描述“沙箱没有这些服务”的话要同时改成现状。

## 6. 要统筹定的

- **Q1 沙箱插件的模型调用靠“每个声明了 `model` 效果的操作登记一个 Manifest 动作”（3.1）还是别的办法？** 推荐：登记动作。理由：不为沙箱放宽 `model_action_required`，也让沙箱插件的操作和别的插件一样出现在动作目录里（同等待遇）；代价是沙箱定义工厂要生成动作，这是 P0 的一部分。另一种是在路由里开一条“沙箱调用模型”的专用口子，这就是给沙箱开私路，不推荐。
- **Q2 沙箱插件的角色与方法正文给不给？** 推荐：现在不给，指令给；外部插件有了安装确认页能列出它们（PG-001）之后再给（BL-493）。另一种：和宿主内第三方插件完全一样，现在就给——同等待遇的字面做法，但今天没有地方让人在装的时候看到这个包要往他的 Agent 里加什么。
- **Q3 安全不变量一行还是每片一行？** 推荐一行 S-60。
- **Q4 材料联网部分**：是否接受“要先在材料读取器里加允许域名列表选项（BL-492），之后才给”这个顺序，而不是先给 `readSource` 再补？推荐先补后给——先给就是临时绕过沙箱的网络闸门。

## 7. 开工前核对（代码位置有没有被在途 PR 改）

按 `gh pr list` 的文件清单查了 100 个在途 PR 里和本组相关的文件：

- #1119（我自己的 BL-395）：`installed.ts`、`plugin-host-services.ts`、`plugin.ts`、`plugin-database.ts`、沙箱的 README 与 `database.ts`；本稿以它为前提。
- #1118（W5-09）：`platform/plugin.ts`、`platform/plugin-host-services.ts`——见第 4 节。
- #1124（PG-051 P1）：`plugin-instructions.ts`——V-20 排在 PG-051 P2 之后。
- #1112、#1098、#1130、#1076、#1083：与本组的服务文件没有交集（#1076/#1083 只改 `privileges.md` 的 Shelf 行）。
- #1117、#1114、#1107、#1127、#1123、#1064：只在 `SECURITY-INVARIANTS.md` 上有交集，加行时会在同一张表上撞，S 号请统筹统一排。
- PG-106：`onProjectDeleted` 钩子 C4（10-21）已删，本稿不再涉及；PG-102～104 的代码（`plugin-files.ts`、`plugin-owner-files-entries.ts`）在 main 上没有在途改动，但它们的 Manifest 化是前提（第 4 节），不在本组做。
