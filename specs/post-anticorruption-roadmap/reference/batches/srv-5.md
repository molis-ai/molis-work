# SRV-5 · 个人同步完整交付

[执行目录](../../spec.md#execution-batches) · [服务端批总则](../server-batch.md#server-batch) · [上一批 SRV-4](srv-4.md) · [下一批 SRV-6](srv-6.md) · [执行规则](../execution-rules.md)

<a id="srv-5"></a>

## 给人讲清楚

个人同步的完整交付：所有插件和个人事项都能同步，逐个插件列清覆盖和缺口；能整项目复制和回收；用两台真实 Mac、不同版本的客户端验证事项顺序和工作接续；验证附件、大文件、损坏、断点恢复和冲突历史；在正式环境验证真实限额、负载、告警、备份和恢复演练，和本机模拟的结果分开记。需要你做的：准备真实设备和账号；同步异常和项目生命周期的差异会做样给你看。

## 交付与前置

- **阶段／类型**：服务端；产品线（同步）；底层与架构
- **需求来源**：[个人同步][SYNC]、[插件复制][SYNCP]、[主线第三片][MLN]、[升级持续可用][UPG]
- **前置／待决**：SRV-2；主线数据在 36／37／53 就绪，跨项目视图按 64 覆盖；真实设备／账号条件具备
- **可并行项**：SRV-8 的安装与恢复说明走读
- **UI 要求**：复用 SRV-1、SRV-2；同步异常与项目生命周期差异先定样

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="srv-5-item-1"></a>逐插件同步、完整历史与公开插件接入 | 其余插件及个人主线的声明，逐插件列出覆盖与缺口；逐 owner 验完整历史／附件、关联删除与冲突，按原覆盖表接 Work／Coding／Workflows／Schedule 等且接收不执行；用只装公开包的独立插件验证安装、停用、注销和重新发现，不用内置名单冒充扩展能力；逐插件覆盖表按各插件声明的集合列，不另设 Goals 一行的特殊说明 | 共用本批前置 |
| <a id="srv-5-item-2"></a>全插件同步、项目复制与回收 | 全插件自动／手动同步、整项目复制／回收、异常恢复、配额／保留／删除；整项目复制／回收覆盖平台持有的项目事实（项目指导、决定记录、要求—证据—认可、关联边）和各插件声明的集合；没有 Goals 的项目复制后完整可用（2026-11-13，[决定 42](../decisions.md#decision-42)） | 共用本批前置 |
| <a id="srv-5-item-3"></a>双 Mac、跨版本与工作接续验收 | 两台真实 Mac 验跨版本客户端、主线顺序及工作接续，完成正式服务交付 | 共用本批前置 |
| <a id="srv-5-item-4"></a>附件、大对象与故障恢复验收 | 验完整附件与大对象、损坏／丢回执／断点恢复、冲突双方历史及删除回收 | 共用本批前置 |
| <a id="srv-5-item-5"></a>正式服务限额、监测与备份恢复 | 正式环境验真实限额与负载、告警、配对数据备份、只读止损和恢复演练，和本机模拟证据分开 | 共用本批前置 |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进路线书第 SRV-5 批「个人同步完整交付」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/srv-5.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

服务端批：我没明确说开工之前，只做只读核查和设计（手册「服务端批」）。

原需求（行为与验收以它们为准）：https://github.com/molis-ai/molis-work/blob/personal/specs/personal-cloud-sync/spec.md；https://github.com/molis-ai/molis-work/blob/personal/specs/personal-plugin-replication/spec.md；specs/work-mainline/spec.md；specs/upgrade-continuity/spec.md

本批交付：
1. 逐插件同步、完整历史与公开插件接入（本批文件 #srv-5-item-1）
2. 全插件同步、项目复制与回收（本批文件 #srv-5-item-2）
3. 双 Mac、跨版本与工作接续验收（本批文件 #srv-5-item-3）
4. 附件、大对象与故障恢复验收（本批文件 #srv-5-item-4）
5. 正式服务限额、监测与备份恢复（本批文件 #srv-5-item-5）

界面：本批文件的界面要求是「复用 SRV-1、SRV-2；同步异常与项目生命周期差异先定样」。写「先定样」的部分，按手册第五节的「定样怎么走」先出样，我确认后再写产品代码（组件板有新增部件的，还要先在本批分支上补成组件板标本、D 轨合审过）；写「复用」的部分沿已定交互。

本批另有：
- 当前 main 的对应文档：[个人云同步总纲](../../../personal-cloud-sync/spec.md)、[同步基础](../../../personal-cloud-sync/foundation.md)、[插件复制](../../../personal-cloud-sync/plugin-replication.md)；下面的 `personal` 分支 URL 保留为历史来源。
```

[MLN]: ../../../work-mainline/spec.md
[SYNC]: https://github.com/molis-ai/molis-work/blob/personal/specs/personal-cloud-sync/spec.md
[SYNCP]: https://github.com/molis-ai/molis-work/blob/personal/specs/personal-plugin-replication/spec.md
[UPG]: ../../../upgrade-continuity/spec.md
