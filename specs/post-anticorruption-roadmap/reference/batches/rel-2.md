# REL-2 · 发行物：签名、公证与随包组件

[执行目录](../../spec.md#release-batch) · [发行批总则](../release-batch.md#release-batch) · [上一批 REL-1](rel-1.md) · [下一批 REL-3](rel-3.md) · [执行规则](../execution-rules.md)

<a id="rel-2"></a>

## 给人讲清楚

把能直接装到别人 **Apple Silicon（M 系列芯片，`arm64`）Mac** 上的轻量正式安装包打出来（M1 聚焦只发 `arm64`，砍掉老款 Intel `x64` 构建与双份公证负担；加上 `112-1` 已砍除 626 MB 语音包，安装包体积大幅瘦身）：

1. **逐件签名与 `.p8` 正式公证盖章（`REL-2-1`）**：修复现役 `release-macos.yml` 只认 `apple-id` 密码的限制，接通你在 `REL-1` 拍板的 **App Store Connect API 密钥（`.p8`）**公证分支；对主程序、内嵌 Node（剥除 `get-task-allow`）、`node-pty`、更名后的图文工具 **`molis-material`**（含日文 OCR）及整包 `Computer Helper.app` 逐件重签、公证钉票据并过 Gatekeeper 核验，补齐 `75-B` macOS 服务菜单与快捷指令声明。
2. **随包组件首次启动自检与坏件恢复（`REL-2-2`）**：复用已定样界面，首次打开检查随包原生工具完整可用，损坏时就地恢复。
3. **随包全部官方包正式签名＋开源商用字体核对（`REL-2-3`）**：把安装包自带的全部官方内容包（`plugins/content/*`、`packages/system-skills/`、`45`/`52` 三套起步场景包、`64-4` 初始技能、`68-C` 的 14 个角色样板插件以及 `82-A`/`82-B` Alchemist 与 CGS 七技能＋场景包）用正式官方发布者密钥签名，并核实内置 SIL OFL 字体与零字节系统日文字体栈合规分发。

## 交付与前置

- **阶段／类型**：发行；产品线（发布）；系统能力
- **需求来源**：[C 端就绪 M1][CEND]、[产品建议 A1～5／H14][P]
- **前置／待决**：开工由用户定；[26-9](26.md#batch-26-item-9) 的发行配置（`tooling/release/profile.mjs`）；真实签名与公证等 [`REL-1-1`](rel-1.md#rel-1-item-1)（未填入前先在 `arm64` 开发档 `ad-hoc` 走通全流程）；改 `.github/workflows/release-macos.yml` 前按仓库红线先向用户确认
- **可并行项**：[REL-3](rel-3.md)、[REL-4](rel-4.md)
- **UI 要求**：复用：安装与首次启动自检已定样（[docs/design/runtime-and-recovery](../../../../docs/design/runtime-and-recovery/README.md)，用户 2026-11-04 五题选 A），三语文案对齐 `#2307`
- **粒度**（用户 2026-11-25 拍板）：**全批 1 个独立 PR**（聚焦 `arm64` 单架构、接通 `.p8` `api-key` 公证分支、对齐 `112-1` 瘦身原生组件与全套随包官方包签名）。

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="rel-2-item-1"></a>`REL-2-1` · Apple Silicon（`arm64`）逐件签名、`.p8` API 密钥公证与桌面声明收口 | 聚焦 **`arm64` 单架构**（移除 `release-macos.yml` 老旧 `macos-15-intel` `x64` 矩阵，动 CI 工作流前先经用户确认），在 `tooling/release/profile.mjs` 与 `release-macos.yml` 补通 `notarization: "api-key"`（`.p8` + Key ID + Issuer ID）分支；对 Resources 内各 Mach-O 逐个重签（Node 24.15.x 剥除 `get-task-allow` 并配 JIT entitlements、`node-pty` 仅留 `arm64` `pty.node`+`spawn-helper`、**`molis-material`** 原生二进制、`Computer Helper.app` 按完整 `.app` bundle 签且 `--options runtime` 带安全时间戳；**不含已清零的 `better_sqlite3.node` 与 `112-1` 已删的 `jelly-whisper`**）；补齐 Apple Events 说明、`75-B` `NSServices` 服务菜单与 `App Intents` 快捷指令 `Info.plist` 声明，跑通公证、`stapler` 钉票据、`spctl` 评估与 `/api/platform/shelf` 核验（原 `26-1`） | [`111`](111.md)、[`112-1`](112.md#batch-112-item-1)、[`75-B`](75.md#batch-75-item-3)、`26-9`；真实公证等 `REL-1-1` |
| <a id="rel-2-item-2"></a>`REL-2-2` · 瘦身后原生组件随包预置与首次自检恢复 | 仅随包预置瘦身后的必需 `arm64` 原生组件（不含任何 626 MB 语音模型），首次启动自检完整性与可执行性，异常时按已定样就地引导恢复，开发机本地环境不受影响（原 `26-3`） | `25-1`（已合入）、[`112-1`](112.md#batch-112-item-1) |
| <a id="rel-2-item-3"></a>`REL-2-3` · 全套随包官方包正式签名与 OFL／三语字体分发核对 | 经 `tooling/release/pack-bundled.mjs` 将随安装包带上的全部官方包（`plugins/content/*`、`packages/system-skills/`、`45`/`52` 三套起步场景包、`64-4` 初始技能、`68-C` 的 14 个纯 UPP 角色样板插件以及 `82-A`/`82-B` Alchemist 与 CGS 七技能＋场景包）统一改用正式官方发布者密钥签名（密钥生成保管由用户本人办，工程给脚本与校验）；核实 F1 字体（`Inter Variable` + `Noto Sans SC 400/500/600` SIL OFL 许可文件随附）与 `#2307` `:lang(ja)` 零新增字节系统日文字体栈随包合规分发（从 `71-2` 拆出） | [`44B`](44b.md)、`26-9`、`45`、`52`、`64-4`、`68-C`、`82` |

<a id="review-2026-11-25"></a>

## 11-25 路线优化拍板（[决定 66](../decisions.md#decision-66)、[`112-1`](112.md)、`#2307`）

- **M1 聚焦只发 Apple Silicon（`arm64`）并接通 `.p8` `api-key` 公证（2026-11-25 用户拍板）**：砍除老旧 Intel `x64` 构建与双份原生／公证维护成本；修复现役 `release-macos.yml` 第 56 行硬编码只认 `apple-id` 密码的缺陷。
- **对齐 `112-1` 安装包大瘦身与全量官方包签名清单**：彻底剔除 `jelly-whisper` 与 626 MB 模型，仅签 `molis-material` 等精简组件并覆盖 `75-B` 系统入口声明；随包签名清单补全 `64-4`、`68-C` 14 样板与 `82-A`/`82-B`。

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进发行批 REL-2「发行物：签名、公证与随包组件」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/rel-2.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

发行批：我没明确说这一批开工之前，只做只读核查和设计（手册「发行批」）。发行用的配置统一走 26-9 的 tooling/release/profile.mjs，不在业务代码里另写；修改 .github/workflows/release-macos.yml、动凭据或真实账号前必须先问我确认。

原需求（行为与验收以它们为准）：specs/archive/repository-anti-corruption/c-end-readiness.md；docs/product-operations/产品优化建议.md；docs/releases/POLICY.md；docs/releases/CHECKLIST.md

本批交付：
1. `REL-2-1` Apple Silicon（arm64 单架构）逐件重签、App Store Connect .p8 api-key 公证分支接通、75-B NSServices/App Intents 声明与 stapler/spctl 核验（#rel-2-item-1）
2. `REL-2-2` 瘦身后 arm64 原生组件（molis-material、Computer Helper.app、Node、node-pty，零 jelly-whisper 与 626MB 模型）随包预置与首次自检恢复（#rel-2-item-2）
3. `REL-2-3` 全套随包官方包（含 system-skills、45/52 场景包、64-4 初始技能、68-C 14 样板与 82-A/82-B）正式密钥签名及 SIL OFL 字体＋零字节日文字体栈随包分发核对（#rel-2-item-3）

界面：安装与首次启动自检复用已定的样（docs/design/runtime-and-recovery/），同步支持 zh/en/ja 中英日三语，不重新出样。
```

[ASC]: ../../../assistant-service-connections/spec.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[P]: ../../../../docs/product-operations/产品优化建议.md
[UPG]: ../../../upgrade-continuity/spec.md
