# 本机工具探测服务、桌面壳的文件交接、运行范围进 Manifest

状态：草稿（2026-10-25，防腐线 ac-platform，分支 `ac-platform/group3-runtime`，叠在 `f7422dc66` 上）。做的是 `privileges.md` 的 PG-061 余项（BL-363）、PG-112（BL-380）、PG-113、PG-011，PG-099 核实后不用写代码（§1.5）。统筹未裁的点在 §5，裁定前按推荐做。验收号用 RAC-730～749，S 号接 main 往下排（暂定 S-79 起，合入前对 main 重排）。

## 1. 重核结果

### 1.1 PG-061 余项：`ui.commands` 没有调用者，整项取消（BL-363）

Manifest 的 `ui.commands` 共 6 条（Coding 三、Diff 一、Files 一、Git 一），插件都实现了 `commandAvailability` 和 `executeCommand`，Runtime 只查「声明了就得实现」；`UiHost` 上读命令的函数产品里没有一处调用。已按「没人调用就删」处理（D0，用户 10-23 授权的取舍口径）：

- 合同删：`UiCommandDeclaration` 一族类型、`PluginCommandInput`、`PluginAppContribution` 的 `commandAvailability`/`executeCommand`、Manifest 的 `ui.commands`。
- SDK 的 Manifest 解析**拒绝**写了 `ui.commands` 的 Manifest（`plugin.declaration_invalid`，信息指向 BL-363），不是悄悄忽略（`docs/system/CONTRACT-CHANGES.md` §3）。
- Runtime 删「声明了就得实现」的检查；`UiViewRegistry` 只剩视图。
- Coding、Diff、Files、Git 四个插件删命令声明与处理器；`tests/coding-commands.test.ts` 整个删（它只测命令）。
- 动作合同快照不变（命令不是动作）；contracts 的 `platform/ui`、`platform/plugin`、`platform/plugin-routes`、`platform/plugin-manifest` 与 SDK 的 API 快照变，`pnpm api:update`。

### 1.2 PG-112：Shelf 探测本机终端 Agent

行里点的两件事现在是这样：

| 位置 | 做了什么 |
| --- | --- |
| `modules/shelf/src/runtimes.ts:51-59` | `shelfRuntimeProbe()` 读 `MOLIS_WORK_SHELF_AGENT_PATH`（钉死搜索路径）、`MOLIS_WORK_SHELF_AGENT`（`off` 关掉探测，其他值是偏好的 Agent） |
| `runtimes.ts:94-96` | 搜索路径默认读 `process.env.PATH` |
| `runtimes.ts:64-81` | 九个 Agent 的二进制名、`$HOME` 下十来个固定目录、`/opt/homebrew/bin` 等写在 Module 里 |
| `runtimes.ts:102-120,241` | 同步 `statSync`/`accessSync` 逐个候选路径找可执行文件；用户在设置里填的自定义运行时也这样查 |
| `runtimes.ts:122-153` | `readCliHelp`、`supportsWorkspaceSandbox` 用 `spawnSync` 起 `--help` / `exec --help`，3 秒超时 |
| `plugins/native/shelf/src/home-plugin.ts:125` | 插件进程每次打开 store 都调 `shelfRuntimeProbe()` |

**重要的事实**：`ShelfStore.runtime()` 的 `probeCapabilities` 参数产品里没有一处传 `true`（`store.ts:170,419` 都用默认的 `false`），所以 `readCliHelp`、`supportsWorkspaceSandbox`、`canRunJob` 这条「起 CLI 问 `--help`」的路在产品里**从来走不到**：快照里的运行时永远是 `capability_pending: true`、`can_run_job: false`、隔离 `unknown`（`tests/shelf-settings.test.ts:104,292` 钉的就是这个）。它只被 `tests/shelf-cli-probe.test.ts` 直接调用。自动配方走独立的 AI 端口（`store.ts` 的注释），不经终端 Agent。所以：

- 不为一条没人走的路建平台的「起进程」服务（D1）。**删掉它**：`spawnSync`、两个缓存、`canRunJob`、`supportsWorkspaceSandbox`、`skipHelp`，连同只测它的测试。平台服务只做「这台机器上有没有这个可执行文件」，**不跑任何东西**。
- 请求路径上真走的是同步 `statSync` 的扫描（每次 `snapshot()` 约 9 个 Agent × 二十几个目录 × 1～2 个名字），这个要换成带缓存的异步查找。

这一片要证明的是：

1. 插件和 Module 不读宿主环境变量、不 import `node:child_process`/`node:os`，也不用 `node:fs` 去找工具（只剩两个页面客户端文件读自己打包好的脚本）；
2. 找哪些 CLI、在哪些目录找，写在 Manifest 里，由平台执行，用户装插件时看得到；
3. 平台不为插件起任何进程；查找有缓存，`snapshot()` 读缓存，缓存热的时候不碰文件系统。

### 1.3 PG-113：桌面壳按路径动插件文件

插件这一侧已经是句柄形：Shelf 页面只传相对路径（`page.host.nativeFiles.open/copy/drag(relative_path)`）；父页 `handoffPageFiles`（`apps/workbench/src/browser/plugin-frame/native-files.ts`）要求用户手势，把相对路径发给 `/api/host/plugin-page-files`，宿主按页面当前的安装、授权（`storage:private` 与 `owner_files.read_permission`）、声明的文件条目和 `O_NOFOLLOW` 检查把相对路径换成绝对路径，然后父页 `invoke("shelf_open_path" | "shelf_copy_files" | "shelf_drag_out", { paths })`。

没解决的有三件：

1. Rust 一侧三个命令收**任意绝对路径**：`shelf_open_path` 直接 `/usr/bin/open <path>`，`shelf_copy_files`、`shelf_drag_out` 把路径写进剪贴板、起拖拽。能在主窗口里调 `invoke` 的代码（主窗口被注入、父页的 bug）就能打开、复制、拖出任意文件，或用 `open` 启动任意应用；`permissions/shelf.toml` 只按命令名放行，不看参数。
2. 命令叫 `shelf_*`，但它们做的是「某个插件声明了 `nativeFiles` 的主人文件」，换一个插件就不通用。
3. 换路径到打开之间有窗口：宿主检查时没有链接，壳打开时路径可能已被换成链接。

### 1.4 PG-011：运行范围

行里的行号已过期。现在的事实：

- `PluginRegistration.runtime = { scope: "home", create, package_name, factory_export, keys?, dual_instance? }` 是 Home 级的**唯一来源**，注释写明「Trusted: 宿主只从这份登记读，不读 Manifest 或装上的包」。`homePluginEntries()`（`plugin-registry.ts:100`）把它们交给 `HomePluginHost`，`HomePluginHost` 用 `HOST_BUILD_TRUST` 装配（`home-plugins.ts:138`）。
- `HomePluginHost` 还收一份 `fixtures`（测试夹具，#679 起也让「构建之外的 Home 插件」有页面和路由）。**产品里没有任何路径能把一个非内置的 Home 级插件装进 Home**：创作台生成的插件走 `installed-plugin-host.ts`，只在项目里。
- `routeProject` 判断「内置还是不是」靠 `PLATFORM_PLUGIN_REGISTRATIONS.some(item => item.runtime?.scope === "home" …)`（`home-plugin-http.ts:148`），也就是读登记，不读 Manifest。
- 项目里「启用 / 停用」一个 Home 级插件（`web-project-platform-routes.ts:152` 一带）只认 `PLATFORM_PLUGIN_REGISTRATIONS` 里的条目。

所以「Manifest 写不了 Home 级」是对的；「装上的 Home 级插件没有入口」也是对的，但后者的完整解决要先有 Home 里装非内置插件的安装信任和沙箱宿主（ac-sandbox-sched、PG-020 的边界），不在本片。

### 1.5 PG-099：没有剩余的代码

privileges 行已写「已做」。我对着 `f7422dc66` 又核了一遍：`git-status.ts`、`coding-surface.ts` 不存在，`filesDirectoryPanel`、`gitDirectoryPanel`、`diffStagePanel`、`listWorkspaceDirectory`、`readWorkspaceTextFile` 在仓库里没有引用；Alchemist 的 cookie 与 Origin 守卫按用户 10-21 的口径不迁（BL-376）。这一行不用再改，只在 PR 正文里写「核实过」。

## 2. 做法

### 2.1 PG-112：Manifest 声明本机工具，平台查找

**声明**（`packages/contracts/src/platform/plugin-local-tools.ts`，Manifest 新增可选的 `local_tools`，紧挨 `owner_files`）：

```ts
interface PluginLocalToolsDeclaration {
  /** 要找的命令行工具，至多 32 个。 */
  readonly tools: readonly {
    readonly tool_id: string;             // 小写字母数字连字符，同一份声明里唯一
    readonly binaries: readonly string[]; // 裸文件名（不含 /），至多 4 个，按顺序找
  }[];
  /** 除 PATH 之外也找的目录：`~/…` 或绝对路径，至多 24 个。 */
  readonly directories?: readonly string[];
  /** 插件能不能问「这个绝对路径是不是可执行文件」（Shelf 的自定义运行时：路径是人在设置里填的）。 */
  readonly custom_executables?: true;
  readonly permission: string; // 读它的权限，必须出现在 Manifest.permissions 里
}
```

SDK 的声明检查（`service-declarations.ts`）把关：未知字段、重名、`binaries` 含 `/`、数量超限、`directories` 不是 `~/…` 或绝对路径、`permission` 不在 `permissions` 里，都是 `plugin.declaration_invalid`。

**服务**（`PluginStartContext.services.localTools`，没声明就没有）：

```ts
interface PluginLocalToolsClient {
  /** 声明里每个工具在这台机器上的可执行文件（找不到是 null）；缓存热时不碰文件系统。 */
  find(options?: { signal?: AbortSignal }): Promise<readonly { tool_id: string; executable: string | null }[]>;
  /** 仅当声明了 `custom_executables`：这个绝对路径是不是可执行的普通文件。 */
  isExecutable(path: string, options?: { signal?: AbortSignal }): Promise<boolean>;
  /** 清缓存（设置页「重新检测」）。 */
  refresh(): void;
}
```

执行在宿主一侧（`apps/local-host/src/plugin-local-tools-service.ts`）：

- 搜索路径 = 宿主进程的 `PATH` + 声明的 `directories`（`~/` 换成 Home 用户目录）；`MOLIS_WORK_LOCAL_TOOLS_PATH` 钉死搜索路径（替换掉全部）、`MOLIS_WORK_LOCAL_TOOLS=off` 关掉整个服务（`find` 回全 null），给隔离试用和测试用；这两个名字取代 Shelf 的两个环境变量，**不再有「偏好的 Agent」环境变量**——偏好本来是 Shelf 的设置（`settings.engine`），不是平台的事。
- 只用 `fs.promises.stat`/`access`，**不起进程、不读文件内容**；`find` 的结果缓存 30 秒，`refresh()` 清掉；并发的 `find` 共用一次扫描；`isExecutable` 的路径必须是绝对路径、不含 NUL、≤ 4096 字符，只回布尔，不回错误原因。它对声明了 `custom_executables` 的插件，就任意绝对路径回答「是不是可执行文件」，这是明说的范围，不是与文件系统无关的探针——所以这项声明只给随宿主发布的插件（下一条）。
- 调用要 `permission` 已授权、实例仍有效（撤权、停用、取消后拒绝）；`isExecutable` 没声明 `custom_executables` 就拒绝。
- 只给 Home 实例；项目里的双实例那一半不给（并入 `HOME_ONLY`，`plugin-declared-services.ts`）。
- 只告诉随宿主发布的插件：本机装了什么是这个人的机器信息，宿主没有随构建发布代码的插件还没有人同意过。`assertLocalToolsAllowed(manifest, trust)`（`plugin-runtime/src/trust-rules.ts`，`install` 经 `assertTrustFitsDefinition` 调）：Manifest 写了 `local_tools` 而信任不是 `host`（装上的、生成的、无签名的），在安装时以 `plugin.declaration_invalid` 被拒，拒绝前不留安装记录，所以一份不可能被服务的声明不会出现在要人确认的权限里。向其他插件开放要先有同意账本里的一项（BL-626）。测试里的 Home 夹具若要声明它，自己带 `HOST_BUILD_TRUST`（`tests/fixtures/plugin-local-tools.ts`）。
- 沙箱（S-60）：宿主的每项服务在 `SANDBOX_SERVICE_FATE` 里要有一个决定，新增权限要在 `HOST_SERVICE_PERMISSIONS` 登记并被「给」或被 `SANDBOX_NOT_GIVEN` 一行拒绝，否则完整性测试变红。`localTools` 的决定：**拒**（沙箱插件声明 `local_tools`，安装在启动时被拒，`sandbox.service_not_given`，说明「本机工具查找只给宿主自己运行的插件」）。理由：这项服务回的是本机可执行文件的绝对路径，沙箱包不该知道；将来要给，在 BL-494 一批里逐项定。

**Shelf 改**：

- `modules/shelf/src/runtimes.ts` 变成纯逻辑：`SHELF_ENGINES`（九个 Agent 的 key、标题、安装地址）、`foundRuntimes`/`shelfRuntimeCatalog`/`detectShelfRuntime` 的拼装，不 import `node:*`、不读 `process`。入参是 `ShelfLocalToolsPort`（`find`/`isExecutable`），由插件包把服务接上去；读不到服务的结果就是「未发现 Agent」。
- 删掉没人走的能力探测：`readCliHelp`、`supportsWorkspaceSandbox`、`canRunJob`、`clearShelfRuntimeCache`、`skipHelp`、`ShelfStore.runtime()` 的 `probeCapabilities`，以及 `shelfRuntimeProbe`、`shelfSearchDirectories`、`shelfRuntimeCandidates`、`installedShelfEngines` 的导出（现在不留兼容期）；`tests/shelf-cli-probe.test.ts` 整个删；`shelf-settings.test.ts`、`shelf-dropagent-parity.e2e.test.ts` 里 `clearShelfRuntimeCache` 的调用换成服务的 `refresh()`。`ShelfRuntimeStatus` 的字段（`can_run_job`、`isolation`、`capability_pending`）**不动**：它们在设置页上显示，改它们是另一件事（见 §4）。
- `ShelfStore.runtime()` 改异步；`snapshot()` 本来就是异步；`store.ts:419` 一处也在异步方法里。
- Shelf 的 Manifest 加 `local_tools`（九个 Agent 的 `binaries`、`directories` 十几个目录、`custom_executables: true`）和一个新权限 `local-tools:read`。
- 插件包的 `home-plugin.ts` 不再 `import … shelfRuntimeProbe`，也不碰 `process.env`。

**不变的**：Shelf 的动作 id、版本、输入输出、设置页文案；`terminal` 动作仍用 `context.services.terminal.open({ command: runtime.executable })`。

**新的边界（S 号，暂定 S-79）**：平台给插件的本机工具查找只由 Manifest 的 `local_tools` 声明：工具名、目录来自声明、只做文件系统查询、不起进程；未授权、没声明、撤权、停用、取消的调用被拒；沙箱不给。测试断言每一种「拒绝」。

### 2.2 PG-113：桌面壳不再收路径，自己向宿主换

我先写的 A（Rust 一侧把路径收窄到某个根下）要么写死 `shelf`、要么再加一条取根的宿主调用，且只是缩小；读完 `shelf_http.rs` 后改成 **B-lite**：路径根本不过 IPC。

- 壳已经有到宿主的连接（`shelf_http.rs` 的 `exchange_http`，带控制令牌）。新增 `shelf_http::plugin_page_files(endpoint, page_id, relative_paths)`：壳自己向宿主的 `/api/host/plugin-page-files` 发请求（头 `x-molis-plugin-page`），宿主按页面当前的安装、授权、声明的文件条目和 `O_NOFOLLOW` 检查把相对路径换成绝对路径，回给壳。
- 三个命令改名、换参数：`files_open`、`files_copy`、`files_drag_out` 收 `{ endpoint, page_id, paths（相对路径）, item_ids }`，不再收绝对路径。`endpoint` 必须匹配 `^(/projects/[A-Za-z0-9_-]{1,100})?/api/host/plugin-page-files$`（项目里的页面带项目前缀），`page_id` 必须匹配 `^[A-Za-z0-9_-]{8,100}$`，`paths` 至多 100 个、每个不含 NUL、`\`、`..`、不以 `/` 开头；任何一项不符，不发请求。
- 拿到的绝对路径壳再核一遍才动（纵深）：绝对路径、`symlink_metadata` 是普通文件、不是链接、硬链接数为 1；一项不符整批拒绝。还有两项（RAC-743）：（1）`canonicalize` 的结果必须等于宿主给的路径，路径上有链接或点段就拒绝；（2）规范路径必须在宿主 Home 目录（`molis_work_home()` 的规范路径）之下、且至少再深两层（库目录加文件），文件在 Home 顶层或 Home 之外都拒绝。壳不知道各插件声明的库目录名，所以第二项只到「Home 下的某个库目录」这一层；更窄的收紧要等 BL-627（一次性句柄，宿主不再把绝对路径交给壳）。
- 父页的 `handoffPageFiles` 不再自己请求宿主，直接把 `{ endpoint: route("/api/host/plugin-page-files"), page_id, paths, item_ids }` 交给壳——TS 变短，页面资源只会变小。用户手势、`itemIds` 形状检查不变。
- `permissions/shelf.toml` 里三个旧命令名换成新名。
- 主窗口里的代码因此得不到任何新能力：它能做的仍是「向宿主要这个页面自己的文件」，宿主照旧检查；它不能再让壳打开、复制或拖出任意路径。
- 换路径到打开之间的窗口：宿主检查后到壳 `open` 之间，文件仍可能被换成链接。壳在 `open` 之前立刻再检查一次，窗口缩到毫秒级但没有消除，写进 `SECURITY-INVARIANTS` 的「读不到的」。
- `shelf_admit_paths`、`shelf_find_files`、`platform_read_selected_file` 是「人在系统选择器里选了文件」的方向，不动。
- 测试：Rust 单元测试（`cargo test`，CI 的 `native-checks`）断言 endpoint、page_id、相对路径的每一种拒绝，和壳核对宿主回的路径时的拒绝（相对路径、目录、链接、多硬链接）；TypeScript 一侧的测试读 `main.rs`、`permissions/shelf.toml` 与 `native-files.ts`，断言旧命令名不再注册、父页不再传绝对路径。浏览器用例里捕获 `invoke` 的几处（`security-invariants-plugin-terminals.e2e.test.ts` 等）跟着改期望，由 CI 全量跑。

### 2.3 PG-011：运行范围写进 Manifest（本片的一半）

只做**范围的来源**，不做「装非内置 Home 插件」的入口（§1.4、D3）：

- Manifest 新增 `runtime?: { scope: "home" }`（缺省是项目级）。SDK 的解析器（`service-declarations.ts` 的 `runtimeDeclarationProblems`）检查：`runtime` 必须是对象，`scope` 只能写 `"home"`，别的字段一律列出拒绝。**`dual_instance` 不进 Manifest**：S-48（用户 2026-10-20 U2）规定双实例的标记只来自宿主的登记或 Home 夹具，Manifest 写了就被拒，信息指向 S-48。
- `PluginRegistration.runtime` 里的 `scope` 删掉，留 `create`、`package_name`、`factory_export`、`keys`、`dual_instance`（前三项是「怎么把代码装进来」，`dual_instance` 是宿主的标记，都不是范围）。Manifest 的 `runtime.scope` 与登记有没有 `runtime` 必须一致（`plugin-registry.ts` 的 `catalogProblems`，不一致宿主加载时就失败）。读范围的地方（`homePluginEntries()`、`routeProject` 的内置判断、`project-plugin-stages`、`project-plugin-databases`、`plugin-scope-entries`、工作台首页导航）改读 Manifest。
- 宿主的信任闸（新，一处）：`assertHomeScopeAllowed(manifest, trust)`（`plugin-runtime/src/trust-rules.ts`，`PluginRuntime.install` 里调）：只有 `HOST_BUILD_TRUST`（随构建装的）可以装声明了 `runtime.scope:"home"` 的插件；其他信任（装上的、生成的）一律在安装时被拒，错误码 `plugin.home_scope_unavailable`，信息说明「Home 级插件要等沙箱宿主支持 Home 实例」。这不是新的特权，是把现在隐含在「只在登记里」的那条规则搬成一个有名字、有测试的闸，将来沙箱宿主支持 Home 实例时改这一处。
- 六个 Home 级内置插件（Cognia、Images、Issues、Jelly、Shelf、Todo）的 Manifest 各加一行 `runtime: { scope: "home" }`；Home 夹具不变（夹具靠 `fixtures.home` 进名单，不经 Manifest）。

## 3. 验收

| 号 | 内容 | 证明 |
| --- | --- | --- |
| RAC-730 | `ui.commands` 被 SDK 拒绝；`UiViewRegistry` 没有命令；四个插件没有命令声明与处理器 | `tests/plugin-declaration-rules.test.ts`、`tests/plugin-manifest-v2.test.ts` |
| RAC-731 | `local_tools` 声明检查：未知字段、重名、`binaries` 含 `/`、目录不是 `~/…` 或绝对路径、数量超限、权限不在 `permissions` 里，各被拒 | `tests/plugin-local-tools-declaration.test.ts` |
| RAC-732 | 服务：没声明就没有；权限未授权时 `find`/`isExecutable` 被拒；撤权、停用、取消后被拒；没声明 `custom_executables` 时 `isExecutable` 被拒 | `tests/plugin-local-tools-service.test.ts` |
| RAC-733 | 服务：只做文件系统查询（源码不 import `child_process`），并发的 `find` 合成一次扫描，缓存 30 秒、`refresh()` 清掉；`isExecutable` 拒相对路径、NUL、过长路径，只回布尔 | 同上 |
| RAC-734 | `MOLIS_WORK_LOCAL_TOOLS_PATH` 钉死搜索路径，`MOLIS_WORK_LOCAL_TOOLS=off` 回全 null；沙箱插件声明 `local_tools` 在启动时被拒 | 同上、`tests/security-invariants-sandbox-services.test.ts` |
| RAC-735 | `modules/shelf` 与 `plugins/native/shelf` 的源码不含 `process.env`、`child_process`、`node:os`；`node:fs` 只在 `client.ts`、`settings-client.ts` 两个页面客户端文件里读自己打包好的脚本（文本扫描） | `tests/plugin-local-tools-service.test.ts` |
| RAC-736 | Shelf 的终端 Agent 发现、能否跑任务、隔离等级与改之前同输入同输出 | `tests/shelf-settings.test.ts`、`tests/shelf-dropagent-parity.e2e.test.ts` 里不开浏览器的部分 |
| RAC-737 | 桌面壳三个命令：endpoint、page_id、相对路径各种不合格的输入不发请求；宿主回的路径是相对路径、目录、链接、硬链接多的文件时整批拒绝 | `apps/desktop/adapters/tauri/src/page_files.rs` 的 `rac_737_…`（`cargo test`，CI 的 `native-checks`） |
| RAC-738 | 父页只发 `files_*`，参数里没有绝对路径；旧 `shelf_open_path`/`shelf_copy_files`/`shelf_drag_out` 名不再注册 | `tests/security-invariants-desktop-ipc.test.ts`「S-14 the shell's file commands take a page's relative paths…」，e2e 期望跟着改：`tests/security-invariants-plugin-terminals.e2e.test.ts`、`tests/security-invariants-plugin-pages.e2e.test.ts`、`tests/shelf-dropagent-parity.e2e.test.ts` |
| RAC-739 | Manifest 的 `runtime.scope` 被解析；不是对象、`scope` 不是 `"home"`、写了 `dual_instance` 或别的字段，各被拒 | `tests/plugin-runtime-scope.test.ts` |
| RAC-740 | 六个 Home 级内置插件的集合（由 Manifest 推出）与改之前由登记推出的集合逐项相同；登记的 `runtime` 与 Manifest 的 `runtime.scope` 同进退；双实例标记只在 Shelf 的登记上，不在任何 Manifest 里 | 同上、`tests/builtin-plugin-assembly-gate.test.ts` |
| RAC-741 | 非 `HOST_BUILD_TRUST` 的安装声明 Home 级被拒（未签名、钉住公钥），`plugin.home_scope_unavailable`，被拒的不留记录；项目级插件不受影响 | `tests/plugin-runtime-scope.test.ts` |
| RAC-742 | 非 `HOST_BUILD_TRUST` 的安装带 `local_tools` 被拒（未签名、钉住公钥），`plugin.declaration_invalid`，被拒的不留记录；宿主构建的带它可以装；不带 `local_tools` 的不受影响 | `tests/plugin-runtime-scope.test.ts`「RAC-742 only the Host's own build can be installed with local_tools」 |
| RAC-743 | 壳核对宿主回的路径时：不等于自己的规范路径（路径上有链接、点段）的拒绝；在 Home 之外、在 Home 顶层的拒绝；Home 下库目录里的普通文件通过 | `apps/desktop/adapters/tauri/src/page_files.rs` 的 `rac_743_…`（`cargo test`，CI 的 `native-checks`） |

## 4. 不做

- 非内置 Home 级插件的安装与沙箱宿主（PG-011 的后半，PG-020 的边界）：§5 D3，BL-628（ac-sandbox-sched）。
- 向非宿主插件开放 `local_tools`：BL-626（ac-trust，走同意账本）。
- 一次性句柄（宿主不再把绝对路径交给壳）：BL-627。
- 桌面壳的「人在系统选择器里选文件」那三个命令。
- Alchemist（BL-376）。

## 5. 待统筹裁定（裁定前按推荐做）

- **D1 PG-112 不建「起进程探测」，只建「查找」**：推荐。`--help` 探测在产品里没有一处走到（`capability_pending` 恒真），为它建平台的起进程服务是给死代码加合同面；删掉它，平台服务只做文件系统查询，不起进程。BL-380 原文要的「超时、不在请求路径上同步起进程」自然满足（没有进程）。若 ① 要保留能力探测，作后续片，那时再加 `probes` 与起进程。
- **D2 PG-113**：推荐 B-lite（§2.2）：壳自己向宿主换路径，路径不过 IPC。原先写的 A（Rust 收窄到某个根）已放弃。无法在本机跑桌面壳，Rust 单元测试和 CI 的 `native-checks` 是这一块的证据，真机验收归用户。
- **D3 PG-011 只做范围来源和信任闸**：推荐，已做。安装与沙箱宿主等 ac-sandbox-sched；闸只有 `assertHomeScopeAllowed` 一处，它支持 Home 实例时改这一处。双实例标记留在登记（S-48），不进 Manifest。
- **D4 `MOLIS_WORK_SHELF_AGENT*` 两个环境变量改名为平台的 `MOLIS_WORK_LOCAL_TOOLS*`，偏好那个删掉**：推荐（现在不留兼容期）。需要同步改的测试与文档我来改。

## 6. 存量与 W5-17 维护

本片改的两处在真实 Home 里有存量，要在 W5-17 的维护清单里各占一条（不兜底、不在读取时兼容）：

1. **Shelf 的终端 Agent 偏好**：原先的 `MOLIS_WORK_SHELF_AGENT_PATH`、`MOLIS_WORK_SHELF_AGENT` 只是进程环境变量，没有存成任何偏好行，所以没有数据要改；用户若在启动环境里设过它们，现在无效（偏好留在 Shelf 的 `settings.engine`），改用 `MOLIS_WORK_LOCAL_TOOLS_PATH`、`MOLIS_WORK_LOCAL_TOOLS`。清单里只写这一句，不用查库。
2. **已装的、含 `ui.commands` 的生成或开发插件**：`ui.commands` 取消后（BL-363），Manifest 还带它的已装插件在重装或升级时会被 SDK 拒。要核对真实 Home 的安装记录里存着的 Manifest 有没有 `ui.commands`，有的由维护改成现行形状（去掉它），不在读取时忽略。四个内置插件已没有这项声明。
