# 特殊逻辑平民化：特殊插件收归平台、平台特例收成公开声明（Platform Specials Demotion）

状态：方案已定稿，D1～D8 用户已于 2026-11-22 弹窗拍板（第 7 节末）；尚未改任何业务代码，片 0 可立即开工，其余作为 44B 在 #2239 合入后开工。盘点取自 main `1d38f73928`（2026-11-22），行号以该提交为准；在途的第 47 批 [#2239](https://github.com/molis-ai/molis-work/pull/2239)（创作台归平台）按其 PR 描述计入。

需求维护：Claude（本会话）；实现：待分配。类型：底层与架构（主）、横向能力、产品线（Shelf、Feed、Inbox、Goals、Coding、Alchemist、官方集成）。前身：[插件同等地位收口](../plugin-equal-standing/spec.md)（第 44 批，只收 Goals 与少数插件）；本需求把范围扩到**全仓所有特殊地位与特例接线**。

## 白话说明

**这件事做什么。** 两件事。① 有些「插件」其实一直被平台特殊照顾：常开、拔不掉、宿主替它写接线、桌面壳认得它的名字。按「必须特殊的就是平台、不是插件」的原则，逐个定下它到底是平台部件、普通插件，还是删掉重做。② 平台代码（宿主、外壳、合同、搜索、同步、放置、设置、桌面壳、Agent Host、存储）里凡是写死某个插件名字、业务词或它的动作的地方，一律改成任何插件都能用的公开声明；平台代码里不再出现插件的名字。

**解决什么问题。** 第 44 批把 Goals 的私路清了大半，但盘下来平台里点名插件的代码还有数百处（样例与注释不算；单是共用样式里的 Goals 类名就约 250 处），集中在八团：Shelf 的桌面原生接线（约 3,150 行以 shelf 命名的 Rust）、Alchemist 的宿主手写装配（约 15 处接线）、官方集成的手写注册表与 `github`/`gmail` 分支、Feed／Inbox 词汇进了合同与存储格式、共用样式里约 250 处 `.goal-*` 选择器、外壳里内联的「挂到 Goal」流程与到达页 Goal 进度、Agent Host 里内置的 Coding 场景包与创作台代理、演示数据里 691 行 Goals 逻辑。后果和 44 批之前一样：第三方插件拿不到同样的位置，每加一个插件都可能要改平台，每删一个插件都可能留下死代码。

**做完能看到什么。** 用户：看不出变化（这是底层整理），只有 Alchemist 的去留与 Shelf 的地位按你的拍板变。开发者：平台代码里插件名字归零（一道只许变小的门禁量它）；今天只有 Shelf、Feed、Goals、Coding 才有的位置（桌面热键与拖放、「放到…」、挂接目标、项目简介进度、演示数据、Agent 场景包、来源拉取种类、连接器驱动）都变成 Manifest 里的公开声明，第三方按安装信任同样可用。

**为什么现在做。** 合同还没对外开放：[合同变更流程](../../docs/system/CONTRACT-CHANGES.md) 规定首个外部安装之前不留兼容期，M1 发行（[REL-5](../post-anticorruption-roadmap/reference/batches/rel-5.md)）之后每处改名都要加兼容读取。第 47、48 批（正式插件交付、新插件创建）正在把第三方能用的声明定下来，现在不收，特例会被写进对外合同。

**需要你做什么。** 第 7 节 D1～D8 拍板；第 3 节是保留特殊的例外名单，逐条复核理由。

## 1. 判定法

### 1.1 三类归宿

| 归宿 | 判定 | 形态 | 已有样板 |
| --- | --- | --- | --- |
| **平台部件** | 产品上必须每个项目都有、拔不掉、跨插件打底，或者握着本机与信任边界 | `kind: "system"` 的动作提供方；页面用平台框内页面登记（`HostSurfaceRegistration`，#2239 引入）；不进插件目录、市场、项目插件清单，没有安装记录；旧 id 若在存量授权里出现，就进保留 id 集合 | 成果库（PG-077）、Sessions、创作台（#2239） |
| **普通插件** | 可以添加、移除、停用，移除后平台照常 | 同一套 SDK、Manifest、装配、平台服务与授权；它要的位置全部来自公开声明 | Todo、Pages、Goals（44 批后） |
| **删除或重做** | 现有实现走旁路、且不打算按平台或普通插件维护 | 删接线、保留数据或明确丢弃 | 胶囊、CLI 的 Goals 命令（44 批） |

### 1.2 平台代码的判定

一处平台代码点名插件，按下面的顺序处理，前一条成立就不看后一条：

1. **能删**：死代码、过期注释、已没有消费方的分支（例：`immersive-shell.ts:288-289` 的 `immersive-goal-tools` 没有任何读取）。
2. **是平台事实，只是名字带着插件**：改中性名（例：`attention.inbox` 是平台的「等你」清单）。持久化的名字要升版本、写升级段。
3. **是一个插件的私事，放错了地方**：搬回插件包（例：`modules/shelf` 只被 Shelf 用）。
4. **平台确实要按插件区分行为**：做成 Manifest 声明，平台只读声明（第 5 节的 M1～M17），第三方按安装信任同样可用。

### 1.3 判断标准（逐条可测，见第 8 节）

1. **拔掉测试**：任一普通插件移除后，项目、助理、MCP、设置、桌面壳、同步、备份照常；只少它自己的内容。
2. **平台不认识插件**：`apps/local-host/src`、`apps/workbench/src`、`apps/desktop`、`apps/mcp`、`apps/cli`、`apps/server`、`packages/*`（除生成的登记表）、`horizontal/*`、`modules/*` 里不出现任何插件 id、插件包 import、以插件命名的文件、以插件业务词为分支的代码与 CSS 选择器。例外只有第 3 节名单，门禁逐条核对。
3. **同一条路**：今天某插件独有的位置，要么删，要么做成任何插件都能声明的能力。
4. **受信标记不按出身**：登记里「只有宿主能说」的标记（`personal`、`companions`、`runtime.dual_instance`）要么改由 Manifest 声明、按安装信任放行，要么写进第 3 节例外。

## 2. 盘点一：具有特殊地位的插件与部件

| # | 对象 | 现在 | 独有的特权 | 结论（推荐） |
| --- | --- | --- | --- | --- |
| P1 | **Shelf**（`plugins/native/shelf` + `modules/shelf`） | 普通 Runtime 装配（项目一份 + Home 一份，`dual_instance`），但 `always_on: true`（`manifest.ts:29`）；全仓唯一的常开插件 | ① 常开：`always-on-plugins.ts:32-62` 只读宿主构建的登记，第三方声明了也不生效，Home 级包声明直接拒（`home-package-admission.ts:15`）；② 桌面壳认得它：`apps/desktop/src/shell.ts:26-130` 写死 `openPlugin("shelf")` 与 `/api/plugins/io.molis.work.shelf/…`，Tauri 约 3,150 行 `shelf_*`（拖放、热键、轮盘、剪贴板监听、`shelf_http.rs:12`），10 个 `shelf_*` IPC 命令与 `permissions/shelf.toml`；③ 宿主替它开路：`mainline-http.ts:5,21`（`/api/mainline/shelve`）、`computer/computer-http.ts:21-137`（`/records/:id/shelf`）、`web-storage-resources.ts:21-58`、`demo-plugin-seed.ts:5`（直接 import 插件包）、`platform-upgrade-stores.ts:174` 与 `home-upgrade-stores.ts:18`（`{kind:"shelf"}` 升级块）；④ 合同：`dom-events.ts:217-234` 四个 `molis-shelf-*` 事件、`presentation-declaration.ts:32` 的 `"shelf"` 槽类型；⑤ 边界例外：`packages/test-kit/src/boundaries.ts:116-118`（插件 → module 的唯一一条）；⑥ 共用样式 `.shelf-*` 约 16 处 | **D1**：推荐保留为第 3 节唯一的插件形态例外，**只留常开一项**，②～⑥ 全部改声明或搬回包里（第 4.1 节） |
| P2 | **成果库**（`modules/artifacts`，提供方 `io.molis.work.artifacts`，`kind:"system"`） | 已是平台（PG-077，#1633）；id 已保留（`host-plugin-ids.ts:8`） | 无特权问题；残留是插件形状的名字与对 Goals 的点名 | 平台部件，清残留：`ARTIFACTS_PLUGIN_ID`、`ARTIFACTS_PROJECT_PLUGIN_ID` 改提供方用语（存量记录里的值不变）；`modules/sync-replication/src/index.ts:358-367` 按 id 排同步层改用已有的 `dependencies` 声明；`goals.embeds`（`artifact-goal-context.ts`、`artifact-actions.ts:99,254`）改 `links.embeds { plugin_id?, object_id }`；`SEARCHABLE_FIELDS`（`artifact-actions.ts:21,67-69`，含 Coding、PPT、Feed、Characters 的字段）改由成果类型声明可搜字段 |
| P3 | **创作台**（`plugins/native/plugin-builder` → #2239 搬到 `horizontal/plugin-studio`） | #2239 在途：改成平台框内页面，移出插件目录与构建期例外名单，id `io.molis.work.plugin-builder` 保留 | #2239 之后仍剩：`horizontal/agent-host/src/adapters/plugin-builder.ts`（322 行，`createPluginBuilderAgent` 从 agent-host 的 index 导出）；宿主 `plugin-builder/` 27 个文件里一半是已装包的通用设施（`exposed-actions`、`installed`、`network`、`secrets`、`publisher-identity`、`build-*`）；存储键 `plugin-builder:agent-studio:*`（`installed-plugin-host.ts:46`、`installed-plugin-lifecycle.ts:25`）；`deferred-plugin-client.ts:39`、`workbench-renderer.ts:30` 的 `bundle: "plugin-builder"` | 平台部件（#2239 已定）。等 #2239 合入后：创作代理搬进 `horizontal/plugin-studio`；宿主目录按职责拆成 `installed-plugin-*`（通用）与 studio（平台部件）；已装包的键与 bundle 改中性名 |
| P4 | **Alchemist**（`plugins/native/alchemist`） | 构建期手写装配的最后一个例外（`tests/builtin-plugin-assembly-gate.test.ts:48`）；`personal:true`，**今天每个项目都打开、MCP 也能调** | 宿主 6 个以它命名的文件（`alchemist-service-host.ts`、`alchemist-native-plugin-http.ts`、`alchemist-prologue.ts`、`alchemist-search.ts`、`alchemist-pulse-github.ts`、`alchemist-paths.ts`）约 530 行；`project-host.ts:300-301` 的 `registerProvider`；`web-request.ts:18,303-315` 的直连路由与按插件包给的权限；`home-stores.ts:17,90`、`home-store-snapshot.ts:65-72`、`home-restore-inspection.ts:32-35`、`project-deleted-owners.ts:141-142`、`builtin-instructions.ts:14`；合同 `packages/contracts/src/modules/alchemist.ts`；存储 `evidence-content.ts:256,268-275` 写死它的目录做密钥共享；外壳 `account-cache.ts:4,81` 的存储键前缀 | **D2**：推荐现在删宿主接线与入口，数据原地保留不读，第 82 批按场景重做时决定是否导入 |
| P5 | **Characters**（`modules/characters`） | 已是 Module，但动作提供方仍是 `kind:"plugin"`、`plugin_id: io.molis.work.characters`（`characters-host.ts:42`）；路由 `/api/plugins/io.molis.work.characters` | **疑似安全缺口**：这个 id 不在保留 id 集合（`host-plugin-ids.ts:8-11` 只有内置插件、成果库与 Files 墓碑），按 `install-identity.ts:38-40` 的规则，非宿主签名的包可以用这个 id 安装；会不会顶替提供方或借走 MCP 授权要靠拒绝测试确认 | 平台部件：先补保留 id 与拒绝测试（P0，不等拍板）；提供方改 `kind:"system"`；路由改平台路径；`CHARACTER_PLUGIN_ID` 等常量改提供方用语 |
| P6 | **官方集成**（`plugins/official-integrations/{catalog,github,gmail,rss,youtube}`，`kind:"integration"`） | 不走插件登记，走宿主自己的进程内注册表（`builtin-integrations.ts:34-46` 手写清单，`integration-registry.ts` 用 `HOST_BUILD_TRUST`）；签名的沙箱集成包挂同一个注册表（BL-530） | 宿主按服务名分支：`connector-access.ts:113-125,164`、`connector-account-actions.ts:89-97`、`connector-candidate-check.ts:28,74`、`connector-record-actions.ts:16`、`connector-request-credentials.ts:11-60`、`connector-web-search.ts:116-185`、`artifact-document-import.ts:110`、`research-repository-read.ts:6`；三个以集成命名的文件 `github-connector.ts`、`gmail-connector.ts`、`catalog-connector.ts`；Gmail 的 OAuth 回调挂在 `/api/feed/connectors/…`（`connector-oauth-callback-paths.ts:18`）；上手服务内置 `gmail` 来源种类（`context-onboarding-sources.ts:135-205` 等 6 个文件，外壳 `context-onboarding.ts` 同样） | **D3**：推荐收成平台的「连接器驱动」：清单由登记生成，驱动声明自己的能力（识别账号、读记录、候选核对、令牌解析、网页搜索、文档导入、仓库读取、来源种类、上手来源、OAuth 回调路径），宿主按能力分派，不认服务名 |
| P7 | **内容包**（`plugins/content/{design-accessibility,planning-methods}`） | 只有声明、没有代码；`planning-methods` 以 `system.default_state:"auto"` 随系统自带 | 无（由 `pack-content.json` 驱动的通用模式） | 不改 |
| P8 | **Sessions**（`horizontal/sessions`） | 提供方 `system.sessions`，`plugin-registry.ts:37` 拒绝占用其项目键 | 无 | 不改（`web-assets.ts:151-154`、`web-request.ts:291` 的固定资源与路由随第 5 节 M15「平台框内页面」统一登记） |
| P9 | **Schedule** | 普通 Runtime 插件；全仓唯一 `default_enabled:true`（`registration.ts:10`） | 新项目默认装；调度引擎本身是平台（`horizontal/scheduler`） | 普通插件；`default_enabled` 是产品初始选择，按 D4 一并定 |
| P10 | **Git／Diff／Text Stats**（Coding 家族） | 普通 Runtime 插件；`git` 命令由宿主的工作区 Git 服务跑（`workspace-git*.ts` 约 1,400 行，`audiences:["plugin"]`） | SDK 里有 `git-porcelain.ts`、`diff-view.ts`、`git.*` 错误码；Agent Host 审查种类写死 `git-index`、`git-integration`（`agent-host-reviews.ts:7,15`，Manifest 校验只认这四种） | **D6 已定 B**：工作区 Git 代码搬进 Git 插件，Diff、Coding 经 Git 插件的公开动作读取 |

### 2.1 按登记出身给的受信标记

这些标记在 `packages/contracts/src/platform/plugin-registration.ts:198-235` 写明「只有宿主能说，Manifest 和已装包都说不了」：

| 标记 | 现在谁有 | 效果 | 结论（推荐） |
| --- | --- | --- | --- |
| `personal: true` | 14 个内置插件（Todo、Workflows、Pages、PPT、Jelly、Shelf、灵光、创作台、Alchemist、Images、Cognia、Form、Dataset、Issues） | 每个项目都开、只能隐藏不能移除，不出现在「项目可添加」里；与常开同形，只是更宽 | **D4**：推荐改为 Manifest 声明「个人插件」，按安装信任放行（装进 Home 的签名包可声明），移除规则与普通插件一致 |
| `companions` | Feed（带上 Inbox） | 开 Feed 时连带打开 Inbox | 改为 Manifest 的依赖声明，任何插件可用 |
| `runtime.dual_instance`（登记层） | Feed、Shelf、Work Brief | 内置走登记，第三方走 Manifest 的同名字段（44 批已开放给固定公钥的沙箱包，`plugin-manifest.ts:112-117`） | 合成一条：只认 Manifest，登记层这个字段删掉 |
| 只给「宿主启动清单」的服务 | `image_generation`、`model_configuration`、`local_tools`（`plugin-declared-services.ts:5-45`、`trust-rules.ts:~118`） | 已装包声明前两项直接失败 | `image_generation`、`model_configuration` 开放给固定公钥的签名包（经平台服务，有界）；`local_tools` 按安全边界继续只给宿主信任，但它按**信任级别**区分、不按插件名，不算例外 |
| `default_enabled` | Schedule | 新项目初始装上，之后可移除 | 保留为内置的产品初始选择（只影响新项目初值，不给运行时特权），写进第 3 节 |

## 3. 保留特殊的例外名单（请逐条复核）

门禁按这张表放行，表外任何点名都算违规。

| # | 例外 | 只保留什么 | 理由 | 不保留什么 |
| --- | --- | --- | --- | --- |
| E1 | **Shelf 常开**（D1 选保留时） | `always_on`：每个项目都开、右栏第一格、不能移除或停用；常开同意由宿主代为记录 | ① 右栏常驻的中转架是产品定过的形态（GLOSSARY「常开插件」、S-34）；② 它的内容（中转条目）是用户私有数据，有自己的库与升级段，放在插件包里隔离比并进平台干净；③ 改成平台部件要动 MCP 授权、同步集合、桌面路由与 Home 半实例，代价大、用户看不出收益 | 桌面原生接线、`molis-shelf-*` 事件、`"shelf"` 槽类型、「放到 Shelf」路由、演示数据 import、升级块、`modules/shelf` 位置、共用样式（都改成声明或搬回包里） |
| E2 | **保留 id 集合** | `io.molis.work.artifacts`、`io.molis.work.files`（墓碑）、`io.molis.work.plugin-builder`（#2239）、`io.molis.work.characters`（补）| 存量授权、工作流引用与成果版本记录里有这些提供方 id；保留只防冒名，不给任何能力 | 不给这些 id 任何运行时分支 |
| E3 | **内置的新项目初值** | `default_enabled`（Schedule） | 只是新项目的初始选择，存成普通成员关系，随时可移除 | 不给运行时特权 |
| E4 | **随系统自带的内容包** | `planning-methods` 的 `system.default_state:"auto"` | 规划方法是平台自带的技能（用户 2026-11-14 定），不装、不卸 | — |
| E5 | **本机工具只给宿主信任** | `local_tools` 按信任级别拒绝非宿主包 | 本机抽字、OCR、剪贴板是安全边界（`docs/system/SECURITY-INVARIANTS.md`），按信任区分，不按插件名 | 不按插件 id 放行 |

D1 若选「Shelf 收归平台」，E1 改为「平台部件 Shelf」，常开机制（`always-on-plugins.ts`、`always-on-rules.ts`、同意种类 `always_on`、外壳 5 处读取）整个删掉。

## 4. 盘点二：平台代码里的特例分支（按层）

样例与组件板（约 25 个文件）、只提到插件名的注释另列在 4.9 节，不计入正文数字。

### 4.1 Shelf 的私路

| 位置 | 现状 | 改法（机制） |
| --- | --- | --- |
| `apps/desktop/src/shell.ts:26-130`；`adapters/tauri/src/{shelf_http,shelf_drag_macos,shelf_hotkeys,shelf_hotkeys_macos,shelf_clipboard_macos,clipboard_watch_macos,drop_wheel,drop_wheel_macos,page_files}.rs`；`main.rs` 10 个 `shelf_*` 命令；`permissions/shelf.toml`、`runtime-capabilities/default.json:16` | 桌面壳写死 Shelf 的 id、路由、偏好键与轮盘花瓣（`drop_wheel.rs:56-77` 的 `WheelAction::{Shelf,Send,Summarize,…}` 写死 Shelf 的配方 id） | M5 原生伴侣声明：插件在 Manifest 声明「全局热键、拖放接收、剪贴板接收、设备偏好、轮盘动作」，桌面壳从登记读插件 id 与路由；命令改 `companion_*`，插件 id 作参数；权限集改中性名 |
| `mainline-http.ts:5,21`；`computer/computer-http.ts:21-137`、`computer-surfaces.ts:72,88`；`web-storage-resources.ts:21-58`；外壳 `browser/work-event-card.ts:61-72`、`work-line-parts.ts:462-468`、`side-panel-computer.ts:204-222`；`browser/plugin-frame/file-picker.ts:30`（`shelf_find_files`） | 「放到 Shelf」在宿主与外壳各有专用路由和按钮 | M4「可接收」声明：放置服务已有 `receive`；Shelf 声明自己接收工作事件、电脑记录、存储资源，外壳只画通用的「放到…」，候选取声明了接收的插件 |
| `packages/contracts/src/platform/dom-events.ts:146-149,217-234`；`presentation-declaration.ts:32` | 四个 `molis-shelf-*` 事件、`"shelf"` 槽类型 | M6 插件作用域事件：`plugin:<id>/<event>` 由插件声明；槽类型改 `always-on-panel` 或由插件声明 |
| `modules/shelf/src/**` | 只被 Shelf 用（另加宿主两处 import），是插件私有实现放进了平台目录 | 搬进 `plugins/native/shelf`，删 `test-kit/boundaries.ts:116-118` 的例外 |
| `demo-plugin-seed.ts:5,42-54`；`web-catalog-routes.ts:143`；`web-project-settings.ts:108` | 宿主直接 import Shelf 包调样例动作 | M1 演示数据声明 |
| `platform-upgrade-stores.ts:11,174`；`home-upgrade-stores.ts:18`；`web-owner-unavailable.ts:27,35` | Shelf 自己的升级块种类 | 用通用的 `{kind:"plugin", plugin_id}` 升级块，库在登记的 `databases.home` |

### 4.2 宿主（`apps/local-host/src`）

| 簇 | 位置 | 改法 |
| --- | --- | --- |
| Alchemist | 见 P4 | D2 |
| 创作台 | 见 P3 | 等 #2239 |
| 演示数据 | `demo-seed.ts`（691 行全是 Goals：`goals.*` 动作、`DEMO_GOALS`、`seedDemoGoals`）、`project-catalog.ts:68,253`、`index.ts:130`、`web-server.ts:34`、`demo-deliverable.ts:18`；`demo-plugin-seed.ts:19-28` 的 `DEMO_WITHHELD_PLUGIN_IDS`（git、diff、text-stats、work-brief） | M1：Manifest 已有 `demo_seed` 通路（`plugin-demo-seed.ts`），Goals 的样例搬回 Goals 包；「演示项目不开」改 Manifest 标记 |
| 官方集成 | 见 P6 | D3 |
| 来源拉取（为 Feed 写死） | `source-vocabulary.ts:3-30`、`source-pull-intent.ts:4-88`、`source-pull-runtime.ts:1-80`（直接 import rss、youtube 集成包）、`search-query-routes.ts:5-6`（`anysearch` 写死）、`plugin-source-pull-service.ts:4,27`（`PLUGIN_SOURCE_PULL_FEED_PERMISSION`） | M10 来源种类声明：集成声明自己支持的拉取种类与词表，宿主不 import 集成包；权限改中性名 |
| 权限名单 | `home-actions.ts:70` 的 `HOME_ACTION_PERMISSIONS` 含 `feed:read`、`inbox:read`；`web-project-platform-routes.ts:313` 加 `inbox:write` | M15：首页的读取范围按已装插件声明的呈现与「等你」来源派生，不写插件权限名 |
| 存储与命名空间 | `search-intelligence-client.ts:36`（`feed-intent-v1`）、`search-evidence-runtime.ts:119`、`project-replication-content.ts:7`（`molis-work-feed/sha256/…`）、`connector-execution-mode.ts:3`（`MOLIS_WORK_FEED_CONNECTOR_FIXTURE`） | D5 |
| Goals 形状的数据 | `project-arrival-http.ts:7,83-165`（`BriefGoal`）、`web-project-pages.ts:101`（`goalEmbeds`）、`project-replication-errors.ts:18` 文案 | M2 项目简介贡献；P2 的 `links.embeds`；中性文案 |
| 其他点名 | `agent-definitions/agent-definitions.ts:40`（Feed 提示词键搬家表）、`platform-connection-services.ts:7,15,33`（`model-api.jelly`、`Coding Agent`）、`material-native.ts:43,49`（`jelly-material`、`jelly-whisper` 二进制名）、`assistant/assistant-review-words.ts:26,69`、`sandbox-package.ts:228` | 改中性名；搬家表交 Feed 包或删 |
| 平台自己的页面 | `web-assets.ts:151-154`、`web-request.ts:268,291`（成果库、Characters、Sessions 固定资源与路由）；`platform-sync-catalog.ts:12-25` | M15：用 #2239 的平台框内页面登记统一，不逐个写路由 |

### 4.3 外壳与共用界面（`apps/workbench/src`、`packages/design-system/src`）

| 簇 | 位置 | 改法 |
| --- | --- | --- |
| 共用样式里的 Goals 名字（约 250 处） | `ds/styles/directory-ledger.ts`（约 50，`.desktop-goal-directory`、`.navigator-goal-*`）、`wb/styles/base.ts`（28）、`ds/styles/interaction-texture.ts`（27，含 `--goal-status-tone`）、`ds/styles/foundation.ts`（19）、`wb/styles/immersive-directory.ts`（18）、`wb/styles/plugin-stage.ts`（16）、`ds/styles/craft-finish-pages.ts`（10）、`placement.ts`、`immersive-navigation.ts`、`micro-interactions.ts`、`navigation-ownership.ts`、`workspace-panes.ts`、`linear-density.ts`、`focus-sections.ts` | M7：至少 6 个别的插件已在用 `.goal-status`、`.goal-collection-fold`，所以是**改名为 `mw-status`、`mw-collection-fold`、`mw-directory-ledger`、`navigator-entry-*`**，不是搬走；只属于 Goals 的（`.goal-trash-dialog`、画布、看板、图节点）搬回 Goals 样式表。取代并扩大 [BL-b44-shared-styles-plugin-names](../backlog/BL-b44-shared-styles-plugin-names.md)（它记的「约 40 处」偏少） |
| 其他插件的样式与选择器 | `.inbox-*`（`detail-reading.ts` 22 处，这张表还登记成框样式特性）、`.shelf-*`（约 16）、`.coding-*`/`.git-*`（`coding-companions.ts` 整份、`ds/primitives/coding-basics.ts`、`recovery-parts.ts:5-44`）、`.form-*`（`coss-controls.ts`、`disclosure.ts`、`linear-density.ts`）；属性选择器 `[data-feed-stage-shell]`、`[data-work-surface="jelly"]`、`[data-feed-search]`、`[data-feed-source-menu]`、`[data-inbox-row]`、`[data-schedule-stage-workspace]`、`[data-goal-canvas-shell]`、7 个 `[data-*-delete]` 与 `[data-lingguang-save-status]` | M7：通用属性 `data-own-layout`、`data-own-input`、`data-destructive`、`data-save-status`、`data-stage-workspace`、`data-list-row`、`data-menu-close-on-choose`；`detail-reading` 改 `mw-detail-reading__*`；框样式特性 `coding-basics`、`coding-companions` 改中性 id（合同 `plugin-registration.ts:29-30` 同改） |
| 外壳内联的插件逻辑 | `scripts/client/placement.ts:322-723`（约 83 行「挂到 Goal／给 Goal 加输入」，`open.surface === "goals"` 在 493）；`artifacts/goal-input-client.ts` 整份与 `artifacts/browser-ui.ts`、`artifact-ui.ts`；`arrival/project-brief.ts`（41 行）、`arrival/chooser-client.ts:112-139`、`ds/primitives/arrival.ts:40-46`（`renderGoalTrack`）；`ds/styles/craft-finish.ts:38-280` 的 `LANDING`/`FOCAL` 表（`[data-goal-id]`、`[data-feed-entry-id]`、`[data-inbox-entry-id]`） | M3 挂接目标声明（外壳只画通用目标选择器）；M2 项目简介贡献（插件给「进度 n/m、当前标题、等你几项」，外壳画通用进度条）；落点与庆祝改通用属性 `data-landing-id`、`data-celebrate-status` |
| 按插件名推断 | `browser/plugin-frame/frame-assets.ts:26-28`（`["feed","inbox","artifact"]` 与 `feedItemId`/`inboxEntryId`）；`scripts/client/assistant-materials.ts:40`（`TAB_KINDS`）；`assistant-side-kit.ts:21-22`（`KIND_GLYPH` 正则猜图标）；`immersive-navigation.ts:44`（`sources: "Feed"`）、`:105`；`home-offers.ts:30`（`feed_item`）；`judgment-rules/client*.ts`（`inbox.next`、`feed.capture`）；`browser/knowledge/common.ts:57`（`/coding/`）；`browser/characters/import-client.ts:297-299`（`[data-coding-workbench]`）；`agent-review-surface.ts:20-305`（`git-*` 审查种类与工具标题） | M8 对象种类与图标取自声明；M9 Functions 场景声明；M13 审查种类由主人登记渲染 |
| 设置 | `settings-connectors.ts:75-80`（`image-api`、`feed_source`）、`settings-view.ts:97`；`settings-connector-guide.ts:60-185`、`connector-icons.ts`、`browser/account-management.ts:15`（github、gmail 分支）；`settings-runtimes.ts:61`、`settings-appearance.ts:97`、`settings-assistant.ts:11`、`settings-memory-preferences.ts:20`（文案点名 Goals、Coding、Jelly） | 连接器用途与展示来自驱动声明（D3）；文案中性 |
| 外壳命名与死代码 | `immersive-shell.ts:288-289`（没人读的 `immersive-goal-tools` 与写死的「Goals」标题）；`shell-page-renderer.ts:150,238,243`（`createWorkbenchGoalsPageRenderer`、`#goal-tree-pane`）；`terminal/pane.ts:52`、`client-subject-events.ts:32-34`（`goal-status` 类）；`browser/account-cache.ts:4,81`（Alchemist 存储键） | 删或改中性名 |

### 4.4 合同与 SDK

| 位置 | 现状 | 改法 |
| --- | --- | --- |
| `contracts/src/modules/functions.ts:20-36,274-317` | Feed、Inbox 的场景 id、选项 id、默认选项逻辑与「判断规则可写的对象」（`feed_item`、`inbox_entry`）在共用合同 | M9：场景与默认选项由插件 Manifest 声明，合同只有通用结构；可写对象从插件声明的对象种类派生 |
| `contracts/src/modules/attention-resumption.ts:87-131`、`platform/plugin-attention.ts:29,77-79`；SDK `attention-declarations.ts:12-49` | 平台「等你」清单的接口叫 `listInbox`、Manifest 键 `attention.inbox`、事件 `inbox_entry.*` | 改中性名（`attention.list` 一类）；事件名是持久化值，见 D5 |
| `contracts/src/services/connector-host.ts:148,158` | `CONNECTOR_USES` 含 `feed_source`，目录项 `feed_available` | 改 `source_pull`、`source_available` |
| `contracts/src/platform/plugin-source-pull.ts:4-191` | 拉取种类写死 `rss`、`custom_rss`、`youtube_channel`，词表有 `youtube_*`；权限 `sources:pull_feed`；`sources:read_repository` 是 Alchemist 的用例 | M10：种类与词表由集成声明；通用 `public_feed`、`web_query`、`repository_read` |
| `contracts/src/modules/alchemist.ts` | 整份 Alchemist 合同 | 随 D2 删 |
| `contracts/src/services/agent-host-reviews.ts:7,15` | 审查种类封闭名单 `git-*`，Manifest 校验只认它们 | D6 |
| `contracts/src/platform/dom-events.ts:150-164,561` | 登记表里列着 Coding、Pages 的文件，Skill 选择事件的 `consumer` 写 `'coding'` | M6；`consumer` 改场景字符串 |
| `contracts/src/platform/action-field-presentation.ts:10` | 字段标签表 `goal_id: "目标"` | 标签由声明字段的插件给 |
| `contracts/src/services/agent-inputs.ts:173` | `"todo"` 目标种类（实为本轮待办清单，不是 Todo 插件） | 改 `plan_item`，去歧义 |
| SDK `ui/coding-basics.ts`、`ui/recovery-parts.ts:209-228`、`browser.ts:279-280`、`diff-view.ts:254`（`data-coding-line`）、`work-terminal.ts:74-75`（`UNTRUSTED_FEED_ITEM_DATA`）、错误示例「如 coding」「如 goal」 | 公开 SDK 里带插件名的部件与标记 | 改中性名（`renderRoundMaterials`、`data-diff-line`、只留 `UNTRUSTED_SOURCE_DATA`）；SDK 是共享核心，按 AGENTS 跑全量 |

### 4.5 横向服务与 Module

| 位置 | 现状 | 改法 |
| --- | --- | --- |
| `horizontal/agent-host/src/code-intelligence/coding-tools.ts:9-38`、`index.ts:128-289`、`tool-catalog.ts:63`、`adapters/prologue-node-kit.ts`、`prologue-round-gateway.ts:3,106` | 共用网关里内置 `OFFICIAL_CODING_PACK`、`coding.find-symbol` | M13 场景包登记：Coding 在 Manifest 贡献自己的工具包与工具 |
| `agent-host/src/adapters/prologue-taskboard.ts:30`、`prologue-node-port.ts:29,83`、`prologue-run.ts:179-749` | `codingExecutionRules`、看板读写自动放行、`coding-board-digest` 等资源名与看板提示词 | 规则与提示由声明看板的场景给；资源名改 `round-context-*` |
| `agent-host/src/adapters/plugin-builder.ts` | 创作代理在 agent-host 里 | P3 |
| `agent-host/src/reviews.ts:54-63`、`review-decisions.ts:72`、`adapters/prologue-git.ts:19,59`、`recovery-actions.ts:119` | `git-*` 审查种类与工具名正则接在通用审查队列 | D6 |
| `agent-host` 文案（`prologue-session-index.ts:93-114`、`prologue-surfaces.ts:285,292`、`prologue-action-gateway.ts:303`） | 「Coding 会话归属索引」「命令走 Coding」「如 Pages 新建」 | 中性文案（模型看到的提示词改动按 AGENTS 走提示词版本） |
| `horizontal/observation/src/classification.ts:14,37` | `FLOW_SERVICES` 含 `workflows`、`schedule` 两个插件 id，`owner_kind` 不核，插件起这两个名字就被当成流程 | 只留 `service:scheduler`、`service:connections`，插件靠已有的 `flowOwners` 声明 |
| `observation/src/cleanup.ts:206-208`、`contracts/services/observation.ts:463-465,704-706` | `preserved: { pages_versions, saved_briefs }` | 改 `plugin_objects`、`artifact_versions` |
| `horizontal/placement/src/index.ts:691-692` | `source.kind === "form"` 才写保留地址 `molis-source://form/…` | M17：接收方声明「主人核过的来源绑定」 |
| `horizontal/memory/src/shapes.ts:93` | 专门拒绝已退役的 `goal_ids` | 删（通用形状校验已拒未知键） |
| `modules/sync-replication/src/index.ts:351-367` | 按 `io.molis.work.artifacts` 排同步层 | 用登记已有的 `dependencies` |
| `modules/artifacts` | 见 P2 | — |
| `modules/attention-resumption/src/index.ts:56-365`、`replication.ts:11,27` | 表 `inbox_entries`、事件 `inbox_entry.*`、报错 `feed_contract_invalid_inbox_transition:` | 中性名；表名与事件是持久化值，见 D5 |
| `modules/judgment-rules/src/record-rules.ts:94` | 「Score 不能绑 Inbox、首页、Feed」 | 中性文案 |

已核干净：`horizontal/search`、`surfaces`、`mainline`、`connector-host`、`runtime-host`、`blueprints`、`knowledge`、`scheduler`、`sessions`、`project-approvals`、`kit`、`appearance`、`account`；记忆场景；`modules/{acceptance,characters,context-ledger,private-work-context,projects}`；`apps/cli`、`apps/sync-worker`、`plugin-sandbox`（只剩两句说明文字）。

### 4.6 存储（持久化格式，见 D5）

| 位置 | 名字 |
| --- | --- |
| `packages/storage/src/schema.ts:3`、`adapters/search-storage.ts:13-248` | 表 `feed_runtime_blobs`；前缀 `molis-work-feed-aead-v1`、`molis-work-feed-blob-cursor-v1`、`molis-work-feed-cas-v1.` |
| `adapters/evidence-content.ts:24-215`、`evidence-snapshot.ts:28,35`；`plugin-runtime/src/source-pull-service.ts:22` | 密钥引用 `system:feed:evidence-content-key:v1`、引用格式 `molis-work-feed/sha256/` |
| `adapters/file-secret-store.ts:71` | 钥匙串服务名 `com.molis.work.feed.secretstore` |
| `adapters/local-security-paths.ts:66` | 搬家表 `HOME_LAYOUT_MOVES = [{ from: "feed", to: "security" }]`（真实 Home 已于 11-07 干净重建） |
| `project-replica-errors.ts:20` | 文案「项目 Goal 记录…」（只是文案，直接改） |

### 4.7 MCP、服务端

- `apps/mcp/src/goal-presentation.ts`：内容只剩 `mcpWebUrl`，文件名与 5 处 import 改 `web-url.ts`。
- `apps/server/src/main.ts:47` 文案「project/goal/artifact references」；`server/src/continuity/actions.ts:7` 写死成果库提供方 id（随 P2 改常量引用）。

### 4.8 门禁与文档

- `scripts/gates/platform-plugin-imports.mjs` 的白名单（Alchemist 5 个文件、Shelf 演示数据、创作台 8 个文件，#2239 后剩 Alchemist 与 Shelf）：清零。
- `tests/builtin-plugin-assembly-gate.test.ts` 的 `APPROVED_BUILD_TIME_EXCEPTIONS` 与 `NATIVE_PLUGIN_HTTP_FILES`：D2 后清空。
- 过期说明：`scripts/gates/assembly.mjs` 头注释说 Shelf 是 hybrid（已不是）；[插件同等地位收口](../plugin-equal-standing/spec.md) 第 119 行说双实例只给宿主装配（44 批已开放）；`plugin-registration.ts:231` 只点名 Shelf；`modules/artifacts/src/artifact-provider.ts:1` 说「直到外壳拿掉」（已拿掉）。

### 4.9 样例、组件板与注释（低优先）

组件板与样例数据用真实插件名（`wb/primitive-catalog.ts:47-48` 写死 17 个 id 的 `SAMPLE_PROJECT_PLUGINS`；`navigation-specimens.ts`、`work-line-specimens.ts`、`assistant-board-*`、`service-connection-specimens.ts`、`ds/primitives/catalog-*.ts`、`ds/palette.ts:39-51` 的色相角色名等约 25 个文件）；另有约 30 处注释只提到插件名。D8 定。

## 5. 方案：平台给出的通用声明（M1～M17）

每项一句话：谁声明、平台读什么、替掉哪些特例。都写进 Manifest 合同（`packages/contracts/src/platform/plugin-manifest.ts` 一类），SDK 给校验，第三方按安装信任可用；能复用现有声明的不新造。

| # | 声明 | 平台怎么用 | 替掉 |
| --- | --- | --- | --- |
| M1 | `demo_seed`（已有）＋「演示项目不开」标记 | 演示项目按已装插件的声明播种 | `demo-seed.ts` 691 行、Shelf 样例 import、`DEMO_WITHHELD_PLUGIN_IDS` |
| M2 | 项目简介贡献 `project_summary`（进度 n/m、当前项标题、等你几项） | 到达页与项目选择器按贡献画通用进度条，没有贡献就不画 | `project-arrival-http.ts` 的 `BriefGoal`、外壳 `arrival/*`、`renderGoalTrack` |
| M3 | 挂接目标（复用 `placement_relation`，加「可作为目标」与显示名） | 外壳画通用目标选择器，按 `open.surface` 打开，不分插件 | `placement.ts` 的 Goal 流程、`goal-input-client.ts`、`goals.embeds` |
| M4 | 可接收（复用放置服务的 `receive`，加接收的来源种类） | 「放到…」候选取声明了接收的插件 | `/api/mainline/shelve`、`/records/:id/shelf`、`web-storage-resources.ts` 的 Shelf 调用 |
| M5 | 原生伴侣：全局热键、拖放接收、剪贴板接收、设备偏好、轮盘动作 | 桌面壳从登记读插件 id、路由与动作，命令带插件 id 参数；全局键仍归宿主分配（登记已有 `keys`） | 桌面壳与 Tauri 的 `shelf_*` |
| M6 | 插件作用域的外壳事件 `plugin:<id>/<event>` | 登记一次，外壳与桌面壳按通用事件转发 | `molis-shelf-*`、`character-run-open`、`dom-events.ts` 里列插件文件 |
| M7 | 共用样式只用 `mw-` 名与通用属性 | 插件要特殊布局、输入、危险操作、保存状态、落点、庆祝，打通用属性 | 约 250 处 `.goal-*` 与其他插件的类名、属性选择器 |
| M8 | 对象种类与图标（复用 `/surface-kinds` 与 Manifest 图标） | 外壳取声明，不猜 | `TAB_KINDS`、`KIND_GLYPH`、`frame-assets.ts` 白名单、`sources: "Feed"` |
| M9 | Functions 场景与默认选项由插件声明 | 判断规则编辑器、首页与 Functions 只读声明 | `functions.ts` 的 Feed、Inbox 常量与逻辑，外壳 `inbox.next`/`feed.capture` 分支 |
| M10 | 集成声明拉取种类与词表 | 来源拉取服务按声明校验与分派 | `plugin-source-pull.ts` 的 `rss`/`youtube_channel`、宿主 import 集成包、`sources:pull_feed` |
| M11 | 连接器驱动能力（D3） | 宿主按驱动声明的能力分派，清单由登记生成 | `builtin-integrations.ts` 手写清单、6 个 `connector-*` 的服务名分支、3 个以集成命名的文件、Gmail 上手来源、`/api/feed/connectors/…` 回调 |
| M12 | 成果类型声明可搜字段 | 成果库索引按声明 | `SEARCHABLE_FIELDS` |
| M13 | Agent 场景包与审查种类登记（工具包、执行规则、看板放行、审查种类及其渲染） | Agent Host 只跑通用回合；外壳按主人登记渲染审查 | `OFFICIAL_CODING_PACK`、`codingExecutionRules`、`coding-*` 资源名、`git-*` 审查名单与标题表 |
| M14 | 依赖与「个人插件」声明（D4） | 开 A 连带开 B、每个项目可见，按安装信任放行 | 登记层 `companions`、`personal`、`runtime.dual_instance` |
| M15 | 平台框内页面登记（#2239 的 `HostSurfaceRegistration`）扩到成果库、Characters、Sessions | 平台自己的页面一份登记，宿主与外壳都从它取 | `web-assets.ts`、`web-request.ts` 里逐个写的平台页面路由；首页权限名单 |
| M16 | 流程主人声明（已有 `flowOwners`） | 观测按声明分类 | `FLOW_SERVICES` 里的插件 id |
| M17 | 「主人核过的来源绑定」 | 放置服务对声明了的接收方写保留地址 | `placement` 的 `kind === "form"` |

### 5.1 门禁：平台不点名插件

新增一道 `pnpm health:check` 组（只许变小，对照 merge-base）：在第 1.3 节第 2 条列的目录里，数插件 id（短 id 与 `io.molis.work.<id>`）、插件包 import、以插件命名的文件、`.<插件>-*` 类名与 `data-<插件>-*` 属性。id 清单从插件目录现读，不手写；第 3 节的例外各自一行登记理由与用户决定日期，和 `APPROVED_BUILD_TIME_EXCEPTIONS` 同一写法（名单与磁盘双向一致）。改门禁按 AGENTS 先问用户——本节就是请你一并批。

## 6. 分片与排期

建议独立一批（暂称 **44B 特殊逻辑平民化**），**等 #2239（第 47 批）合入后开工、REL-5（M1）之前合完**。一批一个 PR、批内子分支（决定 31）。

| 片 | 内容 | 依赖 | 冲突面 |
| --- | --- | --- | --- |
| 0 | **安全缺口**：保留 `io.molis.work.characters`，补冒名安装的拒绝测试与 SECURITY-INVARIANTS 行（S-75 扩展） | 无，可立即单独做 | `host-plugin-ids.ts` |
| 1 | 合同与 SDK 改名与声明（4.4 全部，M2～M4、M6、M8～M10、M12～M14 的合同部分），一次改完消费者；`api:update`、`actions:update` | 0 | `dom-events.ts`、`plugin-manifest.ts`、`functions.ts`、`plugin-source-pull.ts` |
| 2 | 存储与持久化名字（4.6，按 D5）：升版本、升级段、金样 | 1 | `packages/storage`、`tooling/versions.json` |
| 3 | 宿主：Alchemist（D2）、演示数据（M1）、官方集成驱动（D3/M11）、来源拉取（M10）、权限名单与平台页面登记（M15） | 1 | `web-request.ts`、`project-host.ts`、`home-stores.ts` |
| 4 | Shelf：桌面原生伴侣（M5，含 Rust）、可接收（M4）、`modules/shelf` 搬回包、升级块与演示数据；按 D1 | 1、3 | `apps/desktop`、`mainline-http.ts`；跑 `native-checks rust` |
| 5 | 外壳与样式（4.3，M7）：先在组件板改名再迁，与第 91 批（Design System 统一底座）对齐，改完跑 `pnpm visual:compare` | 1 | 共用样式模块；与 91 批同一时段要协调 |
| 6 | Agent Host 场景包与审查种类（M13、D6），创作代理搬进 `horizontal/plugin-studio` | 1、#2239 | `horizontal/agent-host`；提示词改动跑评测与 `studio:replay` |
| 7 | 受信标记（2.1，D4）、观测与放置的小项（M16、M17）、成果库残留（P2） | 1 | `plugin-registration.ts`、`plugin-registry.ts` |
| 8 | 门禁（5.1）、文档（GLOSSARY、SSOT、PACKAGE-BOUNDARIES、插件同等地位 spec 的过期行、`skills/molis-plugin-dev` 新声明的写法）、样例与注释（D8） | 1～7 | — |

## 7. 要用户拍板

| # | 事项 | 方案（推荐在前） | 卡住 |
| --- | --- | --- | --- |
| D1 | Shelf 的地位 | A 保留为唯一的插件形态例外，只留常开，其余私路改声明（推荐）；B 收归平台部件（`kind:"system"`，删整套常开机制）；C 降为普通插件，可移除 | 片 4、第 3 节 E1 |
| D2 | Alchemist | A 现在删宿主接线与入口，数据原地保留不读，第 82 批重做时决定导入（推荐）；B 保持现状到第 82 批；C 先迁成普通 Runtime 插件 | 片 3、构建期例外名单清零 |
| D3 | 官方集成 | A 收成平台的连接器驱动：登记生成清单、驱动声明能力、宿主按能力分派（推荐）；B 并入普通插件运行时（与第三方插件同路，OAuth 搬进沙箱服务）；C 维持现状 | 片 3、M10、M11 |
| D4 | `personal`、`companions` 等受信标记 | A 改为 Manifest 声明、按安装信任放行（推荐）；B 保留为内置专属，写进例外名单 | 片 7 |
| D5 | 存储与事件里的 Feed／Inbox 旧名字（表、引用前缀、密钥引用、事件名） | A 升版本改中性名，钥匙串服务名例外冻结（推荐）；B 全部冻结为历史名、登记不再新增；C 全改含钥匙串 | 片 2 |
| D6 | 工作区 Git | A 定为平台事实，改名 `workspace-vcs`，Git、Diff 是消费方（推荐）；B 搬进 Git 插件 | 片 6、SDK 的 git 部件 |
| D7 | 排期 | A 独立一批 44B，#2239 合入后开工、REL-5 前合完；片 0 现在单独做（推荐）；B 拆进第 48、57、91 等现有批次 | 全部 |
| D8 | 组件板与样例里的真实插件名 | A 换成中性样例名（推荐）；B 保留，门禁不量样例文件 | 片 8 |

**拍板结果（2026-11-22，弹窗）：**

| # | 用户选择 |
| --- | --- |
| D1 | A：Shelf 保留为唯一的插件形态例外，只留常开，其余私路改声明 |
| D2 | A：现在删 Alchemist 的宿主接线与入口，数据原地保留不读，第 82 批重做时决定导入 |
| D3 | A：官方集成收成平台的连接器驱动 |
| D4 | 用户另给：以后不再区分个人插件与项目插件，另立[统一工作分区需求书](../unified-partition-plugins/spec.md)（`personal` 分区与项目分区同构、Home 装包一次 + 分区按需启用、星型单向 Push、干净 v1 基线清零双轨）；第 2.1 节的 `personal`、`companions`、登记层 `dual_instance` 与「只给宿主启动清单」的服务改按那份需求书处理 |
| D5 | A：升版本改中性名，钥匙串服务名例外冻结 |
| D6 | **B：工作区 Git 搬进 Git 插件**。宿主 `workspace-git*.ts`（约 1,400 行）与 SDK 的 `git-porcelain.ts`、`git.*` 错误码随之进 Git 插件；Diff、Coding 改为经 Git 插件的公开动作读取（Manifest 声明可选依赖，Git 未启用时如实显示不可用）；Agent Host 审查种类 `git-index`／`git-integration` 改由 Git 插件在 Manifest 申报。跑本机 `git` 命令所需的本机命令能力按信任级别给（宿主信任的签名包），不按插件名开私路——片 6 按此改写 |
| D7 | A：片 0（Characters 保留 id + 拒绝测试）现在单独做；其余片作为独立一批 44B，#2239 合入后开工；[统一分区](../unified-partition-plugins/spec.md) A→B→C 接在后面，REL-5 前全部合完。片 4（Shelf）与本需求片 7（受信标记）并入统一分区 |
| D8 | A：组件板与样例里的真实插件名换成中性样例名 |

## 8. 验收（编号 PSD-xx，测试名或注释写编号）

- **PSD-01**（拔掉测试）：对每个内置插件，隔离 Home 里移除后项目页、助理、MCP、设置、桌面壳启动、同步、备份恢复都不报错；Shelf 按 D1。
- **PSD-02**（平台不点名）：5.1 门禁在 main 上从现值降到只剩第 3 节例外。
- **PSD-03**（同一条路）：一个固定公钥的第三方样例插件声明 M2～M5、M8～M10、M12～M14 中各一项，得到与内置插件同样的位置（样例放 `examples/`，不进生产 workspace）。
- **PSD-04**（冒名）：非宿主包以 `io.molis.work.characters` 等保留 id 安装被拒，`plugin.id_namespace_conflict`。
- **PSD-05**（升级）：D5 改名后，金样 Home 回放，Feed 证据、拉取游标、「等你」条目都在。
- **PSD-06**（桌面）：Shelf 的热键、拖放、轮盘、剪贴板在真实 macOS 上照常（原生伴侣改造后）。
- **PSD-07**（界面）：共用样式改名后，`pnpm visual:compare` 无意外差异；中英、深浅、三宽度。

## 9. 开工前检查（摘要）

| # | 回答 |
| --- | --- |
| 1 事实主人 | 不新增事实；Shelf 的私有实现从 `modules/` 回到插件包；成果库、Characters、创作台、工作区版本控制归平台 |
| 2 插件同等待遇 | 本需求的目的；删构建期最后一个例外，例外名单只剩第 3 节 |
| 4 合同 | 大量改名与新声明；首个外部安装之前不留兼容期；片 1 一次改完消费者 |
| 6 表与存储 | 片 2 按 D5 升版本、写升级段、补金样；真实 Home 不动 |
| 7 兼容与迁移 | 只有 D5 选 A 或 C 时的升级段；按 AGENTS 写进 CONTRACT-CHANGES「当前保留机制」前再确认 |
| 8 安全边界 | 片 0 的保留 id；M5 的桌面 IPC 能力文件（S-14）；M11 的驱动信任（只给宿主构建与固定公钥）；各配拒绝测试 |
| 12 页面与资源 | 共用样式改名不应增大首屏；搬回插件的样式按 PLUGIN-STYLES 预算量 |
| 14 冲突面 | #2239 在途（创作台、`host-surfaces.ts`、宿主 `plugin-builder/`）；第 91 批（共用样式）待认领；开工前查在途 PR |
