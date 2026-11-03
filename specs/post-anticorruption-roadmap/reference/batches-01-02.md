# 01～02 批 · 收口

[执行目录](../spec.md) · [参考分类](../spec.md#reference)

开工时一起查看[执行规则](execution-rules.md)和[每片开工说明](development-workflow.md#kickoff-brief)。

每行是一项交付；“共用本批前置”引用本批的前置说明。子项另列条件时只约束该子项；开发、接入、合入与最终验收按所写阶段分别判断。

<a id="batch-01"></a>

## 01 · 防腐基线核准

- **阶段／类型**：0；底层与架构；横向能力
- **需求来源**：[防腐需求][AC]、[需求来源][R]、[WebKit 修复][WK]、[近期 PR 对照](requirement-prs.md#recent-requirement-prs)、[对抗式审查台账][REV]
- **前置／待决**：防腐收尾条件满足；[决策记录](decisions.md#section-7) 第 21 项未决定前不提前启动阶段 0
- **可并行项**：主线状态只读核查
- **UI 要求**：无需

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="batch-01-item-1"></a>基线、旧成果与在途需求核对 | 核最终 main、旧 PR、未交付成果及在途需求变更；个人同步分支随服务端批 SRV-1、CGS 分支随 81 再盘点，本批不盘点；明确桌面 WebKit、双实例可选权限及真实验收去向；核 #1727 的实际采用和 #1730 的需求增量，不能把在途 PR 当成已合入；对抗式审查各项决定用户 11-03 已确认，不再另核 | 共用本批前置 |
| <a id="batch-01-item-2"></a>归档、状态修正与验收单 | 按 [需求清单 1](requirements.md#section-3-1) 归档已做完的 spec、改对不上的状态句（H7），备好一张验收单（BACKLOG「待你验收」、[需求清单 1](requirements.md#section-3-1) 新增项含 F1、VUX 本人验收） | 共用本批前置 |

<a id="batch-02"></a>

## 02 · 需求、版本与工程收口

- **阶段／类型**：0；底层与架构；横向能力
- **需求来源**：[需求来源][R]、[Backlog][BL]、[Memory][MEM]、[升级 U0][UPG]、[需求开发流程][FLOW]、[对抗式审查 R1～R3／R8、N4～7／9／26～41][REV]
- **前置／待决**：各片范围以审查台账为准，不把整批当一个 PR。N3／N16 等未定门禁不自动批准，Memory 原暂停保留；用户 11-03 已确认的台账决定直接沿用。
- **可并行项**：核账／验收准备与独立设计可穿插；核心、版本、规则与重建按上述顺序串行，外部删 release／tag 的等待只挡依赖项
- **UI 要求**：无需

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="batch-02-item-1"></a>遗留事项、主人与唯一待办 | ①按 R1／R8、N5／N6／N9 核回遗留 PR、风险与零碎单，补主人和唯一待办 | 01；按台账 R1／R8、N5／N6／N9 核回 |
| <a id="batch-02-item-2"></a>共享核心、SQLite 驱动与合同复位 | ②按 R2／R3 交共享核心收口、SQLite 驱动归 storage 的第一步及合同复位 | 01；#1724／1725 相关成果已合入；N26～29、已核实 N39 与消费者一次改完 |
| <a id="batch-02-item-3"></a>版本归一与重建清理 | ③同真实 Home 重建窗口完成 N4、N30～34、N36／N37 的归一与清理 | 01；真实 Home 原维护授权；N34 先处理旧 release／tag，再复位 0.1.0 |
| <a id="batch-02-item-4"></a>升级起点与合同规则 U0 | ④规则 N35／N41 与 U0 同批生效，留统一起点，接 05 升级链。各片具体范围见台账各行，不把整批当一个 PR | 与本批版本归一、重建同批生效；为 05 提供统一起点 |
| <a id="batch-02-item-5"></a>对外许可口径与 BACKLOG 整理 | 另做对外许可口径（A4，官网仓库）与按 [需求清单 7](requirements.md#section-3-7) 重排 BACKLOG | 01；官网口径沿原待决 |

[AC]: ../../repository-anti-corruption/spec.md
[R]: requirements.md
[BL]: ../../BACKLOG.md
[MEM]: ../../prologue-memory-strategy/spec.md
[WK]: ../../plugin-frame-desktop-load/spec.md
[UPG]: ../../upgrade-continuity/spec.md
[FLOW]: development-workflow.md
[REV]: ../../../docs/reviews/adversarial-review-2026-11-01.md
