# 本机工具探测服务、桌面壳的文件交接、运行范围进 Manifest

状态：草稿（2026-10-25，防腐线 ac-platform，分支 `ac-platform/group3-runtime`，叠在 `f7422dc66` 上）。做的是 `privileges.md` 的 PG-061 余项（BL-363）、PG-112（BL-380）、PG-113、PG-011，PG-099 核实后不用写代码（§1.5）。统筹未裁的点在 §5，裁定前按推荐做。验收号用 RAC-660～699，S 号接 main 往下排（暂定 S-75 起，合入前对 main 重排）。

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

1. 插件和 Module 不读宿主环境变量、不 import `node:child_process`/`node:fs`/`node:os`；
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
- 只用 `fs.promises.stat`/`access`，**不起进程、不读文件内容**；`find` 的结果缓存 30 秒，`refresh()` 清掉；并发的 `find` 共用一次扫描；`isExecutable` 的路径必须是绝对路径、不含 NUL、≤ 4096 字符，只回布尔，不回错误原因（不当文件系统探针用）。
- 调用要 `permission` 已授权、实例仍有效（撤权、停用、取消后拒绝）；`isExecutable` 没声明 `custom_executables` 就拒绝。
- 只给 Home 实例；项目里的双实例那一半不给（并入 `HOME_ONLY`，`plugin-declared-services.ts`）。
- 沙箱（S-60）：宿主的每项服务在 `SANDBOX_SERVICE_FATE` 里要有一个决定，新增权限要在 `HOST_SERVICE_PERMISSIONS` 登记并被「给」或被 `SANDBOX_NOT_GIVEN` 一行拒绝，否则完整性测试变红。`localTools` 的决定：**拒**（沙箱插件声明 `local_tools`，安装在启动时被拒，`sandbox.service_not_given`，说明「本机工具查找只给宿主自己运行的插件」）。理由：这项服务回的是本机可执行文件的绝对路径，沙箱包不该知道；将来要给，在 BL-494 一批里逐项定。

**Shelf 改**：

- `modules/shelf/src/runtimes.ts` 变成纯逻辑：`SHELF_ENGINES`（九个 Agent 的 key、标题、安装地址）、`foundRuntimes`/`shelfRuntimeCatalog`/`detectShelfRuntime` 的拼装，不 import `node:*`、不读 `process`。入参是 `ShelfLocalToolsPort`（`find`/`isExecutable`），由插件包把服务接上去；读不到服务的结果就是「未发现 Agent」。
- 删掉没人走的能力探测：`readCliHelp`、`supportsWorkspaceSandbox`、`canRunJob`、`clearShelfRuntimeCache`、`skipHelp`、`ShelfStore.runtime()` 的 `probeCapabilities`，以及 `shelfRuntimeProbe`、`shelfSearchDirectories`、`shelfRuntimeCandidates`、`installedShelfEngines` 的导出（现在不留兼容期）；`tests/shelf-cli-probe.test.ts` 整个删；`shelf-settings.test.ts`、`shelf-dropagent-parity.e2e.test.ts` 里 `clearShelfRuntimeCache` 的调用换成服务的 `refresh()`。`ShelfRuntimeStatus` 的字段（`can_run_job`、`isolation`、`capability_pending`）**不动**：它们在设置页上显示，改它们是另一件事（见 §4）。
- `ShelfStore.runtime()` 改异步；`snapshot()` 本来就是异步；`store.ts:419` 一处也在异步方法里。
- Shelf 的 Manifest 加 `local_tools`（九个 Agent 的 `binaries`、`directories` 十几个目录、`custom_executables: true`）和一个新权限 `local-tools:read`。
- 插件包的 `home-plugin.ts` 不再 `import … shelfRuntimeProbe`，也不碰 `process.env`。

**不变的**：Shelf 的动作 id、版本、输入输出、设置页文案；`terminal` 动作仍用 `context.services.terminal.open({ command: runtime.executable })`。

**新的边界（S 号，暂定 S-75）**：平台给插件的本机工具查找只由 Manifest 的 `local_tools` 声明：工具名、目录来自声明、只做文件系统查询、不起进程；未授权、没声明、撤权、停用、取消的调用被拒；沙箱不给。测试断言每一种「拒绝」。

### 2.2 PG-113：桌面壳只接受平台文件的句柄

我推荐**加固路径形（A）**而不是改成句柄形（B），理由在 D2。

- 三个命令改名：`plugin_files_open`、`plugin_files_copy`、`plugin_files_drag_out`（旧名删，`permissions/*.toml`、`main.rs` 注册、`native-files.ts` 一起改）。
- Rust 一侧新增 `plugin_files::confine(paths, roots)`：每个路径必须是绝对路径、`canonicalize` 后落在 Home 的某个**插件主人文件根**之下、是普通文件、不是链接、`nlink == 1`；任何一项不符，整批拒绝，不打开。根的列表从宿主取（`/api/host/plugin-page-files` 的响应多回一项 `roots`，或壳启动时从宿主读一次；壳本来就有访问宿主的凭据，见 `shelf_http`），不写死 `shelf`。
- 打开前再检查一次（减小换链接的窗口）：用 `open` 的 `-R`/文件描述符做不到时，至少在 `open` 之前立刻 `symlink_metadata`；窗口仍在，写进 `SECURITY-INVARIANTS` 的「读不到的」。
- `shelf_admit_paths`、`shelf_find_files`、`platform_read_selected_file` 是「人在系统选择器里选了文件」的方向，不动。
- 测试：Rust 单元测试（`cargo test`，CI 的 `native-checks`）断言：相对路径、`..`、链接、根之外的绝对路径、目录、多硬链接文件、空列表都被拒；TypeScript 一侧 `tests/` 里断言父页只会发 `plugin_files_*` 且参数来自 `/api/host/plugin-page-files` 的响应。

### 2.3 PG-011：运行范围写进 Manifest（本片的一半）

只做**范围的来源**，不做「装非内置 Home 插件」的入口（§1.4、D3）：

- Manifest 新增 `runtime?: { scope: "home"; dual_instance?: true }`（缺省是项目级）。SDK 的解析器检查：`scope` 只能是 `"home"`；`dual_instance` 只能和 `scope:"home"` 一起写；写了 `runtime.scope:"home"` 的 Manifest 必须有对应的 `databases.home` / `owner_files` 等之一或声明 `home: true` 之外的 Home 级动作（否则没有意义，拒绝）。
- `PluginRegistration.runtime` 里的 `scope` 与 `dual_instance` 删掉，只留 `create`、`package_name`、`factory_export`、`keys`（这些是「怎么把代码装进来」，不是范围）；`homePluginEntries()` 改成从 Manifest 的 `runtime.scope` 筛，`routeProject` 的 `shipped` 判断也读 Manifest。
- 宿主的信任闸（新，一处）：`assertHomeScopeAllowed(trust)`：只有 `HOST_BUILD_TRUST`（随构建装的）可以起 Home 实例；其他信任（装上的、生成的）声明了 `runtime.scope:"home"` 一律在安装时被拒，错误码 `plugin.home_scope_unavailable`，信息说明「Home 级插件要等沙箱宿主支持 Home 实例」。这不是新的特权，是把现在隐含在「只在登记里」的那条规则搬成一个有名字、有测试的闸，将来沙箱宿主支持 Home 实例时改这一处。
- 现有 Home 级插件（Todo、Issues、Shelf 等）的 Manifest 各加一行；`dual_instance` 的现有插件同样。夹具里的 Home 夹具不变。

## 3. 验收

| 号 | 内容 | 证明 |
| --- | --- | --- |
| RAC-660 | `ui.commands` 被 SDK 拒绝；`UiViewRegistry` 没有命令；四个插件没有命令声明与处理器 | `tests/plugin-declaration-rules.test.ts`、`tests/plugin-manifest-v2.test.ts` |
| RAC-661 | `local_tools` 声明检查：未知字段、重名、`binaries` 含 `/`、目录不是 `~/…` 或绝对路径、数量超限、权限不在 `permissions` 里，各被拒 | `tests/plugin-local-tools-declaration.test.ts` |
| RAC-662 | 服务：没声明就没有；权限未授权时 `find`/`isExecutable` 被拒；撤权、停用、取消后被拒；没声明 `custom_executables` 时 `isExecutable` 被拒 | `tests/plugin-local-tools-service.test.ts` |
| RAC-663 | 服务：只做文件系统查询（源码不 import `child_process`），并发的 `find` 合成一次扫描，缓存 30 秒、`refresh()` 清掉；`isExecutable` 拒相对路径、NUL、过长路径，只回布尔 | 同上 |
| RAC-664 | `MOLIS_WORK_LOCAL_TOOLS_PATH` 钉死搜索路径，`MOLIS_WORK_LOCAL_TOOLS=off` 回全 null；沙箱插件声明 `local_tools` 在启动时被拒 | 同上、`tests/security-invariants-sandbox-services.test.ts` |
| RAC-665 | `modules/shelf` 与 `plugins/native/shelf` 的源码不含 `process.env`、`child_process`、`node:fs`、`node:os`（AST 扫描） | `tests/builtin-plugin-composition.test.ts` 或新文件 |
| RAC-666 | Shelf 的终端 Agent 发现、能否跑任务、隔离等级与改之前同输入同输出 | `tests/shelf-settings.test.ts`、`tests/shelf-dropagent-parity.e2e.test.ts` 里不开浏览器的部分 |
| RAC-670 | 桌面壳三个命令：相对路径、`..`、链接、根外绝对路径、目录、硬链接多的文件、空列表被拒 | `apps/desktop` 的 `cargo test` |
| RAC-671 | 父页只发 `plugin_files_*`，参数来自宿主的响应；旧 `shelf_*_path` 名不再注册 | `tests/` 里读 `main.rs` 与 `native-files.ts` 的断言 |
| RAC-680 | Manifest 的 `runtime.scope` 被解析；不合法的组合被拒 | `tests/plugin-manifest-v2.test.ts` |
| RAC-681 | 非 `HOST_BUILD_TRUST` 的安装声明 Home 级被拒，`plugin.home_scope_unavailable` | `tests/home-scope-trust.test.ts` |
| RAC-682 | 现有 Home 级插件的集合（由 Manifest 推出）与改之前由登记推出的集合逐项相同 | `tests/builtin-plugin-composition.test.ts` |

## 4. 不做

- 非内置 Home 级插件的安装与沙箱宿主（PG-011 的后半，PG-020 的边界）：§5 D3。
- 桌面壳的「人在系统选择器里选文件」那三个命令。
- Alchemist（BL-376）。

## 5. 待统筹裁定（裁定前按推荐做）

- **D1 PG-112 不建「起进程探测」，只建「查找」**：推荐。`--help` 探测在产品里没有一处走到（`capability_pending` 恒真），为它建平台的起进程服务是给死代码加合同面；删掉它，平台服务只做文件系统查询，不起进程。BL-380 原文要的「超时、不在请求路径上同步起进程」自然满足（没有进程）。若 ① 要保留能力探测，作后续片，那时再加 `probes` 与起进程。
- **D2 PG-113 做 A 还是 B**：推荐 A（Rust 一侧收窄路径到插件主人文件根）。B（宿主发一次性句柄，壳拿句柄回宿主换路径）更彻底，但壳要新增一条到宿主的认证调用，换链接窗口也只是小一点；A 已让「能在主窗口里调命令的代码」不再能打开任意文件。若要 B，作为后续片。
- **D3 PG-011 只做范围来源和信任闸**：推荐。安装与沙箱宿主等 ac-sandbox-sched；若它已有 Home 实例的计划，我把闸留成一处，它来改。
- **D4 `MOLIS_WORK_SHELF_AGENT*` 两个环境变量改名为平台的 `MOLIS_WORK_LOCAL_TOOLS*`，偏好那个删掉**：推荐（现在不留兼容期）。需要同步改的测试与文档我来改。
