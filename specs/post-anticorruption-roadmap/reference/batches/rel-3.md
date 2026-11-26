# REL-3 · 本机日志、崩溃恢复与诊断包

[执行目录](../../spec.md#release-batch) · [发行批总则](../release-batch.md#release-batch) · [上一批 REL-2](rel-2.md) · [下一批 REL-4](rel-4.md) · [执行规则](../execution-rules.md)

<a id="rel-3"></a>

## 给人讲清楚

软件装到别人电脑上以后，万一遇到报错或闪退，要能在**纯本机、零联网外发**的前提下看清发生了什么、并顺畅拉起恢复（可选联网上报留在服务端批 [`SRV-8`](srv-8.md)）。为避免在临发 M1 前夕因 `BL-812` 大面积翻动全仓 20 多个核心包，本批拆成 **2 个边界清晰的独立 PR（`REL-3-A` → `REL-3-B`）**：

1. **`REL-3-A` · 本机脱敏日志轮转、Node／Rust 崩溃捕获重启与透明可预览的本地诊断包（PR 1）**：直接复用 **`70-1` 平台本机脱敏底座**与 Prologue 脱敏审计出口将日志落盘，按大小和天数自动轮转清理；Node 宿主或 Rust 桌面层异常退出时捕获故障摘要并衔接重启恢复；用户导出诊断包到本地前，**先在界面上透明展示包含的文件与脱敏内容预览**（确认绝无密钥、令牌、隐私路径和聊天／文稿正文后再保存）。
2. **`REL-3-B` · 平台包可选注入式 `DiagnosticLogger` 窄口与关键吞错补记（PR 2，结清 `BL-812`）**：在 `packages/contracts/src/platform/` 定义默认空操作的极简可选 `DiagnosticLogger` 窄口（只记错误码、子系统与脱敏元数据），仅对真正影响线上排障的高价值静默 `catch` 补接诊断记录，不搞全仓 223 处机械大扫改。

## 交付与前置

- **阶段／类型**：发行；底层与架构（本机可靠性与可诊断性）
- **需求来源**：[C 端就绪 C-5A][CEND]、[`BL-812`][BL812]
- **前置／待决**：开工由用户定；`05`、`25`（已合入）、[`70-1`](70.md#batch-70-item-1)（本机脱敏底座）、[`111`](111.md)、[`112-1`](112.md#batch-112-item-1)；发布符号归档位置从 [26-9](26.md#batch-26-item-9) 发行配置读取。**2026-11-25 用户已拍板结清 `BL-812` 日志端口位置与形状**（放 `packages/contracts/src/platform/` 可选默认 no-op 窄口，独立拆入 `REL-3-B`）。按[决定 66](../decisions.md#decision-66)与 `REL-2`，仅覆盖 `arm64` 原生组件（`molis-material`、`Computer Helper.app`、Node、`node-pty`）、纯平台 `system.shelf`／`horizontal/plugin-studio` 及 `listPartitions()` 分区健康摘要，不含已删 `jelly-whisper`、旧 Alchemist、`better-sqlite3` 与 `x64`。
- **可并行项**：[REL-2](rel-2.md)、[REL-4](rel-4.md)
- **UI 要求**：复用 [runtime-and-recovery](../../../../docs/design/runtime-and-recovery/README.md) 已定样，在本地保存诊断包前展示包含文件与脱敏字段透明预览清单（覆盖 `zh`/`en`/`ja` 中英日三语，零二元语言分支）
- **粒度**（用户 2026-11-25 拍板）：拆为 **2 个独立 PR（`REL-3-A` → `REL-3-B`）**，防止在同一个 PR 里把宿主／Rust 崩溃恢复和跨包 `catch` 治理混在一起。

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="rel-3-item-1"></a>`REL-3-A` · 本机脱敏结构化日志轮转、Node／Rust 崩溃恢复与透明预览诊断包导出（PR 1） | 按 `C-5A` 核对现有 logger，复用 `70-1` 平台本机脱敏底座与 Prologue 脱敏审计出口补齐结构化日志落盘、按大小与天数自动轮转清理（附密钥／令牌／裸路径／用户正文零残留拒绝测试）；实现 Node 宿主与 Tauri Rust（过 `native-checks.mjs rust`）崩溃捕获、重启恢复衔接、`arm64` 发布符号归档（含 `molis-material` 与 `Computer Helper.app`），以及保存前带透明文件／字段预览的纯本机诊断包导出（全程零网络上传，原 `26-4`） | `05`、`25`（已合入）、[`70-1`](70.md#batch-70-item-1)、[`111`](111.md)、[`112-1`](112.md#batch-112-item-1) |
| <a id="rel-3-item-2"></a>`REL-3-B` · 平台包可选注入 `DiagnosticLogger` 合同与关键静默 `catch` 补记（PR 2，结清 `BL-812`） | 在 `packages/contracts/src/platform/` 定义可选注入、默认空操作（不破坏存量调用与单测）的极简 `DiagnosticLogger` 窄口（仅收错误码、模块名与脱敏结构化详情，严禁收用户原文或密钥，更新 `pnpm api:update`），由宿主统一注入 `REL-3-A` 脱敏日志器；按影响排障价值精选平台包关键静默 `catch`／`Promise.catch` 补记诊断（不做无差别 223 处全仓硬改，不改变任何业务返回值与取消语义） | `REL-3-A` |

<a id="review-2026-11-25"></a>

## 11-25 路线优化拍板（结清 `BL-812`、[决定 66](../decisions.md#decision-66)、[`112-1`](112.md)、`#2307`）

- **拆为 `REL-3-A` → `REL-3-B` 两步并正式定下 `BL-812` 端口形状（2026-11-25 用户拍板）**：避免临发版前把 20 多个核心包一次性改乱；`DiagnosticLogger` 落 `packages/contracts/src/platform/`（可选、默认空操作、只记脱敏错误码与元数据），仅补高价值静默吞错点。
- **复用 `70-1` 脱敏底座 ＋ 导出前透明预览 ＋ 纯本机零联网**：诊断包与落盘日志统一经 `70-1` 清洗并带拒绝断言，导出前清晰预览包含内容，对齐 `arm64` 与 `molis-material`（零 `jelly-whisper`）。

<a id="goal-prompt"></a>

## Goal Prompt

把下面对应那一段复制给执行该 PR 的会话。

### `REL-3-A`（PR 1：本机脱敏日志轮转、Node／Rust 崩溃恢复与透明预览诊断包导出）

```text
你在 Molis Work 仓库里推进发行批 REL-3 的独立 PR `REL-3-A`「本机脱敏日志轮转、Node／Rust 崩溃恢复与透明预览诊断包导出」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：本项单独一个 PR，由主会话写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置和边界以 specs/post-anticorruption-roadmap/reference/batches/rel-3.md 的 #rel-3-item-1 为准。

发行批：我没明确说开工前只做只读核查和设计；发行配置只读 26-9 的 tooling/release/profile.mjs；改 CI 工作流、动凭据前先问我。

原需求：specs/archive/repository-anti-corruption/c-end-readiness.md（C-5A）

本 PR 交付：
1. `REL-3-A` 本机脱敏日志轮转、崩溃恢复与诊断包导出（#rel-3-item-1）：复用 70-1 本机脱敏底座与 Prologue 脱敏出口实现结构化日志落盘与大小／天数轮转（必须带密钥、令牌、隐私裸路径与用户内容原文零出现拒绝测试）；补齐 Node 与 Rust（过 native-checks.mjs rust）崩溃捕获与重启衔接、arm64 发布符号（含 molis-material、Computer Helper.app，不含已删 jelly-whisper 与 x64）及覆盖 system.shelf／plugin-studio／listPartitions() 的纯本机诊断包导出（保存前展示包含文件与脱敏字段预览，zh/en/ja 三语，全程零联网外送）。
```

### `REL-3-B`（PR 2：可选注入 `DiagnosticLogger` 窄口与关键静默 `catch` 补记）

```text
你在 Molis Work 仓库里推进发行批 REL-3 的独立 PR `REL-3-B`「平台包可选注入 DiagnosticLogger 合同与关键静默 catch 补记（结清 BL-812）」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：本项单独一个 PR，由主会话写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置和边界以 specs/post-anticorruption-roadmap/reference/batches/rel-3.md 的 #rel-3-item-2 为准。

原需求：specs/backlog/BL-812.md；specs/archive/repository-anti-corruption/c-end-readiness.md

本 PR 交付：
1. `REL-3-B` BL-812 收口（#rel-3-item-2）：在 packages/contracts/src/platform/ 定义可选注入、默认 no-op 的极简 DiagnosticLogger 窄口（只收错误码、模块名与脱敏结构化元数据，严禁传入用户正文或密钥，刷新 pnpm api:update），由宿主注入 REL-3-A 脱敏日志器；仅针对真正影响线上排障的高价值静默 catch／Promise.catch 补记诊断，严禁无差别机械扫改全仓或改变业务返回与取消语义。
```

[ASC]: ../../../assistant-service-connections/spec.md
[BL812]: ../../../backlog/BL-812.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[P]: ../../../../docs/product-operations/产品优化建议.md
[UPG]: ../../../upgrade-continuity/spec.md
