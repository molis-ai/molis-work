# SRV-2 · 个人同步核心

[执行目录](../../spec.md#execution-batches) · [服务端批总则](../server-batch.md#server-batch) · [上一批 SRV-1](srv-1.md) · [下一批 SRV-3](srv-3.md) · [执行规则](../execution-rules.md)

<a id="srv-2"></a>

## 给人讲清楚

做个人同步的核心：先做独立的同步服务、账号、传输和撤销；再做附件的真实内容、大文件分块、丢了回执能续传、冲突时两个版本都保留；然后接上待办、Pages、成果库等首批插件（Goals 同样按声明接入）。附件没传完不会显示「已全部同步」，成果库必须验证文件能完整地来回传。需要你做的：部署和账号要你办；账号和同步状态的差异会做样给你看。

## 交付与前置

- **阶段／类型**：服务端；产品线（同步）；底层与架构
- **需求来源**：[个人同步][SYNC]、[同步基础][SYNCF]、[插件复制][SYNCP]、[升级持续可用][UPG]
- **前置／待决**：SRV-1，接入方式已定；按传输→附件／冲突→owner 接入顺序；部署与账号你办
- **可并行项**：SRV-3 的关键协作切片走查
- **UI 要求**：复用 SRV-1；账号／同步状态差异先定样

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="srv-2-item-1"></a>同步服务、账号与传输核心 | 先交独立服务、账号、Worker、Outbox／回执与撤权 | 共用本批前置 |
| <a id="srv-2-item-2"></a>附件、大对象与冲突恢复 | 再交附件实际字节、大对象分片／一致提交、丢回执和重启续传、冲突版本保留 | 本批传输核心就绪 |
| <a id="srv-2-item-3"></a>首批插件同步与附件字节验收 | 随后接首批声明了同步集合的插件（待办、Pages、成果库；Goals 装着时按它自己的声明同样接入），项目指导与决定记录经各自平台主人的集合同步，落实配额／保留与跨版本接入。附件未就绪不得显示全部已同步，核心成果库验收必须有字节往返；没有 Goals 的项目同步、恢复完整（2026-11-13，[决定 42](../decisions.md#decision-42)） | 本批传输、附件与冲突能力完成；44-2、44-5、39-2（平台事实的同步集合与宿主同步代码按声明） |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进路线书第 SRV-2 批「个人同步核心」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/srv-2.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

服务端批：我没明确说开工之前，只做只读核查和设计（手册「服务端批」）。

原需求（行为与验收以它们为准）：https://github.com/molis-ai/molis-work/blob/personal/specs/personal-cloud-sync/spec.md；https://github.com/molis-ai/molis-work/blob/personal/specs/plugin-sync-foundation/spec.md；https://github.com/molis-ai/molis-work/blob/personal/specs/personal-plugin-replication/spec.md；specs/upgrade-continuity/spec.md

本批交付：
1. 同步服务、账号与传输核心（本批文件 #srv-2-item-1）
2. 附件、大对象与冲突恢复（本批文件 #srv-2-item-2）
3. 核心插件同步与附件字节验收（本批文件 #srv-2-item-3）

界面：本批文件的界面要求是「复用 SRV-1；账号／同步状态差异先定样」。写「先定样」的部分，按手册第五节的「定样怎么走」先出样，我确认后再写产品代码（组件板有新增部件的，还要等定样合入）；写「复用」的部分沿已定交互。

本批另有：
- 当前 main 的对应文档：[个人云同步总纲](../../../personal-cloud-sync/spec.md)、[同步基础](../../../personal-cloud-sync/foundation.md)、[插件复制](../../../personal-cloud-sync/plugin-replication.md)；下面的 `personal` 分支 URL 保留为历史来源。
```

[SYNC]: https://github.com/molis-ai/molis-work/blob/personal/specs/personal-cloud-sync/spec.md
[SYNCF]: https://github.com/molis-ai/molis-work/blob/personal/specs/plugin-sync-foundation/spec.md
[SYNCP]: https://github.com/molis-ai/molis-work/blob/personal/specs/personal-plugin-replication/spec.md
[UPG]: ../../../upgrade-continuity/spec.md
