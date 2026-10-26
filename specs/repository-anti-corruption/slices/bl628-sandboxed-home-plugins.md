# BL-628：装进 Home 的非内置插件由沙箱宿主的 Home 实例承载（设计稿）

状态：已实现 P1～P5，未开 PR（2026-10-26，防腐线 ac-clients-1 片；分支 `claude/bl628-sandboxed-home-plugins`，基线 main `2b3dc51de`）。D1～D8 经统筹审定、D1 经用户 2026-10-26 弹窗确认（S-80 只对「签名固定 + 沙箱」放开）；号段 RAC-960～979、BL-710～719，本稿不占新的 S 号（扩 S-80、S-84、S-91）。验收对照见 §5；没做的见 BL-710～715。

## 1. 现状（事实）

1. **Home 实例的代码只有两个来源**：随构建的登记（`PluginRegistration.runtime` 的 `create`/`package_name`/`factory_export`，`HomePluginHost.start` 里变成 `HOST_BUILD_TRUST` 的启动条目），和宿主自己的 Home 夹具（`pluginFixtureEntries`，**明确拒绝沙箱定义**，`home-side.ts`）。`HomePluginHost` 没有「运行时装进一个包」的口。
2. **Manifest 的 `runtime.scope:"home"` 在安装时被一道闸拒掉**：`assertHomeScopeAllowed`（`packages/plugin-runtime/src/trust-rules.ts`，`PluginRuntime.install` → `assertTrustFitsDefinition`），非 `HOST_BUILD_TRUST` 一律 `plugin.home_scope_unavailable`（S-80，RAC-739/740/741）。
3. **装进来的包只进项目**：`plugins.install.preview/confirm`（S-84）按「本人此刻所在的项目」预览、确认；`confirm` 调 `PluginInstallPorts.install(projectId, release)`，落到该项目的 `ensureInstalledPlugins`（`installed-plugin-host.ts`）：项目库里的 `PluginRuntime`，`home: null`，批准记录（`APPROVED_KEY`）、密钥、提示词登记、公开动作的曝光（`installedPluginExposure`）都以项目为单位。包本身存在 Home 级的 `SandboxPackageStore`，发布者固定与同意账本也是 Home 级的（`HomeConsentLedger`）。
4. **沙箱定义已经大体容得下 Home**：`sandboxedPluginDefinition` 起沙箱时 `identity.projectId` 写的是 `context.project_id ?? 'local'`；`home-plugin-executor.ts` 已经认沙箱定义（主人文件的卸载清理 `removeSandboxOwnerFiles`（S-64）、`plugin-database-entries.ts` 对沙箱 Home 库的分支，PG-017 P2c/BL-490，#1255 的 S-91 让沙箱包在 Home Runtime 里拿 `homeDatabase`）。也就是说**服务一侧在为 Home 里的沙箱包铺路，缺的是装进去、起起来、找得到、卸得掉**。
5. **「找得到」已有一半**：Home 里不在构建名单上、没有项目那一半的个人插件，由 `HomePluginHost.outsideBuild()` 报给 `homePluginsOutsideBuild`，项目的可达判断（`projectReachablePlugins`）把它们按 plugin id 算进「除非该项目隐藏」之列（#679）。现在这份名单只来自夹具。
6. **`enablePlugin`**（创作台设计要用某个内置插件时，`web-project-platform-routes.ts` 的 `pluginStudioRoute`）只认目录 `PLATFORM_PLUGIN_REGISTRATIONS` 里非个人的条目，往项目目录加一条。装在 Home 的插件是个人插件（没有可加的项），它的「启用」是 Home 实例自己的启停，和「在某个项目里显示」是两件事。

## 2. 设计原则

1. **同等待遇，只有信任不同**（10-18）：装进 Home 的非内置插件和内置的 Home 插件走同一个 `PluginRuntime`、同一个监督器、同样的 Manifest 声明检查与授权规则；差别只有两处，且都是信任带来的：**代码在沙箱里跑，不在宿主进程里跑**；**权限是人批准的，不是 Manifest 声明的全部**。
2. **范围由 Manifest 声明、由 Runtime 核对，不由入口猜**。包写 `runtime: { scope: "home" }`，就只能装进 Home Runtime；没写就只能装进项目。两条路各检查一遍，装错地方是安装前的拒绝，不留记录。
3. **宿主进程里不会跑任何未经构建的代码**。放开的只有「在沙箱里跑、经 S-84 验签、被本人固定了发布者、本人明确确认」的 Home 实例。S-80 的核心不变量「Home 里宿主进程的代码只来自构建」改写为「宿主进程里的 Home 代码只来自构建；沙箱里的 Home 代码只来自验过签、被固定、被确认的包」。
4. **Home 实例没有项目**：不拿项目库、项目行、项目成果、端口与事件（S-48 对没有双实例标记的 Home 条目的要求原样适用，沙箱永远没有双实例标记）。能拿的是 Home 库（S-91）、主人文件（S-64，随它落地）、私有存储、网络（批准的域名）、Home 范围的平台能力。
5. **复用，不另起一套**。生命周期（安装、启停、卸载、回滚未完成的安装、数据保留与丢弃、`leaveRefusal`）复用 `installedLifecycle`，把它依赖的「项目平台」收窄成它实际用到的几个成员；服务复用 PG-017 已有的 `sandboxServicesFor` 与 broker，不为 Home 另写。
6. **失败隔离**：一个装进来的 Home 包起不来，不挡宿主启动、不挡内置 Home 插件、不挡别的包；原因进该安装的恢复错误，设置页看得到，和项目里的一样。

## 3. 设计

### 3.1 S-80 怎样放开、对谁放开（**扩大安全边界，待批**）

只改 `assertHomeScopeAllowed` 这一处，并多带一个参数：

```
assertHomeScopeAllowed(manifest, trust, execution)
  manifest.runtime?.scope !== "home"                      → 放行（项目级，不是这道闸管的）
  trust.level === "host"                                  → 放行（随构建）
  trust.level === "pinned" && execution === "sandbox"     → 放行
  其他（unsigned、pinned 但在宿主里跑）                   → plugin.home_scope_unavailable
```

- **对谁放开**：只有 `trust.level === "pinned"` 且 `execution === "sandbox"` 的定义，也就是 S-84 那条唯一的路装进来的包（验过签、发布者被本人固定、本人在预览里确认）。创作台生成的（`unsigned`）和任何「pinned 却要在宿主进程里跑」的组合继续被拒；后者今天 `assertTrustFitsExecution` 并不拒（只拒 `host`+沙箱），所以闸里必须写明 `execution === "sandbox"`，不依赖别处。
- **仍然拒绝**：`local_tools`（BL-626，另走同意账本）、双实例标记（只来自宿主登记，S-48）、声明端口/事件/成果/过程项（Home 条目的既有规则）、项目库与项目行声明（Home 实例没有项目）；新增拒绝 `always_on`（§3.6，D8）。
- **范围与 Runtime 对得上**（新，一道）：`PluginRuntime` 多一个构造参数说明自己是 Home 的还是项目的（`scope: "home" | "project"`），`install` 在信任闸之后核对 `manifest.runtime?.scope ?? "project"` 等于它。项目 Runtime 收到声明 `home` 的包，Home Runtime 收到没声明的包，都是 `plugin.home_scope_unavailable`（信息指向对的入口），拒绝前不留记录。这样「入口猜错」「包被改过范围」都停在安装前。内置的 Home 插件由登记装配，同样过这一道核对。
- **S-80 行的改写**：运行范围仍写在 Manifest；Home 实例的代码来源由「只来自宿主的 Home 登记」改为「宿主进程里的只来自登记；沙箱里的只来自 S-84 的包」；目录检查（Manifest 范围与登记 `runtime` 同进退）只管内置的，不管包。
- **双实例标记（S-48）照旧**：沙箱定义出现在 Home 与项目两份名单里，或带标记，启动前被拒；这里不放宽。
- **同一个 plugin_id 不能在两个范围里各有一个包**：包库（`SandboxPackageStore`）里同一个 `plugin_id` 的任一版本声明过一种范围，另一种范围的新版本在**预览**时就被拒（`plugin.declaration_invalid`，信息说明范围不能换）。包库是 Home 级的，所以不需要扫所有项目库。已卸载但包还留着的同样算。

### 3.2 安装入口

- **范围从包里读，不从调用里读**：`PluginInstallService.preview` 读完包就知道 `manifest.runtime?.scope`。预览结果多一个 `runtime_scope: "home" | "project"`（`plugins.install.preview` 的输出形状变；是否升 version 见 §6 D4），预览界面据此多说一句：「装在 Home：所有项目共用这一个实例和它的数据；不能读任何项目的内容。」同意还是同一个确认，没有另一种同意。
- **确认按范围分路**：`PluginInstallPorts.install(projectId, release)` 拆成 `installInProject(projectId, release)` 与 `installInHome(release)`；`confirm` 按预览时记下的范围选一个。预览仍绑定本人和当前项目（动作的 `scope: "project"` 不变），这个项目只是「人在哪里点的确认」，不影响 Home 实例装在哪里；`held` 里多存一份范围，确认时再核对一次，范围对不上是 `plugin.preview_unknown`。
- **谁能装**：和现在一样，只有本人（`caller.user_action`），受众只有 `user`（S-84 ③不变）；命令行经常驻宿主的同一条通道。Agent、MCP、工作流、插件装不了 Home 级插件。
- **批准记录**：沙箱包的批准（`APPROVED_KEY`）现在在项目的私有存储里；Home 实例的批准记录放 Home 插件库（`openHomePluginStore` 的 `storage`，按安装 ID 分），不放任一项目里。

### 3.3 Home 沙箱宿主：起停与恢复

新增 `apps/local-host/src/home-installed-plugins.ts`（暂名 `HomeInstalledPlugins`），由 `HomePluginHost` 持有，和 `openInstalledPlugins` 对称，复用同一份生命周期：

- **起**：`HomePluginHost.start` 在内置条目和夹具起完之后，读 Home 插件库里 `publisher_trust === 'pinned'` 且 `execution === 'sandbox'`、没有卸载的安装记录（和 `openInstalledPlugins.records()` 同口径），逐个从 `SandboxPackageStore` 读回并**再验一遍**（发布者固定仍在、没被撤销、包与记录的摘要相符），批准记录取自 Home 库，交给同一个监督器 `supervisor.start`。逐个 try：任何一个失败，写进该安装的恢复错误（设置页显示）并继续；固定被撤销的包不起，原因写明。
- **停**：`HomePluginHost.release` 本来就逐个停 `running` 的安装并 `revoke`，沙箱的 `stop` 结束 lane 进程；关 Home 先让旧句柄失效再等 stop（S-18 原有口径）。不另写。
- **定义的构造**：复用 `sandboxedPluginDefinition`，`host.capability` 与 `host.network` 由 Home 一侧造（§3.4）。批准不足（`covered`）仍然拒绝启动，要重新确认。
- **运行中撤销发布者固定**：撤销后下一次调用前的 `beforeEffect` 检查发现固定已撤，该实例被 `revoke` 并停（和项目里一样的口径）；撤销本身不删数据。
- **崩溃与隔离**：沙箱进程死了下次调用重起，已发的调用不重放（`outcome: unknown`）；连续启动失败进监督器的隔离状态，不再自动起，设置页可见（既有）。

### 3.4 沙箱身份与服务

- **身份**：`SandboxIdentity.projectId` 改成 `string | null`，Home 实例写 `null`，不再写占位的 `'local'`。凡按 `identity.projectId` 比对的地方（`assertInstalled`、模型调用的 `declaredPrompts`、能力声明与授权的取数），Home 一侧只认 `null`，项目一侧只认自己的项目 ID，互不通用。这是 `platform/plugin-sandbox` 的一处合同改动（`pnpm api:update`），与 #1255 在同一个文件，由统筹解冲突。
- **能力（`services.capability`）**：只给 **Home 范围**的平台能力（`scope: "home"` 的动作）。Home 实例没有项目，调用者的 `project_id` 是空，项目范围的动作不可达，`PROJECT_REACH_PERMISSION` 不给沙箱（给 Home 条目跨项目读取是 Home 内置插件才有的特权，沙箱不继承；将来要给走 BL-710）。
- **网络**：沙箱的 `network` 仍是现有的沙箱网络规则（批准的域名、443、不跟重定向）；密钥用 Home 级的存放（`pluginSecrets` 现在按项目分，Home 实例用一个固定的 Home 键，卸载时一起删）。
- **库与文件**：Home 库（S-91）、主人文件（S-64）原样；声明了项目库或项目行的包在安装前被拒（既有的 `plugin.declaration_invalid`，信息写明 Home 实例没有项目）。
- **模型**：按 PG-017 P1 的设计，提示词必须是本插件登记过的指令；Home 实例的指令登记域用 Home 键（`promptScope`），和任何项目互不可见。

### 3.5 入口：可达、页面、动作、`enablePlugin`

- **可达**：`HomePluginHost.outsideBuild()` 除夹具外加上「运行中（或已启用）的、装进来的 Home 包」的 plugin id。这样项目的可达判断、`reachEntry`、`home-plugin-http` 的路由归属、动作可用性（`actions.plugin_disabled`）全部走已有的 #679 路径，不加分支。项目可以隐藏它，隐藏不影响别的项目。
- **页面**：沙箱包的 `studio.call` 路由和 `sandboxUiContribution` 的主页面，经 Home 的路由器（`PluginRouteRouter`）服务；页面的授权凭 `pluginPagesFor(home).connect`，`project_id` 传 `null`，页面只能向宿主要这个插件自己的路由与文件（既有页面权限，不加）。
- **动作曝光**：包的公开操作（合同里标了公开的）曝光成 Home 范围的动作，提供方 ID 是安装 ID（非内置插件本来就这样登记，不占内置插件的 ID）。`exposeInstalledPlugin` 现在拿项目的 `actions`，Home 一侧改拿 `HomePluginHost` 的 `registry/client`。曝光与撤回随启停、升级走同一个「世代 + 记录」核对（`installedPluginExposure` 里的 `current()`）。
- **`enablePlugin`**：创作台的 `enablePlugin` 保持「往项目目录加内置插件」，不为 Home 包开分支；Home 包没有「加进项目」这一步（个人插件，默认可达）。设计要求的某个内置插件若是 Home 级的个人插件，它本来就可达，`enablePlugin` 对它的拒绝（`!personal`）也不变。BL-628 里「`enablePlugin` 只认目录」的实际含义是：装进 Home 的包要有自己的启停入口——这由 §3.6 的 Home 生命周期给出，不借 `enablePlugin`。

### 3.6 生命周期

- 安装、停用、启用、卸载（保留/不保留私有数据）、装到一半失败的回收，全部走 `installedLifecycle` 同一套代码。它的上下文（`InstalledLifecycleContext`）今天要 `PluginPlatform`，其实只用 `runtime`、`supervisor`、`start`、`consents`；收窄为这几个成员，项目与 Home 各给一份，不复制逻辑。
- **常开（`always_on`）**：项目里的签名包可以声明常开并由本人在预览里同意（既有的同意账本）。Home 沙箱包**不开这一项**：常开意味着删不掉、停不了，一个所有项目共用的包把自己钉在 Home 里，风险比项目里大，现在没有用例，声明了就在安装前以 `plugin.declaration_invalid` 拒绝（D8）；其余需要同意的声明（默认连线、默认输入组）走同一份预览里的 `declarations`，不变。停用/卸载照旧先过一遍 `leaveRefusal`。
- **升级与回滚**：签名包不就地升级（T2-FIX-05，`plugin.state_invalid`），Home 包同样：先卸载（可保留数据），再装新包。保留数据的重装沿用同一个安装 ID（私有数据、Home 库同口径）。不在本片放宽（BL-711）。
- **全局设置与可见性**：设置页的插件清单本来列 Home 的安装记录，Home 包出现在「已安装」里，范围标「Home」；固定、撤销发布者仍在 `plugins.publishers.list`。

### 3.7 卸载与数据清理

| 东西 | 在哪 | 不保留数据的卸载 | 保留数据的卸载 | 项目被删时 |
| --- | --- | --- | --- | --- |
| 安装记录与世代 | Home 插件库 `plugin_runtime_installs` | 记为 `uninstalled`（记录保留，和项目里一样） | 同左，`retain_private_data: true` | 无关 |
| 私有存储 | Home 插件库 `deleteInstallationData` | 删 | 留，重装沿用 | 无关 |
| Home 库（S-91） | Home 库账本 `plugin_home_libraries` | 删库文件并从账本去掉 | 留 | 无关 |
| 主人文件（S-64） | `<Home>/plugin-files/<安装>/` | 删（`home-plugin-executor.ts` 的 `uninstalled` 钩子，已有） | 留 | 无关 |
| 密钥 | Home 级密钥存放 | 删 | 删（和项目里一样，密钥不跟数据留） | 无关 |
| 提示词登记 | Home 键下 | 撤 | 撤（变为停用态） | 无关 |
| 批准记录 | Home 插件库 | 删 | 删 | 无关 |
| 动作曝光与页面连接 | 内存 | 撤 | 撤 | 无关 |
| 包文件 | `SandboxPackageStore` | 保留（供回滚未完成的安装与重装；发布者固定另管） | 保留 | 无关 |
| 发布者固定 | Home 同意账本 | 不动（固定是对发布者的信任，不随某个插件走） | 不动 | 无关 |

- Home 实例**没有项目数据**，所以删项目不需要为它清任何东西；删项目时 Home 实例保留的后台作业按已有口径停（`stopProjectJobs`，PG-038）。
- 清理顺序和「重装前同步重清」的口径（#1210/#1246 的 RAC-357-U1）原样适用于 Home 执行器：已有的 `uninstalled` / `keptDataDiscarded` 钩子；本片补的只是 Home 库与 Home 密钥、提示词登记这几项。
- 装到一半失败：`abandonInstall` 回收，已写的批准、密钥、提示词一并撤，和项目里一样；包文件与发布者固定按 T2-FIX-02 的口径保留供重试。

### 3.8 不做

- 项目范围动作对 Home 沙箱包可达（BL-710）。
- 签名包的就地升级与回滚（BL-711，同 T2-FIX-05 的原因）。
- 创作台生成的（`unsigned`）插件装进 Home（BL-712；创作台随 BL-377 重做，那时再定）。
- Home 级沙箱包的页面进入工作台导航的位置与图标设计（BL-713，界面归插件内容的挂载点，不在这一片）。
- `local_tools`（BL-626）、项目库、双实例。

## 4. 分片与顺序

| 片 | 内容 | 边界？ | 依赖 |
| --- | --- | --- | --- |
| P1 | `installedLifecycle` 与 `installedPluginExposure` 的上下文收窄（只改类型与取值来源，行为不变，项目侧测试原样过）；`SandboxIdentity.projectId` 可空并改全部比对处 | 否（合同一处，行为不变） | 无；与 #1255 同文件，等它落地再合 |
| P2 | `HomeInstalledPlugins`：Home 插件库里读安装记录、再验、起、停、恢复错误；批准/密钥/提示词的 Home 键；Home 一侧的曝光；`outsideBuild()` 加上它的运行中 ID。入口还接不上（闸没开，装不进来），测试用宿主夹具式的内部入口写 Home 记录 | 否 | P1 |
| P3 | 安装入口按范围分路：预览多 `runtime_scope`、`held` 记范围、`installInHome`、包库里范围不得更换 | 否（预览多一个字段，D4） | P2 |
| P4 | **S-80 放开**：`assertHomeScopeAllowed` 加 `execution`、`PluginRuntime` 的范围核对、S-80 与 S-84 行改写、RAC-741 的测试改写 | **是，待批** | P2、P3；统筹审后用户确认 |
| P5 | 卸载与清理补齐（Home 库、密钥、提示词）、端到端：真实临时 Home 装一个测试用的签名沙箱包到 Home，重启恢复，隐藏/可达，卸载（保留/不保留） | 否 | P4 |

P1～P3 在闸没开时不改任何外部可见的行为，可以先做；P4 单独一个提交，评审只看它；P5 在 P4 之后。

## 5. 验收（RAC-960～979）

| 编号 | 可观察结果与证明 |
| --- | --- |
| RAC-960 | 闸：`pinned` + 沙箱 + `runtime.scope:"home"` 放行；`pinned` 但宿主里跑、`unsigned`、`host` 信任加沙箱，各被拒（`plugin.home_scope_unavailable` 或既有的 `plugin.grant_denied`）；被拒的不留安装记录。`tests/plugin-runtime-scope.test.ts` |
| RAC-961 | 范围核对：项目 Runtime 收到声明 `home` 的包、Home Runtime 收到没声明的包，各被拒且不留记录；内置 Home 插件照常装。`tests/plugin-runtime-scope.test.ts`；同一个 `plugin_id` 的范围不能换（预览、确认各拒一次）：`tests/security-invariants-plugin-install.test.ts` |
| RAC-962 | 仍然拒绝：Home 的 Runtime 收到项目范围的包、`always_on`、项目的端口、无签名、宿主信任用在沙箱包上，各被拒，没有安装记录、批准记录和可调用的动作。`tests/security-invariants-sandbox-home-instance.test.ts`（`local_tools`、双实例标记仍由 RAC-739、RAC-742 的用例钉住，项目库声明由 S-91 的用例钉住） |
| RAC-963 | 预览带 `runtime_scope`；确认按预览记下的范围落到 Home 或项目（范围对不上是 `plugin.preview_unknown`）；Home 包的预览同样只有本人能走（Agent、MCP、工作流、插件是 `actions.forbidden`）。`tests/security-invariants-plugin-install.test.ts`、`tests/home-installed-plugins.test.ts` |
| RAC-964 | 发布者固定：从没固定过的、固定被撤销的 Home 包重启后不再启动、写明原因、数据保留，内置 Home 插件和别的包照跑。`tests/security-invariants-sandbox-home-instance.test.ts` |
| RAC-965 | 起停与恢复：装进 Home 后重启宿主，包在 Home 里恢复运行；一个包起不来（包文件没了）不使 Host 启动失败，也不挡别的包。`tests/home-installed-plugins.test.ts` |
| RAC-966 | 身份：Home 实例的沙箱身份 `projectId` 为 `null`，比对处不接受带项目的身份。`tests/home-installed-plugins.test.ts` 与 `tests/security-invariants-sandbox-home-instance.test.ts` |
| RAC-967 | 能力：Home 沙箱包的能力目录只有 Home 范围的动作，依赖项目范围动作的操作在代码运行前被拒，不给 `PROJECT_REACH_PERMISSION`（BL-710）。`tests/security-invariants-sandbox-home-instance.test.ts` |
| RAC-968 | 可达：运行中的 Home 包按 plugin id 出现在每个项目的可达集合里，项目隐藏后该项目不可达（`actions.plugin_disabled`）、别的项目不受影响；停用后所有项目不可达。`tests/home-installed-plugins.test.ts` |
| RAC-969 | 动作：包的公开操作作为 Home 范围的动作经目录可见、可调，Home 和项目里同一个实例同一份数据，重启后仍在。`tests/home-installed-plugins.test.ts` |
| RAC-970 | 生命周期：停用/启用/卸载与项目里的同一套代码路径（`installedLifecycle` 不为 Home 复制）；Home 的 `/api/plugins/<id>/enable|disable|uninstall` 路由对包生效，对宿主构建的插件不生效。`tests/home-installed-plugins.test.ts` |
| RAC-971 | 清理：不保留数据的卸载后，私有存储、批准记录、提示词登记都没有；保留数据的卸载后私有存储在、重装找回同一个安装 ID；发布者固定与保留的包文件不受卸载影响。同上 |
| RAC-972 | 删项目对 Home 包无副作用：Home 包的数据与实例不因删项目而变，别的项目仍然可达。同上 |
| RAC-973 | 项目侧行为不变：P1 的收窄不改变项目里已装沙箱包的任何既有断言（`installed-plugin-*`、`plugin-sandbox*`、`security-invariants-plugin-install*`、`plugin-runtime*` 等原样过）。 |

## 6. 裁定（2026-10-26：D1 经用户弹窗确认，D2～D8 统筹按推荐采纳；D6 的 S-80 行写「用户 2026-10-26 弹窗决定」）

- **D1 S-80 只对「pinned + 沙箱」放开**（推荐）。理由：这是 S-84 那条唯一的路，已有验签、固定、本人确认、沙箱三层；`unsigned`（创作台产物）不放开，创作台随 BL-377 重做，到时再定（BL-712）。备选：也放开创作台生成的——不推荐：没有发布者身份，等于让一个未署名的东西常驻 Home。
- **D2 项目范围动作对 Home 沙箱包不可达**（推荐，BL-710）。Home 实例没有项目；跨项目读取是给内置 Home 插件的特权，沙箱不继承。备选：给，但要有逐项目的同意——工作量和边界都更大，没有用例。
- **D3 Home 包的批准、密钥、提示词登记放 Home 插件库**（推荐）。不放任一项目里，否则删那个项目会带走一个所有项目共用的插件的批准。
- **D4 预览多一个 `runtime_scope` 字段**：是动作输出的加字段，`tooling/gates/actions/` 快照会变。推荐不升 `plugins.install.preview` 的版本（调用方都在仓库里：界面、命令行、测试，没有固定过它的外部引用），在 PR 说明里写影响；若统筹按 `CONTRACT-CHANGES.md` 要求升版本，就升到 2、旧的随同一个改动删掉。
- **D5 同一个 `plugin_id` 的范围不能换**（推荐，§3.1 最后一条）：靠包库判，不扫项目库。
- **D6 要不要另开一个 S 号**：推荐不开，扩 S-80（来源与闸）、S-84（预览带范围、Home 级也只有本人能装）、S-91（Home 沙箱实例的身份与服务）三行；若统筹想让「Home 沙箱实例的身份与清理」单独成号，请给号。
- **D8 Home 沙箱包不得声明 `always_on`**（推荐，§3.6）：项目里的签名包可以，Home 的不行；要开另走一个用例。
- **D7 `SandboxIdentity.projectId` 改可空**（推荐）。备选：保留占位字符串 `'local'`——不推荐，占位值会和一个真叫 `local` 的项目撞，比对处全要特判。

## 7. 与其他线的关系

- **#1255（BL-490，S-91，ac-sandbox-sched）**：Home 库和 `plugin-sandbox.ts` 合同在它那边；本片 P1 的身份可空改动与它同文件，等它合入后再合；本稿没有另起 Home 实例，所有 Home 实例的服务都是它已经铺的那条。
- **ac-trust（T2/S-84）**：安装服务、发布者固定、同意账本不改，只在 `PluginInstallService` 里加范围分路。
- **batch-41**：改了 privileges 与 CHANGELOG 的若干行，本片的文档改动在合并时可能碰同一批行，由统筹解。
- **PG-025**（Home 实例不建项目级成果/端口/事件）：本片的「Home 实例没有项目」与它同一口径，不新增例外。
