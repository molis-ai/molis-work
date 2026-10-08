# 版本与发布策略

状态：全部节都已定。第 1、4、5 节落实用户 2026-10-08 的决定；第 2、3 节的细则与第 1 节「官方集成不跟产品版本」由用户 2026-10-08 弹窗确认；第 7 节用户 2026-10-08 选做法 A（Runtime 对内置插件一律跟当前构建），Runtime 一侧已实现（第 7.8 节）；还没做的是 0.3.0 发布 PR 里把 7 份清单的版本改成产品版本，和脚本里「内置清单等于产品版本」这一条。

Molis Work 只有一个产品版本，每次发布都带发布说明、CHANGELOG 和一份发布前检查清单（含各库版本表与真实 Home 的处理）。这份策略落实用户 2026-10-08 的决定（`specs/repository-anti-corruption/spec.md` §1「版本与发布策略」）：一个产品版本、下一版 0.3.0；根包、桌面端、Tauri 跟同一版本，内置插件 Manifest 跟宿主版本；工作区包保持私有 0.0.0。

- 每次发布做什么、按什么顺序：[CHECKLIST.md](CHECKLIST.md)。
- 改了什么：[CHANGELOG.md](CHANGELOG.md)（按版本）和 `v<版本>.md`（每个版本一篇发布说明）。
- 门禁：`node scripts/verify-release-versions.mjs`，CI 里跑（`.github/workflows/ci.yml` 的「Release versions agree」），构建 macOS 安装包前也跑（`apps/desktop/tooling/build-macos-release.sh`）；发布工作流（`.github/workflows/release-macos.yml`，现在只有手动触发）选 tag `v<版本>` 运行时再加 `--tag`。

## 1. 一个产品版本和它的载体

产品版本写在根 `package.json` 的 `version`，现在是 0.2.0。别的地方要么等于它，要么明确不属于它：

| 载体 | 位置 | 规则 | 谁核对 |
| --- | --- | --- | --- |
| 根包 | `package.json` | 产品版本的唯一来源 | 脚本以它为准 |
| 桌面端、Tauri | `apps/desktop/src-tauri/tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 里的 `molis-work-desktop` | 等于产品版本 | 脚本 |
| 写在代码里的两处 | `apps/local-host/src/feed-source-runtime.ts` 的 `APP_VERSION`（Feed 的 User-Agent 与 `app.version`）、`horizontal/runtime-host/src/adapters/codex-app-server.ts` 的 `clientInfo.version` | 等于产品版本 | 脚本 |
| 发布说明与 CHANGELOG | `docs/releases/v<版本>.md`、`docs/releases/CHANGELOG.md` 里的 `[<版本>]` 一节 | 当前产品版本两者都有；CHANGELOG 第一节永远是 `[Unreleased]` | 脚本 |
| 工作区包 | 每个 `pnpm-workspace.yaml` 列出的包 | 私有，版本固定 0.0.0；它们不单独发布，随产品一起构建 | 脚本 |
| 内置插件 Manifest | `plugins/native/*/src/manifest.ts` 的 `version` | **目标**：等于产品版本（用户 2026-10-04 定「内置插件随宿主升级」，2026-10-08 定版本跟宿主）。**现状**：各自独立，从 1.0.0 到 1.50.0（Coding）不等，约定是改了清单就升它自己的版本，但没有机制保证：main 上自 2026-09-26 起，这 7 个插件的清单摘要在版本不变时变了至少 24 次（到 `8118e617`，第 7.3 节）。重置排在路线图的 W5-15（`specs/repository-anti-corruption/roadmap-2026-10-07.md`）。Runtime 一侧已经不挡这一步：用户 2026-10-08 选了做法 A，内置插件（监督器条目标 `bundled`）不论清单版本比安装记录高、低，还是同版本改了内容，启动时都把记录改成当前构建的清单（第 7 节，实现见第 7.8 节），所以重置不会让已装过的 Home 停在旧代码上。还没做的：0.3.0 的发布 PR 把 7 份清单的 `version` 改成产品版本，并把「等于产品版本」这一行加进脚本 | 重置前没有 |
| 各库的结构版本 | 见 [CHECKLIST.md](CHECKLIST.md) 的「各库版本表」 | 每个库自己一个数字，与产品版本无关；改库就升那个库的数字 | 脚本核对表与代码一致 |

不属于这份策略的版本：非内置插件（第三方、生成的）的 Manifest 版本由插件自己定；`examples/plugin-sample` 是示例插件，自己的 2.0.0 不是产品版本；`vendor/` 里的包版本跟上游。官方集成（`plugins/official-integrations/*`：GitHub、Gmail、目录连接器、RSS、Web Query、YouTube）也不属于这份策略：内置插件指 `BUILTIN_PLUGIN_CATALOG` 里的条目（`docs/system/GLOSSARY.md` 第 3.2 节），官方集成另算，它们的 Manifest 版本（写在各自的 `src/index.ts` 里，现在 1.0.0 到 1.2.0）各自独立。它们没有持久的安装记录：`OfficialIntegrationRegistry`（`apps/local-host/src/official-integrations.ts`）为每个 Feed 来源在内存里装一个 Runtime（`MemoryPluginRuntimeRepository`），装进去的只有 GitHub、Gmail 和目录连接器，RSS、Web Query、YouTube 的 Manifest 现在没有任何调用把它们装进 Runtime；所以第 7 节的两种情形不会发生在它们身上。用户 2026-10-08 的决定没有说到它们，这个归类是起草时按上面的口径定的，等用户确认；要让它们也跟产品版本，就把它们并进上表「内置插件 Manifest」一行，并让脚本核对。

## 2. 版本号怎么选

1.0.0 之前按 `0.次版本.补丁` 选，1.0.0 是单独的决定，不由这份策略触发。

- **次版本**（0.2.0 → 0.3.0）：发布里有下列任何一项。任一个库的结构版本变了（版本不符的库会被拒绝而不是就地升级，`packages/storage/src/sqlite-baseline.ts`，所以老 Home 要先维护，见检查清单第 4 节；这个做法只到第一个装到开发机之外的版本为止，见第 5 节）；MCP 工具、CLI 参数、环境变量、Skill 名称、插件 Manifest 合同做了不兼容的改动；功能被移除；名称改了。
- **补丁**（0.3.0 → 0.3.1）：只修问题，不动任何一个库的版本，不动上面那些对外名称。
- 补丁发布仍然写 CHANGELOG 和发布说明，检查清单的各库版本表照常核对（应该没有变化）。

## 3. 什么时候改版本号

只在发布 PR 里改，别的 PR 不碰。两次发布之间，main 上的版本是最近一次发布的版本。这条说的是产品版本；内置插件清单的版本在 0.3.0 的发布 PR 把它们改成产品版本之前仍各自独立（改清单就升它自己的版本是约定，不再是必须：Runtime 对内置插件一律跟当前构建）。第 3 节和第 7 节一起定，用户 2026-10-08 两个都确认了（第 7.6 节）：内置清单等于产品版本之后，两次发布之间不会升版本，每个改了清单（或清单引进的定义）的合并都是一次「同版本不同摘要」（第 7 节的情形二）；这在 A 之前会让开发机的 Home 每次都停在旧代码上，A 之后下次启动就跟上。情形二在 A 之前因为漏升版本发生过至少 24 次（第 7.3 节）。第 7.5 节的选项 F 是第 3 节的另一种答案，没有选。

发布 PR 一次做完：改全部载体 → 把 CHANGELOG 的 `[Unreleased]` 改成 `[<版本>] - <日期>` 并另起一个空的 `[Unreleased]` → 写 `docs/releases/v<版本>.md` → 过检查清单 → 合并后在合并提交上打 tag `v<版本>`，再在这个 tag 上手动运行发布工作流（`release-macos.yml` 只有 `workflow_dispatch`；选 tag 运行才会做 `--tag` 核对并发布 GitHub Release，选分支只构建并上传构建产物）。

**同一个版本号会对应不同的构建。** main 上每个提交都叫最近一次发布的版本；安装器遇到版本相同、内容不同时会原子刷新（`docs/installation.md`「安装边界」），每次安装的 `release.json` 记下 `content_digest`（`apps/local-host/src/installer/home-release.ts`）。0.2.0 已经因此既指 2026-09-11 的 tag，也指之后装进开发机 Home 的两个差别很大的构建（2026-09-23 的安装版，和 2026-10-07 维护三时用 e1cd4906 的构建重装的那个，见 `specs/repository-anti-corruption/spec.md` §4.1「真实 Home 维护三已做」第 1、3 步）。所以：不是从 tag 构建的安装，只说「某提交的构建」，在维护记录里写提交与 `content_digest`，不说成某个版本。

## 4. 每次发布的材料

- **发布说明** `docs/releases/v<版本>.md`：概述、按主题的变化、架构与安装、**兼容与升级**、发布范围与验证（`v0.2.0.md` 的结构）。兼容与升级必须写清：哪些库的版本变了（从哪个数到哪个数）、旧 Home 要做什么（维护、备份、重建）、Runtime 要不要重新接入。发布范围与验证写真实的全量回归数字和没有验证的东西，已知失败逐条列出。GitHub Release 的正文是工作流自动生成的（`generate_release_notes`），不是这篇发布说明，需要时在 Release 页面里放链接。
- **CHANGELOG** `docs/releases/CHANGELOG.md`：按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的写法，每个版本一节，条目按「升级须知（需要动手）、新增、变化、移除、修复」分组。发布说明讲故事，CHANGELOG 做可查的清单；两者不互相复制。
- **检查清单** [CHECKLIST.md](CHECKLIST.md)：每次发布复制进发布 PR 描述，逐项勾选。

## 5. 数据库版本与产品版本

产品版本不能告诉你一个 Home 能不能被某个构建打开，库版本才能。每个库只认一个当前版本，不符就拒绝（只有搜索索引这种可重建的派生库重建，角色库只拒绝更高的版本，MCP 授权文件读成空，密钥文件 `feed/secrets.json` 拒绝读取）；怎么记、记在哪、不符时怎样，都在检查清单的「各库版本表」里，并由脚本对照代码核对：改了某个库的版本而没改表、或新增了一个以 `SqliteBaseline` 常量声明的库而没列进表，CI 都会失败（脚本找不到的情况写在检查清单第 3 节）。每个库、每类文件的 owner、备份与卸载规则在 [docs/system/HOME-DATA.md](../system/HOME-DATA.md)。这套「版本不符就拒绝、老 Home 先维护」只到第一个装到开发机之外的版本为止（用户 2026-10-08 的决定 #15，`specs/repository-anti-corruption/spec.md` §1）：发布那个版本的 PR 把起点写进 [docs/system/CONTRACT-CHANGES.md](../system/CONTRACT-CHANGES.md)（检查清单第 1 节第 2 项），从那以后库的版本变更要带升级路径，不再靠拒绝加一次性维护；升级机制现在还没有，方案见 `specs/repository-anti-corruption/c-end-readiness.md` §3.2（C-2）。

## 6. 现在还没有的

- 内置插件 Manifest 版本跟宿主版本（第 1 节、第 7 节，W5-15）。Runtime 对内置清单「版本更低」「同版本改了内容」两种情形的处理已经做了（第 7.8 节）；还没做的是 0.3.0 发布 PR 里把 7 份清单的版本改成产品版本，和脚本里「内置清单等于产品版本」这一条。
- 检查「内置清单摘要变了而版本没升」的机制：选了做法 A 以后不需要，不做（第 7.6 节第 3 条）：Runtime 对内置插件的任何摘要变化都跟。非内置的插件（装的、生成的）规则没变，仍靠版本号和 `upgrade_compatibility`。
- 产品里的备份与升级命令：现在备份是离线整份拷贝（`docs/installation.md`「离线备份与恢复边界」），库版本变了的发布靠发布者提供一次性维护流程（检查清单第 4 节）。用户 2026-10-08 定了方向：离线快照命令 `molis-work home snapshot --to <目录>` 加覆盖所有登记库的「卸载并清除数据」，路线图 W5-16，依赖 W4-11 的统一库登记表；定时在线备份留给 C 端就绪方案（`docs/prompts/repository-anti-corruption.md` §4.19）。
- 自动发布：`release-macos.yml` 只能手动触发；公开安装包需要 Developer ID 签名与 Apple 公证（`docs/installation.md`）。

## 7. 内置插件清单版本跟宿主版本（W5-15）：Runtime 一律跟当前构建（用户 2026-10-08 选做法 A，已实现）

目标是内置插件的 Manifest 版本等于产品版本（下一版 0.3.0）。做法 A 之前，Runtime 对随宿主发布的内置插件（监督器条目标 `bundled`）只向上跟：记录版本低于清单版本，启动时把记录升到清单（`PluginRuntime.install` 里 `input.bundled` 的分支）。下面两种情形它当时都不跟，结果一样：已装过的 Home 悄悄停在旧代码上，或者插件启动失败。**第 7.1 至 7.4 节写的是做 A 之前的行为**，是用户做决定的依据，原样保留；A 已经落地（第 7.8 节），那些行为现在只对非内置的插件成立。当时每条行为都有 `tests/plugin-release-artifact.test.ts` 里的用例固定，A 落地时内置插件的两条换成了新规则的用例（第 7.8 节）。这几节里的行号是 main 在 `4d59cd4d` 时的，Runtime 的代码已经改过；每处行号旁都写了函数名或常量名，以名字为准。

### 7.1 两种情形的共同背景

- 有安装记录的只有 `startPlatform`（`apps/local-host/src/project-plugins.ts`）交给监督器的 `entries`（`:182-225`）里的 7 个内置插件：Characters、Shelf、Coding、Files、Diff、Git、TextStats（Characters 按用户 2026-10-08 的决定会并进宿主，第 4 波）。记录按项目存在 `projects/<project_id>/molis-work.db` 的 `plugin_runtime_installs` 表里（`PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL`，`packages/plugin-runtime/src/repository.ts:14`），每个版本与摘要的发行物存档在同库的 `plugin_runtime_release_artifacts`（`PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL`，`packages/plugin-runtime/src/release-artifacts.ts:30`，主键含 `manifest_digest`，`:36`）。别的内置插件走旧的装配，没有这种记录。
- 清单的摘要覆盖整份 Manifest，不只是版本（`pluginManifestDigest`，`packages/plugin-runtime/src/identity.ts:5`）：动作、权限、成果类型、界面贡献，改任何一处摘要都变。清单里还嵌着从别处引进来的定义：每个清单的 `actions` 是插件里别的文件导出的动作表（Coding 是 `codingManifest` 的 `actions: [...CODING_ACTIONS, codingArtifactPreview]`，`plugins/native/coding/src/manifest.ts:108`），Coding 的 `capabilities.consumes` 由 contracts 的 `agentHostCapabilities`、`goalContextCapabilities`、`goalProgressCapabilities` 展开（同文件 `:60-62`）。所以不碰 `manifest.ts`，摘要也会变。
- 私有数据按 `install_id` 存（`SqlitePluginPrivateStorage.forPlugin` 按它读写 `plugin_private_values`，`packages/plugin-runtime/src/private-storage.ts:51`），所以任何做法都必须保留原来的安装记录，不能卸载再重装，否则私有数据成了孤儿。
- 用户 2026-10-04 的决定写的是内置插件「启动时把安装记录升到宿主的版本……不再恢复旧发行物」（`specs/repository-anti-corruption/spec.md` §1 该日期的一行）。#237 只做了版本更高这一种：监督器对「更高」才直接放行（`#resolveInstalledEntry` 的 `directlyUsable`，`supervisor.ts:491-492`），其余情形仍恢复旧发行物。所以下面把 Runtime 也改成不恢复旧发行物的做法（A、E），算把那条决定补全到它没覆盖的情形，还是新增行为，由用户定；用户选了 A，按补全办（第 7.6 节第 2 条）。
- 这 7 个插件在 v0.2.0 里还不存在（`git ls-tree v0.2.0 plugins/native/` 只有 artifacts、feed、goals、work），没有任何已发布的构建写过这些安装记录：现有的记录全部来自开发机上的构建。

### 7.2 情形一：重置那一步（一次性）——A 之前的行为

已装过的 Home 里记录是它们上次启动时的清单版本（现在是 1.2.0 到 1.50.0，没有读真实 Home 核对具体数字），比 0.3.0 高。记录版本 1.44.0、清单写 0.3.0 会怎样：不是降级，也不是拒绝。

- 清单版本更低时既不降级，也不拒绝这份清单。监督器（`#resolveInstalledEntry`）不把更低的内置清单当作可直接使用的（`directlyUsable`，`supervisor.ts:488-492`），改去恢复已装版本的存档发行物（同一函数，`:503-530`）：存档在，就用旧代码照常运行，记录版本不变，新代码不会跑，没有任何提示，`upgradeCandidates()` 也不列出它（循环里更低的目标被跳过，`:337`）；存档不在，插件启动失败，错误码 `plugin_release_artifact_missing`（`:530`）。
- 把更低的清单直接交给 `PluginRuntime.install` 是 `plugin_upgrade_required`（bundled 分支之后那道 `compatible_from_versions` 检查，`index.ts:230`）；升级接口 `changeVersion` 要求目标高于当前（`index.ts:319-320`），回滚只给隔离的生成插件（同一函数，`index.ts:309`）。
- 低版本的清单没法声明「可以从 1.44.0 升上来」：升级来源必须早于清单版本，否则清单本身不合法（`inspectUpgradeCompatibility`，`packages/contracts/src/platform/plugin-manifest.ts:144-146`）。
- 当时用例「a bundled Manifest below the installed version is not followed」固定了这一行为；A 落地时它换成了新规则的用例，旧行为现在由「a Manifest below the installed version is not followed for a plugin that is not bundled」固定，只对非内置的插件成立。

### 7.3 情形二：同版本、摘要不同——A 之前的行为，当时已经在发生

清单版本等于记录版本，摘要不同。

- 同版本时监督器要摘要相同，或清单声明了「可从本版本升上来」，才直接放行（`#resolveInstalledEntry` 的 `directlyUsable`，`supervisor.ts:488-490`）；都不满足就和情形一一样去恢复记录里那个摘要的存档发行物（同一函数，`:503-524`）：存档在，旧代码照常运行，记录不变，没有任何提示，新构建的存档也不会被存下，`upgradeCandidates()` 也不列出（循环里同版本被跳过，`:337`）；存档不在，启动失败 `plugin_release_artifact_missing`。当时用例「a bundled Manifest changed without a new version is not followed」固定了这一行为；A 落地时它换成了新规则的用例，旧行为现在由「a Manifest changed without a new version is not followed for a plugin that is not bundled」固定，只对非内置的插件成立。
- 直接交给 `PluginRuntime.install` 的话，同版本不同摘要是 `plugin_definition_conflict`，信息就是「请递增版本」（`install` 开头对同版本的检查，`index.ts:192-213`；升级接口 `changeVersion` 也一样，`:316-318`）。用例「PluginRuntime.install refuses the same version with another Manifest」固定了这一行为，对非内置的插件现在仍然成立（对 `bundled: true` 的安装不再：它跟当前构建）。今天防它的只有这条约定：改清单就升它自己的版本（`skills/molis-plugin-dev/SKILL.md` 第 17 条「发布新版本时递增 `version`」）。监督器启动不经过这条报错：它先在 `#resolveInstalledEntry` 里换成存档的旧发行物，或者报缺存档（上一条），到不了 `install`。

**这条约定没有被守住。** main 上每个合并 PR 的提交（首父提交）从 2026-09-26 的 `e065b000` 起逐个取源码，用第 4.5 节同一个摘要算法算 7 个清单（`pluginManifestDigest` 的算法；在已构建的主检出 `d81b12cb` 上，第 4.5 节的命令和这个办法给出同样的 7 个摘要；更早的提交这个办法载不进来）。版本不变而摘要变了的合并，到 `8118e617`（#308，2026-10-08）共 24 次（表里「起点前」指 `e065b000` 时已经是这个版本）：

| 插件 | 当前版本（升到它的合并） | 同版本摘要变化的合并（PR，日期） | 次数 |
| --- | --- | --- | --- |
| Characters | 1.6.0（#114，09-30） | 1.5.0 时 #98（09-30）；1.6.0 时 #204（10-03）、#228（10-04）、#237（10-04） | 4 |
| Shelf | 1.6.0（#118，09-30） | #201（10-03）、#237（10-04） | 2 |
| Coding | 1.50.0（#96，09-28） | #99（09-29）、#98（09-30）、#200（10-03）、#201（10-03）、#204（10-03）、#228（10-04）、#237（10-04）、#308（10-08） | 8 |
| Files | 1.5.0（#118，09-30） | 1.4.0 时 #99（09-29）；1.5.0 时 #201（10-03）、#237（10-04） | 3 |
| Diff | 1.4.0（起点前） | #201（10-03）、#237（10-04） | 2 |
| Git | 1.8.0（起点前） | #99（09-29）、#201（10-03）、#237（10-04） | 3 |
| TextStats | 1.2.0（起点前） | #201（10-03）、#237（10-04） | 2 |

只算了合并后的状态，合并里的中间提交没算，所以次数是下限。git 里能直接看到的几处：

- `c95e17e6`（#237，10-04）从 7 个监督器内置清单里都删了 `upgrade_compatibility`，没有一个改了 `version`（Characters 1.6.0、Shelf 1.6.0、Coding 1.50.0、Files 1.5.0、Diff 1.4.0、Git 1.8.0、TextStats 1.2.0）。
- `77e9e961`（#201，10-03）把 Coding、Diff、Files、Git、Shelf、TextStats 六份清单的 `artifacts` 改成 `process_items`，`version` 没动。
- `1222852f`（#204，10-03）给 Characters 和 Coding 的成果类型加了名字和预览，`version` 没动；`c9dd7521`（#200，10-03）改了 Coding 一条权限的说明文字，`version` 没动。
- 24 次里有 5 次 `manifest.ts` 一个字也没改，摘要却变了：Characters 和 Coding 在 #98 与 #228 那两次，Coding 在 #308（`git diff <上一个合并> <该合并> -- plugins/native/<插件>/src/manifest.ts` 为空）；变化来自清单引进的动作表和 contracts 里的能力表（第 7.1 节第二条）。#308 的摘要变在 `plugins/native/coding/src/route-actions.ts` 给 `coding.runs.start` 加了 `scheduling: "concurrent"`，这条动作在 Coding 清单的 `actions` 里；同一个合并改的 `packages/contracts/src/modules/goals.ts` 只动了类型（新接口和类型断言，运行时的能力表没变），不影响摘要。

这说明四件事：

- 「改清单就升版本」这条约定今天保护不了 Home：上面四处都是改了清单内容而没升版本，第四处连 `manifest.ts` 都没碰。
- 第 7.7 节的临时规则（改清单就升版本）今天没有任何机制保证。
- 比较 `manifest.ts` 的差异（`git diff <上个 tag> -- 'plugins/native/*/src/manifest.ts'`）抓不到引进来的变化，所以检查清单第 1 节比较的是构建出来的版本与摘要。
- 谁受影响：任何记录是更早的构建以当前版本写下的 Home。这 7 个插件在 v0.2.0 里还不存在（第 7.1 节），所以现在受影响的只有开发机上的 Home（真实 Home 与测试 Home）；它们的记录是 #237（10-04）之前的构建以当前版本写下的话，可能已经停在旧代码上（存档在）或启动失败（存档不在）。真实 Home 里到底是什么样，没有读过，要用户批准后在拷贝上查（第 7.6 节）。#237 之后只有 Coding 在 #308 变过一次：Characters、Shelf、Files、Diff、Git、TextStats 的记录，只要由 #237 或更晚的构建写下（或升到当前版本），摘要就是 `8118e617` 时的；Coding 的要 #308 或更晚的构建写下才是。

**第 3 节确认与否，决定它是偶尔的疏漏还是常态。**

- 重置之后，只装 tag 构建的 Home 不会碰到情形二：每次发布产品版本都升，内置清单跟着升，Runtime 向上跟。
- 开发机的 Home 用主检出的构建（用户 2026-10-07 定，`specs/repository-anti-corruption/spec.md` §1「维护后真实 Home 用哪份代码」一行），一个版本号下会有很多个不同的构建。第 3 节「版本只在发布 PR 里改」一旦确认，内置清单（目标是等于产品版本）在两次发布之间不会升版本，每个改了清单（或清单引进的定义）的合并都是一次情形二，开发机的 Home 每次都会停在旧代码上，直到下一次发布。不确认第 3 节、改成「清单摘要一变就升版本」，情形二就不由规则造成，但上面的历史说明光靠约定拦不住，要靠第 7.5 节的门禁。
- 所以第 3 节和第 7 节要一起定；第 7 节的选项 F 就是第 3 节的另一种答案。

清单可以声明本版本为自己的兼容来源：`upgrade_compatibility.compatible_from_versions: ["0.3.0"]` 写在 0.3.0 的清单上是合法的（`inspectUpgradeCompatibility`，`plugin-manifest.ts:140-143`），有它监督器就放行，改过的清单的代码会运行，记录里的摘要保持第一次安装时的值，不更新（`install` 里的 `compatibleSameVersion` 分支，`index.ts:195-208`）。但只在授权不变时有效：清单多要或少要一项权限，启动失败 `plugin_state_invalid`（同一分支里对 grants 的比较，`index.ts:199-202`）。用例「a same-version declaration lets the changed build run without touching the record」固定了这些。它帮不了情形一，因为低版本清单不能把更高的版本列成来源（第 7.2 节第三条，`inspectUpgradeCompatibility`，`plugin-manifest.ts:144-146`）。

### 7.4 所以只改清单会怎样（A 之前）

- 降到 0.3.0：开发机现有 Home 里，这 7 个插件悄悄停在重置之前的旧代码上（存档在时），或者启动失败（存档不在时）。
- 重置之后：全新的 Home 第一次启动时没有记录，没有问题；但它之后每换到一个清单有改动的同版本构建，都会碰到情形二。「全新的 Home 没有问题」只在第一个改了内置清单的合并之前成立。
- 重置后新写入的成果记的 `producer_plugin_version`（例如 `publishShelfMaterial` 写的 `producer.plugin_version`，`apps/local-host/src/shelf-actions.ts:67`）是较低的数字，已存的记录保持原值（该列的定义，`modules/artifacts/src/repository.ts:65`）。

### 7.5 选项（用户 2026-10-08 选 A，第 7.6 节）

先看每个做法对两种情形各管不管：

| 做法 | 做什么 | 情形一（降到 0.3.0） | 情形二（同版本改清单） | 代价 |
| --- | --- | --- | --- | --- |
| A. Runtime 对内置插件完全跟清单 | 改 Runtime：内置插件（`bundled`、同发布者签名）的清单与记录不同，不论版本更低、更高还是同版本摘要不同，都把记录改成清单（`version`、`publisher_id`、`manifest_digest`、`selected_entrypoint`、`grants`、`updated_at`；授权按现在向上跟的规则收敛），保留 `install_id`；`supervisor.ts` 的直接可用判断和 `upgradeCandidates` 跟着改；固定现状的用例（上面情形一、二里点名的）换成新规则 | 管 | 管，已经停在旧代码上的记录下次启动也跟上 | 产品行为变化（Runtime 的合同）；多一条永久的向下规则，旧版本宿主打开新 Home 时会把记录改回自己带的版本；同版本改清单时新增的必需权限会像新装一样自动授予。记录由 Runtime 在启动时改，不需要手工动真实 Home |
| B. 只做一次性真实 Home 维护 | 不改 Runtime。重置发布之前，对每个项目库里这 7 条记录（保留 `install_id`）改写向上跟时改的字段（`PluginRuntime.install` 里 `input.bundled` 分支改的那几个，`index.ts:223-226`），摘要用新构建的 `pluginManifestDigest` 算；流程走检查清单第 4.3 节 | 管 | 不管：重置之后下一个改了内置清单的合并起，Home 又回到旧代码；要么再做一次维护，要么回到清单一变就升自己的版本，那清单版本就不再等于产品版本 | 要用户批准动真实 Home；绕过 Runtime 的校验手写；只对这类维护够得到的 Home 有效。用户 2026-10-08 定「不留兼容」窗口到第一个装到开发机外的版本为止，所以现在只有开发机的 Home 需要它 |
| C. 不重置 | 内置插件清单版本保持各自独立，清单摘要一变就升自己的版本（今天的做法）；或把产品版本定得高于所有清单（大于 1.50.0） | 没有这一步 | 靠每次升版本，Runtime 向上跟。**前提是升版本真的做到：今天没有机制，历史上漏过至少 24 次，要靠第 7.5 节的门禁 G。** 下一次升版本也会让现在停在旧代码上的记录跟上 | 与 2026-10-08 的决定（下一版 0.3.0、内置插件清单跟宿主版本）冲突；第 1 节「内置插件 Manifest」一行要改成长期各自独立，产品版本与它们脱钩 |
| D. 同版本自我声明加一次性维护 | 在 7 个内置清单上写 `upgrade_compatibility.compatible_from_versions: ["<产品版本>"]`；情形一仍靠 B | 靠 B | 管，有限制 | 不改 Runtime。每次发布这 7 处要跟着改成新的产品版本，脚本要新增核对，忘改就悄悄失效；这是 #237 刚删掉的「可从哪些旧版本升上来」名单换个形式回来；清单多要或少要一项权限就启动失败，只能升版本或另做授权；记录里的摘要永远是第一次安装的，检查清单第 4.5 节的摘要比对对它不成立，要改成查存档表里有没有这个构建的（版本，摘要）一行（有声明时监督器放行并存档，用例里验证过）；加上 B 的全部代价 |
| E. Runtime 只补情形二，情形一用一次性维护 | 改 Runtime：内置插件同版本、摘要不同时，把记录改成清单（字段和 A 相同），不加向下规则；情形一靠 B | 靠 B | 管，已经停在旧代码上的记录下次启动也跟上 | Runtime 合同变化，比 A 小，没有永久的向下规则；再加上 B 的全部代价（要用户批准动真实 Home） |
| F. 产品版本在两次发布之间也动（预发布号） | 不改 Runtime。每个改了内置清单摘要的合并把产品版本升一格预发布号：下一版 0.3.0 之前是 `0.3.0-dev.1`、`-dev.2`……，发布 PR 去掉后缀成 `0.3.0`，发布后 main 接着是 `0.4.0-dev.0`；内置清单跟着产品版本。`comparePluginVersions` 排预发布（`plugin-manifest.ts:153-175`：`0.2.0 < 0.3.0-dev.1 < 0.3.0-dev.2 < 0.3.0 < 0.4.0-dev.0`，数字段按数值比），清单的 SemVer 校验允许预发布（`SEMVER` 定义在 `:30`，`parsePluginManifest` 在 `:44` 用它校验 `version`），现有的向上规则（`PluginRuntime.install` 里 `input.bundled` 的分支，`index.ts:219`）就会跟 | 不管：0.3.0 仍比记录低，要 A 或 B | 管，前提同 C：每次摘要变都要升，要靠门禁 G；下一次升版本也会让现在停在旧代码上的记录跟上 | 版本 churn：每个改内置清单摘要的合并要改 6 处载体（根包，加脚本 `CARRIERS` 列的 5 处：Tauri 配置、`Cargo.toml`、`Cargo.lock`、两处代码里的版本字符串）和 7 份清单的 `version`（除非改成从一个共同常量取），并发的合并在这些文件上必然冲突；脚本现在要求根版本有发布说明和 CHANGELOG 小节（`scripts/verify-release-versions.mjs` 的 `checkReleaseFiles`），预发布版本要豁免；`-dev.N` 版本号在安装器、Tauri 与 macOS 打包里的行为没有核对；每升一格，每个项目库的 `plugin_runtime_release_artifacts` 里每个内置插件多存一份完整的发行物源码；它让第 3 节「版本只在发布 PR 里改」不成立，要改第 3 节 |

A 和 E 同时管两种情形，也不靠每次发布补手工，还会让今天已经停在旧代码上的记录下次启动就跟上。只有 A 把用户 2026-10-04 的「不再恢复旧发行物」在代码里补全到所有情形，也不需要手工动真实 Home；E 把降版本留给一次手工维护，Runtime 的改动小一些。B 单独只管情形一；D 加 B 管两种，但靠手工维护、清单里的名单和一条权限不变的限制；C 与 2026-10-08 的决定冲突，F 不冲突但换来版本 churn，两者管情形二都靠门禁，F 的情形一还要 A 或 B。

**门禁 G（候选，没有实现；C 和 F 以及第 7.7 节的临时规则都靠它才不是一句约定）。** 把 7 个监督器内置插件的 `plugin_id`、`version`、摘要提交成一个锁文件（例如 `tooling/gates/builtin-manifests.lock.json`，和 `baseline.json` 同处）。CI 里一个测试在已构建的包上重算每个清单的摘要：

- 算出的值必须等于锁文件，所以改了清单、动作表或清单引进的 contracts 定义的合并，都必须同时更新锁文件，评审看得见；
- 与合并基底的锁文件比：同一个插件摘要变了而版本没变就失败（做法和现有健康门禁一致：基底和头部各算一次，不读被改过的基线，`.github/workflows/ci.yml` 的 Health gates 一步，`scripts/ci-health-base.mjs` 选基底）。

CI 的 `architecture-boundaries` 作业在 `pnpm test:contracts` 之前已经构建了包（`pnpm workspace:verify` 含 `workspace:build`），`tests/builtin-manifests-contract.test.ts` 已经在那一步里读 `BUILTIN_PLUGIN_CATALOG`，这 7 个清单都在其中（`apps/workbench/src/builtin-plugins.ts` 的 `:198-378` 之间），测试可以放在一起。它管不到的：不经这 7 个监督器条目的内置插件（旧装配）、非内置插件。成本：每个改清单的合并多改一个锁文件，并发的合并会在它上面冲突；Characters 并进宿主后删一行。它不替用户做 A 到 F 的选择，只解决「摘要变了版本没升」会被悄悄放过的问题。

选定以后，0.3.0 的发布 PR 的顺序：

- A 或 E：先单独合 Runtime 的改动，把固定现状的两个用例换成新规则的（用例注释要求不要只删）；再在发布 PR 里把 7 份清单的 `version` 改成 0.3.0，脚本加「内置清单版本等于产品版本」；E 另按 B 对真实 Home 做一次维护。（选了 A，第一步已做，第 7.8 节。）
- B：发布 PR 之前先做一次真实 Home 维护（检查清单第 4.3 节：先在拷贝上演练），再重置并发布。
- C 或 F：发布 PR 不重置清单版本；F 另改第 3 节和脚本，两者都先落地门禁 G。
- D：B 加上 7 份清单的自我声明。

### 7.6 用户的决定（2026-10-08，弹窗）

1. 第 2、3 节确认（次版本与补丁的选法；产品版本只在发布 PR 里改）。
2. 第 7.5 节选 **A**：Runtime 对内置插件（`bundled`、同发布者）一律跟当前构建的清单，不论版本更高、更低还是同版本摘要不同，保留 `install_id` 与私有数据。它把 2026-10-04「内置插件随宿主升级、不再恢复旧发行物」补全到所有情形；今天已经停在旧代码上的记录下次启动就跟上，不需要手工维护真实 Home。
3. 门禁 G：选了 A 以后不需要（任何摘要变化 Runtime 都跟），不做。
4. 0.3.0 的发布 PR 不再各升一格：A 先单独合入（已实现，第 7.8 节），发布 PR 再把 7 份清单的 `version` 改成 0.3.0，并在 `scripts/verify-release-versions.mjs` 加「内置清单版本等于产品版本」。
5. 真实 Home 拷贝上的只读查询：选了 A 以后不是决定的前提，不单独做；A 落地后的第一次启动照检查清单第 4.5 节核对记录已跟上。

### 7.7 A 落地之前（发生过什么）

A 已经落地（第 7.8 节），下面是落地之前的临时规则，保留作记录，现在都不再适用：

- 不把任何内置插件的清单版本改到低于它已有的安装记录；也不重置。
- 改内置插件清单（或清单引进的动作表、能力表）的合并，按现在的做法升该插件自己的版本，Runtime 向上跟；这是约定，不是机制（第 7.3 节），所以发布时再用检查清单第 1 节的摘要比较兜一次。
- 0.3.0 没有可比的上一版（v0.2.0 里没有这 7 个插件，第 7.1 节），而第 7.3 节的表说明每个插件在当前版本下都变过至少两次摘要，也就是任何一份以当前版本写下的记录都可能带着旧摘要：0.3.0 的发布 PR 把 7 份清单的 `version` 各升一格（例如 Coding 1.51.0、Files 1.6.0），Runtime 的向上规则会让所有记录下次启动就跟上，不改 Runtime，也不降任何版本。用户选了 A（第 7.6 节），所以这一条只在 A 合入之前、又必须发版时才用。发布后在开发机的 Home 上做第 4.5 节的核对，不能跳过。
- 脚本现在不检查内置清单版本，选定做法后再加「等于产品版本」这一条（或门禁 G）。
- 发布检查清单第 1 节和第 4.5 节各有一项对应：第 1 节比较构建出来的清单摘要与版本；第 4.5 节核对安装记录的版本和摘要都等于这个构建的清单，选定的做法落地后按它改这一项。

### 7.8 A 的实现（已落地）

用户 2026-10-08 选的做法 A，在 `packages/plugin-runtime` 里做完；`apps/local-host` 不用改（`project-plugins.ts` 交给监督器的 7 个条目本来就标了 `bundled: true`）。

- **做什么。** 内置插件（监督器条目标 `bundled`，Runtime 的 `install` 带 `bundled: true`）启动时，只要它的安装记录（同一 `install_id`，也就是同一 `plugin_id` 加同一发布者签名，状态不是已卸载）和当前构建的清单不同，不论版本更高、更低，还是同版本摘要不同，就把记录改成当前构建的：`version`、`publisher_id`、`manifest_digest`、`selected_entrypoint`、`grants`、`updated_at`。判断是 `recordToFollow`，改写是 `followBundledBuild`（都在 `packages/plugin-runtime/src/install-rules.ts`，`PluginRuntime.install` 调用）。记录的其余字段不动：`install_id`、`installation_generation`、`state`、`installed_at`、`retain_private_data`、`recovery_count`，所以私有数据、事件订阅、持久任务仍绑在这次安装上，不是卸载再重装。部署环境仍不能借启动改变（`plugin_state_invalid`），执行信任边界也不能变（`plugin_definition_conflict`），和以前一样。
- **授权。** 一条规则，三个方向都用：记录里新清单仍声明的授权保留，新清单的必需权限补上，新清单不再声明的去掉；条目自己的 `grants` 和清单的 `upgrade_compatibility` 都不看。这是 #237 的向上跟一直用的规则。所以同版本改清单时新增的必需权限会像新装一样自动授予，不再是启动失败 `plugin_state_invalid`；这是 A 的已知代价（第 7.5 节表）。
- **监督器。** `directlyUsable`（同一个文件，`#resolveInstalledEntry` 调用）对 `bundled` 条目恒为真：不再去恢复任何存档发行物，不管是旧版本的还是旧摘要的，存档不在也不再是 `plugin_release_artifact_missing`。当前构建的发行物照旧在启动时写进 `plugin_runtime_release_artifacts`，所以记录自己的（版本，摘要）在表里总有一行（Schedule 提醒按它取插件的标题）。`upgradeCandidates()` 不列 `bundled` 条目：它们启动时就跟上了，市场没有要确认的。
- **没有变的。** 非内置的插件（装的、生成的）规则一字没改：版本更低、版本更高但没有声明来源、同版本不同摘要，Runtime 仍分别以 `plugin_upgrade_required`、`plugin_upgrade_required`、`plugin_definition_conflict` 拒绝，监督器仍恢复存档的发行物，存档不在时 `plugin_release_artifact_missing`；同版本声明自己为来源仍只让改过的构建运行而不动记录。已卸载的记录也没有变：它不是「跟」，是确认安装，保留数据时「只向上」的限制照旧（`keptDataRefusal`，`tests/plugin-lifecycle-states.test.ts`）。代码里没有任何路径对这 7 个内置插件调 `runtime.uninstall`（只有官方集成、插件开发和装进来的插件调它），所以今天碰不到这条边界；哪天内置插件能被卸载，重装时的保留数据规则要再定。
- **不做迁移。** 跟的时候不调插件的 `validateUpgrade`，也不捕获和恢复私有数据；这和 #237 的向上跟一样。降到 0.3.0 之后，插件要读得懂更高版本的构建写下的私有数据。
- **代价。** 同第 7.5 节表里 A 一行：多一条永久的向下规则，旧版本宿主打开新 Home 时会把记录改回自己带的版本。
- **用例。** `tests/plugin-release-artifact.test.ts`：「a bundled Manifest below the installed version is followed …」「a bundled Manifest changed without a new version is followed …」换下了固定旧规则的两条；另有往返、三个方向的授权收敛、同版本声明对内置插件无效且新增必需权限照授予、`PluginRuntime.install` 本身、部署环境不变、内置插件不进市场更新列表；非内置插件的旧行为由原来两条的原文（去掉 `bundled`）和一条新的拒绝用例固定。`tests/plugin-upgrades.test.ts`：真实项目启动路径（7 个条目、真实发行物）下，安装记录高于构建、或同版本不同清单，都在启动时跟上。
- **还剩的。** 0.3.0 的发布 PR：7 份清单的 `version` 改成产品版本；`scripts/verify-release-versions.mjs` 加「内置清单版本等于产品版本」；发布后在开发机的 Home 上照检查清单第 4.5 节核对记录已跟上。内置插件作者「改了清单要升版本」的约定（`skills/molis-plugin-dev`）在清单版本等于产品版本之后也该一并改，这一条留给那个发布 PR。
