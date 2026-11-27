# REL-4 · 合同过渡 U5 与副本演练 U6

[执行目录](../../spec.md#release-batch) · [发行批总则](../release-batch.md#release-batch) · [上一批 REL-3](rel-3.md) · [下一批 REL-5](rel-5.md) · [执行规则](../execution-rules.md)

<a id="rel-4"></a>

## 给人讲清楚

M1 一旦对外发出，后续发 `1.1`、`1.2` 新版时不能再让老用户存好的流程报错、也不能让数据库升崩卡死启动。本批在 M1 首发前分 **2 个互不等待的独立并行 PR（`REL-4-A` ∥ `REL-4-B`）**装好两道防升崩护栏：

1. **`REL-4-A` · 合同过渡机制 `U5` 与门禁切换（独立并行 PR 1）**：紧接第 [`90`](90.md) 批封板的 Clean v1 `version: 1` 干净基线（不为 M1 之前的旧双实例、旧 Alchemist、`jelly-whisper` 写任何历史兼容），建立后续接口升版时的平滑过渡机制——工作流、角色、场景包（`Blueprint`）、`68-B` 保存的智能操作面、Skill 和 MCP 里存着的引用能无损换新版的自动改写，改不了的等用到时原处温和提醒重选；同时把门禁切换为「登记在过渡表内的合同允许升版本」。
2. **`REL-4-B` · 秒级库级副本彩排 `U6` 与退回上一版衔接（独立并行 PR 2）**：升新版前先在后台拿副本试跑一遍完整数据库升级和校验，全绿才切换新程序，不过就稳留原版；**副本彩排只拷贝全分区（含个人空间与 `112-2` 瘦身后 `Jelly` 等）的 SQLite 数据库和带版本清单文件，明确跳过 GB 级不可变原始大附件、可重建总览／搜索索引和语言工具缓存**，既秒级跑完又绝不撑爆磁盘，配合 `25-3` 已有的「回到上一版」形成双保险。

## 交付与前置

- **阶段／类型**：发行；底层与架构（升级连续性与防损坏）
- **需求来源**：[升级 U5／U6][UPG]、[合同变更流程][CC]
- **前置／待决**：开工由用户定；`REL-4-A` 前置等 [`90`](90.md) Clean v1 `version: 1` 封板核验（含 [`111`](111.md)、[`112`](112.md)、`26-5` 的 U4、`26-7` 的 `state_machines`）；`REL-4-B` 前置等 `05`、`25-3`（已合入）与 [`111`](111.md)（`listPartitions()` + `partitionRoot()`）
- **可并行项**：`REL-4-A` 与 `REL-4-B` 互不等待并行；同时与 [REL-2](rel-2.md)、[REL-3](rel-3.md) 并行
- **UI 要求**：复用：升级失败、原处重选提示与退回上一版沿 [runtime-and-recovery](../../../../docs/design/runtime-and-recovery/README.md) 已定样（回退默认先另存一份，同步支持 `zh`/`en`/`ja` 中英日三语）
- **粒度**（用户 2026-11-25 拍板）：拆为 **2 个互不等待的独立并行 PR（`REL-4-A` ∥ `REL-4-B`）**。

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="rel-4-item-1"></a>`REL-4-A` · 基于 Clean v1 起点的合同过渡 `U5` 与门禁切换（独立并行 PR 1） | 以 [`111`](111.md)＋[`112`](112.md)＋[`90`](90.md) 封板的 Clean v1 `version: 1` 合同为起点（零旧双轨／旧 Alchemist／Goal 一等字段兼容包袱），实现动作、Manifest（至少兼容上一 `host_api_version`）、MCP 与保存引用（覆盖工作流步骤、Characters 草稿、`77`/`78` `Blueprint` 场景包、`68-B` 保存的智能操作面、Skill）的过渡期双版本适配、无损自动改写与有损用时原处重选提示；将阶段一 `N41`「版本全为 1」门禁切换为「M1 起按过渡登记表与删除条件放行 `>1` 版本」（从原 `26-5` 拆出） | [`90`](90.md)、[`111`](111.md)、[`112`](112.md)、`26-5`（U4）、`26-7`（`state_machines`） |
| <a id="rel-4-item-2"></a>`REL-4-B` · 秒级库级副本升级演练 `U6` 与回退衔接（独立并行 PR 2） | 新版本切换前经 `listPartitions()` + `partitionRoot()` 对当前 Home 的**全分区 SQLite 库（含 `personal-space/`、`libraries/*.db`、`blueprints.db`、`112-2` 瘦身后 4 表 `Jelly` 等）及带版本配置／清单文件**生成 checkpoint 快照副本，跑通完整升级段、`integrity_check`／外键／表结构／业务计数校验：**显式跳过 `system.artifacts`／`system.shelf` 不可变大附件字节、可重建的 `overview_projections`／搜索索引及 `<Home>/tools/` 语言服务器缓存**，防磁盘占满与升级卡死；校验全过才在下次启动切换新程序，失败则留守原版并记录脱敏诊断，无缝衔接 `25-3`「回到上一版」与 Tauri `arm64` 更新准备（过 `native-checks.mjs rust`，原 `26-6`） | `05`、`25-3`（已合入）、[`111`](111.md)、[`112-2`](112.md#batch-112-item-2) |

<a id="review-2026-11-25"></a>

## 11-25 路线优化拍板（[决定 66](../decisions.md#decision-66)、[`112`](112.md)、`#2307`）

- **`U6` 副本彩排精准瘦身，跳过 GB 级原始附件与可重建缓存（2026-11-25 用户拍板）**：仅复制全分区 SQLite 库与带版本清单文件做秒级彩排，彻底规避整目录拷贝导致的 `ENOSPC` 磁盘写满与长时间阻塞。
- **拆为 `REL-4-A`（`U5` 合同过渡）∥ `REL-4-B`（`U6` 副本演练）两个独立并行 PR（2026-11-25 用户拍板）**：`REL-4-A` 紧接第 `90` 批 Clean v1 封板起点并补齐 `Blueprint` 场景包与 `68-B` 保存操作面引用过渡。

<a id="goal-prompt"></a>

## Goal Prompt

把下面对应那一段复制给执行该 PR 的会话。

### `REL-4-A`（PR 1：合同过渡 `U5` 与门禁切换）

```text
你在 Molis Work 仓库里推进发行批 REL-4 的独立 PR `REL-4-A`「基于 Clean v1 起点的合同过渡 U5 与门禁切换」（与 `REL-4-B` 互不等待并行）。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：本项单独一个 PR，由主会话写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置和边界以 specs/post-anticorruption-roadmap/reference/batches/rel-4.md 的 #rel-4-item-1 为准。

发行批：我没明确说开工前只做只读核查和设计；改门禁脚本前按红线先问我确认。

原需求：specs/upgrade-continuity/spec.md（§5、U5）；docs/system/CONTRACT-CHANGES.md

本 PR 交付：
1. `REL-4-A` 合同过渡 U5（#rel-4-item-1）：以第 90 批核准的 Clean v1 version: 1 合同基线为唯一兼容起点（严禁为 M1 之前的旧双实例、旧 Alchemist 或 jelly-whisper 写兼容兜底），落地动作、host_api_version、MCP 及保存引用（工作流、Characters、77/78 Blueprint 场景包、68-B 保存智能操作面、Skill）的过渡期映射、无损自动改写与有损用时三语重选提示，并将 N41 版本门禁切换至 M1 过渡登记表模式。
```

### `REL-4-B`（PR 2：秒级库级副本升级演练 `U6` 与回退衔接）

```text
你在 Molis Work 仓库里推进发行批 REL-4 的独立 PR `REL-4-B`「秒级库级副本升级演练 U6 与回退衔接」（与 `REL-4-A` 互不等待并行）。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：本项单独一个 PR，由主会话写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置和边界以 specs/post-anticorruption-roadmap/reference/batches/rel-4.md 的 #rel-4-item-2 为准。

原需求：specs/upgrade-continuity/spec.md（§7、U6）

本 PR 交付：
1. `REL-4-B` 副本演练 U6（#rel-4-item-2）：经 listPartitions() + partitionRoot() 仅对全分区 SQLite 库（含 personal-space/、libraries/*.db、blueprints.db、112-2 瘦身后 4 表 Jelly）与带版本配置／清单文件创建 checkpoint 副本跑完整升级与 integrity/外键/表结构/业务校验（显式跳过 system.artifacts/system.shelf 大附件字节、overview_projections/搜索索引与 <Home>/tools/ 缓存，防占满磁盘）；通过后才允许切换新程序，失败留守原版并衔接 25-3「回到上一版」（过 native-checks.mjs rust，界面复用 runtime-and-recovery 定样与 zh/en/ja 三语）。
```

[CC]: ../../../../docs/system/CONTRACT-CHANGES.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[P]: ../../../../docs/product-operations/产品优化建议.md
[UPG]: ../../../upgrade-continuity/spec.md
