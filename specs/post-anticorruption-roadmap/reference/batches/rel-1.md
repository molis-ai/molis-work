# REL-1 · 外部资格与凭据

[执行目录](../../spec.md#release-batch) · [发行批总则](../release-batch.md#release-batch) · [下一批 REL-2](rel-2.md) · [执行规则](../execution-rules.md)

<a id="rel-1"></a>

## 给人讲清楚

对外把安装包发给别人的 Mac 使用之前，有一批必须去苹果和外部平台后台办手续、等审核的事。这一批按**「快慢分流、绝不让长周期审核卡死 M1 首发」**的原则排清先后，工程能起草的材料（官网隐私政策、服务条款、审核说明）先备齐，办好的凭据只填进 [26-9](26.md#batch-26-item-9) 收拢的发行配置引用位置（GitHub Secrets、Cloudflare Worker `OAUTH_APP_*`），不改业务代码：

1. **M1 首发必过硬门槛（几天内可就绪）**：有效的 Apple Developer 证书 ＋ **App Store Connect API 密钥（`.p8`，不绑个人密码）**公证凭据；公司官网产品页、写明「OAuth 数据只存本机、不经云端落库」的隐私政策与服务条款；**免审／快审核心外部服务**（**细粒度 GitHub App**［供 Feed 通知与 `67-1A` Coding 推分支／开 PR／回评论共用，用户可只勾指定仓库，避免一刀切索取全部私有库写权限］、Notion、Linear、飞书自建应用等）；以及自研 `@prologue/sdk` 随安装包再分发的内部授权落档。
2. **后台并行推进、不阻塞 M1 发包的长周期审核**：Google Gmail／Drive 受限权限与 CASA 安全评估、Slack Marketplace 10 工作区上架审核、微软 Partner 发布者验证等耗时几周至数月的外部审核并行提交——M1 期间用户仍可通过 MCP、自有密钥或局部文件选择接入，外部哪家审过就在云端经纪 Worker 开哪家，无需重发桌面安装包。

## 交付与前置

- **阶段／类型**：发行；产品线（发布、外部凭据与合规）
- **需求来源**：[C 端就绪 M1][CEND]、[服务接入 §8.1][ASC]、[产品建议 A1～5][P]
- **前置／待决**：开工由用户定（[发行批总则](../release-batch.md#release-batch)），不等任何开发批，外部等待可随时先行启动；**2026-11-25 用户已拍板结清原待决第 18 项（M1 外部服务快慢分流）及公证 `.p8` API 密钥＋细粒度 GitHub App 选型**，仅剩发布法律主体名称与 Google CASA 付费意愿由用户在实际提审时定夺
- **可并行项**：与 [REL-2](rel-2.md)～[REL-4](rel-4.md) 互不等待
- **UI 要求**：无新增界面（正式授权沿 `13`／`62-1B` 既有连接页与三语提示）

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="rel-1-item-1"></a>`REL-1-1` · Apple Developer 签名证书与 `.p8` 公证 API 密钥 | 核有效 Apple Developer 会员与 Team ID，导出 `Developer ID Application` `.p12` 证书，生成 **App Store Connect API 密钥（`.p8` + Key ID + Issuer ID，替代个人 Apple ID 专用密码）**，填入 `26-9` 发行配置引用的 GitHub Secrets（原 `26-1` 外部部分） | 用户本人办理 |
| <a id="rel-1-item-2"></a>`REL-1-2` · 公开产品页、OAuth 隐私政策、服务条款与域名验证 | 工程起草写明「本机优先存储、令牌经 `auth.molis.ai` 中转不落库、Google Limited Use 与数据删除方式」的应用隐私政策与服务条款；用户定法律主体并发布至 `molis.ai`，完成域名 DNS 验证 | 法律主体由用户定 |
| <a id="rel-1-item-3"></a>`REL-1-3` · 正式外部连接应用（快慢分流，长审不卡 M1） | **M1 首发快审组**：配置**细粒度 GitHub App**（按仓库最小权限同时满足 Feed 通知与 `67-1A` Coding 推送／PR／评论，替代宽泛 OAuth `repo`）、Notion、Linear 及飞书自建应用，部署最新 `molis-oauth` Worker 并填入 `OAUTH_APP_*`。**并行长审组（不阻塞 `REL-5` 发包）**：Google Calendar／Gmail／Drive（CASA 评估或 `drive.file` 收窄）、Microsoft 发布者验证、Slack Marketplace、Figma 等按服务独立推进，审过一家在经纪服务启用一家 | `REL-1-2`；各服务仅挡自身正式托管一键登录，不挡 M1 安装包与 MCP／自有凭据路径 |
| <a id="rel-1-item-4"></a>`REL-1-4` · 自研 `@prologue/sdk` 随安装包再分发内部授权落档 | 作为 `molis-ai` 自家双仓组件，由用户确认并在发布档案中留存 `@prologue/sdk` 随桌面安装包再分发的明确许可记录（结清 `c-end-readiness.md` §6 第 1 条） | 用户本人确认落档 |

<a id="rel-1-audit"></a>

## 核账与 2026-11-25 架构／策略校准

- **随包原生组件清单校准（对齐 [`44B`](44b.md)、[`112-1`](112.md#batch-112-item-1) 与 [`75-B`](75.md#batch-75-item-3)）**：
  - `better_sqlite3.node` 已随 `44B` 删除旧 Alchemist 彻底清零；
  - **`jelly-whisper` 音视频转写二进制及 626 MB WhisperKit 模型已随 `112-1` 彻底删除**，原 `jelly-material` 已更名为 **`molis-material`**（含日文 `ja-JP` OCR）；
  - 因此正式需要 Developer ID 签名与公证核验的随包原生组件精确收敛为：Tauri 主程序、内嵌 Node 24.15.x（去掉 `get-task-allow`）、`node-pty`（`pty.node` + `spawn-helper`，裁去非目标架构）、原生图文提取工具 **`molis-material`**、`Molis Work Computer Helper.app`（按完整 bundle 签），并在 `Info.plist`／entitlements 中同步涵盖 Apple Events 说明及 **`75-B` macOS `NSServices` 服务菜单与 `App Intents` 快捷指令**声明。
- **2026-11-25 用户已拍板决定（结清原待决第 18 项核心方向）**：
  1. **M1 外部服务快慢分流**：M1 首发只要求苹果签名公证、官网隐私条款及免审／快审核心服务（GitHub、Notion、Linear 等）就绪；Google CASA 年审、Slack 10 周审核等长周期流程并行推进、审过即在云端经纪解锁，绝不卡住 `REL-5` 首发。
  2. **公证与 GitHub 凭据升级**：苹果公证统一优先采用 **App Store Connect API 密钥（`.p8`）**；GitHub 统一采用**细粒度 GitHub App**（用户可按仓库勾选授权，兼顾 `67-1A` Coding PR 闭环与最小权限安全）。

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进发行批 REL-1「外部资格与凭据」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/rel-1.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

发行批：我没明确说这一批开工之前，只做只读核查、文档起草和准备步骤（手册「发行批」）。发行用的配置只改 26-9 收拢的那一份发行配置，不在业务代码里另写；要改 CI 工作流、动凭据或真实账号，先问我。

原需求（行为与验收以它们为准）：specs/archive/repository-anti-corruption/c-end-readiness.md；specs/assistant-service-connections/spec.md；docs/product-operations/产品优化建议.md

本批交付：
1. `REL-1-1` Apple Developer 签名证书与 App Store Connect `.p8` API 公证密钥准备指引与配置接缝（#rel-1-item-1）
2. `REL-1-2` 公开产品页、覆盖 OAuth 本机存储与 Limited Use 的隐私政策与服务条款起草（#rel-1-item-2）
3. `REL-1-3` 快慢分流正式连接应用准备：细粒度 GitHub App（兼顾 Feed 与 67-1A Coding PR）、Notion、Linear 等快审项进 M1，Google CASA／Slack 等长审项并行不卡发包（#rel-1-item-3）
4. `REL-1-4` 自研 `@prologue/sdk` 随安装包再分发许可记录落档（#rel-1-item-4）

本批硬边界：
- 随包原生签名盘点严格对齐 44B、112-1 与 75-B（不含已删 better_sqlite3.node 与 jelly-whisper，仅含 Node、node-pty、molis-material、Computer Helper.app 及 NSServices／App Intents 声明）。
- 要我本人办的账号、法律主体与凭据填入，按清单一次性清晰列出，绝不替我登录账号或读取钥匙串／证书私钥。
```

[ASC]: ../../../assistant-service-connections/spec.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[P]: ../../../../docs/product-operations/产品优化建议.md
[UPG]: ../../../upgrade-continuity/spec.md
