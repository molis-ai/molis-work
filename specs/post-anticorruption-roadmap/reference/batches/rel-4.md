# REL-4 · 合同过渡 U5 与副本演练 U6

[执行目录](../../spec.md#release-batch) · [发行批总则](../release-batch.md#release-batch) · [上一批 REL-3](rel-3.md) · [下一批 REL-5](rel-5.md) · [执行规则](../execution-rules.md)

<a id="rel-4"></a>

## 给人讲清楚

有了外部用户以后，合同一改，他们存着的引用和插件就要能平稳过渡；升级到新版时，先在副本上升级、通过了才换上，失败就留在原版。开发阶段每次都在本机直接升级，用不上这两样，所以挪到这里。「回到上一版」已由第 25 批做完，本批接着用。需要你做的：看升级失败与恢复的样子（已定）。

## 交付与前置

- **阶段／类型**：发行；底层与架构
- **需求来源**：[升级 U5／U6][UPG]
- **前置／待决**：开工由用户定；U5 的合同过渡清单先定机制与登记；[26-7](26.md#batch-26-item-7) 的 `state_machines` 在 M1 前合入，进同一份合同形状（[状态机需求 §13](../../../state-machine-platform/spec.md)）；清单内容等 [39-2](39.md#batch-39-item-2)、[44-1](44.md#batch-44-item-1) 合入后的合同再定内容，M1 当天生效前再核一遍，不为 Goal 一等字段单独写过渡；U4 在 [26-5](26.md#batch-26-item-5)
- **可并行项**：REL-2、REL-3
- **UI 要求**：复用：升级失败与恢复已定样（[runtime-and-recovery](../../../../docs/design/runtime-and-recovery/README.md)，回退默认先另存一份）

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="rel-4-item-1"></a>合同过渡 U5 | 合同过渡与保存引用改写，M1 当天生效；从原 [26-5](26.md#batch-26-item-5) 拆出 | 26-5 的 U4；39-2、44-1 合入 |
| <a id="rel-4-item-2"></a>副本演练 U6 | 新版先在副本上升级、通过了才换上，并接更新器；用 25-3 的「回到上一版」。原 [26-6](26.md#batch-26-item-6) | 05、25（已合入） |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进发行批 REL-4「合同过渡 U5 与副本演练 U6」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/rel-4.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

发行批：我没明确说这一批开工之前，只做只读核查和设计（手册「发行批」）。发行用的配置只改 26-9 收拢的那一份发行配置，不在代码里另写；要改 CI 工作流、动凭据或真实账号，先问我。

原需求（行为与验收以它们为准）：specs/upgrade-continuity/spec.md；docs/system/CONTRACT-CHANGES.md

本批交付：
1. 合同过渡 U5（本批文件 #rel-4-item-1）
2. 副本演练 U6（本批文件 #rel-4-item-2）

界面：升级失败与恢复复用已定的样（docs/design/runtime-and-recovery/）。
```

[ASC]: ../../../assistant-service-connections/spec.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[P]: ../../../../docs/product-operations/产品优化建议.md
[UPG]: ../../../upgrade-continuity/spec.md
