# SRV-7 · 团队记忆

[执行目录](../../spec.md#execution-batches) · [服务端批总则](../server-batch.md#server-batch) · [上一批 SRV-6](srv-6.md) · [下一批 SRV-8](srv-8.md) · [执行规则](../execution-rules.md)

<a id="srv-7"></a>

## 给人讲清楚

团队记忆：从你批准的来源收集，筛出有价值的，形成并合并，标明来源，可以纠正；发布前要确认并说明不能撤回，管理员能维护，助理能用，交接时能用。这一批要等记忆能力就绪、并且你解除之前的暂停才开工。需要你做的：决定是否解除记忆暂停；看形成、发布和管理的样子并定下。

## 交付与前置

- **阶段／类型**：服务端；产品线（团队）；横向能力
- **需求来源**：[团队记忆][TMEM]、[观测采集][OCL]、[Memory][MEM]、[主动助理][PAST]
- **前置／待决**：29、64、SRV-4、SRV-6；**所需 Memory 能力已具备且原暂停解除**
- **可并行项**：不依赖记忆的其他片可继续
- **UI 要求**：复用 SRV-4；形成／融合、发布与管理差异先定样

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="srv-7-item-1"></a>团队记忆采集、形成与融合 | 必要合同、获准来源采集、价值筛选、形成／融合、来源及纠正，不复制业务事实或另建个人记忆规则 | 共用本批前置 |
| <a id="srv-7-item-2"></a>团队记忆发布、管理与效果 | 发布前确认及不可撤回说明、管理员维护、助理消费、三类交接、主动协作与质量改善验证 | 共用本批前置 |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进路线书第 SRV-7 批「团队记忆」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/srv-7.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

服务端批：我没明确说开工之前，只做只读核查和设计（手册「服务端批」）。

原需求（行为与验收以它们为准）：specs/team-memory/spec.md；specs/observation-collection/spec.md；specs/prologue-memory-strategy/spec.md；specs/proactive-assistant/spec.md

本批交付：
1. 团队记忆采集、形成与融合（本批文件 #srv-7-item-1）
2. 团队记忆发布、管理与效果（本批文件 #srv-7-item-2）

界面：本批文件的界面要求是「复用 SRV-4；形成／融合、发布与管理差异先定样」。写「先定样」的部分，按手册第五节的「定样怎么走」先出样，我确认后再写产品代码（组件板有新增部件的，还要先在本批分支上补成组件板标本、D 轨合审过）；写「复用」的部分沿已定交互。
```

[MEM]: ../../../prologue-memory-strategy/spec.md
[OCL]: ../../../observation-collection/spec.md
[PAST]: ../../../proactive-assistant/spec.md
[TMEM]: ../../../team-memory/spec.md
