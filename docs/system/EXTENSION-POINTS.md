# 扩展点清单：怎么加、现在要改几处、目标几处

状态：2026-10-08 按 origin/main `31c357df` 核实（数字都在这个提交上重量过）。15 个方向各写「怎么加」「现在要改的位置」「目标」；第 4 节用六个下一步功能推演一遍；迁移到 Plugin Runtime 的计划见 [RUNTIME-MIGRATION.md](RUNTIME-MIGRATION.md)，第三方插件的安装方案见 [THIRD-PARTY-PLUGINS.md](THIRD-PARTY-PLUGINS.md)。除内置插件和服务集成的少数方向外，目标大多还没有对应实现，写出来是为了让后面的切片有数字可对。

用户决定见 `specs/repository-anti-corruption/spec.md` §1 的 2026-10-07 与 2026-10-08 各行；其中 2026-10-08 的第五批（宿主设置写入、界面翻译、调用编号上界面、右栏「讨论」页签与 IM、第三方插件信任、Characters 并进宿主、Runtime 插件的 methods 等）在 PR #312，合入前不在 main 上。

任务来源：`docs/prompts/repository-anti-corruption.md` §4.6；路线图切片 W1-15（`specs/repository-anti-corruption/roadmap-2026-10-07.md`）；用户决定见 `specs/repository-anti-corruption/spec.md` §1（2026-10-07「插件平台范围」「第一个迁到 Runtime 的样板」「两套能力机制收敛」「记忆、放置与情境启发式的层次」等行）。

## 白话说明

Molis Work 是插件基座加多个插件。想加一个东西时，最好只动那个东西自己的包和它的声明，平台里的名单不用改。现实是：加一个内置插件要改十几处平台文件（包依赖、目录、监督器、色调、图标、翻译），加一个界面语言要改约六个代码文件再补 42 份词典。这份清单把每个方向「今天要改哪些文件」逐个点名，写出目标数字，再用六个真实的下一步功能（风险记录插件、Coding 质量保证、新的外部服务、团队与权限、自动化规则、调用诊断）演练一遍，看哪里超过目标、靠什么补。

## 1. 口径

- **基线**：origin/main `31c357df`。数字都是从这个提交的代码量出来的，每个方向列出了具体文件，读者可以逐个核对；代码改了，数字跟着改。
- **一处 = 一个文件。** 计入新功能自己的包之外、必须新增或修改的源码和配置文件（含在宿主里新建的文件）。不计测试、文档、`pnpm-lock.yaml` 和生成物。
- **分两栏记**，「现在」和「目标」都按同一口径：
  - **登记**：不改它功能起不来或不可见（包依赖、装配条目、目录条目、渲染接线）。
  - **名单**：不改它功能能用，但某处退化（没有英文、没有色调、不在分组里）。
- **外加两项，两端都不计入「处」**：新内置插件还要在 `tests/builtin-plugin-assembly-gate.test.ts` 的 `RUNTIME_ASSEMBLED` 加一行，在 `docs/SSOT-MATRIX.md` 加一行 owner。前者是测试文件，后者是文档，按上一条本来就不计；它们现在要、目标也要（门禁那一行只有在 W5-02 生成的目录同时供给门禁测试时才能去掉，这一点不在 W5-02 现有的描述里），所以写成「外加 2」，不混进现在和目标的比较。
- **不计功能本身的产品集成**。例如待办被助理、首页、简介引用，是待办这个产品功能的一部分，不是扩展点。
- **目标是上限**，等于对应切片完成后手改的文件数。没有对应切片的写「无切片」，并在第 4.3 节给出建议。路线图以外的建议不算已定。
- **复核方法**（Text Stats，包外的包名引用）：

```bash
git grep -l -E '@molis-ai/molis-work-plugin-text-stats|plugins/native/text-stats/|TEXT_STATS_(PROJECT_)?PLUGIN_ID' \
  -- . ':!plugins/native/text-stats' ':!tests' ':!docs' ':!specs' ':!skills' ':!pnpm-lock.yaml' ':!*.md' ':!*.html'
git grep -l -E '"text-stats"|text-stats:' -- apps packages scripts package.json ':!*.md'
```

第一条得到 7 个文件（包依赖与装配）。第二条得到 6 个，其中 `coding-surface.ts` 与第一条重复，另有 5 个按名字登记的位置（见 3.1），合计 12。

## 2. 总表

| # | 方向 | 现在 | 目标 | 靠什么到目标 |
| --- | --- | --- | --- | --- |
| 1 | 内置插件（项目插件，经 Plugin Runtime） | 12（另有 2 处按需；外加 2）；个人（Home 级）插件没有合规路径 | 1（外加 2）；没有 X-1 是 4 | W3-06、W4-03、W5-02、W5-06 加 X-1（4.3）；W4-04 先做样板 |
| 2 | 第三方插件 | 改本仓库 0 处，但用户今天装不上 | 0；平台新增 4 件 | THIRD-PARTY-PLUGINS.md（信任模型已定，方案未实现） |
| 3 | 服务集成 | token 型 1；公开来源型 5–7；自带 OAuth 型 12 | 1 | OAuth 型靠 W5-11；公开来源型无切片 |
| 4 | AI 能力、Agent 角色、提示词 | 已有插件 0；新 Runtime 插件 +1；系统级 2 | 0 / 0 / 2 | W3-06（`services.model`） |
| 5 | 动作与消费场景 | 0 | 0 | 已达到 |
| 6 | 设置分区 | 插件自带 0；宿主自有 9（含项目页 11） | 0 / 2 | 无切片，建议并入 W5-02 |
| 7 | 底栏、侧栏、标题栏入口 | 底栏 0（落在「更多」）+ 分组或常驻 1；侧栏 0；标题栏新增一种状态项 4–6 | 0 / 0 / 0 / 2 | 分组与常驻靠 W5-02；标题栏无切片 |
| 8 | 搜索来源 | 0–1 | 0 | W5-02 |
| 9 | 记忆作用域 | 10 | 3 | 无切片，建议并入 W4-08 的边界规则 |
| 10 | 新 Module | 6（有项目库表 7） | 4 | X-1（包登记生成）；表登记靠 W4-11、X-5 |
| 11 | 新横向服务 | 6 | 4 | 同上 |
| 12 | 新 Agent Runtime | Agent Host 内 CLI 1、自写适配器 3；外部 Runtime 接入 6，接入加角色导入 11–15 | 1 / 3 / 2 | 无切片，建议新增 |
| 13 | 界面插槽 | 5 | 2 | 无切片 |
| 14 | 界面语言 | 6 个代码文件 + 42 份词典 | 1 + 每个词典所有者各交一份 | W5-03（2026-10-08 改为稳定键）覆盖一部分 |
| 15 | 操作系统平台 | 20 个 macOS 专用文件 | 4 个适配器 | 属 W1-21（C 端计划），本阶段不实现 |

## 3. 逐个方向

### 3.1 内置插件

**怎么加**：新的内置插件只走 Plugin Runtime（`AGENTS.md` 硬约束；门禁 `tests/builtin-plugin-assembly-gate.test.ts`）。步骤在 `skills/molis-plugin-dev/host.md`「内置插件：经 Plugin Runtime 装配」：包 `plugins/native/<id>`（Manifest、动作、界面贡献、客户端、`en.ts`）、监督器条目、目录条目。HTTP 由 Manifest `routes` 声明，挂在 `/api/plugins/<plugin_id>/`，不写 `apps/local-host/src/<插件>-native-plugin-http.ts`。

**现在要改**（包外 12 处，另 2 处按需，外加 2）。最小样本是 Text Stats：包外被 12 个源码或配置文件点名；门禁名单和 SSOT 行是两端都要的外加项，不计入 12。一个带自己舞台页的新插件，把 `coding-surface.ts`、`demo-plugin-seed.ts`、`workspace-plugin-bindings.ts` 三项换成舞台渲染的两处和英文词典，数字仍是 12：

| 栏 | 文件 | 要做什么 |
| --- | --- | --- |
| 登记 | `scripts/workspace-packages.mjs` | 一条 `entry(...)`；`apps/workbench`、`apps/local-host` 两处 `extraWorkspaceDependencies`（`pnpm workspace:check` 逐项比对） |
| 登记 | `package.json`、`apps/local-host/package.json`、`apps/workbench/package.json` | 依赖行（根下的测试按包名 import 工作区包，靠根包的依赖解析） |
| 登记 | `apps/local-host/src/project-plugins.ts` | import 和 `PluginSupervisorEntry`（`bundled: true` 加 `nativePluginReleaseArtifact`）；要宿主端口时在同一文件构造 |
| 登记 | `apps/workbench/src/builtin-plugins.ts` | import 和 `BUILTIN_PLUGIN_CATALOG` 条目：manifest、`summary`、`personal`，以及 `workbench` 包（`order`、`contributions`、`stylesheet`、`clientFactory`、`searchRow`），可选 `instructions`、`agent`、`methods` |
| 登记 | `apps/local-host/src/web-goals-read.ts` + 一个宿主渲染文件 | 舞台页：`plugin_stages` 由几个具名函数（`charactersWorkbenchPanel`、`codingCompanionStages`、`codingWorkbenchPanel` 等）拼出，新插件要加一个函数和一处调用；Shelf 走另一条路（`ui-composition.ts`、`renderer.ts`、`goals-page-renderer.ts` 三处），两条路没有统一规则 |
| 名单 | `apps/workbench/src/i18n/en.ts` | `import` 并 `...X_EN`；没有它，英文界面仍是中文 key |
| 名单 | `packages/design-system/src/palette.ts` | `MW_PLUGINS` 的色调；没有则用 `var(--muted)`（`tab-workspace.ts` 的 `PLUGIN_COLOR[tab.plugin] \|\| "var(--muted)"`） |
| 名单 | `packages/design-system/src/icons.ts`、`packages/design-system/src/primitives/catalog.ts` | `PLUGIN_ICON`、`PLUGIN_NAMES`，只进 `/__ui/catalog` 的图标清单 |
| 外加 | `tests/builtin-plugin-assembly-gate.test.ts` | `RUNTIME_ASSEMBLED` 加一行 |
| 外加 | `docs/SSOT-MATRIX.md` | 一行 owner |
| 按需 | `apps/workbench/src/immersive-shell.ts` | `RAIL_TOOL_GROUPS` 分组、`BAR_RESIDENT_IDS` 常驻；不改则落在插件切换器的「更多」 |
| 按需 | `apps/workbench/src/scripts/client/global-search.ts` | `SEARCH_ITEM_TAB_SURFACES`，命中结果按标签打开某个对象时才需要 |

Text Stats 的 12 个文件是：上表的 `scripts/workspace-packages.mjs`、3 个 `package.json`、`project-plugins.ts`、`builtin-plugins.ts`、`palette.ts`、`icons.ts`、`catalog.ts`，加 `coding-surface.ts`（宿主里写死的伙伴页渲染分支）、`workspace-plugin-bindings.ts`（默认连线表）、`demo-plugin-seed.ts`。另有 `plugins/native/coding`、`plugins/native/files` 两个包点名了它（嵌入声明和客户端），属于它与 Coding 的伙伴关系，不计。

**个人（Home 级）插件**：没有合规路径。`createPluginPlatform` 只在每个项目里建（`project-plugins.ts` 的 `startPlatform`、`installed-plugin-host.ts`），`PluginHostServices`（`packages/contracts/src/platform/plugin.ts`）只有项目库里的键值存储，没有 Home 库、也没有模型服务。现有样本 Shelf 靠宿主里手写的端口文件接上 Home 数据：按第 1 节同一条命令换成 shelf，包外有 17 个源码或配置文件点名它，宿主里仍有 `shelf-native-plugin-http.ts`、`personal-native-plugin-http.ts`、`shelf-actions.ts`、`shelf-ai.ts`（这类 `*-native-plugin-http.ts` 新文件已被门禁拦住）。Characters 原来也是这样的样本；2026-10-08 已定它不再是 Runtime 插件、并进宿主（[RUNTIME-MIGRATION.md](RUNTIME-MIGRATION.md) 第 5.4 节），所以不再作为新插件的样本。W3-06 补平台服务后才有路径。

**目标：1（外加 2）。** 新增一个内置插件 = 自己的包 + `scripts/workspace-packages.mjs` 一条登记，外加门禁名单一行和 SSOT 一行。其余由声明产生，下面五项都做到才是 1：

- W3-06：模型服务、Home 库服务、Home 级 Runtime 实例（2026-10-07 已定：个人插件装在一个 Home 级实例，按项目启用照旧，数据留在 `{home}/<id>/<id>.db`）。
- W4-03：伙伴页按 Manifest 视图渲染，去掉 `coding-surface.ts` 和默认连线表里按插件写的分支。
- W5-02：目录、监督器列表、设计系统名单、搜索标签面、分组与常驻提示都由各包的声明生成。
- W5-06：声明式贡献挂载，取代每个插件一套的渲染接线。
- **X-1（4.3）**：应用的 `package.json` 依赖和根包依赖由脚本生成。路线图第 4.6 节的普查已经把「应用的 package.json 依赖」列进声明式注册该生成的东西（`specs/repository-anti-corruption/roadmap-2026-10-07.md` 第 607 行），W5-02 的切片描述却没有写它。没有 X-1，目标是 4（`scripts/workspace-packages.mjs` 加三个 `package.json`），不是 1。

门禁名单那一行（`RUNTIME_ASSEMBLED`）也只有在 W5-02 生成的目录同时供给门禁测试时才能去掉；本清单把它记作外加项，不替 W5-02 许诺。

### 3.2 第三方插件

**怎么加**：作者用 `tooling/plugin-cli`：`create`、`validate`、`pack`、`identity`、`sign`、`verify`（`tooling/plugin-cli/src/cli.ts`）。本机试跑用 `molis-work plugin dev <源码目录> <隔离状态目录> <授权列表> --allow-unsigned-development`，在隔离目录里 `import()` 源码，不进用户的 Home，授权也「不是 OS sandbox」。手册：`docs/platform/PLUGIN-DEVELOPMENT.md`「创建和运行」「打包与签名」。

**现在**：作者改本仓库 0 处；用户装不上。`cli.ts` 没有 `install`，`verifyPluginPackage` 的可信公钥要调用方传入（没有保存信任根），`loadDevelopmentPlugin` 是开发用的本地源码加载，产品里的「插件市场」卡片只读内置目录（`pluginMarketCards()` 读 `BUILTIN_PLUGIN_CATALOG`）；用户自己做的插件走创作台发布、再由 `installed-plugin-host.ts` 安装运行，那条路径是沙箱里的生成插件。

**目标**：仓库内 0 处（作者不改本仓库）；平台新增四件：安装命令 `molis-work plugin install <bundle>`、受信发布者表、独立进程的沙箱运行、市场入口。信任模型用户 2026-10-08 已定：本地装，首次安装时确认并记住发布者密钥，在独立进程的沙箱里运行；这一步只写计划，不实现。方案见 [THIRD-PARTY-PLUGINS.md](THIRD-PARTY-PLUGINS.md)。

### 3.3 服务集成

**怎么加**：`plugins/official-integrations/<id>` 用 `definePollingIntegrationPlugin`（`skills/molis-plugin-dev/integrations.md`）。三种形状，成本不同：

| 形状 | 例子 | 现在 | 文件 |
| --- | --- | --- | --- |
| token 型目录连接器 | Linear、Slack、Jira 等 | 1（另可选 1 个图标） | `plugins/official-integrations/catalog/src/catalog.ts` 加一条 `spec(...)`；服务连接目录从 `CATALOG_CONNECTORS` 派生（`apps/local-host/src/connector-directory.ts`）；图标在 `apps/workbench/src/connector-icons.ts`，缺图标时 `connectorIconSvg` 返回 `undefined`，界面不报错 |
| 公开来源型 | RSS、YouTube | 5–7 | 3 处包登记（`scripts/workspace-packages.mjs`、`package.json`、`apps/local-host/package.json`，RSS 另有 `apps/workbench/package.json`）+ `apps/local-host/src/feed-source-runtime.ts`、`feed-source-service.ts`（RSS 还有 `apps/workbench/src/feed-projection-ui.ts`） |
| 自带 OAuth 或专属协议型 | GitHub、Gmail | 12 | 包登记 3（`scripts/workspace-packages.mjs`、`package.json`、`apps/local-host/package.json`）；宿主新文件 2（`<id>-connector.ts`、`<id>-oauth.ts`）；宿主分支 5（`official-integrations.ts` 的 `definitionFor`/`defaultProviderFor`、`connector-directory.ts`、`web-connectors-settings.ts`、`feed-connector-sync.ts`、`connector-account-actions.ts`）；`packages/contracts/src/services/connector-host.ts` 的 `ConnectorAuthKind`；`scripts/check-package-boundaries.mjs` 里按服务列出的禁用主机 |

**目标：1。** 服务只在自己的集成包里声明（鉴权形态、同步、目录卡片、OAuth 参数）。token 型已经达到。OAuth 型靠 W5-11（连接器设置和 OAuth 移入各自的官方接入包）。「宿主设置写入」那一项用户 2026-10-08 已定（决定 #7，`specs/repository-anti-corruption/spec.md` §1「宿主设置里的写入只走 HTTP」，PR #312）：宿主设置里的写入留作管理接口并登记例外，其中连接器路由以后搬进各自的官方接入插件。所以 OAuth 型的目标就是 1，不再有「登记为宿主例外、目标是 5」的一支；上表的 5 个宿主分支里，`web-connectors-settings.ts` 就是这类要搬走的连接器路由；目标 1 还要求其余 4 个分支也由集成包的声明取代，这属于 W5-11 的范围，由那一片的设计确认。公开来源型的接线是 `feed-source-service.ts` 里按来源种类（`rss`、`youtube`、`customRss`）写的对象，W5-11 不覆盖，建议随 W5-02 的声明式登记一起做。

### 3.4 AI 能力、Agent 角色、提示词

**怎么加**：AI 能力就是一个动作（`model:invoke` 权限，`scheduling: "concurrent"`，返回后 `await caller.beforeEffect()`）；模型调用只经 `horizontal/agent-host`。骨架见 `docs/platform/PROLOGUE-AI.md` §4、§7，提示词登记见 `docs/platform/PLUGIN-DEVELOPMENT.md`「调用模型：登记的指令」。

| 场景 | 现在 | 位置 |
| --- | --- | --- |
| 已有插件里再加一个 AI 动作 | 0 | 包内 `actions.ts`、`prompts.ts`；指令追加到包导出的 `X_INSTRUCTIONS`，目录条目已引用它 |
| 新的 Runtime 插件要调模型 | +1 | `PluginHostServices` 没有模型服务（`packages/contracts/src/platform/plugin.ts`）：要在宿主里新建一个端口文件（如 `shelf-ai.ts` 那样），由 `project-plugins.ts` 注入；`project-plugins.ts` 已在 3.1 的 12 处里 |
| 宿主自己的模型调用（不属于任何插件） | 2 | `apps/local-host/src/agent-definitions/system-prompts.ts`（定义）、`builtin-instructions.ts`（`BUILTIN_INSTRUCTIONS`、`SYSTEM_INSTRUCTION_SOURCES` 登记）；调用方是功能本身，不计 |
| 内置 Agent 的角色提示词与方法 | 0 | 目录条目的 `agent`、`methods`（`BUILTIN_PLUGIN_AGENTS` 派生）；系统内联角色在 `builtin-instructions.ts` 的 `BUILTIN_INLINE_AGENT_*` |
| Runtime 与已安装插件的 `methods` | 不会被登记 | 只有目录条目里的 `methods` 在 Host 启动时登记（`apps/local-host/src/agent-definitions/builtin-agents.ts` 的 `builtinRegistrations`）；`packages/plugin-runtime`、`apps/local-host/src/installed-plugin-host.ts` 和 `plugin-builder/` 里没有任何登记 `methods` 的代码。2026-10-08 已定：和内置插件一样登记，启动时登记，停用、卸载、升级时收回（切片 W4-02） |
| 用户自定义角色 | 0 | 运行时数据（Characters），不改代码 |

宿主里还有 5 个按插件写的 AI 适配文件：`alchemist-prologue.ts`、`cognia-prologue.ts`、`jelly-model.ts`、`shelf-ai.ts`、`typesafe-prologue.ts`。

**目标：0 / 0 / 2。** W3-06 把模型做成 Runtime 插件服务（`services.model`，由 agent-host 支撑，带登记指令、concurrent 调度和 `beforeEffect`），不是新的 typed 宿主能力（2026-10-07「两套能力机制收敛」：typed 注册表只留作 Runtime 插件的宿主内服务通道，不许再加新项）。系统级调用保持 2：定义加登记是有意的显式登记，`tests/prompt-registration.test.ts` 会让没登记的调用失败。W5-11 用 `services.model` 取代 6 个适配文件。`methods` 随 W4-02 生效：Runtime 和已安装插件声明的方法由监督器和安装宿主在启动时登记、在停用、卸载、升级时收回，目标同内置插件（0 处宿主改动）。

### 3.5 动作与消费场景

**怎么加**：Manifest 声明 `actions`，在 `start()` 返回处理器（Runtime 插件）；构建期插件的处理器由包里的 `create<X>ActionHandlers` 生成，宿主文件只注入端口（如 `apps/local-host/src/form-actions.ts`，`definitions: formManifest.actions!`）。合同：`specs/action-architecture/spec.md` §3；写法：`skills/molis-plugin-dev/capabilities.md`；消费场景：`skills/molis-plugin-dev/host.md`「接到统一判断场景」。

**现在：0。** 权限集合由动作自己推出（例如 `TODO_ACTION_PERMISSIONS` 是 `TODO_ACTIONS.flatMap(...)`），页面、工作流、Agent、外部 MCP 从同一个目录发现（MCP 工具名 `molis_work_v1_action_<动作>__v<版本>`，`apps/local-host/src/mcp-action-grants.ts`），场景不再改宿主白名单。**目标：0，已达到。** 这个方向是其他方向的参照。

### 3.6 设置分区

**怎么加**：插件的设置页在 Manifest 的 `ui.views` 里声明 `slot: "settings"` 并给 `order`；宿主分类占 10–90，插件页跟在前一个宿主分类的分组里，其余在「插件」组（`apps/workbench/src/settings-sections.ts`、`plugin-settings-catalog.ts`）。当前项目设置见 `docs/platform/PROJECT-SETTINGS.md`。

| 场景 | 现在 | 文件 |
| --- | --- | --- |
| 插件自己的设置页 | 0 | Manifest；图标取视图的 `icon`，缺省为 `settings`（`plugin-settings-catalog.ts` 的 `PLUGIN_SETTINGS_ICONS` 可选） |
| 宿主自有的全局分区（以「记忆」为例） | 9 | `settings-sections.ts`（`HOST_SECTIONS`）、`settings-renderer.ts`、`settings-directory.ts`、`settings-navigation.ts`、`plugin-settings-catalog.ts`（`isHostGlobalSettingsSection`）、`scripts/client/settings-directory.ts`、`page-assets.ts`、`scripts/settings.ts`、`apps/local-host/src/web-goals-read.ts`（路由到分区） |
| 同时有项目版 | +2 = 11 | `project-settings-pages.ts`、`project-settings-folds.ts` |

**目标：0 / 2。** 宿主分区由一张登记表产生（分区 id、名称、图标、分组、顺序、渲染函数、静态资源），再加分区自己的渲染文件。`settings-sections.ts` 的注释写「The one list of global settings categories」，但分区 id 实际散在 9 个文件里，这是名单与单一来源不符的地方。无切片，建议并入 W5-02（4.3 的 X-2）。

2026-10-08 已定 Characters 并进宿主、界面仍是设置里的一节：今天「角色」是插件 Manifest 里 `slot: "settings"`、`order: 35` 的视图（`plugins/native/characters/src/manifest.ts`），并进宿主后就是 `HOST_SECTIONS`（现有 11 项）的第 12 项，按上表要改的位置一样多，这也是做 X-2 的又一个理由。

### 3.7 底栏、侧栏、标题栏入口

**怎么加**：入口由 Manifest `ui.views` 的 `slot` 决定（`UI_VIEW_SLOTS`：`navigator`、`stage`、`settings`、`island`、`side`，`packages/contracts/src/platform/ui.ts`），写法见 `skills/molis-plugin-dev/ui.md`，布局规则见 `DESIGN.md` 和 `specs/craft-finish/spec.md`。

| 入口 | 现在 | 说明 |
| --- | --- | --- |
| 底栏插件切换器 | 0 | `navigator` 视图加目录条目的 `summary`（`pluginMarketCards()` 只收有 `summary` 且有 `navigator`/`island` 视图的条目）；没有分组的插件落在「更多」（`immersive-shell.ts` 注释：adding a Plugin never edits the shell） |
| 分组、常驻、默认固定 | 1 | `apps/workbench/src/immersive-shell.ts` 的 `RAIL_TOOL_GROUPS`、`BAR_RESIDENT_IDS`；`DOCK_DEFAULT_PINS` 在 `plugin-catalog.ts`，只有 4 个核心插件 |
| 侧栏标签 | 0 | `side` 视图，贡献的目标槽是 `workbench.side`；插件启用才出现 |
| 标题栏 | 插件没有入口 | 标题栏的状态项（后台任务、插件通知铃铛）是宿主的。插件通过 `background_job` 声明（后台任务）或到期提醒、插件事件间接出现，不是自己的槽。新增一种宿主状态项要改 4–6 个文件：`immersive-shell.ts`、一个客户端脚本（如 `scripts/client/background-tasks.ts`）、`scripts/client/initialization.ts`、`styles/immersive-navigation.ts`；进入流程页也要显示时再加 `arrival/chooser.ts`、`styles/arrival.ts` |

**目标：0 / 0 / 0 / 2。** 分组、常驻、默认固定作为 Manifest 或目录的放置提示（W5-02 已把「shell placement hints」列入范围）；标题栏状态项做成声明加一个渲染入口。标题栏这一项无切片。

### 3.8 搜索来源

**怎么加**：每种对象一个读取器（`defineSubjectContextAction`），再声明一个搜索来源（`defineSearchEntriesAction`）；宿主从动作目录读 `search_source`，插件不写索引（`skills/molis-plugin-dev/search.md`，`docs/platform/PLUGIN-DEVELOPMENT.md`「系统搜索」）。

**现在：0–1。** 索引和发现都是声明驱动；命中后怎么打开：目录条目的 `workbench.searchRow`（条目本来就要写，不另计），或把插件的 surface 加进 `apps/workbench/src/scripts/client/global-search.ts` 的 `SEARCH_ITEM_TAB_SURFACES`（现有 10 项）。**目标：0**，由来源声明的 `open: { surface, id }` 推出（W5-02）。另有一个已知缺口 BL-040：生成插件不能声明搜索来源。

### 3.9 记忆作用域

**怎么加**：此前没有写。作用域目前是 `"personal" | "project" | "character"`（`packages/contracts/src/services/memory.ts`）。现行做法是按「现在」列出的文件逐个加分支：合同里加作用域值、校验 schema 的 `enum` 和文案；`horizontal/memory/src/service.ts` 里加所有者解析、写入门和召回过滤；`prefs.ts` 里加默认开关；`memory-host.ts` 里映射到 Prologue；`prologue-action-gateway.ts` 里让 `remember` 工具认识它；设置页和助理界面里加显示。相关说明：`horizontal/memory/README.md`、`specs/archive/memory-system/spec.md`。

**现在：10。** 作用域名在这些文件里分支：`packages/contracts/src/services/memory.ts`、`packages/contracts/src/services/agent-host.ts`、`packages/contracts/src/services/assistant.ts`（后两个各自重写了一遍字面量联合）、`horizontal/memory/src/service.ts`、`horizontal/memory/src/prefs.ts`、`horizontal/agent-host/src/adapters/prologue-action-gateway.ts`（`remember` 工具解析）、`apps/local-host/src/memory/memory-host.ts`（映射到 Prologue 的 `user | project | character`）、`apps/local-host/src/assistant/assistant-service.ts`、`apps/workbench/src/settings-memory.ts`、`apps/workbench/src/scripts/client/assistant-island.ts`。此外记忆正文和作用域隔离在 Prologue Memory（`horizontal/memory/README.md`），加新作用域前要先确认 Prologue 那边支持。

**目标：3。** 作用域在合同里声明一次（id、所有者解析、默认开关、显示名、可见受众），其余按声明读取；Prologue 那边是否支持另算。2026-10-07 已定记忆归「平台产品服务」、代码不搬，W4-08 只改文档与边界规则，所以这一项没有现成切片，建议在 W4-08 的边界规则里一并登记作用域表。

### 3.10 新 Module

**怎么加**：先写包 README 的「开发要求」，再写代码（`docs/system/DEVELOPMENT-REQUIREMENTS.md`；`docs/system/PACKAGE-BOUNDARIES.md` §4）；归属见 `docs/modules/README.md`。

**现在：6（项目库里有表时 7）。** 以 `modules/characters` 为样本：`scripts/workspace-packages.mjs`、`package.json`、`apps/local-host/package.json`（3）；`packages/contracts/src/modules/<id>.ts` 和 `packages/contracts/package.json` 的 `exports`（2）；宿主装配一处，如 `apps/local-host/src/characters-host.ts`（1）；表建在项目库时再加 `apps/local-host/src/project-database-schema.ts`（它在 `PROJECT_DATABASE_BASELINE` 里逐个引入各 owner 的建库 SQL，并有总版本号，改任何一个 owner 的表都要升版本）。

**目标：4。** 包登记 1（依赖清单生成），合同 2，宿主装配 1。表在项目库的 Module，登记也由 owner 声明（X-5）。

### 3.11 新横向服务

**怎么加**：同 3.10，边界见 `docs/horizontal/README.md`。以 `horizontal/search`、`horizontal/placement` 为样本：包登记 3，合同 2（`packages/contracts/src/services/<id>.ts` 及其 `exports`），宿主动作文件 1（`apps/local-host/src/search-actions.ts`、`placement-actions.ts`）。**现在：6，目标：4**，原因与 3.10 相同。

### 3.12 新 Agent Runtime

「Agent Runtime」有三种，改动处差别很大：

| 种类 | 现在 | 位置 | 目标 |
| --- | --- | --- | --- |
| Agent Host 里的命令行 Runtime | 1 | `apps/local-host/src/agent-host-composition.ts` 的 `DEFAULT_CLI_RUNTIMES` 加一行（`CliAgentAdapter`） | 1 |
| Agent Host 里自写适配器 | 3 | `horizontal/agent-host/src/adapters/<名>.ts`（实现 `AgentRuntimeAdapter`，`packages/contracts/src/services/agent-host.ts`）、`horizontal/agent-host/src/index.ts` 导出、`agent-host-composition.ts` 注册 | 3 |
| 外部 Runtime（Codex、Claude Code、OpenCode 这类，经 MCP 和 Skill 接入 Molis Work） | 接入 6；接入加角色导入 11–15 | 以 `pi-agent` 为例（6）：`packages/contracts/src/platform/installation-detection.ts`（`SUPPORTED_RUNTIME_IDS`）、`apps/local-host/src/installer/runtime-config-adapters.ts`、`apps/desktop/src/launch.ts`、`apps/desktop/src/web-host.ts`、`plugins/native/work/src/ui/render.ts`、`plugins/native/work/src/ui/terminal.ts`；`grok-build` 还点名 Characters 导入（11 个文件），`opencode` 再加 Shelf 和设置页（15 个文件，分布在 8 个包） | 2 |

外部 Runtime 的目标是一张 Runtime 描述表（id、可执行名、配置与 Skill 路径、恢复参数、导入根、显示名），各处读它。无切片，建议新增（X-4）。`horizontal/agent-host/README.md` 没有写怎么加适配器，这一节补上。

### 3.13 界面插槽

**怎么加**：先区分两层：Manifest 的视图槽 `UI_VIEW_SLOTS`（`packages/contracts/src/platform/ui.ts`）和工作台 HTML 槽 `WORKBENCH_UI_SLOTS`（`apps/workbench/src/document-shell.ts`：`directory`、`main`、`overlay`、`settings`、`side`）。契约见 `skills/molis-plugin-dev/ui.md`、`docs/platform/UI-PLATFORM.md`。

**现在：5。** 以最近加的 `side` 槽为样本：`packages/contracts/src/platform/ui.ts`、`apps/workbench/src/document-shell.ts`、`apps/workbench/src/plugin-catalog.ts`（`sideEntries`）、`apps/workbench/src/side-view-document.ts`（把贡献渲成独立文档）、`apps/workbench/src/goals-page-renderer.ts`（`sideTabs`）。**目标：2**，槽的定义合并成一张表（视图槽与 HTML 槽同表，放在合同里），外壳里放这块区域的渲染一处。无切片。

### 3.14 界面语言

**怎么加**：此前没有写。中文原文是 key，英文是词典（`apps/workbench/src/i18n.ts`）。现行做法：在 `i18n.ts` 里加语言值，并让 `isWebLocale`、`htmlLang`、`dateTimeLocale`、`listJoin` 认识它；在 `renderLocaleSwitch` 和设置页的语言开关里加一项；客户端 `L`（`clientI18nScript`）今天写死了 `MOLIS_WORK_EN` 和「非中文即英文」的判断，要一并改；给「现在」列出的 42 份词典各补一份同形的目标语言词典并在汇总处接入；跑 `tests/i18n.test.ts`。

**现在：5 个代码文件 + 42 份词典。** 代码里 `"zh" | "en"` 字面量和两项开关在：`apps/workbench/src/i18n.ts`（`WebLocale`、`WEB_LOCALES`、`isWebLocale`、`htmlLang`、`dateTimeLocale`、`listJoin`、`renderLocaleSwitch`、客户端 `L`）、`settings-appearance.ts`、`settings-directory.ts`、`settings-renderer.ts`、`plugins/native/goals/src/safety-ui-model.ts`。词典 42 份：工作台 14 份（`apps/workbench/src/i18n/` 下 12 份 `*-en.ts`，主词典也是汇总的 `apps/workbench/src/i18n/en.ts` 本身，加 `functions/en.ts`），插件 28 份（16 个插件各一份，加 Goals 的 12 份 `*-en.ts`），汇总处是 `apps/workbench/src/i18n/en.ts`。

**用户 2026-10-08 的决定（#16，`specs/repository-anti-corruption/spec.md` §1「界面翻译」，PR #312；用户没有选推荐的「中文作键」）：全部换成稳定键。** 约 164 个源文件改用稳定键（spec 该行给的数字），词典按所有者分，CI 查缺失、无用与冲突；第 5 波的「翻译按主人分」改成「稳定键」，并先做一个插件样板（W5-03）。换完以后键不再是中文原文，所以中文也要有自己的词典，加语言的做法随之变成：语言清单加一项，每个词典所有者各交一份该语言的词典；上面「怎么加」里客户端 `L` 写死的「非中文即英文」判断因此要改成按词典查。「怎么加」和「现在」写的是换成稳定键之前的做法和数字。

**目标：1 + 每个词典所有者各交一份。** 语言清单声明一处，词典按所有者注册、键是稳定键（W5-03 把插件词典从 `en.ts` 的 import 里拆出，W1-08 加缺失检查）。翻译内容是内容工作，不计改动处。加语言的清单项（字面量联合和开关）W5-03 不一定覆盖，要在那一片里明确。

### 3.15 操作系统平台

**怎么加**：此前没有写，`docs/platform/DESKTOP.md` 只有 macOS。现行做法是逐个能力补第二个平台的实现，不是一处开关：常驻服务换成该系统的服务管理；沙箱换成该系统的隔离机制；素材原生组件换成该系统的实现；桌面外壳补该系统的 Tauri 适配器和打包脚本。已有非 macOS 分支的能力不用动。

**现在：20 个 macOS 专用文件，没有一个接口有第二个平台的实现。**

| 能力 | 文件 | 平台情况 |
| --- | --- | --- |
| 常驻服务 | `apps/local-host/src/installer/web-service-platform.ts`、`web-service-detection.ts`、`web-service-process.ts`、`scripts/start.mjs`（4） | 全靠 `launchctl`；非 darwin 时 `detectWebService` 返回 `unsupported`（「当前系统尚未提供 Molis Work 常驻服务集成」） |
| 生成插件的沙箱 | `packages/plugin-sandbox/src/runner.ts`、`seatbelt.ts`、`apps/local-host/src/plugin-builder/build-checks.ts`（3） | `runner.ts` 非 darwin 直接抛 `UNSUPPORTED_PLATFORM`（失败即关闭），构建检查直接调 `/usr/bin/sandbox-exec` |
| 素材原生组件 | `apps/local-host/src/material-native.ts`、`apps/local-host/native/materials/build.mjs`（2；Swift 源码 `JellyMaterial.swift` 另算） | 非 darwin 报 `native_unavailable` |
| 桌面外壳 | `apps/desktop/adapters/tauri/src/` 的 5 个 `*_macos.rs`；`apps/desktop/tooling/` 的 4 个 `*-macos-*.sh`；`apps/desktop/src-tauri/Cargo.toml`、`tauri.conf.json`（11） | 只有 macOS |

已经带非 macOS 分支、不计入的：密钥库（`packages/storage/src/adapters/file-secret-store.ts` 非 darwin 用安装密钥文件加 AES-GCM）、目录选择器（`directory-picker.ts` 有 darwin、linux、win32 三分支）、浏览器定位（`browser/locate.ts`）、终端 helper 的执行位修正（`horizontal/runtime-host/src/adapters/terminal-pty.ts` 只在 darwin 上做）、侧栏浏览器的快捷键映射（`browser/surface-driver.ts`）。

**目标：4 个适配器。** 常驻服务、沙箱、素材原生组件、桌面外壳各一个按平台选择的适配器；新平台 = 每个接口加一个适配器，其余文件不动。属 C 端计划（W1-21：跨平台桌面、没有 `sandbox-exec` 的沙箱），本阶段不实现。

## 4. 扩展性演练

做法：从 `specs/risk-plugin/spec.md`、`specs/coding-quality-assurance/spec.md`、`PRODUCT.md`、`specs/BACKLOG.md` 和还没实现的目标包（团队与权限、自动化、可观测性）里选六个有代表性的下一步功能，在当前代码上数要改哪些位置，再对照目标。这是纸面推演：F1 到 F3 的各项由第 3 节已核实的位置相加；F4 到 F6 是平台级功能，没有设计稿，按现有代码里已经点名这些假设的文件推出上限，标为「推演」。「交换与同步」没有入选：`docs/platform/STORAGE-AND-EXCHANGE.md` §3 写明它默认按 Team Project 使用独立数据密钥，要等 F4 的身份模型定下来才有意义。

### 4.1 结果

| # | 功能 | 现在 | 目标 | 补扩展点后再推演 | 补什么 |
| --- | --- | --- | --- | --- | --- |
| F1 | 风险记录插件 | 12（带 AI 建议时 13），外加 2 | 1，外加 2 | 1，外加 2 | W3-06、W4-03、W5-02、W5-06 加 X-1 |
| F2 | Coding 质量保证 | 2 | 0 | 0 | X-5（项目库基线由 owner 声明）；端口走服务 |
| F3 | 新的外部服务（自带 OAuth） | 12 | 1 | 1 | W5-11 |
| F4 | 团队与权限（成员、角色、访问决定） | 约 52（推演） | 10 | 10 | X-1、X-2、X-5、X-7、W4-11 |
| F5 | 自动化规则（事件触发动作） | 约 21（推演），外加 2 | 6，外加 2 | 6，外加 2 | X-1、X-6 加 4 项已有切片 |
| F6 | 调用诊断（按调用编号追查、导出诊断包） | 约 12（推演） | 3 | 3 | W3-01、W3-02、W5-13 |

### 4.2 逐个推演

**F1 风险记录插件**（`specs/risk-plugin/spec.md`：记风险、关联 Goal 与会话、动作进共同目录、只走 Plugin Runtime、插件只提供内容）。

- 现在：3.1 的 12 处（外加门禁名单一行、SSOT 一行），包外全是平台登记。关联 Goal、会话、消息、成果走公开对象引用，不 import 其他插件，包外 0 处；到期复查提醒用 `defineDueRemindersAction`，搜索用 `defineSearchEntriesAction`，都在包内。要在 Goal 事件里以「顾虑」引用风险，要改 `plugins/native/goals`，属功能自己的产品集成（Goals 是构建期例外），不计。带「建议处置办法」的 AI 动作会因缺 `services.model` 多一个宿主端口文件，所以是 13。
- 超过目标：登记 8、名单 4；外加的 2 现在和目标里都在，不算超出。
- 补什么：3.1 列出的四片加 X-1。**再推演：1，外加 2**（`scripts/workspace-packages.mjs` 的一条登记；应用依赖要按 X-1 生成才不再手改，否则是 4）。

**F2 Coding 质量保证**（`specs/coding-quality-assurance/spec.md`：自检、交叉评审、对抗评审，设置放在 Coding，结论写回关联 Goal 的事件）。

- 现在：2。一是 `apps/local-host/src/project-database-schema.ts`（评审结果若要建表，`CODING_SCHEMA_SQL` 来自 Coding 包，但基线总版本号 `version: 6` 在宿主文件里，改表要升版本）；二是 `apps/local-host/src/project-plugins.ts` 的 `codingPorts`（评审子运行需要的新端口）。设置页由 Coding 包自己的 `codingSettingsContribution` 提供，结论写回 Goal 走 Goals 的公开动作并在 Manifest `capabilities.consumes` 声明，提示词追加到 `CODING_INSTRUCTIONS`，都是包内。
- 补什么：X-5 让项目库基线由各 owner 包声明的 SQL 汇总、版本由声明推出；端口走 W3-06 的平台服务。**再推演：0。**

**F3 新的外部服务（自带 OAuth，GitHub、Gmail 形）**（来源：BL-060、BL-061）。

- 现在：12（3.3）。其中 token 型服务只要 1 处，所以先问能不能走目录连接器。
- 补什么：W5-11 把连接器设置和 OAuth 移入集成包（决定 #7，2026-10-08：宿主设置的写入留作登记过的管理接口，连接器路由以后搬进各自的官方接入插件）。**再推演：1。**

**F4 团队与权限**（`docs/modules/identity-team-access.md` 目标；BL-071；第一步：项目有多个成员、成员有角色、调用动作前做访问决定）。

- 现在（推演，约 52）：
  - 新 Module 6，表建在项目库再加 1：7；
  - 单人身份常量 `LOCAL_PERSON_ACTOR_ID`（`packages/contracts/src/platform/local-person.ts`）被 33 个非测试源码文件点名（`git grep -l LOCAL_PERSON_ACTOR_ID -- . ':!tests' ':!docs' ':!specs' ':!skills' ':!*.md' ':!*.html'`：`apps/local-host` 25、`apps/mcp` 1、`packages/contracts` 1、`plugins/native` 6），要逐个复核：33；
  - 访问决定的落点：`packages/kernel/src/action-service.ts`、`apps/local-host/src/local-owner-permissions.ts`、`apps/local-host/src/mcp-action-grants.ts`：3；
  - 成员设置页，按 3.6 的宿主自有分区：9。
- 超过目标：身份常量的 33 处和设置分区的 9 处。
- 补什么：X-7「入口调用者解析集中」——Web 入口与宿主各处（`apps/local-host` 的 25 个文件）和 `apps/mcp` 的一个文件直接写死 `LOCAL_PERSON_ACTOR_ID`，用来构造调用上下文，或像 `ArtifactsModule` 的 `homeOwner` 那样指定个人范围成果的主人（CLI 不用这个常量，身份从命令输入的 `actor_id` 读），改成入口只调一个解析函数，其余文件不再点名；X-1 包登记生成（新 Module 6 变 4）；X-2 设置分区登记表（9 变 2）；X-5；W4-11。**再推演：10** = 新 Module 4 + 入口解析 1 + 访问决定 3 + 目录库或项目库表 1 + 设置分区 2 − 1（访问决定与入口解析共用 `local-owner-permissions.ts`）。该功能还会碰到 `server/` 与 `apps/server`（`server/README.md`：公共身份、设备、项目访问与事件传输，另有 `/im` 群聊）。右栏「讨论」页签与 IM 代码按 2026-10-08 决定 #4 是在用、继续迭代的产品功能，不是实验；`apps/server` 独立启动器的去留另定。这几处不在上面的计数里。

**F5 自动化规则**（`docs/modules/automation.md`：Trigger、Rule、Run；Automation 是动作的触发来源，不是另一套执行系统）。

- 现在（推演，约 21，外加 2）：
  - 新 Module 7（含表）；
  - 一个「自动化」插件：12（外加 2）；
  - 触发源：现有可订阅的事件总线只给经 Plugin Runtime 启动的插件（`skills/molis-plugin-dev/host.md`「接到插件事件总线」），Goals、Feed 等构建期插件不发布插件事件，所以要给规则引擎一个读领域事件的端口（读项目库的 `LocalSqliteJournal` 事件流），宿主装配和合同各一处：2。
- 执行规则里的动作：沿用现有受众（`ActionAudience`，`packages/contracts/src/platform/actions.ts`，目前是 `user | agent | workflow | mcp | plugin`），不新增受众（新增要改这个联合并复核所有按受众分支的位置）；无人在场执行的授权语义要在设计稿里单独定。
- 补什么：X-6「领域事件订阅口」（读项目库事件流、按声明订阅）；插件部分靠 3.1 的四片加 X-1；Module 部分靠 3.10 的目标。**再推演：6，外加 2** = Module 4 + 插件 1 + 订阅口 1。

**F6 调用诊断**（合同包里的 `platform/observability` 占位子路径已在 W2-01 删除；`docs/platform/CONTRACTS-AND-OPERATIONS.md` 写明 `packages/observability` 尚未创建；路线 W3-01 的调用编号）。

- 现在（推演，约 12）：内核给每次调用编号（`packages/kernel/src/action-service.ts`、`packages/contracts/src/platform/actions.ts`）2；六类入口各自带出编号：Web（`apps/local-host/src/web-request.ts`）、MCP（`apps/mcp/src/action-tools.ts`）、助理（`apps/local-host/src/assistant/assistant-service.ts`）、Agent 工具（`horizontal/agent-host/src/adapters/prologue-action-gateway.ts`）、CLI（`apps/cli/src/command-dispatch.ts`）、调度（`apps/local-host/src/schedule-task-runner.ts`）6；调用记录 `apps/local-host/src/action-call-log.ts` 1；诊断界面 `apps/local-host/src/web-capabilities.ts`、`apps/workbench/src/capabilities.ts`、`apps/workbench/src/settings-agent-diagnostics.ts` 3。宿主里还有 60 处 `console.*` 在 10 个文件，没有统一日志器。
- 补什么：W3-01（编号贯通）、W3-02（一个错误模型）、W5-13（结构化日志）。这些是一次性铺设，不是每个功能都付的成本。界面形态按用户 2026-10-08 的决定 #5（`specs/repository-anti-corruption/spec.md` §1「调用编号是否上界面」，PR #312）：错误详情里显示可复制的短编号，「设置 › 诊断」按编号列出最近的调用。**再推演：3**（面板、导出路由、登记一项）。

### 4.3 补充的扩展点（不在 §10 的 87 片内，待用户并入路线时定）

| 编号 | 扩展点 | 解决什么 | 对应推演 |
| --- | --- | --- | --- |
| X-1 | 应用的 `package.json` 依赖和根包依赖由 `scripts/workspace-packages.mjs` 生成并带一致性检查；新建包只登记一处。路线图普查（`roadmap-2026-10-07.md` 第 607 行）已列入声明式注册要生成的东西，W5-02 的切片描述没有写，需要补进去 | 内置插件的包登记从 4 处降到 1 处，Module、服务从 3 处降到 1 处 | F1、F4、F5、3.1、3.10、3.11 |
| X-2 | 宿主自有设置分区登记表 | 3.6 的 9 处降到 2 处 | F4 |
| X-3 | 记忆作用域登记（并入 W4-08 的边界规则） | 3.9 的 10 处降到 3 处 | — |
| X-4 | 外部 Runtime 描述表 | 3.12 的 6–15 处降到 2 处 | — |
| X-5 | 项目库基线由各 owner 包声明的 SQL 汇总，版本由声明推出 | `project-database-schema.ts` 不再逐个 import；Module 和插件加表不碰宿主 | F2、F4 |
| X-6 | 领域事件订阅口（项目库事件流，按声明订阅） | 构建期插件发的事件也能触发规则 | F5 |
| X-7 | 入口调用者解析集中：Web、MCP 入口和宿主各处不再直接写 `LOCAL_PERSON_ACTOR_ID`，入口只调一个解析函数（与 W2-07「5 个 MCP 连接工具的身份取自可信会话」同方向，但只覆盖 MCP 的一部分） | F4 的身份常量 33 处降到 1 处 | F4 |

这些都只是建议：X-1 是把路线图普查里已有的一条写进 W5-02，X-2 到 X-7 是新增的，都要用户同意并入路线。没有写进路线之前，上面带 X 的「目标」不算承诺。

## 5. 数字怎么保持往下走

- W1-05 的门禁要「按插件统计包外点名次数并只许减少」，口径就是第 1 节的第一条命令，可以直接放进去。
- 每个方向的「现在」是基线快照，不是门禁。迁移或登记表落地时，在同一个 PR 里更新这里对应行的「现在」，目标不变。
- 第 4 节的推演在 W6-04 重量一次（路线图 W6-04：重新量 §3 的所有指标）。F1 可以直接用 W4-01 的探针插件夹具核对「再推演：1」。

## 6. 待改的 Skill 与手册（不在本切片内改）

本切片不改 `skills/`（W1-12 的回放工具验证每次 Skill 修改）。核对当前代码后，下列是真实存在的偏差，留给 W6-03 或单独一次 Skill 改动：

1. `skills/molis-plugin-dev/host.md`「必改」第 1–11 步缺少：根 `package.json`、设计系统的三处名单（`MW_PLUGINS`、`PLUGIN_ICON`、`PLUGIN_NAMES`）。第 4 步说内置插件要在 `builtin-plugins.ts` 加目录条目，与 `AGENTS.md`「不再往 `builtin-plugins.ts` 加构建期条目」并存，需要一句话说清后者指的是构建期装配的条目。
2. `host.md`「数据落哪」写本机数据放 `{home}/<id>/<id>.db`，但新的 Runtime 插件今天没有 Home 库服务（见 3.1），应注明在 W3-06 之前只能用项目库键值存储或宿主端口。
3. `skills/molis-plugin-dev/SKILL.md`「选 kind 和家族」：Shelf 的 Manifest 是 `native` 但 `start()` 返回 `app` 贡献，Characters、Coding 一族是 `app`；新内置插件写哪个 kind 没有明说，而授权有两层，要分开写清：
   - **调用者的权限**由 kind 决定：`apps/local-host/src/local-owner-permissions.ts` 只把 `manifest.kind === "native"` 的目录条目的动作权限当作本机所有者的内置权限，其余插件走安装授权（`local-web-actions.ts` 的 `localWebActionContext` 要求运行中安装的 `grants` 覆盖动作的全部权限）。
   - **动作可不可用**与 kind 无关：每个经 Plugin Runtime 安装的提供方，都要求安装的 `grants` 覆盖该动作的全部 `permissions`，否则报 `actions.plugin_permission`（`packages/plugin-runtime/src/action-provider.ts`；内核在发现和每次调用时检查，`packages/kernel/src/index.ts` 的 `requireCapability`）。监督器安装时只授予 Manifest 里 `required: true` 的权限，除非条目传 `grants`（`packages/plugin-runtime/src/supervisor.ts` 的 `#activate`）。所以内置插件的动作用到的每一项权限都要标 `required: true`，或等 W3-06 定下 bundled 的授予规则（[RUNTIME-MIGRATION.md](RUNTIME-MIGRATION.md) 4.2）。Shelf 能用，是因为它的三项权限都是必需且它的 Runtime 动作只用这三项（`plugins/native/shelf/src/manifest.ts`、`runtime-actions.ts`），不是因为它是 `native`。
   需要在选 kind 一节和 host.md 的监督器条目里写清。
4. `tests/builtin-plugin-assembly-gate.test.ts` 开头注释把 `builtin-plugins.ts` 目录条目算作构建期路径的一部分，但 Runtime 装配的 7 个插件同样有目录条目（同一个测试第二项断言要求它们有）。这是测试里的注释，随 W1-05 改。
5. Characters 并进宿主（2026-10-08 已定）合入后，`skills/` 里把 Characters 当 Runtime 插件的说法要同步改：`SKILL.md` 第 51、84、119 行，`host.md` 第 97、101 行，`elements.md` 第 137 行，`examples.md` 第 5 行，`search.md` 第 62 行；`elements.md` 第 52 行把它当作「页面只放在设置里的插件」的例子，也要换。

任务书点名的 `SKILL.md:82` 和 `host.md:24` 已核对，当前不含过时说法：前者是「对外调用」一条（写明 Manifest 没有 MCP 导出块），后者是「英文」一步。`docs/platform/PLUGIN-DEVELOPMENT.md` 第 143 行（「Manifest 不再有 `behaviors`、`function_scenes`、`judgment_subjects` 或 `mcp_exports`」）已按代码核对属实，不需要改。
