# REL-5 · M1 发行与第二台 Mac 验收

[执行目录](../../spec.md#release-batch) · [发行批总则](../release-batch.md#release-batch) · [上一批 REL-4](rel-4.md) · [执行规则](../execution-rules.md)

<a id="rel-5"></a>

## 给人讲清楚

这是第一个真正走出开发机、发给外部用户的正式版本 **M1（对齐 `POLICY.md` 首个对外版本 `1.0.0`）**，排在**第 [`90`](90.md) 批非服务端全路线收官、全仓数据库 Clean v1 `version: 1` 一次封板之后**发出——这样整个阶段 1～4 开发全程都能轻装上阵不背历史兼容迁移包袱，M1 一亮相等同功能完整、底座干净的 `1.0.0` 起跑线。

这一批把 [REL-1](rel-1.md)～[REL-4](rel-4.md) 备齐的 `.dmg` 安装包拿到**一台没装过 Xcode／Node 开发环境的干净第二台 Apple Silicon（`arm64`）Mac** 上从零真机走通：双击打开零拦截、随包精简原生工具（`molis-material` 等，零 626 MB 语音包下载）首次自检通过、中英日三语欢迎引导与快审外部连接可用、`75-B` 系统服务送入正常、`REL-3` 本机脱敏日志轮转／崩溃恢复／透明预览诊断包导出完好、`REL-4` 秒级库级副本升级彩排与一键退回上一版顺畅；随后经你当次最终确认切 `1.0.0` 正式版本号、封存首份对外金样 `golden-homes/1.0.0`，并在 `docs/system/CONTRACT-CHANGES.md` 正式登记合同与存储兼容起点。

## 交付与前置

- **阶段／类型**：发行；产品线（发布收官与 M1 `1.0.0` 首发）
- **需求来源**：[C 端就绪 M1][CEND]、[升级 U4～U6][UPG]、[版本与发布策略][POL]
- **前置／待决**：开工与最终切版本号／打 tag／发布由用户当次明确发令；前置等**第 [`90`](90.md) 批非服务端全路线收官与 Clean v1 封板**（含 [`44B`](44b.md)/[`44C`](44c.md)、[`57`](57.md)、[`91`](91.md)/[`91B`](91b.md)、[`104`](104.md)/[`105`](105.md)、[`106`～`111`](111.md) 与 [`112`](112.md) 全部合入）及 [REL-1](rel-1.md)～[REL-4](rel-4.md) 就绪（原待决第 18 项已于 `REL-1` 拍板快慢分流，`arm64` 单架构已于 `REL-2` 拍板）
- **可并行项**：无（M1 对外首发总闸）
- **UI 要求**：复用已确认交互（`zh`/`en`/`ja` 三语覆盖）；真机验收中若出现新界面差异先定样
- **粒度**：**发版前真机演练与 `1.0.0` 发布 PR**（动 `tooling/versions.json`、打 `v1.0.0` tag 与触发 `release-macos.yml` 均严格遵守仓库红线先经用户当次确认）。

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="rel-5-item-1"></a>`REL-5-1` · 无开发环境第二台 Apple Silicon Mac 全套真机验收与 M1（`1.0.0`）正式发行立标 | ① **干净第二台 `arm64` Mac 端到端真机实测**：验证 `.p8` 公证 `.dmg` 双击零拦截安装、首次启动原生组件自检（`molis-material` 含日文 OCR、`Computer Helper.app`、内嵌 Node、`node-pty`，零 `jelly-whisper`／626 MB 下载）、`zh`/`en`/`ja` 三语引导与空白分区 `Schedule` 默认启用、`REL-1` 快审外部服务登录、`75-B` macOS 服务菜单／快捷指令安全送入、`REL-3` 脱敏日志轮转／崩溃恢复／透明预览诊断包导出，以及已装版上 `U4` 签名包升级、`REL-4-B` 秒级库级 `U6` 副本演练与 `25-3` 回到上一版；② **发行档完整性与 `1.0.0` 正式立标**：经用户确认将 `tooling/versions.json` 切至 `1.0.0`（跑 `pnpm versions:generate`、`verify-release-versions.mjs` 与 `profile.mjs --profile release --check`），生成 `docs/releases/v1.0.0.md` 与 `CHANGELOG.md`，封存首份对外金样 `tests/fixtures/golden-homes/1.0.0` 并跑通金样回放，在外发同时于 `docs/system/CONTRACT-CHANGES.md` 正式登记合同过渡与存储连续升级起点（版本号、日期、提交与摘要） | 共用本批前置 |

<a id="review-2026-11-25"></a>

## 11-25 路线优化拍板（[决定 66](../decisions.md#decision-66)、[`112`](112.md)、`POLICY.md`）

- **排在第 `90` 批 Clean v1 封板之后发出，保阶段 3～4 全程零历史迁移包袱（2026-11-25 用户拍板）**：明确 M1 置于 `90` 收官之后，避免提前发 M1 导致阶段 3～4 开发被迫背负双版本兼容与迁移链。
- **对齐 `1.0.0` 首个对外版本号 ＋ 无开发环境干净 Apple Silicon 真机验收（2026-11-25 用户拍板）**：同步结清原待决第 18 项快慢分流与 `arm64` 单架构范围，封存 `golden-homes/1.0.0` 金样立下后续 `SRV` 与 `1.x` 兼容起点。

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进发行批 REL-5「M1 发行与第二台 Mac 验收」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个发布准备与立标 PR，由你这个主会话自己准备、派评审，并在任何修改 tooling/versions.json 版本号、打 git tag、改 CI 工作流或触发正式签名公证发布动作之前，严格停下先向我本人请示确认。交付、前置和边界以本批文件 specs/post-anticorruption-roadmap/reference/batches/rel-5.md 为准；它和这段对不上时以它为准，并顺手改正这段。

原需求（行为与验收以它们为准）：specs/archive/repository-anti-corruption/c-end-readiness.md；specs/upgrade-continuity/spec.md；docs/system/CONTRACT-CHANGES.md；docs/releases/POLICY.md；docs/releases/CHECKLIST.md

本批交付：
1. `REL-5-1` 无开发环境干净第二台 Apple Silicon（arm64）Mac 全套真机验收与 M1（1.0.0）正式发行立标（#rel-5-item-1）：前置必须已满足第 90 批非服务端全线收官与 Clean v1 封板以及 REL-1～REL-4；在无 Xcode/Node 开发环境的第二台 arm64 Mac 实测公证安装、瘦身随包组件自检（molis-material 等，零 626MB 语音包）、zh/en/ja 三语、快审连接登录、75-B 系统入口、REL-3 脱敏日志轮转／崩溃恢复／透明预览诊断包、U4～U6 秒级库级副本升级演练与回到上一版；经我确认切 1.0.0 版本号、过 profile.mjs --profile release --check、封存 tests/fixtures/golden-homes/1.0.0 金样并在 docs/system/CONTRACT-CHANGES.md 登记兼容起点。
```

[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[POL]: ../../../../docs/releases/POLICY.md
[UPG]: ../../../upgrade-continuity/spec.md
