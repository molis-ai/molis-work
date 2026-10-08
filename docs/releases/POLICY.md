# 版本与发布策略

状态：第 1、4、5 节落实用户 2026-10-08 的决定；第 2、3 节（次版本与补丁怎么选、版本只在发布 PR 里改）是起草时补的细则，用户的决定没有写到这一层，等用户确认；第 7 节是一个等用户决定的问题，决定之前不动内置插件的清单版本。

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
| 内置插件 Manifest | `plugins/native/*/src/manifest.ts` 的 `version` | **目标**：等于产品版本（用户 2026-10-04 定「内置插件随宿主升级」，2026-10-08 定版本跟宿主）。**现状**：各自独立，从 1.0.0 到 1.50.0（Coding）不等。重置排在路线图的 W5-15（`specs/repository-anti-corruption/roadmap-2026-10-07.md`），**但不能只改清单：已装过的 Home 里会停在旧代码上，先要用户决定怎么处理已有安装记录，见第 7 节**。重置后把「等于产品版本」这一行加进脚本 | 重置前没有 |
| 各库的结构版本 | 见 [CHECKLIST.md](CHECKLIST.md) 的「各库版本表」 | 每个库自己一个数字，与产品版本无关；改库就升那个库的数字 | 脚本核对表与代码一致 |

不属于这份策略的版本：非内置插件（第三方、生成的）的 Manifest 版本由插件自己定；`examples/plugin-sample` 是示例插件，自己的 2.0.0 不是产品版本；`vendor/` 里的包版本跟上游。

## 2. 版本号怎么选

1.0.0 之前按 `0.次版本.补丁` 选，1.0.0 是单独的决定，不由这份策略触发。

- **次版本**（0.2.0 → 0.3.0）：发布里有下列任何一项。任一个库的结构版本变了（版本不符的库会被拒绝而不是就地升级，`packages/storage/src/sqlite-baseline.ts`，所以老 Home 要先维护，见检查清单第 4 节）；MCP 工具、CLI 参数、环境变量、Skill 名称、插件 Manifest 合同做了不兼容的改动；功能被移除；名称改了。
- **补丁**（0.3.0 → 0.3.1）：只修问题，不动任何一个库的版本，不动上面那些对外名称。
- 补丁发布仍然写 CHANGELOG 和发布说明，检查清单的各库版本表照常核对（应该没有变化）。

## 3. 什么时候改版本号

只在发布 PR 里改，别的 PR 不碰。两次发布之间，main 上的版本是最近一次发布的版本。

发布 PR 一次做完：改全部载体 → 把 CHANGELOG 的 `[Unreleased]` 改成 `[<版本>] - <日期>` 并另起一个空的 `[Unreleased]` → 写 `docs/releases/v<版本>.md` → 过检查清单 → 合并后在合并提交上打 tag `v<版本>`，再在这个 tag 上手动运行发布工作流（`release-macos.yml` 只有 `workflow_dispatch`；选 tag 运行才会做 `--tag` 核对并发布 GitHub Release，选分支只构建并上传构建产物）。

**同一个版本号会对应不同的构建。** main 上每个提交都叫最近一次发布的版本；安装器遇到版本相同、内容不同时会原子刷新（`docs/installation.md`「安装边界」），每次安装的 `release.json` 记下 `content_digest`（`apps/local-host/src/installer/home-release.ts`）。0.2.0 已经因此既指 2026-09-11 的 tag，也指之后装进开发机 Home 的两个差别很大的构建（2026-09-23 的安装版和 2026-10-07 用 e1cd4906 重装的构建，见 `specs/repository-anti-corruption/spec.md` §1 的 2026-10-07 各行）。所以：不是从 tag 构建的安装，只说「某提交的构建」，在维护记录里写提交与 `content_digest`，不说成某个版本。

## 4. 每次发布的材料

- **发布说明** `docs/releases/v<版本>.md`：概述、按主题的变化、架构与安装、**兼容与升级**、发布范围与验证（`v0.2.0.md` 的结构）。兼容与升级必须写清：哪些库的版本变了（从哪个数到哪个数）、旧 Home 要做什么（维护、备份、重建）、Runtime 要不要重新接入。发布范围与验证写真实的全量回归数字和没有验证的东西，已知失败逐条列出。GitHub Release 的正文是工作流自动生成的（`generate_release_notes`），不是这篇发布说明，需要时在 Release 页面里放链接。
- **CHANGELOG** `docs/releases/CHANGELOG.md`：按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的写法，每个版本一节，条目按「升级须知（需要动手）、新增、变化、移除、修复」分组。发布说明讲故事，CHANGELOG 做可查的清单；两者不互相复制。
- **检查清单** [CHECKLIST.md](CHECKLIST.md)：每次发布复制进发布 PR 描述，逐项勾选。

## 5. 数据库版本与产品版本

产品版本不能告诉你一个 Home 能不能被某个构建打开，库版本才能。每个库只认一个当前版本，不符就拒绝（只有搜索索引这种可重建的派生库重建，角色库只拒绝更高的版本，MCP 授权文件读成空，密钥文件 `feed/secrets.json` 拒绝读取）；怎么记、记在哪、不符时怎样，都在检查清单的「各库版本表」里，并由脚本对照代码核对：改了某个库的版本而没改表、或新增了一个以 `SqliteBaseline` 常量声明的库而没列进表，CI 都会失败（脚本找不到的情况写在检查清单第 3 节）。每个库、每类文件的 owner、备份与卸载规则在 [docs/system/HOME-DATA.md](../system/HOME-DATA.md)。

## 6. 现在还没有的

- 内置插件 Manifest 版本跟宿主版本（第 1 节、第 7 节，W5-15）。
- 产品里的备份与升级命令：现在备份是离线整份拷贝（`docs/installation.md`「离线备份与恢复边界」），库版本变了的发布靠发布者提供一次性维护流程（检查清单第 4 节）。用户 2026-10-08 定了方向：离线快照命令 `molis-work home snapshot --to <目录>` 加覆盖所有登记库的「卸载并清除数据」，路线图 W5-16，依赖 W4-11 的统一库登记表；定时在线备份留给 C 端就绪方案（`docs/prompts/repository-anti-corruption.md` §4.19）。
- 自动发布：`release-macos.yml` 只能手动触发；公开安装包需要 Developer ID 签名与 Apple 公证（`docs/installation.md`）。

## 7. 内置插件清单版本重置（W5-15）：已有安装记录怎么处理，等用户决定

目标是内置插件的 Manifest 版本等于产品版本（下一版 0.3.0）。这些插件的清单版本现在是 1.2.0 到 1.50.0，已装过的 Home 里的安装记录是它们上次启动时的清单版本，也就比 0.3.0 高（没有读真实 Home 核对具体数字）。

**现状。** 读过代码，并用内存数据库跑过 `PluginSupervisor` 核对。

- 有安装记录的只有 `apps/local-host/src/project-plugins.ts:181-224` 交给监督器的 7 个内置插件：Characters、Shelf、Coding、Files、Diff、Git、TextStats（Characters 按用户 2026-10-08 的决定会并进宿主，第 4 波）。记录按项目存在 `projects/<project_id>/molis-work.db` 的 `plugin_runtime_installs` 表里（`packages/plugin-runtime/src/repository.ts:14`），已装版本的发行物存档在同库的 `plugin_runtime_release_artifacts`（`packages/plugin-runtime/src/release-artifacts.ts:30`）。别的内置插件走旧的装配，没有这种记录。
- Runtime 只向上跟：内置插件的清单版本更高时，启动把记录升到清单版本（`packages/plugin-runtime/src/index.ts:219-229`）。清单版本更低时既不降级，也不报错：
  1. 监督器不把更低的内置清单当作可直接使用的（`packages/plugin-runtime/src/supervisor.ts:488-492`），改去恢复已装版本的存档发行物（`:503-530`）。存档在，就用旧代码照常运行：记录版本不变，新代码不会跑，没有任何提示，`upgradeCandidates()` 也不列出它（更低的目标被跳过，`:337`）。存档不在，插件启动失败，错误码 `plugin_release_artifact_missing`（`:530`）。
  2. 把更低的清单直接交给 `PluginRuntime.install` 是 `plugin_upgrade_required`（`index.ts:230`）；升级接口要求目标高于当前（`index.ts:319-320`），回滚只给隔离的生成插件（`index.ts:309`）。
  3. 低版本的清单没法声明「可以从 1.44.0 升上来」：升级来源必须早于清单版本，否则清单本身不合法（`packages/contracts/src/platform/plugin-manifest.ts:145`）。
  4. 这一行为由 `tests/plugin-release-artifact.test.ts` 的「a bundled Manifest below the installed version is not followed」固定下来；改规则时换成新规则的用例，不要删。
- 私有数据按 `install_id` 存（`packages/plugin-runtime/src/private-storage.ts:51`），所以任何做法都必须保留原来的安装记录，不能卸载再重装，否则私有数据成了孤儿。
- 重置之后新写入的成果记的 `producer_plugin_version`（例如 `apps/local-host/src/shelf-actions.ts:67`）是较低的数字，已存的记录保持原值（`modules/artifacts/src/repository.ts:64`）。

**所以只改清单会怎样：** 全新的 Home 没有问题；开发机现有的 Home 里，这 7 个插件悄悄停在重置之前的旧代码上（存档在时），或者启动失败（存档不在时）。

**选项（没有选，等用户决定）。**

| 做法 | 做什么 | 代价 |
| --- | --- | --- |
| A. Runtime 双向跟宿主 | 改 Runtime：内置插件（`bundled`、同发布者签名）的清单版本与记录不同，就把记录改成清单版本，包括向下；`supervisor.ts` 的直接可用判断和 `upgradeCandidates` 跟着改。保留 `install_id`、授权按现有规则收敛 | 产品行为变化（Runtime 的合同），要新增用例；多一条永久的向下规则，只为这一次重置，而且旧版本宿主打开新 Home 时也会把记录改回自己带的版本 |
| B. 一次性真实 Home 维护 | 不改 Runtime。重置发布之前，对每个项目库里这 7 条记录（保留 `install_id`）改写向上跟时改的那几个字段（`index.ts:222-226`：`version`、`publisher_id`、`manifest_digest`、`selected_entrypoint`、`grants`、`updated_at`），摘要用新构建的 `pluginManifestDigest` 算；记录对上之后，监督器启动时自己存新版本的存档（`supervisor.ts:493-496`）；流程走检查清单第 4.3 节：停写、快照、拷贝上演练、真库应用、只读核对 | 要用户批准动真实 Home（项目库版本不变，但改的是 Runtime 自己的表）；绕过 Runtime 的校验手写；只对这类维护够得到的 Home 有效。用户 2026-10-08 定「不留兼容」窗口到第一个装到开发机外的版本为止，所以现在只有开发机的 Home 需要它 |
| C. 不重置 | 内置插件清单版本保持各自独立，或把产品版本定得高于所有清单（大于 1.50.0） | 与 2026-10-08 的决定（下一版 0.3.0、内置插件清单跟宿主版本）冲突 |

**决定之前：** 不把任何内置插件的清单版本改到低于它已有的安装记录；脚本现在不检查内置清单版本，选定做法后再加「等于产品版本」这一条。无论选哪个，重置那次发布要过检查清单第 4.5 节里「内置插件的安装记录版本等于清单版本」一项，确认旧代码没有被悄悄留用。
