# PG-017：沙箱插件经 broker 拿到宿主服务（设计稿）

状态：设计已由统筹会话审定（2026-10-23，防腐线 ac-sandbox-sched 片，PG-017 组：PG-017、PG-102～104、PG-106 与 V-20）；P0 的一部分在 #1139 做了（Manifest 一半，见 §4 第 1 条与 RAC-238 的拆分），其余按分片排队；P2c（主人文件，S-64，项目里与 Home Runtime 里各一支，RAC-350～359）已在本地分支 `claude/ac-pg017-p2-owner-files` 做完（叠在 P2b #1144 之上，统筹 10-24 要求这条线在积压清掉之前不开新 PR），§3.6 已按用户 2026-10-24 的决定改写；原先叫 P2c 的“材料联网（BL-492）”改名 P2e（分支 `claude/ac-pg017-p2-fetch` 名字不改，统筹 10-24 裁定）；P2d（材料的 `fetch_local` 与 `original`，S-65，RAC-360～369）在本地分支 `claude/ac-pg017-p2-local-original`（叠在 P2c 上），§3.4 同样已改写。P1（模型 + 指令，S-66，RAC-232、RAC-233）与 P3（后台运行，S-67，RAC-236）合成一个 PR，分支 `claude/ac-pg017-p1-p3`（基于 main，两个提交分开保留；S 号暂定，合入顺序由统筹定）：代码与测试做完，已构建、`pnpm api:update` 过、相关测试过，§3.5 已按下面的决定改写。
P2e（联网读取：BL-492 的读取器域名名单加沙箱一侧，S-93 暂定，RAC-235 的联网半）在分支 `claude/ac-pg017-p2e`（基于 main，P1+P3 已在 main；只推分支，未开 PR），代码与测试做完、已构建。
代码按 main `c68071cdc` 核过，`services.project_statements`（#1119，S-59）按已定稿算。

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
| Home 库 `services.database` | `plugin-database-entries.ts:34` | Manifest `databases.home`（PG-022） | Home Runtime 里给（BL-490，S-91）；项目里拒 |
| 私有文件 `services.files` | `plugin-files-entries.ts:12` | 条目 `files` | **只在条目上**（PG-102、PG-104） |
| 主人文件 `ownerFiles` | `plugin-owner-files-entries.ts:40` | 条目 `owner_files` | **只在条目上**（PG-102、PG-103） |
| 模型设置 `services.model.configuration` | `services.ts` 的 `NOT_GIVEN`（S-60 启动拒绝） | Manifest `model_configuration` + 宿主启动名单绑定 | Manifest 已有声明；沙箱尚不给（BL-491） |
| 生图 `services.imageGeneration` | `plugin-image-generation-entries.ts:10`、`plugin-image-generation-service.ts:15` | 条目 `image_generation` | **只在条目上**（PG-102） |
| 项目清理 | `plugin-project-cleanup.ts:36` | 条目 `project_data`（`purge` 是宿主调的函数）；PG-106 的 `onProjectDeleted` 钩子已在 C4（10-21）删掉 | **只在条目上**（PG-022、§4 m） |

分两类，决定了能不能在这一组里做：

- **Manifest 已经能声明的**（模型、材料、连接、后台、指令/方法）：沙箱一侧缺的只是 broker 方法和去掉排除，权限仍按 Manifest 与授权查，这一组可以单独做完。
- **只在宿主条目上声明的**（Home 库、文件、主人文件、生图、项目清理；模型设置的现行声明与启动拒绝见 §3.7）：沙箱插件没有“条目”——它不是宿主的目录里的东西——所以没有地方写声明，这几项**要等 PG-022、PG-102 把声明搬进 Manifest** 才有东西可查；在那之前给它们开口，就得让宿主为沙箱插件手写一份条目，正是 10-18 要拆掉的私路。

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
- **联网的 `readSource`/`extract(url)`**：只在 broker 额外对 URL 的主机做 `permit("networkDomains", host)` 之后放行，**且**材料读取器要接受“允许域名列表、不跟出列表外的重定向”这个选项（现在没有，要在 `material-source-providers` 里加）——这个宿主侧改动做完才开，登记为 BL-492（分片叫 P2e）。**已做**（P2e，S-93）：读取器的名单是操作声明与人批准的网络域名的交集，见「P2e 验收」。
- **`fetch_local`**（P2d，S-65，用户 2026-10-24 定：给）：沙箱拿不到 socket 和地址，所以不是“让沙箱探本机网络”：插件把一个地址当数据交给 broker，宿主用已有的规则（`material-local-page.ts`：只有 `http://` 的 loopback 名、没有凭据、不是宿主自己的端口、每次重定向再查）判断并去取，回给插件的只有抽出的文字，不带地址、头和 cookie。效果键 `materials: ["fetch_local"]`，只在命令操作里。规则是宿主的一份，沙箱这边不另写 loopback 判断（S-09）。
- **`original`**（P2d，S-65）：句柄是宿主登记表里的一行（插件、安装、项目、插件自己起的键），不是路径，路径不出宿主。认领只能在人驱动的调用里、带着宿主入口交给本安装的那个文件（和宿主内的插件一样）。读取分段：沙箱通道一次带不了 32 MiB，所以宿主客户端加了 `readOriginalRange`（起点、长度至多 1 MiB，broker 只要 256 KiB 一段，返回文件大小和不透明的 `revision`），每一段都是一次完整的宿主读取（动作作用域、授权、`beforeEffect`、路径与文件身份在读前读后各查一遍），第一段的 `revision` 在后面每段带回去，文件中途变了就拒绝，不读成混合内容。我没选“broker 里读一次整份、按段发”：那样后面的段不再过宿主的闸门，撤权后还会继续发。沙箱 SDK 的 `readOriginal(key, { maxBytes })` 是 worker 里对这个方法的循环，和宿主内插件同名同形。
- 联网的 `readSource`（`materials:fetch`）由 P2e 给（S-93），见「P2e 验收」；材料这一块没有仍不给的了。
- 授权：broker `permit("materials", "read"|"fetch")` + 上面的域名门；宿主 `createPluginMaterialsClient` 的权限与 `assertActive`。字节结果 base64、有界。

### 3.5 后台作业（`background.*`）

宿主内的 `background.start(work)`/`keep(job, work)` 收的是**回调**——宿主进程里跑的函数。沙箱里没有可交给宿主的函数。设计：沙箱版收的是**操作 id + 输入**，broker 交给宿主的回调是“回到这个沙箱的 lane 去调这个操作”（带上后台执行自己的 signal 与 `beforeEffect`）。

- **broker 方法**（已做，S-67）：`background.start(operation, input)`（受理一次后台执行，返回执行编号）、`background.cancel(id)`（只能取消自己受理、且目标仍在当前操作声明与人的批准内的运行，返回是否取消了）。效果键 `background: string[]`（它可以起的命令 id 名单），起和取消都只给命令；合同层拒绝：查询声明它、名单指向不存在的操作、指向查询、指向自己还会起后台的命令（只许一层）。输入在宿主接受之前先按目标操作的合同检查；一个沙箱未结束的运行最多 4 个。
- **runner 的新道，决定：不是在一个进程里并行，而是第二个进程（lane）**。现在 runner 一次只跑一个操作（通道上只有一个 active），后台运行如果和前台共用它，一个跑几分钟的运行就会挡住这个包所有的读写。让 worker 并行跑多个操作要重写 runner 的核心（active 变成表、SDK 请求要按操作对应、各自的截止时间与取消），这是整条链上最该保持简单的地方；第二个进程只在第一次受理时起，一次一个操作，用自己的更长的截止时间（`SANDBOX_BACKGROUND_LIMITS`，10 分钟），不带 `background` 服务（一个运行起不了更多运行）。代价：两个进程不共享内存里的状态，包要把需要共享的写进它的存储（后台运行本来就应该这样，宿主内的版本同样“不留状态”）。lane 由起第一个进程的一方拥有（`createBackgroundLane`），`sandboxServicesFor` 经 `extras.backgroundLane` 收到它，没有 lane 就没有后台服务（`service_unavailable`），不会退回到在第一个进程里跑。
- **取消与重放**：取消一个排队中的运行不动正在执行的；取消一个正在执行的运行会结束 lane 的进程（沙箱打断不了运行中的函数），排在它后面的运行一起结束，下一次受理再起新进程，已受理的不重放。
- **删项目、卸载、停用时**：平台按项目停掉受理的后台执行（PG-038 已有），沙箱一侧的操作经同一个 signal 取消，broker 停止时关闭后续受理并取消已受理的运行，正在受理的句柄晚返回也立即取消并答 `sandbox.stopped`；取消后不再写业务记录。
- **没做**：Manifest `background.jobs`（插件活着就一直保持的作业）：`keep` 要由定义工厂在 `start` 里替它调、把作业绑到合同里的操作，工厂在创作台一侧（BL-377，同 P1 的两样），所以 `NOT_GIVEN` 里留一行只管 jobs；生成的插件今天没有带 `background_job` 的 Manifest 动作，也就还起不了运行。

### 3.6 私有文件（`files.*`）、主人文件（`ownerFiles`）

- **`files`**：形状是字节读写（`list/read/create/remove`），可以做成 base64 且有上限的 broker 方法；**但声明只在条目上**（PG-102），且有两套服务要合成一套（PG-104、§4 n）。所以：等 PG-102/104 把声明放进 Manifest、文件服务合成一套之后，沙箱经 broker 拿同一套（BL-491）；这一组里不给。
- **`ownerFiles`**（P2c，S-64，用户 2026-10-24 定：给，有界）：沙箱包在 Manifest 里声明 `owner_files`，经 broker 读写自己的文件。**不**把宿主的 `rootPath()` 和 writer 回调递进去：沙箱 SDK 只有 `stat`、`list`、`read`（一个文件，至多 256 KiB，没有就是 `null`）、`write`（至多 16 步，每步是 `mkdir`、`write`、`replace_atomic`、`copy`、`remove`、`set_access` 之一，字节是 base64，每个文件 ≤ 256 KiB，一次调用合计 ≤ 512 KiB，`list` 至多 1000 项），路径一律是相对路径，由宿主已有的 port 按声明的顶层条目查（越界、链接、硬链接、特殊节点、非严格相对路径全部拒绝）。效果键 `ownerFiles: ["read"]` / `["read", "write"]`，查询不能写；写在 broker 一侧先等这次调用的 `beforeEffect()`，宿主客户端自己再查一遍授权与动作作用域。
  - **根放哪里**（统筹 10-24 认可）：宿主内的插件根在 Home 里按插件的店名登记；沙箱包是装进来的，没有登记项，所以根是这个安装自己的目录，`<store_name>`（Manifest 的）是里面的一层。**项目里**：`<Home>/projects/<项目>/plugin-files/<安装>/<store_name>/`——按项目、按安装各一份，删项目时随项目目录一起删。**Home Runtime 里**（统筹 10-24 追加：用户定沙箱插件有主人文件，Home 级的也有）：`<Home>/plugin-files/<安装>/<store_name>/`，`plugin-files` 登记为宿主的 Home 库（`home-stores.ts`，owner `apps/local-host`），所以 `uninstall --purge-user-data` 覆盖它。项目 ID 与安装 ID 只许是普通目录名（`plugin-sandbox-owner-files.ts`）；没有 Home 的平台启动即拒。沙箱包不经启动名单，只走 `runtime.install`，所以 `assertHomeOnlyDeclarations` 与启动名单上对沙箱条目的拒绝（`assertOwnerFilesEntries`）与它无关；Home 执行器对沙箱定义不走 `ownerFilesGiven`（那是启动名单给的），走 `sandboxOwnerFilesFor`。
  - **卸载时的清理**（统筹 10-24 要求二选一，选“平台清理”：两个执行器的 `uninstalled` 钩子，不是创作台生命周期里的一行）：运行时存下卸载这一行之后调执行器的 `uninstalled(record)`，沙箱安装且这次卸载不留私有数据（`retain_private_data: false`，含装到一半失败被收回）就删这个安装的目录，只删这一个；留数据的卸载留着目录，重装沿用同一个安装 ID，找回的就是它，和私有数据同口径。重装时放弃上次卸载保留的数据（`discard_kept_data`）：运行时存下新的安装行之后调新增的可选钩子 `keptDataDiscarded(earlier)`（`PluginExecutor`，合同里多一个可选成员），执行器删目录，在新代码启动之前。删除前父目录解析到 Home 之外就拒，符号链接不跟（只解开链接本身）。不靠插件自己交 `purge`（RAC-239 的口径）。
    - **清理失败后的定义释放及重装（#1210、#1246 评审补修，RAC-357-U1）**：卸载记录已保存后，即使宿主清理 hook 抛错，也释放这个 `plugin_id` 与发布者签名下的已加载定义，其他插件或发布者的定义不变；失败对象与错误码原样返回，不产生成功收据。再次卸载仍走现有按安装串行的重放路径，重新执行实际清理，保留第一次保存的卸载状态、世代、时间与数据选择，不重新启动或停止代码。移除链接故障后，同安装重放完成实际目录清理，再重放仍安全。
    - 旧记录已经卸载且 `retain_private_data: false` 时，每次重装都在注册新定义、生成和保存新安装之前同步重清，跨宿主重启也一样，不另记「曾失败」。复用 `keptDataDiscarded(earlier)` 的同步能力：先完成现有无副作用输入、部署、清单和 grant 合法性检查；有卸载清理责任却没有同步钩子时，以 `plugin.state_invalid` 拒绝。宿主先确认 KV owner 的删除端口存在，再清理主人文件，成功后才调用 KV owner 的 `deleteInstallationData`；项目执行器经组合参数取得该端口，Home 执行器复用已有 storage。不跨表 SQL、不借用 restore，不改同步 `install` 的形状、安装后再补 grant 的规则、已保留数据的兼容性及回滚规则。
    - 路径拒绝发生在任何删除前时，文件及 KV 均保留；清理执行中后一步出错可以已有部分删除，仍拒绝新安装，保留原卸载事实，不产生新安装行、事件、世代或本次注册的定义，后续幂等重清补完。已有 `ActionError` 原样返回，普通宿主异常在重装拒绝边界转为 `plugin.executor_failed`，不改变卸载本身的错误。无外部清理责任的 `NativePluginExecutor` 无清理 hook，仍可直接重装。旧 `retain_private_data: true` 且本次明确 `discard_kept_data` 的路径仍在保存新安装后通知原同步钩子，既有外部 KV 处理和回滚不变。
  - **和宿主内同样待遇**：同一份 `PluginOwnerFilesClient`、同一个 port，所以 R1（动作之内凭动作与原调用者、动作之外凭安装现行授权）、`beforeEffect`、模式 0600/0700 都不另写一套。

### 3.7 Home 库、模型设置、生图、项目清理

这四项都属于“**Home 级**”：库在 Home、偏好文件在 Home、连接绑定在 Home、清理由宿主在删项目时调函数。沙箱插件今天只会作为项目里的实例运行（创作台的第二个平台 `home: null`，PG-083）。设计：

- **Home 库（`database`）**（BL-490，S-91，已做）：项目库已经给了（`projectDatabase`，S-59）。PG-022 把声明搬进 Manifest 之后，Home Runtime 里的沙箱包按 `databases.home` 拿账本里的库（`openInstalledPluginLibrary`，和装进来的任何插件一样），语句沿用 S-59 的子进程（`ProjectStatementProcess` 的 `record` 为空即 Home 库，引擎换 node:sqlite 的两条连接，没有 S-46 的记录检查，因为整个文件都归这个插件），不另写一套；宿主只做出文件就放手，不留连接。broker 多 `homeDatabase` 效果（和 `projectDatabase` 同一段检查），服务多 `database_statements`。项目里运行的沙箱包不能声明 Home 库（`plugin.declaration_invalid`）。
- **模型设置（`model.configuration`）、生图（`imageGeneration`）**：形状都能变成 JSON（选择、状态、`generate` 的图片结果 base64）。模型设置现有 Manifest 字段 `model_configuration` 已能声明，沙箱还没有其 broker 方法与设置端口，按 S-60 启动即以 `sandbox.service_not_given` 拒绝该声明；不让项目平台静默不给，Home 也不等后续条目校验才报错。正式开放仍属 BL-491，不随本轮修复接入。生图按 PG-102 的前提开放，`generate` 是花钱的，只给 `command`，字节结果有大小上限（BL-491）。
- **项目清理**：`purge` 是宿主调的函数，沙箱插件没有。设计：沙箱插件的数据（私有存储、项目库里它自己的表、`files`）都归平台按安装和声明清掉（删项目时平台先停它的后台，再关库、清分区，§4 a），不需要它交一个函数。这一项不是“给沙箱一项服务”，而是确认**声明式清理对沙箱插件同样成立**，测试里补一条；`assertProjectCleanupEntries` 里对沙箱的拒绝改成带码的错误并写明理由。

### 3.8 仍不给的清单

| 项 | 为什么 | 什么时候再看 |
| --- | --- | --- |
| 方法与角色的正文 | 进别的 Agent 的一轮，没有安装确认页能列出 | PG-001 已做完；BL-493，→ 见 [pg011-pg017-remaining](pg011-pg017-remaining.md) §7 |
| 生图、项目清理的 `purge`（`files` 已在 PG-102 P2b 删去，主人文件 S-64 已给） | 声明只在宿主条目上，沙箱插件没有条目 | BL-491，→ 见 [pg011-pg017-remaining](pg011-pg017-remaining.md) §6 |
| 模型设置 | Manifest `model_configuration` 已有；沙箱未提供对应端口与 broker 方法，声明即带码拒绝 | BL-491，→ 见 [pg011-pg017-remaining](pg011-pg017-remaining.md) §6 |
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
2. **P1 模型 + 指令**（V-20 的指令部分，PG-051 P2 已做完，S-66，本地分支 `claude/ac-pg017-p1-model-instructions`）：3.1、3.2，验收见下面「P1 验收」。落地时定的几处：
   - 宿主两处去掉沙箱的排除：`pluginModelFor`（客户端照 Manifest 与授权建，沙箱与宿主内同一份）、`registerPluginAgentDefinitions`（沙箱也登记指令；角色、Agent 提示词、方法仍由 `SANDBOX_NOT_GIVEN` 的 `agent` 一行在启动时拒，在它之前，所以这里不再另写一道）。`SANDBOX_NOT_GIVEN` 删掉 `model` 与 `instructions` 两行，`SANDBOX_SERVICE_FATE.model` 改为给。
   - broker 方法 `model.choices`、`model.availability`、`model.complete`；效果键 `model: ['read' | 'invoke']`，`invoke` 只给命令（合同层拒绝查询声明）。通道上的类型是沙箱自己的纯 JSON 类型（`SandboxModelChoice/Availability/Request/Result`），不 import 宿主服务类型（创作台隔离编译 G2 在 macOS 上只有 ES 库，见 P2b 的教训）；`choicesJson`、`availabilityJson`、`modelResultJson` 用这些类型接宿主的答复，宿主一改形状即编译不过。
   - 请求只写登记过的指令 id（`prompt_id`、可选 `system_id`）和这次的数据（≤ 200,000 字符），没有文字、图片、回调、信号；指令名单是 `sandboxServicesFor(host, { instructions })` 带进来的 `PluginDefinition.instructions`，名单里查不到的 id 答 `sandbox.instruction_unknown`；别的主人的指令即使进了名单，宿主客户端再拒（`plugin.model_instruction_refused`）。范围（超时、输出长度）不在 broker 钳，由宿主客户端按同一个码拒，保证与宿主内运行的插件同码（RAC-237）。
   - 等模型的操作：runner 对声明了 `model: ['invoke']` 的操作把服务截止时间和操作截止时间抬到宿主的模型上限（10 分钟）之后再加一点（`modelDeadlines`），否则 10 秒的服务截止先到，插件看到的是沙箱超时而不是宿主的拒绝；宿主调用方给的 `limits` 仍优先。
   - **没做、要创作台一侧接线的两样**：① 生成的插件（`installed.ts` 的 `sandboxedPluginDefinition`）今天只有一条路由 `studio.call`，没有 Manifest 动作，所以它还拿不到「本插件自己的、声明了 `model:invoke` 的并发动作」这个作用域；要为合同里每个声明了 `model` 效果的操作登记一个并发的 Manifest 动作（权限含 `model:invoke`），让操作经动作网关进沙箱（§3.1 原设计），并让 Manifest 带 `model:invoke`；② 包怎样带指令正文：`SandboxPluginContract` 没有这个字段，生成的插件现在没有 `PluginDefinition.instructions`。这两样跟「沙箱定义工厂从 `installed.ts` 抽出」同属创作台重做（BL-377）的接线，P0 已把它顺延到 BL-377；P1 在平台一侧完成，测试像 P2a～P2c 一样用带 Manifest 动作的探针包经真实项目平台驱动。
3. **P2 连接 + 材料（不联网部分）**：3.3、3.4 第一批。
4. **P3 后台**（S-67，本地分支 `claude/ac-pg017-p3-background`）：3.5，第二个进程（lane）而不是 runner 并行；验收见下面「P3 验收」。
4a. **P2c 主人文件**（S-64，本地分支）：3.6 的 `ownerFiles`（项目里与 Home Runtime 里，含卸载清理），验收见下面「P2c 验收」。
4b. **P2d 本机页面与原文件**（S-65，本地分支，叠在 P2c 上）：3.4 的 `fetch_local` 与 `original`，验收见下面「P2d 验收」。
5. P2e 材料联网（BL-492，S-93）已做，在分支 `claude/ac-pg017-p2e`（旧分支 `claude/ac-pg017-p2-fetch` 作废）。Home 里的库（BL-490，S-91）已做；之后：模型设置/生图（BL-491）、方法与角色（BL-493）。

## 5. 验收与安全不变量

编号 RAC-230～239（统筹分配）：

| 编号 | 断言 |
| --- | --- |
| RAC-230 | 每项新服务各一例：合同没声明效果 → `sandbox.not_authorized`；声明了但人没批准 → 同；批准了但 Manifest 没声明权限或授权被撤 → 宿主服务自己的码；参数形状不对 → `sandbox.invalid_request` |
| RAC-231 | 停用、卸载、撤权之后：沙箱里在途的和新来的服务调用被拒（或在 `servicesUntilStopped` 里计数），不写任何业务记录（S-18 口径） |
| RAC-232 | 模型：在声明了 `model` 效果的操作所对应的并发动作里 `complete` 成功；在路由里调用被拒 `model_action_required`；`kind: "query"` 声明 `model.invoke` 的合同被拒；没登记的指令 id / 别的主人的指令被拒；沙箱代码不能送进自带文字的提示词 |
| RAC-233 | 指令（V-20）：沙箱定义登记本插件的指令成功，登记别的主人的指令拒绝启动；角色与方法正文按 Q2 的结论（默认不登记）有拒绝本身的断言 |
| RAC-234 | 连接：槽位没在这次操作声明的效果里、人没批准、批准成别的槽拒；非 GET/HEAD 的请求在查询操作里拒；槽位没绑定账号不是拒，是匿名发出（S-57）；凭据头由宿主的真实端口按固定头集合滤掉（S-57 的测试），沙箱一侧的用例用假端口，只断言答复在 broker 一侧重建成纯 JSON；响应超上限拒 |
| RAC-235 | 材料：联网读取（`materials:fetch`）要效果、批准，且主机在操作声明并获批的域名里，重定向或来源的接口离开域名即拒（P2e，见下面「P2e 验收」）；`fetch_local` 与 `original` 已由 P2d 给，见「P2d 验收」 |
| RAC-236 | 后台：受理的沙箱操作在卸载、删项目、取消时被停，之后不写业务记录；进程死后不重放 |
| RAC-237 | 同一份 Manifest 声明，宿主内运行和沙箱运行，对同一输入得到同一个拒绝码（同等待遇，抽样每项服务各一例） |
| RAC-238（Manifest 一半，#1139 已做） | 现在不给的、由 Manifest 或定义声明的项（模型、指令、连接、材料、后台作业、角色/提示词/技能/方法、目录、唤醒、运行 Agent、通知、已装插件、调用别人的动作、项目成果/过程项/端口/事件）在沙箱定义里声明时，启动以 `sandbox.service_not_given` 拒绝，指明是哪一项、为什么，代码一行不跑；项目平台与 Home 执行器各一例；宿主认的每个权限名要么被给、要么有一行拒绝（完整性测试），没归类的变红 |
| RAC-238（条目一半，PG-022/PG-102 之后；`ownerFiles` 已由 P2c 给） | 现在只在宿主条目上声明的项（`ownerFiles`、Home 库、`files`、生图；模型设置的现行声明按 §3.7 带码拒绝）：声明搬进 Manifest 之后，沙箱定义里声明它们时同样带码拒绝或给出，不再是六处无码的 `Error`；在那之前它们在沙箱里根本没有入口，这一半不算做完 |
| RAC-239 | 声明式清理对沙箱插件成立：删项目时它的私有存储、项目库里的表、后台执行被平台清掉，不需要它交 `purge` |

**BL-490 验收**（S-91，RAC-240～249 本片 240～246）：`tests/security-invariants-sandbox-home-database.test.ts`

| 编号 | 断言 |
| --- | --- |
| RAC-240 | 沙箱包的 Home 库经账本做出，发布者是安装记录的；写、读都在子进程里（宿主进程没有连接） |
| RAC-241 | 别的发布者、被宿主存储或别的插件占用的名字、Home 里已有的目录、按项目分开的库：一律带码拒绝，什么库都没做、没起进程 |
| RAC-242 | 授权被撤之后下一次读、写被拒且什么都没写；关闭库之后的调用被拒，子进程随库结束 |
| RAC-243 | 读只认 SELECT、WITH，写只认 INSERT、UPDATE、DELETE；PRAGMA、ATTACH 都不过；以 WITH 开头的写句过了关键字也写不进只读连接 |
| RAC-244 | 读超时的进程被杀并带码回答，宿主照常；递归查询不会被拒、由时钟截止；下一次读在新进程里跑 |
| RAC-245 | 写超时整个事务回滚，没有任何一句留下，下一个事务照常 |
| RAC-246 | 真沙箱里：操作没声明、人只批准读、人什么都没批准、用项目库的效果，一律 `sandbox.not_authorized`；形状错的请求 `sandbox.invalid_request`，都没到宿主 |
| RAC-238（条目一半的 Home 库） | 沙箱定义声明 `databases.home` 不再被拒；项目里运行的沙箱包声明它启动即被拒（`plugin.declaration_invalid`），代码一行不跑 |

**P2c 验收**（S-64，统筹 10-24 给 RAC-350～369：本片 RAC-350～359，P2d 用 RAC-360～369）：`tests/security-invariants-sandbox-owner-files.test.ts`

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
| RAC-357-U1 | 真实项目与 Home Runtime 遇到主人文件父目录指向 Home 外的链接时，卸载和重放均拒绝清理、保留已卸载记录且释放应撤下的定义；外部文件、其他插件及发布者的定义/安装/数据不变。修复链接后，同安装重放实际清掉自己的目录，后续重放无额外停止或记录改写。带非空文件和 KV 的不留数据安装，无论同进程或重启、同对象或新定义对象，重清失败时均带码拒绝重装，无新安装行、事件、世代、启动或定义残留；重清成功后的新代码及动作读不到旧文件和 KV。缺同步钩子/必需 KV owner 端口明确拒绝，普通宿主错误带主人码，已有 ActionError 原样，保留 Native 无外部清理与留数据的显式选择。`tests/security-invariants-sandbox-owner-files.test.ts` 证明真实链接路径、重装及定义释放，`tests/plugin-lifecycle-states.test.ts` 同时证明原错误对象、撤权、串行、缺钩子拒绝及跨重启 |
| RAC-358 | Home Runtime 里：沙箱包得到 `<Home>/plugin-files/<安装>/<store_name>/`，同一个有界服务、同样的拒绝（未声明的效果、查询写、根之外的路径、错误形状、`rootPath`）；没有项目目录、没有按登记的 Home 库建目录 |
| RAC-359 | Home Runtime 里各安装各一份；留数据的卸载留着，不留的删掉，别的安装的不动；`plugin-files` 登记为宿主的 Home 库（purge 覆盖，`homeStores()` 与钉死的清单一致） |

RAC-357-U1 的实现覆盖 Runtime 卸载 `finally` 释放定义，以及不留数据的已卸载安装在重装前同步重清。沿原 `plugin_id`/发布者条件释放定义；新清理阶段在无副作用校验后、注册/世代/保存前复用同步钩子。Host 只编排现有主人文件能力与 KV owner 公开删除接口，三个真实 Project 构造接齐删除端口，Home 复用已有 storage；不增异步 install、持久标记、迁移、跨表 SQL 或第二份清理实现，巨大类不增长。原 `87ebba4c` 的定义释放有效红保留；在 `80e5ee7d` 上，新增真实项目/Home（含实际重启）回归进一步证明重装代码会读回非空旧文件和 KV，且清理失败未阻断安装，再补最小修复。定向命令仍为 `node scripts/run-tests.mjs tests/security-invariants-sandbox-owner-files.test.ts tests/plugin-lifecycle-states.test.ts`，按新增安装、授权规范化、KV 与 Host 接线风险选回归；原有效证据保留适用范围。共享核心的统一 full 由 Claude 排批，本片不自行启动。真实 Home 未动，权限、路径拒绝、存储结构及留数据的回滚合同不变。

**P2d 验收**（S-65，RAC-360～369，统筹 10-24 分配）：`tests/security-invariants-sandbox-local-original.test.ts`

| 编号 | 断言 |
| --- | --- |
| RAC-360 | 本机页面由宿主取，回给插件的只有抽出的文字（没有地址、端口、头、cookie），宿主发出的请求不带 cookie 与凭据 |
| RAC-361 | 宿主的地址规则逐项断言它自己的码：公网、内网、链路本地、198.18/15、`0.0.0.0`、IPv6 本地与映射地址、https、ftp、file、带凭据、仿 localhost 的名字都是 `material.local_page.not_local`，宿主自己的端口是 `own_endpoint`；被拒的地址没被连过；重定向到内网不跟 |
| RAC-362 | 页面大过通道即 `sandbox.response_too_large`，不截断；地址的形状（个数、类型、长度、控制字符）错的请求没到宿主 |
| RAC-363 | 认领后按 256 KiB 一段读回，整份与原文件逐字节相同；结尾与任意起点；释放后读不到；人的文件不动 |
| RAC-364 | 没有交来的文件、交给别的安装、不是人的调用都不能认领；路径当第二个参数、形状不对的键被拒；没认领的键读不到；像路径的键只是一个键 |
| RAC-365 | 登记按安装和项目分开：别的安装、别的项目读不到同一个键，也释放不了 |
| RAC-366 | 两段之间文件变了、路径换成链接、文件被移走、变成目录或管道、超过 32 MiB 逐项被拒 |
| RAC-367 | 一段至多 256 KiB，起点在 32 MiB 内，版本只认宿主给过的形状；没到宿主 |
| RAC-368 | 四个方法各自：没声明、只声明读、声明另一种效果、没批准、只批准读、批准另一种效果、批准别的，都是 `sandbox.not_authorized`；查询声明任一效果则合同不载入；没有按整份读和路径的方法 |
| RAC-369 | 宿主没建服务答 `sandbox.service_unavailable`；动作之外一律被宿主客户端拒；停用、撤权、取消、守卫拒绝之后什么都不取、不登记、不释放 |

**PR #1234 评审修复合同（2026-10-24，Codex 修复5）**：保留 P1/P3 的三道门与既有批准语义，范围仅 broker 的后台停止/取消、不给的模型设置声明、对应测试及 S-66/67 记录。`stop()` 关闭受理并取消已返回的句柄；正等待宿主受理的句柄在晚返回时立即取消，原调用答 `sandbox.stopped`，不能重新入表或接受后续请求。每个运行在 broker 内绑定目标命令，取消仍只限本 broker，并要求当前操作声明与批准都包含该运行的实际目标；未知或已结束的 id 保持 `false`。这些是现有效果交集与停止合同的修复，不新增权限。沙箱声明 `model_configuration` 统一在项目/Home 启动前答 `sandbox.service_not_given`，不创建设置端口；不实现 BL-490/491。`instructions` 与 `backgroundLane` 的生成插件生产接线继续按 §4 排除，测试探针使用真实宿主后台客户端与真实动作作用域。

本轮工程验证：旧实现上的目标取消与停止交错两条回归失败，模型设置的声明、项目及 Home 启动三条断言失败，修后全部通过；S-20 原引号错误也已实际红绿验证，只改 S-66/67 的正文与测试分类。公共 build 槽内整体 `pnpm build`、`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main` 通过；包 README 的全部必跑文件与宿主后台、模型、模型设置、Home 模型生命周期、模型动作调度共 17 个文件，175 项通过，1 项可选真实公网用例按既有条件跳过，0 失败。S-67 三条 macOS 真 Seatbelt 进程用例全部实跑通过。独立修后二轮待交；全量由统筹统一安排，本会话未启动；生产生成插件接线与本人体验验收不由这些工程证据代替。

**P3 验收**（S-67，RAC-236；表里 RAC-236 一行的细化）：`tests/security-invariants-sandbox-background.test.ts`、`tests/security-invariants-sandbox-background-host.test.ts`

| 编号 | 断言 |
| --- | --- |
| RAC-236 | broker 先拒：没声明、没批准、不在名单、查询、合同里没有或不是命令的目标、输入不合、缺参数、非字符串；被拒的宿主一个也没接受；没连接服务答 `sandbox.service_unavailable` |
| RAC-236 | 未结束的运行有上限；包只能取消自己受理的运行，取消须由当前操作声明并获批准的实际目标，声明 work 不能取消 spin，批准 work 也不能取消 spin；允许的同目标取消成功，未知或已结束 id 返回 false |
| RAC-236 | 制造宿主已受理但句柄仍未返回时与 broker.stop 的真实交错：晚到句柄被取消并结束，调用答 sandbox.stopped，后续请求不再被宿主受理 |
| RAC-236 | 沙箱路径使用真实项目平台创建的 PluginBackgroundClient：动作外答 plugin.background_action_required；缺 background_job、非并发或查询答 plugin.background_undeclared；拒绝后 lane 没有运行，合法并发命令受理并执行 |
| RAC-236 | 合同层：查询、缺失的目标、非命令、嵌套的后台声明都不载入 |
| RAC-236 | 只有带 lane 才给后台服务；`background.jobs` 声明仍被拒，`background_job` 不再被拒 |
| RAC-236 | 真进程：运行在另一个进程里，第一个进程在它等待时照常回答；取消正在执行的运行结束它的进程，下一次受理起新进程，被取消的不重来；停掉 lane 后不再受理 |

**P1 验收**（S-66，RAC-232、RAC-233；表里两行的细化）：`tests/security-invariants-sandbox-model.test.ts`

| 编号 | 断言 |
| --- | --- |
| RAC-232 | 在自己的并发动作里 `complete` 成功，发出去的是登记的指令正文加这次的数据，系统指令是另一条登记的，JSON 输出带 `value`；答复只有 `text`、`value`、`usage`；可用性与列表可读 |
| RAC-232 | broker 先拒：没声明或没批准的 `model` 效果、`read` 不能 `complete`、查询不能发请求（合同层也不载入）、未知方法；被拒的没到模型 |
| RAC-232（同 RAC-237） | 宿主客户端对不并发的动作、没声明 `model:invoke` 的动作、动作之外各给宿主内运行的插件同一个码 |
| RAC-232 | 原调用不再成立、问完后权限没了、超过宿主的超时与输出上限、输出不是 JSON：不交答案，被拒的没问模型 |
| RAC-233 | 人改过的指令是发出去的版本；没登记的 id、写成文字的 id、多余的成员（含 `prompt`、`images`）、非字符串数据、超长数据、不完整的模型选择、别的主人的指令逐项被拒，都没到模型 |
| RAC-233 | 沙箱定义登记别的主人的指令，启动即被拒 |
| RAC-238 | 声明 model_configuration 的沙箱定义在项目与 Home Runtime 启动即以 sandbox.service_not_given 拒绝，start 未执行；只声明 model:read/invoke 与本插件指令仍可启动 |
| RAC-232 | 会等模型的操作的截止时间在宿主的模型上限之后；其余操作不变；配置得更长的保持 |

**P2e 验收**（S-93，RAC-235 的联网半；BL-492 的读取器一侧另有 BL492-01～08，在 `slices/bl-492-material-domains.md`）：`tests/security-invariants-sandbox-materials.test.ts`

| 编号 | 断言 |
| --- | --- |
| RAC-235 | 页面读取要 `materials: ["fetch"]` 的声明与批准，网页主机同时在该操作声明与人批准的 `networkDomains` 里；`read` 不等于 `fetch`；没声明、没批准、主机不在两处之一、别的主机都被拒，被拒的读取没到宿主 |
| RAC-235 | 交给读取器的名单正是声明与批准的交集；地址只收 https、没有账号密码、没有自带端口的字符串，IP 字面量被拒；名单超过 20 个域名即拒 |
| RAC-235（同 RAC-237） | 宿主的客户端仍要求在插件自己的并发动作里（动作之外同一个码），宿主没建服务答 `sandbox.service_unavailable` |
| RAC-235 | 本机页面与原文件不是页面读取：没有对应效果时 `fetch_local`、`original` 的方法不被批准，合同里 `read`、`fetch`、`fetch_local`、`original` 都能载入，别的取值不载入 |
| BL-492 | 读取器：名单按精确主机名；首个请求与每一跳重定向在查找之前拒绝；来源的接口、字幕、媒体下载同样带名单；带名单的读取把 198.18/15 的查找结果当正常地址，IP 字面量与别的保留段仍拒（`tests/jelly-source-providers.test.ts`、`tests/plugin-materials-allowed-domains.test.ts`） |

**安全不变量**：建议新增 S-60（沙箱经 broker 使用宿主服务的总规则：两道门、有界 JSON、撤权后不写、不给的拒绝）一行，承接 S-15 里“沙箱进程没有……”的那句和 S-59 的数据库一条；各项服务的测试挂在这一行的“拒绝测试”里。如果统筹希望每片各占一行（S-60 模型、S-61 连接与材料、S-62 后台），也可以，**请定**。S-15、S-46 里描述“沙箱没有这些服务”的话要同时改成现状。

## 6. 要统筹定的

- **Q1 沙箱插件的模型调用靠“每个声明了 `model` 效果的操作登记一个 Manifest 动作”（3.1）还是别的办法？** 推荐：登记动作。理由：不为沙箱放宽 `model_action_required`，也让沙箱插件的操作和别的插件一样出现在动作目录里（同等待遇）；代价是沙箱定义工厂要生成动作，这是 P0 的一部分。另一种是在路由里开一条“沙箱调用模型”的专用口子，这就是给沙箱开私路，不推荐。
- **Q2 沙箱插件的角色与方法正文给不给？** 推荐：现在不给，指令给；外部插件有了安装确认页能列出它们（PG-001）之后再给（BL-493）。另一种：和宿主内第三方插件完全一样，现在就给——同等待遇的字面做法，但今天没有地方让人在装的时候看到这个包要往他的 Agent 里加什么。
- **Q3 安全不变量一行还是每片一行？** 推荐一行 S-60。
- **Q4 材料联网部分**：是否接受“要先在材料读取器里加允许域名列表选项（BL-492），之后才给”这个顺序，而不是先给 `readSource` 再补？推荐先补后给——先给就是临时绕过沙箱的网络闸门。**已答**（用户 10-24 定材料都做、broker 有界）：P2e 照此做，先补读取器的名单（BL-492），再给 `readSource`。

## 7. 开工前核对（代码位置有没有被在途 PR 改）

按 `gh pr list` 的文件清单查了 100 个在途 PR 里和本组相关的文件：

- #1119（我自己的 BL-395）：`installed.ts`、`plugin-host-services.ts`、`plugin.ts`、`plugin-database.ts`、沙箱的 README 与 `database.ts`；本稿以它为前提。
- #1118（W5-09）：`platform/plugin.ts`、`platform/plugin-host-services.ts`——见第 4 节。
- #1124（PG-051 P1）：`plugin-instructions.ts`——V-20 排在 PG-051 P2 之后。
- #1112、#1098、#1130、#1076、#1083：与本组的服务文件没有交集（#1076/#1083 只改 `privileges.md` 的 Shelf 行）。
- #1117、#1114、#1107、#1127、#1123、#1064：只在 `SECURITY-INVARIANTS.md` 上有交集，加行时会在同一张表上撞，S 号请统筹统一排。
- PG-106：`onProjectDeleted` 钩子 C4（10-21）已删，本稿不再涉及；PG-102～104 的代码（`plugin-files.ts`、`plugin-owner-files-entries.ts`）在 main 上没有在途改动，但它们的 Manifest 化是前提（第 4 节），不在本组做。
