# 删除 Alchemist 与插件创作台：清单（③）

> **暂缓：用户 10-21 定，防腐做完再删。** 用户原话：「先不做删除，我就是跟你说下，这两个不要迁，先把我们防腐做完，再删」。现在只做一件事：把「不迁；防腐收尾后删除，再重做」写进仓库（§1、privileges.md、BACKLOG 的 BL-376、BL-377），由 ③ 开一个只改文档的 PR，排在 Coding 之后。
>
> 文档 PR **#947** 已开（10-21，head e51d3156f，已移交 ⑤）。

## 已定的

- 备份：远端分支 `backup/alchemist-plugin-builder-2026-10-21` = main `458b33059`（① 10-21 做的）。真删时，再按当时的 main 另做一份备份。
- 删除范围（用户 10-21 答 ① 的问题，选「一起删（推荐）」）：
  - `studio:replay` 的脚本、CI 任务、语料和文档，随创作台一起删。
  - 宿主里只给「创作台生成的插件」开的专用通路，也一起删。
  - 通用的第三方插件安装、沙箱，以及它们的安全测试，都留。哪些算通用，由 ② 在这份笔记里帮 ③ 判断。
- 顺序：两个 PR，先删 Alchemist，再删创作台（后一个叠在前一个上，只用 merge）。属于共享核心，要进批次跑全量。PR 正文写「本片动的文件」、删掉的 S 行、和在途 PR 的重叠。
- BACKLOG 编号：① 原定的 BL-400、BL-401 已被在途 PR 占用（#943 的两条用户验收行；#784 也有一条 BL-400，这两个 PR 自己就撞了）。改用 ③ 号段里的 BL-376（Alchemist）、BL-377（创作台），10-21 核过 main 和所有开着的 PR 都没用这两个号。

## 清单还没出

10-21 派了两个只读子代理分别清点，用户改成暂缓后就停了，都还没写出结果。真删时重新清点，起点如下（对 main `458b33059`）。

**Alchemist**
- 插件本体：`plugins/native/alchemist/` 147 个文件。
- 宿主：`apps/local-host/src/` 下 6 个文件，`alchemist-native-plugin-http.ts`、`alchemist-paths.ts`、`alchemist-prologue.ts`、`alchemist-pulse-github.ts`、`alchemist-search.ts`、`alchemist-service-host.ts`。
- 合同：`packages/contracts/src/modules/alchemist.ts`，快照 `tooling/gates/api/contracts/modules/alchemist.txt`。
- 测试：
  - `tests/alchemist-*` 16 个；
  - `tests/security-invariants-alchemist-lifecycle.test.ts`、`-resumption.test.ts`，可能借 Alchemist 测平台通用边界（并发取消、`beforeEffect`、S-35），删之前要换成夹具插件；
  - 夹具 `tests/fixtures/alchemist-*` 6 个，以及 `tests/fixtures/home-store-schemas/alchemist-search.sql`。
- 截图：`.impeccable/review/action-service/alchemist*` 8 张；`specs/repository-anti-corruption/evidence/flow-walk/18-alchemist-no-model-failed.jpg`。
- 另外约 207 个文件提到它（含 `specs/archive/`）。
- 需裁的线索：#883（S0a，Home 插件的库按项目分区）和 S-44（平台定来源的外联服务）是为 Alchemist 补的通用平台能力。删 Alchemist 后，要核它们是否还有别的使用者；没有的话，留不留由 ① 裁。

**插件创作台**
- 插件本体：`plugins/native/plugin-builder/` 25 个文件。
- 宿主：`apps/local-host/src/plugin-builder-surface.ts`，以及 `apps/local-host/src/plugin-builder/` 17 个文件（agent-surface、browser、build-checks、build-dependencies、build-project、build-types、capabilities、catalog、exposed-actions、installed、model、network、project-data、prompts、secrets、skill、storage）。
- agent-host：`horizontal/agent-host/src/adapters/plugin-builder.ts`。
- 合同：`packages/contracts/src/platform/plugin-builder.ts`，快照 `tooling/gates/api/contracts/platform/plugin-builder.txt`。
- 界面文字：`apps/workbench/src/i18n/studio-en.ts`。
- 脚本：`scripts/studio-replay.mts`、`scripts/studio-replay/*`、`scripts/agent-studio-harness.mts`、`scripts/agent-studio-preview-fixture.mts`、`scripts/preview-agent-studio.mts`。
- 文档：`docs/platform/STUDIO-SKILL-REPLAY.md`。
- 测试：`tests/agent-studio.e2e.test.ts`、`tests/plugin-builder-*` 3 个、`tests/studio-english.test.ts`、`tests/studio-replay.test.ts`、`tests/project-deletion-studios.test.ts`（与 Alchemist 交叉）、`tests/fixtures/plugin-builder-browser.ts`、`tests/fixtures/studio-replay/*`。
- 截图：`specs/repository-anti-corruption/evidence/flow-walk/29-plugin-builder-no-model.jpg`。
- 另外约 270 个文件提到 `plugin-builder|pluginBuilder|plugin_builder|创作台`。
- BACKLOG 里 BL-373（助理的注意规则选不到创作台装的插件）到时一起处理。

- 文档部分已有一份：`deletion-builder-docs-inventory.md`（创作台清单员的子代理在停之前写完的）。它列出要改的现行文档 51 份、约 330 处，整份删 6 份，需裁 7 项：installed-plugin-* 去留、design-system 里生成插件的渲染器、S-15/S-18/S-46/S-48 的测试换夹具、THIRD-PARTY-PLUGINS 阶段一、AGENTS.md:34、CONTRACT-CHANGES 的回放样本、发版 CHECKLIST/POLICY 的创作台条目。

**两者都留**：`specs/archive/alchemist-plugin/**`、`specs/archive/plugin-builder/**`，重做时参考。

**在途 PR 的重叠**（10-21）：yijunw0212 的 #894、#902、#904、#906、#907、#943 改到 `apps/local-host/src/plugin-builder/agent-surface.ts`、`plugins/native/plugin-builder/src/agent-studio.ts` 和 README。那是别人的 PR，不动，合并时由 ⑤ 处理。

**清单员的简报**：10-21 两份只读简报（判定规则；必须单独列出的五类：装配与依赖、安全不变量、门禁与 CI、文档、在途重叠；输出结构）在 ③ 会话的记录里。真删时照 ① 10-21 的六类要求重派。

## ② 的回答：创作台生成的插件走的宿主路径，哪些通用（10-21，对 main `458b33059`）

① 请 ② 回答。依据是 ② 派的只读子代理清点，行号对 `458b33059`；真删时按当时的 main 再核一遍。build-checks、build-project、build-dependencies、browser 四个文件只看了导入和调用处，没有逐行读。

怎么认出一个生成插件：生产里只有它是 `execution: "sandbox"`（`apps/local-host/src/plugin-builder/installed.ts:73`），签名 `agent-built:<buildId>`，`plugin_id` 是 `io.molis.work.generated.<uuid>`。它跑在 `installed-plugin-host.ts:115` 另建的一份插件平台上（`home: null`），和 7 个 Runtime 插件用同一个 `createPluginPlatform`。

### 1. 删：只为创作台开的路

- `apps/local-host/src/plugin-builder/` 17 个文件，`installed-plugin-host.ts`、`installed-plugin-lifecycle.ts`、`installed-plugin-version.ts`、`installed-plugin-exposure.ts`、`plugin-builder-surface.ts`。
- 通用文件里只为它加的接口，删除时要改：
  - `project-host.ts:31-32`（导入）、`:349`、`:380`（每个项目都准备一次已装插件）、`:436`（关项目时释放）。
  - `project-plugin-ports.ts:7`、`:22-33`（`prepareInstalledPlugins`）。
  - `project-deleted-owners.ts:14`、`:103`（`pluginBuilderProjectOwner`）。Home 里留下的 `plugin-builder/<项目>` 目录以后没人清；没有真实 Home，不写维护。
  - `web-project-platform-routes.ts:11`、`:114-126`（创作台唯一的 HTTP 入口）。
  - `web-goals-read.ts:1`、`:3`、`:37`、`:149`（侧栏和主区的生成插件条目）。
  - `schedule-reminders.ts:1`、`:8`、`:34-39`：提醒的 `describe()` 遇到 `agent-built:` 签名时去读创作台的版本库。这是 Schedule 每个项目都走的文件里的一条创作台分支。
  - 工作台：`immersive-shell.ts:103`、`plugin-catalog.ts:324`、`primitive-catalog.ts:16`、`scripts/client/tab-workspace.ts:53`（`data-installed-plugin`）、`settings-prompts.ts:49`。
- 合同里只为它留的：
  - `packages/contracts/src/services/agent-definitions.ts:26` 的 `origin: "generated"`，只有 `plugin-builder/prompts.ts:114` 写。删这个取值，要跑 `api:update`。
- 存储层只为它留的：`packages/storage` 的 `deleteSecretEntriesWithPrefix`（`file-secret-store.ts:580`，`index.ts:53` 导出），唯一的调用方是 `plugin-builder/project-data.ts`。
- **Schedule 的「定时操作」（`schedules.add`、`schedules.cancel`）也算这一类。** 提供方 `schedule.operations` 只在 `installed-plugin-host.ts:85` 登记，宿主的执行入口 `bindInstalledOperationCaller` 只有 `installed-plugin-host.ts:224` 调。创作台删了，这条路在生产里就走不到了：`runHostScheduledOperation` 的 `executor()` 一直返回空，管理入口什么都报不出来。
  - 建议一起删：`schedule-operations.ts` 的这三个函数；`schedule-runtime.ts:66-77` 的唤醒登记；Schedule 插件的 `operations.ts`、`operation-actions.ts`、`operation-management.ts`、`operation-ui.ts`；`tooling/gates/actions/host-actions.tsv` 里这两行；`docs/platform/PLUGIN-DEVELOPMENT.md:46` 那句。
  - 理由：它名义上给所有插件用，实际只给生成插件开了。哪个插件以后真要定时操作，就按「插件缺什么补进平台」，在 Runtime 平台上正式登记。
  - 这是 Schedule 的范围，归 ③ 定。
  - 提醒（`reminders.add`、`reminders.cancel`）不在这一类，见下一节。

### 2. 留：通用，别的路也在用

| 什么 | 别的谁在用 |
| --- | --- |
| `createPluginPlatform`（`plugin-platform.ts:119`） | Runtime 插件平台（`project-plugins.ts:133`）。`:84` 的注释把「生成插件的平台」写成 `home: null` 的例子，删时改注释；测试里也有不带 Home 的。 |
| Plugin Runtime 与监督器的安装、升级、`bundledGrants`、发行物 | Runtime 平台、Home 插件（`home-plugins.ts:151`）、`plugin-route-operations.ts:61`、`project-plugin-http.ts:54` |
| `plugin-callers.ts` 的 `issuePluginCaller`（S-15） | `plugin-host-services.ts:62`、`home-plugin-executor.ts:97` |
| `HostPluginCaller.declaration` | `agent-host-composition.ts:371`（`startAuthority` 读 Manifest） |
| Agent 定义登记（`agent-definitions.ts` 按安装登记、注销） | `plugin-instructions.ts:50`、`:62` |
| Schedule 的提醒（`reminders.add`、`reminders.cancel`） | 每个项目都登记（`project-host.ts:179`、`schedule-actions.ts:34-37`），任何宿主签发了调用者的插件都能调；`PLUGIN-DEVELOPMENT.md` 写给插件作者。今天只有生成插件和回放语料用，删创作台后没有使用者，但路是通的，留。 |
| `host-complete-text.ts` | 起草、知识、记忆、信息等 6 处 |
| `browser/locate.ts`、`host-endpoints.ts` | `browser-host.ts`、`web-server.ts` |
| 设计系统的通用小件（`escapeHtml`、图标、选择菜单、主题脚本） | 桌面壳、`home-plugin-page.ts` |
| 开发与第三方的安装路径：`plugin dev`（`plugin-development.ts`、`local-plugin-development.ts`）、`package-verification.ts`、`tooling/plugin-cli` | `tests/plugin-sample.e2e.test.ts` 等；这条路只跑宿主执行的插件，从不跑沙箱 |

### 3. 通用，但删了创作台以后生产里没人调：我的建议

| 什么 | 建议 | 理由与要做的 |
| --- | --- | --- |
| 沙箱：`packages/plugin-sandbox` 整包、合同 `platform/plugin-sandbox.ts`、`PluginDefinition` 与 `PluginInstanceRecord` 的 `execution`、Runtime 里只给沙箱的分支（代码回滚、`abandonInstall`、`discard_kept_data`、`supervisor.ts:549`）、宿主的 12 处 `execution === "sandbox"` 守卫 | 留 | 用户 10-18 定：插件待遇一样，「跑不跑沙箱」是按发布者签名区分的安装信任。所以沙箱是平台给第三方的信任边界，不是创作台的私路；`THIRD-PARTY-PLUGINS.md` 也计划复用。下面这些不经创作台也在测：`plugin-sandbox.test.ts`、`plugin-sandbox-network.test.ts`、`plugin-lifecycle-states.test.ts`、`bundled-plugin-grants.test.ts`、`security-invariants-plugin-project-database.test.ts`（S-46，L3 的沙箱项目库）、`security-invariants-urls.test.ts`，以及宿主守卫的那几个。 |
| 沙箱的项目库 `sandboxDatabase` | 留 | 是 `services.project_database` 的沙箱一侧，S-46 的拒绝测试不经创作台。BL-395 的行留着。删 BL-358 时，BL-395「依赖」一列的「要在 BL-358 之前做」改成「要在第一个能给沙箱插件开项目库的生产路径之前做（第三方安装、重做的创作台）」。 |
| `createHttpsProxy` | 留，记一句 | 现在就没有生产调用方（创作台用自己的 `network.ts`），是沙箱给第三方联网预备的。不在删除 PR 里动。 |
| 呈现组件 `ui.plugin-presentation`（设计系统的 `plugin-components.ts`、`plugin-presentation.ts`、`plugin-component-client.ts`，宿主 `plugin-platform.ts:153`、`home-plugins.ts:149` 两行声明） | 留，① 可改判 | 沙箱插件没有自己的客户端脚本，这是它出界面的唯一通道，第三方沙箱插件也要。删的话它是第一个候选：宿主只有两行，主要在设计系统。要注意 `tests/plugin-composition.test.ts` 同时导入了 `sandboxedPluginDefinition`，删创作台前要换成不经创作台的夹具，否则呈现校验就没人测了。 |

### 4. 安全不变量要跟着改的（真删时按当时的表再核）

- **S-15**：沙箱进程不能读写宿主文件、不能起子进程、不能直连网络。这几条断言在 `installed-plugin-execution.test.ts`、`installed-plugin-policy.test.ts` 里（只在 macOS 上跑），都经创作台。
  - 沙箱要留，就先把这些断言搬到直接调 `createSandboxRunner` 的夹具里，再删这两个文件。`installed-plugin-execution.test.ts:138`、`:202` 已经是直接调用，可以照着搬。
  - `agent-built-plugins-catalog.test.ts` 管的是创作台目录的权限交集，跟创作台一起走；删之前核一下，S-15 的通用交集还有没有别的测试在证明。
- **S-10**：`agent-built-plugins-network.test.ts` 管创作台自己的 `198.18.0.0/15` 例外，跟创作台一起删。
  - 「五处公网地址实现」变成四处，表的 §4 第 93 行跟着改。
  - `plugin-sandbox-network.test.ts` 留。
- **S-09**：「创作台验收浏览器」那一处和 `agent-built-plugins-components.test.ts` 一起删。
- `package.json` 的 `test:security` 里的 `agent-built-plugins-catalog`、`agent-built-plugins-network` 两项随文件删。
- 删掉或改动的 S 行写进 PR 正文。号码不回收，下一个空号照旧从 main 加在途 PR 里取。

### 5. 和 ② 手上的活有没有重叠

- C5（`feat/review-kinds`，PG-009 审查种类）会改这些文件，和删除清单不重叠：
  - contracts 的 `services/agent-host-reviews.ts`；
  - SDK 的 `manifest.ts`；
  - `horizontal/agent-host` 的 `reviews.ts`、`errors.ts`、`adapters/prologue-git.ts`；
  - `apps/local-host/src/plugin-callers.ts`，以及 `agent-host-composition.ts` 的四个审查入口。
- `alchemist-platform-plan.md` 顶部是 ② 对队列的逐项判断：S0b-1、BL-350、BL-351、BL-358 作废；S0a、S0b-2 留。

### ③ 对 ② 回答的处理（10-21）

- **Schedule 的定时操作（`schedules.add`、`schedules.cancel`）**：③ 定随创作台一起删。范围照 ② 列的：`schedule-operations.ts` 那三个函数、`schedule-runtime.ts` 的唤醒登记、Schedule 插件的 `operation*.ts` 四个文件、`host-actions.tsv` 两行、`PLUGIN-DEVELOPMENT.md` 那句。
  - 理由：生产里只有生成插件走这条路，它其实是宿主给创作台开的私路。以后哪个插件真要定时操作，按「插件缺什么补进平台」在 Runtime 平台上正式登记。
  - 真删时按当时的 main 再核一遍调用方。提醒 `reminders.*` 照 ② 的意见留着。
- **沙箱与 S-15**：照 ② 的意见，沙箱整包留着。S-15 的 Seatbelt 断言先搬到直接调 `createSandboxRunner` 的夹具里，再删 `installed-plugin-execution.test.ts`、`installed-plugin-policy.test.ts`，断言不放宽。S-10、S-09 的改法照 ② §4。
- **BL-358 作废、BL-395 改「依赖」**：#947 已移交 ⑤。删 BL-358 还要改另外 5 个文档里的指向：`PLUGIN-DEVELOPMENT.md:154`、`PLUGIN-PLATFORM.md:149`、`SECURITY-INVARIANTS.md:101`、`skills/molis-plugin-dev/host.md:27`、`plugin-project-database/spec.md` 第 3、148、157 行。⑤ 选加进 #947，第二个提交是 `e51d3156f`，`git grep BL-358` 已经是 0。
