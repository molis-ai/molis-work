# 版本与发布策略

状态：第 1、4、5 节落实用户 2026-10-08 的决定；第 2、3 节（次版本与补丁怎么选、版本只在发布 PR 里改）是起草时补的细则，用户的决定没有写到这一层，等用户确认；第 7 节是一个等用户决定的问题（内置插件清单跟宿主版本，Runtime 现在有两种情形不跟，一次性的降版本和之后反复出现的同版本改清单），决定之前不动内置插件的清单版本，改清单仍照现在的做法升它自己的版本。

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
| 内置插件 Manifest | `plugins/native/*/src/manifest.ts` 的 `version` | **目标**：等于产品版本（用户 2026-10-04 定「内置插件随宿主升级」，2026-10-08 定版本跟宿主）。**现状**：各自独立，从 1.0.0 到 1.50.0（Coding）不等，改了清单就升它自己的版本。重置排在路线图的 W5-15（`specs/repository-anti-corruption/roadmap-2026-10-07.md`），**但不能只改清单：Runtime 对内置插件只向上跟，目标会让它碰到两种它不跟的情形——清单版本比已有安装记录低（重置那一步），清单内容变了而版本没变（重置之后每个改了内置清单的 PR，因为版本只在发布 PR 里变）；两种都让已装过的 Home 悄悄停在旧代码上。先要用户决定怎么处理，见第 7 节**。决定落地后把「等于产品版本」这一行加进脚本 | 重置前没有 |
| 各库的结构版本 | 见 [CHECKLIST.md](CHECKLIST.md) 的「各库版本表」 | 每个库自己一个数字，与产品版本无关；改库就升那个库的数字 | 脚本核对表与代码一致 |

不属于这份策略的版本：非内置插件（第三方、生成的）的 Manifest 版本由插件自己定；`examples/plugin-sample` 是示例插件，自己的 2.0.0 不是产品版本；`vendor/` 里的包版本跟上游。

## 2. 版本号怎么选

1.0.0 之前按 `0.次版本.补丁` 选，1.0.0 是单独的决定，不由这份策略触发。

- **次版本**（0.2.0 → 0.3.0）：发布里有下列任何一项。任一个库的结构版本变了（版本不符的库会被拒绝而不是就地升级，`packages/storage/src/sqlite-baseline.ts`，所以老 Home 要先维护，见检查清单第 4 节）；MCP 工具、CLI 参数、环境变量、Skill 名称、插件 Manifest 合同做了不兼容的改动；功能被移除；名称改了。
- **补丁**（0.3.0 → 0.3.1）：只修问题，不动任何一个库的版本，不动上面那些对外名称。
- 补丁发布仍然写 CHANGELOG 和发布说明，检查清单的各库版本表照常核对（应该没有变化）。

## 3. 什么时候改版本号

只在发布 PR 里改，别的 PR 不碰。两次发布之间，main 上的版本是最近一次发布的版本。这条说的是产品版本；内置插件清单的版本在第 7 节决定之前仍各自独立，改清单就升它自己的版本（目标实现后两者合一，到时「版本只在发布 PR 里变」会让每个改内置清单的 PR 都是同版本不同摘要，Runtime 要先能处理，见第 7 节）。

发布 PR 一次做完：改全部载体 → 把 CHANGELOG 的 `[Unreleased]` 改成 `[<版本>] - <日期>` 并另起一个空的 `[Unreleased]` → 写 `docs/releases/v<版本>.md` → 过检查清单 → 合并后在合并提交上打 tag `v<版本>`，再在这个 tag 上手动运行发布工作流（`release-macos.yml` 只有 `workflow_dispatch`；选 tag 运行才会做 `--tag` 核对并发布 GitHub Release，选分支只构建并上传构建产物）。

**同一个版本号会对应不同的构建。** main 上每个提交都叫最近一次发布的版本；安装器遇到版本相同、内容不同时会原子刷新（`docs/installation.md`「安装边界」），每次安装的 `release.json` 记下 `content_digest`（`apps/local-host/src/installer/home-release.ts`）。0.2.0 已经因此既指 2026-09-11 的 tag，也指之后装进开发机 Home 的两个差别很大的构建（2026-09-23 的安装版和 2026-10-07 用 e1cd4906 重装的构建，见 `specs/repository-anti-corruption/spec.md` §1 的 2026-10-07 各行）。所以：不是从 tag 构建的安装，只说「某提交的构建」，在维护记录里写提交与 `content_digest`，不说成某个版本。

## 4. 每次发布的材料

- **发布说明** `docs/releases/v<版本>.md`：概述、按主题的变化、架构与安装、**兼容与升级**、发布范围与验证（`v0.2.0.md` 的结构）。兼容与升级必须写清：哪些库的版本变了（从哪个数到哪个数）、旧 Home 要做什么（维护、备份、重建）、Runtime 要不要重新接入。发布范围与验证写真实的全量回归数字和没有验证的东西，已知失败逐条列出。GitHub Release 的正文是工作流自动生成的（`generate_release_notes`），不是这篇发布说明，需要时在 Release 页面里放链接。
- **CHANGELOG** `docs/releases/CHANGELOG.md`：按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的写法，每个版本一节，条目按「升级须知（需要动手）、新增、变化、移除、修复」分组。发布说明讲故事，CHANGELOG 做可查的清单；两者不互相复制。
- **检查清单** [CHECKLIST.md](CHECKLIST.md)：每次发布复制进发布 PR 描述，逐项勾选。

## 5. 数据库版本与产品版本

产品版本不能告诉你一个 Home 能不能被某个构建打开，库版本才能。每个库只认一个当前版本，不符就拒绝（只有搜索索引这种可重建的派生库重建，角色库只拒绝更高的版本，MCP 授权文件读成空，密钥文件 `feed/secrets.json` 拒绝读取）；怎么记、记在哪、不符时怎样，都在检查清单的「各库版本表」里，并由脚本对照代码核对：改了某个库的版本而没改表、或新增了一个以 `SqliteBaseline` 常量声明的库而没列进表，CI 都会失败（脚本找不到的情况写在检查清单第 3 节）。每个库、每类文件的 owner、备份与卸载规则在 [docs/system/HOME-DATA.md](../system/HOME-DATA.md)。

## 6. 现在还没有的

- 内置插件 Manifest 版本跟宿主版本，以及 Runtime 对内置清单「版本更低」「同版本改了内容」两种情形的处理（第 1 节、第 7 节，W5-15）。
- 产品里的备份与升级命令：现在备份是离线整份拷贝（`docs/installation.md`「离线备份与恢复边界」），库版本变了的发布靠发布者提供一次性维护流程（检查清单第 4 节）。用户 2026-10-08 定了方向：离线快照命令 `molis-work home snapshot --to <目录>` 加覆盖所有登记库的「卸载并清除数据」，路线图 W5-16，依赖 W4-11 的统一库登记表；定时在线备份留给 C 端就绪方案（`docs/prompts/repository-anti-corruption.md` §4.19）。
- 自动发布：`release-macos.yml` 只能手动触发；公开安装包需要 Developer ID 签名与 Apple 公证（`docs/installation.md`）。

## 7. 内置插件清单版本跟宿主版本（W5-15）：Runtime 有两种情形不跟，等用户决定

目标是内置插件的 Manifest 版本等于产品版本（下一版 0.3.0），产品版本只在发布 PR 里变（第 3 节）。Runtime 对随宿主发布的内置插件（监督器条目标 `bundled`）只向上跟：记录版本低于清单版本，启动时把记录升到清单（`packages/plugin-runtime/src/index.ts:219-228`）。目标会让下面两种情形出现，Runtime 对它们都不跟，结果一样：已装过的 Home 悄悄停在旧代码上，或者插件启动失败。读过代码，下面每条 Runtime 行为都有 `tests/plugin-release-artifact.test.ts` 里的用例固定（见各条）。

**两种情形的共同背景。**

- 有安装记录的只有 `apps/local-host/src/project-plugins.ts:181-224` 交给监督器的 7 个内置插件：Characters、Shelf、Coding、Files、Diff、Git、TextStats（Characters 按用户 2026-10-08 的决定会并进宿主，第 4 波）。记录按项目存在 `projects/<project_id>/molis-work.db` 的 `plugin_runtime_installs` 表里（`packages/plugin-runtime/src/repository.ts:14`），每个版本与摘要的发行物存档在同库的 `plugin_runtime_release_artifacts`（`packages/plugin-runtime/src/release-artifacts.ts:30`，主键含 `manifest_digest`）。别的内置插件走旧的装配，没有这种记录。
- 清单的摘要覆盖整份 Manifest，不只是版本（`packages/plugin-runtime/src/identity.ts:5`）：动作、权限、成果类型、界面贡献，改任何一处摘要都变。
- 私有数据按 `install_id` 存（`packages/plugin-runtime/src/private-storage.ts:51`），所以任何做法都必须保留原来的安装记录，不能卸载再重装，否则私有数据成了孤儿。
- 用户 2026-10-04 的决定写的是内置插件「启动时把安装记录升到宿主的版本……不再恢复旧发行物」（`specs/repository-anti-corruption/spec.md` §1 该日期的一行）。#237 只做了版本更高这一种：监督器对「更高」才直接放行（`supervisor.ts:491-492`），其余情形仍恢复旧发行物。所以下面把 Runtime 也改成不恢复旧发行物的做法（A、E），算把那条决定补全到它没覆盖的情形，还是新增行为，由用户定。

**情形一：重置那一步（一次性）。** 已装过的 Home 里记录是它们上次启动时的清单版本（现在是 1.2.0 到 1.50.0，没有读真实 Home 核对具体数字），比 0.3.0 高。

- 清单版本更低时既不降级，也不报错。监督器不把更低的内置清单当作可直接使用的（`supervisor.ts:488-492`），改去恢复已装版本的存档发行物（`:503-530`）：存档在，就用旧代码照常运行，记录版本不变，新代码不会跑，没有任何提示，`upgradeCandidates()` 也不列出它（更低的目标被跳过，`:337`）；存档不在，插件启动失败，错误码 `plugin_release_artifact_missing`（`:530`）。
- 把更低的清单直接交给 `PluginRuntime.install` 是 `plugin_upgrade_required`（`index.ts:230`）；升级接口要求目标高于当前（`index.ts:319-320`），回滚只给隔离的生成插件（`index.ts:309`）。
- 低版本的清单没法声明「可以从 1.44.0 升上来」：升级来源必须早于清单版本，否则清单本身不合法（`packages/contracts/src/platform/plugin-manifest.ts:144-146`）。
- 用例「a bundled Manifest below the installed version is not followed」固定了这一行为。

**情形二：重置之后，每个改了内置清单的 PR（反复）。** 清单版本等于记录版本，摘要不同。

- 同版本时监督器要摘要相同，或清单声明了「可从本版本升上来」，才直接放行（`supervisor.ts:488-490`）；都不满足就和情形一一样去恢复记录里那个摘要的存档发行物（`:503-524`）：存档在，旧代码照常运行，记录不变，没有任何提示，新构建的存档也不会被存下，`upgradeCandidates()` 也不列出（同版本被跳过，`:337`）；存档不在，启动失败 `plugin_release_artifact_missing`。用例「a bundled Manifest changed without a new version is not followed」固定了这一行为。
- 直接交给 `PluginRuntime.install` 的话，同版本不同摘要是 `plugin_definition_conflict`，信息就是「请递增版本」（`index.ts:192-213`；升级接口也一样，`:316-318`）。用例「PluginRuntime.install refuses the same version with another Manifest」固定了这一行为。所以今天的规则是清单一变就升版本：Coding 的 `manifest.ts` 自 2026-09-19 有 50 个非合并提交，其中 39 个改了 `version:` 一行，现在是 1.50.0。版本只在发布 PR 里变之后，这条路就关上了。
- 谁会碰到：任何已经以同一版本跑过更早构建的 Home。用户 2026-10-07 定了维护后的真实 Home 用主检出的构建（`specs/repository-anti-corruption/spec.md` §1「维护后真实 Home 用哪份代码」一行），所以两次发布之间，开发机上凡是清单改过的那些内置插件（上面 7 个之中），会一直用着旧代码，直到有人手动处理；发布那次安装同样可能撞上（第 3 节：同一个版本号对应不同的构建）。
- 清单可以声明本版本为自己的兼容来源：`upgrade_compatibility.compatible_from_versions: ["0.3.0"]` 写在 0.3.0 的清单上是合法的（`plugin-manifest.ts:140-143`），有它监督器就放行，改过的清单的代码会运行，记录里的摘要保持第一次安装时的值，不更新（`index.ts:195-208`）。但只在授权不变时有效：清单多要或少要一项权限，启动失败 `plugin_state_invalid`（`index.ts:199-202`）。用例「a same-version declaration lets the changed build run」固定了这些。它帮不了情形一，因为低版本清单不能把更高的版本列成来源（情形一第三条，`plugin-manifest.ts:144-146`）。

**所以只改清单会怎样。**

- 降到 0.3.0：开发机现有 Home 里，这 7 个插件悄悄停在重置之前的旧代码上（存档在时），或者启动失败（存档不在时）。
- 重置之后：全新的 Home 第一次启动时没有记录，没有问题；但它之后每换到一个清单有改动的同版本构建，都会碰到情形二。「全新的 Home 没有问题」只在第一个改了内置清单的 PR 之前成立。
- 重置后新写入的成果记的 `producer_plugin_version`（例如 `apps/local-host/src/shelf-actions.ts:67`）是较低的数字，已存的记录保持原值（`modules/artifacts/src/repository.ts:64`）。

**选项（没有选，等用户决定）。** 先看每个做法对两种情形各管不管：

| 做法 | 做什么 | 情形一（降到 0.3.0） | 情形二（同版本改清单） | 代价 |
| --- | --- | --- | --- | --- |
| A. Runtime 对内置插件完全跟清单 | 改 Runtime：内置插件（`bundled`、同发布者签名）的清单与记录不同，不论版本更低、更高还是同版本摘要不同，都把记录改成清单（`version`、`publisher_id`、`manifest_digest`、`selected_entrypoint`、`grants`、`updated_at`；授权按现在向上跟的规则收敛），保留 `install_id`；`supervisor.ts` 的直接可用判断和 `upgradeCandidates` 跟着改；固定现状的用例（上面情形一、二里点名的）换成新规则 | 管 | 管 | 产品行为变化（Runtime 的合同）；多一条永久的向下规则，旧版本宿主打开新 Home 时会把记录改回自己带的版本；同版本改清单时新增的必需权限会像新装一样自动授予。记录由 Runtime 在启动时改，不需要手工动真实 Home |
| B. 只做一次性真实 Home 维护 | 不改 Runtime。重置发布之前，对每个项目库里这 7 条记录（保留 `install_id`）改写向上跟时改的字段（`index.ts:223-226`），摘要用新构建的 `pluginManifestDigest` 算；流程走检查清单第 4.3 节 | 管 | 不管：重置之后下一个改了内置清单的 PR 起，Home 又回到旧代码；要么再做一次维护，要么回到清单一变就升自己的版本，那清单版本就不再等于产品版本 | 要用户批准动真实 Home；绕过 Runtime 的校验手写；只对这类维护够得到的 Home 有效。用户 2026-10-08 定「不留兼容」窗口到第一个装到开发机外的版本为止，所以现在只有开发机的 Home 需要它 |
| C. 不重置 | 内置插件清单版本保持各自独立，清单一变就升自己的版本（今天的做法）；或把产品版本定得高于所有清单（大于 1.50.0） | 没有这一步 | 靠每次升版本，Runtime 向上跟 | 与 2026-10-08 的决定（下一版 0.3.0、内置插件清单跟宿主版本）冲突；第 1 节「内置插件 Manifest」一行要改成长期各自独立，产品版本与它们脱钩 |
| D. 同版本自我声明加一次性维护 | 在 7 个内置清单上写 `upgrade_compatibility.compatible_from_versions: ["<产品版本>"]`；情形一仍靠 B | 靠 B | 管，有限制 | 不改 Runtime。每次发布这 7 处要跟着改成新的产品版本，脚本要新增核对，忘改就悄悄失效；这是 #237 刚删掉的「可从哪些旧版本升上来」名单换个形式回来；清单多要或少要一项权限就启动失败，只能升版本或另做授权；记录里的摘要永远是第一次安装的，检查清单第 4.5 节的摘要比对对它不成立，要改成查存档表里有没有这个构建的（版本，摘要）一行（有声明时监督器放行并存档，用例里验证过）；加上 B 的全部代价 |
| E. Runtime 只补情形二，情形一用一次性维护 | 改 Runtime：内置插件同版本、摘要不同时，把记录改成清单（字段和 A 相同），不加向下规则；情形一靠 B | 靠 B | 管 | Runtime 合同变化，比 A 小，没有永久的向下规则；再加上 B 的全部代价（要用户批准动真实 Home） |

A 和 E 同时管两种情形，也不靠每次发布补手工。只有 A 把用户 2026-10-04 的「不再恢复旧发行物」在代码里补全到所有情形，也不需要手工动真实 Home；E 把降版本留给一次手工维护，Runtime 的改动小一些。B 单独只管情形一；D 加 B 管两种，但靠手工维护、清单里的名单和一条权限不变的限制；C 与 2026-10-08 的决定冲突。

**决定之前：**

- 不把任何内置插件的清单版本改到低于它已有的安装记录；
- 改内置插件清单仍按现在的做法升它自己的版本（Runtime 向上跟；`skills/molis-plugin-dev/SKILL.md` 第 17 条「发布新版本时递增 `version`」），不出现内容变了而版本没变（脚本不检查这一条）；
- 脚本现在不检查内置清单版本，选定做法后再加「等于产品版本」这一条；
- 发布检查清单第 1 节和第 4.5 节各有一项对应：第 1 节核对清单没有被降版本、没有内容变而版本不变；第 4.5 节核对安装记录的版本和摘要都等于这个构建的清单，选定的做法落地后按它改这一项。
