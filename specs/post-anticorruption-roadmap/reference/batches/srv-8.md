# SRV-8 · M2

[执行目录](../../spec.md#execution-batches) · [服务端批总则](../server-batch.md#server-batch) · [上一批 SRV-7](srv-7.md) · [执行规则](../execution-rules.md)

<a id="srv-8"></a>

## 给人讲清楚

M2 的三项服务，各等各的条件：自动更新，并且能退回上一版；定时在线备份和恢复（和整份导出分开验证）；可选的崩溃上报，默认关闭，打开之前先给你看会发出哪些内容。需要你做的：开工时间由你定；更新和备份服务要用的账号要你办；看更新、备份和诊断上报的样子并定下。

## 交付与前置

- **阶段／类型**：服务端；产品线（发布）；底层与架构
- **需求来源**：[C 端就绪 M2][CEND]、[升级 U2／U6][UPG]、[BL-115、BL-812][BL]
- **前置／待决**：服务端批开工由用户定；三个子项只等待各自服务条件。
- **可并行项**：与 SRV-1～SRV-7 互不等待
- **UI 要求**：先定样：更新、备份与诊断上报

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="srv-8-item-1"></a>自动更新与回退 | U6 副本演练／回退接自动更新，留各发布版金样 | 25-3 的回到上一版、26-6 的副本演练、57；更新服务账号具备，留各发布版金样 |
| <a id="srv-8-item-2"></a>在线备份与恢复 | 定时在线备份与恢复，和 73 的整份导出分开验 | 备份服务账号具备；和 73 的整份导出分开验 |
| <a id="srv-8-item-3"></a>可选崩溃上报 | 可选崩溃上报，沿 26／27 确认的 BL-812 本机日志边界外送，联网默认关闭且先预览字段 | 26／27 的本机日志边界；日志与上报待决、服务账号已处理 |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进路线书第 SRV-8 批「M2」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/srv-8.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

服务端批：我没明确说开工之前，只做只读核查和设计（手册「服务端批」）。

原需求（行为与验收以它们为准）：specs/archive/repository-anti-corruption/c-end-readiness.md；specs/upgrade-continuity/spec.md；specs/BACKLOG.md

本批交付：
1. 自动更新与回退（本批文件 #srv-8-item-1）
2. 在线备份与恢复（本批文件 #srv-8-item-2）
3. 可选崩溃上报（本批文件 #srv-8-item-3）

界面：本批文件的界面要求是「先定样：更新、备份与诊断上报」。写「先定样」的部分，按手册第五节的「定样怎么走」先出样，我确认后再写产品代码（组件板有新增部件的，还要先在本批分支上补成组件板标本、D 轨合审过）；写「复用」的部分沿已定交互。
```

[BL]: ../../../BACKLOG.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[UPG]: ../../../upgrade-continuity/spec.md
