# 第三方插件：安装方案

状态：本地侧载安装、发布者密钥固定与撤销、沙箱执行及设置页安装入口**均已实现**（见第 4.1 节 T1–T7 落地记录与 [EXTENSION-POINTS.md](EXTENSION-POINTS.md) §3.2）；仅远程目录索引、官方审核（BL-058）与非 macOS 跨平台沙箱仍在规划中。信任模型由用户 2026-10-08 拍板（`specs/archive/repository-anti-corruption/spec.md` §1）：本地签名包安装、首次安装确认并固定发布者公钥、在独立沙箱进程运行；2026-10-25 补充第 4.1 节信任等级与声明同意模型并按其落地。下文已按现行代码区分已实现能力与规划中能力。

任务来源：`docs/prompts/repository-anti-corruption.md` §4.6「第三方插件」：用户自行安装插件的路径目前不存在，给出方案（安装命令、签名信任、市场入口、沙箱边界），不在本步实现。扩展点清单见 [EXTENSION-POINTS.md](EXTENSION-POINTS.md) 3.2，内置插件的迁移计划见 [RUNTIME-MIGRATION.md](RUNTIME-MIGRATION.md)。

## 白话说明

作者可以用 `tooling/plugin-cli` 把插件打成包、用 Ed25519 密钥签名，用户现已可以通过 `molis-work plugin install <bundle>` 或设置页「安装插件包」／原处安装单将其装进自己的 Home：首次安装确认并固定发布者公钥，之后随时可在设置里撤销；第三方代码仅在独立沙箱进程里跑、界面由平台绘制。官方内置插件仍随宿主编译并跟随宿主升级。远程目录索引与官方审核上架流程（BL-058）以及非 macOS 跨平台沙箱仍留在后续阶段。

## 1. 现行已实现与仍在规划中的部分

**已实现（生产能力）**：

- `tooling/plugin-cli`：提供 `create`、`validate`、`pack`、`pack-sandbox`、`pack-content`、`pack-bundled`、`identity`、`sign`、`verify`、`dev` 与 `install`（`tooling/plugin-cli/src/cli.ts`）。打包拒绝符号链接、越界路径与超限包，不执行 glob 或生命周期脚本（`package-files.ts`）。
- 发布者身份与固定受信表：发布者身份为 Ed25519 公钥指纹 `ed25519:sha256:<spki 哈希>`（`packages/plugin-runtime/src/package-verification.ts`）；Home 级存储 `plugin-runtime/plugin-runtime.db` 维护发布者固定表 `plugin_publishers` 与声明同意账本 `plugin_consents`（T1–T7）。
- 宿主安装服务与设置入口：`apps/local-host/src/plugin-install-service.ts` 提供 `plugins.install.preview@1`、`plugins.install.confirm@1`、`plugins.publishers.revoke@1` 等系统动作；工作台设置页（`apps/workbench/src/settings-plugins.ts`）与原处安装单（`S-package-install-sheet`）及 `molis-work plugin install` 经同一安装服务验签、固定发布者并安装（安全边界见 S-84、S-85、S-87）。
- 沙箱执行与同等合同：第三方签名包一律以 `execution: "sandbox"` 运行，由 `packages/plugin-sandbox` 在 macOS 上经 `sandbox-exec`（Seatbelt）隔离执行（禁止创建进程、联网和一切文件写入，网络与存储只经宿主服务）；界面由平台组件目录渲染，不向浏览器注入插件脚本。第 44／47 批起，签名固定沙箱第三方包与内置插件同等支持 `dual_instance`、`work_terminals`、`resume_summary`、`placement_relation`、`settings_entries`、`memory_scene`、`state_machines` 与多语言 `ui.locales`。
- 升级兼容声明与本机开发：`upgrade_compatibility.compatible_from_versions` / `migratable_from_versions` 支持显式确认换版；`molis-work plugin dev --allow-unsigned-development` 仅用于隔离开发目录试跑，由 Runtime 的 `inProcess.admit` 守住唯一进程内例外（其余非 `host` 等级进程内代码一律被 `plugin.in_process_denied` 拒绝）。
- 方针与内置插件：`docs/platform/PLUGIN-PLATFORM.md` §2 规定签名变化视为新插件，旧授权、存储和提供方绑定不继承；官方内置插件的可信来自宿主构建对象身份（`host` 信任），不靠标签字符串。

**仍在规划中（尚未实现）**：

- **远程目录索引与官方上架审核**：插件市场目前展示内置目录与本地已装包；远程签名目录索引与官方审核流程按 `BL-058` 后续规划。
- **非 macOS 跨平台沙箱**：当前沙箱依赖 macOS Seatbelt，非 darwin 平台失败即关闭（`sandbox.unsupported_platform`），跨平台沙箱属 C 端计划。
- **完整第三方轮询集成（自定义 `service_id` 接入 Feed）**：第三方集成包声明自定义 `service_id` 尚不能直接接入 Feed 账号来源（见 [EXTENSION-POINTS.md](EXTENSION-POINTS.md) §3.3 V-BASE-01）。

## 2. 原则

1. **第三方代码不进宿主进程，也不进浏览器页面。** 宿主进程里执行（`execution: "host"`）只留给随宿主编译的内置插件，由 Plugin Runtime 强制（BL-588，S-75 ⑥：`unsigned`、`pinned` 配进程内定义被拒，例外只有开发目录刚加载的那一个和宿主收到的测试夹具，按对象身份由宿主代码放行）；第三方一律 `execution: "sandbox"`，界面由平台的 UI 目录画。
2. **身份 = 发布者密钥指纹 + `plugin_id`。** 密钥变了就是另一个插件（沿用 PLUGIN-PLATFORM.md §2）。
3. **权限 = Manifest 声明的上限 ∩ 用户逐项授予的。** 安装时用户看到每一项权限和它的理由（直白温和、无黑话；支持随包签名的多语言 `ui.locales`——`molis-work plugin create` 默认生成 `en`/`zh`/`ja` 三语词包与 `permissions[].reason_text`，现行公共合同同步支持可选 `permissions[].reason_text`、`read_groups[].title_text/description_text` 与 `actions[].action.title_text/description_text` 声明，与内置插件同等待遇）；没有「全部允许」。
4. **一个 Home 一个执行进程。** 命令行不自己安装，转给常驻宿主（`AGENTS.md` 硬约束）。
5. **不静默升级、不静默扩权。** 升级只在同一发布者、版本更高、授权不超出已授予范围时进行（沿用现有升级规则）；签名的包装进来的插件，新版本比旧版本多要的权限，由你在预览里看到并同意后才有，升级本身也是你点“安装”才发生（BL-623）。

## 3. 安装命令与流程

```text
molis-work plugin install <bundle.json> [--home <dir>]
molis-work plugin list | upgrade <plugin_id> <bundle.json> | disable | enable | uninstall <plugin_id>
molis-work plugin trust list | revoke <publisher_identity>
```

`install` 的步骤：

1. 解析包（`parsePluginPackage`：路径、base64、`manifest.json` 与声明一致、入口存在）。
2. 取发布者指纹（Manifest 的 `publisher.signature`）。没签名的包只在 `--allow-unsigned-development` 的开发路径里存在，`install` 一律拒绝。
3. **信任判定**（第 4 节）：已受信 → 用对应公钥验签；未受信 → 显示指纹、插件名、版本、全部权限和理由，请用户确认后写入受信表。
4. 用户逐项授予权限（沙箱形态的插件必须带明确授权清单），并对 Manifest 里需要同意的声明逐项同意或拒绝（第 4.1 节）；拒绝一项不阻止安装，那一项不生效。
5. 以 `execution: "sandbox"` 安装，保留发行物（升级和回滚用）。
6. 启动，报告结果；失败只影响这个插件。

命令只做解析和请求转发，真正的安装由常驻宿主里的安装服务（`apps/local-host/src/plugin-install-service.ts`，动作 `plugins.install.preview@1` 与 `plugins.install.confirm@1`）完成，CLI 进程里不新建业务宿主。接线点在 `tooling/plugin-cli/src/cli.ts` 的 `PluginCliHost`（`runPluginCli` 的第三个参数），由 `apps/desktop/launchers/cli/main.ts` 注入；`molis-work plugin dev` 的 `runLocalPluginDevelopment`（`apps/local-host/src/local-plugin-development.ts`）仅用于隔离开发目录试跑，`install` 则经受保护常驻宿主通道执行，宿主未运行时明确报错而不私自拉起。工作台设置页（`apps/workbench/src/settings-plugins.ts`）与原处安装单走同一安装服务和确认流程。

## 4. 签名信任（用户 2026-10-08 已定）

定下的模型是**本地侧载加发布者密钥固定**：

- 第一次安装某个发布者的包时，界面展示指纹并要求确认；确认后把指纹固定到受信表。之后同一指纹的包验签通过就可以安装或升级，不再弹确认（权限提升仍要确认）。
- 指纹在 Manifest 里（`publisher.signature`）。但今天的包只带签名，不带公钥（`PluginPackageBundle` 只有 `payload` 和 `signature`）：第一次安装要么给包加一个公钥字段，要么 `install` 带 `--publisher-key <公钥.pem>`。两种做法都先核对「公钥的指纹等于 Manifest 的 `publisher.signature`」，再用这把公钥调 `verifyPluginPackage`。受信表固定的是指纹，不是某一个包；之后的包用受信表里存的公钥验签。
- 撤销：在项目设置的「插件」页，“你信任的发布者”那一栏点“撤销信任”（动作 `plugins.publishers.revoke@1`，只给本人，S-87）。之后这个发布者签的包不能再装，它所有已装插件马上什么都不能再做、随后停用、不可再升级、不能再启用，数据保留，只能卸载；撤销不能撤回。
- 官方目录的签名：官方索引（第 6 节）用官方密钥签名，官方公钥随发行物内置。这与内置插件的标签式 `publisher.signature` 无关。

### 4.1 信任等级与要同意的声明（ac-trust，2026-10-25）

安装只有一条路：取证据、判定信任、预览、本人确认（`host` 等级由宿主代为同意）、安装、启动。「判定信任」产出三个等级之一，等级只回答「谁给的证据」，不回答这个插件重不重要；之后要不要确认、跑不跑沙箱、提供方身份、声明要不要同意，都由等级加插件自己的声明算出，没有按插件名或按「是否内置」开的分支。等级由宿主给（安装的 `trust`），不从 Manifest、包字段或调用输入读（S-34）。

| | `host` | `pinned` | `unsigned` |
| --- | --- | --- | --- |
| 证据 | `PluginDefinition` 对象就是宿主启动名单里的那个（按对象身份，不看 Manifest 写什么），代码编进宿主构建 | 包里带 Ed25519 公钥，公钥指纹等于 Manifest 的 `publisher.signature`，签名验得过，并且这个指纹在 Home 的发布者表里已被人固定 | 没有可验的签名。来源是封闭清单，只有两个：开发目录（`--allow-unsigned-development`）和创作台产物；新增来源要改本文并经统筹。`molis-work plugin install` 对没签名的包一律拒绝，没签名的包走不到这个等级 |
| 验签 | 不需要 | 每次安装、升级都验，每次启动重验包与入口代码（用户主动回滚不支持，见 [插件开发](../platform/PLUGIN-DEVELOPMENT.md#沙箱包格式与安装)） | 不适用 |
| 首次确认 | 不弹窗；宿主按声明代为同意并记账（`granted_by: "host_build"`） | 发布者首次出现：显示指纹，人固定后才继续；同一发布者之后的包不再重复固定，权限提升与需要同意的声明仍要确认 | 每次安装都确认，权限逐项给，没有「全部允许」 |
| 执行 | 宿主进程（`execution: "host"`） | 沙箱（`execution: "sandbox"`） | 沙箱；唯一的进程内例外是 `plugin dev` 刚加载出的那一个定义对象（`inProcess.admit`，S-75 ⑥） |
| 权限 | 必需的总有，可选的按人留下的给，全新安装可选的默认全开（`docs/releases/POLICY.md` 第 7.8 节） | 必需的，加人确认的可选权限 | 同 `pinned` |
| 默认连线、默认输入组 | 默认同意 | 必须显式同意 | 必须显式同意 |
| 动作提供方身份 | `plugin_id` | `plugin-install-<sha256(plugin_id, publisher.signature) 前 32 位>`（`installIdentity`） | 同 `pinned` |
| 升级与版本 | 一律跟宿主构建（`recordToFollow`，`docs/releases/POLICY.md` 第 7.9 节） | 同发布者、版本更高、授权不扩 | 同 `pinned` |

「跑不跑沙箱」是这张表的结果：`host` 以外的等级一律沙箱，安装前检查 Manifest 能不能映射到沙箱形态（第 5 节），映射不了的在安装时拒绝并说明（`plugin.declaration_invalid`），不降级成宿主进程。`host` 等级不能配沙箱定义（`plugin.grant_denied`）。

Manifest 里有两类声明会改变这个插件在别处的效果，安装预览里单列，每一类单独同意或拒绝，`host` 以外的等级都要显式同意：

| 声明 | 同意的是什么 |
| --- | --- |
| `ports.inputs[].default_source` | 默认从某个插件的某个输出口读；同意带来源插件当时的发布者签名，后来占了同一个 `plugin_id` 的别人对不上就不绑 |
| `ports.input_groups[].default` | 默认用这一组输入 |

同意是同意账本（Home 级，Plugin Runtime 拥有）里的一行，带同意的人（`user` 或 `host_build`）和当时的 Manifest 摘要；声明变了就是新的一项，要新的同意。本人随时可以撤回，各等级一样：撤回只写 `revoked_at`，之后默认连线都不再认这一行，宿主也不会再为随它发布的插件代为同意。撤销发布者（上文 `trust revoke`）是另一件事：停用这个发布者所有已装插件，不删同意的行。

落地进度：信任等级、账本和发布者固定表的表结构是 T1，常开按账本生成是 T3（第 44B 批删除，没有常开插件），默认连线与默认组要同意是 T4，撤回是 T5，安装身份与 id 前缀是 T6；安装服务、预览与 `plugin install` 命令是 T2（已做：沙箱包的公开格式见 [插件开发](../platform/PLUGIN-DEVELOPMENT.md#沙箱包格式与安装)，S-84），同意撤回是 T5，发布者撤销是 T5b（已做，S-87），界面是 T7（已做）。

用户没有采纳的另两种做法：

- **只认官方签名**：市场就是官方目录，没有侧载。最简单，但用户自己做的、同事之间传的插件装不上。
- **本步不开第三方路径**：把缺口记进 C 端计划（路线图 W1-21）。

受信表已落地在 Home 级 `plugin-runtime/plugin-runtime.db` 的 `plugin_publishers` 表（owner 是 `packages/plugin-runtime`，备份类别「必备份」，见 [HOME-DATA.md](HOME-DATA.md) §3.4），对所有项目生效；各项目的安装记录留在对应项目库的 `plugin_runtime_installs`。

### 状态机元数据

作者可在 Manifest 声明机器、版本、状态家族、初始态和终态。校验命令只读静态声明，签名包的 Manifest 摘要覆盖该字段。状态转换和持久数据遵循插件已有的执行及授权边界。阶段一可省略声明；安装预演的展示与创作台生成形态按[状态机路线](../../specs/state-machine-platform/spec.md#13-路线书去处与影响2026-11-08-已并入路线书)推进。

## 5. 沙箱边界

- 第三方安装一律 `execution: "sandbox"`。安装服务在装入前检查，`host` 执行只接受 `trust: HOST_BUILD_TRUST` 的内置条目。
- **阶段一的形态与生成插件相同**：一份 JSON 的 `operations` 合同（查询或命令，严格的 schema 子集）加平台 UI 目录的界面声明；网络、存储、模型、其他动作都只经宿主服务，每次调用复查调用方、授权和 `beforeEffect()`。这样阶段一不需要新的运行机制，只需要把「已验签的包」翻译成现有的 `sandboxedPluginDefinition` 的输入。
- 第三方不能：在宿主进程里执行代码；在页面里放脚本；直接读写文件或联网；读别的插件的私有存储。
- **`methods`**（2026-10-08 决定）：第三方 Manifest 声明的 `methods`（给其他 Agent 的方法）和内置插件一样登记：安装启动时登记，停用、卸载、升级时收回（切片 W4-02）。校验沿用 Manifest 的规则（`tools` 只能是业务工具），没有正文的方法不登记（`docs/platform/PLUGIN-DEVELOPMENT.md`「给其他 Agent 的方法」）。方法正文是文本不是代码，怎样随包携带由 W4-02 的设计定。
- 需要扩展的地方：沙箱合同今天只表达 `operations`，而第三方包的 Manifest 可以有 `routes`、`ui.views`、`events`、`ports`。阶段一只接受 Manifest 里这些字段能映射到沙箱合同的子集（动作和平台目录里的界面），映射不了的在安装时明确拒绝并说明。`kind: "integration"`（轮询外部服务）需要一个「轮询操作加信号草稿」的沙箱合同，放到阶段二。
- **平台限制**：Seatbelt 只在 macOS 上有；在别的系统上，第三方安装要明确拒绝（失败即关闭，沿用 `sandbox.unsupported_platform`），直到 C 端计划里的无 `sandbox-exec` 沙箱落地。

## 6. 市场入口

- 今天：市场卡片只来自内置目录；用户自己做的插件走创作台。
- 阶段一：本地文件侧载（第 3 节），不需要市场。
- 阶段二：目录索引。一个签名的 JSON：`plugin_id`、版本、包地址、sha256、发布者指纹、摘要。官方索引默认开启并由官方密钥签名；第三方索引需用户自己添加。安装仍走第 3 节的流程，索引只负责「找到包」。
- 审核：只有官方索引的上架要审核（BL-058）。侧载和第三方索引的条目在界面上标「未经官方审核」，并显示发布者指纹。

## 7. 落点与状态

| 能力 | 位置 | 状态 |
| --- | --- | --- |
| `install` 等 CLI 命令 | `tooling/plugin-cli/src/cli.ts`、`apps/desktop/launchers/cli/main.ts` | 已实现（仅转发给常驻宿主） |
| 安装服务 | `apps/local-host/src/plugin-install-service.ts`、`plugin-trust-actions.ts` | 已实现（预览、验签、固定发布者、确认安装、撤销） |
| 受信表与同意账本 | `packages/plugin-runtime` + `plugin-runtime/plugin-runtime.db`（`plugin_publishers`、`plugin_consents`） | 已实现并登记到 [HOME-DATA.md](HOME-DATA.md) |
| 已验签包到沙箱定义 | `apps/local-host/src/installed-plugin-sandbox-definition.ts` 等 | 已实现（复用 `sandboxedPluginDefinition`） |
| 确认对话框、「安装插件包」与原处安装单 | `apps/workbench/src/settings-plugins.ts` 等 | 已实现 |
| 远程目录索引与官方审核 | `BL-058` | 规划中 |
| 非 macOS 跨平台沙箱与完整轮询集成 | `packages/plugin-sandbox`、`packages/contracts/src/platform/plugin-sandbox.ts` | 规划中（非 macOS 当前失败即关闭；自定义 `service_id` 接入 Feed 见 V-BASE-01） |

## 8. 历史切片与当前余项

| 切片 | 内容 | 当前状态 |
| --- | --- | --- |
| P-1 | 受信表与信任判定（端口、存储、撤销） | 已随 T1 / T4 / T5 / T5b 落地 |
| P-2 | 安装服务与 `molis-work plugin install`（沙箱包与内容包） | 已随 T2 / T6 及第 44 / 47 批落地 |
| P-3 | 工作台确认对话框、设置页「安装插件包」与原处安装单 | 已随 T7 及第 47 批 47-1 落地 |
| P-4 | 远程目录索引与官方索引签名审核 | 待规划（`BL-058`） |
| P-5 | 跨平台沙箱与第三方自定义 `service_id` 轮询集成扩展 | 待规划（C 端跨平台计划 / V-BASE-01） |

## 9. 尚未定案的后续项

本地安装、发布者固定、包内带公钥验签、Home 级受信表存储、macOS Seatbelt 沙箱及设置页安装入口均已定案并落地；仍在后续阶段待决的只有两项：

1. **市场目录索引与官方审核**：官方签名索引何时上线、审核流程与运营规范（`BL-058`）。
2. **跨平台沙箱与完整第三方轮询集成**：非 macOS 平台的无 `sandbox-exec` 隔离方案，以及第三方自定义 `service_id` 接入 Feed 账号来源（V-BASE-01）。
