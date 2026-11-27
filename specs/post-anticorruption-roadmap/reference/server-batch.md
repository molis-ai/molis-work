# 服务端批详情

[执行目录](../spec.md) · [参考分类](../spec.md#reference)

<a id="server-batch"></a>

## 服务端批（SRV）

要服务端（账号、云上存储与转发、部署、运维和费用）的需求独立成这一批，排在 01～112 及 M1（[发行批](release-batch.md#release-batch) `REL-5` `1.0.0`）发出之后（用户 2026-11-03 定，2026-11-25 校准）：个人云同步、团队协作首版、团队记忆和 M2（自动更新、端到端加密在线备份、默认关闭可选崩溃上报）。以后再有要服务端的需求，也加进这一批，片号接着往下编。

- **什么时候开工由你定**（[决策记录](decisions.md#section-7)第 24 项）：部署正式服务、开真实账号、承担费用都只能你办。开工前这一批不占写手和机器额度，01～112 不等它；各片的前置写在表里，在 M1（[发行批](release-batch.md#release-batch) `REL-5` `1.0.0`）发出之后启动。
- **合同在 M1 之后加**：Manifest 里的同步声明、同步与团队的动作和数据合同，都按[合同变更流程](../../../docs/system/CONTRACT-CHANGES.md)及 `REL-4-A` 的 `U5` 过渡规则加、带读取兼容，协议接受上一版（`1.0.0`）客户端并过 `golden-homes/1.0.0` 回放；不为赶 M1 提前冻结（用户 2026-11-03 定）。合同照[轨道与冲突规则](tracks.md#section-5)规则 1 排队。
- **批内顺序**：`SRV-1` 共同设计与分层协作协议在前；个人同步 `SRV-2`（`SRV-2-A`→`SRV-2-B`）→ `SRV-5`（`SRV-5-A`→`SRV-5-B`）；团队 `SRV-3`（`SRV-3-A`→`SRV-3-B`）→ `SRV-4` → `SRV-6`（`SRV-6-A`→`SRV-6-B`→`SRV-6-C`）→ `SRV-7`（`SRV-7-A`→`SRV-7-B`），完整团队产品建在个人同步上（`SRV-6` 等 `SRV-5`）；`SRV-8`（`SRV-8-A`∥`SRV-8-B`∥`SRV-8-C` 三项互不等待）只等 M1、`REL-4-B` `U6`／`REL-3-A` 和各自账号条件，和前七片互不等待。
- **轨道**：服务一侧归 G 轨（[轨道与冲突规则](tracks.md#section-5)）；插件里的同步声明按规则 4 一起落；桌面一侧（更新器、崩溃上报的客户端）在 `apps/desktop/`，由 F 落（规则 7）。
- **原编号**：原 23、49～51、74、79～81、87、88 整行移到这里，60、72、75 只移出同步、团队与 M2 那部分；[执行目录](../spec.md#execution-batches)留着编号写去处。

每行是一项交付；“共用本批前置”引用本批的前置说明。子项另列条件时只约束该子项；开发、接入、合入与最终验收按所写阶段分别判断。

各片的交付、前置与 Goal Prompt 在各自的文件里：[SRV-1](batches/srv-1.md)、[SRV-2](batches/srv-2.md)、[SRV-3](batches/srv-3.md)、[SRV-4](batches/srv-4.md)、[SRV-5](batches/srv-5.md)、[SRV-6](batches/srv-6.md)、[SRV-7](batches/srv-7.md)、[SRV-8](batches/srv-8.md)。
