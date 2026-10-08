# 第三方插件：安装方案

状态：方案，2026-10-08 按 origin/main `31c357df` 核实。本步只写计划，不实现。信任模型用户 2026-10-08 已定（`specs/repository-anti-corruption/spec.md` §1 的 2026-10-08「第三方插件的安装与信任」一行，第五批，PR #312 合入前不在 main 上）：用 `molis-work plugin install <bundle>` 本地装；首次安装时确认并记住发布者密钥；在独立进程的沙箱里运行。其余各节是在现有代码上的设计，待评审。

任务来源：`docs/prompts/repository-anti-corruption.md` §4.6「第三方插件」：用户自行安装插件的路径目前不存在，给出方案（安装命令、签名信任、市场入口、沙箱边界），不在本步实现。扩展点清单见 [EXTENSION-POINTS.md](EXTENSION-POINTS.md) 3.2，内置插件的迁移计划见 [RUNTIME-MIGRATION.md](RUNTIME-MIGRATION.md)。

## 白话说明

作者能把一个插件打成包、用自己的密钥签名，也能在隔离目录里试跑，但用户没有办法把它装进自己的 Home。本方案补四件事：一条安装命令；一张记着「我信任哪个发布者」的表；第三方代码只在沙箱进程里跑、界面由平台画；一个以后可以接上的市场来源。官方内置插件不受影响，它们仍随宿主编译、随宿主升级。

## 1. 今天有什么、没有什么

**有**（代码事实）：

- `tooling/plugin-cli`：`create`、`validate`、`pack`、`identity`、`sign`、`verify`（`tooling/plugin-cli/src/cli.ts`）。`pack` 把 `package.json` 的 `files` 列出的文件打成一个 JSON 包：拒绝符号链接、越界路径、生命周期脚本，不超过 64 MiB（`package-files.ts`）。
- 发布者身份是 Ed25519 公钥的指纹：`ed25519:sha256:<spki 的哈希>`（`pluginPublisherIdentity`，`packages/plugin-runtime/src/package-verification.ts`），Manifest 的 `publisher.signature` 必须等于它，`signPluginPackage` 不一致就拒绝；`verifyPluginPackage(bundle, 可信公钥)` 验签，没签名的包「不是已验证发行物」。
- Runtime 的安装、授权、升级、回滚、停用、卸载，安装记录有 `execution: "host" | "sandbox"`（`packages/contracts/src/platform/plugin.ts`）。`execution: "sandbox"` 的插件必须带明确的授权清单才能安装（`packages/plugin-runtime/src/index.ts`、`supervisor.ts`）。
- 沙箱：创作台做出的「生成插件」就是这条路径。`apps/local-host/src/plugin-builder/installed.ts` 的文件头写明「插件的代码从不在宿主进程里跑，界面是宿主的组件渲染器，所以页面里也没有插件脚本」。`packages/plugin-sandbox` 在 macOS 上用 `sandbox-exec` 启动子进程：不继承环境变量；Seatbelt 禁止创建进程、联网和一切文件写入，可读范围只有暂存的包与 worker、Node 可执行文件和系统库；网络和存储都经宿主服务；非 macOS 直接抛 `UNSUPPORTED_PLATFORM`（`packages/plugin-sandbox/README.md`、`runner.ts`）。
- 升级兼容声明：`upgrade_compatibility.compatible_from_versions`、`migratable_from_versions`（`docs/platform/PLUGIN-DEVELOPMENT.md`「插件版本升级」）。
- 方针：`docs/platform/PLUGIN-PLATFORM.md` §2 写明「官方可安装生态由官方发布并审核；第三方源码由用户自行构建和安装」，签名变化视为新插件，旧授权、存储和提供方绑定不继承。

**没有**：

- 没有 `install` 命令。`molis-work plugin dev` 只在你给的隔离状态目录里 `import()` 源码试跑，必须带 `--allow-unsigned-development`，授权「不是 OS sandbox」。
- 没有信任根。`verifyPluginPackage` 的公钥由调用方传入，没有任何地方保存「我信任这个发布者」；宿主（`apps/`）里也没有任何调用方，包解析和验签只有 `tooling/plugin-cli` 在用。
- 没有从已验签的包起一个插件的加载器。`loadDevelopmentPlugin`（`packages/plugin-runtime/src/development-loader.ts`）是开发用的本地源码加载，在宿主进程里执行。
- 沙箱只认生成插件的形态：一份 JSON 的 `operations` 合同加平台的 UI 目录。第三方的 `native`、`app`、`integration` 插件（有路由、视图、事件、轮询）没有对应的沙箱形态。
- 市场只列内置目录（`pluginMarketCards()` 读 `BUILTIN_PLUGIN_CATALOG`）；BL-058「插件市场的上架与审核流程」列在「明确后续做」。
- 官方内置插件的 `publisher.signature` 是标签（例如 text-stats 的 `official-text-stats-binding`），不是密钥指纹；它们的可信来自编进发行物，不来自验签。

## 2. 原则

1. **第三方代码不进宿主进程，也不进浏览器页面。** 宿主进程里执行（`execution: "host"`）只留给随宿主编译的内置插件；第三方一律 `execution: "sandbox"`，界面由平台的 UI 目录画。
2. **身份 = 发布者密钥指纹 + `plugin_id`。** 密钥变了就是另一个插件（沿用 PLUGIN-PLATFORM.md §2）。
3. **权限 = Manifest 声明的上限 ∩ 用户逐项授予的。** 安装时用户看到每一项权限和它的理由；没有「全部允许」。
4. **一个 Home 一个执行进程。** 命令行不自己安装，转给常驻宿主（`AGENTS.md` 硬约束）。
5. **不静默升级、不静默扩权。** 升级只在同一发布者、版本更高、授权不超出已授予范围时进行（沿用现有升级规则）。

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
4. 用户逐项授予权限（沙箱形态的插件必须带明确授权清单）。
5. 以 `execution: "sandbox"` 安装，保留发行物（升级和回滚用）。
6. 启动，报告结果；失败只影响这个插件。

命令只做解析和请求转发，真正的安装由常驻宿主里的安装服务做，CLI 进程里不新建宿主（落点：`apps/local-host`）。接线点是 `tooling/plugin-cli/src/cli.ts` 的 `PluginCliHost`（`runPluginCli` 的第三个参数），由 `apps/desktop/launchers/cli/main.ts` 注入。注意今天注入的 `runDevelopment` 是 `runLocalPluginDevelopment`（`apps/local-host/src/local-plugin-development.ts`），它在 CLI 进程里自己建一个 `createMolisWorkLocalHost()`、用隔离的状态目录，那不是转发，`install` 不能照搬这种接法。`install` 要新增的成员必须是常驻宿主的客户端（其他进程经动作网关转给常驻 Web 宿主，见 `docs/platform/LOCAL-HOST.md` 第 52 行）；宿主没在运行就明确报错，不自己起一个。工作台里的入口：设置的插件页「从文件安装」，走同一个服务，同一个确认对话框。

## 4. 签名信任（用户 2026-10-08 已定）

定下的模型是**本地侧载加发布者密钥固定**：

- 第一次安装某个发布者的包时，界面展示指纹并要求确认；确认后把指纹固定到受信表。之后同一指纹的包验签通过就可以安装或升级，不再弹确认（权限提升仍要确认）。
- 指纹在 Manifest 里（`publisher.signature`）。但今天的包只带签名，不带公钥（`PluginPackageBundle` 只有 `payload` 和 `signature`）：第一次安装要么给包加一个公钥字段，要么 `install` 带 `--publisher-key <公钥.pem>`。两种做法都先核对「公钥的指纹等于 Manifest 的 `publisher.signature`」，再用这把公钥调 `verifyPluginPackage`。受信表固定的是指纹，不是某一个包；之后的包用受信表里存的公钥验签。
- 撤销：`trust revoke` 之后，这个发布者所有已装插件停用、不可再升级，数据保留。
- 官方目录的签名：官方索引（第 6 节）用官方密钥签名，官方公钥随发行物内置。这与内置插件的标签式 `publisher.signature` 无关。

用户没有采纳的另两种做法：

- **只认官方签名**：市场就是官方目录，没有侧载。最简单，但用户自己做的、同事之间传的插件装不上。
- **本步不开第三方路径**：把缺口记进 C 端计划（路线图 W1-21）。

受信表放在哪里要定：它是 Home 级的（用户信任一次，对所有项目有效），而现有安装记录在每个项目库里（`plugin_runtime_installs`）。需要一个新的 Home 级存储，按 W1-16 和 W4-11 的约定登记（owner 是 Plugin Runtime，备份类别「必备份」）。

## 5. 沙箱边界

- 第三方安装一律 `execution: "sandbox"`。安装服务在装入前检查，`host` 执行只接受 `bundled: true` 的内置条目。
- **阶段一的形态与生成插件相同**：一份 JSON 的 `operations` 合同（查询或命令，严格的 schema 子集）加平台 UI 目录的界面声明；网络、存储、模型、其他动作都只经宿主服务，每次调用复查调用方、授权和 `beforeEffect()`。这样阶段一不需要新的运行机制，只需要把「已验签的包」翻译成现有的 `sandboxedPluginDefinition` 的输入。
- 第三方不能：在宿主进程里执行代码；在页面里放脚本；直接读写文件或联网；读别的插件的私有存储。
- **`methods`**（2026-10-08 决定）：第三方 Manifest 声明的 `methods`（给其他 Agent 的方法）和内置插件一样登记：安装启动时登记，停用、卸载、升级时收回（切片 W4-02）。校验沿用 Manifest 的规则（`tools` 只能是业务工具），没有正文的方法不登记（`docs/platform/PLUGIN-DEVELOPMENT.md`「给其他 Agent 的方法」）。方法正文是文本不是代码，怎样随包携带由 W4-02 的设计定。
- 需要扩展的地方：沙箱合同今天只表达 `operations`，而第三方包的 Manifest 可以有 `routes`、`ui.views`、`events`、`ports`。阶段一只接受 Manifest 里这些字段能映射到沙箱合同的子集（动作和平台目录里的界面），映射不了的在安装时明确拒绝并说明。`kind: "integration"`（轮询外部服务）需要一个「轮询操作加信号草稿」的沙箱合同，放到阶段二。
- **平台限制**：Seatbelt 只在 macOS 上有；在别的系统上，第三方安装要明确拒绝（失败即关闭，沿用 `UNSUPPORTED_PLATFORM`），直到 C 端计划里的无 `sandbox-exec` 沙箱落地。

## 6. 市场入口

- 今天：市场卡片只来自内置目录；用户自己做的插件走创作台。
- 阶段一：本地文件侧载（第 3 节），不需要市场。
- 阶段二：目录索引。一个签名的 JSON：`plugin_id`、版本、包地址、sha256、发布者指纹、摘要。官方索引默认开启并由官方密钥签名；第三方索引需用户自己添加。安装仍走第 3 节的流程，索引只负责「找到包」。
- 审核：只有官方索引的上架要审核（BL-058）。侧载和第三方索引的条目在界面上标「未经官方审核」，并显示发布者指纹。

## 7. 落点

| 要做的 | 位置 | 说明 |
| --- | --- | --- |
| `install`、`list`、`trust` 命令 | `tooling/plugin-cli/src/cli.ts`、`apps/desktop/launchers/cli/main.ts` | 命令只转发 |
| 安装服务 | `apps/local-host`（新文件，不按插件命名） | 解析、信任判定、授权、安装、发行物留存 |
| 受信表 | `packages/plugin-runtime` 的端口加 Home 级存储实现 | 要登记到 Home 数据表 |
| 已验签包到沙箱定义 | `apps/local-host/src/plugin-builder/installed.ts` 一类的翻译层，拆出与创作台无关的部分 | 复用 `sandboxedPluginDefinition` 的运行方式 |
| 沙箱合同扩展 | `packages/plugin-sandbox`、`packages/contracts/src/platform/plugin-sandbox.ts` | 阶段二 |
| 确认对话框、「从文件安装」 | `apps/workbench`（设置的插件页） | 同一确认对话框 |
| 文档 | `docs/platform/PLUGIN-DEVELOPMENT.md`「打包与签名」之后接「安装」；`skills/molis-plugin-dev/authoring.md` | 随实现一起改 |

## 8. 切片与依赖

| 切片 | 内容 | 依赖 |
| --- | --- | --- |
| P-1 | 受信表与信任判定（端口、存储、`trust` 命令） | W4-11（Home 存储登记） |
| P-2 | 安装服务与 `install`、`list`、`uninstall`（只收沙箱形态的子集） | P-1；W4-01（探针夹具能走完安装、发现、调用、升级、停用、卸载）；W4-02（`methods` 随安装生命周期登记） |
| P-3 | 工作台确认对话框与「从文件安装」 | P-2 |
| P-4 | 目录索引与官方索引签名 | P-2；BL-058 |
| P-5 | 沙箱合同扩展（轮询与信号） | P-2；C 端计划里的跨平台沙箱 |

这些切片不在路线图 §10 的 87 片内，是本方案提出的建议，待用户并入路线。

## 9. 待决

信任模型、安装命令和沙箱形态已定（第 4 节开头）；下面是实现前还要评审的设计问题：

1. **阶段一的表达力**：接受只有「动作加平台目录界面」的第三方插件，还是要等 `kind: "integration"` 的沙箱合同再开放。
2. **非 macOS**：第三方安装在非 macOS 上明确拒绝，还是等跨平台沙箱。
3. **受信表的存储**：新建 Home 级存储，还是挂到现有的 Home 配置文件。
4. **公钥怎么到达**：给包加一个公钥字段，还是 `install` 带 `--publisher-key`（第 4 节第二条）。
5. **市场与审核**：官方索引何时做、谁审核（BL-058）。
