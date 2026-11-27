# SRV-2 · 个人同步核心

[执行目录](../../spec.md#server-batch) · [服务端批总则](../server-batch.md#server-batch) · [上一批 SRV-1](srv-1.md) · [下一批 SRV-3](srv-3.md) · [执行规则](../execution-rules.md)

<a id="srv-2"></a>

## 给人讲清楚

主干里已有一套本机联调过的个人同步底座（`#1877`）。本批不推倒重写，而是按 [SRV-1](srv-1.md) 拍板的规矩分 **2 个严格串行的独立 PR（`SRV-2-A` → `SRV-2-B`）**把个人跨电脑云同步真正补齐、部署上线并跑通完整文件往返：

1. **`SRV-2-A` · Rust/WASM 传输核心、防丢 Outbox、大附件断点续传与冲突双留底座（PR 1）**：补齐持久化发送队列（Outbox）、超过 256 KB 的大文件分块传输、丢回执或重启后接着传、离线撞车保留冲突双版本不互相吞；且**只要附件还没传完，界面绝不虚报「已全部同步」**。
2. **`SRV-2-B` · 首批纯平台集合＋核心 UPP 分区插件同步接入、左下头像三语状态与真实云端字节验收（PR 2）**：把成果库（`system.artifacts`）、置物架（`system.shelf`）以及待办、`Pages`、`Schedule`、`112-2` 瘦身后的 4 表 `Jelly`（日历＋极简笔记）、按需开启的 `Goals` 等接入线上云服务，严控上云边界——**密钥／令牌／本机目录路径／外部 AI 会话绝不上云，大体积工作记录库（`observation.db`）与评测库（`evaluation.db`）默认留本机不烧云配额，且记忆同步连同「遗忘墓碑」一起同步防止旧电脑反向复活已删记忆**。需要你做的：办正式部署与云账号；确认左下角账户头像同步状态圆点与菜单行的差异定样。

## 交付与前置

- **阶段／类型**：服务端；产品线（个人同步）；底层与架构
- **需求来源**：[个人同步][SYNC]、[同步基础][SYNCF]、[插件复制][SYNCP]、[升级持续可用][UPG]
- **前置／待决**：由用户发令开工并提供云部署与账号条件；前置等 [`SRV-1`](srv-1.md)、[`111`](111.md)、[`112-2`](112.md#batch-112-item-2) 与 [`REL-5`](rel-5.md)（M1 `1.0.0` 金样与 `U5`／`U1` 连续升级起点）；涉及 `horizontal/account` 中央账号合同严守 `AGENTS.md` 红线（仅经 Auth 仓库同步脚本生成，不在 Work 侧私改）
- **可并行项**：[`SRV-3`](srv-3.md) 的团队关键协作切片设计走查
- **UI 要求**：复用 `SRV-1`；左下账户条头像状态圆点与菜单同步行（[决定 53](../decisions.md#decision-53) ⑧，不再占顶栏最右）及异常差异先定样，同步支持 `zh`/`en`/`ja` 中英日三语（零二元语言分支）
- **粒度**（用户 2026-11-25 拍板）：拆为 **2 个严格串行的独立 PR（`SRV-2-A` → `SRV-2-B`）**，将 Rust/WASM 服务端传输底座与客户端多插件接入解耦。

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="srv-2-item-1"></a><a id="srv-2-item-2"></a>`SRV-2-A` · Rust/WASM 同步传输核心、Outbox、大附件分片断点续传与冲突双留底座（PR 1，合原第 1、2 项） | 在 `server/src/sync`、`apps/sync-worker`（过 `native-checks.mjs rust`）与 `modules/sync-replication` 补齐独立服务、账号衔接（守 `horizontal/account` 同步生成红线）、持久化 Outbox／回执与在途撤权；落地 `>256 KiB` 附件与大对象 R2 分片一致提交、丢回执与宿主重启断点续传、离线冲突双版本完整保留，并强制「附件字节未全部就绪时绝不显示全部已同步」；库结构与协议变更严格走 `1.0.0` 连续升级链并过 `golden-homes/1.0.0` 回放 | 共用本批前置 |
| <a id="srv-2-item-3"></a>`SRV-2-B` · 首批纯平台集合＋核心 UPP 分区插件接入、隐私／配额边界与真实云端字节往返验收（PR 2） | 接入首批纯平台集合（`system.artifacts`、`system.shelf`、`system.characters` 等 `owner_kind:"platform"`）与核心 UPP 分区插件（覆盖 `"personal"` 个人空间与项目分区：`Todo`、`Pages`、`Schedule`、`112-2` 瘦身后 4 表 `Jelly`、可选 `Goals` 等）；验证 `partition_plugins` 启用清单独立同步（V4，`S-sync-enablement-own-choice`）、`personSettings` `portable:true`、确定性 `push_id` 双端离线推送合并（R16）、仅同步最近 1 版 `push_superseded`（V3）、拉取写入休眠分区零唤醒只标 `dirty = 1`（`S-partition-wake-scope`）；**焊死不上云禁区与墓碑规则**（密钥／令牌／本机目录路径／`60` 外部会话绝不出站 G5，`observation.db` 与 `evaluation.db` 默认纯本机不进云同步，记忆遗忘墓碑同步传播防旧端反向复活）；落地左下账户头像三语同步状态并在真实线上服务完成成果库文件字节往返验收 | `SRV-2-A` 合入且线上服务／账号就绪 |

<a id="review-2026-11-25"></a>

## 11-20 衔接与 11-25 路线优化拍板（[决定 53](../decisions.md#decision-53) ⑧、[决定 66](../decisions.md#decision-66)、[`112-2`](112.md)、`#2307`）

- **拆为 `SRV-2-A`（Rust/WASM 传输＋大附件续传＋冲突双留）→ `SRV-2-B`（核心平台与 UPP 插件接入＋真实云端字节验收）串行 2 PR（2026-11-25 用户拍板）**：避免 Rust Worker 与多业务包改动互相牵扯。
- **严控上云范围 ＋ 记忆遗忘墓碑跨端同步（2026-11-25 用户拍板）**：明确 `observation.db`／`evaluation.db` 留本机不耗云存储额度，记忆遗忘墓碑跨设备同步防止旧电脑把已忘内容重新推回。
- 同步状态按决定 53 ⑧ 固定在账户条头像圆点＋账户菜单状态行，覆盖 `zh`/`en`/`ja` 三语。

<a id="goal-prompt"></a>

## Goal Prompt

把下面对应那一段复制给执行该 PR 的会话。

### `SRV-2-A`（PR 1：Rust/WASM 同步传输核心、Outbox、大附件断点续传与冲突双留底座）

```text
你在 Molis Work 仓库里推进路线书第 SRV-2 批的独立 PR `SRV-2-A`「Rust/WASM 同步传输核心、Outbox、大附件分片断点续传与冲突双留底座」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：本项单独一个 PR，由主会话写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置和边界以 specs/post-anticorruption-roadmap/reference/batches/srv-2.md 的 #srv-2-item-1 为准。

服务端批：我没明确说开工前只做只读核查和设计；严禁在 Work 侧手改 horizontal/account（须经 Auth 同步脚本）；Rust/WASM 必过 native-checks.mjs rust，库与协议变更必带连续升级段并过 golden-homes/1.0.0 回放。

原需求：specs/personal-cloud-sync/spec.md；specs/personal-cloud-sync/foundation.md；specs/upgrade-continuity/spec.md

本 PR 交付：
1. `SRV-2-A` 同步传输、Outbox 与大附件冲突底座（#srv-2-item-1）：补齐独立服务、Outbox／回执、在途撤权、>256 KiB 大附件 R2 分片一致提交、丢回执／重启断点续传与离线冲突双版本保留，焊死「附件未全部传完不得显示全部已同步」。
```

### `SRV-2-B`（PR 2：首批纯平台＋核心 UPP 插件同步接入与真实云端字节验收）

```text
你在 Molis Work 仓库里推进路线书第 SRV-2 批的独立 PR `SRV-2-B`「首批纯平台集合＋核心 UPP 分区插件接入、隐私／配额边界与真实云端字节往返验收」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：本项单独一个 PR，由主会话写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置和边界以 specs/post-anticorruption-roadmap/reference/batches/srv-2.md 的 #srv-2-item-3 为准。

原需求：specs/personal-cloud-sync/spec.md；specs/personal-cloud-sync/plugin-replication.md

本 PR 交付：
1. `SRV-2-B` 首批核心集合接入与线上字节验收（#srv-2-item-3）：先确认左下账户条头像状态点与菜单同步行差异定样（决定 53 ⑧，zh/en/ja 三语）；接入 system.artifacts、system.shelf、system.characters 及 Todo、Pages、Schedule、112-2 瘦身后 4 表 Jelly、可选 Goals 等分区集合，验 partition_plugins V4、personSettings portable:true、确定性 push_id R16、push_superseded V3 与休眠分区零唤醒拉取；严守密钥／令牌／本地目录／外部会话零出站（G5）、observation.db 与 evaluation.db 默认留本机不同步、记忆遗忘墓碑跨端同步防旧端复活，并在真实部署服务上完成成果库附件完整字节往返验收。
```

[SYNC]: ../../../personal-cloud-sync/spec.md
[SYNCF]: ../../../personal-cloud-sync/foundation.md
[SYNCP]: ../../../personal-cloud-sync/plugin-replication.md
[UPG]: ../../../upgrade-continuity/spec.md
