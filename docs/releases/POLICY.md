# 版本与发布策略

Molis Work 只有一个产品版本，每次发布都带发布说明、CHANGELOG 和一份发布前检查清单（含各库版本表与真实 Home 的处理）。这份策略落实用户 2026-10-08 的决定（`specs/repository-anti-corruption/spec.md` §1「版本与发布策略」）：一个产品版本、下一版 0.3.0；根包、桌面端、Tauri 跟同一版本，内置插件 Manifest 跟宿主版本；工作区包保持私有 0.0.0。

- 每次发布做什么、按什么顺序：[CHECKLIST.md](CHECKLIST.md)。
- 改了什么：[CHANGELOG.md](CHANGELOG.md)（按版本）和 `v<版本>.md`（每个版本一篇发布说明）。
- 门禁：`node scripts/verify-release-versions.mjs`，CI 里跑（`.github/workflows/ci.yml` 的「Release versions agree」），构建 macOS 安装包前也跑（`apps/desktop/tooling/build-macos-release.sh`），推 tag 时加 `--tag`（`.github/workflows/release-macos.yml`）。

## 1. 一个产品版本和它的载体

产品版本写在根 `package.json` 的 `version`，现在是 0.2.0。别的地方要么等于它，要么明确不属于它：

| 载体 | 位置 | 规则 | 谁核对 |
| --- | --- | --- | --- |
| 根包 | `package.json` | 产品版本的唯一来源 | 脚本以它为准 |
| 桌面端、Tauri | `apps/desktop/src-tauri/tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 里的 `molis-work-desktop` | 等于产品版本 | 脚本 |
| 写在代码里的两处 | `apps/local-host/src/feed-source-runtime.ts` 的 `APP_VERSION`（Feed 的 User-Agent 与 `app.version`）、`horizontal/runtime-host/src/adapters/codex-app-server.ts` 的 `clientInfo.version` | 等于产品版本 | 脚本 |
| 发布说明与 CHANGELOG | `docs/releases/v<版本>.md`、`docs/releases/CHANGELOG.md` 里的 `[<版本>]` 一节 | 当前产品版本两者都有；CHANGELOG 第一节永远是 `[Unreleased]` | 脚本 |
| 工作区包 | 每个 `pnpm-workspace.yaml` 列出的包 | 私有，版本固定 0.0.0；它们不单独发布，随产品一起构建 | 脚本 |
| 内置插件 Manifest | `plugins/native/*/src/manifest.ts` 的 `version` | **目标**：等于产品版本（用户 2026-10-04 定「内置插件随宿主升级」，2026-10-08 定版本跟宿主）。**现状**：各自独立，从 1.0.0 到 1.50.0（Coding）不等。重置排在路线图的 W5-15（`specs/repository-anti-corruption/roadmap-2026-10-07.md`）；重置后把这一行加进脚本 | 重置前没有 |
| 各库的结构版本 | 见 [CHECKLIST.md](CHECKLIST.md) 的「各库版本表」 | 每个库自己一个数字，与产品版本无关；改库就升那个库的数字 | 脚本核对表与代码一致 |

不属于这份策略的版本：非内置插件（第三方、生成的）的 Manifest 版本由插件自己定；`examples/plugin-sample` 是示例插件，自己的 2.0.0 不是产品版本；`vendor/` 里的包版本跟上游。

## 2. 版本号怎么选

1.0.0 之前按 `0.次版本.补丁` 选，1.0.0 是单独的决定，不由这份策略触发。

- **次版本**（0.2.0 → 0.3.0）：发布里有下列任何一项。任一个库的结构版本变了（版本不符的库会被拒绝而不是就地升级，`packages/storage/src/sqlite-baseline.ts`，所以老 Home 要先维护，见检查清单第 4 节）；MCP 工具、CLI 参数、环境变量、Skill 名称、插件 Manifest 合同做了不兼容的改动；功能被移除；名称改了。
- **补丁**（0.3.0 → 0.3.1）：只修问题，不动任何一个库的版本，不动上面那些对外名称。
- 补丁发布仍然写 CHANGELOG 和发布说明，检查清单的各库版本表照常核对（应该没有变化）。

## 3. 什么时候改版本号

只在发布 PR 里改，别的 PR 不碰。两次发布之间，main 上的版本是最近一次发布的版本。

发布 PR 一次做完：改全部载体 → 把 CHANGELOG 的 `[Unreleased]` 改成 `[<版本>] - <日期>` 并另起一个空的 `[Unreleased]` → 写 `docs/releases/v<版本>.md` → 过检查清单 → 合并后在合并提交上打 tag `v<版本>`。

**同一个版本号会对应不同的构建。** main 上每个提交都叫最近一次发布的版本；安装器遇到版本相同、内容不同时会原子刷新（`docs/installation.md`「安装边界」），每次安装的 `release.json` 记下 `content_digest`（`apps/local-host/src/installer/home-release.ts`）。0.2.0 已经因此既指 2026-09-11 的 tag，也指之后装进开发机 Home 的两个差别很大的构建（2026-09-23 的安装版和 2026-10-07 用 e1cd4906 重装的构建，见 `specs/repository-anti-corruption/spec.md` §1 的 2026-10-07 各行）。所以：不是从 tag 构建的安装，只说「某提交的构建」，在维护记录里写提交与 `content_digest`，不说成某个版本。

## 4. 每次发布的材料

- **发布说明** `docs/releases/v<版本>.md`：概述、按主题的变化、架构与安装、**兼容与升级**、发布范围与验证（`v0.2.0.md` 的结构）。兼容与升级必须写清：哪些库的版本变了（从哪个数到哪个数）、旧 Home 要做什么（维护、备份、重建）、Runtime 要不要重新接入。发布范围与验证写真实的全量回归数字和没有验证的东西，已知失败逐条列出。
- **CHANGELOG** `docs/releases/CHANGELOG.md`：按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的写法，每个版本一节，条目按「升级须知（需要动手）、新增、变化、移除、修复」分组。发布说明讲故事，CHANGELOG 做可查的清单；两者不互相复制。
- **检查清单** [CHECKLIST.md](CHECKLIST.md)：每次发布复制进发布 PR 描述，逐项勾选。

## 5. 数据库版本与产品版本

产品版本不能告诉你一个 Home 能不能被某个构建打开，库版本才能。每个库只认一个当前版本，不符就拒绝（只有搜索索引这种可重建的派生库重建，角色库只拒绝更高的版本，MCP 授权文件读成空）；怎么记、记在哪、不符时怎样，都在检查清单的「各库版本表」里，并由脚本对照代码核对：改了某个库的版本而没改表、或新增了一个 `SqliteBaseline` 而没列进表，CI 都会失败。每个库、每类文件的 owner、备份与卸载规则在 [docs/system/HOME-DATA.md](../system/HOME-DATA.md)。

## 6. 现在还没有的

- 内置插件 Manifest 版本跟宿主版本（第 1 节，W5-15）。
- 产品里的备份与升级命令：现在备份是离线整份拷贝（`docs/installation.md`「离线备份与恢复边界」），库版本变了的发布靠发布者提供一次性维护流程（检查清单第 4 节）。
- 自动发布：`release-macos.yml` 只能手动触发；公开安装包需要 Developer ID 签名与 Apple 公证（`docs/installation.md`）。
