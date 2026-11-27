# 特殊逻辑平民化：特殊插件收归平台、平台特例收成公开声明（Platform Specials Demotion）

状态：44B-0 已随 [#2262](https://github.com/molis-ai/molis-work/pull/2262) 合入（`de25e3090d`）。44B-1/2 由 Claude（本机）「44B｜主会话」承接，删除旧 Alchemist（[#2279](https://github.com/molis-ai/molis-work/pull/2279)，`ae9f8948c7`）、Shelf 平台化与官方集成驱动化（[#2294](https://github.com/molis-ai/molis-work/pull/2294)）均已合入，独立复核修复已随 [#2308](https://github.com/molis-ai/molis-work/pull/2308) 合入；同步衔接 #2260 已合入；余项收尾 [第 44C 批](../post-anticorruption-roadmap/reference/batches/44c.md)已随 [#2333](https://github.com/molis-ai/molis-work/pull/2333)（`56a094ec0e`，2026-11-26）合入：PSD-04a、PSD-08 达成；PSD-07 工程过（`visual:compare` 无意外差异），界面待你看实物；部分达成的有 PSD-02（具名例外名单已立，另有三种例外待你定）、PSD-01（逐一拔掉后的桌面壳、同步与备份没测）、PSD-03（签名沙箱包还不能申报 M2/M4/M6/M9/M12/M13）与 PSD-06（真机 macOS 热键、拖放与剪贴板待你验收），见批次文件。见[认领板](https://github.com/molis-ai/molis-work/issues/1743)、[44B](../post-anticorruption-roadmap/reference/batches/44b.md)、[44C](../post-anticorruption-roadmap/reference/batches/44c.md)与[实施总纲](implementation-plan.md)。

需求维护：Claude / Antigravity；实现：Claude（本机）「44B｜主会话」。类型：底层与架构（主）、横向能力、产品线（Shelf、Feed、Inbox、Goals、Coding、Alchemist、官方集成）。前身：[插件同等地位收口](../plugin-equal-standing/spec.md)（第 44 批，及在途复核清扫 [#2258](https://github.com/molis-ai/molis-work/pull/2258)）；本需求把范围扩到**全仓所有特殊地位与特例接线**，并彻底清零插件形态特例。

> **2026-11-22 合并终审基线校准（相对 `1d38f73928`）**：
> - `text-stats` 已于 `#2243` 退役删除、`overview.lead` 已于 `#2240` 删除、`skill-scenes` 已于 `#2248` 修复，现役平等内置插件收敛为 **20 个**（不含收归平台的创作台 `#2239`、纯平台化后的 Shelf 与彻底删除的旧 Alchemist）。
> - 在途 `#2258`（第 44 批复核清扫，待合前置）合入后提供：250+ 处共用样式 `.mw-*` 泛化与永久门禁 `findSharedStylePluginSelectors`（M7 主体）、Goals `demo-seed` 迁出（M1 主体）、`WORK_PROGRESS_CONTINUITY_PROTOCOL`（替代 `server/src/continuity/` Goals 硬编码）、兄弟插件 `goals:*` 可选化与画框泛化——**`44B` 直接消费其成果，不重复改写**。
> - 已合入 `#2259`（决定 64/65）新增 `91-0c` 统一列表-详情舞台容器并删 7 处外壳插件名分支，`44B` 在其之上实施。
> - 终审新增覆写与补漏：① **D1/U9 覆写**：Shelf 彻底剥离插件外衣收归纯平台模块 `modules/shelf`（`system.shelf`，`/api/platform/shelf`），`always_on = 0`、`dual_instance = 0`、免重写 ~3,150 行 Rust M5 伴侣协议；② **D2/D5 与 Clean v1（U13）统一**：彻底删除旧 Alchemist（含 `home-stores.ts` 与 `better-sqlite3` 豁免），D5 存储改名直接 Clean v1 拍平（仅冻结 macOS 钥匙串服务名）；③ 补齐 `#2231` `platform-sync-catalog.ts` Inbox 劫持修复、保留整个 `io.molis.work.` 前缀（含漏掉的 `characters`/`assistant`）、Goals `management_actions`/`approval_outcomes`、连接器 20 CLI/`feishu`/`lark`/`figma`/`Sentry-Bearer`/`typesafe`、`youtube` 收编进 `rss`、`planning-methods` 迁入 `packages/system-skills/`、3 处 `provider_id` 统一、`RuntimePluginDirectory` 与 `PLATFORM_SETTINGS_REGISTRY`。

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
| P1 | **Shelf**（`plugins/native/shelf` + `modules/shelf`） | 普通 Runtime 装配（项目一份 + Home 一份，`dual_instance`），但 `always_on: true`（`manifest.ts:29`）；全仓唯一的常开插件 | ① 常开：`always-on-plugins.ts:32-62` 只读宿主构建的登记；② 桌面壳认得它：`apps/desktop/src/shell.ts:26-130` 写死 `openPlugin("shelf")` 与 `/api/platform/shelf/…`，Tauri 约 3,150 行 `shelf_*`（拖放、热键、轮盘、剪贴板监听、`shelf_http.rs:12`）；③ 宿主替它开路：`mainline-http.ts:5,21`、`computer/computer-http.ts:21-137`、`web-storage-resources.ts:21-58`、`demo-plugin-seed.ts:5`、`platform-upgrade-stores.ts:174` 与 `home-upgrade-stores.ts:18`；④ 合同：`dom-events.ts:217-234` 四个 `molis-shelf-*` 事件、`presentation-declaration.ts:32` 的 `"shelf"` 槽类型；⑤ 边界例外：`packages/test-kit/src/boundaries.ts:116-118`（插件 → module 的唯一一条）；⑥ 共用样式 `.shelf-*`（`#2258` 已泛化） | **D1 已终审定 B（纯平台）**：剥离 `plugins/native/shelf` 插件壳，收归纯平台模块 `modules/shelf`（`system.shelf`，`kind:"system"`，`/api/platform/shelf`，`HostSurfaceRegistration` 右栏第一格）；删整套 `always_on`、`dual_instance` 特例与 `PLUGIN_MODULE_IMPORT_ALLOWLIST`；桌面端 Rust 仅切换平台路由与去插件 id，**免重写 ~3,150 行 Rust 为 M5 伴侣协议** |
| P2 | **成果库**（`modules/artifacts`，提供方 `io.molis.work.artifacts` → `system.artifacts`，`kind:"system"`） | 已是平台（PG-077，#1633）；id 已保留（`host-plugin-ids.ts:8`） | 残留插件形状的名字、同步按 id 排层与对 Goals 的点名 | 平台部件，Clean v1 切纯平台提供方 `system.artifacts`（`io.molis.work.artifacts` 进入保留前缀防冒名）；`modules/sync-replication/src/index.ts:358-367` 改声明式 `SyncTopologicalLayer`（`catalog \| foundation \| reference_owner \| standard`）与 `dependencies`；`goals.embeds` 改 `artifacts.subject.embeds@1`；`SEARCHABLE_FIELDS` 改由成果类型声明；同步清理 `#2231` `platform-sync-catalog.ts` 里的伪插件同步 id 与 Inbox 劫持 |
| P3 | **创作台**（`plugins/native/plugin-builder` → #2239 搬到 `horizontal/plugin-studio`） | #2239 在途：改成平台框内页面，移出插件目录与构建期例外名单，id `io.molis.work.plugin-builder` 保留 | #2239 之后仍剩：`horizontal/agent-host/src/adapters/plugin-builder.ts`（322 行）；宿主 `plugin-builder/` 27 个文件里一半是已装包的通用设施（且 `agent-surface.ts:245-246` 硬编码 `^\/plugins\/(io\.molis\.work\...)` 导致第三方沙箱包 404）；存储键 `plugin-builder:agent-studio:*`；`bundle: "plugin-builder"`；`studio-images.ts:8-29` 点名 `images.*` | 平台部件（#2239 已定）。在 `44B`：创作代理搬进 `horizontal/plugin-studio`；宿主目录按职责拆成 `installed-plugin-*`（通用）与 studio（平台部件）；修复 `agent-surface.ts:245` 第三方正则；键与 bundle 改中性名 |
| P4 | **Alchemist**（`plugins/native/alchemist`） | 构建期手写装配的最后一个例外（`tests/builtin-plugin-assembly-gate.test.ts:48`）；`personal:true`，**今天每个项目都打开、MCP 也能调** | 宿主 6 个以它命名的文件（约 530 行）、`project-host.ts:300-301`、`web-request.ts:18,303-315`、`home-stores.ts:17,90`、`home-store-snapshot.ts:65-72`、`home-restore-inspection.ts:32-35`、`project-deleted-owners.ts:141-142`、`builtin-instructions.ts:14`、合同 `packages/contracts/src/modules/alchemist.ts`、`evidence-content.ts:256,268-275`、`account-cache.ts:4,81`、`sqlite-driver-owners.json` 唯一 `better-sqlite3` 例外 | **D2 已按 U13 终审定 Clean v1 彻底删除**：`44B` 直接删除 `plugins/native/alchemist`、全部宿主接线、合同、`home-stores.ts` 登记与 `better-sqlite3` 豁免（不留磁盘残留豁免）；第 82 批在 `horizontal/plugin-studio` 上按纯 UPP 场景插件从零重写 |
| P5 | **Characters**（`modules/characters`）及 **Assistant** | 已是 Module，但 Characters 动作提供方仍是 `kind:"plugin"`、`plugin_id: io.molis.work.characters`（`characters-host.ts:42`）；路由 `/api/plugins/io.molis.work.characters`；`ROLE_TEMPLATE_SCHEMA`（`contracts/modules/characters.ts:133`）硬编码 `^io\.molis\.work\.` | **安全缺口**：`host-plugin-ids.ts:8-11` 同时漏掉 `io.molis.work.characters` 与 `io.molis.work.assistant`，非宿主签名的包可冒用 `io.molis.work.*` 安装 | 平台部件：`44B-0` 全局保留整个 `io.molis.work.` 命名空间前缀（`S-reserved-host-prefix`）+ 拒绝测试，并修 `ROLE_TEMPLATE_SCHEMA` 正则；`44B` 将提供方改 `system.characters`（`kind:"system"`）、路由改 `/api/platform/characters`，`system.assistant` 与 `system.computer` 同步收齐 |
| P6 | **官方集成**（`plugins/official-integrations/{catalog,github,gmail,rss,youtube}`，`kind:"integration"`） | 不走统一插件运行时，走宿主独立内存注册表（`builtin-integrations.ts`、`integration-registry.ts`）；其中 `youtube` 非独立插件且宿主深层存在 20 个 CLI 与多厂商硬编码 | 宿主按服务名分支：`connector-access.ts`、`connector-account-actions.ts`、`connector-candidate-check.ts`、`connector-record-actions.ts`、`connector-request-credentials.ts`、`connector-web-search.ts`、`artifact-document-import.ts`、`research-repository-read.ts`、`connector-cli.ts:23-141`（20 CLI）、`feishu-cli.ts`、`web-connectors-settings.ts:19-32`、`lark-mcp-launch.ts`、`connector-mcp-endpoint.ts:9-41`（`feishu`/`lark`/`figma`）、`connections-service.ts:23`（`x-figma-token`）、`integration-declarations.ts:15,178`（`feishu`、`Sentry-Bearer`）、`side-panel-files.ts:63` & `artifact-actions.ts:21`、`web-catalog-settings.ts:221`（`typesafe`）；三个以集成命名的文件 `github/gmail/catalog-connector.ts`；Gmail OAuth 回调挂 `/api/feed/connectors/…`；上手服务内置 `gmail` | **D3 终审**：收成平台声明式「连接器驱动」并合并独立内存 `integration-registry.ts` 进 Home 软件层统一运行时；`youtube` 收编进 `rss` 驱动；清零全部 20 CLI 与厂商硬编码分支；驱动声明能力与 OAuth 回调，宿主只按能力分派（签名沙箱集成挂同一契约） |
| P7 | **内容包**（`plugins/content/{design-accessibility,planning-methods}`） | `planning-methods` 以 `system.default_state:"auto"` 随系统自带，混在 `plugins/content/` 中形成内容包特例 | 系统自带方法与普通可安装内容包混置 | `44B` 将 `planning-methods` 移出 `plugins/content/` 归纯平台 `packages/system-skills/`，清零内容包系统特例（原 E4 归零）；普通内容包 `design-accessibility` 机制不变 |
| P8 | **Sessions**（`horizontal/sessions`） | 提供方 `system.sessions`，`plugin-registry.ts:37` 拒绝占用其项目键 | 无 | 平台部件；`web-assets.ts:151-154`、`web-request.ts:291` 随 M15 `HostSurfaceRegistration` 统一登记 |
| P9 | **Schedule** | 普通 Runtime 插件；全仓唯一 `default_enabled:true`（`registration.ts:10`） | 仅作空白分区的初始选择（可随时移除）；调度引擎本身归平台（`horizontal/scheduler`） | 普通 UPP 插件；`default_enabled` 作为平台预设初值（E3），不给运行时特权 |
| P10 | **Git／Diff**（Coding 家族；`text-stats` 已于 `#2243` 删除） | 普通 Runtime 插件；`git` 命令与并行 worktree 由宿主运行（`workspace-git*.ts` 约 1,400 行 + `projects.workspace.writers.*`） | SDK 里有 `git-porcelain.ts`、`diff-view.ts`、`git.*` 错误码；Agent Host 审查种类写死 `git-index`、`git-integration` | **D6 已定 B（归 `109` [UPP-B3] 与 Coding 同步迁）**：宿主 `workspace-git*.ts`、`projects.workspace.writers.*` 与 SDK `git-porcelain.ts`/`git.*` 整体迁入 `plugins/native/git`；平台仅提供 argv-only、分区目录监禁的受限 VCS 执行能力（`S-git-plugin-command-scope`）；Coding 声明 Git 为随启用依赖（V9，可单独移除、先提示，V10），Diff 声明可选依赖，无 Git 时优雅降级；审查种类开放由插件申报（保留第 99 批 `#2244` `install_id` 隔离） |

### 2.1 按登记出身给的受信标记

这些标记在 `packages/contracts/src/platform/plugin-registration.ts:198-235` 写明「只有宿主能说，Manifest 和已装包都说不了」：

| 标记 | 现在谁有 | 效果 | 结论（推荐） |
| --- | --- | --- | --- |
| `personal: true` | 14 个内置插件（Todo、Workflows、Pages、PPT、Jelly、Shelf、灵光、创作台、Alchemist、Images、Cognia、Form、Dataset、Issues） | 每个项目都开、只能隐藏不能移除，不出现在「项目可添加」里；与常开同形，只是更宽 | **D4**：推荐改为 Manifest 声明「个人插件」，按安装信任放行（装进 Home 的签名包可声明），移除规则与普通插件一致 |
| `companions` | Feed（带上 Inbox） | 开 Feed 时连带打开 Inbox | 改为 Manifest 的依赖声明，任何插件可用 |
| `runtime.dual_instance`（登记层） | Feed、Shelf、Work Brief | 内置走登记，第三方走 Manifest 的同名字段（44 批已开放给固定公钥的沙箱包，`plugin-manifest.ts:112-117`） | 合成一条：只认 Manifest，登记层这个字段删掉 |
| 只给「宿主启动清单」的服务 | `image_generation`、`model_configuration`、`local_tools`（`plugin-declared-services.ts:5-45`、`trust-rules.ts:~118`） | 已装包声明前两项直接失败 | `image_generation`、`model_configuration` 开放给固定公钥的签名包（经平台服务，有界）；`local_tools` 按安全边界继续只给宿主信任，但它按**信任级别**区分、不按插件名，不算例外 |
| `default_enabled` | Schedule | 新项目初始装上，之后可移除 | 保留为内置的产品初始选择（只影响新项目初值，不给运行时特权），写进第 3 节 |

## 3. 保留特殊的例外名单（终审后零插件形态例外）

门禁按这张表放行，表外任何点名都算违规。随着 **D1 终审定 B（Shelf 收归纯平台 `modules/shelf` / `system.shelf`）** 与 **`planning-methods` 迁入 `packages/system-skills/`**，原 E1（Shelf 插件例外）与 E4（系统内容包例外）**全部归零**；全仓不再有任何插件形态特例：

| # | 例外 | 只保留什么 | 理由 | 不保留什么 |
| --- | --- | --- | --- | --- |
| E2 | **保留命名空间前缀** | 禁止非宿主签名包安装任何 `io.molis.work.*`（覆盖 `artifacts`、`files`、`plugin-builder`、`characters`、`assistant`、`shelf` 等全部内置与平台保留名） | 防止第三方包冒名顶替系统提供方或借用历史授权（`S-reserved-host-prefix`） | 不给这些 id 任何运行时插件分支 |
| E3 | **内置的空白分区初值** | `default_enabled`（Schedule） | 只是空白分区的初始预设，存成普通 `partition_plugins` 成员关系，随时可移除 | 不给运行时特权 |
| E5 | **本机工具与受限 VCS 只给宿主信任** | `local_tools` 与受限 argv-only `git` 执行按**信任级别**拒绝非宿主包 | 本机抽字、OCR、剪贴板与 `git` 子进程是安全边界（`S-git-plugin-command-scope`、`docs/system/SECURITY-INVARIANTS.md`），按信任级别区分，不按插件名 | 不按插件 id 放行 |

整套常开插件机制（`always-on-plugins.ts`、`always-on-rules.ts`、同意种类 `always_on`、外壳读取）在 `44B` 随 Shelf 收归纯平台彻底删除。

## 4. 盘点二：平台代码里的特例分支（按层）

样例与组件板（约 25 个文件）、只提到插件名的注释另列在 4.9 节，不计入正文数字。

### 4.1 Shelf 收归纯平台 `modules/shelf`（`system.shelf`，取代原插件私路与 M5）

| 位置 | 现状 | 改法（纯平台部件） |
| --- | --- | --- |
| `plugins/native/shelf/**` 与 `modules/shelf/src/**` | 插件壳包与 `modules/shelf` 两处分治；`packages/test-kit/src/boundaries.ts:116-118` 留插件 → module 唯一例外 | 剥离并删除 `plugins/native/shelf`，全部实现与存储收拢回纯平台 `modules/shelf`；注册为 `system.shelf`（`kind:"system"`）、页面经 `HostSurfaceRegistration` 挂右栏第一格；删 `PLUGIN_MODULE_IMPORT_ALLOWLIST` 与 `always_on`、`dual_instance` 特例 |
| `apps/desktop/src/shell.ts:26-130`；`adapters/tauri/src/{shelf_*,drop_wheel*,clipboard_watch_macos,page_files}.rs`；`main.rs`；`permissions/shelf.toml` | 桌面壳直接调用 `/api/platform/shelf/…` 与 `openPlugin("shelf")` | **免重写 ~3,150 行 Rust 为 M5 伴侣协议**：桌面壳与 Tauri 作为同一产品的原生外壳，直接改调纯平台路由 `/api/platform/shelf/…` 与平台表面 `system.shelf`，清除旧插件 id 字符串 |
| `mainline-http.ts:5,21`；`computer/computer-http.ts:21-137`、`computer-surfaces.ts:72,88`；`web-storage-resources.ts:21-58`；外壳 `browser/work-event-card.ts`、`work-line-parts.ts`、`side-panel-computer.ts`、`file-picker.ts` | 「放到 Shelf」散写专用路由 | 对齐 M4「可接收」放置声明：平台 Shelf 与声明了 `receive` 的普通插件共享统一「放到…」候选通道（Shelf 作为平台级默认接收端），清理重复私有路由 |
| `packages/contracts/src/platform/dom-events.ts:146-149,217-234`；`presentation-declaration.ts:32` | 四个 `molis-shelf-*` 事件、`"shelf"` 槽类型 | 事件归平台表面事件登记（M6 仍向普通插件开放 `plugin:<id>/<event>`）；呈现槽去插件专名 |
| `demo-plugin-seed.ts:5,42-54`、`platform-upgrade-stores.ts:174`、`home-upgrade-stores.ts:18` | 宿主直接 import Shelf 插件包与专用升级块 | 收归平台 `modules/shelf` 内部标准平台模块初始化与平台库升级清单 |

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
| 其他点名 | `agent-definitions/agent-definitions.ts:40`（Feed 提示词键搬家表）、`platform-connection-services.ts:7,15,33`（`model-api.jelly`、`Coding Agent`）、`material-native.ts:43,49`（`jelly-material`、`jelly-whisper` 二进制名；第 112 批已改为 `molis-material`、删除 `jelly-whisper`）、`assistant/assistant-review-words.ts:26,69`、`sandbox-package.ts:228` | 改中性名；搬家表交 Feed 包或删 |
| 平台自己的页面与同步目录 | `web-assets.ts:151-154`、`web-request.ts:268,291`（成果库、Characters、Sessions 固定资源与路由）；`platform-sync-catalog.ts:18-52`（`#2231` 新增：`attentionSyncSelection` 借用构建登记表中唯一声明 Attention 的插件身份，声明缺失或重复会抛错，用户停用 Inbox 的运行结果须单验，另新造 5 个伪插件同步 id） | M15：用 `#2239` `HostSurfaceRegistration` 统一；`platform-sync-catalog.ts` 改纯平台 `SyncSelection`（`owner_kind:"platform"`），彻底脱钩 Inbox 与伪插件 id |
| Goals 剩余登记特权与身份/目录孤岛 | `PluginRegistration.management_actions`（6 个 MCP 工具含 `molis_work_v1_initialize`、`scripts/gates/goals-management-wiring.mjs`）与 `approval_outcomes`（原始 `db.prepare`）；3 处分裂的 `provider_id` 派生（`web-catalog-settings.ts`、`blueprint-host.ts` vs `surface-home-directory.ts`/`mainline-actions.ts`/`observation-host.ts`/`task-grant-actions.ts`）；9～11 处分散设置文件；工作台 10+ 处直读 `BUILTIN_PLUGIN_CATALOG`；`agent-question-surfaces.ts:15-20`（`CODING_QUESTION_TYPES`）；`materials-reader-client.ts:138-147`（Diff `before/after`）；`connectors-settings.ts:419`（Coding MCP 提示）；`images/src/browser/result.ts:55`（`surface:"shelf"`）与死依赖 `@molis-ai/molis-work-storage` | 废除 `management_actions`/`approval_outcomes` 特权；收敛到 `packages/plugin-runtime/src/install-identity.ts` 唯一 `resolveActionProviderId(record)`、`RuntimePluginDirectory` 与 `PLATFORM_SETTINGS_REGISTRY`（`EXTENSION-POINTS.md` X-2）；清零点名残留 |

### 4.3 外壳与共用界面（`apps/workbench/src`、`packages/design-system/src`）

| 簇 | 位置 | 改法 |
| --- | --- | --- |
| 共用样式里的 Goals 名字（约 250 处） | `ds/styles/directory-ledger.ts`（约 50，`.desktop-goal-directory`、`.navigator-goal-*`）、`wb/styles/base.ts`（28）、`ds/styles/interaction-texture.ts`（27，含 `--goal-status-tone`）、`ds/styles/foundation.ts`（19）、`wb/styles/immersive-directory.ts`（18）、`wb/styles/plugin-stage.ts`（16）、`ds/styles/craft-finish-pages.ts`（10）、`placement.ts`、`immersive-navigation.ts`、`micro-interactions.ts`、`navigation-ownership.ts`、`workspace-panes.ts`、`linear-density.ts`、`focus-sections.ts` | M7：至少 6 个别的插件已在用 `.goal-status`、`.goal-collection-fold`，所以是**改名为 `mw-status`、`mw-collection-fold`、`mw-directory-ledger`、`navigator-entry-*`**，不是搬走；只属于 Goals 的（`.goal-trash-dialog`、画布、看板、图节点）搬回 Goals 样式表。取代并扩大 [BL-b44-shared-styles-plugin-names](../../docs/backlog-removed.md)（已随第 44 批复核 [#2258](https://github.com/molis-ai/molis-work/pull/2258) 提前结清并新增 `findSharedStylePluginSelectors` 门禁，原 BL 记的「约 40 处」偏少） |
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
| M4 | 可接收（复用放置服务的 `receive`，加接收的来源种类） | 「放到…」候选取纯平台 `system.shelf` 及声明了 `receive` 的普通插件 | `/api/mainline/shelve`、`/records/:id/shelf`、`web-storage-resources.ts` 私有路由 |
| M5 | **已随 D1 终审取消**（Shelf 收归纯平台 `modules/shelf`，免重写 ~3,150 行 Rust 原生伴侣协议） | 桌面壳直接走 `/api/platform/shelf` 与 `system.shelf` | 原规划的 `companion_*` Rust 协议层 |
| M6 | 插件作用域的外壳事件 `plugin:<id>/<event>` | 登记一次，外壳与桌面壳按通用事件转发 | `molis-shelf-*`、`character-run-open`、`dom-events.ts` 里列插件文件 |
| M7 | 共用样式只用 `mw-` 名与通用属性 | 插件要特殊布局、输入、危险操作、保存状态、落点、庆祝，打通用属性 | 约 250 处 `.goal-*` 与其他插件的类名、属性选择器 |
| M8 | 对象种类与图标（复用 `/surface-kinds` 与 Manifest 图标） | 外壳取声明，不猜 | `TAB_KINDS`、`KIND_GLYPH`、`frame-assets.ts` 白名单、`sources: "Feed"` |
| M9 | Functions 场景与默认选项由插件声明 | 判断规则编辑器、首页与 Functions 只读声明 | `functions.ts` 的 Feed、Inbox 常量与逻辑，外壳 `inbox.next`/`feed.capture` 分支 |
| M10 | 集成声明拉取种类与词表 | 来源拉取服务按声明校验与分派 | `plugin-source-pull.ts` 的 `rss`/`youtube_channel`、宿主 import 集成包、`sources:pull_feed` |
| M11 | 连接器驱动能力（D3） | 宿主按驱动声明的能力分派，清单由登记生成 | `builtin-integrations.ts` 手写清单、6 个 `connector-*` 的服务名分支、3 个以集成命名的文件、Gmail 上手来源、`/api/feed/connectors/…` 回调 |
| M12 | 成果类型声明可搜字段 | 成果库索引按声明 | `SEARCHABLE_FIELDS` |
| M13 | Agent 场景包与审查种类登记（工具包、执行规则、看板放行、审查种类及其渲染） | Agent Host 只跑通用回合；外壳按主人登记渲染审查 | `OFFICIAL_CODING_PACK`、`codingExecutionRules`、`coding-*` 资源名、`git-*` 审查名单与标题表 |
| M14 | 依赖与随启用声明（D4 终版：个人插件分类已废除） | 依赖声明加通用 `enable_with`（开 A 时一并开 B，V9）；不再有「个人插件」声明 | 登记层 `companions`、`personal`、`runtime.dual_instance` |
| M15 | 平台框内页面登记（#2239 的 `HostSurfaceRegistration`）扩到成果库、Characters、Sessions | 平台自己的页面一份登记，宿主与外壳都从它取 | `web-assets.ts`、`web-request.ts` 里逐个写的平台页面路由；首页权限名单（**44C 偏离**：三页没有 Manifest，另立平台页面登记 `PLATFORM_SURFACES`，与 `HostSurfaceRegistration` 并存，见 [44C](../post-anticorruption-roadmap/reference/batches/44c.md#batch-44c-record)） |
| M16 | 流程主人声明（已有 `flowOwners`） | 观测按声明分类 | `FLOW_SERVICES` 里的插件 id |
| M17 | 「主人核过的来源绑定」 | 放置服务对声明了的接收方写保留地址 | `placement` 的 `kind === "form"` |

### 5.1 门禁：平台不点名插件（G1，用户已批准）

新增一道 `pnpm health:check` 组（**G1**，只许变小，对照 merge-base）：在第 1.3 节第 2 条列的目录里，数插件 id（短 id 与 `io.molis.work.<id>`）、插件包 import、以插件命名的文件、`.<插件>-*` 类名与 `data-<插件>-*` 属性（共用样式段直接衔接 `#2258` 新增的 `findSharedStylePluginSelectors`）。id 清单从插件目录现读，不手写；第 3 节的例外各自一行登记理由与用户决定日期（名单与磁盘双向一致）。G1～G5 全套门禁汇总见[合并实施总纲](implementation-plan.md#4-新增收严防回流门禁g1g5用户已批准)。

## 6. 分片与排期（正式批号 `44B`）

正式立批为路线书 **[`44B` 特殊逻辑平民化](../post-anticorruption-roadmap/reference/batches/44b.md)**（**等在途 `#2239`、`#2258`、`#2253`～`#2255`、`#2257`、`#2250`、`#2260` 合入后开工；`#2259`（`91-0c`）已合入；排在 `106`～`111` [UPP]、`91-2..4`、`91B`、`105`、`45`～`90`、`REL-4`、`SRV` 之前**）。一批一个 PR、批内子分支（决定 31）；`44B-0` 可提前切出独立安全小 PR。

| 片 | 内容 | 依赖 | 冲突面 |
| --- | --- | --- | --- |
| `44B-0` | **P0 安全补洞**：全局保留 `io.molis.work.` 前缀（覆盖 `characters`、`assistant`、`shelf`、`artifacts` 等），补 `S-reserved-host-prefix` 拒绝测试；修 `agent-surface.ts:245` 与 `contracts/modules/characters.ts:133` 第三方前缀正则 | 无，可立即单独切小 PR | `host-plugin-ids.ts`、`install-identity.ts` |
| `44B-1` | 合同与 SDK 改名与声明（4.4 全部，M2～M4、M6、M8～M10、M12～M13 的合同部分（M14 依赖与 `enable_with` 随 `106` Manifest 新字段），统一 `resolveActionProviderId`、`artifacts.subject.embeds@1`、`SyncTopologicalLayer`）；`api:update`、`actions:update` | `44B-0` | `dom-events.ts`、`plugin-manifest.ts`、`functions.ts`、`plugin-source-pull.ts` |
| `44B-2` | 存储与持久化 Clean v1 直接拍平（4.6，按 D5+U13 终审）：直接改中性名、`same-version-exceptions.json`、重生 `0.1.0` 金样，不写过渡升级段（macOS 钥匙串服务名冻结） | `44B-1` | `packages/storage`、`tooling/versions.json` |
| `44B-3` | **Shelf 纯平台收口（D1 终审）+ 宿主清零**：剥离 `plugins/native/shelf` 收归 `modules/shelf`（`system.shelf`，`/api/platform/shelf`），切 Tauri 路由并删 `always_on` 与 `PLUGIN_MODULE_IMPORT_ALLOWLIST`；彻底删旧 Alchemist（含 `home-stores.ts` 与 `better-sqlite3`）；官方集成连接器驱动化（`youtube` 并入 `rss`、清 20 CLI 与厂商硬编码、合并 `integration-registry.ts`）；`planning-methods` 迁入 `packages/system-skills/`；修 `#2231` `platform-sync-catalog.ts` Inbox 劫持；收口 `PLATFORM_SETTINGS_REGISTRY`、`HostSurfaceRegistration` 与 Goals `management_actions`/`approval_outcomes` | `44B-1`、`#2239`、`#2258` | `apps/desktop`、`modules/shelf`、`web-request.ts`、`project-host.ts`、`home-stores.ts`；跑 `native-checks rust` |
| `44B-4` | 外壳与目录收口（4.3，消费 `#2258` 共享样式与画框泛化、衔接 `#2259` `91-0c`）：补清剩余 M2/M3/M8/M9 外壳分支与 `RuntimePluginDirectory`，跑 `pnpm visual:compare` | `44B-1`、`#2258` | `apps/workbench/src` |
| `44B-5` | Agent Host 场景包（M13）、创作代理搬进 `horizontal/plugin-studio`、观测/放置小项（M16/M17）、成果库残留（P2）；**注：Workspace Git 搬进 Git 插件（D6=B）与审查种类开放归入 [`109`（UPP-B3）](../post-anticorruption-roadmap/reference/batches/109.md) 与 Coding 同步改，受信标记归入 [`106`～`109`](../post-anticorruption-roadmap/reference/batches/106.md)** | `44B-1`、`#2239` | `horizontal/agent-host`；跑评测与 `studio:replay` |
| `44B-6` | 上线门禁 G1（5.1）、清空 `APPROVED_BUILD_TIME_EXCEPTIONS`/`NATIVE_PLUGIN_HTTP_FILES`、更新文档与样例注释（D8） | `44B-1`～`5` | — |

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

**拍板结果（2026-11-22，初审 + 终审合并覆写，记路线书[决定 66](../post-anticorruption-roadmap/reference/decisions.md#decision-66)）：**

| # | 用户最终选择 |
| --- | --- |
| D1 | **终审覆写为 B（纯平台）**：Shelf 剥离插件外衣收归纯平台模块 `modules/shelf`（`system.shelf`，`kind:"system"`，`/api/platform/shelf`，`HostSurfaceRegistration` 右栏常驻），在 `44B` 直接清零 `always_on`、`dual_instance`、普通插件 `HomePluginHost` 与 `PLUGIN_MODULE_IMPORT_ALLOWLIST`，桌面端 Rust 仅切平台路由，**免重写 ~3,150 行 Rust M5 伴侣协议** |
| D2 | **终审按 U13 统一为彻底 Clean v1 删除**：在 `44B` 直接删掉 `plugins/native/alchemist`、全部 6 个宿主文件、`contracts/modules/alchemist.ts`、`home-stores.ts` 豁免与 `better-sqlite3` 例外（零数据保留）；第 82 批按纯 UPP 场景插件在 `horizontal/plugin-studio` 上从零重写 |
| D3 | A 扩展：官方集成收成平台声明式连接器驱动，合并独立 `integration-registry.ts` 进 Home 软件层统一运行时，`youtube` 收编进 `rss` 驱动，`planning-methods` 迁入 `packages/system-skills/`，清零全部 20 CLI 与厂商硬编码（**44C 偏离，用户 2026-11-26 认可**：没有并进 Home 统一运行时，内置驱动去掉私有 Runtime、在宿主进程里直接启动、不占 Home 行，见 [44C](../post-anticorruption-roadmap/reference/batches/44c.md#batch-44c-record)） |
| D4 | 另立[统一工作分区需求书](../unified-partition-plugins/spec.md)（批号 `106`～`111`）：废除个人/项目插件分类，`personal` 与项目同构、Home 装包一次分区按需启用、星型单向 Push、干净 v1 清零双轨 |
| D5 | **终审按 U13 统一为 Clean v1 直接拍平**：存储表、前缀、密钥引用与事件直接改中性名拍平（`same-version-exceptions.json` + 重生 `0.1.0` 金样，不写过渡升级段），仅 **macOS 钥匙串服务名 `com.molis.work.feed.secretstore` 冻结** |
| D6 | **B（归 `109` [UPP-B3] 与 Coding 同波迁移）**：宿主 `workspace-git*.ts`（约 1,400 行）、`projects.workspace.writers.*`（并行 worktree 与整合审查）与 SDK 的 `git-porcelain.ts`、`git.*` 整体搬进 `plugins/native/git`；Coding 声明 Git 为随启用依赖（V9，可单独移除、先提示，V10），Diff 声明可选依赖，无 Git 时优雅降级；审查种类开放由插件申报（保留第 99 批 `#2244` `install_id` 隔离）；本机 `git` 走 argv-only、分区目录监禁、宿主信任门控的受限 VCS 执行能力（`S-git-plugin-command-scope`） |
| D7 | **终审全量排期**：`44B-0` 可立即单独切安全小 PR；消费在途待合前置 PR（`#2239`、`#2258`、`#2253`～`#2255`、`#2257`、`#2250`、`#2260`），`91-0c`（`#2259`）已合入；随后串行推进 `44B → 106(A) → 107(B1) → 108(B2) → 109(B3) → 110(B4) → 111(C)`，全部排在 `91-2..4`、`91B`、`105`、`45`～`90`、`REL-4`、`SRV` 之前 |
| D8 | A：组件板与样例里的真实插件名换成中性样例名 |

## 8. 验收（编号 PSD-xx，测试名或注释写编号）

- **PSD-01**（拔掉测试）：对全部 20 个内置插件，隔离 Home 里逐一移除后项目页、助理、MCP、设置、桌面壳启动、同步、备份恢复均不报错（分别覆盖构建登记中 Attention 声明零份及两份，以及正常构建下保留和停用 Inbox；核验平台身份、回执与分区键，不能读到另一身份的数据、移除 Git 后 Coding/Diff 优雅降级）。
- **PSD-02**（平台不点名）：门禁 **G1** 在 main 上降到只剩第 3 节具名例外（零插件形态例外）。
- **PSD-03**（同一条路）：固定公钥第三方样例插件声明 M2～M4、M6、M8～M10、M12～M13 中各一项，获得与内置插件同等位置，且非 `io.molis.work.*` 插件页面与角色模板正常加载不 404。
- **PSD-04a**（命名放开，V16）：固定公钥第三方包以 `com.example.notes` 安装、创作台生成插件以 `studio.<编号>` 安装均成功，页面与调用路由不 404；SDK 校验接受通用反向域名。
- **PSD-04**（冒名前缀）：非宿主包以任意 `io.molis.work.*`（含 `characters`、`assistant`、`shelf`、`artifacts`）安装被拒，`plugin.id_namespace_conflict`（`S-reserved-host-prefix`）。
- **PSD-05**（Clean v1 基线）：D5 改名拍平后，重生 `0.1.0` 金样回放通过，证据、拉取游标、「等你」条目与 `system.shelf` 数据全部正常；`better-sqlite3` 与 Alchemist 豁免清零。
- **PSD-06**（纯平台 Shelf 与桌面壳）：Shelf 经 `/api/platform/shelf` 与 `HostSurfaceRegistration` 运行，热键、拖放、轮盘、剪贴板在真实 macOS 上照常；`always_on` 机制与 `plugins/native/shelf` 完全删除。
- **PSD-07**（界面）：共用样式泛化（消费 `#2258`）与外壳收口后，`pnpm visual:compare` 无意外差异；中英、深浅、三宽度。
- **PSD-08**（连接器驱动与系统技能）：`youtube` 收编进 `rss`、`planning-methods` 迁入 `packages/system-skills/`，宿主零厂商/CLI 分支，现有连接器与技能设置回归全绿。

## 9. 开工前检查（摘要）

| # | 回答 |
| --- | --- |
| 1 事实主人 | 不新增事实；Shelf 收归纯平台 `modules/shelf`（`system.shelf`）；成果库（`system.artifacts`）、Characters（`system.characters`）、创作台（`horizontal/plugin-studio`）、`packages/system-skills/` 归平台；工作区 Git & Writers 在 `109` 迁入 `plugins/native/git` |
| 2 插件同等待遇 | 本需求的目的；删构建期全部例外与 `always_on`、`PLUGIN_MODULE_IMPORT_ALLOWLIST`，例外名单只剩第 3 节（零插件形态例外） |
| 4 合同 | 大量改名与新声明；首个外部安装之前不留兼容期；`44B-1` 一次改完消费者 |
| 6 表与存储 | `44B-2` 按 D5+U13 Clean v1 直接拍平、登记 `same-version-exceptions.json`、重生 `0.1.0` 金样；真实 Home 不动 |
| 7 兼容与迁移 | 按 U13 零过渡升级段与旧兼容读取；仅 macOS 钥匙串服务名冻结 |
| 8 安全边界 | `44B-0` 全局保留 `io.molis.work.` 前缀（`S-reserved-host-prefix`）；M11 连接器驱动信任；D6=B 受限 argv-only VCS 执行（`S-git-plugin-command-scope`，归 `109`）；各配拒绝测试 |
| 12 页面与资源 | 共用样式直接消费 `#2258` 成果；不增大首屏预算 |
| 14 冲突面 | 先消费在途 `#2239`、`#2258`、`#2253`～`#2255`、`#2257`、`#2250`、`#2260`；允许 `#2259` 的 `91-0c` 并行/前置；`44B` 与 `106`～`111` 排在 `91-2..4`/`91B`/`105`/`45`～`90`/`REL-4`/`SRV` 之前 |
