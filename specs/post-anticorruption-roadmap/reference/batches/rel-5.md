# REL-5 · M1 发行与第二台 Mac 验收

[执行目录](../../spec.md#release-batch) · [发行批总则](../release-batch.md#release-batch) · [上一批 REL-4](rel-4.md) · [执行规则](../execution-rules.md)

<a id="rel-5"></a>

## 给人讲清楚

这是第一个对外发行的版本 M1：把 REL-1～REL-4 准备好的东西装到第二台 Mac 上实际走一遍——安装、首次自检、日志与诊断包、崩溃恢复、升级演练与退回，然后发出去，并记下合同兼容起点（从这一刻起合同改动要带读取兼容）。开发阶段的完整路径验收在第 57 批，这里只验对外发行这一层。需要你做的：定 M1 范围（决定 18）；发布按已有授权办。

## 交付与前置

- **阶段／类型**：发行；产品线（发布）
- **需求来源**：[C 端就绪 M1][CEND]、[升级 U4～U6][UPG]
- **前置／待决**：开工由用户定；[57](57.md)（个人工作完整路径）、[44](44.md) 全部合入（合同兼容起点要晚于它）、REL-1～REL-4；[决策记录](../decisions.md#section-7)第 18 项未决定前保留完整范围；发布按已有有效授权办理
- **可并行项**：无
- **UI 要求**：复用已确认交互；整改新增差异先定样

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="rel-5-item-1"></a>M1 发行与第二台 Mac 验收 | 第二台 Mac 安装与首次自检、C-5A 日志轮转／崩溃恢复及脱敏诊断包、已装版本上的 U4～U6 演练与回退、发行物的金样回放；把发行配置切到发行档并跑它的完整性检查；实际外发时记录合同兼容起点（版本、日期与提交，`docs/system/CONTRACT-CHANGES.md`）；从原 57 拆出 | 共用本批前置 |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进发行批 REL-5「M1 发行与第二台 Mac 验收」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/rel-5.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

发行批：我没明确说这一批开工之前，只做只读核查和设计（手册「发行批」）。发行用的配置只改 26-9 收拢的那一份发行配置，不在代码里另写；要改 CI 工作流、动凭据或真实账号，先问我。

原需求（行为与验收以它们为准）：specs/archive/repository-anti-corruption/c-end-readiness.md；specs/upgrade-continuity/spec.md；docs/system/CONTRACT-CHANGES.md；docs/releases/POLICY.md；docs/releases/CHECKLIST.md

本批交付：
1. M1 发行与第二台 Mac 验收（本批文件 #rel-5-item-1）

界面：复用已确认交互；整改中新出现的界面差异先定样。

本批另有：
- 本批牵涉的待决：第 18 项（是否收窄 M1 的发行门槛）。没定之前只停依赖它的部分，不替我定。
- 真实的签名、公证、上传与发布按已有授权办；没有授权的停下问我。
```

[ASC]: ../../../assistant-service-connections/spec.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[P]: ../../../../docs/product-operations/产品优化建议.md
[UPG]: ../../../upgrade-continuity/spec.md
