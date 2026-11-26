# SRV-8 · M2

[执行目录](../../spec.md#server-batch) · [服务端批总则](../server-batch.md#server-batch) · [上一批 SRV-7](srv-7.md) · [执行规则](../execution-rules.md)

<a id="srv-8"></a>

## 给人讲清楚

M2 的三项外部用户运维兜底服务彼此完全独立、各等各的云服务账号条件，拆成 **3 个互不等待的独立并行 PR（`SRV-8-A` ∥ `SRV-8-B` ∥ `SRV-8-C`）**，哪项条件备齐哪项就能单独上线：

1. **`SRV-8-A` · Apple Silicon（`arm64`）自动更新与不打扰回退（独立并行 PR 1）**：后台静默下载新版，先用 [`REL-4-B`](rel-4.md#rel-4-item-2) 做的秒级库级副本彩排升级，彩排通过后温和提示「重启以完成更新（可延后）」——**若当前有助理或 Coding 任务正在运行，绝不弹窗抢焦点或强行重启打断任务**；万一有问题随时一键退回上一版，且每个发出去的正式版本都留存一份合成金样。
2. **`SRV-8-B` · 本机端到端加密的定时在线云备份与防误盖恢复（独立并行 PR 2）**：和 [`73-B`](73.md#batch-73-item-3) 手动换机包分开验证——在**本机端到端加密后再做增量上传**（云存储桶只见密文，平台也读不到用户明文），完整覆盖全分区（含 `"personal"` 个人空间与 `112-2` 瘦身后 4 表 `Jelly`）、记忆（**含遗忘墓碑防复活**）、角色与自定义外观，**显式排除密钥／令牌、本地目录路径、可重建的总览／搜索索引及大体积 `observation.db`／`evaluation.db` 流水账**；往非空本机恢复前自动先拍本地快照防误盖。
3. **`SRV-8-C` · 默认关闭、先预览脱敏样例的可选崩溃上报（独立并行 PR 3）**：在 [`REL-3-A`](rel-3.md#rel-3-item-1)（复用 `70-1` 脱敏底座）基础上接可选上报通道——**默认严格关闭**，用户想打开之前先展示真实脱敏字段样例（绝不含密钥、隐私路径与聊天／文档正文），随时可一键关闭。

## 交付与前置

- **阶段／类型**：服务端；产品线（发布与长线运维 M2）；底层与架构
- **需求来源**：[C 端就绪 M2][CEND]、[升级 U2／U6][UPG]、[BL-115][BL]（`BL-812` 已在 [`REL-3-B`](rel-3.md#rel-3-item-2) 收口）
- **前置／待决**：由用户发令开工并提供对应云账号；三项互不等待，各自只等自身前置与账号条件。按[决定 66](../decisions.md#decision-66)、[`112`](112.md) 与 `REL-2`：聚焦 `arm64` 单架构，在线备份经 `listPartitions()` + `partitionRoot()` 覆盖全分区（含 `112-2` 瘦身后 4 表 `Jelly`）与 `portable` `personSettings`。
- **可并行项**：`SRV-8-A`、`SRV-8-B`、`SRV-8-C` 三条轨道互不等待，且与 `SRV-1`～`SRV-7` 完全并行
- **UI 要求**：先定样：自动更新温和延后提示、端到端加密在线备份／恢复与可选崩溃上报预览开关（覆盖 `zh`/`en`/`ja` 中英日三语，零二元语言分支）
- **粒度**（用户 2026-11-25 拍板）：拆为 **3 个互不等待的独立并行 PR（`SRV-8-A` ∥ `SRV-8-B` ∥ `SRV-8-C`）**。

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="srv-8-item-1"></a>`SRV-8-A` · `arm64` 自动更新、后台秒级副本彩排与防打断回退（独立并行 PR 1） | 衔接 `25-3` 回到上一版、[`REL-2`](rel-2.md) `arm64` 签名公证、[`REL-4-B`](rel-4.md#rel-4-item-2) 秒级库级 `U6` 副本演练与 [`REL-5`](rel-5.md)（M1 `1.0.0`），接入 Tauri `arm64` 更新器（过 `native-checks.mjs rust`）：后台下载并完成库级副本彩排通过后才提示可延后重启，**运行中有活跃 Agent／Coding 任务时绝不抢焦点或强行打断**；固化每次正式发版同步留存 `tests/fixtures/golden-homes/<version>` 金样回放 | `25-3`、`REL-2`、`REL-4-B`、`REL-5`；更新源服务账号具备 |
| <a id="srv-8-item-2"></a>`SRV-8-B` · 本机端到端加密增量定时在线备份与防误盖恢复（独立并行 PR 2） | 经 `listPartitions()` + `partitionRoot()` 对 `personal-space/` 与各项目独立库（含 `112-2` 瘦身后 4 表 `Jelly`）、记忆（保留遗忘墓碑防复活）、角色、`71-1` 自定义外观与 `portable:true` 设置做**本机端到端加密＋增量去重定时上传**（云桶仅存密文；显式排除密钥／令牌、本地目录路径、可重建的 `overview_projections`／搜索索引，且默认排除大体积 `observation.db`／`evaluation.db`）；恢复进非空 Home 前自动先拍本地快照，并与 [`73-B`](73.md#batch-73-item-3) 离线整份导出分开独立验收 | [`73-B`](73.md#batch-73-item-3)、[`111`](111.md)、[`112-2`](112.md#batch-112-item-2)、[`REL-5`](rel-5.md)；云备份服务账号具备 |
| <a id="srv-8-item-3"></a>`SRV-8-C` · 默认关闭、开启前透明预览脱敏样例的可选崩溃上报（独立并行 PR 3） | 复用 [`REL-3-A`](rel-3.md#rel-3-item-1) 与 [`70-1`](70.md#batch-70-item-1) 本机脱敏日志与崩溃摘要，实现**默认严格关闭（opt-in）**的可选联网上报：开启开关前先透明展示真实将发送的脱敏字段样例（附密钥、令牌、隐私裸路径与用户原文零外发拒绝测试），支持随时一键停用 | [`70-1`](70.md#batch-70-item-1)、[`REL-3-A`](rel-3.md#rel-3-item-1)、[`REL-5`](rel-5.md)；崩溃收集服务账号具备 |

<a id="review-2026-11-25"></a>

## 11-25 路线优化拍板（[决定 66](../decisions.md#decision-66)、[`112`](112.md)、`#2307`）

- **拆为 `SRV-8-A` ∥ `SRV-8-B` ∥ `SRV-8-C` 三个互不等待的独立并行 PR（2026-11-25 用户拍板）**：消除原 Goal Prompt「全批一个 PR」与正文「三项各等各的服务条件」的自相矛盾。
- **本机端到端加密瘦身云备份 ＋ 自动更新不打断运行中 AI 任务（2026-11-25 用户拍板）**：在线备份先在本机端到端加密再增量上云（含记忆遗忘墓碑，排除密钥、本地路径、可重建索引及大体积观测／评测库，非空恢复先拍快照）；自动更新严守运行中任务零强行打断。

<a id="goal-prompt"></a>

## Goal Prompt

把下面对应那一段复制给执行该 PR 的会话。

### `SRV-8-A`（PR 1：`arm64` 自动更新、后台秒级副本彩排与防打断回退）

```text
你在 Molis Work 仓库里推进路线书第 SRV-8 批的独立 PR `SRV-8-A`「arm64 自动更新、后台秒级副本彩排与防打断回退」（与 `SRV-8-B`、`SRV-8-C` 互不等待并行）。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：本项单独一个 PR，由主会话写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置和边界以 specs/post-anticorruption-roadmap/reference/batches/srv-8.md 的 #srv-8-item-1 为准。

服务端批：我没明确说开工前只做只读核查和设计；Rust 改动必过 native-checks.mjs rust。

原需求：specs/archive/repository-anti-corruption/c-end-readiness.md；specs/upgrade-continuity/spec.md（U2、U6）

本 PR 交付：
1. `SRV-8-A` 自动更新与回退（#srv-8-item-1）：确认自动更新温和延后提示定样（zh/en/ja 三语）；衔接 REL-2 arm64 签名、REL-4-B 秒级库级 U6 副本演练与 25-3 回到上一版接入 Tauri 更新器，确保存在运行中 Agent／Coding 任务时绝不抢焦点或强行重启打断，并固化各正式发版留存 golden-homes/<version> 金样回放。
```

### `SRV-8-B`（PR 2：本机端到端加密增量定时在线备份与防误盖恢复）

```text
你在 Molis Work 仓库里推进路线书第 SRV-8 批的独立 PR `SRV-8-B`「本机端到端加密增量定时在线备份与防误盖恢复」（与 `SRV-8-A`、`SRV-8-C` 互不等待并行）。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：本项单独一个 PR，由主会话写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置和边界以 specs/post-anticorruption-roadmap/reference/batches/srv-8.md 的 #srv-8-item-2 为准。

原需求：specs/archive/repository-anti-corruption/c-end-readiness.md；specs/upgrade-continuity/spec.md

本 PR 交付：
1. `SRV-8-B` 定时在线备份与恢复（#srv-8-item-2）：确认加密备份与恢复定样（zh/en/ja 三语）；经 listPartitions() + partitionRoot() 对全分区（含 112-2 瘦身后 4 表 Jelly）、记忆（保留遗忘墓碑）、角色、自定义外观与 portable:true 设置做本机端到端加密＋增量去重上传（云端仅存密文；显式排除密钥、令牌、本机目录路径、overview_projections／搜索索引及大体积 observation.db／evaluation.db），恢复进非空 Home 前自动先拍本地快照，并与 73-B 整份离线导出独立分开验收。
```

### `SRV-8-C`（PR 3：默认关闭、开启前透明预览脱敏样例的可选崩溃上报）

```text
你在 Molis Work 仓库里推进路线书第 SRV-8 批的独立 PR `SRV-8-C`「默认关闭、开启前透明预览脱敏样例的可选崩溃上报」（与 `SRV-8-A`、`SRV-8-B` 互不等待并行）。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：本项单独一个 PR，由主会话写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置和边界以 specs/post-anticorruption-roadmap/reference/batches/srv-8.md 的 #srv-8-item-3 为准。

原需求：specs/archive/repository-anti-corruption/c-end-readiness.md；specs/BACKLOG.md（BL-115）

本 PR 交付：
1. `SRV-8-C` 可选崩溃上报（#srv-8-item-3）：确认开启前透明预览开关定样（zh/en/ja 三语）；复用 REL-3-A 与 70-1 本机脱敏底座实现默认严格关闭（opt-in）的可选崩溃上报，开启前展示真实脱敏字段样例，附密钥、令牌、隐私裸路径与用户正文零外发拒绝测试，支持随时一键停用。
```

[BL]: ../../../BACKLOG.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[UPG]: ../../../upgrade-continuity/spec.md
